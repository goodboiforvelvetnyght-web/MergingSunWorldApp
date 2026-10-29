import { useEffect, useState, useRef } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { call, friendlyError } from "../useWorld";
import type { World, Character } from "../../shared/world";
import type {
  WorldEvent,
  EventParticipant,
  EventProfile,
  EventLink,
} from "../../shared/events";
import { coverUrl, emblemUrl } from "../../shared/assets";
import { WorldAssetUpload } from "./WorldAssets";
import { Modal } from "./Modal";
const blank = (): WorldEvent => ({
  id: crypto.randomUUID(),
  title: "",
  kind: "major",
  date: "",
  venue: "",
  story: "",
  aftermath: "",
  locationId: null,
  published: false,
  sides: [
    { name: "Side one", artwork: null, logo: null },
    { name: "Side two", artwork: null, logo: null },
  ],
  participants: [],
  revision: 0,
});
export function Events({
  admin,
  uid,
  character,
  world,
  demo,
  onLocation,
  initialEventId,
}: {
  initialEventId?: string | null;
  admin: boolean;
  uid?: string;
  character: Character | null;
  world: World;
  demo: boolean;
  onLocation: (id: string) => void;
}) {
  const [events, setEvents] = useState<WorldEvent[]>([]),
    [selected, select] = useState<string | null>(initialEventId ?? null),
    [draft, edit] = useState<WorldEvent | null>(null),
    [participant, editParticipant] = useState<EventParticipant | null>(null),
    [links, setLinks] = useState<EventLink[]>([]),
    [profile, setProfile] = useState<EventProfile | null>(null),
    [linking, setLinking] = useState<EventParticipant | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [filter, setFilter] = useState("all"),
    [directUid, setDirectUid] = useState("");
  const event = events.find((e) => e.id === selected);
  useEffect(() => {
    if (demo) return;
    return onSnapshot(
      admin
        ? collection(db, "events")
        : query(collection(db, "events"), where("published", "==", true)),
      (s) =>
        setEvents(
          s.docs
            .map((d) => d.data() as WorldEvent)
            .sort((a, b) => b.date.localeCompare(a.date)),
        ),
      (e) => setError(friendlyError(e)),
    );
  }, [admin, demo]);
  async function refreshLinks() {
    if (selected && uid && !demo) {
      const r = await call<{ links: EventLink[] }>("getEventLinks", {
        id: selected,
      });
      setLinks(r.links);
    }
  }
  useEffect(() => {
    setLinks([]);
    if (selected && uid && !demo)
      void refreshLinks().catch((e) => setError(friendlyError(e)));
  }, [selected, uid, demo, event?.revision]);
  useEffect(() => {
    if (!selected || !uid || demo) return;
    const timer = setInterval(() => void refreshLinks().catch(() => {}), 20000);
    return () => clearInterval(timer);
  }, [selected, uid, demo]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function action(action: string, data: object = {}) {
    await call("manageEvent", { ...data, id: selected, action });
    await refreshLinks();
  }
  function participantCard(p: EventParticipant) {
    const link = links.find((l) => l.participantId === p.id);
    return (
      <article className="event-participant" key={p.id}>
        {p.linked ? (
          <LinkedParticipant
            eventId={event!.id}
            participant={p}
            onOpen={setProfile}
            onError={setError}
          />
        ) : (
          <h3>{p.characterName}</h3>
        )}
        <p>
          {p.playerIdentity} · {p.characterClass}
        </p>
        {!p.linked && character && uid && (
          <button
            disabled={busy || !!link || links.some((l) => l.uid === uid)}
            onClick={() => setLinking(p)}
          >
            {link?.status === "pending" ? "Link pending" : "Link my character"}
          </button>
        )}
        {admin && (
          <div className="event-actions">
            <button
              onClick={() => {
                editParticipant(p);
                setDirectUid("");
              }}
            >
              Edit participant
            </button>
            {link?.status === "pending" && (
              <>
                <span>Request: {link.name}</span>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(() => action("approve", { participantId: p.id }))
                  }
                >
                  Approve link
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(() => action("reject", { participantId: p.id }))
                  }
                >
                  Reject link
                </button>
              </>
            )}
          </div>
        )}
      </article>
    );
  }
  return (
    <div className="events-workspace">
      <header className="event-heading">
        <span className="eyebrow">THE CHRONICLES OF MERGING SUN</span>
        <h1>{event?.title ?? "Events"}</h1>
        <div className="event-actions">
          {event && <button onClick={() => select(null)}>All events</button>}
          {admin && (
            <button
              onClick={() => edit(event ? structuredClone(event) : blank())}
            >
              {event ? "Edit event" : "Create event"}
            </button>
          )}
        </div>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {demo && <p>Events are published by admins in the connected app.</p>}
      {!event ? (
        <>
          <label>
            Event type{" "}
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All events</option>
              <option value="major">Major events</option>
              <option value="regular">Saturday fights</option>
            </select>
          </label>
          <div className="event-list">
            {events
              .filter((e) => filter === "all" || e.kind === filter)
              .map((e) => (
                <button
                  className="event-list-card"
                  key={e.id}
                  onClick={() => select(e.id)}
                >
                  <span>
                    {e.kind === "major" ? "Major event" : "Saturday fight"}
                    {!e.published && " · Draft"}
                  </span>
                  <h2>{e.title}</h2>
                  <p>
                    {e.date} · {e.venue}
                  </p>
                </button>
              ))}
            {!events.length && <p>No events published yet.</p>}
          </div>
        </>
      ) : (
        <>
          <p className="event-meta">
            {event.date} · {event.venue}
            {!event.published && " · Draft"}
          </p>
          <p className="event-story">{event.story}</p>
          {event.locationId && (
            <button onClick={() => onLocation(event.locationId!)}>
              View on world map
            </button>
          )}
          {event.kind === "major" && (
            <>
              {admin && (
                <button
                  onClick={() => {
                    editParticipant({
                      id: crypto.randomUUID(),
                      side: 0,
                      characterName: "",
                      playerIdentity: "",
                      characterClass: "",
                      linked: false,
                    });
                    setDirectUid("");
                  }}
                >
                  Add participant
                </button>
              )}
              <div className="event-sides">
                {event.sides.map((side, index) => (
                  <section
                    className="event-side"
                    key={index}
                    style={
                      side.artwork
                        ? {
                            backgroundImage: `linear-gradient(#15282099,#152820e8),url("${coverUrl(side.artwork)}")`,
                          }
                        : undefined
                    }
                  >
                    <header>
                      {side.logo && (
                        <img
                          className="event-side-logo"
                          src={emblemUrl(side.logo)}
                          alt={`${side.name} logo`}
                        />
                      )}
                      <h2>{side.name}</h2>
                      <p>
                        {
                          event.participants.filter((p) => p.side === index)
                            .length
                        }{" "}
                        participants
                      </p>
                    </header>
                    {event.participants
                      .filter((p) => p.side === index)
                      .map(participantCard)}
                  </section>
                ))}
              </div>
            </>
          )}
          {event.aftermath && (
            <section>
              <h2>Aftermath</h2>
              <p className="event-story">{event.aftermath}</p>
            </section>
          )}
        </>
      )}
      {draft && (
        <Modal title="Edit event" onClose={() => edit(null)} wide>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await call("manageEvent", {
                  action: "save",
                  id: draft.id,
                  revision: draft.revision,
                  event: draft,
                });
                select(draft.id);
                edit(null);
              });
            }}
          >
            <label>
              Title
              <input
                required
                maxLength={160}
                value={draft.title}
                onChange={(e) => edit({ ...draft, title: e.target.value })}
              />
            </label>
            <label>
              Type
              <select
                value={draft.kind}
                onChange={(e) =>
                  edit({ ...draft, kind: e.target.value as WorldEvent["kind"] })
                }
              >
                <option value="regular">Saturday fight</option>
                <option value="major">Major event</option>
              </select>
            </label>
            <label>
              Date and time
              <input
                required
                maxLength={100}
                placeholder="Saturday 14 November, 14:00 (Bangkok)"
                value={draft.date}
                onChange={(e) => edit({ ...draft, date: e.target.value })}
              />
            </label>
            <label>
              Real-world venue
              <input
                maxLength={300}
                value={draft.venue}
                onChange={(e) => edit({ ...draft, venue: e.target.value })}
              />
            </label>
            <label>
              World map location
              <select
                value={draft.locationId ?? ""}
                onChange={(e) =>
                  edit({ ...draft, locationId: e.target.value || null })
                }
              >
                <option value="">No map location</option>
                {world.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            {(["story", "aftermath"] as const).map((field) => (
              <label key={field}>
                {field === "story" ? "Story" : "Aftermath"}
                <textarea
                  rows={7}
                  maxLength={30000}
                  value={draft[field]}
                  onChange={(e) => edit({ ...draft, [field]: e.target.value })}
                />
              </label>
            ))}
            {draft.kind === "major" &&
              draft.sides.map((s, i) => (
                <fieldset key={i} disabled={uploading}>
                  <legend>Side {i + 1}</legend>
                  <label>
                    Side name
                    <input
                      required
                      maxLength={100}
                      value={s.name}
                      onChange={(e) =>
                        edit({
                          ...draft,
                          sides: draft.sides.map((v, j) =>
                            j === i ? { ...v, name: e.target.value } : v,
                          ),
                        })
                      }
                    />
                  </label>
                  {(["artwork", "logo"] as const).map((field) => (
                    <div key={field}>
                      <h3>
                        {field === "artwork"
                          ? "Background artwork"
                          : "Custom logo"}
                      </h3>
                      {s[field] && (
                        <img
                          className="event-upload-preview"
                          src={
                            field === "artwork"
                              ? coverUrl(s[field]!)
                              : emblemUrl(s[field]!)
                          }
                          alt={`${s.name} ${field}`}
                        />
                      )}
                      <WorldAssetUpload
                        label={
                          field === "artwork" ? "Event background" : "Side logo"
                        }
                        kind={field === "artwork" ? "cover" : "emblem"}
                        value={s[field]}
                        demo={demo}
                        onBusyChange={setUploading}
                        onChange={(value) =>
                          edit((current) =>
                            current
                              ? {
                                  ...current,
                                  sides: current.sides.map((v, j) =>
                                    j === i ? { ...v, [field]: value } : v,
                                  ),
                                }
                              : current,
                          )
                        }
                      />
                    </div>
                  ))}
                </fieldset>
              ))}
            <label>
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(e) =>
                  edit({ ...draft, published: e.target.checked })
                }
              />{" "}
              Published
            </label>
            {error && <p role="alert">{error}</p>}
            <button disabled={busy || uploading || demo}>Save event</button>
          </form>
        </Modal>
      )}
      {participant && event && (
        <Modal
          title="Participant registration"
          onClose={() => editParticipant(null)}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await action("participant", {
                  ...participant,
                  participantId: participant.id,
                });
                editParticipant(null);
              });
            }}
          >
            <p>Enter the verified registration details for public display.</p>
            {(
              ["characterName", "playerIdentity", "characterClass"] as const
            ).map((field) => (
              <label key={field}>
                {
                  {
                    characterName: "Character name",
                    playerIdentity: "Public player identity",
                    characterClass: "Class",
                  }[field]
                }
                <input
                  required
                  maxLength={100}
                  value={participant[field]}
                  onChange={(e) =>
                    editParticipant({ ...participant, [field]: e.target.value })
                  }
                />
              </label>
            ))}
            <label>
              Side
              <select
                value={participant.side}
                onChange={(e) =>
                  editParticipant({
                    ...participant,
                    side: Number(e.target.value),
                  })
                }
              >
                {event.sides.map((s, i) => (
                  <option key={i} value={i}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy}>Save participant</button>
            {event.participants.some((p) => p.id === participant.id) && (
              <>
                <label>
                  Approved character account UID
                  <input
                    value={directUid}
                    onChange={(e) => setDirectUid(e.target.value)}
                  />
                </label>
                <p>
                  Link only with the participant’s agreement to share their
                  portrait and background publicly.
                </p>
                <button
                  type="button"
                  disabled={busy || !directUid}
                  onClick={() =>
                    void run(async () => {
                      await action("link", {
                        participantId: participant.id,
                        uid: directUid.trim(),
                      });
                      editParticipant(null);
                    })
                  }
                >
                  Link character directly
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await action("unlink", { participantId: participant.id });
                      editParticipant(null);
                    })
                  }
                >
                  Remove character link
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (confirm("Remove this participant from the event?"))
                      void run(async () => {
                        await action("remove", {
                          participantId: participant.id,
                        });
                        editParticipant(null);
                      });
                  }}
                >
                  Remove participant
                </button>
              </>
            )}
            {error && <p role="alert">{error}</p>}
          </form>
        </Modal>
      )}
      {linking && character && (
        <Modal title="Link my character" onClose={() => setLinking(null)}>
          <p>
            Registration: {linking.characterName} · {linking.playerIdentity} ·{" "}
            {linking.characterClass}
          </p>
          <p>
            Your character: {character.name} · {character.title}
          </p>
          <p>
            By submitting, you agree to share a copy of your character’s
            portrait and background with everyone viewing this event, regardless
            of their map position. Admin will confirm the match.
          </p>
          {error && <p role="alert">{error}</p>}
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await call("requestEventLink", {
                  id: selected,
                  participantId: linking.id,
                  consent: true,
                });
                await refreshLinks();
                setLinking(null);
              })
            }
          >
            Agree and request link
          </button>
        </Modal>
      )}
      {profile && (
        <Modal title={profile.name} onClose={() => setProfile(null)}>
          {profile.image && (
            <div className="portrait large">
              <img src={profile.image} alt={profile.name} />
            </div>
          )}
          <h3>{profile.title}</h3>
          <p className="event-story">{profile.bio}</p>
        </Modal>
      )}
    </div>
  );
}
function LinkedParticipant({
  eventId,
  participant,
  onOpen,
  onError,
}: {
  eventId: string;
  participant: EventParticipant;
  onOpen: (p: EventProfile) => void;
  onError: (e: string) => void;
}) {
  const [profile, setProfile] = useState<EventProfile | null>(null);
  const element = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" },
    );
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    void call<EventProfile>("getEventProfile", {
      id: eventId,
      participantId: participant.id,
    })
      .then((p) => {
        if (active) setProfile(p);
      })
      .catch((e) => {
        if (active) onError(friendlyError(e));
      });
    return () => {
      active = false;
    };
  }, [eventId, participant.id, visible]);
  return (
    <div className="event-linked" ref={element}>
      {profile?.image && (
        <div className="portrait">
          <img src={profile.image} alt="" />
        </div>
      )}
      <button
        className="text-button"
        disabled={!profile}
        onClick={() => profile && onOpen(profile)}
      >
        {participant.characterName}
      </button>
    </div>
  );
}
