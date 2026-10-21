import { useState, type FormEvent } from "react";
import { MapPin, UserRound, LoaderCircle } from "lucide-react";
import { Modal } from "./Modal";
import { type World } from "../../shared/world";
export function CharacterForm({
  world,
  demo,
  onClose,
  onSave,
}: {
  world: World;
  demo: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    title: string;
    bio: string;
    locationId: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(""),
    [title, setTitle] = useState(""),
    [bio, setBio] = useState(""),
    [locationId, setLocation] = useState(
      world.locations.find((l) => l.starting)?.id ?? "",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({ name, title, bio, locationId });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Give your story a beginning"
      subtitle={
        demo
          ? "Create a traveler for this local preview."
          : "Create your character and choose a starting settlement."
      }
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <label>
          Character name
          <input
            required
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What do they call you?"
          />
        </label>
        <label>
          Title or calling <span className="optional">optional</span>
          <input
            maxLength={60}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Wanderer, herbalist, keeper of stories…"
          />
        </label>
        <label>
          A little of your story <span className="optional">optional</span>
          <textarea
            maxLength={1500}
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Every traveler carries a story."
          />
        </label>
        <label>
          Starting settlement
          <select
            value={locationId}
            onChange={(e) => setLocation(e.target.value)}
          >
            {world.locations
              .filter((l) => l.starting)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.region}
                </option>
              ))}
          </select>
        </label>
        <div className="info-note">
          <MapPin size={18} />
          You’ll begin with 100 energy. Walking costs depend on the terrain you
          enter.
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button
          disabled={busy || !name.trim() || !locationId}
          className="button primary"
        >
          {busy ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <UserRound size={17} />
          )}{" "}
          Create character
        </button>
      </form>
    </Modal>
  );
}
