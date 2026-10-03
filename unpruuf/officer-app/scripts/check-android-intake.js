// Interop check: opens an intake sealed by the Android app's OfficerCase.kt (written by
// app/src/test/.../OfficerCaseTest.kt) with the officer-app's own code. Run after the Android
// unit tests: node scripts/check-android-intake.js [vector.json]
const fs = require("fs");
const os = require("os");
const path = require("path");
const { openIntake, parseIntakePlaintext, intakeTag } = require("../dist/officer/caseIntake");
const file = process.argv[2] || path.join(os.tmpdir(), "unpruuf-intake-vector.json");
const v = JSON.parse(fs.readFileSync(file, "utf8"));
const b = (s) => new Uint8Array(Buffer.from(s, "base64"));
const identity = { userId: "x", messageKey: b(v.messageKey), x25519PrivateKey: b(v.officerPriv), x25519PublicKey: b(v.officerPub) };
const plain = openIntake(identity, b(v.sealed));
if (!plain) throw new Error("officer-app could NOT open the Android intake");
const content = parseIntakePlaintext(plain);
if (!content || content.wireIdentity !== "6f1c2c38-0c1e-4b5e-9a0f-0d6c8e2b1a77" || content.pairingJson !== '{"v":2,"u":"x"}') throw new Error("content mismatch");
if (intakeTag(identity.messageKey, v.hour) !== v.tag) throw new Error("intake tag mismatch");
console.log("OK: Android intake opened by the officer-app, tag identical");
