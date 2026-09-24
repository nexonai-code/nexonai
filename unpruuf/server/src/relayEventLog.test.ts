import test from "node:test";
import assert from "node:assert/strict";
import { base64DecodedLength, formatDuration, formatEvent, tagSuffix } from "./relayEventLog";

test("tagSuffix keeps only the last 8 characters of a long tag", () => {
  assert.equal(tagSuffix("AAAABBBBCCCCDDDDEEEEFFFF12345678"), "12345678");
});

test("tagSuffix leaves a short tag alone rather than padding it", () => {
  assert.equal(tagSuffix("abc"), "abc");
  assert.equal(tagSuffix("12345678"), "12345678");
});

test("base64DecodedLength matches Buffer's decoded length, with and without padding", () => {
  for (const raw of ["", "a", "ab", "abc", "abcd", "hello world", "x".repeat(4096)]) {
    const b64 = Buffer.from(raw).toString("base64");
    assert.equal(
      base64DecodedLength(b64),
      Buffer.from(b64, "base64").length,
      `mismatch for input of length ${raw.length}`
    );
  }
});

test("formatDuration scales from milliseconds to hours", () => {
  assert.equal(formatDuration(0), "0ms");
  assert.equal(formatDuration(820), "820ms");
  assert.equal(formatDuration(12_000), "12s");
  assert.equal(formatDuration(303_000), "5m 3s");
  assert.equal(formatDuration(300_000), "5m");
  assert.equal(formatDuration(7_800_000), "2h 10m");
  assert.equal(formatDuration(7_200_000), "2h");
});

test("formatEvent renders a STORED line with the tag suffix and size", () => {
  const line = formatEvent({ at: Date.now(), kind: "STORED", tagSuffix: "12345678", bytes: 4096 });
  assert.match(line, /STORED/);
  assert.match(line, /…12345678/);
  assert.match(line, /4\.0 KB queued/);
});

test("formatEvent renders a FETCHED line with count, size and dwell time", () => {
  const line = formatEvent({
    at: Date.now(), kind: "FETCHED", tagSuffix: "12345678", bytes: 8192, count: 2, avgDwellMs: 12_000,
  });
  assert.match(line, /FETCHED/);
  assert.match(line, /2 messages picked up/);
  assert.match(line, /waited 12s/);
});

test("formatEvent uses the singular for a single fetched message", () => {
  const line = formatEvent({
    at: Date.now(), kind: "FETCHED", tagSuffix: "12345678", bytes: 4096, count: 1, avgDwellMs: 500,
  });
  assert.match(line, /1 message picked up/);
  assert.doesNotMatch(line, /messages/);
});

test("formatEvent renders a REJECTED line carrying the reason", () => {
  const line = formatEvent({
    at: Date.now(), kind: "REJECTED", tagSuffix: "badtag", bytes: 0, note: "tag queue full",
  });
  assert.match(line, /REJECTED/);
  assert.match(line, /rejected: tag queue full/);
});

test("formatEvent never contains a full tag — only the suffix it was given", () => {
  // Regression guard for the privacy rule this whole module is written around: the operator log
  // records metadata only, and a tag is deliberately truncated before it ever reaches formatting.
  const fullTag = "SUPERSECRETFULLWIRETAGVALUE12345678";
  const line = formatEvent({ at: Date.now(), kind: "STORED", tagSuffix: tagSuffix(fullTag), bytes: 4096 });
  assert.doesNotMatch(line, /SUPERSECRETFULLWIRETAG/);
  assert.match(line, /…12345678/);
});
