export const ICON_CATEGORIES = [
  "kingdom",
  "city",
  "town",
  "village",
  "landmark",
  "character",
] as const;
export type IconCategory = (typeof ICON_CATEGORIES)[number];
export type IconStyle = {
  size: number;
  scaling: "fixed" | "gradual";
  minSize: number;
  maxSize: number;
  minZoom: number;
  maxZoom: number;
  labelMinZoom: number;
  labelMaxZoom: number;
};
export type MapPresentation = {
  minZoom: number;
  maxZoom: number;
  defaultZoom: number;
  startView: "fit" | "default";
  icons: Record<IconCategory, IconStyle>;
};
const style = (
  size: number,
  minZoom: number,
  maxZoom = 7,
  scaling: IconStyle["scaling"] = "gradual",
): IconStyle => ({
  size,
  scaling,
  minSize: Math.round(size * 0.75),
  maxSize: Math.round(size * 1.5),
  minZoom,
  maxZoom,
  labelMinZoom: minZoom,
  labelMaxZoom: maxZoom,
});
export const DEFAULT_MAP_PRESENTATION: MapPresentation = {
  minZoom: -1,
  maxZoom: 7,
  defaultZoom: 1.5,
  startView: "fit",
  icons: {
    kingdom: { ...style(64, -4, 2.25, "fixed"), minSize: 32, maxSize: 96 },
    city: style(30, 0),
    town: style(25, 1.25),
    village: style(22, 2),
    landmark: style(25, 1.5),
    character: style(34, -4, 7, "fixed"),
  },
};
export function mapPresentationError(value: unknown): string | null {
  if (!value || typeof value !== "object")
    return "Invalid map presentation settings.";
  const p = value as MapPresentation;
  const zoom = (v: number) => Number.isFinite(v) && v >= -4 && v <= 7;
  if (
    !zoom(p.minZoom) ||
    !zoom(p.maxZoom) ||
    !zoom(p.defaultZoom) ||
    p.minZoom > p.maxZoom ||
    p.defaultZoom < p.minZoom ||
    p.defaultZoom > p.maxZoom ||
    !["fit", "default"].includes(p.startView)
  )
    return "Zoom levels must be between -4 and 7, with default between minimum and maximum.";
  for (const id of ICON_CATEGORIES) {
    const s = p.icons?.[id];
    if (
      !s ||
      !["fixed", "gradual"].includes(s.scaling) ||
      ![s.size, s.minSize, s.maxSize].every(
        (v) => Number.isFinite(v) && v >= 8 && v <= 160,
      ) ||
      s.minSize > s.maxSize ||
      s.size < s.minSize ||
      s.size > s.maxSize ||
      ![s.minZoom, s.maxZoom, s.labelMinZoom, s.labelMaxZoom].every(zoom) ||
      s.minZoom > s.maxZoom ||
      s.labelMinZoom > s.labelMaxZoom
    )
      return `Invalid ${id} icon settings. Sizes must be 8–160 px; base size must be within its limits; zoom ranges must be ordered within -4–7.`;
  }
  return null;
}
export function iconPresentation(s: IconStyle, zoom: number) {
  return {
    size: Math.max(
      s.minSize,
      Math.min(
        s.maxSize,
        s.size * (s.scaling === "gradual" ? 2 ** ((zoom - 2) * 0.2) : 1),
      ),
    ),
    visible: zoom >= s.minZoom && zoom <= s.maxZoom,
    label: zoom >= s.labelMinZoom && zoom <= s.labelMaxZoom,
    opacity: Math.min(1, Math.max(0, (s.maxZoom - zoom + 0.25) / 0.5)),
  };
}
