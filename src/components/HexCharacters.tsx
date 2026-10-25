import { useEffect, useState } from "react";
import { call, friendlyError } from "../useWorld";
import {
  characterGeneration,
  key,
  hexAt,
  type World,
  type Character,
  type PublicCharacter,
} from "../../shared/world";
import { CharacterPortrait } from "./CharacterReview";
export function HexCharacters({
  world,
  character,
  hexKey,
  demo,
}: {
  world: World;
  character: Character | null;
  hexKey: string;
  demo: boolean;
}) {
  const [people, setPeople] = useState<PublicCharacter[]>([]),
    [selected, setSelected] = useState<PublicCharacter | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [refresh, setRefresh] = useState(0);
  const ownHex = character ? key(hexAt(character, world)) : null;
  const allowed = ownHex === hexKey;
  const generation = character ? characterGeneration(character) : null;
  useEffect(() => {
    setPeople([]);
    setSelected(null);
    setError("");
    if (!allowed || !character || demo) return;
    let active = true;
    setLoading(true);
    const load = () =>
      void call<PublicCharacter[]>("getHexCharacters", {
        hexKey,
        worldVersion: world.version,
        generation,
      })
        .then((r) => {
          if (active) {
            setPeople(r);
            setSelected((s) =>
              s ? (r.find((p) => p.uid === s.uid) ?? null) : null,
            );
            setError("");
          }
        })
        .catch((e) => {
          if (active) {
            setPeople([]);
            setSelected(null);
            setError(friendlyError(e));
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    load();
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [allowed, hexKey, ownHex, generation, world.version, demo, refresh]);
  return (
    <section
      className="hex-characters form-stack"
      aria-label="Characters on this hex"
    >
      <h3>Characters here</h3>
      <p className="fine-print">
        Includes offline characters, inside and outside cities. Profiles are
        available while you share this hex.
      </p>
      {!allowed ? (
        <p>
          Your character must be on this hex to read its character profiles.
        </p>
      ) : (
        <>
          {loading && <p role="status">Loading characters…</p>}
          {!loading && !people.length && (
            <p>
              {demo
                ? "Other characters appear when you sign in."
                : "No other characters on this hex."}
            </p>
          )}
          {people.map((p) => (
            <button
              className="kingdom-card"
              key={p.uid}
              onClick={() => setSelected(p)}
            >
              <strong>{p.name}</strong>
              <small>{p.title}</small>
            </button>
          ))}
          {!demo && (
            <button
              className="text-button"
              onClick={() => setRefresh((n) => n + 1)}
            >
              Refresh characters
            </button>
          )}
          {selected && (
            <article className="review-card">
              <button className="text-button" onClick={() => setSelected(null)}>
                Close profile
              </button>
              {selected.hasPortrait && (
                <div className="portrait large">
                  <CharacterPortrait
                    uid={selected.uid}
                    version={`${generation}:${world.version}:${refresh}`}
                    alt={`${selected.name} portrait`}
                  />
                </div>
              )}
              <h3>{selected.name}</h3>
              <p>{selected.title}</p>
              <p className="backstory-text">{selected.bio}</p>
              <p className="fine-print">
                Origin:{" "}
                {world.locations.find((l) => l.id === selected.originLocationId)
                  ?.name ?? "Unknown"}
              </p>
            </article>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
