package com.nexonai.unpruuf.domain.group

import com.nexonai.unpruuf.data.model.GroupEntity
import com.nexonai.unpruuf.domain.network.MessagePayload
import org.junit.Assert.*
import org.junit.Test

class GroupCodeTest {
    @Test fun generatedCodeIsValidAndFormatted() {
        repeat(200) {
            val c = GroupCode.generate()
            assertTrue(c, GroupCode.isValid(c))
            assertEquals(c, GroupCode.canonical(c))
            assertTrue(c.matches(Regex("[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{2}")))
        }
    }

    @Test fun codesAreDistinct() {
        assertEquals(500, (1..500).map { GroupCode.generate() }.toSet().size)
    }

    @Test fun anySingleTypoIsCaught() {
        val c = GroupCode.generate()
        val flat = c.replace("-", "")
        var caught = 0
        var tried = 0
        for (i in flat.indices) for (ch in GroupCode.ALPHABET) {
            if (ch == flat[i]) continue
            tried++
            val typo = flat.substring(0, i) + ch + flat.substring(i + 1)
            if (!GroupCode.isValid(typo)) caught++
        }
        // The weighted checksum detects every single wrong character, in the body and in the check itself.
        assertEquals(tried, caught)
    }

    @Test fun swappedNeighbourCharactersAreCaught() {
        repeat(300) {
            val flat = GroupCode.generate().replace("-", "")
            // inside the body, and the two check characters with each other (a swap across the body/check
            // boundary can coincide with a valid code in 1 of 1024 cases, so it is not a guarantee)
            for (i in (0..10) + 12) {
                if (flat[i] == flat[i + 1]) continue
                val swapped = flat.substring(0, i) + flat[i + 1] + flat[i] + flat.substring(i + 2)
                assertFalse("$flat -> $swapped", GroupCode.isValid(swapped))
            }
        }
    }

    @Test fun lookalikesAndWrongLengthAreRejected() {
        assertFalse(GroupCode.isValid(""))
        assertFalse(GroupCode.isValid("ABCD-EFGH"))
        assertFalse(GroupCode.isValid("0000-0000-0000-00")) // 0/O/1/I are not in the alphabet
        assertNull(GroupCode.canonical("nonsense"))
    }

    @Test fun typingStyleDoesNotChangeTheGroup() {
        val c = GroupCode.generate()
        val sloppy = " " + c.lowercase().replace("-", " ") + " "
        assertTrue(GroupCode.isValid(sloppy))
        assertEquals(GroupCode.groupIdHex(c), GroupCode.groupIdHex(sloppy))
        assertEquals(c, GroupCode.canonical(sloppy))
    }

    @Test fun groupIdIs8BytesAndDifferentPerCode() {
        val a = GroupCode.generate(); val b = GroupCode.generate()
        assertEquals(MessagePayload.GROUP_ID_BYTES, GroupCode.groupId(a).size)
        assertEquals(16, GroupCode.groupIdHex(a).length)
        assertNotEquals(GroupCode.groupIdHex(a), GroupCode.groupIdHex(b))
        // one-way: the id never contains the code text
        assertFalse(GroupCode.groupIdHex(a).uppercase().contains(a.replace("-", "").take(4)))
    }

    @Test fun groupPayloadRoundTrips() {
        val id = GroupCode.groupId(GroupCode.generate())
        val raw = MessagePayload.encodeGroupText(id, 5, "Grüße aus Alba Iulia ✓")
        val back = MessagePayload.decode(raw) as MessagePayload.Content.Group
        assertArrayEquals(id, back.groupId)
        assertEquals(5, back.memberCount)
        assertEquals("Grüße aus Alba Iulia ✓", back.text)
    }

    @Test fun truncatedGroupPayloadIsRejectedNotCrashing() {
        val id = GroupCode.groupId(GroupCode.generate())
        val raw = MessagePayload.encodeGroupText(id, 3, "x")
        assertNull(MessagePayload.decode(raw.copyOf(5)))
        assertNull(MessagePayload.decode(byteArrayOf(3)))
        // empty text is legal on the wire
        val empty = MessagePayload.decode(MessagePayload.encodeGroupText(id, 3, "")) as MessagePayload.Content.Group
        assertEquals("", empty.text)
    }

    @Test fun plainTextAndAttachmentsAreUnchanged() {
        assertTrue(MessagePayload.decode(MessagePayload.encodeText("hi")) is MessagePayload.Content.Text)
        assertTrue(MessagePayload.decode(MessagePayload.encodeAttachment("a.txt", byteArrayOf(1, 2), false)) is MessagePayload.Content.Attachment)
    }

    private fun group(vararg members: String) = GroupEntity("0011223344556677", "Team", "X", members.joinToString(","))

    @Test fun inboxDecisions() {
        assertEquals(GroupInbox.Decision.UNKNOWN_GROUP, GroupInbox.decide(null, "anna"))
        assertEquals(GroupInbox.Decision.NOT_A_MEMBER, GroupInbox.decide(group("bob", "carl"), "anna"))
        assertEquals(GroupInbox.Decision.SHOW, GroupInbox.decide(group("bob", "anna"), "anna"))
    }

    @Test fun memberCountIncludesMe() {
        assertEquals(4, GroupInbox.ownMemberCount(group("a", "b", "c")))
        assertEquals("g:0011", GroupInbox.chatKey("0011"))
    }

    @Test fun entityMembersIgnoreBlanks() {
        assertEquals(listOf("a", "b"), GroupEntity("i", "n", "c", "a,,b,").members())
        assertTrue(GroupEntity("i", "n", "c", "").members().isEmpty())
    }
}
