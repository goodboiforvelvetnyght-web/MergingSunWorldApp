import { useState, useEffect } from "react";
import { ArrowLeft, DoorOpen, BookOpen, MapPin, Users } from "lucide-react";
import DOMPurify from "dompurify";
import {
  internalLocations,
  enteredSettlement,
  physicalSettlement,
  type World,
  type Character,
  type Location,
} from "../../shared/world";
import { LocationOccupancy } from "./LocationOccupancy";

export function CityView({
  location,
  world,
  character,
  demo,
  population,
  busy,
  onBack,
  onEnter,
  onLeave,
  onCharacter,
}: {
  location: Location;
  world: World;
  character: Character | null;
  demo: boolean;
  population: number;
  busy: boolean;
  onBack: () => void;
  onEnter: () => void;
  onLeave: () => void;
  onCharacter: (c: Character) => void;
}) {
  const inside =
    !!character && enteredSettlement(character, world) === location.id;
  const otherCity =
    !!character && !!enteredSettlement(character, world) && !inside;
  const atHex =
    !!character &&
    physicalSettlement(
      { ...character, currentLocationId: location.id },
      world,
    ) === location.id;
  const [entryId, setEntryId] = useState<string | null>(
    inside ? (character?.internalLocationId ?? null) : null,
  );
  useEffect(() => {
    setEntryId(inside ? (character?.internalLocationId ?? null) : null);
  }, [location.id, inside, character?.internalLocationId]);
  const entries = internalLocations(location),
    entry = entries.find((e) => e.id === entryId);
  const kingdom = world.territories.find((k) => k.id === location.kingdomId);
  const lore = entry?.lore ?? location.lore;
  return (
    <section className="city-page" aria-label={`${location.name} city view`}>
      <header className="city-page-header">
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={17} />
          Back to map
        </button>
        <span className={`city-presence ${inside ? "inside" : ""}`}>
          <MapPin size={14} />
          {inside
            ? `Inside ${location.name}`
            : atHex
              ? "Outside the city · on its hex"
              : "Reading city lore"}
        </span>
      </header>
      <div className="city-heading">
        <span className="eyebrow">
          {kingdom?.name ?? "Independent settlement"} · {location.kind}
        </span>
        <h1>{location.name}</h1>
        <p>{location.summary}</p>
        <div className="city-heading-actions">
          {inside ? (
            <button
              className="button secondary"
              disabled={busy}
              onClick={onLeave}
            >
              <DoorOpen size={17} />
              {busy ? "Leaving…" : "Leave city"}
            </button>
          ) : (
            <button
              className="button primary"
              disabled={!atHex || otherCity || busy}
              onClick={onEnter}
            >
              {busy ? "Entering…" : "Enter city"}
            </button>
          )}
          <span className="fine-print">
            {inside
              ? "Back to map keeps your character here."
              : otherCity
                ? "Leave your current city before entering another."
                : atHex
                  ? "Entering costs no energy."
                  : "Travel to this city's hex to enter."}
          </span>
        </div>
      </div>
      <div className="city-body">
        <nav className="city-locations" aria-label="City locations">
          <button
            className={`city-place-button ${!entry ? "selected" : ""}`}
            onClick={() => setEntryId(null)}
          >
            <BookOpen size={18} />
            <span>
              About {location.name}
              <small>History and lore</small>
            </span>
          </button>
          <h2>Within the city</h2>
          {entries.map((e) => (
            <button
              key={e.id}
              className={`city-place-button ${entry?.id === e.id ? "selected" : ""}`}
              onClick={() => setEntryId(e.id)}
            >
              <MapPin size={18} />
              <span>
                {e.name}
                <small>
                  {inside && character?.internalLocationId === e.id
                    ? "You are here"
                    : e.summary}
                </small>
              </span>
            </button>
          ))}
          {!demo && (
            <p className="fine-print">
              <Users size={14} /> {population} characters inside · includes
              offline players
            </p>
          )}
        </nav>
        <div className="city-content">
          <span className="eyebrow">
            {entry ? "INTERNAL LOCATION" : "CITY ENCYCLOPEDIA"}
          </span>
          <h2>{entry?.name ?? `The story of ${location.name}`}</h2>
          {entry && <p className="city-entry-summary">{entry.summary}</p>}
          <article
            className="lore-content"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(lore, {
                USE_PROFILES: { html: true },
                FORBID_TAGS: ["style", "form", "input", "button", "iframe"],
                FORBID_ATTR: ["style", "target"],
              }),
            }}
          />
          {entry && (
            <LocationOccupancy
              key={`${location.id}:${entry.id}`}
              location={location}
              entry={entry}
              character={character}
              world={world}
              demo={demo}
              onEnter={onCharacter}
            />
          )}
        </div>
      </div>
    </section>
  );
}
