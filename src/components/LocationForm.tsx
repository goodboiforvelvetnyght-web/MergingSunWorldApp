import { useEffect, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { Modal } from "./Modal";
import { LoreEditor } from "./LoreEditor";
import { type Location, type Kingdom } from "../../shared/world";
import { readLocal, saveLocal } from "../useWorld";
export default function LocationForm({
  location,
  scope,
  kingdoms,
  mapSize = { width: 2400, height: 1800 },
  onClose,
  onSave,
  onDelete,
}: {
  location: Location;
  scope: string;
  kingdoms: Kingdom[];
  mapSize?: { width: number; height: number };
  onClose: () => void;
  onSave: (l: Location) => void;
  onDelete: () => void;
}) {
  const storageKey = `ms:settlement-draft:v2:${scope}:${location.id}`;
  const [value, setValue] = useState<Location>(() =>
      readLocal(storageKey, location),
    ),
    [saved, setSaved] = useState(true),
    [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSaved(saveLocal(storageKey, value)), 500);
    return () => clearTimeout(id);
  }, [value, storageKey]);
  const field = <K extends keyof Location>(k: K, v: Location[K]) =>
    setValue((prev) => ({ ...prev, [k]: v }));
  function submit(e: FormEvent) {
    e.preventDefault();
    onSave({
      ...value,
      entries: location.entries,
      region:
        kingdoms.find((k) => k.id === value.kingdomId)?.name ?? value.region,
    });
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    onClose();
  }
  return (
    <Modal
      title="Settlement details"
      subtitle="Place details and lore · Draft saved in this browser"
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="form-stack">
        <div className="form-row">
          <label>
            Settlement name
            <input
              required
              maxLength={80}
              value={value.name}
              onChange={(e) => field("name", e.target.value)}
            />
          </label>
          <label>
            Type
            <select
              aria-label="Type"
              value={value.kind}
              onChange={(e) =>
                field("kind", e.target.value as Location["kind"])
              }
            >
              <option value="town">Town</option>
              <option value="city">City</option>
              <option value="village">Village</option>
              {value.kind === "landmark" && (
                <option value="landmark">Landmark (existing place)</option>
              )}
            </select>
          </label>
        </div>
        <label>
          Allegiance
          <select
            aria-label="Allegiance"
            required
            value={value.kingdomId ?? ""}
            onChange={(e) => field("kingdomId", e.target.value)}
          >
            <option value="" disabled>
              Choose a kingdom
            </option>
            {kingdoms.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
        <p className="fine-print">
          Changing allegiance moves this settlement and its internal locations
          to that kingdom. Map positions and borders stay the same.
        </p>
        <label>
          Short description
          <input
            maxLength={240}
            value={value.summary}
            onChange={(e) => field("summary", e.target.value)}
          />
        </label>
        <div className="form-row">
          <label>
            Map X
            <input
              type="number"
              required
              min={0}
              max={mapSize.width}
              step="any"
              value={value.x}
              onChange={(e) => field("x", Number(e.target.value))}
            />
          </label>
          <label>
            Map Y
            <input
              type="number"
              required
              min={0}
              max={mapSize.height}
              step="any"
              value={value.y}
              onChange={(e) => field("y", Number(e.target.value))}
            />
          </label>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={value.starting}
            onChange={(e) => field("starting", e.target.checked)}
          />{" "}
          Allow new characters to start here
        </label>
        <div>
          <label className="field-label">Location lore</label>
          <LoreEditor
            value={value.lore}
            onChange={(html) => field("lore", html)}
          />
        </div>
        <div className="form-actions">
          <span className="fine-print">
            {saved
              ? "Draft autosaves locally"
              : "Browser storage is full; save your changes now"}
          </span>
          <button
            className="button primary"
            disabled={
              !value.name.trim() ||
              !kingdoms.some((k) => k.id === value.kingdomId) ||
              value.lore.length > 60000
            }
          >
            <Save size={16} /> Save to world draft
          </button>
        </div>
        {value.lore.length > 60000 && (
          <p className="error">Lore exceeds the 60,000-character limit.</p>
        )}
        <div className="danger-area">
          {confirm ? (
            <>
              <span>
                Delete {location.name || "this settlement"} and its{" "}
                {location.entries.length} internal locations? Characters stay on
                their current hex. This takes effect when the world is
                published.
              </span>
              <button
                type="button"
                className="text-button danger"
                onClick={() => {
                  onDelete();
                  onClose();
                }}
              >
                Delete settlement and contents
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setConfirm(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="text-button danger"
              onClick={() => setConfirm(true)}
            >
              Delete settlement
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
