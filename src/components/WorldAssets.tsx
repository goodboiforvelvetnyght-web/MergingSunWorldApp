import { useState, useRef, useEffect } from "react";
import { uploadLargeMap, type UploadProgress } from "../mapUpload";
import type { MapArtwork } from "../../shared/mapImages";
import { call, friendlyError } from "../useWorld";
import { emblemUrl, mapPreviewUrl } from "../../shared/assets";
export function WorldAssetUpload({
  kind,
  value,
  onChange,
  onBusyChange,
  demo = false,
}: {
  kind: "map" | "emblem";
  value?: string | null;
  onChange: (
    id: string | null,
    nativeZoom?: number,
    artwork?: MapArtwork,
  ) => void;
  demo?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState<UploadProgress | null>(null);
  const active = useRef(true),
    latestChange = useRef(onChange);
  latestChange.current = onChange;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
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
            setProgress(null);
            try {
              if (kind === "map") {
                const artwork = await uploadLargeMap(file, (value) => {
                  if (active.current) setProgress(value);
                });
                if (active.current)
                  latestChange.current(artwork.id, artwork.nativeZoom, artwork);
                return;
              }
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
              const code = (err as { code?: string }).code;
              setError(
                code === "functions/deadline-exceeded"
                  ? "Preparing this image took too long. Please try uploading it again."
                  : code === "functions/internal" ||
                      code === "functions/unavailable"
                    ? "The image upload or processing did not finish. Please try again. If it keeps failing, report the image’s file size and format."
                    : friendlyError(err),
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {busy && (
        <div role="status">
          <p>
            {kind === "map"
              ? (progress?.detail ?? "Checking map file…")
              : "Preparing emblem…"}
          </p>
          {kind === "map" && (
            <>
              <progress
                aria-label={
                  progress?.stage === "processing"
                    ? "Map processing progress"
                    : "Map upload progress"
                }
                value={progress?.percent ?? 0}
                max={100}
              />
              <p className="fine-print">
                Large maps may take several minutes. Keep this page open.
                Selecting the same file again resumes an interrupted upload.
              </p>
            </>
          )}
        </div>
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
          ? "PNG, JPEG, or WebP, up to 25 MB, 8192 pixels on the longest side, and 64 megapixels. Natural proportions are preserved. The original stays private. Review alignment and preview the draft before publishing."
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
