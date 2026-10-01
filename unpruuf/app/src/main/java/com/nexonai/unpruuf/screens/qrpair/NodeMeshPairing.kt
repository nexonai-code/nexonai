package com.nexonai.unpruuf.screens.qrpair

import com.nexonai.unpruuf.domain.AppEdition
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
 * requires `u`. The remaining fields are still device-global, so two contacts comparing their
 * QR codes can still tell they paired with the same device.
 */
data class NodeMeshPairingPayload(
    val version: Int = 2,
    val messageKeyBase64: String,
    val x25519RatchetPublicKeyBase64: String,
    val nodeMeshRoutingSeedBase64: String,
    val nodeAddresses: List<String>,
    val appEdition: String = AppEdition.STANDARD
)

private const val NODE_ADDRESS_PREFIX = NodeMeshManager.NODE_ADDRESS_PREFIX

fun nodeMeshPayloadToJson(payload: NodeMeshPairingPayload): String {
    val n = escapeNodeMesh(payload.nodeAddresses.joinToString(";") { it.removePrefix(NODE_ADDRESS_PREFIX) })
    return """{"v":${payload.version},"p":"${payload.messageKeyBase64}","k":"${payload.x25519RatchetPublicKeyBase64}","s":"${payload.nodeMeshRoutingSeedBase64}","n":"$n","e":"${payload.appEdition}"}"""
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
            .filter { it.isNotEmpty() }
            .map { NODE_ADDRESS_PREFIX + it }
            .take(NodeMeshManager.NODE_POOL_MAX_SIZE)
        if (addresses.isEmpty()) return null
        NodeMeshPairingPayload(
            version = map["v"]?.toIntOrNull() ?: 1,
            messageKeyBase64 = map["p"] ?: return null,
            x25519RatchetPublicKeyBase64 = map["k"] ?: return null,
            nodeMeshRoutingSeedBase64 = seed,
            nodeAddresses = addresses,
            appEdition = map["e"] ?: AppEdition.STANDARD
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
