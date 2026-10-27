package com.nexonai.unpruuf.domain.network

import com.nexonai.unpruuf.screens.qrpair.jsonToNodeMeshPayload
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Proves that the Android code reproduces ios/vectors/ios-vectors-2026-10-27.json, the values Norbert's iOS
 * code must match. Generated from that file (the JVM tests have no JSON library); regenerate both together.
 */
class NorbertVectorsTest {
    private val now = 1800000000000L

    @Test fun `onion address rule`() {
        assertTrue(NodeMeshClient.isNodeAddress("""p5ncnam7fxml4mfdbz4nfr6pkkys2af73yefvopoxvkke2dtli2ldfad.onion"""))
        assertTrue(NodeMeshClient.isNodeAddress("""ehjcr5vonk2mftfwkmmuynlbmdzjcjukxtawymfgfz5ewrk3ey5aqiad.onion"""))
        assertTrue(NodeMeshClient.isNodeAddress("""52ce2llezfboqynb6cspi737fjqc47z6s7oniawodtcwbcx3yv7dsfad.onion"""))
        assertFalse(NodeMeshClient.isNodeAddress("""evil.example.com"""))
        assertFalse(NodeMeshClient.isNodeAddress("""127.0.0.1"""))
        assertFalse(NodeMeshClient.isNodeAddress("""p5ncnam7fxml4mfdbz4nfr6pkkys2af73yefvopoxvkke2dtli2ldfad.onion:80"""))
        assertFalse(NodeMeshClient.isNodeAddress("""P5NCNAM7FXML4MFDBZ4NFR6PKKYS2AF73YEFVOPOXVKKE2DTLI2LDFAD.ONION"""))
        assertFalse(NodeMeshClient.isNodeAddress("""x.onion"""))
        assertFalse(NodeMeshClient.isNodeAddress(""""""))
        assertFalse(NodeMeshClient.isNodeAddress(""" p5ncnam7fxml4mfdbz4nfr6pkkys2af73yefvopoxvkke2dtli2ldfad.onion"""))
    }

    @Test fun `check code of a guest answer`() {
        assertEquals("""E4B9F-34479""", GuestClient.fingerprint("""mk""", """rk""", """inviteId1"""))
        assertEquals("""D0211-35A38""", GuestClient.fingerprint("""bWVzc2FnZUtleQ==""", """cmF0Y2hldEtleQ==""", """abcDEF123_-xy"""))
    }

