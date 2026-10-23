import {
  borderSegments,
  flattenSegments,
  smoothRoadPaths,
  closestBorderSegment,
} from "../../shared/curves";
import { mapTileUrl, emblemUrl } from "../../shared/assets";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  allHexes,
  inBounds,
  center,
  corners,
  hexAt,
  tileAt,
  TERRAIN_COLORS,
  key,
  worldSize,
  type World,
  type Point,
  type BorderPoint,
  type Hex,
  type Character,
  type Route,
} from "../../shared/world";
export type MapHandle = {
  zoom: (delta: number) => void;
  home: () => void;
  focus: (p: Point) => void;
  focusBounds: (points: Point[]) => void;
};
export type EditorTool =
  | "pan"
  | "feature"
  | "erase-feature"
  | "terrain"
  | "river"
  | "erase-river"
  | "road"
  | "erase-road"
  | "location"
  | "border"
  | "border-point";
type Props = {
  world: World;
  artworkOpacity?: number;
  population?: Record<string, number>;
  onKingdom?: (id: string) => void;
  selectedKingdomId?: string;
  fitWholeWorld?: boolean;
  character: Character | null;
  selected: Hex | null;
  route: Route | null;
  grid: boolean;
  terrain: boolean;
  borders: boolean;
  labels: boolean;
  editor: boolean;
  tool: EditorTool;
  draftBorder: BorderPoint[];
  borderEditing?: boolean;
  borderStyle?: "straight" | "smooth";
  selectedPoint?: number | null;
  snap?: boolean;
  onPointSelect?: (index: number | null) => void;
  onBorderChange?: (points: BorderPoint[]) => void;
  onBorderStroke?: () => void;
  onBorderAction?: (
    action: "insert" | "delete" | "sharp",
    index: number,
    point?: Point,
  ) => void;
  onEditBorder?: (
    id: string,
    insertion?: { index: number; point: Point },
  ) => void;
  onTool?: (tool: EditorTool) => void;
  onCursor?: (point: Point) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onSelect: (h: Hex) => void;
  onLocation: (id: string) => void;
  onPaint: (h: Hex) => void;
  onStroke: () => void;
  onPlace: (p: Point) => void;
  onBorder: (p: Point) => void;
  onReady: (handle: MapHandle) => void;
};
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function WorldMap(props: Props) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    latest = useRef(props),
    layers = useRef<Record<string, L.LayerGroup>>({}),
    artwork = useRef<L.TileLayer | null>(null);
  const [zoom, setZoom] = useState(1.5);
  const [context, setContext] = useState<{
    x: number;
    y: number;
    point: Point;
    vertex?: number;
    segment?: number;
    kingdom?: string;
    location?: string;
  } | null>(null);
  useEffect(() => {
    if (!context) return;
    const closeOutside = (event: PointerEvent) => {
      if (!(
        event.target instanceof Element &&
        event.target.closest(".map-context-menu")
      ))
        setContext(null);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [context]);
  const draggingPoint = useRef<number | null>(null);
  latest.current = props;
  const ll = (p: Point) => L.latLng(-p.y / 8, p.x / 8);
  useEffect(() => {
    const m = L.map(container.current!, {
      crs: L.CRS.Simple,
      zoomControl: false,
      attributionControl: false,
      minZoom: -1,
      maxZoom: 7,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      preferCanvas: true,
      maxBoundsViscosity: 0.7,
    });
    map.current = m;
    const { width, height } = worldSize(props.world);
    const bounds = L.latLngBounds(
      ll({ x: 0, y: height }),
      ll({ x: width, y: 0 }),
    );
    m.setMaxBounds(bounds.pad(0.22));
    m.fitBounds(bounds, { padding: [20, 20] });
    if (container.current!.clientWidth < 600 && !props.fitWholeWorld)
      m.setView(ll(props.character ?? { x: width / 2, y: height / 2 }), 1.75);
    for (const name of [
      "territories",
      "emblems",
      "roads",
      "grid",
      "route",
      "locations",
      "character",
      "selection",
      "drawing",
      "handles",
    ])
      layers.current[name] = L.layerGroup().addTo(m);
    let painting = false,
      last = "";
    const getPoint = (e: L.LeafletMouseEvent) => ({
      x: e.latlng.lng * 8,
      y: -e.latlng.lat * 8,
    });
    const element = container.current!;
    const isBrush = () =>
      latest.current.editor &&
      [
        "terrain",
        "feature",
        "erase-feature",
        "river",
        "erase-river",
        "road",
        "erase-road",
      ].includes(latest.current.tool);
    const paintPointer = (e: PointerEvent) => {
      const p = latest.current,
        latlng = m.mouseEventToLatLng(e);
      const h = hexAt({ x: latlng.lng * 8, y: -latlng.lat * 8 }, p.world),
        k = key(h);
      if (inBounds(h, p.world) && k !== last) {
        last = k;
        p.onPaint(h);
      }
    };
    let middle: { x: number; y: number } | null = null;
    let ignoreClickUntil = 0,
      cursorFrame = 0;
    const uiTarget = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest("[data-map-ui]");
    const down = (e: PointerEvent) => {
      if (uiTarget(e.target)) return;
      if (latest.current.editor && e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        setContext(null);
        middle = { x: e.clientX, y: e.clientY };
        element.setPointerCapture(e.pointerId);
        element.classList.add("middle-panning");
        return;
      }
      if (e.button === 0) setContext(null);
      if (!isBrush() || !e.isPrimary || e.button !== 0) return;
      e.preventDefault();
      painting = true;
      last = "";
      element.setPointerCapture(e.pointerId);
      latest.current.onStroke();
      paintPointer(e);
    };
    const move = (e: PointerEvent) => {
      if (latest.current.editor && !cursorFrame)
        cursorFrame = requestAnimationFrame(() => {
          cursorFrame = 0;
          const latlng = m.mouseEventToLatLng(e);
          latest.current.onCursor?.({ x: latlng.lng * 8, y: -latlng.lat * 8 });
        });
      if (middle) {
        e.preventDefault();
        m.panBy([middle.x - e.clientX, middle.y - e.clientY], {
          animate: false,
        });
        middle = { x: e.clientX, y: e.clientY };
        return;
      }
      if (painting && e.isPrimary) {
        e.preventDefault();
        paintPointer(e);
      }
    };
    const stop = (e: PointerEvent) => {
      if (middle || painting) ignoreClickUntil = Date.now() + 100;
      middle = null;
      element.classList.remove("middle-panning");
      painting = false;
      if (element.hasPointerCapture(e.pointerId))
        element.releasePointerCapture(e.pointerId);
    };
    const contextMenu = (e: MouseEvent) => {
      const p = latest.current;
      if (!p.editor || uiTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const latlng = m.mouseEventToLatLng(e),
        point = { x: latlng.lng * 8, y: -latlng.lat * 8 };
      const rect = element.getBoundingClientRect(),
        hit = (11 * 8) / 2 ** m.getZoom();
      let vertex: number | undefined,
        segment: number | undefined,
        kingdom: string | undefined,
        location: string | undefined;
      let insertion = point;
      if (p.borderEditing) {
        const i = p.draftBorder.findIndex(
          (v) => Math.hypot(v.x - point.x, v.y - point.y) < hit,
        );
        if (i >= 0) {
          vertex = i;
          p.onPointSelect?.(i);
        } else {
          const close = closestBorderSegment(
            point,
            borderSegments(p.draftBorder, p.borderStyle, worldSize(p.world)),
          );
          if (close.distance <= hit) {
            segment = close.index;
            insertion = close.point;
          }
        }
      } else {
        for (const k of p.world.territories) {
          const close = closestBorderSegment(
            point,
            borderSegments(k.points, k.borderStyle, worldSize(p.world)),
          );
          if (close.distance <= hit) {
            kingdom = k.id;
            segment = close.index;
            insertion = close.point;
            break;
          }
        }
        location = p.world.locations.find(
          (l) => Math.hypot(l.x - point.x, l.y - point.y) < hit,
        )?.id;
      }
      setContext({
        x: Math.max(4, Math.min(rect.width - 235, e.clientX - rect.left)),
        y: Math.max(4, Math.min(rect.height - 270, e.clientY - rect.top)),
        point: insertion,
        vertex,
        segment,
        kingdom,
        location,
      });
    };
    const auxClick = (e: MouseEvent) => {
      if (latest.current.editor && e.button === 1) e.preventDefault();
    };
    const escapeMenu = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContext(null);
    };
    element.addEventListener("contextmenu", contextMenu);
    element.addEventListener("auxclick", auxClick);
    window.addEventListener("keydown", escapeMenu);
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", stop);
    element.addEventListener("pointercancel", stop);
    m.on("click", (e: L.LeafletMouseEvent) => {
      if (Date.now() < ignoreClickUntil || uiTarget(e.originalEvent?.target))
        return;
      const p = latest.current,
        point = getPoint(e);
      const { width, height } = worldSize(p.world);
      if (point.x < 0 || point.y < 0 || point.x > width || point.y > height)
        return;
      if (p.editor) {
        if (p.tool === "border-point") {
          p.onPointSelect?.(null);
          return;
        }
        if (p.tool === "location") {
          p.onPlace(point);
          return;
        }
        if (p.tool === "border") {
          p.onBorder(point);
          return;
        }
        if (
          [
            "terrain",
            "feature",
            "erase-feature",
            "river",
            "erase-river",
            "road",
            "erase-road",
          ].includes(p.tool)
        )
          return;
      }
      p.onSelect(hexAt(point, p.world));
    });
    m.on("zoomend", () => setZoom(m.getZoom()));
    setZoom(m.getZoom());
    let layoutReady = element.clientWidth > 0 && element.clientHeight > 0;
    const ro = new ResizeObserver(() => {
      m.invalidateSize();
      // A map inside a closed dialog initially has no size. Fit it once visible.
      if (!layoutReady && element.clientWidth > 0 && element.clientHeight > 0) {
        const { width, height } = worldSize(latest.current.world);
        m.fitBounds(
          L.latLngBounds(ll({ x: 0, y: height }), ll({ x: width, y: 0 })),
          { padding: [20, 20] },
        );
        layoutReady = true;
        setZoom(m.getZoom());
      }
    });
    ro.observe(container.current!);
    props.onReady({
      zoom: (d) => m.setZoom(m.getZoom() + d),
      home: () => {
        const { width, height } = worldSize(latest.current.world);
        m.fitBounds(
          L.latLngBounds(ll({ x: 0, y: height }), ll({ x: width, y: 0 })),
          { padding: [20, 20] },
        );
      },
      focus: (p) =>
        m.flyTo(ll(p), Math.max(m.getZoom(), 2.1), { duration: 0.6 }),
      focusBounds: (points) => {
        if (points.length)
          m.fitBounds(L.latLngBounds(points.map(ll)), {
            padding: [25, 25],
            maxZoom: 2.5,
          });
      },
    });
    return () => {
      ro.disconnect();
      cancelAnimationFrame(cursorFrame);
      element.removeEventListener("contextmenu", contextMenu);
      element.removeEventListener("auxclick", auxClick);
      window.removeEventListener("keydown", escapeMenu);
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", stop);
      element.removeEventListener("pointercancel", stop);
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const { width, height } = worldSize(props.world);
    const bounds = L.latLngBounds(
      ll({ x: 0, y: height }),
      ll({ x: width, y: 0 }),
    );
    const tile = L.tileLayer(
      props.world.mapAssetId
        ? mapTileUrl(props.world.mapAssetId)
        : "/map/tiles/{z}/{x}/{y}.webp",
      {
        opacity: props.editor ? (props.artworkOpacity ?? 1) : 1,
        tileSize: 256,
        minZoom: -1,
        minNativeZoom: 0,
        maxZoom: 7,
        maxNativeZoom: props.world.mapNativeZoom ?? 3,
        noWrap: true,
        bounds,
        keepBuffer: 3,
      },
    ).addTo(m);
    artwork.current = tile;
    tile.setZIndex(0);
    return () => {
      tile.remove();
      artwork.current = null;
    };
  }, [
    props.world.mapAssetId,
    props.world.mapNativeZoom,
    props.world.mapWidth,
    props.world.mapHeight,
  ]);
  useEffect(() => {
    artwork.current?.setOpacity(props.editor ? (props.artworkOpacity ?? 1) : 1);
  }, [props.editor, props.artworkOpacity]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const { width, height } = worldSize(props.world);
    const bounds = L.latLngBounds(
      ll({ x: 0, y: height }),
      ll({ x: width, y: 0 }),
    );
    m.setMaxBounds(bounds.pad(0.22));
    m.fitBounds(bounds, { padding: [20, 20] });
  }, [props.world.mapWidth, props.world.mapHeight]);
  useEffect(() => {
    const layer = layers.current.emblems;
    if (!layer) return;
    layer.clearLayers();
    if (!props.labels || zoom >= 2.5 || (props.editor && props.tool !== "pan"))
      return;
    for (const k of props.world.territories) {
      const p = k.emblemPosition ?? {
        x: k.points.reduce((a, p) => a + p.x, 0) / Math.max(1, k.points.length),
        y: k.points.reduce((a, p) => a + p.y, 0) / Math.max(1, k.points.length),
      };
      const wide = zoom < 1.5;
      L.marker(ll(p), {
        icon: L.divIcon({
          className: `kingdom-map-emblem ${wide ? "wide" : "compact"}`,
          html: `${k.emblemAssetId ? `<img src="${esc(emblemUrl(k.emblemAssetId))}" alt="" draggable="false"/>` : `<span class="fallback-flag" style="color:${/^#[0-9a-fA-F]{6}$/.test(k.color) ? k.color : "#a77845"}">⚑</span>`}<span>${esc(k.name)}</span>`,
          iconSize: [wide ? 150 : 110, wide ? 100 : 64],
          iconAnchor: [wide ? 75 : 55, wide ? 50 : 32],
        }),
        title: k.name,
        bubblingMouseEvents: false,
        interactive: !!props.onKingdom,
        keyboard: !!props.onKingdom,
        zIndexOffset: 400,
      })
        .on("click", () => latest.current.onKingdom?.(k.id))
        .addTo(layer);
    }
  }, [
    props.world.territories,
    props.labels,
    zoom,
    props.editor,
    props.tool,
    props.onKingdom,
  ]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (props.editor && props.tool !== "pan") {
      m.dragging.disable();
      m.getContainer().style.cursor =
        props.tool === "location" ? "copy" : "crosshair";
    } else {
      m.dragging.enable();
      m.getContainer().style.cursor = "";
    }
  }, [props.editor, props.tool]);
  useEffect(() => {
    const layer = layers.current.grid;
    if (!layer) return;
    layer.clearLayers();
    const showTerrain =
      props.terrain ||
      (props.editor &&
        [
          "terrain",
          "feature",
          "erase-feature",
          "river",
          "erase-river",
          "road",
          "erase-road",
        ].includes(props.tool));
    if (!props.grid && !showTerrain) return;
    for (const h of allHexes(props.world)) {
      const t = tileAt(h, props.world);
      const painted = !!props.world.tiles[key(h)];
      L.polygon(corners(h, props.world).map(ll), {
        stroke: props.grid,
        color: "#536952",
        weight: 0.65,
        opacity: 0.32,
        fill: showTerrain || (!props.editor && painted),
        fillColor: TERRAIN_COLORS[t.terrain],
        fillOpacity: showTerrain ? 0.3 : !props.editor && painted ? 0.25 : 0,
        interactive: false,
      }).addTo(layer);
      if (showTerrain && t.features.length) {
        const p = center(h, props.world),
          size = Math.min(9, props.world.radius * 0.22);
        t.features.forEach((feature, i) => {
          const x = p.x + (i - (t.features.length - 1) / 2) * size * 1.8;
          const points =
            feature === "marsh"
              ? [
                  [-0.6, 0.7],
                  [-0.6, -0.5],
                  [-0.6, 0.2],
                  [0.1, 0.2],
                  [0.1, -0.7],
                  [0.1, 0.7],
                  [0.6, 0.7],
                  [0.6, -0.3],
                ]
              : feature === "hills"
                ? [
                    [-0.8, 0.5],
                    [-0.4, -0.1],
                    [0, -0.3],
                    [0.4, -0.1],
                    [0.8, 0.5],
                  ]
                : [
                    [-0.7, 0.6],
                    [0, -0.7],
                    [0.7, 0.6],
                    [-0.7, 0.6],
                  ];
          L.polyline(
            points.map(([dx, dy]) =>
              ll({ x: x + dx * size, y: p.y + dy * size }),
            ),
            {
              color:
                feature === "forest"
                  ? "#254f35"
                  : feature === "marsh"
                    ? "#486946"
                    : "#5a4a3b",
              weight: feature === "mountain" ? 2.5 : 1.8,
              interactive: false,
            },
          ).addTo(layer);
        });
      }
      if (t.river && (showTerrain || props.grid)) {
        const p = center(h, props.world);
        L.polyline(
          [
            ll({ x: p.x - 10, y: p.y - 3 }),
            ll({ x: p.x - 3, y: p.y + 2 }),
            ll({ x: p.x + 4, y: p.y - 2 }),
            ll({ x: p.x + 11, y: p.y + 3 }),
          ],
          { color: "#3c899e", weight: 2.5, opacity: 0.85, interactive: false },
        ).addTo(layer);
      }
    }
  }, [props.world, props.grid, props.terrain, props.editor, props.tool]);
  useEffect(() => {
    const layer = layers.current.territories;
    if (!layer) return;
    layer.clearLayers();
    if (props.borders || props.editor)
      for (const t of props.world.territories)
        L.polygon(
          flattenSegments(
            borderSegments(t.points, t.borderStyle, worldSize(props.world)),
          ).map(ll),
          {
            color: t.color,
            weight: t.id === props.selectedKingdomId ? 4 : 2,
            dashArray: "7 6",
            fillColor: t.color,
            fillOpacity:
              t.id === props.selectedKingdomId
                ? 0.28
                : props.onKingdom
                  ? 0.15
                  : 0.07,
            interactive:
              !!props.onKingdom && !!props.fitWholeWorld && !props.editor,
            bubblingMouseEvents: false,
          },
        )
          .on("click", () => latest.current.onKingdom?.(t.id))
          .bindTooltip(esc(t.name))
          .addTo(layer);
  }, [
    props.world.territories,
    props.borders,
    props.editor,
    props.onKingdom,
    props.selectedKingdomId,
    props.fitWholeWorld,
  ]);
  useEffect(() => {
    const layer = layers.current.roads;
    if (!layer) return;
    layer.clearLayers();
    const segments = smoothRoadPaths(props.world).map((path) => path.map(ll));
    // Batch the graph into two canvas paths so a large road network stays cheap to render.
    if (segments.length) {
      L.polyline(segments, {
        color: "#684e32",
        weight: 5,
        opacity: 0.8,
        interactive: false,
      }).addTo(layer);
      L.polyline(segments, {
        color: "#e8d4aa",
        weight: 2,
        interactive: false,
      }).addTo(layer);
    }
  }, [props.world]);
  useEffect(() => {
    const layer = layers.current.locations;
    if (!layer) return;
    layer.clearLayers();
    for (const loc of props.world.locations) {
      if (zoom < 1.25 && !props.editor && !props.fitWholeWorld) continue;
      const icon = L.divIcon({
        className: "location-marker",
        html: `<span class="location-dot ${loc.kind}">${loc.kind === "city" ? "♜" : loc.kind === "landmark" ? "◇" : "⌂"}</span>${props.labels ? `<span class="location-label">${esc(loc.name)}${props.population ? ` <small class="population-badge">${props.population[loc.id] ?? 0}</small>` : ""}</span>` : ""}`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      L.marker(ll(loc), {
        icon,
        keyboard: !props.editor || props.tool === "pan",
        interactive: !props.editor || props.tool === "pan",
        title: loc.name,
        bubblingMouseEvents: false,
      })
        .on("click", () => latest.current.onLocation(loc.id))
        .addTo(layer);
    }
  }, [
    props.world.locations,
    props.labels,
    props.editor,
    props.tool,
    props.population,
    zoom,
  ]);
  useEffect(() => {
    const layer = layers.current.character;
    if (!layer) return;
    layer.clearLayers();
    if (props.character)
      L.marker(ll(props.character), {
        icon: L.divIcon({
          className: "traveler-marker",
          html: "<span>☀</span>",
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
        title: props.character.name,
        interactive: !props.editor || props.tool === "pan",
        keyboard: !props.editor || props.tool === "pan",
        zIndexOffset: 1000,
      })
        .on("click", () =>
          latest.current.onSelect(
            hexAt(latest.current.character!, latest.current.world),
          ),
        )
        .addTo(layer);
  }, [props.character, props.editor, props.tool]);
  useEffect(() => {
    const layer = layers.current.route;
    if (!layer) return;
    layer.clearLayers();
    if (props.route && props.route.steps > 0) {
      const points = props.route.path.map((h) => ll(center(h, props.world)));
      L.polyline(points, {
        color: "#fff9e9",
        weight: 7,
        opacity: 0.85,
        interactive: false,
      }).addTo(layer);
      L.polyline(points, {
        color: "#a76237",
        weight: 3,
        dashArray: "7 7",
        interactive: false,
      }).addTo(layer);
    }
  }, [props.route, props.world]);
  useEffect(() => {
    const layer = layers.current.selection;
    if (!layer) return;
    layer.clearLayers();
    if (props.selected)
      L.polygon(corners(props.selected, props.world).map(ll), {
        color: "#996032",
        weight: 2,
        fillColor: "#eecf83",
        fillOpacity: 0.25,
        interactive: false,
      }).addTo(layer);
  }, [props.selected, props.world]);
  useEffect(() => {
    const layer = layers.current.drawing;
    if (!layer) return;
    layer.clearLayers();
    if (props.draftBorder.length > 1) {
      const path = flattenSegments(
        borderSegments(
          props.draftBorder,
          props.borderStyle,
          worldSize(props.world),
        ),
      ).map(ll);
      (props.draftBorder.length >= 3
        ? L.polygon(path, { fillOpacity: 0.08 })
        : L.polyline(path)
      )
        .setStyle({
          color: "#e2ac50",
          weight: 3,
          dashArray: props.tool === "border" ? "5 5" : undefined,
          interactive: false,
        })
        .addTo(layer);
    }
  }, [
    props.draftBorder,
    props.borderStyle,
    props.tool,
    props.world.mapWidth,
    props.world.mapHeight,
  ]);
  useEffect(() => {
    const layer = layers.current.handles;
    if (!layer || draggingPoint.current !== null) return;
    layer.clearLayers();
    if (!props.editor || !props.borderEditing) return;
    for (const [i, p] of props.draftBorder.entries()) {
      const marker = L.marker(ll(p), {
        icon: L.divIcon({
          className: `border-handle ${props.selectedPoint === i ? "selected" : ""} ${p.sharp ? "sharp" : ""}`,
          html: `<span>${i + 1}</span>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
        draggable: true,
        keyboard: true,
        title: `Border point ${i + 1}`,
        bubblingMouseEvents: false,
        zIndexOffset: 2000,
      }).addTo(layer);
      const position = () => {
        const current = latest.current,
          { width, height } = worldSize(current.world),
          latlng = marker.getLatLng();
        let point = {
          x: Math.max(0, Math.min(width, latlng.lng * 8)),
          y: Math.max(0, Math.min(height, -latlng.lat * 8)),
        };
        if (current.snap) {
          const snapped = center(hexAt(point, current.world), current.world);
          if (
            snapped.x >= 0 &&
            snapped.x <= width &&
            snapped.y >= 0 &&
            snapped.y <= height
          )
            point = snapped;
        }
        marker.setLatLng(ll(point));
        current.onBorderChange?.(
          current.draftBorder.map((v, j) => (j === i ? { ...v, ...point } : v)),
        );
      };
      marker.on("click", () => latest.current.onPointSelect?.(i));
      marker.on("dragstart", () => {
        draggingPoint.current = i;
        latest.current.onBorderStroke?.();
        latest.current.onPointSelect?.(i);
      });
      marker.on("drag", position);
      marker.on("dragend", () => {
        draggingPoint.current = null;
        position();
      });
    }
  }, [
    props.draftBorder,
    props.selectedPoint,
    props.borderEditing,
    props.editor,
  ]);
  const menuAction = (action: () => void) => {
    setContext(null);
    action();
  };
  return (
    <div
      className="map-canvas"
      ref={container}
      aria-label="Interactive world map"
      data-testid="world-map"
      data-map-zoom={zoom}
    >
      {context && props.editor && (
        <div
          data-map-ui
          className="map-context-menu"
          role="menu"
          aria-label="Map context menu"
          style={{ left: context.x, top: context.y }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <strong>
            {context.vertex !== undefined
              ? `Border point ${context.vertex + 1}`
              : context.kingdom
                ? "Kingdom border"
                : "Map actions"}
          </strong>
          {context.vertex !== undefined && (
            <>
              <button
                role="menuitem"
                onClick={() =>
                  menuAction(() =>
                    props.onBorderAction?.("sharp", context.vertex!),
                  )
                }
              >
                {props.draftBorder[context.vertex]?.sharp
                  ? "Make smooth point"
                  : "Make sharp corner"}
              </button>
              <button
                role="menuitem"
                disabled={props.draftBorder.length <= 3}
                onClick={() =>
                  menuAction(() =>
                    props.onBorderAction?.("delete", context.vertex!),
                  )
                }
              >
                Delete point
              </button>
              <button
                role="menuitem"
                disabled={props.draftBorder.length >= 150}
                onClick={() =>
                  menuAction(() => {
                    const segment = borderSegments(
                      props.draftBorder,
                      props.borderStyle,
                      worldSize(props.world),
                    )[context.vertex!];
                    props.onBorderAction?.(
                      "insert",
                      context.vertex!,
                      segment?.[Math.floor(segment.length / 2)] ??
                        context.point,
                    );
                  })
                }
              >
                Insert point after
              </button>
            </>
          )}
          {context.segment !== undefined && context.vertex === undefined && (
            <button
              role="menuitem"
              disabled={props.draftBorder.length >= 150 && props.borderEditing}
              onClick={() =>
                menuAction(() =>
                  props.borderEditing
                    ? props.onBorderAction?.(
                        "insert",
                        context.segment!,
                        context.point,
                      )
                    : context.kingdom &&
                      props.onEditBorder?.(context.kingdom, {
                        index: context.segment!,
                        point: context.point,
                      }),
                )
              }
            >
              Insert point here
            </button>
          )}
          {context.kingdom && (
            <button
              role="menuitem"
              onClick={() =>
                menuAction(() => props.onEditBorder?.(context.kingdom!))
              }
            >
              Edit kingdom border
            </button>
          )}
          {context.location && (
            <button
              role="menuitem"
              onClick={() =>
                menuAction(() => props.onLocation(context.location!))
              }
            >
              Select settlement
            </button>
          )}
          <button
            role="menuitem"
            onClick={() =>
              menuAction(() =>
                props.onTool?.(props.borderEditing ? "border-point" : "pan"),
              )
            }
          >
            {props.borderEditing ? "Select / move points" : "Navigate"}
          </button>
          <button
            role="menuitem"
            disabled={!props.canUndo}
            onClick={() => menuAction(() => props.onUndo?.())}
          >
            Undo
          </button>
          <button
            role="menuitem"
            disabled={!props.canRedo}
            onClick={() => menuAction(() => props.onRedo?.())}
          >
            Redo
          </button>
          <button
            role="menuitem"
            onClick={() =>
              menuAction(() => {
                const { width, height } = worldSize(props.world);
                map.current?.fitBounds(
                  L.latLngBounds(
                    ll({ x: 0, y: height }),
                    ll({ x: width, y: 0 }),
                  ),
                  { padding: [20, 20] },
                );
              })
            }
          >
            Fit entire world
          </button>
        </div>
      )}
    </div>
  );
}
