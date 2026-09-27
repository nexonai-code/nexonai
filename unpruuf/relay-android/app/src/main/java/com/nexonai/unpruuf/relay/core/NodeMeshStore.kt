package com.nexonai.unpruuf.relay.core

/** What the Node-Mesh HTTP layer needs from storage — [BlobStore] in the app, an in-memory
 *  implementation in the JVM contract test. */
interface NodeMeshStore {
    fun putNodeMesh(tag: String, blobBase64: String, expiresAt: Long): Boolean
    fun readNodeMesh(tag: String, now: Long = System.currentTimeMillis()): List<BlobStore.StoredBlob>
    fun waitForAny(tags: List<String>, timeoutMs: Long)
}
