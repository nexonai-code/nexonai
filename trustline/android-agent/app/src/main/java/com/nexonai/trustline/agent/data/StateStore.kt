package com.nexonai.trustline.agent.data

import android.content.Context
import com.nexonai.trustline.agent.core.Json
import com.nexonai.trustline.agent.core.obj
import java.io.File

/** Persists the whole app state as one encrypted JSON file in the app's private storage. */
class StateStore(context: Context) {
    private val file = File(context.filesDir, "state.enc")

    fun load(): MutableMap<String, Any?> {
        if (!file.exists()) return linkedMapOf()
        return try {
            val m = Json.parse(String(SecureBox.decrypt(file.readBytes()), Charsets.UTF_8)).obj()
            LinkedHashMap(m)
        } catch (e: Exception) { linkedMapOf() }
    }

    @Synchronized
    fun save(state: Map<String, Any?>) {
        val tmp = File(file.parentFile, "state.enc.tmp")
        tmp.writeBytes(SecureBox.encrypt(Json.stringify(state).toByteArray(Charsets.UTF_8)))
        if (!tmp.renameTo(file)) { file.delete(); tmp.renameTo(file) }
    }

    fun wipe() { file.delete(); SecureBox.delete() }
}
