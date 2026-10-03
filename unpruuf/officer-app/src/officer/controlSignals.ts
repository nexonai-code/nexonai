/**
 * The subset of `P2PNetworkManager`'s control-signal wire constants the officer-app actually
 * needs to recognize on the relay-mandatory (cross-platform) path. Two other signal classes
 * exist on Android (onion/main-relay updates, Node-Mesh) but never fire for a
 * Whistleblower-edition contact — that edition never runs the onion-direct or Node-Mesh code
 * paths at all (see AppEdition.kt/RelayManager.isMandatory()) — so they're deliberately not
 * handled here; an unrecognized control-prefixed text is simply ignored (not shown as a report
 * line), which is safe and matches how a not-yet-understood signal degrades on every platform.
 */
export const REVOKE_SIGNAL_TEXT = "UNPRUUF_REVOKE_V1";
export const DELETE_CONTACT_SIGNAL_TEXT = "UNPRUUF_DELETE_CONTACT_V1";
export const NEW_IDENTITY_PREFIX = "UNPRUUF_NEWID_V1:";
export const WECHSEL_PREFIX = "UNPRUUF_WECHSEL_V1:";

/** Android cover traffic (P2PNetworkManager.DUMMY_SIGNAL), outer envelope only. */
export const DUMMY_SIGNAL_TEXT = "UNPRUUF_DUMMY_V1";
