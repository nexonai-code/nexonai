package com.nexonai.unpruuf.domain.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The company list feed, app side, against what the server side produced
 * (node-mesh-server/src/feed/feedCrypto.ts): the same address derivation, feed code and signed,
 * encrypted list. If any of these break, an app and a feed server stop finding each other.
 */
class FeedCryptoTest {
    private val addressSeed = ByteArray(32) { it.toByte() }
    private val code = "unpruuf-feed:v1:1|Acme GmbH|6|AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8|ZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXp7fH1-f4CBgoM|MrU-iC49qsGA16X2Ik1htkAbQ_kB2wnw5NhM5OSicYs"
    private val blob = "unpruuf-feed-list:v1\nseq: 5\nissued: 1790000000000\niv: gYgJLj2PX1bkOLNX\ndata: yC59TW+CIyP5B/flLT/+R3WTpbUrP/0CRV1A5swWyFgqJQnC5lFAAARcVdTCr/dN1DnH46u+pwfNHi3lJpnpnGhfcXGbDBlKVBqlZYbriPOw7x8oSrOaOe3kEY2wOIQbJZdLfMcDzFM6zCz/OlhnV5xrbfxcZNV2lTCP0oWQ3QwTRj3WwPOV7ofBgPZ0NupZMZCalWWaMqit0TTH9ZRQll8g97P3nMGH5cAObrGHmvTSyA3gQHOq6Q35he75E5x65lypasw37f+b7+JshzXXaFzFjzXQf5rmD1N2CkmDskEXdCq0Bx1NvHs12QAW3wX2no9VI6G+5WHLwly0YwgBYxGdWzduYhg4VxAR3631PQwXSkHr2xN4uCZPwBuybLzboyWAGniS0REj9+8ZnSxk7+niVARjTOkJo+Y82FBtycffaZS6XB+ZkhQXmNikbGp6OfO4X0duuL/kcSU6wNgmNsHyDlH9vgq0le9hwAA0V1/uFSODE1bhYCZdCuDNgRdVEDfGAPT3fcR0gQlwa0SbV9D9BQHMXcTKMGg5zVuEnTTxsvT3g5A+Yrn3XZKOn802g2gUv1NuCvwnqjCmcnKBKpz5eiH2lLHquiGQvp7pcPni905DWSe9vARelXOEhoBzFaiwAtbeHUXpQw==\nsig: 0JDnXZzIKBoY/sppWanymPuTrM20UrQLGfWW9rK155u+UKa92CT75ibcjpMMe77ilKkh0Cs5gmBRFm7rnAZ+Bw==\n"
    private val wrongSignerBlob = "unpruuf-feed-list:v1\nseq: 6\nissued: 1790000000000\niv: FdVIHXPvTOWgXIke\ndata: OABExyibl2paxxpJTQmOxXc3NwuJpoxcna8CP3UWbE+jZHkZdzhbKZEnzAEOZlRj8haVdTK9ah3LmQ5raKQMkq1uMA7QQ5ArrPIiQ90WzZbCgIHvY1zIx6DFqNAEKttpAv2eRLHxb+DEqVMYmHFFh2sArwwa40QKryMYobDwMxQqsteY488mtlAYiJJAvFybneVckUOa+0pTM4jLn4vGjHJfJYM4w5r7nhp2Hpdm6zqA1/okTAbJIFGCJQ3GTKHFBRLvOo5RCTdauRks4lr91kS2hBlKfBxgQdrbuLaZ7J2fEWUObWON+Bv3tGHbY6sHLPIfh0bBgzAcM3H9/rdAS2R57fyGidgwuhwq9X07ly8aYqTILG9S\nsig: 7fD+kdm+CVcnmJhGDFdjFToCByWFdWJ/wQLOYnf9i74JpybAFfmQuCEi1JIQP+hrahXD0Sd0VOBzeNTs7s55AQ==\n"

