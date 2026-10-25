import { HexCharacters } from "./HexCharacters";
import { useState } from "react";
import { call, friendlyError } from "../useWorld";
import {
  characterGeneration,
  key,
  hexAt,
  physicalSettlement,
  enteredSettlement,
  type World,
  type Character,
  type Location,
  type PlaceEntry,
} from "../../shared/world";
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
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
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
  return (
    <section className="occupancy-panel form-stack">
      <h3>{here ? "You are here" : "Visit this location"}</h3>
      {!here && (
        <>
          <p>
            {sameHex
              ? insideCity
                ? "Enter to stay at this internal location."
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
      {sameHex && (
        <HexCharacters
          world={world}
          character={character}
          hexKey={key(hexAt(location, world))}
          demo={demo}
        />
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
