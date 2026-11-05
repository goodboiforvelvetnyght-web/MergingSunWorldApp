import { memo, useEffect, useState } from "react";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";
import "survey-core/survey-core.min.css";
import DOMPurify from "dompurify";
import type { WorldEvent } from "../../shared/events";
import {
  type RegistrationConfig,
  registrationSurvey,
  cleanRegistrationAnswers,
} from "../../shared/registration";
import { coverUrl, emblemUrl } from "../../shared/assets";
import { call, friendlyError } from "../useWorld";
export function RegistrationRichText({ html }: { html: string }) {
  return (
    <div
      className="registration-rich"
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
    />
  );
}
const RegistrationSurvey = memo(Survey);
export function RegistrationJourney({
  event,
  config: liveConfig,
  preview = false,
  onClose,
}: {
  event: WorldEvent;
  config: RegistrationConfig;
  preview?: boolean;
  onClose: () => void;
}) {
  // Freeze the published form for this journey; snapshots must not overwrite active input.
  const [config] = useState(liveConfig);
  const versionChanged = liveConfig.version !== config.version;
  const storageKey = `ms:registration:${event.id}:${config.version}`;
  const [initial] = useState(() => {
    try {
      return !preview
        ? JSON.parse(sessionStorage.getItem(storageKey) ?? "null")
        : null;
    } catch {
      return null;
    }
  });
  const [step, setStep] = useState<
      "opening" | "side" | "guidance" | "form" | "review" | "done"
    >("opening"),
    [side, setSide] = useState<number | null>(initial?.side ?? null),
    [answers, setAnswers] = useState<Record<string, unknown>>(
      initial?.answers ?? {},
    ),
    [colors, setColors] = useState(false),
    [terms, setTerms] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reference, setReference] = useState("");
  const [requestId] = useState(initial?.requestId ?? crypto.randomUUID());
  useEffect(() => {
    if (preview || step === "done") return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ side, answers, requestId }),
      );
    } catch {}
  }, [storageKey, side, answers, requestId, step, preview]);
  const [model] = useState(() => {
    const m = new Model(registrationSurvey(config));
    m.textUpdateMode = "onTyping";
    m.data = initial?.answers ?? {};
    m.onTextMarkdown.add((_, options) => {
      options.html = DOMPurify.sanitize(options.text);
    });
    m.onValueChanged.add((sender) => setAnswers({ ...sender.data }));
    m.onCompleting.add((sender, options) => {
      options.allowComplete = false;
      try {
        setAnswers(cleanRegistrationAnswers(config, sender.data));
        setError("");
        setStep("review");
      } catch (e) {
        setError((e as Error).message);
      }
    });
    return m;
  });
  const selected = side === null ? null : event.sides[side];
  async function submit() {
    if (versionChanged) return;
    setBusy(true);
    setError("");
    try {
      if (preview) {
        setReference("PREVIEW");
        setStep("done");
        return;
      }
      const result = await call<{ reference: string }>(
        "submitEventRegistration",
        {
          eventId: event.id,
          version: config.version,
          requestId,
          side,
          answers,
          acceptedTerms: terms,
          acceptedColors: colors,
        },
      );
      setReference(result.reference);
      try {
        sessionStorage.removeItem(storageKey);
      } catch {}
      setStep("done");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main
      className="registration-journey"
      style={{
        backgroundImage: `linear-gradient(#10251f99,#10251fcc),url("${selected?.artwork ? coverUrl(selected.artwork) : "/brand/background.webp"}")`,
      }}
    >
      <nav>
        <button onClick={onClose}>
          {preview ? "Close preview" : "Back to event"}
        </button>
        <span>
          {event.title}
          {preview ? " · PREVIEW" : ""}
        </span>
      </nav>
      {versionChanged && step !== "done" && (
        <section className="registration-error" role="alert">
          <p>
            The organizer published an updated registration form. Your current
            answers are preserved. Review the updated form and terms before
            submitting.
          </p>
          <button
            disabled={busy}
            onClick={() => {
              try {
                sessionStorage.setItem(
                  `ms:registration:${event.id}:${liveConfig.version}`,
                  JSON.stringify({ side, answers: model.data, requestId }),
                );
              } catch {
                setError(
                  "Could not preserve your answers for reloading. Copy your answers before refreshing this page.",
                );
                return;
              }
              window.location.reload();
            }}
          >
            Review updated form
          </button>
        </section>
      )}
      {step === "opening" ? (
        <section className="registration-opening">
          <img src="/brand/merging-sun-logo.png" alt="Merging Sun" />
          <h1>{event.title}</h1>
          <RegistrationRichText html={config.introduction} />
          {!config.open && !preview ? (
            <p>Registration is currently closed.</p>
          ) : (
            <button
              className="registration-primary"
              onClick={() => setStep("side")}
            >
              Click to begin
            </button>
          )}
          <p>No account required. Your request does not reserve a place.</p>
        </section>
      ) : step === "side" ? (
        <section>
          <h1>Choose your side</h1>
          <div className="registration-side-choices">
            {event.sides.map((s, i) => (
              <button
                key={i}
                onClick={() => {
                  setSide(i);
                  setColors(false);
                  setStep("guidance");
                }}
                style={
                  s.artwork
                    ? {
                        backgroundImage: `linear-gradient(#10251f66,#10251fcc),url("${coverUrl(s.artwork)}")`,
                      }
                    : undefined
                }
              >
                {s.logo && <img src={emblemUrl(s.logo)} alt="" />}
                <h2>{s.name}</h2>
              </button>
            ))}
          </div>
        </section>
      ) : step === "guidance" ? (
        <section className="registration-panel">
          {selected?.logo && (
            <img
              className="registration-logo"
              src={emblemUrl(selected.logo)}
              alt={selected.name}
            />
          )}
          <h1>{selected?.name}</h1>
          <RegistrationRichText html={config.sideGuidance[side!]} />
          <label className="registration-check">
            <input
              type="checkbox"
              checked={colors}
              onChange={(e) => setColors(e.target.checked)}
            />
            I understand and will follow this side’s costume color requirements.
          </label>
          <div className="event-actions">
            <button onClick={() => setStep("side")}>Back to sides</button>
            <button disabled={!colors} onClick={() => setStep("form")}>
              Continue to registration
            </button>
          </div>
        </section>
      ) : step === "form" ? (
        <section className="registration-panel registration-form">
          <p className="registration-progress">
            {selected?.name} · Registration details
          </p>
          <RegistrationSurvey model={model} />
          <button onClick={() => setStep("guidance")}>
            Back to side guidance
          </button>
        </section>
      ) : step === "review" ? (
        <section className="registration-panel">
          <h1>Review your request</h1>
          <h2>{selected?.name}</h2>
          <dl>
            {config.fields.map((f) => (
              <div key={f.id}>
                <dt>{f.label}</dt>
                <dd>
                  {Array.isArray(answers[f.id])
                    ? (answers[f.id] as string[]).join(", ")
                    : String(answers[f.id] ?? "—")}
                </dd>
              </div>
            ))}
          </dl>
          <h2>Event terms</h2>
          <RegistrationRichText html={config.terms} />
          <label className="registration-check">
            <input
              type="checkbox"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
            />
            I accept the event terms and understand that confirmation requires
            payment verification outside the app.
          </label>
          <div className="event-actions">
            <button disabled={busy} onClick={() => setStep("form")}>
              Edit answers
            </button>
            <button
              disabled={busy || !terms || !colors || versionChanged}
              onClick={() => void submit()}
            >
              {busy ? "Submitting…" : "Submit registration request"}
            </button>
          </div>
        </section>
      ) : (
        <section className="registration-panel">
          <h1>Registration received</h1>
          <p>{config.confirmation}</p>
          <p>
            Your place is not reserved or confirmed until an organizer verifies
            payment outside the app.
          </p>
          <p>
            Reference: <strong>{reference}</strong>
          </p>
          <button onClick={onClose}>Return to event</button>
        </section>
      )}
      {error && (
        <p className="registration-error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
