import express, { Express } from "express";
import * as path from "node:path";
import QRCode from "qrcode";
import { CaseStore, CaseStatus } from "../store/caseStore";
import { OfficerIdentity } from "../officer/officerIdentity";
import { addCaseFromPastedCode, InvalidPairingCodeError, myPairingPayloadJson } from "../officer/intake";
import { sendReply } from "../officer/sendReply";
import { sendCaseUpdate } from "../officer/caseSignals";
import { RelayClient } from "../relay/relayClient";
import { InvalidSettingsError, PressSettingsStore } from "../settings/pressSettings";
import type { OfficerEdition } from "../config";

/**
 * The officer's local dashboard — deliberately plain server-rendered JSON + a small vanilla-JS
 * static page (see web/public/) rather than a React/webpack build: no build step to break
 * during a live demo, and "kleines Dashboard" is the actual brief. Runs on the same laptop as
 * the officer's own identity/case data — never intended to be exposed beyond localhost/LAN (see
 * README.md's known gaps: this has no login of its own, `OFFICER_PASSWORD` only protects the
 * data at rest, not this HTTP server).
 */
/** What the dashboard's connection light shows. Filled by the poll loop in index.ts. */
export interface DashboardStatus {
  /** True when the relay is reached over Tor (the normal case), false for the direct LAN opt-out. */
  viaTor: boolean;
  /** When the last poll of the relay finished (ms), or null before the first one. */
  lastPollAt: number | null;
  /** Whether that last poll reached the relay. */
  lastPollOk: boolean;
}

