package com.nexonai.trustline.agent

import com.nexonai.trustline.agent.core.Crypto
import com.nexonai.trustline.agent.core.Json
import com.nexonai.trustline.agent.core.Protocol
import com.nexonai.trustline.agent.core.SoftSigner
import com.nexonai.trustline.agent.core.get
import com.nexonai.trustline.agent.core.jo
import com.nexonai.trustline.agent.core.list
import com.nexonai.trustline.agent.core.obj
import com.nexonai.trustline.agent.core.str
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Cross-language tests: the fixtures come from the reference implementation (server/public/tlcrypto.js, WebCrypto).
 * The test also writes build/kotlin-out.json, which server/tools/verify-kotlin-output.js checks in the other direction.
 */
class InteropTest {
    private val fx = Json.parse(javaClass.getResource("/fixtures.json")!!.readText()).obj()

    @Test fun canonicalJsonMatchesReference() {
        for (c in fx["canon"].list()) {
            val parsed = Json.parse(c["json"].str())
            assertEquals(c["canon"].str(), Json.canon(parsed))
        }
    }

    @Test fun keyIdMatchesReference() {
        val s = fx["node"]["keyIdSample"]
        assertEquals(s["kid"].str(), Crypto.keyId(s["spki"].str()))
    }

    @Test fun verifiesSignaturesMadeByTheReference() {
        val n = fx["node"]
        assertTrue(Crypto.verifyObject(n["agentSignPub"].str(), n["instruction"], n["instructionSig"].str()))
        val tampered = Json.parse(Json.stringify(n["instruction"])).obj().toMutableMap()
        tampered["reference"] = "changed"
        assertFalse(Crypto.verifyObject(n["agentSignPub"].str(), tampered, n["instructionSig"].str()))
    }

    @Test fun verifiesCertificateChainOfIncomingItem() {
        val n = fx["node"]
        val item = jo("instruction" to n["instruction"], "sig" to n["instructionSig"], "package" to n["package"],
            "senderCert" to n["cert"], "senderCertSig" to n["certSig"], "senderOperator" to jo("signPub" to n["operatorSignPub"]))
        assertTrue(Protocol.verifyIncoming(item))
        val bad = item.toMutableMap().also { it["sig"] = n["certSig"] }
        assertFalse(Protocol.verifyIncoming(bad))
    }

    @Test fun decryptsPackageEncryptedByTheReference() {
        val n = fx["node"]
        val plain = Crypto.decryptPackage(n["package"], n["recipient"]["encKid"].str(), Crypto.b64d(n["recipient"]["encPriv"].str()))
        assertEquals("Salma", plain["beneficiary"]["name"].str())
        assertEquals("Omar Ünïcode", plain["originator"]["name"].str())
    }

    @Test fun payoutCodeHashMatchesReference() {
        val n = fx["node"]
        assertEquals(n["codeHash"].str(), Protocol.codeHash(n["instruction"]["id"].str(), n["formattedCode"].str()))
        assertEquals(n["codeHash"].str(), Protocol.codeHash(n["instruction"]["id"].str(), n["code"].str().lowercase()))
    }

    @Test fun derRawConversionRoundTrips() {
        val signer = SoftSigner(Crypto.genEcKeyPair())
        repeat(200) { i ->
            val data = "message $i".toByteArray()
            val raw = Crypto.b64d(signer.signRaw(data))
            assertEquals(64, raw.size)
            assertTrue(Crypto.verifyRaw(signer.spki, data, Crypto.b64e(raw)))
            assertEquals(raw.toList(), Crypto.derToRaw(Crypto.rawToDer(raw)).toList())
        }
    }

    @Test fun writesOutputForTheReferenceToVerify() {
        val signer = SoftSigner(Crypto.genEcKeyPair())
        val opKeys = Crypto.genEcKeyPair()
        val recvEncPub = fx["receiver"]["encPub"].str(); val recvKid = fx["receiver"]["encKid"].str()
        val opEnc = Crypto.genEcKeyPair(); val opEncPub = Crypto.b64e(opEnc.public.encoded)
        val recipient = Protocol.Recipient("AG-R", "Receiver", "Aden", "YE", "OP-R", "Receiver Op", recvEncPub, recvKid, recvEncPub, recvKid)
        val built = Protocol.buildInstruction(
            Protocol.NewInstruction(recipient, "123.45", "USD", "OTHR", "REF-ü", "SCR-9",
                jo("name" to "Ömer Sender", "address" to "Amman", "idType" to "passport", "idNumber" to "X1", "dob" to "1990-01-01", "customerRef" to "C1"),
                jo("name" to "Beneficiary Ünï", "payoutLocation" to "Aden")),
            signer, "AG-S", "JO", "OP-S", opEncPub, Crypto.keyId(opEncPub), System.currentTimeMillis())
        val (ev, evSig) = Protocol.buildEvent("PAID_OUT", built.id, "AG-S", System.currentTimeMillis(), signer, built.instruction["codeHash"].str())
        val canon = fx["canon"].list().map { jo("json" to it["json"].str(), "canon" to Json.canon(Json.parse(it["json"].str()))) }
        val out = jo("canon" to canon, "signPub" to signer.spki, "signKid" to signer.signKid, "instruction" to built.instruction, "sig" to built.sig, "package" to built.pkg,
            "code" to built.code, "event" to ev, "eventSig" to evSig, "expectBeneficiary" to "Beneficiary Ünï", "expectOriginator" to "Ömer Sender")
        val f = File("build/kotlin-out.json"); f.parentFile.mkdirs(); f.writeText(Json.stringify(out))
        assertTrue(Crypto.verifyObject(signer.spki, built.instruction, built.sig))
    }
}
