import { WorldAssetUpload } from "./WorldAssets";
import { emblemUrl } from "../../shared/assets";
import { lazy, Suspense, useState } from "react";
import {
  Castle,
  ChevronRight,
  Flag,
  MapPin,
  Plus,
  BookOpen,
} from "lucide-react";
import DOMPurify from "dompurify";
import {
  removeKingdom,
  type World,
  type Kingdom,
  type Location,
  type PlaceEntry,
  type Point,
} from "../../shared/world";
import { Modal } from "./Modal";
const LoreEditor = lazy(() =>
  import("./LoreEditor").then((m) => ({ default: m.LoreEditor })),
);
const EntryForm = lazy(() => import("./EntryForm"));

export function PlacesEditor({
  world,
  demo = false,
  onChange,
  onEditSettlement,
  onAddSettlement,
  onFocus,
  kingdomEdit,
  onEditKingdom,
  onKingdomChange,
  borderPoints,
  onBorderPoints,
  drawing,
  onDraw,
  onSaveKingdom,
  onCancelKingdom,
}: {
  world: World;
  demo?: boolean;
  onChange: (w: World) => void;
  onEditSettlement: (l: Location) => void;
  onAddSettlement: (kingdomId: string) => void;
  onFocus: (l: Location) => void;
  kingdomEdit: Kingdom | null;
  onEditKingdom: (k: Kingdom) => void;
  onKingdomChange: (k: Kingdom) => void;
  borderPoints: Point[];
  onBorderPoints: (p: Point[]) => void;
  drawing: boolean;
  onDraw: () => void;
  onSaveKingdom: () => void;
  onCancelKingdom: () => void;
}) {
  const [kingdomId, setKingdomId] = useState<string | null>(null);
  const [settlementId, setSettlementId] = useState<string | null>(null);
  const [entryEdit, setEntryEdit] = useState<PlaceEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const kingdom = world.territories.find((k) => k.id === kingdomId);
  const settlement = world.locations.find(
    (l) => l.id === settlementId && l.kingdomId === kingdom?.id,
  );
  const settlements = world.locations.filter((l) => l.kingdomId === kingdomId);
  const unassigned = world.locations.filter((l) => !l.kingdomId);
  function updateEntries(entries: PlaceEntry[]) {
    if (!settlement) return;
    onChange({
      ...world,
      locations: world.locations.map((l) =>
        l.id === settlement.id ? { ...l, entries } : l,
      ),
    });
  }
  if (kingdomEdit)
    return (
      <form
        className="form-stack kingdom-editor"
        onSubmit={(e) => {
          e.preventDefault();
          onSaveKingdom();
          setKingdomId(kingdomEdit.id);
          setSettlementId(null);
        }}
      >
        <h2>
          {world.territories.some((k) => k.id === kingdomEdit.id)
            ? "Edit kingdom"
            : "New kingdom"}
        </h2>
        <label>
          Kingdom name
          <input
            required
            maxLength={80}
            value={kingdomEdit.name}
            onChange={(e) =>
              onKingdomChange({ ...kingdomEdit, name: e.target.value })
            }
          />
        </label>
        <label>
          Border color
          <input
            type="color"
            value={kingdomEdit.color}
            onChange={(e) =>
              onKingdomChange({ ...kingdomEdit, color: e.target.value })
            }
          />
        </label>
        <WorldAssetUpload
          kind="emblem"
          value={kingdomEdit.emblemAssetId}
          demo={demo}
          onChange={(emblemAssetId) =>
            onKingdomChange({ ...kingdomEdit, emblemAssetId })
          }
        />
        <p className="fine-print">
          Position the emblem independently of the border. Empty coordinates use
          the border's average center.
        </p>
        <div className="form-row">
          {(["x", "y"] as const).map((axis) => (
            <label key={axis}>
              Emblem {axis.toUpperCase()}
              <input
                type="number"
                min={0}
                max={axis === "x" ? 2400 : 1800}
                step="any"
                value={kingdomEdit.emblemPosition?.[axis] ?? ""}
                onChange={(e) =>
                  onKingdomChange({
                    ...kingdomEdit,
                    emblemPosition:
                      e.target.value === ""
                        ? null
                        : {
                            ...(kingdomEdit.emblemPosition ?? {
                              x:
                                kingdomEdit.points.reduce(
                                  (a, p) => a + p.x,
                                  0,
                                ) / Math.max(1, kingdomEdit.points.length),
                              y:
                                kingdomEdit.points.reduce(
                                  (a, p) => a + p.y,
                                  0,
                                ) / Math.max(1, kingdomEdit.points.length),
                            }),
                            [axis]: Number(e.target.value),
                          },
                  })
                }
              />
            </label>
          ))}
        </div>
        <div className="info-note">
          <Flag size={18} />
          <span>
            The border belongs to this kingdom. You decide where it lies;
            settlement allegiance is assigned separately.
          </span>
        </div>
        <button type="button" className="button secondary" onClick={onDraw}>
          {drawing ? "Restart border drawing" : "Draw replacement border"}
        </button>
        {drawing && (
          <p role="status">
            Click the map to add border points. On a phone, close the sidebar to
            reach the map, then reopen it to save.
          </p>
        )}
        <p className="fine-print">
          {borderPoints.length} / 150 border points · At least 3 required. The
          saved border remains until you save its replacement.
        </p>
        {drawing && (
          <button
            type="button"
            className="text-button"
            disabled={!borderPoints.length}
            onClick={() => onBorderPoints(borderPoints.slice(0, -1))}
          >
            Undo border point
          </button>
        )}
        <details className="border-coordinates">
          <summary>Edit border coordinates</summary>
          {borderPoints.map((p, i) => (
            <div className="form-row" key={i}>
              <label>
                Point {i + 1} X
                <input
                  type="number"
                  min={0}
                  max={2400}
                  step="any"
                  required
                  value={p.x}
                  onChange={(e) =>
                    onBorderPoints(
                      borderPoints.map((v, n) =>
                        n === i ? { ...v, x: Number(e.target.value) } : v,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Point {i + 1} Y
                <input
                  type="number"
                  min={0}
                  max={1800}
                  step="any"
                  required
                  value={p.y}
                  onChange={(e) =>
                    onBorderPoints(
                      borderPoints.map((v, n) =>
                        n === i ? { ...v, y: Number(e.target.value) } : v,
                      ),
                    )
                  }
                />
              </label>
            </div>
          ))}
        </details>
        <details>
          <summary>Kingdom lore</summary>
          <Suspense fallback={<p>Opening lore editor…</p>}>
            <LoreEditor
              value={kingdomEdit.lore}
              onChange={(lore) => onKingdomChange({ ...kingdomEdit, lore })}
            />
          </Suspense>
        </details>
        {kingdomEdit.lore.length > 60000 && (
          <p className="error">Lore exceeds the 60,000-character limit.</p>
        )}
        <button
          className="button primary"
          disabled={
            !kingdomEdit.name.trim() ||
            borderPoints.length < 3 ||
            borderPoints.length > 150 ||
            kingdomEdit.lore.length > 60000
          }
        >
          Save kingdom to draft
        </button>
        <button type="button" className="text-button" onClick={onCancelKingdom}>
          Cancel kingdom edit
        </button>
      </form>
    );

  return (
    <div className="places-editor">
      <nav className="place-breadcrumbs" aria-label="Places hierarchy">
        <button
          className="text-button"
          onClick={() => {
            setKingdomId(null);
            setSettlementId(null);
          }}
        >
          Kingdoms
        </button>
        {kingdom && (
          <>
            <ChevronRight size={13} />
            <button
              className="text-button"
              onClick={() => setSettlementId(null)}
            >
              {kingdom.name}
            </button>
          </>
        )}
        {settlement && (
          <>
            <ChevronRight size={13} />
            <span>{settlement.name}</span>
          </>
        )}
      </nav>
      {!kingdom ? (
        <>
          <div className="list-heading">
            <span>KINGDOMS</span>
            <span>{world.territories.length}</span>
          </div>
          <button
            className="button secondary full"
            onClick={() =>
              onEditKingdom({
                id: crypto.randomUUID(),
                name: "",
                color: "#a77845",
                lore: "",
                points: [],
              })
            }
          >
            <Plus size={16} />
            Add kingdom
          </button>
          {!world.territories.length && (
            <p className="empty-state">
              Create your first kingdom and draw its border.
            </p>
          )}
          <div className="hierarchy-list">
            {world.territories.map((k) => (
              <button
                className="kingdom-card"
                key={k.id}
                onClick={() => {
                  setKingdomId(k.id);
                  setSettlementId(null);
                }}
              >
                <span className="kingdom-emblem" style={{ color: k.color }}>
                  {k.emblemAssetId ? (
                    <img src={emblemUrl(k.emblemAssetId)} alt="" />
                  ) : (
                    <Flag size={24} />
                  )}
                </span>
                <span>
                  <strong>{k.name}</strong>
                  <small>
                    {world.locations.filter((l) => l.kingdomId === k.id).length}{" "}
                    settlements
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
          {unassigned.length > 0 && (
            <p className="info-note">
              {unassigned.length} existing places need a kingdom. Open a kingdom
              to assign them; their content has been preserved.
            </p>
          )}
        </>
      ) : !settlement ? (
        <>
          <h2>{kingdom.name}</h2>
          <div className="place-management-actions">
            <button
              className="button secondary"
              onClick={() => onEditKingdom(structuredClone(kingdom))}
            >
              <Flag size={16} />
              Edit kingdom & border
            </button>
            <button
              className="text-button danger"
              onClick={() => setDeleting(true)}
            >
              Delete kingdom
            </button>
          </div>
          {kingdom.lore && (
            <article
              className="lore-content kingdom-lore"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(kingdom.lore, {
                  USE_PROFILES: { html: true },
                  FORBID_TAGS: ["style", "form", "input", "button", "iframe"],
                  FORBID_ATTR: ["style", "target"],
                }),
              }}
            />
          )}
          <div className="list-heading">
            <span>SETTLEMENTS</span>
            <span>{settlements.length}</span>
          </div>
          <button
            className="button secondary full"
            onClick={() => onAddSettlement(kingdom.id)}
          >
            <Plus size={16} />
            Add settlement
          </button>
          <p className="fine-print">
            Choose Add settlement, then click its position on the map.
          </p>
          <div className="hierarchy-list">
            {settlements.map((l) => (
              <button
                className="kingdom-card"
                key={l.id}
                onClick={() => setSettlementId(l.id)}
              >
                <Castle size={20} />
                <span>
                  <strong>{l.name}</strong>
                  <small>
                    {l.kind} · {l.entries.length} internal locations
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
          {!settlements.length && (
            <p className="fine-print">No settlements in this kingdom yet.</p>
          )}
          {!!unassigned.length && (
            <label className="field-label">
              Assign an existing place
              <select
                aria-label="Assign an existing place"
                value=""
                onChange={(e) => {
                  onChange({
                    ...world,
                    locations: world.locations.map((l) =>
                      l.id === e.target.value
                        ? { ...l, kingdomId: kingdom.id, region: kingdom.name }
                        : l,
                    ),
                  });
                }}
              >
                <option value="">Choose a preserved place</option>
                {unassigned.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      ) : (
        <>
          <h2>{settlement.name}</h2>
          <p className="fine-print">
            {settlement.kind} · {kingdom.name}
          </p>
          <div className="place-management-actions">
            <button
              className="button secondary"
              onClick={() => onEditSettlement(settlement)}
            >
              Edit settlement / allegiance
            </button>
            <button className="text-button" onClick={() => onFocus(settlement)}>
              <MapPin size={16} />
              View on map
            </button>
          </div>
          <div className="list-heading">
            <span>INTERNAL LOCATIONS</span>
            <span>{settlement.entries.length}</span>
          </div>
          <button
            className="button secondary full"
            disabled={settlement.entries.length >= 100}
            onClick={() =>
              setEntryEdit({
                id: crypto.randomUUID(),
                name: "",
                summary: "",
                lore: "",
              })
            }
          >
            <Plus size={16} />
            Add internal location
          </button>
          <div className="hierarchy-list">
            {settlement.entries.map((entry) => (
              <button
                className="kingdom-card"
                key={entry.id}
                onClick={() => setEntryEdit(entry)}
              >
                <BookOpen size={20} />
                <span>
                  <strong>{entry.name}</strong>
                  <small>{entry.summary || "Encyclopedia entry"}</small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
          {!settlement.entries.length && (
            <p className="fine-print">
              Add the inns, shrines, halls, and other places that bring this
              settlement to life.
            </p>
          )}
        </>
      )}
      {deleting && kingdom && (
        <Modal
          title={`Delete ${kingdom.name}?`}
          subtitle="Delete kingdom and all its contents"
          onClose={() => setDeleting(false)}
        >
          <div className="form-stack">
            <p>
              This deletes the kingdom, its border, {settlements.length}{" "}
              settlements, and{" "}
              {settlements.reduce((n, l) => n + l.entries.length, 0)} internal
              locations when you publish.
            </p>
            <ul>
              {settlements.map((l) => (
                <li key={l.id}>
                  {l.name} ({l.entries.length} internal locations)
                </li>
              ))}
            </ul>
            <p>
              Characters stay on their current hex. References to deleted
              places, including origins, are cleared. Settlements transferred to
              another kingdom are unaffected.
            </p>
            <button
              className="button secondary danger"
              onClick={() => {
                onChange(removeKingdom(world, kingdom.id));
                setDeleting(false);
                setKingdomId(null);
                setSettlementId(null);
              }}
            >
              Delete kingdom and contents
            </button>
            <button className="text-button" onClick={() => setDeleting(false)}>
              Keep kingdom
            </button>
          </div>
        </Modal>
      )}
      {entryEdit && settlement && (
        <Suspense fallback={<p>Opening entry editor…</p>}>
          <EntryForm
            key={entryEdit.id}
            entry={entryEdit}
            settlementName={settlement.name}
            existing={settlement.entries.some((e) => e.id === entryEdit.id)}
            onClose={() => setEntryEdit(null)}
            onSave={(entry) =>
              updateEntries(
                settlement.entries.some((e) => e.id === entry.id)
                  ? settlement.entries.map((e) =>
                      e.id === entry.id ? entry : e,
                    )
                  : [...settlement.entries, entry],
              )
            }
            onDelete={() =>
              updateEntries(
                settlement.entries.filter((e) => e.id !== entryEdit.id),
              )
            }
          />
        </Suspense>
      )}
    </div>
  );
}
