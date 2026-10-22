import { useMemo, useState } from "react";
import { alignMapArtwork, type AlignmentMode } from "../../shared/mapAlignment";
import { worldSize, type World } from "../../shared/world";
import type { MapArtwork } from "../../shared/mapImages";
import { Modal } from "./Modal";
import { WorldMap } from "./WorldMap";
const noop = () => {};
export function MapAlignment({
  world,
  artwork,
  onApply,
  onClose,
}: {
  world: World;
  artwork: MapArtwork;
  onApply: (next: World) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<AlignmentMode>("fit");
  const preview = useMemo(() => {
    try {
      return { world: alignMapArtwork(world, artwork, mode), error: "" };
    } catch (e) {
      return { world: null, error: (e as Error).message };
    }
  }, [world, artwork, mode]);
  const oldSize = worldSize(world);
  return (
    <Modal
      title="Align the world with this map"
      subtitle="Preview placement before changing your draft"
      onClose={onClose}
      wide
    >
      <div className="form-stack map-alignment-options">
        <p>
          The map proportions are changing. Move the grid, terrain, places, and
          borders together so their relative positions stay aligned.
        </p>
        <label>
          <input
            type="radio"
            name="map-alignment"
            checked={mode === "fit"}
            onChange={() => setMode("fit")}
          />{" "}
          Fit existing world inside the new map
        </label>
        <p className="fine-print">
          Preserves all existing places. The grid scales uniformly, keeping the
          same travel distances and energy costs between existing hexes.
        </p>
        {!world.mapLayout && world.mapAssetId && (
          <>
            <label>
              <input
                type="radio"
                name="map-alignment"
                checked={mode === "unpad"}
                onChange={() => setMode("unpad")}
              />{" "}
              Remove old padding from the same artwork
            </label>
            <p className="fine-print">
              Choose this when re-uploading your previous map. Anything in the
              old padding must be moved onto the artwork first. Publishing also
              checks every character.
            </p>
          </>
        )}
        <p className="fine-print">
          Previous proportions: {(oldSize.width / oldSize.height).toFixed(2)}:1.
          New proportions: {(artwork.mapWidth / artwork.mapHeight).toFixed(2)}
          :1. Image resolution is separate from the grid.
        </p>
        {preview.error && (
          <p className="error" role="alert">
            {preview.error}
          </p>
        )}
        {preview.world && (
          <div className="map-alignment-preview">
            <WorldMap
              world={preview.world}
              character={null}
              selected={null}
              route={null}
              grid
              terrain={false}
              borders
              labels
              editor={false}
              tool="pan"
              draftBorder={[]}
              fitWholeWorld
              onSelect={noop}
              onLocation={noop}
              onPaint={noop}
              onStroke={noop}
              onPlace={noop}
              onBorder={noop}
              onReady={noop}
            />
          </div>
        )}
        <button
          className="button primary"
          disabled={!preview.world}
          onClick={() => {
            if (preview.world) onApply(preview.world);
          }}
        >
          Use this alignment in draft
        </button>
        <button className="text-button" onClick={onClose}>
          Keep current artwork
        </button>
        <p className="fine-print">
          New areas outside the previous grid start as impassable water.
        </p>
        <p className="fine-print">
          The live world changes only after Publish world. You can undo this
          alignment in the editor.
        </p>
      </div>
    </Modal>
  );
}
