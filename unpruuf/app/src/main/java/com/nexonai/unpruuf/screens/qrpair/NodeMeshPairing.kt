package com.nexonai.unpruuf.screens.qrpair

import com.nexonai.unpruuf.domain.AppEdition
import com.nexonai.unpruuf.domain.network.GuestGrant
import com.nexonai.unpruuf.domain.network.NodeMeshManager

/**
 * The unpruuf Business / Node-Mesh pairing QR — see `NODE_MESH_SPEC.md`. Structurally its own
 * format, not a variant of [QrPairingPayload] (onion-based) or [CrossPlatformPairingPayload]
 * (relay-mandatory but still onion-shaped identity/rotation): there is no onion here at all, and
 * the routing tag carries no identity component — [nodeMeshRoutingSeedBase64] plays the role
 * [CrossPlatformPairingPayload]'s relay pool ("n") plays there, just address-only (no owner
 * secret — see [NodeMeshManager]'s doc comment for why that split exists) and combined with a
 * genuinely separate secret from the message key, per `NODE_MESH_SPEC.md` §2.
 *
 * Wire format (v2): `{"v":2,"p":"<myMessageKey b64>","k":"<x25519 ratchet pubkey b64>",
 * "s":"<nodeMeshRoutingSeed b64>","n":"<node1>[;<node2>...]","e":"<edition>"}`. `n` holds up to
 * [NodeMeshManager.NODE_POOL_MAX_SIZE] `;`-joined node addresses (the `unpruuf-node:v1:` prefix
 * stripped, same space-saving trick the relay pool field uses).
 *
 * No userId (v1 carried one as `u`): nothing in Node-Mesh routing or crypto ever read it. Its
 * absence also makes this format unambiguous against [jsonToCrossPlatformPayload], which
 * requires `u`. Every value in it is generated for one pairing only (see
 * IdentityManager.pendingNodeMeshPairing), so two contacts comparing their QR codes find nothing
 * in common.
 */
data class NodeMeshPairingPayload(
    val version: Int = 2,
    val messageKeyBase64: String,
    val x25519RatchetPublicKeyBase64: String,
    val nodeMeshRoutingSeedBase64: String,
    val nodeAddresses: List<String>,
    val appEdition: String = AppEdition.STANDARD,
    /** Guest grants (GUEST_LOCKERS_BUILD_SPEC.md §6), index-aligned with [nodeAddresses]; an
     *  empty string means "no grant for this node". Empty list for every normal pairing, so the
     *  format stays identical for existing users. Only an owner inviting a free Client app user
     *  fills it. Treat as a secret: show once, never log. */
    val guestGrants: List<String> = emptyList(),
    /** Guest invitations only (field `i`): a short random id the inviter made up for this one
     *  invitation. The guest's own code repeats it, so the inviter's app finds the right pending
     *  invitation when it scans that code. Not a user id: random per invitation, never reused,
     *  and useless without the inviter's stored values. Empty in every normal pairing. */
    val guestInviteId: String = ""
)

private val GUEST_INVITE_ID_RE = Regex("^[A-Za-z0-9_-]{8,24}$")
private const val NODE_ADDRESS_PREFIX = NodeMeshManager.NODE_ADDRESS_PREFIX

fun nodeMeshPayloadToJson(payload: NodeMeshPairingPayload): String {
    val n = escapeNodeMesh(payload.nodeAddresses.joinToString(";") { it.removePrefix(NODE_ADDRESS_PREFIX) })
    val g = if (payload.guestGrants.any { it.isNotEmpty() }) {
        ",\"g\":\"" + escapeNodeMesh(GuestGrant.encodeList(payload.guestGrants)) + "\""
    } else ""
    val i = if (payload.guestInviteId.isNotEmpty()) ",\"i\":\"" + escapeNodeMesh(payload.guestInviteId) + "\"" else ""
    return """{"v":${payload.version},"p":"${payload.messageKeyBase64}","k":"${payload.x25519RatchetPublicKeyBase64}","s":"${payload.nodeMeshRoutingSeedBase64}","n":"$n","e":"${payload.appEdition}"$g$i}"""
}

/** Returns null if [json] isn't a Node-Mesh payload at all (no "s" key — the routing seed is
 *  what distinguishes this format from the other two, neither of which has one) or has no usable
 *  node address. Callers should try [jsonToPayload]/[jsonToCrossPlatformPayload] first, same
 *  three-format dispatch-by-shape convention the scanner already uses for the other two. */
fun jsonToNodeMeshPayload(json: String): NodeMeshPairingPayload? {
    return try {
        val map = parseSimpleJson(json)
        val seed = map["s"] ?: return null
        val n = map["n"] ?: return null
        val addresses = unescapeNodeMesh(n).split(";")
            .map { it.trim() }
            .filter { com.nexonai.unpruuf.domain.network.NodeMeshClient.isNodeAddress(it) }
            .map { NODE_ADDRESS_PREFIX + it }
            .take(NodeMeshManager.NODE_POOL_MAX_SIZE)
        if (addresses.isEmpty()) return null
        NodeMeshPairingPayload(
            version = map["v"]?.toIntOrNull() ?: 1,
            messageKeyBase64 = map["p"] ?: return null,
            x25519RatchetPublicKeyBase64 = map["k"] ?: return null,
            nodeMeshRoutingSeedBase64 = seed,
            nodeAddresses = addresses,
            appEdition = map["e"] ?: AppEdition.STANDARD,
            guestGrants = map["g"]?.let { GuestGrant.decodeList(unescapeNodeMesh(it), addresses.size) } ?: emptyList(),
            guestInviteId = map["i"]?.let { unescapeNodeMesh(it) }?.takeIf { GUEST_INVITE_ID_RE.matches(it) } ?: ""
        )
    } catch (e: Exception) {
        null
    }
}

// A node address is a Tor .onion hostname or host:port — neither ever contains '"' or '\', but
// escaping on encode costs nothing, same defensive posture CrossPlatformPairing.kt's "n" field
// already takes.
private fun escapeNodeMesh(s: String): String = s.replace("\\", "\\\\").replace("\"", "\\\"")
private fun unescapeNodeMesh(s: String): String = s.replace("\\\"", "\"").replace("\\\\", "\\")
