import { useEffect, useState, useCallback } from "react";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { call, friendlyError } from "../useWorld";
import {
  defaultRegistration,
  CORE_FIELDS,
  type RegistrationConfig,
  type RegistrationField,
  type RegistrationRecord,
  validateRegistrationConfig,
} from "../../shared/registration";
import type { WorldEvent } from "../../shared/events";
import { LoreEditor } from "./LoreEditor";
import {
  RegistrationJourney,
  RegistrationRichText,
} from "./RegistrationJourney";
import { Modal } from "./Modal";
export function RegistrationAdmin({
  event,
  onClose,
}: {
  event: WorldEvent;
  onClose: () => void;
}) {
  const [config, setConfig] = useState(defaultRegistration),
    [revision, setRevision] = useState(0),
    [loaded, setLoaded] = useState(false),
    [mode, setMode] = useState<"form" | "requests" | "sheets">("form"),
    [records, setRecords] = useState<RegistrationRecord[]>([]),
    [selected, select] = useState<RegistrationRecord | null>(null),
    [historical, setHistorical] = useState<RegistrationConfig | null>(null),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [uploadCount, setUploadCount] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [sheetUrl, setSheetUrl] = useState(""),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [sheetState, setSheetState] = useState<any>(null);
  const uploading = uploadCount > 0;
  const setUploading = useCallback(
    (busy: boolean) => setUploadCount((n) => Math.max(0, n + (busy ? 1 : -1))),
    [],
  );
  useEffect(() => {
    let active = true;
    void (async () => {
      const draft = await getDoc(doc(db, "registrationDrafts", event.id));
      const c = draft.exists()
        ? draft.data().config
        : (
            await getDoc(doc(db, `events/${event.id}/registration/config`))
          ).data();
      if (active) {
        setConfig((c as RegistrationConfig) ?? defaultRegistration());
        setRevision(draft.data()?.revision ?? 0);
        setLoaded(true);
      }
    })().catch((e) => setError(friendlyError(e)));
    return () => {
      active = false;
    };
  }, [event.id]);
  useEffect(
    () =>
      onSnapshot(
        collection(db, `events/${event.id}/registrations`),
        (s) =>
          setRecords(
            s.docs
              .map((d) => d.data() as RegistrationRecord)
              .sort((a, b) => b.submittedAt - a.submittedAt),
          ),
        (e) => setError(friendlyError(e)),
      ),
    [event.id],
  );
  useEffect(
    () =>
      onSnapshot(doc(db, "registrationSheets", event.id), (s) => {
        setSheetState(s.data() ?? null);
        if (s.data()?.spreadsheetId)
          setSheetUrl(
            `https://docs.google.com/spreadsheets/d/${s.data()!.spreadsheetId}/edit`,
          );
      }),
    [event.id],
  );
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(publish: boolean) {
    validateRegistrationConfig(config);
    const r = await call<{ config: RegistrationConfig; revision: number }>(
      "saveRegistrationForm",
      { eventId: event.id, config, revision, publish },
    );
    setConfig(r.config);
    setRevision(r.revision);
    setNotice(publish ? "Registration settings published." : "Draft saved.");
  }
  function changeField(index: number, patch: Partial<RegistrationField>) {
    setConfig({
      ...config,
      fields: config.fields.map((f, i) =>
        i === index ? { ...f, ...patch } : f,
      ),
    });
  }
  async function openRecord(r: RegistrationRecord) {
    select(structuredClone(r));
    setHistorical(null);
    const c = await getDoc(
      doc(db, `events/${event.id}/registrationVersions/${r.version}`),
    );
    setHistorical(c.data() as RegistrationConfig);
  }
  async function review(action: string) {
    await call("reviewEventRegistration", {
      eventId: event.id,
      registrationId: selected!.id,
      revision: selected!.revision,
      action,
      answers: selected!.answers,
      side: selected!.side,
      reason: selected!.reason,
    });
    select(null);
    setNotice(
      action === "confirm"
        ? "Participant confirmed and added to the roster."
        : "Registration updated.",
    );
  }
  const sourceRecord = records.find((r) => r.id === selected?.id);
  const hasCorrections =
    !!selected &&
    !!sourceRecord &&
    (selected.side !== sourceRecord.side ||
      JSON.stringify(selected.answers) !==
        JSON.stringify(sourceRecord.answers));
  if (preview)
    return (
      <RegistrationJourney
        event={event}
        config={config}
        preview
        onClose={() => setPreview(false)}
      />
    );
  return (
    <div className="registration-admin">
      <header>
        <h1>Event registration</h1>
        <button onClick={onClose}>Back to event</button>
      </header>
      <nav>
        {(["form", "requests", "sheets"] as const).map((m) => (
          <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
            {
              {
                form: "Form editor",
                requests: "Registration requests",
                sheets: "Google Sheets",
              }[m]
            }
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!loaded ? (
        <p>Loading registration settings…</p>
      ) : mode === "form" ? (
        <div className="form-stack">
          <div className="event-actions">
            <button
              disabled={busy || uploading}
              onClick={() => void run(() => save(false))}
            >
              Save form draft
            </button>
            <button
              disabled={uploading}
              onClick={() => {
                try {
                  validateRegistrationConfig(config);
                  setPreview(true);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Preview registration
            </button>
            <button
              disabled={busy || uploading}
              onClick={() => void run(() => save(true))}
            >
              Publish registration settings
            </button>
          </div>
          <label>
            <input
              type="checkbox"
              checked={config.open}
              onChange={(e) => setConfig({ ...config, open: e.target.checked })}
            />
            Registration open
          </label>
          <p>
            Publishing creates a new form and terms version. Existing
            submissions retain the version they accepted.
          </p>
          <h2>Opening introduction</h2>
          <LoreEditor
            label="Registration introduction"
            value={config.introduction}
            onChange={(v) => setConfig((c) => ({ ...c, introduction: v }))}
            uploadImages
            onBusyChange={setUploading}
          />
          {event.sides.map((side, i) => (
            <section key={i}>
              <h2>{side.name}: costume color guidance</h2>
              <LoreEditor
                label={`${side.name} costume guidance`}
                value={config.sideGuidance[i]}
                onChange={(v) =>
                  setConfig((c) => ({
                    ...c,
                    sideGuidance: c.sideGuidance.map((x, j) =>
                      j === i ? v : x,
                    ) as [string, string],
                  }))
                }
                uploadImages
                onBusyChange={setUploading}
              />
            </section>
          ))}
          <h2>Registration questions</h2>
          <p>
            Questions use SurveyJS. Identity and contact fields remain required;
            only the three public identity fields enter the roster.
          </p>
          {(["character", "contact", "extra"] as const).map((step) => (
            <label key={step}>
              {step} step heading
              <input
                maxLength={160}
                value={config.headings[step]}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    headings: { ...config.headings, [step]: e.target.value },
                  })
                }
              />
            </label>
          ))}
          {config.fields.map((f, i) => (
            <fieldset className="registration-question" key={f.id}>
              <legend>
                Question {i + 1}
                {CORE_FIELDS.includes(f.id) ? " · Built in" : ""}
              </legend>
              <label>
                Question label
                <input
                  value={f.label}
                  maxLength={200}
                  onChange={(e) => changeField(i, { label: e.target.value })}
                />
              </label>
              <label>
                Help text
                <input
                  value={f.description}
                  maxLength={1000}
                  onChange={(e) =>
                    changeField(i, { description: e.target.value })
                  }
                />
              </label>
              <label>
                Question type
                <select
                  value={f.type}
                  onChange={(e) =>
                    changeField(i, {
                      type: e.target.value as RegistrationField["type"],
                    })
                  }
                >
                  {(
                    [
                      "text",
                      "tel",
                      "comment",
                      "dropdown",
                      "radiogroup",
                      "checkbox",
                      "boolean",
                    ] as const
                  )
                    .filter(
                      (t) =>
                        !CORE_FIELDS.includes(f.id) ||
                        ["text", "tel", "dropdown", "radiogroup"].includes(t),
                    )
                    .map((t) => (
                      <option key={t} value={t}>
                        {
                          {
                            text: "Short text",
                            tel: "Phone number",
                            comment: "Long text",
                            dropdown: "Dropdown",
                            radiogroup: "Single choice",
                            checkbox: "Multiple choice",
                            boolean: "Acceptance checkbox",
                          }[t]
                        }
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Step
                <select
                  value={f.step}
                  onChange={(e) =>
                    changeField(i, {
                      step: e.target.value as RegistrationField["step"],
                    })
                  }
                >
                  <option value="character">Character</option>
                  <option value="contact">Contact</option>
                  <option value="extra">Additional details</option>
                </select>
              </label>
              {["dropdown", "radiogroup", "checkbox"].includes(f.type) && (
                <label>
                  Choices (one per line)
                  <textarea
                    value={f.choices.join("\n")}
                    onChange={(e) =>
                      changeField(i, { choices: e.target.value.split("\n") })
                    }
                  />
                </label>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={f.required}
                  disabled={CORE_FIELDS.includes(f.id)}
                  onChange={(e) =>
                    changeField(i, { required: e.target.checked })
                  }
                />
                Required
              </label>
              <div className="event-actions">
                <button
                  disabled={!i}
                  onClick={() => {
                    const fields = [...config.fields];
                    [fields[i - 1], fields[i]] = [fields[i], fields[i - 1]];
                    setConfig({ ...config, fields });
                  }}
                >
                  Move up
                </button>
                <button
                  disabled={i === config.fields.length - 1}
                  onClick={() => {
                    const fields = [...config.fields];
                    [fields[i + 1], fields[i]] = [fields[i], fields[i + 1]];
                    setConfig({ ...config, fields });
                  }}
                >
                  Move down
                </button>
                {!CORE_FIELDS.includes(f.id) && (
                  <button
                    onClick={() =>
                      setConfig({
                        ...config,
                        fields: config.fields.filter((_, j) => i !== j),
                      })
                    }
                  >
                    Remove question
                  </button>
                )}
              </div>
            </fieldset>
          ))}
          <button
            disabled={config.fields.length >= 40}
            onClick={() =>
              setConfig({
                ...config,
                fields: [
                  ...config.fields,
                  {
                    id: `q_${crypto.randomUUID().replaceAll("-", "")}`,
                    label: "New question",
                    description: "",
                    type: "text",
                    required: false,
                    choices: [],
                    step: "extra",
                  },
                ],
              })
            }
          >
            Add question
          </button>
          <h2>Event terms</h2>
          <LoreEditor
            label="Event registration terms"
            value={config.terms}
            onChange={(v) => setConfig((c) => ({ ...c, terms: v }))}
            uploadImages
            onBusyChange={setUploading}
          />
          <label>
            Confirmation instructions
            <textarea
              maxLength={2000}
              value={config.confirmation}
              onChange={(e) =>
                setConfig({ ...config, confirmation: e.target.value })
              }
            />
          </label>
        </div>
      ) : mode === "requests" ? (
        <section>
          <h2>Private registration requests</h2>
          <label>
            Search requests
            <input value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label>
            Status
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <div className="registration-table">
            <table>
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Character</th>
                  <th>Player identity</th>
                  <th>Side</th>
                  <th>Status</th>
                  <th>Sheets</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {records
                  .filter(
                    (r) =>
                      (filter === "all" || r.status === filter) &&
                      JSON.stringify(r.answers)
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map((r) => (
                    <tr key={r.id}>
                      <td>{new Date(r.submittedAt).toLocaleString()}</td>
                      <td>{String(r.answers.characterName)}</td>
                      <td>{String(r.answers.playerIdentity)}</td>
                      <td>{event.sides[r.side].name}</td>
                      <td>{r.status}</td>
                      <td>
                        {sheetState
                          ? (r.syncState ?? "pending")
                          : "Not connected"}
                      </td>
                      <td>
                        <button onClick={() => void run(() => openRecord(r))}>
                          Review request
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!records.length && <p>No requests yet.</p>}
        </section>
      ) : (
        <section className="form-stack">
          <h2>Google Sheets synchronization</h2>
          <p>
            Share your spreadsheet as Editor with{" "}
            <strong>
              merging-sun-runtime@mergingsunapp-2.iam.gserviceaccount.com
            </strong>
            . Enable the Google Sheets API in project mergingsunapp-2 if
            prompted.
          </p>
          <label>
            Spreadsheet URL
            <input
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
            />
          </label>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await call<{ tab: string }>(
                  "connectRegistrationSheet",
                  { eventId: event.id, url: sheetUrl },
                );
                setNotice(
                  `Connected. Registration rows will sync to the ${result.tab} tab.`,
                );
              })
            }
          >
            {sheetState
              ? "Reconnect and retry synchronization"
              : "Connect spreadsheet"}
          </button>
          <p>
            One-way sync: make approvals and corrections here. The app manages
            columns A–CF; place organizer notes in CG onward. Filter views are
            recommended. Requests remain safely stored if Sheets is unavailable.
          </p>
          {sheetState && (
            <a
              href={`https://docs.google.com/spreadsheets/d/${sheetState.spreadsheetId}/edit`}
              target="_blank"
              rel="noreferrer"
            >
              Open spreadsheet
            </a>
          )}
        </section>
      )}
      {selected && (
        <Modal title="Review registration" onClose={() => select(null)} wide>
          {historical ? (
            <div className="form-stack">
              <p>
                Reference: {selected.id} · Form version {selected.version} ·{" "}
                {selected.status}
              </p>
              <label>
                Assigned side
                <select
                  value={selected.side}
                  onChange={(e) =>
                    select({ ...selected, side: Number(e.target.value) })
                  }
                >
                  {event.sides.map((s, i) => (
                    <option key={i} value={i}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              {historical.fields.map((f) => (
                <label key={f.id}>
                  {f.label}
                  {f.type === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={selected.answers[f.id] === true}
                      onChange={(e) =>
                        select({
                          ...selected,
                          answers: {
                            ...selected.answers,
                            [f.id]: e.target.checked,
                          },
                        })
                      }
                    />
                  ) : f.type === "checkbox" ? (
                    <textarea
                      value={
                        Array.isArray(selected.answers[f.id])
                          ? (selected.answers[f.id] as string[]).join("\n")
                          : ""
                      }
                      onChange={(e) =>
                        select({
                          ...selected,
                          answers: {
                            ...selected.answers,
                            [f.id]: e.target.value.split("\n").filter(Boolean),
                          },
                        })
                      }
                    />
                  ) : (
                    <input
                      value={String(selected.answers[f.id] ?? "")}
                      onChange={(e) =>
                        select({
                          ...selected,
                          answers: {
                            ...selected.answers,
                            [f.id]: e.target.value,
                          },
                        })
                      }
                    />
                  )}
                </label>
              ))}
              <details>
                <summary>
                  Terms and costume guidance accepted at submission
                </summary>
                <RegistrationRichText html={historical.terms} />
                <RegistrationRichText
                  html={
                    historical.sideGuidance[
                      selected.submittedSide ?? selected.side
                    ]
                  }
                />
              </details>
              <label>
                Rejection reason
                <textarea
                  value={selected.reason}
                  onChange={(e) =>
                    select({ ...selected, reason: e.target.value })
                  }
                />
              </label>
              <p>
                Confirm only after checking payment outside the app. Save any
                corrections before confirming.
              </p>
              <div className="event-actions">
                <button
                  disabled={busy}
                  onClick={() => void run(() => review("correct"))}
                >
                  Save corrections
                </button>
                <button
                  disabled={busy || hasCorrections}
                  onClick={() => void run(() => review("confirm"))}
                >
                  Confirm after payment
                </button>
                <button
                  disabled={busy || !selected.reason.trim()}
                  onClick={() => void run(() => review("reject"))}
                >
                  Reject request
                </button>
              </div>
              {error && <p role="alert">{error}</p>}
              {selected.syncError && <p>{selected.syncError}</p>}
            </div>
          ) : (
            <p>Loading the submitted form version…</p>
          )}
        </Modal>
      )}
    </div>
  );
}
