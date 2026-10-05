package com.nexonai.trustline.agent

import android.content.Context
import android.speech.tts.TextToSpeech
import java.util.Locale

/** Voice prompts for agents who prefer listening to reading. Uses the phone's built-in text-to-speech. */
class Speaker(context: Context) {
    private var ready = false
    private val tts: TextToSpeech = TextToSpeech(context.applicationContext) { status ->
        ready = status == TextToSpeech.SUCCESS
    }

    fun say(text: String) {
        if (!ready) return
        tts.language = Locale.ENGLISH
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "tl")
    }

    fun shutdown() { runCatching { tts.stop(); tts.shutdown() } }
}
