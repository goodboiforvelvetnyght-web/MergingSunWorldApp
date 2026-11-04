import assert from "node:assert/strict";
// Public, non-destructive checks. No production user is created and no world data is changed.
const root = "https://mergingsunapp-2.web.app";
const html = await fetch(root, { signal: AbortSignal.timeout(30000) });
assert.equal(html.status, 200, "Hosting must return HTTP 200");
assert.match(await html.text(), /Merging Sun/);
const tile = await fetch(`${root}/map/tiles/0/0/0.webp`, {
  signal: AbortSignal.timeout(30000),
});
assert.equal(tile.status, 200, "The map tile must be available");
const bytes = Buffer.from(await tile.arrayBuffer());
assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
for (const name of [
  "saveRegistrationForm",
  "reviewEventRegistration",
  "connectRegistrationSheet",
  "createCharacter",
  "reviewCharacter",
  "enterLocation",
  "getRoomCharacters",
  "getCharacterPortrait",
  "initializePopulation",
  "uploadWorldAsset",
  "beginMapUpload",
  "uploadMapChunk",
  "processMapUpload",
  "migrateLegacyPortraits",
  "travel",
  "publishWorld",
  "generateAdminInvitation",
  "redeemAdminInvitation",
  "revokeAdminInvitation",
]) {
  const response = await fetch(
    `https://asia-southeast1-mergingsunapp-2.cloudfunctions.net/${name}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: {} }),
      signal: AbortSignal.timeout(30000),
    },
  );
  const body = await response.json();
  const expected = [
    "saveRegistrationForm",
    "reviewEventRegistration",
    "connectRegistrationSheet",
    "publishWorld",
    "reviewCharacter",
    "uploadWorldAsset",
    "beginMapUpload",
    "uploadMapChunk",
    "processMapUpload",
    "migrateLegacyPortraits",
    "generateAdminInvitation",
    "revokeAdminInvitation",
  ].includes(name)
    ? "PERMISSION_DENIED"
    : "UNAUTHENTICATED";
  assert.equal(
    body.error?.status,
    expected,
    `${name} must reject an unauthenticated caller`,
  );
  assert.equal(response.status, expected === "PERMISSION_DENIED" ? 403 : 401);
}
const registration = await fetch(
  "https://asia-southeast1-mergingsunapp-2.cloudfunctions.net/submitEventRegistration",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: {} }),
    signal: AbortSignal.timeout(30000),
  },
);
assert.equal(
  registration.status,
  400,
  "Public registration must validate incomplete requests",
);
assert.equal((await registration.json()).error?.status, "INVALID_ARGUMENT");
console.log(
  "Live smoke checks passed: Hosting, a map tile, and authentication enforcement on all callable functions.",
);
