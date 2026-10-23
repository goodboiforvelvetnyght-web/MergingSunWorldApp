import { useEffect, useState } from "react";
import { call, friendlyError } from "../useWorld";
import {
  characterGeneration,
  physicalSettlement,
  enteredSettlement,
  type World,
  type Character,
  type PublicCharacter,
  type Location,
  type PlaceEntry,
} from "../../shared/world";
import { CharacterPortrait } from "./CharacterReview";
export function LocationOccupancy({
  location,
  entry,
  character,
  world,
  demo,
  onEnter,
}: {
  location: Location;
  entry: PlaceEntry;
  character: Character | null;
  world: World;
  demo: boolean;
  onEnter: (c: Character) => void;
}) {
  const [people, setPeople] = useState<PublicCharacter[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<PublicCharacter | null>(null);
  const here =
    character?.currentLocationId === location.id &&
    character?.internalLocationId === entry.id &&
    physicalSettlement(character, world) === location.id;
  const sameHex =
    !!character &&
    physicalSettlement(
      { ...character, currentLocationId: location.id },
      world,
    ) === location.id;
  const insideCity =
    !!character && enteredSettlement(character, world) === location.id;
  useEffect(() => {
    setPeople([]);
    setSelected(null);
    setError("");
    if (!here || demo) return;
    let active = true;
    const load = () =>
      void call<PublicCharacter[]>("getRoomCharacters", {})
        .then((r) => {
          if (active) {
            setPeople(r);
            setError("");
            setSelected((s) => (s && r.find((p) => p.uid === s.uid)) || null);
          }
        })
        .catch((e) => {
          if (active) {
            setError(friendlyError(e));
            setPeople([]);
            setSelected(null);
          }
        });
    load();
    const t = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [
    here,
    demo,
    character?.internalLocationId,
    character?.incarnationId,
    world.version,
    location.id,
    entry.id,
  ]);
  return (
    <section className="occupancy-panel form-stack">
      <h3>{here ? "You are here" : "Visit this location"}</h3>
      {!here && (
        <>
          <p>
            {sameHex
              ? insideCity
                ? "Enter to meet the people staying here."
                : "Enter the city before visiting this internal location."
              : "Travel to this settlement's hex before entering."}
          </p>
          <button
            className="button primary"
            disabled={!sameHex || !insideCity || busy}
            onClick={async () => {
              if (!character) return;
              setBusy(true);
              setError("");
              try {
                onEnter(
                  demo
                    ? {
                        ...character,
                        currentLocationId: location.id,
                        internalLocationId: entry.id,
                      }
                    : await call<Character>("enterLocation", {
                        locationId: location.id,
                        internalLocationId: entry.id,
                        generation: characterGeneration(character),
                        worldVersion: world.version,
                      }),
                );
              } catch (e) {
                setError(friendlyError(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Enter {entry.name}
          </button>
        </>
      )}
      {here && (
        <>
          <p className="fine-print">
            Characters here include players who are offline. Profiles are
            available while you share this internal location.
          </p>
          {!people.length && (
            <p>
              {demo
                ? "Other travelers appear when you sign in."
                : "No other characters here."}
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
        </>
      )}
      {here && selected && (
        <article className="review-card">
          <button className="text-button" onClick={() => setSelected(null)}>
            Close profile
          </button>
          {selected.hasPortrait && (
            <div className="portrait large">
              <CharacterPortrait
                uid={selected.uid}
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
    </section>
  );
}