    @Test fun `GRANT_RENEW cases`() {
        // two good entries
        assertEquals(listOf(GuestRenewal.Entry("""p5ncnam7fxml4mfdbz4nfr6pkkys2af73yefvopoxvkke2dtli2ldfad.onion""", """AQABAgMEBQYHCAkKCwwNDg8AAAG42sW0AAA8ABAAAAA.BKCFyEO5jz9lifGZwOqrdRG1PU8Aqq35YNDHUxx6gHg"""), GuestRenewal.Entry("""ehjcr5vonk2mftfwkmmuynlbmdzjcjukxtawymfgfz5ewrk3ey5aqiad.onion""", """Af_u3cy7qpmId2ZVRDMiEQAAAAG42sW0AAB4ACAAAAMKCww.f1LKDtsI1YMSrToOJU4OfVtXvhHNdTm2H3Nle3t80zU""")), GuestRenewal.parseSignal("""UNPRUUF_GRANTRENEW_V1:p5ncnam7fxml4mfdbz4nfr6pkkys2af73yefvopoxvkke2dtli2ldfad.onion,AQABAgMEBQYHCAkKCwwNDg8AAAG42sW0AAA8ABAAAAA.BKCFyEO5jz9lifGZwOqrdRG1PU8Aqq35YNDHUxx6gHg;ehjcr5vonk2mftfwkmmuynlbmdzjcjukxtawymfgfz5ewrk3ey5aqiad.onion,Af_u3cy7qpmId2ZVRDMiEQAAAAG42sW0AAB4ACAAAAMKCww.f1LKDtsI1YMSrToOJU4OfVtXvhHNdTm2H3Nle3t80zU""", now))
        // plain host dropped
        assertEquals(listOf(GuestRenewal.Entry("""ehjcr5vonk2mftfwkmmuynlbmdzjcjukxtawymfgfz5ewrk3ey5aqiad.onion""", """Af_u3cy7qpmId2ZVRDMiEQAAAAG42sW0AAB4ACAAAAMKCww.f1LKDtsI1YMSrToOJU4OfVtXvhHNdTm2H3Nle3t80zU""")), GuestRenewal.parseSignal("""UNPRUUF_GRANTRENEW_V1:evil.example.com,AQABAgMEBQYHCAkKCwwNDg8AAAG42sW0AAA8ABAAAAA.BKCFyEO5jz9lifGZwOqrdRG1PU8Aqq35YNDHUxx6gHg;ehjcr5vonk2mftfwkmmuynlbmdzjcjukxtawymfgfz5ewrk3ey5aqiad.onion,Af_u3cy7qpmId2ZVRDMiEQAAAAG42sW0AAB4ACAAAAMKCww.f1LKDtsI1YMSrToOJU4OfVtXvhHNdTm2H3Nle3t80zU""", now))
        // expired token dropped
        assertEquals(listOf(GuestRenewal.Entry("""ehjcr5vonk2mftfwkmmuynlbmdzjcjukxtawymfgfz5ewrk3ey5aqiad.onion""", """Af_u3cy7qpmId2ZVRDMiEQAAAAG42sW0AAB4ACAAAAMKCww.f1LKDtsI1YMSrToOJU4OfVtXvhHNdTm2H3Nle3t80zU""")), GuestRenewal.parseSignal("""UNPRUUF_GRANTRENEW_V1:p5ncnam7fxml4mfdbz4nfr6pkkys2af73yefvopoxvkke2dtli2ldfad.onion,AQARIjNEVWZ3iJmqu8zd7v8AAAGLz-VoAAA8ABAAAAA.D9eKWoMVgVzdFlvD3Ymi4JCb93Gd_-vi1_-O1KzGgRg;ehjcr5vonk2mftfwkmmuynlbmdzjcjukxtawymfgfz5ewrk3ey5aqiad.onion,Af_u3cy7qpmId2ZVRDMiEQAAAAG42sW0AAB4ACAAAAMKCww.f1LKDtsI1YMSrToOJU4OfVtXvhHNdTm2H3Nle3t80zU""", now))
        // not a token dropped
        assertEquals(listOf(GuestRenewal.Entry("""ehjcr5vonk2mftfwkmmuynlbmdzjcjukxtawymfgfz5ewrk3ey5aqiad.onion""", """Af_u3cy7qpmId2ZVRDMiEQAAAAG42sW0AAB4ACAAAAMKCww.f1LKDtsI1YMSrToOJU4OfVtXvhHNdTm2H3Nle3t80zU""")), GuestRenewal.parseSignal("""UNPRUUF_GRANTRENEW_V1:p5ncnam7fxml4mfdbz4nfr6pkkys2af73yefvopoxvkke2dtli2ldfad.onion,not-a-grant;ehjcr5vonk2mftfwkmmuynlbmdzjcjukxtawymfgfz5ewrk3ey5aqiad.onion,Af_u3cy7qpmId2ZVRDMiEQAAAAG42sW0AAB4ACAAAAMKCww.f1LKDtsI1YMSrToOJU4OfVtXvhHNdTm2H3Nle3t80zU""", now))
        // duplicate address dropped
        assertEquals(listOf(GuestRenewal.Entry("""p5ncnam7fxml4mfdbz4nfr6pkkys2af73yefvopoxvkke2dtli2ldfad.onion""", """AQABAgMEBQYHCAkKCwwNDg8AAAG42sW0AAA8ABAAAAA.BKCFyEO5jz9lifGZwOqrdRG1PU8Aqq35YNDHUxx6gHg""")), GuestRenewal.parseSignal("""UNPRUUF_GRANTRENEW_V1:p5ncnam7fxml4mfdbz4nfr6pkkys2af73yefvopoxvkke2dtli2ldfad.onion,AQABAgMEBQYHCAkKCwwNDg8AAAG42sW0AAA8ABAAAAA.BKCFyEO5jz9lifGZwOqrdRG1PU8Aqq35YNDHUxx6gHg;p5ncnam7fxml4mfdbz4nfr6pkkys2af73yefvopoxvkke2dtli2ldfad.onion,Af_u3cy7qpmId2ZVRDMiEQAAAAG42sW0AAB4ACAAAAMKCww.f1LKDtsI1YMSrToOJU4OfVtXvhHNdTm2H3Nle3t80zU""", now))
        // at most three
        assertEquals(listOf(GuestRenewal.Entry("""p5ncnam7fxml4mfdbz4nfr6pkkys2af73yefvopoxvkke2dtli2ldfad.onion""", """AQABAgMEBQYHCAkKCwwNDg8AAAG42sW0AAA8ABAAAAA.BKCFyEO5jz9lifGZwOqrdRG1PU8Aqq35YNDHUxx6gHg"""), GuestRenewal.Entry("""ehjcr5vonk2mftfwkmmuynlbmdzjcjukxtawymfgfz5ewrk3ey5aqiad.onion""", """AQABAgMEBQYHCAkKCwwNDg8AAAG42sW0AAA8ABAAAAA.BKCFyEO5jz9lifGZwOqrdRG1PU8Aqq35YNDHUxx6gHg"""), GuestRenewal.Entry("""52ce2llezfboqynb6cspi737fjqc47z6s7oniawodtcwbcx3yv7dsfad.onion""", """AQABAgMEBQYHCAkKCwwNDg8AAAG42sW0AAA8ABAAAAA.BKCFyEO5jz9lifGZwOqrdRG1PU8Aqq35YNDHUxx6gHg""")), GuestRenewal.parseSignal("""UNPRUUF_GRANTRENEW_V1:p5ncnam7fxml4mfdbz4nfr6pkkys2af73yefvopoxvkke2dtli2ldfad.onion,AQABAgMEBQYHCAkKCwwNDg8AAAG42sW0AAA8ABAAAAA.BKCFyEO5jz9lifGZwOqrdRG1PU8Aqq35YNDHUxx6gHg;ehjcr5vonk2mftfwkmmuynlbmdzjcjukxtawymfgfz5ewrk3ey5aqiad.onion,AQABAgMEBQYHCAkKCwwNDg8AAAG42sW0AAA8ABAAAAA.BKCFyEO5jz9lifGZwOqrdRG1PU8Aqq35YNDHUxx6gHg;52ce2llezfboqynb6cspi737fjqc47z6s7oniawodtcwbcx3yv7dsfad.onion,AQABAgMEBQYHCAkKCwwNDg8AAAG42sW0AAA8ABAAAAA.BKCFyEO5jz9lifGZwOqrdRG1PU8Aqq35YNDHUxx6gHg;u4ba6455zmadypu2j4nez3jxsxuewuips2ws4php36tolimorsycjhid.onion,AQABAgMEBQYHCAkKCwwNDg8AAAG42sW0AAA8ABAAAAA.BKCFyEO5jz9lifGZwOqrdRG1PU8Aqq35YNDHUxx6gHg""", now))
        // nothing usable
        assertNull(GuestRenewal.parseSignal("""UNPRUUF_GRANTRENEW_V1:evil.example.com,AQABAgMEBQYHCAkKCwwNDg8AAAG42sW0AAA8ABAAAAA.BKCFyEO5jz9lifGZwOqrdRG1PU8Aqq35YNDHUxx6gHg""", now))
        // wrong prefix
        assertNull(GuestRenewal.parseSignal("""UNPRUUF_OTHER_V1:p5ncnam7fxml4mfdbz4nfr6pkkys2af73yefvopoxvkke2dtli2ldfad.onion,AQABAgMEBQYHCAkKCwwNDg8AAAG42sW0AAA8ABAAAAA.BKCFyEO5jz9lifGZwOqrdRG1PU8Aqq35YNDHUxx6gHg""", now))
    }

