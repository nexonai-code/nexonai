#!/usr/bin/env node
'use strict';
// Known vulnerabilities in the libraries that ship with the server programs (npm audit, production
// packages only). Needs network access to the npm registry; without it the check is skipped and
// says so. Run it again before every release: a clean result today says nothing about next month.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Run, ROOT } = require('./lib');

const run = new Run('09', 'Known vulnerabilities in the libraries of the server programs (npm audit)');
for (const dir of ['node-mesh-server', 'server', 'officer-app', 'control', 'license-tool', 'relaypool-tool']) {
  const cwd = path.join(ROOT, dir);
  if (!fs.existsSync(path.join(cwd, 'package-lock.json'))) { run.note(`${dir}: no package-lock.json, not checked`); continue; }
  const r = spawnSync('npm', ['audit', '--omit=dev', '--json'], { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  let j; try { j = JSON.parse(r.stdout); } catch (_) { run.note(`${dir}: npm audit could not run (no network?)`); continue; }
  if (j.error) { run.note(`${dir}: npm audit could not run: ${j.error.summary || j.error.code}`); continue; }
  const v = (j.metadata && j.metadata.vulnerabilities) || {};
  const total = (v.critical || 0) + (v.high || 0) + (v.moderate || 0) + (v.low || 0);
  run.check(`${dir}: no known vulnerability in production libraries`, total === 0, `critical ${v.critical || 0}, high ${v.high || 0}, moderate ${v.moderate || 0}, low ${v.low || 0}`);
}
const res = run.finish(process.argv[2]);
process.exit(res.failed ? 1 : 0);
