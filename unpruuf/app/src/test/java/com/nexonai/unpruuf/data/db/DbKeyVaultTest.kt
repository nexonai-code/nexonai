package com.nexonai.unpruuf.data.db

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64

/**
 * The migration sequence of [DbKeyVault] against a simulated encrypted file. SQLCipher and the
 * Android Keystore do not run in a JVM test; [SqlCipherDbFiles] (the real file side) is covered by
 * reading only and must be checked on a phone.
 */
class DbKeyVaultTest {

    /** Simulated process death: an Error, so the vault's `catch (e: Exception)` does not swallow it. */
    private class Crash : Error()

    private class Prefs : DbKeyPrefs {
        val map = mutableMapOf<String, String>()
        var crashOnCommitOf: String? = null
        var failCommitOf: String? = null
        override fun get(key: String) = map[key]
        override fun commit(put: Map<String, String>, remove: Set<String>): Boolean {
            if (crashOnCommitOf != null && crashOnCommitOf in put.keys) throw Crash()
            if (failCommitOf != null && failCommitOf in put.keys) return false
            remove.forEach { map.remove(it) }
            map.putAll(put)
            return true
        }
    }

    /** An "encrypted" file: readable only with the key it was written with. */
    private class Files : DbFiles {
        class Content(val key: String, val rows: String)
        var main: Content? = null
        var backup: Content? = null
        var hotJournal = false
        var rekeyFails = false
        var rekeyGarbles = false
        var crashAfterRekey = false
        var backupFails = false
        var openCount = 0

        override fun exists() = main != null
        override fun fingerprint(passphrase: ByteArray): String? {
            openCount++
            val m = main ?: return null
            if (hotJournal) return null
            return if (m.key == String(passphrase)) m.rows else null
        }
        override fun prepareForCopy(passphrase: ByteArray): String = fingerprint(passphrase) ?: throw IllegalStateException("cannot open")
        override fun backup() {
            if (backupFails) throw java.io.IOException("disk full")
            backup = main
        }
        override fun hasBackup() = backup != null
        override fun restoreBackup() { hotJournal = false; main = backup ?: throw IllegalStateException("no copy") }
        override fun deleteBackup() { backup = null }
        override fun rekey(old: ByteArray, new: ByteArray) {
            val m = main!!
            check(m.key == String(old))
            if (rekeyFails) { hotJournal = true; throw IllegalStateException("rekey failed") }
            main = Content(String(new), if (rekeyGarbles) "contacts=0" else m.rows)
            if (crashAfterRekey) throw Crash()
        }
    }

    // Not real encryption: enough that the stored text is visibly not the key.
    private fun xor(b: ByteArray) = ByteArray(b.size) { (b[it].toInt() xor 0x5A).toByte() }
    private val brokenPhoneKey: (ByteArray) -> ByteArray = { throw java.security.GeneralSecurityException("keystore gone") }

    private var counter = 0
    private fun nextKey(): ByteArray = "new-passphrase-${++counter}".toByteArray()

    private fun vault(prefs: Prefs, files: Files, seal: (ByteArray) -> ByteArray = ::xor, open: (ByteArray) -> ByteArray = ::xor) =
        DbKeyVault(prefs, files, seal, open, ::nextKey)

    private val oldKey = ByteArray(32) { (it * 7 + 3).toByte() }
    private val rows = "contacts=3;group_table=1;ratchet_state=3;room_master_table=1"

    /** State of an install from before 2026-10-25: plain key (android.util.Base64.DEFAULT adds a line break). */
    private fun legacyInstall(): Pair<Prefs, Files> {
        val prefs = Prefs().apply { map["db_key"] = Base64.getEncoder().encodeToString(oldKey) + "\n" }
        val files = Files().apply { main = Files.Content(String(oldKey), rows) }
        return prefs to files
    }

