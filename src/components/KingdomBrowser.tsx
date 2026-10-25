import { useState } from "react";
import DOMPurify from "dompurify";
import {
  ChevronRight,
  Castle,
  Home,
  MapPin,
  Search,
  BookOpen,
} from "lucide-react";
import {
  internalLocations,
  type World,
  type Location,
  type Kingdom,
  type PlaceEntry,
} from "../../shared/world";
import { emblemUrl } from "../../shared/assets";
const icons = { city: Castle, town: Home, village: Home, landmark: MapPin };
export function KingdomBrowser({
  world,
  query,
  filter,
  lore,
  selectedId,
  onLocation,
  onEntry,
  onKingdom,
  onClear,
}: {
  world: World;
  query: string;
  filter: string;
  lore: boolean;
  selectedId: string | null;
  onLocation: (l: Location) => void;
  onEntry: (e: PlaceEntry) => void;
  onKingdom: (k: Kingdom) => void;
  onClear: () => void;
}) {
  const [selection, setSelection] = useState<string | null>(null);
  const searching = !!query.trim();
  const kingdom = world.territories.find((k) => k.id === selection);
  const matches = (l: Location) =>
    (filter === "all" || l.kind === filter) &&
    (!searching ||
      `${l.name} ${l.region} ${l.summary} ${world.territories.find((k) => k.id === l.kingdomId)?.name ?? ""} ${
        lore
          ? internalLocations(l)
              .map((e) => `${e.name} ${e.summary}`)
              .join(" ")
          : ""
      }`
        .toLowerCase()
        .includes(query.trim().toLowerCase()));
  const visibleKingdoms = world.territories.filter(
    (k) =>
      (searching || selection === "all" || !kingdom || k.id === kingdom.id) &&
      world.locations.some((l) => l.kingdomId === k.id && matches(l)),
  );
  const overview =
    !searching && filter === "all" && !kingdom && selection !== "all";
  const choose = (k: Kingdom) => {
    setSelection(k.id);
    onKingdom(k);
  };
  return (
    <section
      className="kingdom-browser"
      aria-label={lore ? "Lore by kingdom" : "Atlas by kingdom"}
    >
      <div className="browse-controls">
        <button
          className={`text-button ${overview ? "active" : ""}`}
          onClick={() => {
            setSelection(null);
            onClear();
          }}
        >
          Kingdoms
        </button>
        <button
          aria-label="Browse all places"
          className={`text-button ${selection === "all" ? "active" : ""}`}
          onClick={() => {
            setSelection("all");
            onClear();
          }}
        >
          All places
        </button>
      </div>
      {overview ? (
        <>
          <div className="list-heading">
            <span>KINGDOMS TO DISCOVER</span>
            <span>{world.territories.length} kingdoms</span>
          </div>
          <div className="kingdom-browse-list">
            {world.territories.map((k) => (
              <button
                className="browse-kingdom-card"
                key={k.id}
                onClick={() => choose(k)}
              >
                {k.emblemAssetId && (
                  <img src={emblemUrl(k.emblemAssetId)} alt="" />
                )}
                <span>
                  <strong>{k.name}</strong>
                  <small>
                    {world.locations.filter((l) => l.kingdomId === k.id).length}{" "}
                    places
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
          {!world.territories.length && (
            <p>No kingdoms have been published yet.</p>
          )}
        </>
      ) : (
        <>
          {kingdom && !searching && filter === "all" && (
            <div className="browse-kingdom-intro">
              <h2>{kingdom.name}</h2>
              {lore && (
                <article
                  className="lore-content"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(kingdom.lore, {
                      USE_PROFILES: { html: true },
                      FORBID_TAGS: [
                        "style",
                        "form",
                        "input",
                        "button",
                        "iframe",
                      ],
                      FORBID_ATTR: ["style", "target"],
                    }),
                  }}
                />
              )}
            </div>
          )}
          {visibleKingdoms.map((k) => (
            <div key={k.id} className="browse-kingdom-group">
              {(!kingdom ||
                searching ||
                selection === "all" ||
                filter !== "all") && <h3>{k.name}</h3>}
              <div className="place-list">
                {world.locations
                  .filter((l) => l.kingdomId === k.id && matches(l))
                  .map((l) => {
                    const Icon = icons[l.kind];
                    return (
                      <div key={l.id}>
                        <button
                          className={`place-item ${selectedId === l.id ? "selected" : ""}`}
                          onClick={() => onLocation(l)}
                        >
                          <span className={`place-icon ${l.kind}`}>
                            <Icon size={20} />
                          </span>
                          <span className="place-copy">
                            <strong>{l.name}</strong>
                            <small>{l.summary || l.kind}</small>
                          </span>
                          <ChevronRight size={16} />
                        </button>
                        {lore && (
                          <div className="browse-entries">
                            {internalLocations(l).map((e) => (
                              <button
                                className="text-button"
                                key={e.id}
                                onClick={() => onEntry(e)}
                              >
                                <BookOpen size={14} />
                                {e.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
          {!visibleKingdoms.length && (
            <div className="empty-state">
              <Search size={25} />
              <p>No places found.</p>
              <button className="text-button" onClick={onClear}>
                Clear filters
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
