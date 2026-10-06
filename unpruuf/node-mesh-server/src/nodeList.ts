/**
 * The node-list file: everything the owner's own unpruuf app needs to take over ALL nodes of one
 * server in one go (Settings → Node lists → Import). Plain text, one address per line, so it can
 * be read, checked and edited with any editor.
 *
 *   unpruuf-node-list:v1
 *   name: Acme GmbH · Server 1
 *   secret: <owner secret>          ← the write key for every node on this server
 *   control: <control onion>        ← sealed servers only (lets the app unlock after a restart)
 *   count: 250
 *   <empty line>
 *   <address 1>
 *   <address 2>
 *   …
 *
 * It contains the owner secret, so it is exactly as sensitive as the owner QR: move it to your own
 * phone over a cable or a trusted channel and delete it afterwards. Contacts never get this file.
 * The Android app parses the same format (NodeListFile.kt).
 */

export const NODE_LIST_HEADER = "unpruuf-node-list:v1";

const ADDRESS_RE = /^[A-Za-z0-9._:-]{3,120}$/;
const SECRET_RE = /^[A-Za-z0-9_-]{16,128}$/;

export interface NodeListFile {
  name: string;
  ownerSecret: string;
  control: string | null;
  addresses: string[];
}

function cleanName(name: string): string {
  return name.replace(/[\r\n\t]+/g, " ").trim().slice(0, 60);
}

export function buildNodeListFile(list: NodeListFile): string {
  const lines = [
    NODE_LIST_HEADER,
    `name: ${cleanName(list.name) || "Server"}`,
    `secret: ${list.ownerSecret}`,
  ];
  if (list.control) lines.push(`control: ${list.control}`);
  lines.push(`count: ${list.addresses.length}`, "", ...list.addresses);
  return lines.join("\n") + "\n";
}

/** The list inside a file, or null for anything that is not a well-formed node list. */
export function parseNodeListFile(text: string): NodeListFile | null {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  if ((lines[0] ?? "").trim() !== NODE_LIST_HEADER) return null;
  const header: Record<string, string> = {};
  let i = 1;
  for (; i < lines.length && lines[i].trim() !== ""; i++) {
    const m = /^([a-z]+):\s?(.*)$/.exec(lines[i]);
    if (!m) return null;
    header[m[1]] = m[2].trim();
  }
  const addresses: string[] = [];
  for (i++; i < lines.length; i++) {
    const a = lines[i].trim();
    if (!a) continue;
    if (!ADDRESS_RE.test(a)) return null;
    if (!addresses.includes(a)) addresses.push(a);
  }
  if (!SECRET_RE.test(header.secret ?? "")) return null;
  if (addresses.length === 0) return null;
  if (header.count !== undefined && Number(header.count) !== addresses.length) return null;
  const control = header.control ? header.control : null;
  if (control && !ADDRESS_RE.test(control)) return null;
  return { name: cleanName(header.name ?? "") || "Server", ownerSecret: header.secret, control, addresses };
}
