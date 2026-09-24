package com.nexonai.unpruuf.relay.core

import android.content.ContentValues
import android.content.Context
import android.database.DatabaseUtils
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Blind store-and-forward queue, addressed only by the sender's rotating wire tag — same model
 * as unpruuf/server/src/store/blobStore.ts, reimplemented with Android's built-in SQLite
 * (no Room/SQLCipher needed: unlike the main unpruuf app's contacts DB, everything stored here
 * is already Double-Ratchet-encrypted ciphertext the relay is architecturally blind to, so
 * at-rest encryption of the queue itself adds no real confidentiality — matching the Node
 * version's own plain-SQLite choice).
 */
class BlobStore(context: Context) : SQLiteOpenHelper(context, "relay.db", null, 1) {

    // Backs /v1/fetchMany's optional long-poll (see RelayHttpServer) — a caller thread can block
    // on several tags at once instead of the server blindly re-polling every few seconds. Purely
    // a process-local "wake up sooner" optimization, same as the Node relay's EventEmitter
    // equivalent: a missed wakeup just means the immediate re-check fetchMany always does after
    // waiting (see waitForAny's caller) still finds the blob on the next regular poll.
    // NanoHTTPD handles each request on its own thread and blocks it synchronously, so a
    // CountDownLatch per waiting call is the natural fit here — no event loop to keep unblocked.
    private val waiters = ConcurrentHashMap<String, CopyOnWriteArrayList<CountDownLatch>>()

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE blobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tag TEXT NOT NULL,
                blob TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
            """.trimIndent()
        )
        db.execSQL("CREATE INDEX idx_blobs_tag ON blobs(tag)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // The queue is a cache, not a record — safe to drop and recreate on a future schema
        // bump rather than migrate, same reasoning as the relay having no read log at all.
        db.execSQL("DROP TABLE IF EXISTS blobs")
        onCreate(db)
    }

    /** Returns false (and stores nothing) if [tag]'s queue is already at capacity. */
    fun put(tag: String, blobBase64: String): Boolean {
        val db = writableDatabase
        val count = DatabaseUtils.longForQuery(db, "SELECT COUNT(*) FROM blobs WHERE tag = ?", arrayOf(tag))
        if (count >= RelayConstants.MAX_BLOBS_PER_TAG) return false
        val totalCount = DatabaseUtils.longForQuery(db, "SELECT COUNT(*) FROM blobs", null)
        if (totalCount >= RelayConstants.MAX_TOTAL_BLOBS) return false
        val values = ContentValues().apply {
            put("tag", tag)
            put("blob", blobBase64)
            put("created_at", System.currentTimeMillis())
        }
        val inserted = db.insert("blobs", null, values) != -1L
        if (inserted) {
            waiters[tag]?.forEach { it.countDown() }
        }
        return inserted
    }

    /**
     * Blocks the calling thread until [tags] has a new blob on any of them, or [timeoutMs]
     * elapses — whichever comes first. The caller must always re-check the actual queues after
     * this returns (see RelayHttpServer's fetchMany handler) rather than trust that something
     * arrived: several tags could have fired at once, and a timeout returns the same way a real
     * arrival does.
     */
    fun waitForAny(tags: List<String>, timeoutMs: Long) {
        if (tags.isEmpty() || timeoutMs <= 0) return
        val latch = CountDownLatch(1)
        for (tag in tags) {
            waiters.getOrPut(tag) { CopyOnWriteArrayList() }.add(latch)
        }
        try {
            latch.await(timeoutMs, TimeUnit.MILLISECONDS)
        } finally {
            for (tag in tags) {
                val list = waiters[tag] ?: continue
                list.remove(latch)
                if (list.isEmpty()) waiters.remove(tag, list)
            }
        }
    }

    /** One picked-up blob plus when it was originally stored — [createdAt] only exists so the
     *  caller can measure dwell time (how long it sat queued); nothing here is kept once this
     *  call returns, matching the class's no-read-log design. */
    data class StoredBlob(val blob: String, val createdAt: Long)

    /** Atomically returns and deletes every blob queued for [tag], oldest first — delete-on-
     *  fetch, no read log, no history. Mirrors blobStore.ts's takeAll transaction exactly. */
    fun takeAll(tag: String): List<StoredBlob> {
        val db = writableDatabase
        db.beginTransaction()
        try {
            val ids = ArrayList<Long>()
            val blobs = ArrayList<StoredBlob>()
            db.rawQuery(
                "SELECT id, blob, created_at FROM blobs WHERE tag = ? ORDER BY id ASC",
                arrayOf(tag)
            ).use { c ->
                while (c.moveToNext()) {
                    ids.add(c.getLong(0))
                    blobs.add(StoredBlob(c.getString(1), c.getLong(2)))
                }
            }
            for (id in ids) db.delete("blobs", "id = ?", arrayOf(id.toString()))
            db.setTransactionSuccessful()
            return blobs
        } finally {
            db.endTransaction()
        }
    }

    /** Deletes blobs older than [ttlMs]. Returns how many were removed. */
    fun sweepExpired(ttlMs: Long, now: Long = System.currentTimeMillis()): Int {
        val cutoff = now - ttlMs
        return writableDatabase.delete("blobs", "created_at < ?", arrayOf(cutoff.toString()))
    }

    /** Manual full reset — the user-triggered counterpart to the automatic TTL sweep. */
    fun wipeAll(): Int = writableDatabase.delete("blobs", null, null)

    fun count(): Long = DatabaseUtils.longForQuery(writableDatabase, "SELECT COUNT(*) FROM blobs", null)
}