    private fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }
    private fun base32Decode(s: String): ByteArray {
        val a = "abcdefghijklmnopqrstuvwxyz234567"
        var bits = 0; var value = 0; val out = mutableListOf<Byte>()
        for (ch in s) { value = (value shl 5) or a.indexOf(ch); bits += 5; if (bits >= 8) { out += ((value ushr (bits - 8)) and 255).toByte(); bits -= 8 } }
        return out.toByteArray()
    }

    @Test
    fun sha3MatchesTheNistVectors() {
        assertEquals("a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a", hex(FeedCrypto.sha3_256(ByteArray(0))))
        assertEquals("3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532", hex(FeedCrypto.sha3_256("abc".toByteArray())))
        // longer than one block (rate 136 bytes)
        val long = FeedCrypto.sha3_256(ByteArray(300) { (it * 7).toByte() })
        assertEquals(32, long.size)
    }

    @Test
    fun onionAddressReproducesARealPublishedAddress() {
        val real = "duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion"
        val raw = base32Decode(real.removeSuffix(".onion"))
        assertEquals(real, FeedCrypto.onionAddress(raw.copyOfRange(0, 32)))
    }

    @Test
    fun addressesForAPeriodAreTheOnesTheServerPublishes() {
        assertEquals("hfiaszo4x6jyvu52kdpkmqmon5lz35cy4y2n545fzoaeuhchk3kcvfid.onion", FeedCrypto.addressForEpoch(addressSeed, 0))
        assertEquals("sq3dmrqovfunbvrw2asrvgsrubxhzrpeh7dzhj5wdptxm37w45sh2fqd.onion", FeedCrypto.addressForEpoch(addressSeed, 1))
        assertEquals("4k3wbhbac4wsd3a4tysovt326rccay44jeswop4lx2igemdtv5rgftid.onion", FeedCrypto.addressForEpoch(addressSeed, 487000))
    }

    @Test
    fun candidateEpochsFollowTheClockLikeTheServerSide() {
        val h = 3_600_000L
        val t0 = 1000L * 6 * h
        assertEquals(listOf(1000L), FeedCrypto.candidateEpochs(t0 + 2 * h, 6))
        assertEquals(listOf(1000L, 999L), FeedCrypto.candidateEpochs(t0 + 20 * 60_000, 6))
        assertEquals(listOf(1000L, 1001L), FeedCrypto.candidateEpochs(t0 + 6 * h - 20 * 60_000, 6))
    }

    @Test
    fun theFeedCodeParsesAndBadOnesDoNot() {
        val c = FeedCrypto.parseFeedCode(code)!!
        assertEquals("Acme GmbH", c.name)
        assertEquals(6, c.periodHours)
        assertEquals(addressSeed.toList(), c.addressSeed.toList())
        assertNull(FeedCrypto.parseFeedCode("nonsense"))
        assertNull(FeedCrypto.parseFeedCode(code.replace("|6|", "|99|")))
        assertNull(FeedCrypto.parseFeedCode(code.substringBeforeLast("|") + "|short"))
    }

    @Test
    fun aListFromTheServerVerifiesDecryptsAndSplitsIntoNodeLists() {
        val c = FeedCrypto.parseFeedCode(code)!!
        val opened = FeedCrypto.openList(blob, c.contentKey, c.signPublicKey)!!
        assertEquals(5L, opened.seq)
        val files = FeedCrypto.splitLists(opened.plaintext).map { NodeListFile.parse(it)!! }
        assertEquals(listOf("Wien", "Zuerich"), files.map { it.name })
        assertEquals(listOf(3, 2), files.map { it.addresses.size })
        assertEquals("Owner_secret_0123456789-AB", files[0].ownerSecret)
        assertEquals(3, files[0].addresses.size.let { _ -> 3 })
    }

    @Test
    fun aListThatIsNotGenuineIsRefused() {
        val c = FeedCrypto.parseFeedCode(code)!!
        assertNull("signed by someone else", FeedCrypto.openList(wrongSignerBlob, c.contentKey, c.signPublicKey))
        assertNull("seq changed by hand", FeedCrypto.openList(blob.replace("seq: 5", "seq: 9"), c.contentKey, c.signPublicKey))
        assertNull("data damaged", FeedCrypto.openList(blob.replace(Regex("data: (.)")) { m -> "data: " + (if (m.groupValues[1] == "A") "B" else "A") }, c.contentKey, c.signPublicKey))
        assertNull("wrong content key", FeedCrypto.openList(blob, ByteArray(32) { 1 }, c.signPublicKey))
        assertNull(FeedCrypto.openList("", c.contentKey, c.signPublicKey))
    }

    @Test
    fun feedSourceRoundTripsThroughItsStorageFormat() {
        val s = FeedSource.fromCode(code, "id-1")!!.copy(lastSeq = 5, lastUpdatedMs = 99, lastResult = "Updated\tto 5")
        val back = FeedSource.parse(FeedSource.serialize(listOf(s, s.copy(id = "id-2"))))
        assertEquals(2, back.size)
        assertEquals("Acme GmbH", back[0].name)
        assertEquals(5L, back[0].lastSeq)
        assertEquals("Updated to 5", back[0].lastResult)
        assertNotNull(back[0].toCode())
        assertNull(FeedSource.fromCode("junk", "x"))
    }

    // ─── what an update does to the lists ───
    private fun file(name: String, vararg addr: String) = NodeListFile.Parsed(name, "Secret_0123456789abcdef", null, addr.toList())

    @Test
    fun aNewFeedListBecomesANewManagedList() {
        var n = 0
        val plan = FeedApply.plan("src", listOf(file("Wien", "a", "b")), emptyList(), emptyList(), emptySet()) { "new${n++}" }
        assertEquals(1, plan.changes.size)
        assertTrue(plan.changes[0].isNew)
        assertEquals(2, plan.newNodes)
        assertEquals(0, plan.removedNodes)
    }

    @Test
    fun anUpdateKeepsTheListAddsNewNodesAndRemovesDroppedOnes() {
        val lists = listOf(NodeList("L1", "Wien", listOf("a", "b", "c")), NodeList("L9", "Meine", listOf("x")))
        val managed = listOf(FeedApply.Managed("L1", "src", "Wien"))
        val plan = FeedApply.plan("src", listOf(file("Wien", "b", "c", "d")), managed, lists, setOf("a", "b", "c", "x")) { "never" }
        val c = plan.changes.single()
        assertEquals("L1", c.listId)
        assertEquals(false, c.isNew)
        assertEquals(listOf("a"), c.removeAddresses)
        assertEquals(1, plan.newNodes)
        assertEquals(1, plan.removedNodes)
        assertTrue("the user's own list is never touched", plan.removeLists.isEmpty())
    }

    @Test
    fun aManagedListTheCompanyDroppedIsRemovedButOtherSourcesAreLeftAlone() {
        val lists = listOf(NodeList("L1", "Wien", listOf("a")), NodeList("L2", "Zuerich", listOf("z")), NodeList("L3", "Fremd", listOf("f")))
        val managed = listOf(FeedApply.Managed("L1", "src", "Wien"), FeedApply.Managed("L2", "src", "Zuerich"), FeedApply.Managed("L3", "other", "Fremd"))
        val plan = FeedApply.plan("src", listOf(file("Wien", "a")), managed, lists, setOf("a", "z", "f")) { "n" }
        assertEquals(listOf("L2"), plan.removeLists.map { it.id })
        assertEquals(1, plan.removedNodes)
    }
}
