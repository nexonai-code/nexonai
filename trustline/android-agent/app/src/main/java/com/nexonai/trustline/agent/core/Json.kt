package com.nexonai.trustline.agent.core

/**
 * Minimal JSON model used for the wire protocol. Values are Map<String, Any?>, List<Any?>, String, Long, Double,
 * Boolean or null. [canon] produces the canonical form that is signed and hashed: sorted keys, no whitespace,
 * integers only. It is byte-for-byte identical to canon() in server/public/tlcrypto.js.
 */
typealias JObj = Map<String, Any?>

object Json {
    fun parse(text: String): Any? {
        val p = Parser(text)
        p.skipWs()
        val v = p.value()
        p.skipWs()
        if (p.pos != text.length) throw IllegalArgumentException("Trailing characters in JSON")
        return v
    }

    fun stringify(v: Any?): String = StringBuilder().also { write(it, v, false) }.toString()
    fun canon(v: Any?): String = StringBuilder().also { write(it, v, true) }.toString()

    @Suppress("UNCHECKED_CAST")
    private fun write(sb: StringBuilder, v: Any?, canonical: Boolean) {
        when (v) {
            null -> sb.append("null")
            is String -> quote(sb, v)
            is Boolean -> sb.append(if (v) "true" else "false")
            is Int -> sb.append(v.toString())
            is Long -> sb.append(v.toString())
            is Double -> {
                if (canonical) throw IllegalArgumentException("canon: only integers are allowed")
                sb.append(if (v == Math.floor(v) && !v.isInfinite() && Math.abs(v) < 1e15) v.toLong().toString() else v.toString())
            }
            is Map<*, *> -> {
                val entries = (v as Map<String, Any?>).entries.filter { it.value !is Undefined }
                val list = if (canonical) entries.sortedBy { it.key } else entries
                sb.append('{')
                var first = true
                for (e in list) {
                    if (!first) sb.append(',')
                    first = false
                    quote(sb, e.key)
                    sb.append(':')
                    write(sb, e.value, canonical)
                }
                sb.append('}')
            }
            is List<*> -> {
                sb.append('[')
                v.forEachIndexed { i, x ->
                    if (i > 0) sb.append(',')
                    write(sb, x, canonical)
                }
                sb.append(']')
            }
            else -> throw IllegalArgumentException("Unsupported JSON type: ${v::class.java.name}")
        }
    }

    object Undefined

    /** Matches JSON.stringify string escaping. */
    private fun quote(sb: StringBuilder, s: String) {
        sb.append('"')
        for (c in s) {
            when {
                c == '"' -> sb.append("\\\"")
                c == '\\' -> sb.append("\\\\")
                c == '\b' -> sb.append("\\b")
                c == '\u000C' -> sb.append("\\f")
                c == '\n' -> sb.append("\\n")
                c == '\r' -> sb.append("\\r")
                c == '\t' -> sb.append("\\t")
                c < ' ' -> sb.append("\\u").append(String.format("%04x", c.code))
                else -> sb.append(c)
            }
        }
        sb.append('"')
    }

    private class Parser(val s: String) {
        var pos = 0
        fun skipWs() { while (pos < s.length && (s[pos] == ' ' || s[pos] == '\n' || s[pos] == '\r' || s[pos] == '\t')) pos++ }
        fun value(): Any? {
            skipWs()
            if (pos >= s.length) throw IllegalArgumentException("Unexpected end of JSON")
            return when (val c = s[pos]) {
                '{' -> obj()
                '[' -> arr()
                '"' -> str()
                't' -> lit("true", true)
                'f' -> lit("false", false)
                'n' -> lit("null", null)
                else -> if (c == '-' || c.isDigit()) num() else throw IllegalArgumentException("Unexpected '$c' at $pos")
            }
        }
        fun lit(word: String, v: Any?): Any? {
            if (!s.startsWith(word, pos)) throw IllegalArgumentException("Bad literal at $pos")
            pos += word.length
            return v
        }
        fun obj(): Map<String, Any?> {
            val m = LinkedHashMap<String, Any?>()
            pos++
            skipWs()
            if (s[pos] == '}') { pos++; return m }
            while (true) {
                skipWs()
                val k = str()
                skipWs()
                if (s[pos] != ':') throw IllegalArgumentException("Expected ':' at $pos")
                pos++
                m[k] = value()
                skipWs()
                when (s[pos]) {
                    ',' -> pos++
                    '}' -> { pos++; return m }
                    else -> throw IllegalArgumentException("Expected ',' or '}' at $pos")
                }
            }
        }
        fun arr(): List<Any?> {
            val l = ArrayList<Any?>()
            pos++
            skipWs()
            if (s[pos] == ']') { pos++; return l }
            while (true) {
                l.add(value())
                skipWs()
                when (s[pos]) {
                    ',' -> pos++
                    ']' -> { pos++; return l }
                    else -> throw IllegalArgumentException("Expected ',' or ']' at $pos")
                }
            }
        }
        fun str(): String {
            if (s[pos] != '"') throw IllegalArgumentException("Expected string at $pos")
            pos++
            val sb = StringBuilder()
            while (true) {
                if (pos >= s.length) throw IllegalArgumentException("Unterminated string")
                val c = s[pos++]
                when {
                    c == '"' -> return sb.toString()
                    c == '\\' -> {
                        when (val e = s[pos++]) {
                            '"' -> sb.append('"'); '\\' -> sb.append('\\'); '/' -> sb.append('/')
                            'b' -> sb.append('\b'); 'f' -> sb.append('\u000C'); 'n' -> sb.append('\n')
                            'r' -> sb.append('\r'); 't' -> sb.append('\t')
                            'u' -> { sb.append(s.substring(pos, pos + 4).toInt(16).toChar()); pos += 4 }
                            else -> throw IllegalArgumentException("Bad escape \\$e")
                        }
                    }
                    else -> sb.append(c)
                }
            }
        }
        fun num(): Any {
            val start = pos
            if (s[pos] == '-') pos++
            while (pos < s.length && s[pos].isDigit()) pos++
            var isDouble = false
            if (pos < s.length && s[pos] == '.') { isDouble = true; pos++; while (pos < s.length && s[pos].isDigit()) pos++ }
            if (pos < s.length && (s[pos] == 'e' || s[pos] == 'E')) {
                isDouble = true; pos++
                if (pos < s.length && (s[pos] == '+' || s[pos] == '-')) pos++
                while (pos < s.length && s[pos].isDigit()) pos++
            }
            val t = s.substring(start, pos)
            return if (isDouble) t.toDouble() else t.toLong()
        }
    }
}

// ---- small accessors so protocol code stays readable
@Suppress("UNCHECKED_CAST")
fun Any?.obj(): JObj = (this as? Map<String, Any?>) ?: emptyMap()
fun Any?.list(): List<Any?> = (this as? List<Any?>) ?: emptyList()
fun Any?.str(): String = (this as? String) ?: ""
fun Any?.bool(): Boolean = (this as? Boolean) ?: false
fun Any?.long(): Long = (this as? Long) ?: (this as? Double)?.toLong() ?: 0L
@Suppress("UNCHECKED_CAST")
operator fun Any?.get(key: String): Any? = (this as? Map<String, Any?>)?.get(key)
fun jo(vararg pairs: Pair<String, Any?>): MutableMap<String, Any?> = linkedMapOf(*pairs)
