package com.nexonai.unpruuf.relay.core

/**
 * Mirrors unpruuf/server/src/config.ts exactly — this app is a wire-compatible Android
 * implementation of that Node relay, not a new protocol. Every value here must match the
 * Node version's corresponding constant.
 */
object RelayConstants {
    /** A single relay-eligible outer packet — same cap P2PNetworkManager.PACKET_SIZE enforces
     *  on the Android messenger app's side (see NetworkObfuscation.PACKET_SIZE there). */
    const val MAX_BLOB_BYTES = 4096

    /** Per-tag queue cap — bounds one wire tag's disk usage independent of how many tags exist.
     *  1500 × 4096 bytes ≈ 6 MB worst case per tag; see config.ts's comment for the full
     *  chunked-file-transfer sizing rationale this number is derived from. */
    const val MAX_BLOBS_PER_TAG = 1500

    /** Global queue cap across ALL tags — MAX_BLOBS_PER_TAG alone bounds one tag but not how
     *  many distinct tags exist, so anyone holding the shared bearer token (any paired contact,
     *  or the token if it later leaks) could otherwise push unlimited distinct tags and grow
     *  the queue without bound. 50,000 × 4096 bytes ≈ 200 MB worst case total — generous for
     *  real use, bounded for a phone's storage. */
    const val MAX_TOTAL_BLOBS = 50_000

    /** Cap on the raw HTTP request body for POST /v1/relay, checked via Content-Length BEFORE
     *  the body is read into memory — a base64'd MAX_BLOB_BYTES blob plus JSON framing and tag
     *  never exceeds this, so anything larger is rejected without ever being buffered. */
    const val MAX_RELAY_REQUEST_BYTES = 8192L

    /** Default TTL offered on first run — matches config.ts's DEFAULT_TTL_HOURS. The user can
     *  change this any time from the app (that's the whole point of this app existing). */
    const val DEFAULT_TTL_HOURS = 6
    const val MIN_TTL_HOURS = 1
    const val MAX_TTL_HOURS = 24 * 30 // 30 days — generous ceiling, not a real constraint.

    const val SWEEP_INTERVAL_MS = 15 * 60 * 1000L

    /** Local loopback port the embedded HTTP server listens on — purely internal, the Tor
     *  hidden service is what's actually reachable from outside. Named after config.ts's
     *  default PORT (8787) for consistency, though the exact number is otherwise arbitrary. */
    const val LOCAL_HTTP_PORT = 8787

    /** Virtual port the relay's hidden service exposes — MUST stay 80. The main unpruuf app's
     *  RelayClient.kt hard-codes RELAY_PORT = 80 when dialing a relay's onion; a relay
     *  publishing any other port would be silently unreachable from that client. */
    const val ONION_VIRTUAL_PORT = 80

    /** Same tag-shape validation as server/src/routes/relay.ts's TAG_RE. */
    val TAG_REGEX = Regex("^[A-Za-z0-9+/=_-]{1,64}\$")

    /** Matches config.ts's MAX_FETCH_MANY_TAGS — POST /v1/fetchMany's per-request tag cap. */
    const val MAX_FETCH_MANY_TAGS = 64

    /** Matches config.ts's MAX_WAIT_MS — the long-poll `waitMs` ceiling for POST /v1/fetchMany,
     *  regardless of what a client asks for. */
    const val MAX_WAIT_MS = 55_000L

    /** Cap on the raw HTTP request body for POST /v1/fetchMany — MAX_FETCH_MANY_TAGS tag strings
     *  (each up to 64 chars) plus JSON framing, generous but bounded. */
    const val MAX_FETCH_MANY_REQUEST_BYTES = 8192L
}
