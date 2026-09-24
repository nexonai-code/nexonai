package com.nexonai.unpruuf.domain.network

import com.nexonai.unpruuf.data.model.Contact

/**
 * Reads a [Contact]'s relay pool fields as lists — see the doc comments on
 * `Contact.myRelayConnectionString`/`theirRelayConnectionString` for why those stay singular-
 * named, `String?`-typed columns holding a `;`-joined pool rather than being renamed to arrays.
 * Kept as free functions rather than `Contact` extension properties so `Contact` itself stays a
 * plain Room POJO, and every call site shares one place to change if the delimiter/cap logic
 * ever evolves.
 */
fun contactMyRelayList(contact: Contact): List<String> =
    RelayManager.parseConnectionStringList(contact.myRelayConnectionString ?: "")

fun contactTheirRelayList(contact: Contact): List<String> =
    RelayManager.parseConnectionStringList(contact.theirRelayConnectionString ?: "")
