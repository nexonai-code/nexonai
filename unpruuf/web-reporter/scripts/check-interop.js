// Interop check web-reporter ↔ officer-app for the organisation-QR intake and the case signal.
// Needs officer-app built (cd ../officer-app && npm run build). Run: node scripts/check-interop.js
const { execSync } = require("child_process");
const os = require("os");
const path = require("path");
const out = path.join(os.tmpdir(), "unpruuf-web-intake.cjs");
execSync(`npx esbuild src/caseIntake.ts --bundle --platform=node --format=cjs --outfile=${out}`, { stdio: "ignore", cwd: path.join(__dirname, "..") });
const w = require(out);
const officer = path.join(__dirname, "..", "..", "officer-app", "dist");
const o = require(path.join(officer, "officer", "caseIntake"));
const s = require(path.join(officer, "officer", "caseSignals"));
const { x25519GenerateKeyPair } = require(path.join(officer, "crypto", "primitives"));
const kp = x25519GenerateKeyPair();
const mk = new Uint8Array(require("crypto").randomBytes(32));
const id = { userId: "x", messageKey: mk, x25519PrivateKey: kp.privateKey, x25519PublicKey: kp.publicKey };
const c = o.parseIntakePlaintext(o.openIntake(id, w.sealIntake(kp.publicKey, mk, '{"v":2}')));
if (!c || c.pairingJson !== '{"v":2}') throw new Error("officer-app could not open the browser intake");
if (w.intakeTag(mk, 470000) !== o.intakeTag(mk, 470000)) throw new Error("intake tag mismatch");
const info = w.parseCaseSignal(s.caseSignalText({ openedAt: 1, ackDueAt: 2, feedbackDueAt: 3 }, "HW-7Q4M-2X9D", "closed", 9));
if (!info || info.status !== "closed") throw new Error("case signal not understood");
console.log("OK: web-reporter ↔ officer-app intake and case signal compatible");
