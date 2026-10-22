import { useState, useRef, useEffect } from "react";
import { call, friendlyError } from "../useWorld";
import { emblemUrl, mapPreviewUrl } from "../../shared/assets";
export function WorldAssetUpload({
  kind,
  value,
  onChange,
  demo = false,
}: {
  kind: "map" | "emblem";
  value?: string | null;
  onChange: (id: string | null, nativeZoom?: number) => void;
  demo?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = useRef(true),
    latestChange = useRef(onChange);
  latestChange.current = onChange;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return (
    <div className="asset-upload form-stack">
      <h3>{kind === "map" ? "Map artwork" : "Coat of arms or flag"}</h3>
      {value && (
        <img
          className={kind === "map" ? "map-art-preview" : "emblem-preview"}
          src={kind === "map" ? mapPreviewUrl(value) : emblemUrl(value)}
          alt={
            kind === "map" ? "Map artwork preview" : "Kingdom emblem preview"
          }
        />
      )}
      <label>
        {kind === "map" ? "Upload map artwork" : "Upload coat of arms or flag"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy || demo}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setError("");
            setBusy(true);
            try {
              if (file.size > 6 * 1024 * 1024)
                throw new Error("Choose an image up to 6 MB.");
              if (
                !["image/png", "image/jpeg", "image/webp"].includes(file.type)
              )
                throw new Error("Use a PNG, JPEG, or WebP image.");
              const image = await new Promise<string>((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(String(r.result));
                r.onerror = () =>
                  reject(new Error("Could not read this image."));
                r.readAsDataURL(file);
              });
              const { id, nativeZoom } = await call<{
                id: string;
                nativeZoom: number;
              }>("uploadWorldAsset", {
                kind,
                image,
              });
              if (active.current) latestChange.current(id, nativeZoom);
            } catch (err) {
              setError(friendlyError(err));
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {busy && (
        <p role="status">
          {kind === "map"
            ? "Preparing map tiles… This may take a minute."
            : "Preparing emblem…"}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {demo && (
        <p className="fine-print">Sign in as an admin to upload artwork.</p>
      )}
      <p className="fine-print">
        {kind === "map"
          ? "PNG, JPEG, or WebP, up to 6 MB. Artwork fits the 4:3 world with padding as needed. Preview it on the draft map, then Publish world. Artwork changes keep character positions and terrain rules."
          : "PNG, JPEG, or WebP, up to 6 MB. Transparent backgrounds and flag proportions are preserved. Changes appear after publishing the world."}
      </p>
      {value && (
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => onChange(null)}
        >
          {kind === "map" ? "Restore placeholder artwork" : "Remove emblem"}
        </button>
      )}
    </div>
  );
}
