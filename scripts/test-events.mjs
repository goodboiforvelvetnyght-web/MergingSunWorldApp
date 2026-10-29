import assert from "node:assert/strict";
import { doc, getDoc, setDoc } from "firebase/firestore";
export async function testEvents({ check, admin, player, other, db }) {
  const id = crypto.randomUUID(),
    pid = crypto.randomUUID(),
    uid = player.auth.currentUser.uid;
  const character = {
    name: "Event hero",
    title: "Ranger",
    bio: "Public tale",
    realName: "PRIVATE",
    energy: 79,
    portrait: "",
  };
  await db.doc(`characters/${uid}`).set(character);
  const event = {
    title: "The two banners",
    kind: "major",
    date: "2026-11-14",
    venue: "Field",
    story: "Story",
    aftermath: "",
    locationId: null,
    published: false,
    sides: [
      { name: "Dawn", artwork: null, logo: null },
      { name: "Dusk", artwork: null, logo: null },
    ],
  };
  await check(
    "events enforce admin edits, draft privacy and public field projection",
    async () => {
      await assert.rejects(
        player.call("manageEvent", { id, action: "save", event, revision: 0 }),
      );
      await admin.call("manageEvent", {
        id,
        action: "save",
        event,
        revision: 0,
      });
      await assert.rejects(getDoc(doc(player.store, `events/${id}`)));
      await assert.rejects(setDoc(doc(player.store, `events/${id}`), event));
      await admin.call("manageEvent", {
        id,
        action: "participant",
        participantId: pid,
        side: 0,
        characterName: "Registered hero",
        playerIdentity: "Player nickname",
        characterClass: "Ranger",
      });
      await assert.rejects(
        player.call("requestEventLink", {
          id,
          participantId: pid,
          consent: true,
        }),
      );
      await admin.call("manageEvent", {
        id,
        action: "save",
        event: { ...event, published: true },
        revision: 2,
      });
      await assert.rejects(
        admin.call("manageEvent", { id, action: "save", event, revision: 0 }),
      );
      await assert.rejects(
        player.call("requestEventLink", { id, participantId: pid }),
      );
      await player.call("requestEventLink", {
        id,
        participantId: pid,
        consent: true,
      });
      await assert.rejects(
        player.call("requestEventLink", {
          id,
          participantId: pid,
          consent: true,
        }),
      );
      await assert.rejects(
        getDoc(doc(other.store, `events/${id}/links/${pid}`)),
      );
      assert.equal((await other.call("getEventLinks", { id })).links.length, 0);
      await assert.rejects(
        other.call("getEventProfile", { id, participantId: pid }),
      );
      await admin.call("manageEvent", {
        id,
        action: "approve",
        participantId: pid,
      });
      const profile = await other.call("getEventProfile", {
        id,
        participantId: pid,
      });
      assert.deepEqual(profile, {
        name: "Event hero",
        title: "Ranger",
        bio: "Public tale",
        image: "",
      });
      const roster = (await getDoc(doc(player.store, `events/${id}`))).data()
        .participants;
      assert.equal(roster[0].characterName, "Registered hero");
      assert.equal(roster[0].linked, true);
      assert(!JSON.stringify(roster).includes("PRIVATE"));
      await db
        .doc(`characters/${uid}`)
        .update({ name: "Recreated hero", bio: "New story" });
      assert.equal(
        (await other.call("getEventProfile", { id, participantId: pid })).name,
        "Event hero",
      );
      await admin.call("manageEvent", {
        id,
        action: "participant",
        participantId: pid,
        side: 1,
        characterName: "Registered hero",
        playerIdentity: "Player nickname",
        characterClass: "Ranger",
      });
      assert.equal(
        (await db.doc(`events/${id}`).get()).data().participants[0].side,
        1,
      );
      await admin.call("manageEvent", {
        id,
        action: "unlink",
        participantId: pid,
      });
      await assert.rejects(
        other.call("getEventProfile", { id, participantId: pid }),
      );
      await player.call("requestEventLink", {
        id,
        participantId: pid,
        consent: true,
      });
      await admin.call("manageEvent", {
        id,
        action: "reject",
        participantId: pid,
      });
      await admin.call("manageEvent", {
        id,
        action: "link",
        participantId: pid,
        uid,
      });
      await admin.call("manageEvent", {
        id,
        action: "remove",
        participantId: pid,
      });
      await assert.rejects(
        other.call("getEventProfile", { id, participantId: pid }),
      );
      assert(!(await db.doc(`events/${id}/links/${pid}`).get()).exists);
    },
  );
}