    private fun assertNoPlainKey(prefs: Prefs, vararg keys: ByteArray) {
        val stored = prefs.map.getValue("db_key")
        assertTrue("sealed form", stored.startsWith("k1:"))
        for (k in keys) {
            assertFalse(stored.contains(Base64.getEncoder().encodeToString(k)))
            assertFalse(stored.contains(String(k)))
        }
        assertEquals(setOf("db_key"), prefs.map.keys)
    }

    @Test fun freshInstallStoresOnlyASealedKey() {
        val prefs = Prefs(); val files = Files()
        val r = vault(prefs, files).resolve() as DbKeyResult.Ready
        assertNoPlainKey(prefs, r.passphrase)
        val again = vault(prefs, files).resolve() as DbKeyResult.Ready
        assertArrayEquals(r.passphrase, again.passphrase)
    }

    @Test fun plainKeyIsMigratedToASealedNewKeyAndTheDataStaysReadable() {
        val (prefs, files) = legacyInstall()
        val r = vault(prefs, files).resolve() as DbKeyResult.Ready
        assertFalse(r.stillLegacy)
        assertFalse(r.passphrase.contentEquals(oldKey))
        assertEquals(rows, files.fingerprint(r.passphrase))
        assertNull("old key no longer opens the file", files.fingerprint(oldKey))
        assertNoPlainKey(prefs, oldKey, r.passphrase)
        assertFalse(files.hasBackup())
        // Next start: no second migration, same key.
        val again = vault(prefs, files).resolve() as DbKeyResult.Ready
        assertArrayEquals(r.passphrase, again.passphrase)
    }

    @Test fun failedRekeyPutsTheCopyBackAndKeepsTheOldKey() {
        val (prefs, files) = legacyInstall()
        files.rekeyFails = true
        val r = vault(prefs, files).resolve() as DbKeyResult.Ready
        assertTrue(r.stillLegacy)
        assertArrayEquals(oldKey, r.passphrase)
        assertEquals(rows, files.fingerprint(oldKey))
        assertFalse(files.hasBackup())
        assertEquals(setOf("db_key"), prefs.map.keys)
        // Next start, rekey works: migrated.
        files.rekeyFails = false
        val later = vault(prefs, files).resolve() as DbKeyResult.Ready
        assertEquals(rows, files.fingerprint(later.passphrase))
        assertNoPlainKey(prefs, oldKey)
    }

    @Test fun rekeyThatReadsBackDifferentDataIsRolledBack() {
        val (prefs, files) = legacyInstall()
        files.rekeyGarbles = true
        val r = vault(prefs, files).resolve() as DbKeyResult.Ready
        assertArrayEquals(oldKey, r.passphrase)
        assertEquals(rows, files.fingerprint(oldKey))
        assertFalse(files.hasBackup())
    }

    @Test fun crashAfterRekeyIsRepairedFromTheCopyOnNextStart() {
        val (prefs, files) = legacyInstall()
        files.crashAfterRekey = true
        try { vault(prefs, files).resolve(); throw AssertionError("expected crash") } catch (_: Crash) {}
        assertTrue(files.hasBackup())
        assertTrue(prefs.map["db_key"]!!.startsWith(Base64.getEncoder().encodeToString(oldKey)))
        files.crashAfterRekey = false
        val r = vault(prefs, files).resolve() as DbKeyResult.Ready
        assertEquals(rows, files.fingerprint(r.passphrase))
        assertNoPlainKey(prefs, oldKey)
        assertFalse(files.hasBackup())
    }

    @Test fun crashWhileWritingTheNewKeyIsRepairedOnNextStart() {
        val (prefs, files) = legacyInstall()
        prefs.crashOnCommitOf = "db_key"
        try { vault(prefs, files).resolve(); throw AssertionError("expected crash") } catch (_: Crash) {}
        prefs.crashOnCommitOf = null
        val r = vault(prefs, files).resolve() as DbKeyResult.Ready
        assertEquals(rows, files.fingerprint(r.passphrase))
        assertNoPlainKey(prefs, oldKey)
    }

