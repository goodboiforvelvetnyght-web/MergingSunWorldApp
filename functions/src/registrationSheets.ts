import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { randomUUID } from "node:crypto";
import { db } from "./firebase.js";
import { requireAdmin } from "./adminInvitations.js";
import { regId } from "./registrations.js";
import type {
  RegistrationConfig,
  RegistrationRecord,
} from "../../shared/registration.js";
const options = {
  region: "asia-southeast1",
  maxInstances: 3,
  serviceAccount: "merging-sun-runtime@mergingsunapp-2.iam.gserviceaccount.com",
};
const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
export function sheetCell(v: unknown): string {
  return Array.isArray(v)
    ? v.join(", ")
    : v === undefined || v === null
      ? ""
      : String(v);
}
async function sheets(path: string, method = "GET", data?: unknown) {
  return (
    await auth.request<any>({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${path}`,
      method: method as "GET" | "POST" | "PUT",
      data,
      timeout: 20000,
    })
  ).data;
}
type Settings = {
  leaseUntil?: number;
  lease?: string;
  spreadsheetId: string;
  tab: string;
  generation: string;
  nextRow: number;
  columns: { id: string; title: string }[];
};
export const connectRegistrationSheet = onCall(
  { ...options, timeoutSeconds: 120 },
  async (req) => {
    await requireAdmin(req.auth);
    const id = regId(req.data?.eventId),
      url = String(req.data?.url ?? "");
    return configureSheet(id, url);
  },
);
async function configureSheet(id: string, url: string) {
  const spreadsheetId =
    url.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1] ??
    (/^[\w-]{20,120}$/.test(url) ? url : "");
  if (!spreadsheetId)
    throw new HttpsError("invalid-argument", "Paste a Google spreadsheet URL.");
  const e = await db.doc(`events/${id}`).get();
  if (!e.exists) throw new HttpsError("not-found", "Event not found.");
  const tab = `Merging Sun ${id.slice(0, 12)}`;
  try {
    const metadata = await sheets(`${spreadsheetId}?fields=sheets.properties`);
    if (!metadata.sheets?.some((s: any) => s.properties.title === tab))
      await sheets(`${spreadsheetId}:batchUpdate`, "POST", {
        requests: [
          {
            addSheet: {
              properties: {
                title: tab,
                gridProperties: {
                  rowCount: 5000,
                  columnCount: 100,
                  frozenRowCount: 1,
                },
              },
            },
          },
        ],
      });
  } catch {
    throw new HttpsError(
      "failed-precondition",
      "Could not access this spreadsheet. Share it as Editor with merging-sun-runtime@mergingsunapp-2.iam.gserviceaccount.com and enable the Google Sheets API in project mergingsunapp-2.",
    );
  }
  const sref = db.doc(`registrationSheets/${id}`);
  await db.runTransaction(async (tx) => {
    const old = (await tx.get(sref)).data() as Settings | undefined;
    if ((old?.leaseUntil ?? 0) > Date.now())
      throw new HttpsError(
        "aborted",
        "A spreadsheet update is running. Try connecting again in a moment.",
      );
    const same = old?.spreadsheetId === spreadsheetId;
    tx.set(sref, {
      spreadsheetId,
      tab,
      generation: same ? old!.generation : randomUUID(),
      nextRow: same ? old!.nextRow : 2,
      columns: same ? old!.columns : [],
    });
  });
  const rows = await db.collection(`events/${id}/registrations`).get();
  // Updating a token queues both old requests and previously failed rows for delivery.
  for (let start = 0; start < rows.size; start += 400) {
    const batch = db.batch();
    for (const row of rows.docs.slice(start, start + 400))
      batch.update(row.ref, { syncToken: Date.now(), syncState: "pending" });
    await batch.commit();
  }
  return { ok: true, tab };
}
const deploymentAccount =
  "github-deploy@mergingsunapp-2.iam.gserviceaccount.com";
const setupAudience =
  "https://asia-southeast1-mergingsunapp-2.cloudfunctions.net/configureRegistrationSheetDeployment";
export const configureRegistrationSheetDeployment = onRequest(
  { ...options, timeoutSeconds: 120, invoker: [deploymentAccount] },
  async (req, res) => {
    // Cloud Run IAM and a verified identity token both restrict this setup route to our deployment account.
    try {
      const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!token) throw new Error("Missing identity");
      const ticket = await new OAuth2Client().verifyIdToken({
        idToken: token,
        audience: setupAudience,
      });
      const payload = ticket.getPayload();
      if (
        payload?.email !== deploymentAccount ||
        payload.email_verified !== true
      )
        throw new Error("Wrong identity");
    } catch {
      res.status(403).json({ error: "Deployment identity required." });
      return;
    }
    if (req.method !== "POST") {
      res.status(405).end();
      return;
    }
    try {
      res.json(
        await configureSheet(
          regId(req.body?.eventId),
          String(req.body?.url ?? ""),
        ),
      );
    } catch (error) {
      res
        .status(400)
        .json({
          error:
            error instanceof HttpsError
              ? error.message
              : "Spreadsheet setup failed.",
        });
    }
  },
);
export const syncEventRegistration = onDocumentWritten(
  {
    ...options,
    document: "events/{eventId}/registrations/{registrationId}",
    retry: true,
    timeoutSeconds: 120,
  },
  async (event) => {
    const after = event.data?.after.data(),
      before = event.data?.before.data();
    if (
      !after ||
      (before?.revision === after.revision &&
        before?.syncToken === after.syncToken)
    )
      return;
    if (process.env.FUNCTIONS_EMULATOR === "true") return;
    await deliverRegistration(
      event.params.eventId,
      event.params.registrationId,
    );
  },
);

export async function deliverRegistration(
  eventId: string,
  registrationId: string,
  requestSheets: typeof sheets = sheets,
) {
  const ref = db.doc(`events/${eventId}/registrations/${registrationId}`),
    sref = db.doc(`registrationSheets/${eventId}`),
    lease = randomUUID();
  const task = await db.runTransaction(async (tx) => {
    const r = (await tx.get(ref)).data() as RegistrationRecord & {
      syncToken: number;
      syncedRevision?: number;
      syncedToken?: number;
      leaseUntil?: number;
      sheetGeneration?: string;
    };
    const s = (await tx.get(sref)).data() as Settings | undefined;
    if (!s) return null;
    if (
      r.syncedRevision === r.revision &&
      r.syncedToken === r.syncToken &&
      r.sheetGeneration === s.generation
    )
      return null;
    if ((r.leaseUntil ?? 0) > Date.now() || (s.leaseUntil ?? 0) > Date.now())
      throw new Error("Registration synchronization is already running.");
    const c = (
      await tx.get(
        db.doc(`events/${eventId}/registrationVersions/${r.version}`),
      )
    ).data() as RegistrationConfig;
    const e = (await tx.get(db.doc(`events/${eventId}`))).data();
    const columns = [...s.columns];
    for (const f of c.fields)
      if (!columns.some((k) => k.id === f.id))
        columns.push({ id: f.id, title: f.label });
    if (columns.length > 75)
      throw new Error("Too many historical question columns.");
    const row =
      r.sheetGeneration === s.generation && r.sheetRow ? r.sheetRow : s.nextRow;
    tx.update(sref, {
      lease,
      leaseUntil: Date.now() + 120000,
      columns,
      nextRow: Math.max(s.nextRow, row + 1),
    });
    tx.update(ref, {
      sheetRow: row,
      sheetGeneration: s.generation,
      lease,
      leaseUntil: Date.now() + 120000,
    });
    return {
      r,
      s: { ...s, columns },
      row,
      side: e?.sides?.[r.side]?.name ?? String(r.side),
    };
  });
  if (!task) return;
  try {
    const { r, s, side } = task;
    const existing = await requestSheets(
      `${s.spreadsheetId}/values/${encodeURIComponent(`'${s.tab}'!A2:A5001`)}`,
    );
    const ids = (existing.values ?? []) as string[][];
    const found = ids.findIndex((v) => v[0] === r.id),
      empty = ids.findIndex((v) => !v[0]);
    const row =
      found >= 0 ? found + 2 : empty >= 0 ? empty + 2 : ids.length + 2;

    const headers = [
      "Reference",
      "Submitted (UTC)",
      "Side",
      "Status",
      "Form version",
      "Terms accepted",
      "Costume requirements accepted",
      "Updated (UTC)",
      "Admin reason",
      ...s.columns.map((c) => `${c.title} [${c.id}]`),
    ];
    const values = [
      r.id,
      new Date(r.submittedAt).toISOString(),
      side,
      r.status,
      String(r.version),
      sheetCell(r.acceptedTerms),
      sheetCell(r.acceptedColors),
      new Date(r.updatedAt).toISOString(),
      r.reason,
      ...s.columns.map((c) => sheetCell(r.answers[c.id])),
    ];
    // Fixed managed range A:CF (84 columns); CG onward is reserved for organizer notes.
    while (headers.length < 84) headers.push("");
    while (values.length < 84) values.push("");
    await requestSheets(`${s.spreadsheetId}/values:batchUpdate`, "POST", {
      valueInputOption: "RAW",
      data: [
        { range: `'${s.tab}'!A1:CF1`, values: [headers] },
        { range: `'${s.tab}'!A${row}:CF${row}`, values: [values] },
      ],
    });
    await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      const settings = await tx.get(sref);
      if (current.data()?.lease !== lease || settings.data()?.lease !== lease)
        return;
      tx.update(ref, {
        sheetRow: row,
        syncedRevision: r.revision,
        syncedToken: r.syncToken,
        syncState:
          current.data()?.revision === r.revision ? "synced" : "pending",
        syncError: "",
        leaseUntil: 0,
      });
      tx.update(sref, { leaseUntil: 0 });
    });
  } catch {
    await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      const settings = await tx.get(sref);
      if (current.data()?.lease !== lease || settings.data()?.lease !== lease)
        return;
      tx.update(ref, {
        syncState: "retrying",
        syncError:
          "Check spreadsheet sharing and Google Sheets API access. Delivery will retry automatically.",
        leaseUntil: 0,
      });
      tx.update(sref, { leaseUntil: 0 });
    });
    throw new Error("Google Sheets delivery failed; retry requested.");
  }
}