    @Test fun `invitation and answer codes decode`() {
        val inv = jsonToNodeMeshPayload("""{"v":2,"p":"bWVzc2FnZUtleQ==","k":"cmF0Y2hldEtleQ==","s":"cm91dGluZ1NlZWQ=","n":"p5ncnam7fxml4mfdbz4nfr6pkkys2af73yefvopoxvkke2dtli2ldfad.onion;ehjcr5vonk2mftfwkmmuynlbmdzjcjukxtawymfgfz5ewrk3ey5aqiad.onion","e":"pro","g":"AQABAgMEBQYHCAkKCwwNDg8AAAG42sW0AAA8ABAAAAA.BKCFyEO5jz9lifGZwOqrdRG1PU8Aqq35YNDHUxx6gHg;Af_u3cy7qpmId2ZVRDMiEQAAAAG42sW0AAB4ACAAAAMKCww.f1LKDtsI1YMSrToOJU4OfVtXvhHNdTm2H3Nle3t80zU","i":"inviteId123"}""")
        assertNotNull(inv)
        assertEquals(listOf("""unpruuf-node:v1:p5ncnam7fxml4mfdbz4nfr6pkkys2af73yefvopoxvkke2dtli2ldfad.onion""", """unpruuf-node:v1:ehjcr5vonk2mftfwkmmuynlbmdzjcjukxtawymfgfz5ewrk3ey5aqiad.onion"""), inv!!.nodeAddresses)
        assertEquals(listOf("""AQABAgMEBQYHCAkKCwwNDg8AAAG42sW0AAA8ABAAAAA.BKCFyEO5jz9lifGZwOqrdRG1PU8Aqq35YNDHUxx6gHg""", """Af_u3cy7qpmId2ZVRDMiEQAAAAG42sW0AAB4ACAAAAMKCww.f1LKDtsI1YMSrToOJU4OfVtXvhHNdTm2H3Nle3t80zU"""), inv.guestGrants)
        assertEquals("""inviteId123""", inv.guestInviteId)
        assertEquals("""pro""", inv.appEdition)
        val ans = jsonToNodeMeshPayload("""{"v":2,"p":"Z3Vlc3RLZXk=","k":"Z3Vlc3RSYXRjaGV0","s":"Z3Vlc3RTZWVk","n":"p5ncnam7fxml4mfdbz4nfr6pkkys2af73yefvopoxvkke2dtli2ldfad.onion;ehjcr5vonk2mftfwkmmuynlbmdzjcjukxtawymfgfz5ewrk3ey5aqiad.onion","e":"client","i":"inviteId123"}""")
        assertNotNull(ans)
        assertEquals(listOf("""unpruuf-node:v1:p5ncnam7fxml4mfdbz4nfr6pkkys2af73yefvopoxvkke2dtli2ldfad.onion""", """unpruuf-node:v1:ehjcr5vonk2mftfwkmmuynlbmdzjcjukxtawymfgfz5ewrk3ey5aqiad.onion"""), ans!!.nodeAddresses)
        assertEquals(emptyList<String>(), ans.guestGrants)
        assertEquals("""inviteId123""", ans.guestInviteId)
        assertEquals("""client""", ans.appEdition)
    }
}
