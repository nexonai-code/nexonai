import { randomBytes, randomUUID } from "node:crypto";
import { x25519GenerateKeyPair } from "../crypto/primitives";
import { CaseStore, RechercheRow } from "../store/caseStore";
import { OfficerIdentity } from "./officerIdentity";
import { myPairingPayloadJson } from "./intake";

/**
 * unpruuf Press: a contact code per research (an article, a topic).
 *
 * Every research gets its own officer identity (its own keys). That is the whole mechanism, and
 * the reason the reporter apps need no change: a code is the same kind of QR as the general one,
 * just generated from a different identity. Consequences:
 *  - a source who scans the code of one research writes into that research's letterbox only;
 *  - the codes and letterboxes of two researches share nothing, so they cannot be tied together
 *    from the codes alone;
 *  - a tip arrives already filed under its research, because the letterbox it was sealed for
 *    belongs to exactly one identity.
 * Limit (said openly): one reporter app has one app identity, so the same source who writes to
 * two researches from the same app is recognisable as the same app inside this newsroom.
 *
 * The general code (the identity the officer app was started with) keeps working unchanged.
 */

export class InvalidRechercheError extends Error {}

const NAME_MAX = 80;
const COUNT_MAX = 200;

export function generateRechercheIdentity(): OfficerIdentity {
  const kp = x25519GenerateKeyPair();
  return { userId: randomUUID(), messageKey: new Uint8Array(randomBytes(32)), x25519PrivateKey: kp.privateKey, x25519PublicKey: kp.publicKey };
}

export function cleanRechercheName(raw: unknown): string {
  if (typeof raw !== "string") throw new InvalidRechercheError("name");
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length === 0) throw new InvalidRechercheError("name");
  if (name.length > NAME_MAX) throw new InvalidRechercheError("name_long");
  return name;
}

export interface IntakeOwner {
  /** Null = the general code. */
  rechercheId: string | null;
  identity: OfficerIdentity;
}

export class RechercheService {
  constructor(private store: CaseStore, private general: OfficerIdentity) {}

  /** The identity that owns a research (null = the general code). */
  identityFor(rechercheId: string | null): OfficerIdentity {
    if (!rechercheId) return this.general;
    const id = this.store.getRechercheIdentity(rechercheId);
    if (!id) throw new Error(`unknown research: ${rechercheId}`);
    return id;
  }

  identityForCase(caseId: string): OfficerIdentity {
    const row = this.store.getCase(caseId);
    if (!row) throw new Error(`no such case: ${caseId}`);
    return this.identityFor(row.rechercheId);
  }

  list(): RechercheRow[] {
    return this.store.listRecherchen();
  }

  create(rawName: unknown): RechercheRow {
    const name = cleanRechercheName(rawName);
    if (this.store.listRecherchen().length >= COUNT_MAX) throw new InvalidRechercheError("count");
    return this.store.createRecherche(name, generateRechercheIdentity());
  }

  update(id: string, patch: { name?: unknown; active?: unknown }): RechercheRow | null {
    const next: { name?: string; active?: boolean } = {};
    if (patch.name !== undefined) next.name = cleanRechercheName(patch.name);
    if (patch.active !== undefined) {
      if (typeof patch.active !== "boolean") throw new InvalidRechercheError("active");
      next.active = patch.active;
    }
    return this.store.updateRecherche(id, next);
  }

  /** Every identity whose letterbox is polled for new tips: the general code and each active research. */
  intakeOwners(): IntakeOwner[] {
    const owners: IntakeOwner[] = [{ rechercheId: null, identity: this.general }];
    for (const r of this.store.listRecherchen()) {
      if (!r.active) continue;
      const identity = this.store.getRechercheIdentity(r.id);
      if (identity) owners.push({ rechercheId: r.id, identity });
    }
    return owners;
  }

  /** The QR text of one research (same format as the general code). */
  pairingCode(rechercheId: string, advertisedRelayConnectionString: string): string {
    return myPairingPayloadJson(this.identityFor(rechercheId), advertisedRelayConnectionString);
  }
}
