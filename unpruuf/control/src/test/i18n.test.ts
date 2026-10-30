import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";

const PUB = path.join(__dirname, "..", "..", "public");
function dict(): { en: Record<string, string>; ro: Record<string, string> } {
  const ctx: any = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(PUB, "i18n.js"), "utf8"), ctx);
  return ctx.window.I18N;
}
const ph = (s: string) => (s.match(/\{[a-z]+\}/g) ?? []).sort().join(",");

test("English and Romanian have exactly the same keys and the same placeholders", () => {
  const d = dict();
  assert.deepEqual(Object.keys(d.en).sort(), Object.keys(d.ro).sort());
  for (const k of Object.keys(d.en)) assert.equal(ph(d.en[k]), ph(d.ro[k]), k);
  for (const k of Object.keys(d.ro)) assert.ok(d.ro[k].trim().length > 0, k);
});

test("every text key used in app.js exists (static keys and key families)", () => {
  const d = dict();
  const js = fs.readFileSync(path.join(PUB, "app.js"), "utf8");
  const missing: string[] = [];
  for (const m of js.matchAll(/\bt\('([A-Za-z0-9_.\-]+)'(?!\s*\+)/g)) if (!(m[1] in d.en)) missing.push(m[1]);
  assert.deepEqual(missing, []);
  const fam = (prefix: string, vals: string[]) => vals.forEach((v) => assert.ok(`${prefix}${v}` in d.en, `${prefix}${v}`));
  fam("tab.", ["servers", "licenses", "distribution", "settings"]);
  fam("product.", ["business", "safeline", "press"]);
  fam("profile.", ["standard", "high-security", "offline-tolerant"]);
  fam("profile.", ["standard.h", "high-security.h", "offline-tolerant.h"]);
  fam("lic.", ["valid", "expiring", "expired"]);
  fam("dist.step", ["1", "2", "3", "4"]);
  fam("set.limit", ["1", "2", "3", "4", "5", "6"]);
  fam("st.", ["ok", "warn", "locked", "down", "notinstalled", "unknown", "busy"]);
});

test("every warning code, preflight code and error code the code can produce has a text", () => {
  const d = dict();
  const src = (f: string) => fs.readFileSync(path.join(__dirname, "..", "..", "src", f), "utf8");
  const warn = [...src("warnings.ts").matchAll(/code: "([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(warn.length >= 20);
  for (const c of new Set(warn)) assert.ok(`w.${c}` in d.en, `w.${c}`);
  const pf = [...src("provision.ts").matchAll(/(?:blocking|warnings)\.push\("([a-z-]+)"\)/g)].map((m) => m[1]);
  assert.ok(pf.length >= 8);
  for (const c of new Set(pf)) assert.ok(`pf.${c}` in d.en, `pf.${c}`);
  // errors: need("…") messages and API error codes, by the part before ":"
  const errs = new Set<string>();
  for (const f of ["provision.ts", "app.ts", "ssh.ts", "vault.ts"]) {
    for (const m of src(f).matchAll(/need\([^;]*?,\s*"([a-z-]+)(?::|")/g)) errs.add(m[1]);
    for (const m of src(f).matchAll(/error: "([a-z-]+)"/g)) errs.add(m[1]);
    for (const m of src(f).matchAll(/new Error\("([a-z-]+)(?::[^"]*)?"\)/g)) errs.add(m[1]);
    for (const m of src(f).matchAll(/new SshError\("([a-z-]+)"/g)) errs.add(m[1]);
  }
  const skip = new Set(["invalid", "forbidden", "unknown-job", "vault-exists"]); // "invalid" has its own text; the others never reach the page
  const gaps = [...errs].filter((e) => !(`e.${e}` in d.en) && !(`e.license-${e}` in d.en));
  assert.deepEqual(gaps.filter((g) => !skip.has(g)), []);
});

test("the page loads no inline script or style (the page's content policy forbids both)", () => {
  const html = fs.readFileSync(path.join(PUB, "index.html"), "utf8");
  assert.ok(!/<script(?![^>]*\bsrc=)/.test(html));
  assert.ok(!/\sstyle=/.test(html));
  const js = fs.readFileSync(path.join(PUB, "app.js"), "utf8");
  assert.ok(!/\sstyle="/.test(js), "no inline style attributes in generated markup");
  assert.ok(!/\sonclick=/.test(js));
});
