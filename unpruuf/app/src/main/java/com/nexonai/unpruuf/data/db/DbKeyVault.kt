package com.nexonai.unpruuf.data.db

import com.nexonai.unpruuf.domain.security.SealedStrings
import java.security.SecureRandom
import java.util.Base64

/** The settings file that holds the database key (`db_key_store`). Writes must be synchronous: the order matters. */
interface DbKeyPrefs {
    fun get(key: String): String?
    /** Writes [put] and removes [remove] in one atomic step and waits until it is on disk. */
    fun commit(put: Map<String, String> = emptyMap(), remove: Set<String> = emptySet()): Boolean
}

/** The encrypted database file as seen by [DbKeyVault]. The SQLCipher side lives in [SqlCipherDbFiles]. */
interface DbFiles {
    fun exists(): Boolean
    /** Opens the file with [passphrase] and returns a read probe (row count per table), or null if it does not open. */
    fun fingerprint(passphrase: ByteArray): String?
    /** Moves everything into the main file (no WAL left) so a plain file copy is complete. Returns the read probe. */
    fun prepareForCopy(passphrase: ByteArray): String
    fun backup()
    fun hasBackup(): Boolean
    /** Puts the copy back over the main file and drops journal/WAL leftovers. The copy itself stays. */
    fun restoreBackup()
    fun deleteBackup()
    /** SQLCipher `PRAGMA rekey`: re-encrypts the file from [old] to [new]. */
    fun rekey(old: ByteArray, new: ByteArray)
}

sealed class DbKeyResult {
    /** Open the database with [passphrase]. [stillLegacy]: the key is still the old plain one (phone key not usable right now, retried next start). */
    class Ready(val passphrase: ByteArray, val stillLegacy: Boolean = false) : DbKeyResult()
    /** The key cannot be read on this phone (phone key gone). The file is left untouched; nothing new was created. */
    class Lost(val reason: String) : DbKeyResult()
}

/**
 * Keeps the SQLCipher key of the contacts database sealed under the phone-bound key
 * (`CryptoManager`, Android Keystore), in the same `k1:<base64>` form as [SealedStrings].
 *
 * Until 2026-10-25 the key lay in plain Base64 in `db_key_store` / `db_key`. On the first start of
 * a newer version the database is re-encrypted to a fresh key (`PRAGMA rekey`), because the old key
 * may survive in old file blocks. Order, so that no step can leave the contacts unreadable:
 *
 *  1. new key sealed and written as `db_key_next` (old plain key still in place)
 *  2. WAL folded into the main file, copy of the file made (`<db>.rekey-backup`)
 *  3. rekey, then reopen with the new key and compare the read probe with the one before
 *  4. sealed new key written to `db_key` (this replaces the plain value), `db_key_next` removed
 *  5. copy deleted
 *
 * Any failure in 2-3 puts the copy back and keeps the old key. A crash anywhere is repaired on the
 * next start: while the plain key is still in `db_key`, an existing copy is the truth and is put
 * back before the migration runs again. Once step 4 is on disk, only the leftover copy is removed.
 *
 * If the phone key cannot seal right now, the old plain key is used as before and the migration is
 * retried on the next start. If a sealed key cannot be opened, nothing is created and nothing is
 * deleted: the caller shows the existing "phone key gone" path (same as [com.nexonai.unpruuf.domain.security.PinResult.STORE_LOST]).
 *
 * Plain Kotlin on purpose (no Android types) so the whole sequence is covered by JVM unit tests.
 * Failures are caught as [Exception] only, never [Error].
 */
