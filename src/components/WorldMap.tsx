import { mapTileUrl, emblemUrl } from "../../shared/assets";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  allHexes,
  neighbors,
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
  | "terrain"
  | "river"
  | "erase-river"
  | "road"
  | "erase-road"
  | "location"
  | "border";
type Props = {
  world: World;
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
  draftBorder: Point[];
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
    layers = useRef<Record<string, L.LayerGroup>>({});
  const [zoom, setZoom] = useState(1.5);
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
      ["terrain", "river", "erase-river", "road", "erase-road"].includes(
        latest.current.tool,
      );
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
    const down = (e: PointerEvent) => {
      if (!isBrush() || !e.isPrimary || e.button !== 0) return;
      e.preventDefault();
      painting = true;
      last = "";
      element.setPointerCapture(e.pointerId);
      latest.current.onStroke();
      paintPointer(e);
    };
    const move = (e: PointerEvent) => {
      if (painting && e.isPrimary) {
        e.preventDefault();
        paintPointer(e);
      }
    };
    const stop = (e: PointerEvent) => {
      painting = false;
      if (element.hasPointerCapture(e.pointerId))
        element.releasePointerCapture(e.pointerId);
    };
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", stop);
    element.addEventListener("pointercancel", stop);
    m.on("click", (e: L.LeafletMouseEvent) => {
      const p = latest.current,
        point = getPoint(e);
      const { width, height } = worldSize(p.world);
      if (point.x < 0 || point.y < 0 || point.x > width || point.y > height)
        return;
      if (p.editor) {
        if (p.tool === "location") {
          p.onPlace(point);
          return;
        }
        if (p.tool === "border") {
          p.onBorder(point);
          return;
        }
        if (
          ["terrain", "river", "erase-river", "road", "erase-road"].includes(
            p.tool,
          )
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
    tile.setZIndex(0);
    return () => {
      tile.remove();
    };
  }, [
    props.world.mapAssetId,
    props.world.mapNativeZoom,
    props.world.mapWidth,
    props.world.mapHeight,
  ]);
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
    if (!props.grid && !props.terrain && !props.editor) return;
    for (const h of allHexes(props.world)) {
      const t = tileAt(h, props.world);
      const painted = !!props.world.tiles[key(h)];
      L.polygon(corners(h, props.world).map(ll), {
        stroke: props.grid || props.editor,
        color: "#536952",
        weight: 0.65,
        opacity: 0.32,
        fill: props.terrain || props.editor || painted,
        fillColor: TERRAIN_COLORS[t.terrain],
        fillOpacity: props.terrain || props.editor ? 0.3 : painted ? 0.25 : 0,
        interactive: false,
      }).addTo(layer);
      if (t.river && (props.terrain || props.editor || props.grid)) {
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
  }, [props.world, props.grid, props.terrain, props.editor]);
  useEffect(() => {
    const layer = layers.current.territories;
    if (!layer) return;
    layer.clearLayers();
    if (props.borders || props.editor)
      for (const t of props.world.territories)
        L.polygon(t.points.map(ll), {
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
        })
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
    const segments: L.LatLng[][] = [];
    for (const [id, tile] of Object.entries(props.world.tiles)) {
      if (!tile.road || tile.terrain === "water") continue;
      const [q, r] = id.split(",").map(Number),
        h = { q, r },
        p = center(h, props.world);
      if (!inBounds(h, props.world)) continue;
      const links = neighbors(h).filter(
        (n) =>
          inBounds(n, props.world) &&
          tileAt(n, props.world).road &&
          tileAt(n, props.world).terrain !== "water",
      );
      if (!links.length)
        segments.push([ll({ x: p.x - 9, y: p.y }), ll({ x: p.x + 9, y: p.y })]);
      for (const n of links)
        if (key(n) > id) segments.push([ll(p), ll(center(n, props.world))]);
    }
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
    if (props.draftBorder.length)
      L.polyline(props.draftBorder.map(ll), {
        color: "#a76237",
        weight: 3,
        dashArray: "5 5",
        interactive: false,
      }).addTo(layer);
    for (const p of props.draftBorder)
      L.circleMarker(ll(p), {
        radius: 4,
        color: "#fff",
        fillColor: "#a76237",
        fillOpacity: 1,
        interactive: false,
      }).addTo(layer);
  }, [props.draftBorder]);
  return (
    <div
      className="map-canvas"
      ref={container}
      aria-label="Interactive world map"
      data-testid="world-map"
      data-map-zoom={zoom}
    />
  );
}
