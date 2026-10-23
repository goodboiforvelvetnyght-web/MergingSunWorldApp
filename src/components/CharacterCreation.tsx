import { useEffect, useRef, useState, type FormEvent } from "react";
import DOMPurify from "dompurify";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  Plus,
  Minus,
  Sun,
  X,
} from "lucide-react";
import { WorldMap, type MapHandle } from "./WorldMap";
import {
  characterGeneration,
  entryCost,
  hexAt,
  tileAt,
  type Character,
  type CharacterCreationData,
  type Kingdom,
  type World,
} from "../../shared/world";
import { readLocal, saveLocal, call } from "../useWorld";

type Draft = {
  name: string;
  title: string;
  bio: string;
  realName: string;
  portrait: string;
  kingdomId: string;
  locationId: string;
  step: number;
  requestId: string;
};
const prompts = [
  "Who are you?",
  "Where did your story begin?",
  "Which place did you call home?",
  "What story do you carry?",
  "Put a face to your name.",
  "Who brings this character to life?",
  "Your story begins.",
];
const noop = () => {};
export function Lore({ html }: { html: string }) {
  return (
    <article
      className="lore-content"
      dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(html, {
          USE_PROFILES: { html: true },
          FORBID_TAGS: ["style", "form", "input", "button", "iframe"],
          FORBID_ATTR: ["style", "target"],
        }),
      }}
    />
  );
}
async function resizePortrait(file: File) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error("Choose a JPEG, PNG, or WebP image under 10 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot prepare the portrait.");
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      512,
      512,
    );
    let result = canvas.toDataURL("image/jpeg", 0.8);
    if (result.length > 220000) result = canvas.toDataURL("image/jpeg", 0.55);
    if (result.length > 220000)
      throw new Error("Please choose a simpler or smaller portrait image.");
    return result;
  } finally {
    bitmap.close();
  }
}
export default function CharacterCreation({
  world,
  demo,
  scope,
  existing,
  application,
  onClose,
  onSave,
}: {
  world: World;
  demo: boolean;
  scope: string;
  existing: Character | null;
  application?: import("../../shared/world").CharacterApplication | null;
  onClose: () => void;
  onSave: (data: CharacterCreationData) => Promise<void>;
}) {
  const initialGeneration = useRef(
    existing ? characterGeneration(existing) : null,
  );
  const [storageKey] = useState(
    () =>
      `ms:creation:v3:${scope}:${initialGeneration.current ?? "new"}:${application?.status === "rejected" ? application.id : "fresh"}`,
  );
  const [draft, setDraft] = useState<Draft>(() =>
    readLocal(storageKey, {
      name:
        application?.status === "rejected" ? application.candidate.name : "",
      title:
        application?.status === "rejected" ? application.candidate.title : "",
      bio: application?.status === "rejected" ? application.candidate.bio : "",
      realName: application?.candidate.realName ?? existing?.realName ?? "",
      portrait: "",
      kingdomId:
        application?.status === "rejected"
          ? (world.locations.find(
              (l) => l.id === application.candidate.originLocationId,
            )?.kingdomId ?? "")
          : "",
      locationId:
        application?.status === "rejected"
          ? (application.candidate.originLocationId ?? "")
          : "",
      step: 0,
      requestId: crypto.randomUUID(),
    }),
  );
  const [busy, setBusy] = useState(false),
    [imageBusy, setImageBusy] = useState(false),
    [error, setError] = useState(""),
    [storageError, setStorageError] = useState(false),
    [replaceConfirmed, setReplaceConfirmed] = useState(false);
  useEffect(() => {
    if (
      application?.status !== "rejected" ||
      !application.candidate.portraitPath ||
      draft.portrait
    )
      return;
    let active = true;
    setImageBusy(true);
    void call<{ image: string }>("getCharacterPortrait", {
      uid: scope,
      application: true,
    })
      .then((r) => {
        if (active)
          setDraft((d) => (d.portrait ? d : { ...d, portrait: r.image }));
      })
      .catch(() => {
        if (active)
          setError(
            "Could not load your previous portrait. You can choose it again or skip the image.",
          );
      })
      .finally(() => {
        if (active) setImageBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const [entryId, setEntryId] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    map = useRef<MapHandle | null>(null),
    submitting = useRef(false);
  const step = Math.max(0, Math.min(6, draft.step));
  const kingdom = world.territories.find((k) => k.id === draft.kingdomId);
  const cities = world.locations.filter((l) => l.kingdomId === kingdom?.id);
  const home = cities.find((l) => l.id === draft.locationId);
  const validHome =
    !!home &&
    home.starting &&
    Number.isFinite(entryCost(tileAt(hexAt(home, world), world), world));
  const entry = home?.entries.find((e) => e.id === entryId);
  function update(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
    setError("");
  }
  useEffect(() => {
    setStorageError(!saveLocal(storageKey, draft));
  }, [draft, storageKey]);
  useEffect(() => {
    if (step === 0) nameInput.current?.focus();
    else heading.current?.focus();
    setEntryId(null);
  }, [step]);
  useEffect(() => {
    if (home && step === 2) map.current?.focus(home);
  }, [home?.id, step]);
  const ready =
    step === 0
      ? !!draft.name.trim()
      : step === 1
        ? !!kingdom
        : step === 2
          ? validHome
          : step === 5
            ? !!draft.realName.trim()
            : true;
  function chooseKingdom(k: Kingdom) {
    update({
      kingdomId: k.id,
      locationId: k.id === draft.kingdomId ? draft.locationId : "",
    });
    map.current?.focusBounds(k.points);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || imageBusy || !ready) return;
    if (step < 6) {
      update({ step: step + 1 });
      return;
    }
    if (!validHome || !draft.name.trim() || !draft.realName.trim()) {
      setError("Review your name, home city, and real name before continuing.");
      return;
    }
    if (existing && !replaceConfirmed) {
      setError("Confirm replacement of your existing character first.");
      return;
    }
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await onSave({
        name: draft.name.trim(),
        title: draft.title.trim(),
        bio: draft.bio.trim(),
        realName: draft.realName.trim(),
        portrait: draft.portrait,
        locationId: home!.id,
        requestId: draft.requestId,
        replace: initialGeneration.current !== null,
        expectedGeneration: initialGeneration.current,
        expectedApplicationId: application?.id ?? null,
      });
      localStorage.removeItem(storageKey);
      onClose();
    } catch (e) {
      setError(
        (e as Error).message ||
          "Could not save your character. Your draft is preserved.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className={`creation-flow ${step === 1 || step === 2 ? "creation-map-step" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Create your character"
    >
      <header className="creation-header">
        <span className="creation-brand">
          <Sun size={24} /> MERGING SUN
        </span>
        <span className="creation-progress">
          {step + 1} / {prompts.length}
        </span>
        <button
          className="icon-button"
          aria-label="Close character creation"
          disabled={busy}
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </header>
      <form className="creation-form" onSubmit={(e) => void submit(e)}>
        <div className="creation-stage" key={step}>
          <div className="creation-intro">
            <span className="eyebrow">
              {demo ? "A LOCAL STORY" : "A PLACE IN THE WORLD"}
            </span>
            <h1 ref={heading} tabIndex={-1}>
              {prompts[step]}
            </h1>
          </div>
          {step === 0 && (
            <div className="creation-centered">
              <label className="sr-only" htmlFor="character-name">
                Character name
              </label>
              <input
                id="character-name"
                className="dramatic-name"
                ref={nameInput}
                autoComplete="off"
                required
                maxLength={40}
                placeholder="Your character’s name"
                value={draft.name}
                onChange={(e) => update({ name: e.target.value })}
              />
              <p>Every story begins with a name.</p>
            </div>
          )}
          {(step === 1 || step === 2) && (
            <div className="creation-map-layout">
              <div className="creation-map">
                <WorldMap
                  world={{ ...world, locations: step === 2 ? cities : [] }}
                  character={null}
                  selected={null}
                  route={null}
                  grid={false}
                  terrain={false}
                  borders
                  labels
                  editor={false}
                  tool="pan"
                  draftBorder={[]}
                  onSelect={noop}
                  onLocation={(id) => update({ locationId: id })}
                  onPaint={noop}
                  onStroke={noop}
                  onPlace={noop}
                  onBorder={noop}
                  onReady={(handle) => {
                    map.current = handle;
                    if (home && step === 2) handle.focus(home);
                  }}
                  kingdomSelection
                  selectedKingdomId={kingdom?.id}
                  onKingdom={
                    step === 1
                      ? (id) => {
                          const k = world.territories.find((k) => k.id === id);
                          if (k) chooseKingdom(k);
                        }
                      : undefined
                  }
                />
                <div className="creation-map-controls">
                  <button
                    type="button"
                    aria-label="Zoom in"
                    onClick={() => map.current?.zoom(0.5)}
                  >
                    <Plus size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label="Zoom out"
                    onClick={() => map.current?.zoom(-0.5)}
                  >
                    <Minus size={18} />
                  </button>
                  <button type="button" onClick={() => map.current?.home()}>
                    Whole map
                  </button>
                </div>
              </div>
              <aside className="creation-lore" aria-label="Birthplace lore">
                <p>
                  {step === 1
                    ? "Choose a border on the map or a kingdom below. Read its story before deciding."
                    : "Choose a settlement on the map or below. Your home city is where you will enter the world."}
                </p>
                <div className="creation-choice-list">
                  {step === 1
                    ? world.territories.map((k) => (
                        <button
                          key={k.id}
                          type="button"
                          aria-pressed={k.id === kingdom?.id}
                          className={`creation-choice ${k.id === kingdom?.id ? "selected" : ""}`}
                          onClick={() => chooseKingdom(k)}
                        >
                          <span style={{ background: k.color }} />
                          {k.name}
                        </button>
                      ))
                    : cities.map((city) => (
                        <button
                          type="button"
                          key={city.id}
                          aria-pressed={city.id === home?.id}
                          className={`creation-choice ${city.id === home?.id ? "selected" : ""}`}
                          onClick={() => update({ locationId: city.id })}
                        >
                          {city.name}
                          <small>
                            {city.starting &&
                            Number.isFinite(
                              entryCost(
                                tileAt(hexAt(city, world), world),
                                world,
                              ),
                            )
                              ? "Available birthplace"
                              : "Lore only"}
                          </small>
                        </button>
                      ))}
                </div>
                {step === 1 && kingdom && (
                  <>
                    <h2>{kingdom.name}</h2>
                    <Lore
                      html={
                        kingdom.lore ||
                        "<p>This kingdom’s story is waiting to be written.</p>"
                      }
                    />
                    {!world.locations.some(
                      (l) => l.kingdomId === kingdom.id && l.starting,
                    ) && (
                      <p className="info-note">
                        This kingdom has no starting settlements yet. You can
                        explore its lore, then choose another kingdom.
                      </p>
                    )}
                  </>
                )}
                {step === 2 && home && (
                  <>
                    <h2>{home.name}</h2>
                    <p>{home.summary}</p>
                    <Lore html={home.lore} />
                    {!!home.entries.length && (
                      <div className="creation-entry-list">
                        <h3>Within {home.name}</h3>
                        {home.entries.map((e) => (
                          <button
                            type="button"
                            className="text-button"
                            key={e.id}
                            onClick={() => setEntryId(e.id)}
                          >
                            {e.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {entry && (
                      <section className="creation-entry">
                        <h3>{entry.name}</h3>
                        <Lore html={entry.lore} />
                      </section>
                    )}
                    {!validHome && (
                      <p className="info-note">
                        This place is available to read about, but it is not a
                        starting settlement.
                      </p>
                    )}
                  </>
                )}
                {!(step === 1 ? world.territories.length : cities.length) && (
                  <p className="info-note">
                    No {step === 1 ? "kingdoms" : "settlements"} are available
                    yet.
                  </p>
                )}
              </aside>
            </div>
          )}
          {step === 3 && (
            <div className="creation-writing">
              <p>
                Who raised you? What did you leave behind? What are you
                searching for?
              </p>
              <label>
                Backstory
                <textarea
                  aria-label="Backstory"
                  rows={8}
                  maxLength={1500}
                  value={draft.bio}
                  onChange={(e) => update({ bio: e.target.value })}
                  placeholder="Your story is yours to tell. You can keep it short."
                />
              </label>
              <small>{draft.bio.length} / 1500</small>
              <label>
                Title or calling <span className="optional">optional</span>
                <input
                  maxLength={60}
                  value={draft.title}
                  onChange={(e) => update({ title: e.target.value })}
                  placeholder="Wanderer, herbalist, keeper of stories…"
                />
              </label>
            </div>
          )}
          {step === 4 && (
            <div className="creation-centered">
              <div className="creation-portrait">
                {draft.portrait ? (
                  <img src={draft.portrait} alt="Character portrait preview" />
                ) : (
                  <Sun size={80} strokeWidth={1} />
                )}
              </div>
              <label className="portrait-upload">
                Choose a portrait
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={imageBusy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setImageBusy(true);
                    setError("");
                    try {
                      update({ portrait: await resizePortrait(file) });
                    } catch (err) {
                      setError(
                        (err as Error).message || "Could not read this image.",
                      );
                    } finally {
                      setImageBusy(false);
                      e.target.value = "";
                    }
                  }}
                />
              </label>
              {imageBusy && <p role="status">Preparing portrait…</p>}
              {draft.portrait && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => update({ portrait: "" })}
                >
                  Remove portrait
                </button>
              )}
              <p>
                Optional. You can enter the world with a sun emblem instead.
              </p>
            </div>
          )}
          {step === 5 && (
            <div className="creation-centered">
              <label htmlFor="player-name">Your real name</label>
              <input
                id="player-name"
                className="dramatic-name"
                required
                autoComplete="name"
                maxLength={100}
                value={draft.realName}
                onChange={(e) => update({ realName: e.target.value })}
                placeholder="The player behind the character"
              />
              <p>
                Your real name is visible only to you and the admins. Other
                players see your character’s name.
              </p>
            </div>
          )}
          {step === 6 && (
            <div className="creation-review">
              <div className="creation-portrait">
                {draft.portrait ? (
                  <img src={draft.portrait} alt={`${draft.name} portrait`} />
                ) : (
                  <Sun size={70} strokeWidth={1} />
                )}
              </div>
              <h2>{draft.name}</h2>
              {draft.title && <p>{draft.title}</p>}
              <p>
                Born in <strong>{home?.name ?? "Choose your home city"}</strong>{" "}
                · {kingdom?.name}
              </p>
              <p className="creation-backstory">
                {draft.bio || "Your story is still being written."}
              </p>
              <p className="private-name">
                Player: {draft.realName} · Visible only to you and admins
              </p>
              <p>
                {demo
                  ? "You will start"
                  : "After admin approval, you will start"}{" "}
                in {home?.name ?? "your home city"} with 100 energy.
              </p>
              {existing && (
                <label className="replacement-confirm">
                  <input
                    type="checkbox"
                    checked={replaceConfirmed}
                    onChange={(e) => setReplaceConfirmed(e.target.checked)}
                  />
                  Replace {existing.name} with this character. The new story
                  starts at its home city with 100 energy and an empty journey
                  history. Your current character stays active until{" "}
                  {demo ? "you confirm" : "an admin approves this replacement"}.
                </label>
              )}
            </div>
          )}
        </div>
        <footer className="creation-footer">
          {step > 0 ? (
            <button
              type="button"
              className="button secondary"
              disabled={busy || imageBusy}
              onClick={() => update({ step: step - 1 })}
            >
              <ArrowLeft size={16} />
              Back
            </button>
          ) : (
            <span />
          )}
          <span className="creation-draft-note">
            {storageError
              ? "Draft could not be saved on this device."
              : "Draft saved on this device"}
          </span>
          <button
            className="button primary"
            disabled={
              busy ||
              imageBusy ||
              !ready ||
              (step === 6 &&
                (!validHome ||
                  !draft.name.trim() ||
                  !draft.realName.trim() ||
                  (!!existing && !replaceConfirmed)))
            }
          >
            {busy ? (
              <LoaderCircle size={18} className="spin" />
            ) : step === 6 ? (
              <Check size={18} />
            ) : null}
            {step === 6
              ? demo
                ? "Enter the world"
                : "Submit for review"
              : step === 4 && !draft.portrait
                ? "Skip for now"
                : "Continue"}
            {step < 6 && <ArrowRight size={16} />}
          </button>
        </footer>
        {error && (
          <p className="creation-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