    @Test fun newKeyThatCannotBeWrittenRollsBack() {
        val (prefs, files) = legacyInstall()
        prefs.failCommitOf = "db_key"
        val r = vault(prefs, files).resolve() as DbKeyResult.Ready
        assertArrayEquals(oldKey, r.passphrase)
        assertEquals(rows, files.fingerprint(oldKey))
        assertFalse(files.hasBackup())
        assertEquals(setOf("db_key"), prefs.map.keys)
    }

    @Test fun crashAfterTheSealedKeyIsWrittenOnlyLeavesACopyThatIsRemoved() {
        val (prefs, files) = legacyInstall()
        val r = vault(prefs, files).resolve() as DbKeyResult.Ready
        files.backup = files.main // as if the process died right before deleting the copy
        val again = vault(prefs, files).resolve() as DbKeyResult.Ready
        assertArrayEquals(r.passphrase, again.passphrase)
        assertFalse(files.hasBackup())
    }

    @Test fun copyThatCannotBeMadeLeavesEverythingAsItWas() {
        val (prefs, files) = legacyInstall()
        files.backupFails = true
        val r = vault(prefs, files).resolve() as DbKeyResult.Ready
        assertArrayEquals(oldKey, r.passphrase)
        assertEquals(rows, files.fingerprint(oldKey))
        assertEquals(setOf("db_key"), prefs.map.keys)
    }

    @Test fun phoneKeyThatCannotSealKeepsTheOldWayAndTouchesNothing() {
        val (prefs, files) = legacyInstall()
        val before = prefs.map.toMap()
        val r = vault(prefs, files, seal = brokenPhoneKey).resolve() as DbKeyResult.Ready
        assertTrue(r.stillLegacy)
        assertArrayEquals(oldKey, r.passphrase)
        assertEquals(before, prefs.map)
        assertEquals(rows, files.fingerprint(oldKey))
        assertFalse(files.hasBackup())
    }

    @Test fun sealedKeyThatCannotBeOpenedIsLostAndNothingIsCreatedOrDeleted() {
        val prefs = Prefs(); val files = Files()
        val key = (vault(prefs, files).resolve() as DbKeyResult.Ready).passphrase
        files.main = Files.Content(String(key), rows)
        val prefsBefore = prefs.map.toMap()
        val r = vault(prefs, files, open = brokenPhoneKey).resolve()
        assertTrue(r is DbKeyResult.Lost)
        assertEquals(prefsBefore, prefs.map)
        assertEquals(rows, files.fingerprint(key))
    }

    @Test fun databaseWithoutAnyKeyIsNotReplacedByANewOne() {
        val prefs = Prefs(); val files = Files().apply { main = Files.Content("unknown", rows) }
        assertTrue(vault(prefs, files).resolve() is DbKeyResult.Lost)
        assertTrue(prefs.map.isEmpty())
        assertEquals(rows, files.fingerprint("unknown".toByteArray()))
    }

    @Test fun plainKeyWithoutDatabaseIsReplacedBySealedKey() {
        val prefs = Prefs().apply { map["db_key"] = Base64.getEncoder().encodeToString(oldKey) }
        val r = vault(prefs, Files()).resolve() as DbKeyResult.Ready
        assertFalse(r.passphrase.contentEquals(oldKey))
        assertNoPlainKey(prefs, oldKey, r.passphrase)
    }

    @Test fun randomPassphraseIsAsciiHexWith256Bits() {
        val a = DbKeyVault.randomPassphrase()
        val b = DbKeyVault.randomPassphrase()
        assertEquals(64, a.size)
        assertTrue(String(a, Charsets.US_ASCII).matches(Regex("[0-9a-f]{64}")))
        assertFalse(a.contentEquals(b))
    }

    @Test fun legacyKeyWithLineBreakDecodes() {
        val stored = Base64.getEncoder().encodeToString(oldKey) + "\n"
        assertArrayEquals(oldKey, DbKeyVault.decodeLegacy(stored))
        assertNull(DbKeyVault.decodeLegacy(""))
    }
}