export function createDashboardApp(
  identity: OfficerIdentity,
  store: CaseStore,
  relay: RelayClient,
  advertisedRelayConnectionString: string,
  relayReachableBaseUrl: string,
  getStatus: () => DashboardStatus = () => ({ viaTor: true, lastPollAt: null, lastPollOk: true }),
  edition: OfficerEdition = "compliance",
  press?: PressSettingsStore,
): Express {
  const app = express();
  app.use(express.json({ limit: "64kb" }));
  app.use(express.static(path.join(__dirname, "public")));

  app.get("/api/me", async (_req, res) => {
    const pairingJson = myPairingPayloadJson(identity, advertisedRelayConnectionString);
    const qrDataUrl = await QRCode.toDataURL(pairingJson, { margin: 1, width: 320 });
    // A second, large rendering for showing the code on a projector or big screen.
    const qrDataUrlLarge = await QRCode.toDataURL(pairingJson, { margin: 2, width: 1000, errorCorrectionLevel: "M" });
    res.json({ userId: identity.userId, pairingCode: pairingJson, qrDataUrl, qrDataUrlLarge, relayReachableBaseUrl });
  });

  app.get("/api/status", (_req, res) => {
    res.json({ ...getStatus(), now: Date.now() });
  });

  // Which version of the dashboard this is. The press version also reports its settings and the
  // pickup history, so the page can warn when the app was switched off.
  app.get("/api/edition", (_req, res) => {
    if (edition !== "press" || !press) return res.json({ edition: "compliance" });
    return res.json({
      edition: "press",
      settings: press.get(),
      startedAt: press.startedAt,
      offlineGapMs: press.offlineGapMs,
      lastOkPollAt: press.lastOkPollAt,
    });
  });

  app.post("/api/settings", (req, res) => {
    if (edition !== "press" || !press) return res.status(404).json({ error: "nu a fost găsit" });
    try {
      return res.json(press.update(req.body));
    } catch (err) {
      if (err instanceof InvalidSettingsError) return res.status(400).json({ error: err.message });
      throw err;
    }
  });

  // Deleting one case for good (Directive 2019/1937 Art. 17/18, GDPR Art. 17): the case row, every
  // message and the case keys go (CaseStore.deleteCase). Both editions.
  app.delete("/api/cases/:id", (req, res) => {
    if (!store.deleteCase(req.params.id)) return res.status(404).json({ error: "nu a fost găsit" });
    return res.json({ deleted: true });
  });

  // One case as a file (GDPR Art. 15/20 and the officer's own records): what the dashboard shows —
  // number, status, category, dates and the whole conversation — and none of the cryptographic keys.
  app.get("/api/cases/:id/export", (req, res) => {
    const row = store.getCase(req.params.id);
    if (!row) return res.status(404).json({ error: "nu a fost găsit" });
    const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
    const body = {
      exportedAt: new Date().toISOString(),
      caseNumber: row.caseNumber,
      status: row.status,
      category: row.category,
      openedAt: iso(row.openedAt),
      acknowledgementDueAt: iso(row.ackDueAt),
      acknowledgedAt: iso(row.acknowledgedAt),
      feedbackDueAt: iso(row.feedbackDueAt),
      closedAt: iso(row.closedAt),
      lastActivityAt: iso(row.lastActivityAt),
      messages: store.listMessages(row.id).map((m) => ({ at: iso(m.createdAt), from: m.direction === "in" ? "reporter" : "officer", text: m.text })),
    };
    const name = `case-${(row.caseNumber ?? row.id).replace(/[^A-Za-z0-9-]/g, "_")}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.setHeader("Cache-Control", "no-store");
    return res.type("application/json").send(JSON.stringify(body, null, 2));
  });

  app.get("/api/cases", (_req, res) => {
    res.json(store.listCases());
  });

  app.post("/api/cases", async (req, res) => {
    const pastedCode = req.body?.pastedCode;
    if (typeof pastedCode !== "string" || pastedCode.trim().length === 0) {
      return res.status(400).json({ error: "pastedCode este obligatoriu" });
    }
    try {
      const row = addCaseFromPastedCode(identity, store, pastedCode);
      // Owe the reporter a receipt with the case number, same as the automatic intake.
      await sendCaseUpdate(identity, store, relay, row.id).catch((err) => console.error("[api] receipt failed:", err));
      return res.status(201).json(store.getCase(row.id));
    } catch (err) {
      if (err instanceof InvalidPairingCodeError) return res.status(400).json({ error: err.message });
      console.error("[api] addCaseFromPastedCode failed:", err);
      return res.status(500).json({ error: "eroare internă" });
    }
  });

  app.get("/api/cases/:id", (req, res) => {
    const row = store.getCase(req.params.id);
    if (!row) return res.status(404).json({ error: "nu a fost găsit" });
    return res.json({ ...row, messages: store.listMessages(row.id) });
  });

  const VALID_STATUSES: CaseStatus[] = ["new", "acknowledged", "in_progress", "closed"];
  app.post("/api/cases/:id/status", async (req, res) => {
    const status = req.body?.status;
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: `starea trebuie să fie una dintre: ${VALID_STATUSES.join(", ")}` });
    const row = store.getCase(req.params.id);
    if (!row) return res.status(404).json({ error: "nu a fost găsit" });
    store.setStatus(req.params.id, status);
    // Every status change reaches the reporter's "My case" screen. "new" is internal only.
    let delivery: string = "not-sent";
    if (status !== "new") {
      delivery = await sendCaseUpdate(identity, store, relay, req.params.id).catch((err) => {
        console.error("[api] status update failed:", err);
        return "failed";
      });
    }
    return res.json({ ...store.getCase(req.params.id), delivery });
  });

  app.post("/api/cases/:id/category", (req, res) => {
    const category = req.body?.category;
    if (typeof category !== "string") return res.status(400).json({ error: "categoria trebuie să fie un text" });
    const row = store.getCase(req.params.id);
    if (!row) return res.status(404).json({ error: "nu a fost găsit" });
    store.setCategory(req.params.id, category);
    return res.json(store.getCase(req.params.id));
  });

  app.post("/api/cases/:id/reply", async (req, res) => {
    const text = req.body?.text;
    if (typeof text !== "string" || text.trim().length === 0) return res.status(400).json({ error: "textul este obligatoriu" });
    const row = store.getCase(req.params.id);
    if (!row) return res.status(404).json({ error: "nu a fost găsit" });
    try {
      const result = await sendReply(identity, store, relay, req.params.id, text.trim());
      return res.json({ sent: result === "sent", result, messages: store.listMessages(req.params.id) });
    } catch (err) {
      console.error("[api] sendReply failed:", err);
      return res.status(500).json({ error: "trimiterea a eșuat — releul este accesibil? verifică fereastra serverului." });
    }
  });

  return app;
}
