/**
 * Settings that give the server less protection than its default. Printed at every start, one line
 * each, so nobody runs a weakened server without having seen it. A pure function of the
 * environment so it can be tested and quoted in the audit brief (claim A10 / S10).
 */
export function loweredProtection(env: NodeJS.ProcessEnv): string[] {
  const notes: string[] = [];
  if (env.NODE_MESH_KEY_STORAGE === "disk") notes.push("NODE_MESH_KEY_STORAGE=disk: node keys and the owner secret are stored unsealed on disk; the server starts without being unlocked.");
  if (env.NODE_MESH_TOR === "0") notes.push("NODE_MESH_TOR=0: Tor is off; the server is reachable only as configured by the operator (tests).");
  if (env.ADMIN_BIND && env.ADMIN_BIND !== "127.0.0.1" && env.ADMIN_BIND !== "localhost") {
    notes.push(`ADMIN_BIND=${env.ADMIN_BIND}: the setup page listens beyond this computer (the Docker default); only the access token and the private-network check keep others out.`);
  }
  if (env.NODE_MESH_PRINT_OWNER_CODE === "1") notes.push("NODE_MESH_PRINT_OWNER_CODE=1: the owner code, the write key of every node, is printed into the log.");
  if (env.NODE_MESH_MAX_BLOBS) notes.push(`NODE_MESH_MAX_BLOBS=${env.NODE_MESH_MAX_BLOBS}: the total ceiling of waiting packets is changed from its default (200000).`);
  if (env.TOR_EXE_PATH) notes.push("TOR_EXE_PATH: a Tor program of the operator's choice is used; the pinned hash check of the download does not apply to it.");
  if (env.NODE_MESH_TOR_BIN_DIR) notes.push("NODE_MESH_TOR_BIN_DIR: Tor is taken from this folder instead of the pinned, hash-checked download.");
  if (env.NODE_MESH_PUBLIC_ADDRESS && !/^[a-z2-7]{56}\.onion$/.test(env.NODE_MESH_PUBLIC_ADDRESS.trim())) {
    notes.push("NODE_MESH_PUBLIC_ADDRESS is not a v3 onion address: owner codes made from it lead apps to a plain host name.");
  }
  if (env.NODE_MESH_REQUIRE_SIGNED !== "1") notes.push("NODE_MESH_REQUIRE_SIGNED is not 1: the server also starts when its program files do not match the signed release list (it reports it).");
  return notes;
}
