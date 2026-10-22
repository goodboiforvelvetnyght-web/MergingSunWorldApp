export const MAP_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAP_CHUNK_BYTES = 1024 * 1024;
export const MAP_MAX_PIXELS = 64_000_000;
export const MAP_MAX_EDGE = 8192;
export const MAP_WORLD_EDGE = 2048;
export type MapArtwork = {
  id: string | null;
  nativeZoom: number;
  mapWidth: number;
  mapHeight: number;
  mapLayout?: "natural";
};
export function naturalMapDimensions(width: number, height: number) {
  const scale = MAP_WORLD_EDGE / Math.max(width, height);
  return {
    mapWidth: Math.max(1, Math.round(width * scale)),
    mapHeight: Math.max(1, Math.round(height * scale)),
    nativeZoom: Math.max(
      0,
      Math.min(
        5,
        3 + Math.ceil(Math.log2(Math.max(width, height) / MAP_WORLD_EDGE)),
      ),
    ),
  };
}
