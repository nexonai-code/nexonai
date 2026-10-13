import type { LicenseInventory } from "./licenses";
import { daysLeft, EXPIRY_WARNING_DAYS } from "./licenses";
import type { LoadedBundle } from "./bundle";
import type { ServerStatus } from "./provision";
import type { VaultData } from "./vault";

export interface Warning {
  level: "error" | "warn" | "info";
  code: string;
  serverId?: string;
  params?: Record<string, string | number>;
}

/**
 * What the admin should look at, as codes the page translates. Pure function of what Control knows.
 */
export function computeWarnings(
  data: VaultData,
  statuses: Record<string, ServerStatus | undefined>,
  bundle: LoadedBundle | null,
  inventory: LicenseInventory,
  now: number,
): Warning[] {
  const w: Warning[] = [];
  const installed = data.servers.filter((s) => s.installedAt);

  // Spread: one server has no fallback; servers at one hosting company can all be seen by that company.
  if (installed.length === 1) w.push({ level: "info", code: "single-server" });
  if (installed.length >= 2) {
    const providers = new Set(installed.map((s) => s.provider.trim().toLowerCase()).filter(Boolean));
    const unknown = installed.some((s) => !s.provider.trim());
    if (providers.size < 2 && !unknown) w.push({ level: "warn", code: "same-provider", params: { provider: [...providers][0] ?? "" } });
    if (unknown) w.push({ level: "info", code: "provider-unknown" });
    const regions = new Set(installed.map((s) => s.region.trim().toLowerCase()).filter(Boolean));
    if (providers.size >= 2 && regions.size === 1) w.push({ level: "info", code: "same-region" });
  }

  const serialsSeen = new Map<string, string>();
  for (const s of data.servers) {
    if (!s.installedAt) { w.push({ level: "warn", code: "not-installed", serverId: s.id }); continue; }
    if (!s.licenseSerial) w.push({ level: "error", code: "no-license-assigned", serverId: s.id });
    if (!s.ownerCode) w.push({ level: "warn", code: "no-owner-code", serverId: s.id });
    if (bundle && s.bundleSha256 && s.bundleSha256 !== bundle.info.sha256) w.push({ level: "info", code: "update-available", serverId: s.id });
    const st = statuses[s.id];
    if (!st) continue;
    if (!st.reachable) { w.push({ level: "error", code: "unreachable", serverId: s.id, params: { error: st.error ?? "" } }); continue; }
    if (st.containerRunning === false) w.push({ level: "error", code: "container-stopped", serverId: s.id });
    if (st.locked) w.push({ level: "error", code: "locked", serverId: s.id });
    if (st.license) {
      if (st.license.status === "missing" || st.license.status === "invalid") w.push({ level: "error", code: "server-unlicensed", serverId: s.id });
      else if (st.license.status === "expired") w.push({ level: "error", code: "license-expired", serverId: s.id });
      else if (st.license.status === "expiring") w.push({ level: "warn", code: "license-expiring", serverId: s.id, params: { days: st.license.daysLeft ?? 0 } });
      if (st.license.serial) {
        const other = serialsSeen.get(st.license.serial);
        if (other) w.push({ level: "error", code: "duplicate-license", serverId: s.id, params: { serial: st.license.serial, other } });
        else serialsSeen.set(st.license.serial, s.name);
        const rec = inventory.bySerial("server", st.license.serial);
        if (!rec) w.push({ level: "warn", code: "license-not-in-inventory", serverId: s.id, params: { serial: st.license.serial } });
        else if (st.license.expiresAtMs && rec.expiresAtMs > st.license.expiresAtMs + 1000) w.push({ level: "warn", code: "renewal-not-applied", serverId: s.id, params: { serial: rec.serial } });
      }
    }
    if (st.integrity && (st.integrity.state === "modified" || st.integrity.state === "bad-signature")) w.push({ level: "error", code: "integrity", serverId: s.id });
    if (st.integrity && st.integrity.state === "unsigned") w.push({ level: "info", code: "unsigned", serverId: s.id });
    if (st.nodes && st.nodes.registered !== null && st.nodes.registered < st.nodes.listed) w.push({ level: "warn", code: "nodes-missing", serverId: s.id, params: { registered: st.nodes.registered, listed: st.nodes.listed } });
  }

  // Inventory.
  const srv = inventory.summary("server");
  if (srv.free === 0 && data.servers.some((s) => !s.licenseSerial)) w.push({ level: "warn", code: "no-free-server-license" });
  for (const l of inventory.list()) {
    if (l.assigned && now < l.expiresAtMs && l.expiresAtMs - now <= EXPIRY_WARNING_DAYS * 86_400_000 && l.kind === "app") w.push({ level: "info", code: "app-license-expiring", params: { serial: l.serial, days: daysLeft(l, now) } });
  }
  return w;
}
