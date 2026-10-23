import {
  allHexes,
  MIN_HEX_RADIUS,
  MAX_HEX_RADIUS,
  center,
  hexAt,
  key,
  tileAt,
  worldSize,
  type World,
  type Point,
} from "./world.js";
import type { MapArtwork } from "./mapImages.js";
export type AlignmentMode = "fit" | "unpad";
export type MapTransform = { scale: number; x: number; y: number };
export function sameMapSize(a: World, b: World) {
  const x = worldSize(a),
    y = worldSize(b);
  return x.width === y.width && x.height === y.height;
}
export function mapTransform(
  previous: World,
  target: World,
  mode: AlignmentMode,
): MapTransform {
  const a = worldSize(previous),
    b = worldSize(target);
  if (sameMapSize(previous, target)) return { scale: 1, x: 0, y: 0 };
  const scale =
    mode === "unpad"
      ? Math.max(b.width / a.width, b.height / a.height)
      : Math.min(b.width / a.width, b.height / a.height);
  return {
    scale,
    x: (b.width - a.width * scale) / 2,
    y: (b.height - a.height * scale) / 2,
  };
}
export const transformPoint = (p: Point, t: MapTransform): Point => ({
  x: p.x * t.scale + t.x,
  y: p.y * t.scale + t.y,
});
export function pointOnMap(p: Point, w: World) {
  const { width, height } = worldSize(w);
  return (
    p.x >= -1e-6 && p.y >= -1e-6 && p.x <= width + 1e-6 && p.y <= height + 1e-6
  );
}
export function alignedGrid(
  previous: World,
  target: World,
  mode: AlignmentMode,
) {
  const t = mapTransform(previous, target, mode);
  const raw = {
    radius: previous.radius * t.scale,
    offsetX: previous.offsetX * t.scale + t.x,
    offsetY: previous.offsetY * t.scale + t.y,
  };
  // Move the grid origin by whole axial steps; every hex keeps its exact physical footprint.
  const shift = hexAt({ x: 0, y: 0 }, raw),
    origin = center(shift, raw);
  return {
    grid: { radius: raw.radius, offsetX: origin.x, offsetY: origin.y },
    shift,
    transform: t,
  };
}
export function gridChangedAfterAlignment(previous: World, target: World) {
  const baseline = target.mapAlignment
    ? alignedGrid(previous, target, target.mapAlignment.mode).grid
    : previous;
  return ["radius", "offsetX", "offsetY"].some(
    (k) => Math.abs(target[k as "radius"] - baseline[k as "radius"]) > 1e-6,
  );
}
/** Uniformly move places, borders, emblems and terrain together; never stretch hexes. */
export function alignMapArtwork(
  previous: World,
  art: MapArtwork,
  mode: AlignmentMode,
): World {
  const next: World = {
    ...previous,
    mapAssetId: art.id,
    mapNativeZoom: art.nativeZoom,
    mapWidth: art.mapWidth,
    mapHeight: art.mapHeight,
    mapLayout: art.mapLayout,
  };
  if (!art.mapLayout) delete next.mapLayout;
  if (sameMapSize(previous, next)) return next;
  if (previous.mapAlignment)
    throw new Error(
      "Publish or undo the current map alignment before changing map proportions again.",
    );
  if (mode === "unpad" && previous.mapLayout === "natural")
    throw new Error(
      "This map already uses its natural proportions. Choose Fit existing world.",
    );
  const { grid, shift, transform } = alignedGrid(previous, next, mode);
  if (grid.radius < MIN_HEX_RADIUS || grid.radius > MAX_HEX_RADIUS)
    throw new Error(
      "This map shape would make the hex grid too small or too large. Adjust the grid before replacing this artwork.",
    );
  Object.assign(next, grid, {
    terrainBase: "water",
    tiles: {},
    mapAlignment: { baseVersion: previous.version, mode },
  });
  next.locations = previous.locations.map((l) => ({
    ...l,
    ...transformPoint(l, transform),
  }));
  next.territories = previous.territories.map((k) => ({
    ...k,
    points: k.points.map((p) => ({ ...p, ...transformPoint(p, transform) })),
    ...(k.emblemPosition
      ? { emblemPosition: transformPoint(k.emblemPosition, transform) }
      : {}),
  }));
  if (
    next.locations.some((l) => !pointOnMap(l, next)) ||
    next.territories.some(
      (k) =>
        k.points.some((p) => !pointOnMap(p, next)) ||
        (k.emblemPosition && !pointOnMap(k.emblemPosition, next)),
    )
  )
    throw new Error(
      "Some places, borders, or emblems are in the old padding. Move them onto the artwork, or choose Fit existing world.",
    );
  for (const h of allHexes(previous)) {
    const p = transformPoint(center(h, previous), transform);
    if (pointOnMap(p, next))
      next.tiles[key({ q: h.q - shift.q, r: h.r - shift.r })] = {
        ...tileAt(h, previous),
      };
  }
  return next;
}
