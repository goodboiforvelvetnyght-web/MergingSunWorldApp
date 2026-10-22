import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { call, friendlyError } from "../useWorld";
import type { CharacterApplication, World } from "../../shared/world";
export function CharacterPortrait({
  uid,
  version,
  application = false,
  alt,
}: {
  uid: string;
  version?: string;
  application?: boolean;
  alt: string;
}) {
  const [image, setImage] = useState("");
  useEffect(() => {
    let active = true;
    setImage("");
    void call<{ image: string }>("getCharacterPortrait", { uid, application })
      .then((r) => {
        if (active) setImage(r.image);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [uid, version, application]);
  return image ? <img src={image} alt={alt} /> : null;
}
export function CharacterReview({ world }: { world: World }) {
  const [queue, setQueue] = useState<
      (CharacterApplication & { uid: string })[]
    >([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState<Record<string, string>>({}),
    [message, setMessage] = useState("");
  useEffect(
    () =>
      onSnapshot(
        query(
          collection(db, "characterApplications"),
          where("status", "==", "pending"),
        ),
        (s) =>
          setQueue(
            s.docs
              .map((d) => ({
                ...(d.data() as CharacterApplication),
                uid: d.id,
              }))
              .sort((a, b) => a.submittedAt - b.submittedAt),
          ),
        (e) => setError(friendlyError(e)),
      ),
    [],
  );
  async function review(uid: string, id: string, decision: string) {
    setBusy(true);
    setError("");
    try {
      await call("reviewCharacter", {
        uid,
        applicationId: id,
        decision,
        reason: reason[id] ?? "",
      });
      setMessage(
        decision === "approved"
          ? "Character approved."
          : "Character rejected; the player can read your reason and resubmit.",
      );
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    void call<{ migrated: number }>("migrateLegacyPortraits", {})
      .then((r) => {
        if (active && r.migrated)
          setMessage(
            `${r.migrated} existing portraits moved to private image storage.`,
          );
      })
      .catch((e) => {
        if (active) setError(friendlyError(e));
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <details className="review-queue">
      <summary>Character reviews ({queue.length})</summary>
      <p className="fine-print">
        Review each new story before it enters the world. Existing active
        characters remain available while replacements await review.
      </p>
      {queue.map((a) => (
        <article className="review-card form-stack" key={a.id}>
          <div className="portrait large">
            <CharacterPortrait
              uid={a.uid}
              application
              version={a.id}
              alt={`${a.candidate.name} portrait`}
            />
          </div>
          <h3>{a.candidate.name}</h3>
          <p>{a.candidate.title}</p>
          <p className="backstory-text">
            {a.candidate.bio || "No backstory provided."}
          </p>
          <p>Player: {a.candidate.realName}</p>
          <p className="fine-print">
            Starting settlement:{" "}
            {world.locations.find((l) => l.id === a.candidate.originLocationId)
              ?.name ?? "Deleted settlement"}{" "}
            ·{" "}
            {a.expectedGeneration ? "Replacement character" : "First character"}
          </p>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void review(a.uid, a.id, "approved")}
          >
            Approve {a.candidate.name}
          </button>
          <label>
            Rejection reason
            <textarea
              maxLength={2000}
              value={reason[a.id] ?? ""}
              onChange={(e) => setReason({ ...reason, [a.id]: e.target.value })}
            />
          </label>
          <button
            className="button secondary danger"
            disabled={busy || !reason[a.id]?.trim()}
            onClick={() => void review(a.uid, a.id, "rejected")}
          >
            Reject with reason
          </button>
        </article>
      ))}
      {!queue.length && <p>No characters awaiting review.</p>}
      <button
        className="text-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const r = await call<{ migrated: number }>(
              "migrateLegacyPortraits",
              {},
            );
            setMessage(
              `${r.migrated} existing portraits moved to private Storage.`,
            );
          } catch (e) {
            setError(friendlyError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Move existing portraits to Storage
      </button>
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
