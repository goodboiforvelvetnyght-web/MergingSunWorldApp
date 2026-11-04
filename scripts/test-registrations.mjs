import assert from "node:assert/strict";
import { getDoc, doc } from "firebase/firestore";
import { defaultRegistration } from "../functions/lib/shared/registration.js";
import { deliverRegistration } from "../functions/lib/functions/src/registrationSheets.js";
export async function testRegistrations({ check, admin, player, client, db }) {
  const anonymous = client("registration-visitor"),
    id = crypto.randomUUID(),
    rid = crypto.randomUUID(),
    event = {
      title: "Registration battle",
      kind: "major",
      date: "2026-12-05",
      venue: "Test field",
      story: "",
      aftermath: "",
      locationId: null,
      published: true,
      sides: [
        { name: "Dawn", artwork: null, logo: null },
        { name: "Dusk", artwork: null, logo: null },
      ],
    };
  await admin.call("manageEvent", { id, action: "save", revision: 0, event });
  const c = defaultRegistration();
  c.open = true;
  c.fields.push({
    id: "meal",
    label: "Meal",
    description: "",
    step: "extra",
    type: "dropdown",
    required: true,
    choices: ["Vegetarian", "Standard"],
  });
  const answers = {
    characterName: "Mira",
    playerIdentity: "Public nickname",
    characterClass: "Archer",
    contactName: "PRIVATE CONTACT",
    phone: "+66 123456",
    meal: "Vegetarian",
  };
  const payload = {
    eventId: id,
    requestId: rid,
    version: 1,
    side: 0,
    answers,
    acceptedTerms: true,
    acceptedColors: true,
  };
  await check(
    "public registration is versioned, validated, idempotent and private until admin confirmation",
    async () => {
      await assert.rejects(
        player.call("saveRegistrationForm", {
          eventId: id,
          config: c,
          revision: 0,
          publish: true,
        }),
      );
      await admin.call("saveRegistrationForm", {
        eventId: id,
        config: c,
        revision: 0,
        publish: false,
      });
      await assert.rejects(anonymous.call("submitEventRegistration", payload));
      await admin.call("saveRegistrationForm", {
        eventId: id,
        config: c,
        revision: 1,
        publish: true,
      });
      await assert.rejects(
        anonymous.call("submitEventRegistration", {
          ...payload,
          acceptedTerms: false,
        }),
      );
      await assert.rejects(
        anonymous.call("submitEventRegistration", {
          ...payload,
          answers: { ...answers, meal: "Unlisted" },
        }),
      );
      const result = await anonymous.call("submitEventRegistration", payload);
      assert.equal(result.reference, rid);
      await anonymous.call("submitEventRegistration", payload);
      assert.equal(
        (await db.collection(`events/${id}/registrations`).get()).size,
        1,
      );
      assert.equal(
        (await db.doc(`events/${id}`).get()).data().participants.length,
        0,
      );
      await assert.rejects(
        getDoc(doc(anonymous.store, `events/${id}/registrations/${rid}`)),
      );
      await assert.rejects(
        getDoc(doc(player.store, `events/${id}/registrationVersions/1`)),
      );
      await assert.rejects(
        getDoc(doc(anonymous.store, `registrationDrafts/${id}`)),
      );
      await assert.rejects(
        getDoc(doc(anonymous.store, `registrationSheets/${id}`)),
      );
      await assert.rejects(
        player.call("reviewEventRegistration", {
          eventId: id,
          registrationId: rid,
          revision: 1,
          action: "confirm",
        }),
      );
      await admin.call("reviewEventRegistration", {
        eventId: id,
        registrationId: rid,
        revision: 1,
        action: "confirm",
      });
      let e = (await db.doc(`events/${id}`).get()).data();
      assert.equal(e.participants.length, 1);
      assert(!JSON.stringify(e).includes("PRIVATE CONTACT"));
      assert(!JSON.stringify(e).includes("+66"));
      await assert.rejects(
        admin.call("reviewEventRegistration", {
          eventId: id,
          registrationId: rid,
          revision: 1,
          action: "confirm",
        }),
      );
      await admin.call("reviewEventRegistration", {
        eventId: id,
        registrationId: rid,
        revision: 2,
        action: "correct",
        side: 1,
        answers: { ...answers, characterName: "Updated name" },
      });
      const r = (
        await db.doc(`events/${id}/registrations/${rid}`).get()
      ).data();
      assert.equal(r.submittedSide, 0);
      assert.equal(r.originalAnswers.characterName, "Mira");
      assert.equal(r.answers.characterName, "Updated name");
      c.terms = "<p>NEW TERMS</p>";
      await admin.call("saveRegistrationForm", {
        eventId: id,
        config: c,
        revision: 2,
        publish: true,
      });
      assert.notEqual(
        (await db.doc(`events/${id}/registrationVersions/1`).get()).data()
          .terms,
        c.terms,
      );
      await assert.rejects(
        anonymous.call("submitEventRegistration", {
          ...payload,
          requestId: crypto.randomUUID(),
        }),
      );
      c.open = false;
      await admin.call("saveRegistrationForm", {
        eventId: id,
        config: c,
        revision: 3,
        publish: true,
      });
      await assert.rejects(
        anonymous.call("submitEventRegistration", {
          ...payload,
          version: 3,
          requestId: crypto.randomUUID(),
        }),
      );
      e = (await db.doc(`events/${id}`).get()).data();
      await admin.call("manageEvent", {
        id,
        action: "save",
        revision: e.revision,
        event,
      });
      assert.equal(
        (await db.doc(`events/${id}`).get()).data().registrationOpen,
        false,
      );
      await assert.rejects(
        player.call("connectRegistrationSheet", { eventId: id, url: "bad" }),
      );
    },
  );
  await check(
    "Sheets retries update one row by reference, write raw values and preserve organizer columns",
    async () => {
      const ref = db.doc(`events/${id}/registrations/${rid}`);
      await db
        .doc(`registrationSheets/${id}`)
        .set({
          spreadsheetId: "test-spreadsheet",
          tab: "Test",
          generation: "generation",
          nextRow: 2,
          columns: [],
        });
      let fail = true,
        writes = [],
        rows = [];
      const transport = async (path, method = "GET", data) => {
        if (fail) throw new Error("Simulated unavailable Sheets");
        if (method === "GET") return { values: rows };
        writes.push(data);
        const range = data.data[1].range;
        const row = Number(range.match(/!A(\d+)/)[1]);
        rows[row - 2] = [rid];
        return {};
      };
      await assert.rejects(deliverRegistration(id, rid, transport));
      assert.equal((await ref.get()).data().syncState, "retrying");
      fail = false;
      await deliverRegistration(id, rid, transport);
      assert.equal(writes.length, 1);
      assert.equal(writes[0].valueInputOption, "RAW");
      assert(writes[0].data[1].range.endsWith(":CF2"));
      assert.equal(writes[0].data[1].values[0].length, 84);
      await deliverRegistration(id, rid, transport);
      assert.equal(writes.length, 1);
      rows = [["someone-else"], [rid]];
      await ref.update({ revision: 4, "answers.playerIdentity": "=1+1" });
      await deliverRegistration(id, rid, transport);
      assert(writes[1].data[1].range.endsWith(":CF3"));
      assert(writes[1].data[1].values[0].includes("=1+1"));
      assert.equal(rows.filter((x) => x?.[0] === rid).length, 1);
      await admin.call("reviewEventRegistration", {
        eventId: id,
        registrationId: rid,
        revision: 4,
        action: "reject",
        reason: "Registration withdrawn",
      });
      assert.equal(
        (await db.doc(`events/${id}`).get()).data().participants.length,
        0,
      );
    },
  );
}
