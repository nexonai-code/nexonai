#!/usr/bin/env node
'use strict';
// Runs every evidence script and writes REPORT.md and REPORT.json next to this file.
//   node 00-run-all.js            offline
//   node 00-run-all.js --online   also compares the Tor hashes with the Tor Project's signed list
//   node 00-run-all.js --tests    also runs the node server's own test suite (npm test)
const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT } = require('./lib');

const online = process.argv.includes('--online');
const withTests = process.argv.includes('--tests');
const scripts = fs.readdirSync(__dirname).filter((f) => /^0[1-9]-.*\.js$/.test(f)).sort();
const results = [];
for (const s of scripts) {
  const out = path.join(os.tmpdir(), `evidence-${s}.json`);
  console.log(`\n=== ${s} ===`);
  const args = [path.join(__dirname, s), out];
  if (online && s.startsWith('07')) args.splice(1, 0, '--online');
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (fs.existsSync(out)) results.push({ script: s, exit: r.status, ...JSON.parse(fs.readFileSync(out, 'utf8')) });
  else results.push({ script: s, exit: r.status, id: s.slice(0, 2), title: s, passed: 0, failed: 1, checks: [{ name: 'script did not finish', ok: false, detail: `exit ${r.status}` }], notes: [], findings: [] });
}
let suite = null;
if (withTests) {
  console.log('\n=== node-mesh-server npm test ===');
  const r = spawnSync('npm', ['test'], { cwd: path.join(ROOT, 'node-mesh-server'), encoding: 'utf8', shell: process.platform === 'win32' });
  const out = (r.stdout || '') + (r.stderr || '');
  const g = (k) => (out.match(new RegExp(`# ${k} (\\d+)`)) || [])[1];
  suite = { tests: +g('tests'), pass: +g('pass'), fail: +g('fail'), skipped: +g('skipped') };
  console.log(suite);
}
let commit = 'unknown', dirty = '';
try { commit = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(); dirty = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim() ? ' (with uncommitted changes)' : ''; } catch (_) {}
const passed = results.reduce((a, r) => a + r.passed, 0);
const failed = results.reduce((a, r) => a + r.failed, 0);
const findings = [...new Map(results.flatMap((r) => (r.findings || []).map((f) => ({ ...f, script: r.script }))).map((f) => [f.id, f])).values()];
const header = `# Evidence report\n\n- Run: ${new Date().toISOString()}\n- Source: git ${commit}${dirty}\n- Node.js ${process.version}, ${os.platform()} ${os.arch()}\n- Checks: ${passed} passed, ${failed} failed. Findings (claims the evidence does not support): ${findings.length}.\n${suite ? `- Node server test suite: ${suite.pass} passed, ${suite.fail} failed, ${suite.skipped} skipped, of ${suite.tests}.\n` : ''}- Online comparison of the Tor hashes: ${online ? 'yes' : 'no'}.\n\nThis report shows what these scripts could check on this source and this machine. It is not a security audit and not a certificate. Anything marked "needs an auditor" in CLAIMS_TO_EVIDENCE.md is not covered here.\n`;
let md = header;
if (findings.length) md += `\n## Findings\n\n${findings.map((f) => `- **${f.id}** (${f.script}): ${f.text}`).join('\n')}\n`;
for (const r of results) {
  md += `\n## ${r.id} ${r.title}\n\n${r.passed} passed, ${r.failed} failed\n\n${r.checks.map((c) => `- ${c.ok ? 'PASS' : '**FAIL**'} ${c.name}${c.detail ? ` (${c.detail})` : ''}`).join('\n')}\n`;
  if (r.notes.length) md += `\nNotes:\n${r.notes.map((n) => `- ${n}`).join('\n')}\n`;
}
fs.writeFileSync(path.join(__dirname, 'REPORT.md'), md);
fs.writeFileSync(path.join(__dirname, 'REPORT.json'), JSON.stringify({ run: new Date().toISOString(), commit: commit + dirty, passed, failed, findings, suite, results }, null, 2));
console.log(`\nTOTAL: ${passed} passed, ${failed} failed, ${findings.length} finding(s). Report: ${path.join(__dirname, 'REPORT.md')}`);
process.exit(failed ? 1 : 0);
