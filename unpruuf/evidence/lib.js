'use strict';
// Shared helper for the evidence scripts: collect checks, print them, exit non-zero on failure.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

class Run {
  constructor(id, title) {
    this.id = id;
    this.title = title;
    this.checks = [];
    this.notes = [];
    this.findings = [];
  }
  check(name, ok, detail) {
    this.checks.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  }
  /** A claim that the evidence does NOT support. Reported loudly, does not stop the run. */
  finding(id, text) {
    this.findings.push({ id, text });
    console.log(`  FINDING ${id}  ${text}`);
  }
  note(text) {
    this.notes.push(text);
    console.log(`  NOTE  ${text}`);
  }
  get failed() { return this.checks.filter((c) => !c.ok).length; }
  finish(outFile) {
    const result = { id: this.id, title: this.title, passed: this.checks.length - this.failed, failed: this.failed, checks: this.checks, notes: this.notes, findings: this.findings };
    console.log(`\n${this.id}: ${result.passed} passed, ${result.failed} failed, ${result.findings.length} finding(s)\n`);
    if (outFile) fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
    return result;
  }
}

/** Every file below [dir] whose name matches [re], skipping node_modules, dist and build output. */
function walk(dir, re, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'build', '.git', '.gradle'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, re, out);
    else if (re.test(e.name)) out.push(full);
  }
  return out;
}

/** Source text without comments, so that a word inside a comment does not count as code. */
function stripComments(src) {
  // Comments become empty but keep their line breaks, so reported line numbers stay true.
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1');
}

function requireBuilt(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    console.error(`Missing ${rel}. Build the node server first:  cd node-mesh-server && npm install && npm run build`);
    process.exit(2);
  }
  return require(p);
}

module.exports = { Run, walk, stripComments, requireBuilt, ROOT };
