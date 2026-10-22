import { useState, type FormEvent } from "react";
import { EditorFormFrame } from "./EditorWorkspace";
import { LoreEditor } from "./LoreEditor";
import type { PlaceEntry } from "../../shared/world";

export default function EntryForm({
  entry,
  inline = false,
  settlementName,
  existing,
  onSave,
  onDelete,
  onClose,
}: {
  entry: PlaceEntry;
  inline?: boolean;
  settlementName: string;
  existing: boolean;
  onSave: (entry: PlaceEntry) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(entry);
  const [confirm, setConfirm] = useState(false);
  function submit(e: FormEvent) {
    e.preventDefault();
    onSave(value);
    onClose();
  }
  return (
    <EditorFormFrame
      inline={inline}
      title={existing ? "Edit internal location" : "Add internal location"}
      subtitle={`Encyclopedia entry in ${settlementName}`}
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <label>
          Entry name
          <input
            required
            maxLength={80}
            value={value.name}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
          />
        </label>
        <label>
          Short description
          <input
            maxLength={240}
            value={value.summary}
            onChange={(e) => setValue({ ...value, summary: e.target.value })}
          />
        </label>
        <div>
          <label className="field-label">Location lore</label>
          <LoreEditor
            value={value.lore}
            onChange={(lore) => setValue({ ...value, lore })}
          />
        </div>
        <p className="fine-print">
          This location is an encyclopedia entry. It has no separate map
          position yet.
        </p>
        {value.lore.length > 60000 && (
          <p className="error">Lore exceeds the 60,000-character limit.</p>
        )}
        <button
          className="button primary"
          disabled={!value.name.trim() || value.lore.length > 60000}
        >
          Save entry to draft
        </button>
        {existing && (
          <div className="danger-area">
            {confirm ? (
              <>
                <p>
                  Delete {entry.name}? Characters stay on their current hex.
                  This takes effect when the world is published.
                </p>
                <button
                  type="button"
                  className="button secondary danger"
                  onClick={() => {
                    onDelete();
                    onClose();
                  }}
                >
                  Confirm delete entry
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
                Delete internal location
              </button>
            )}
          </div>
        )}
      </form>
    </EditorFormFrame>
  );
}
