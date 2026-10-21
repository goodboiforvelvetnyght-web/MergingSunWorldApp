import { useEffect, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { Modal } from "./Modal";
import { LoreEditor } from "./LoreEditor";
import { type Location } from "../../shared/world";
import { readLocal, saveLocal } from "../useWorld";
export default function LocationForm({
  location,
  scope,
  onClose,
  onSave,
  onDelete,
}: {
  location: Location;
  scope: string;
  onClose: () => void;
  onSave: (l: Location) => void;
  onDelete: () => void;
}) {
  const storageKey = `ms:location-draft:${scope}:${location.id}`;
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
    onSave(value);
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    onClose();
  }
  return (
    <Modal
      title="Write a place into the world"
      subtitle="Place details and lore · Draft saved in this browser"
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="form-stack">
        <div className="form-row">
          <label>
            Location name
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
              value={value.kind}
              onChange={(e) =>
                field("kind", e.target.value as Location["kind"])
              }
            >
              <option value="town">Town</option>
              <option value="city">City</option>
              <option value="landmark">Landmark</option>
            </select>
          </label>
        </div>
        <label>
          Region or kingdom
          <input
            maxLength={80}
            value={value.region}
            onChange={(e) => field("region", e.target.value)}
          />
        </label>
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
              max={2400}
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
              max={1800}
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
            disabled={!value.name.trim() || value.lore.length > 60000}
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
              <span>Remove this location from the draft?</span>
              <button
                type="button"
                className="text-button danger"
                onClick={() => {
                  onDelete();
                  onClose();
                }}
              >
                Yes, remove
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
              Delete location
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
