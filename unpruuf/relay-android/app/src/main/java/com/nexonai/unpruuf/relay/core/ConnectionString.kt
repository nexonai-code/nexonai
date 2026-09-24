package com.nexonai.unpruuf.relay.core

/**
 * Builds the connection string a messenger app pairs to this relay with. Wire-identical to
 * unpruuf/server/src/connectionString.ts's buildConnectionString and to the format
 * RelayManager.parseConnectionString (in the main unpruuf app) already expects:
 * `unpruuf-relay:v1:<onion-with-.onion-suffix>:<authToken>`.
 *
 * [onion] must include the ".onion" suffix — RelayManager.isUsable() in the main app checks
 * `getRelayOnion().endsWith(".onion")`, so a bare service ID here would silently make this
 * relay unusable to any app that pairs with it.
 */
fun buildConnectionString(onion: String, authToken: String): String =
    "unpruuf-relay:v1:$onion:$authToken"
