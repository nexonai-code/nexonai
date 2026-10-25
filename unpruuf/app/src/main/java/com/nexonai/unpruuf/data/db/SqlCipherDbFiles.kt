package com.nexonai.unpruuf.data.db

import android.content.SharedPreferences
import androidx.sqlite.db.SupportSQLiteDatabase
import net.sqlcipher.DatabaseErrorHandler
import net.sqlcipher.database.SQLiteDatabase
import net.sqlcipher.database.SQLiteDatabaseHook
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import javax.inject.Inject
import javax.inject.Singleton

/** `db_key_store` on top of SharedPreferences, written with commit() so the steps of [DbKeyVault] stay in order. */
class SharedPrefsDbKeyPrefs(private val prefs: SharedPreferences) : DbKeyPrefs {
    override fun get(key: String): String? = prefs.getString(key, null)
    override fun commit(put: Map<String, String>, remove: Set<String>): Boolean {
        val edit = prefs.edit()
        remove.forEach { edit.remove(it) }
        put.forEach { (k, v) -> edit.putString(k, v) }
        return edit.commit()
    }
}

/**
 * The SQLCipher side of [DbKeyVault]. Every open here uses the same byte-array key path as Room's
 * `SupportFactory`, and an error handler that never deletes the file (SQLCipher's default one does
 * on "corruption").
 */
class SqlCipherDbFiles(private val dbFile: File) : DbFiles {
    private val backupFile = File(dbFile.path + ".rekey-backup")
    private val sidecars = listOf("-journal", "-wal", "-shm").map { File(dbFile.path + it) }

    override fun exists(): Boolean = dbFile.exists()

    override fun fingerprint(passphrase: ByteArray): String? = try {
        withDb(passphrase) { readProbe(it) }
    } catch (e: Exception) {
        null
    }

    override fun prepareForCopy(passphrase: ByteArray): String {
        val probe = withDb(passphrase) { db ->
            db.rawExecSQL("PRAGMA wal_checkpoint(TRUNCATE)")
            // Rollback journal while we work on the file: no WAL beside it, and rekey runs in this mode.
            // Room switches back to WAL on its next open.
            db.rawExecSQL("PRAGMA journal_mode = DELETE")
            readProbe(db)
        }
        val wal = File(dbFile.path + "-wal")
        check(!wal.exists() || wal.length() == 0L) { "WAL not folded into the database" }
        return probe
    }

    override fun backup() {
        val tmp = File(backupFile.path + ".tmp")
        copyDurably(dbFile, tmp)
        check(tmp.renameTo(backupFile)) { "backup rename failed" }
    }

    override fun hasBackup(): Boolean = backupFile.exists()

    override fun restoreBackup() {
        // A hot journal or WAL from an interrupted rekey must never be replayed onto the copy.
        sidecars.forEach { if (it.exists()) check(it.delete()) { "cannot remove ${it.name}" } }
        val tmp = File(dbFile.path + ".restore.tmp")
        copyDurably(backupFile, tmp)
        check(tmp.renameTo(dbFile)) { "restore rename failed" }
    }

    override fun deleteBackup() {
        backupFile.delete()
        File(backupFile.path + ".tmp").delete()
    }

    override fun rekey(old: ByteArray, new: ByteArray) {
        require(new.all { it in 0x21..0x7e }) { "new passphrase must be printable ASCII" }
        withDb(old) { it.changePassword(String(new, Charsets.US_ASCII)) }
    }

    private fun <T> withDb(passphrase: ByteArray, block: (SQLiteDatabase) -> T): T {
        val db = SQLiteDatabase.openDatabase(
            dbFile.path, passphrase.copyOf(), null, SQLiteDatabase.OPEN_READWRITE, SecureDeleteHook, NeverDelete
        )
        try {
            return block(db)
        } finally {
            db.close()
        }
    }

    /** Row count per table: reading every table through the key is the proof that the file opens and decrypts. */
    private fun readProbe(db: SQLiteDatabase): String {
        val tables = mutableListOf<String>()
        db.rawQuery("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name", emptyArray<String>()).use { c ->
            while (c.moveToNext()) tables += c.getString(0)
        }
        return tables.joinToString(";") { t ->
            db.rawQuery("SELECT count(*) FROM \"${t.replace("\"", "\"\"")}\"", emptyArray<String>()).use { c ->
                c.moveToFirst()
                "$t=${c.getLong(0)}"
            }
        }
    }

    private fun copyDurably(from: File, to: File) {
        FileInputStream(from).use { input ->
            FileOutputStream(to).use { out ->
                input.copyTo(out)
                out.fd.sync()
            }
        }
    }

    private object NeverDelete : DatabaseErrorHandler {
        override fun onCorruption(dbObj: SQLiteDatabase) {
            throw IllegalStateException("database reported as corrupt; left untouched")
        }
    }
}

/** Every open of the contacts database: deleted rows are overwritten, not just unlinked (M10). */
object SecureDeleteHook : SQLiteDatabaseHook {
    override fun preKey(database: SQLiteDatabase) {}
    override fun postKey(database: SQLiteDatabase) {
        database.rawExecSQL("PRAGMA secure_delete = ON")
    }
}

/**
 * Set by the database provider when the key cannot be read on this phone (see [DbKeyResult.Lost]).
 * The app then runs on an empty in-memory database, the file on disk stays untouched, and the
 * lock screen shows the same "phone key gone" message as an unreadable PIN.
 */
@Singleton
class DbKeyState @Inject constructor() {
    @Volatile var lost: Boolean = false
        private set

    fun markLost() { lost = true }
}

/**
 * After the panic wipe: fold the WAL (which still holds the old page images) into the file and
 * truncate it, rebuild the file without free pages, and truncate again. With `secure_delete` on,
 * the deleted rows are already zeroed in the pages; this removes the copies that WAL and free
 * pages would keep. It cannot reach blocks the flash controller has already remapped.
 */
object DatabaseScrub {
    fun afterWipe(db: SupportSQLiteDatabase) {
        db.query("PRAGMA wal_checkpoint(TRUNCATE)").use { it.moveToFirst() }
        db.execSQL("VACUUM")
        db.query("PRAGMA wal_checkpoint(TRUNCATE)").use { it.moveToFirst() }
    }
}