class DbKeyVault(
    private val prefs: DbKeyPrefs,
    private val files: DbFiles,
    private val seal: (ByteArray) -> ByteArray,
    private val open: (ByteArray) -> ByteArray,
    private val newPassphrase: () -> ByteArray = ::randomPassphrase
) {
    fun resolve(): DbKeyResult {
        val stored = prefs.get(KEY)
        if (stored != null && stored.startsWith(SealedStrings.PREFIX)) {
            val key = unseal(stored) ?: return DbKeyResult.Lost("sealed database key cannot be opened")
            // Leftovers of a migration whose step 4 already reached the disk.
            if (prefs.get(NEXT) != null) prefs.commit(remove = setOf(NEXT))
            if (files.hasBackup()) files.deleteBackup()
            return DbKeyResult.Ready(key)
        }
        if (stored == null) {
            if (files.exists()) return DbKeyResult.Lost("database file present without any key")
            val key = newPassphrase()
            val sealed = trySeal(key) ?: return DbKeyResult.Lost("phone key cannot seal")
            if (!prefs.commit(put = mapOf(KEY to sealed), remove = setOf(NEXT))) return DbKeyResult.Lost("key could not be written")
            return DbKeyResult.Ready(key)
        }

        val old = decodeLegacy(stored) ?: return DbKeyResult.Lost("plain database key is not readable")

        // An earlier run stopped half way: the copy taken in step 2 is the truth.
        if (files.hasBackup()) {
            // On any trouble the copy stays and the next start tries again.
            try {
                files.restoreBackup()
            } catch (e: Exception) {
                return DbKeyResult.Ready(old, stillLegacy = true)
            }
            if (files.fingerprint(old) == null) return DbKeyResult.Ready(old, stillLegacy = true)
            files.deleteBackup()
        }
        if (prefs.get(NEXT) != null) prefs.commit(remove = setOf(NEXT))

        if (!files.exists()) {
            // A key without a database: nothing to re-encrypt, just replace the key by a sealed one.
            val key = newPassphrase()
            val sealed = trySeal(key) ?: return DbKeyResult.Ready(old, stillLegacy = true)
            if (!prefs.commit(put = mapOf(KEY to sealed))) return DbKeyResult.Ready(old, stillLegacy = true)
            return DbKeyResult.Ready(key)
        }
        return migrate(old)
    }

    private fun migrate(old: ByteArray): DbKeyResult {
        val keepOld = DbKeyResult.Ready(old, stillLegacy = true)
        val new = newPassphrase()
        val sealedNew = trySeal(new) ?: return keepOld
        // The phone key must give the new key back before the database depends on it.
        if (unseal(sealedNew)?.contentEquals(new) != true) return keepOld
        if (!prefs.commit(put = mapOf(NEXT to sealedNew))) return keepOld

        val before: String
        try {
            before = files.prepareForCopy(old)
            files.backup()
        } catch (e: Exception) {
            // The main file was not touched yet; a partial copy is worthless.
            if (files.hasBackup()) files.deleteBackup()
            prefs.commit(remove = setOf(NEXT))
            return keepOld
        }

        val rekeyed = try {
            files.rekey(old, new)
            files.fingerprint(new) == before
        } catch (e: Exception) {
            false
        }
        if (!rekeyed) return rollBack(old, before, keepOld)

        if (!prefs.commit(put = mapOf(KEY to sealedNew), remove = setOf(NEXT))) return rollBack(old, before, keepOld)
        files.deleteBackup()
        return DbKeyResult.Ready(new)
    }

    private fun rollBack(old: ByteArray, before: String, keepOld: DbKeyResult): DbKeyResult {
        try {
            files.restoreBackup()
        } catch (e: Exception) {
            return keepOld // copy stays; the next start puts it back
        }
        if (files.fingerprint(old) == before) {
            files.deleteBackup()
            prefs.commit(remove = setOf(NEXT))
        }
        return keepOld
    }

    private fun trySeal(passphrase: ByteArray): String? = try {
        SealedStrings.PREFIX + Base64.getEncoder().encodeToString(seal(passphrase))
    } catch (e: Exception) {
        null
    }

    private fun unseal(stored: String): ByteArray? = try {
        open(Base64.getDecoder().decode(stored.removePrefix(SealedStrings.PREFIX)))
    } catch (e: Exception) {
        null
    }

    companion object {
        const val PREFS_NAME = "db_key_store"
        const val KEY = "db_key"
        const val NEXT = "db_key_next"

        /** Pre-2026-10-25 value: 32 random bytes, android.util.Base64.DEFAULT (with line break). */
        fun decodeLegacy(stored: String): ByteArray? = try {
            Base64.getMimeDecoder().decode(stored).takeIf { it.isNotEmpty() }
        } catch (e: Exception) {
            null
        }

        /**
         * 32 random bytes written as 64 lowercase hex characters. ASCII on purpose: SQLCipher's
         * `changePassword(String)` hands the UTF-8 bytes of the text to rekey, and `SupportFactory(bytes)`
         * hands the same bytes to key, so both sides see exactly the same passphrase.
         */
        fun randomPassphrase(): ByteArray {
            val raw = ByteArray(32).also { SecureRandom().nextBytes(it) }
            val hex = raw.joinToString("") { "%02x".format(it.toInt() and 0xff) }
            raw.fill(0)
            return hex.toByteArray(Charsets.US_ASCII)
        }
    }
}
