import { WorldAssetUpload } from "./components/WorldAssets";
import {
  CharacterReview,
  CharacterPortrait,
} from "./components/CharacterReview";
import { LocationOccupancy } from "./components/LocationOccupancy";
import { emblemUrl } from "../shared/assets";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { signOut } from "firebase/auth";
import DOMPurify from "dompurify";
import {
  Sun,
  Map as MapIcon,
  BookOpen,
  UserRound,
  Compass,
  Settings2,
  Search,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  MapPin,
  Castle,
  Trees,
  Mountain,
  Waves,
  Footprints,
  Zap,
  Plus,
  Minus,
  LocateFixed,
  Layers,
  Globe2,
  X,
  Check,
  Undo2,
  Redo2,
  Brush,
  MousePointer2,
  Save,
  Download,
  LogOut,
  Info,
  Menu,
  Clock,
  Link as LinkIcon,
  LoaderCircle,
  Shield,
  ChevronUp,
} from "lucide-react";
import {
  WorldMap,
  type MapHandle,
  type EditorTool,
} from "./components/WorldMap";
import { AuthModal } from "./components/AuthModal";
import { Modal } from "./components/Modal";
import { PlacesEditor } from "./components/PlacesEditor";
import { AdminActivation, AdminInvitations } from "./components/AdminAccess";
const CharacterCreation = lazy(() => import("./components/CharacterCreation"));
const LocationForm = lazy(() => import("./components/LocationForm"));
import {
  useCloud,
  readLocal,
  saveLocal,
  call,
  friendlyError,
} from "./useWorld";
import { auth } from "./firebase";
import {
  DEFAULT_WORLD,
  normalizeWorld,
  internalLocations,
  characterAfterWorldChange,
  characterGeneration,
  type CharacterCreationData,
  MAX_ENERGY,
  REGEN_MS,
  KM_PER_HEX,
  COSTS,
  RIVER_COST,
  TERRAIN_COLORS,
  allHexes,
  hexAt,
  hexDistance,
  center,
  key,
  tileAt,
  findRoute,
  energyNow,
  spendEnergy,
  makeCharacter,
  locationLabel,
  type World,
  type Kingdom,
  type PlaceEntry,
  type Character,
  type Location,
  type Journey,
  type Hex,
  type Terrain,
  type Point,
} from "../shared/world";
const icons = {
  city: Castle,
  town: MapPin,
  village: MapPin,
  landmark: Compass,
};
const terrainIcons = {
  plains: Sun,
  forest: Trees,
  mountain: Mountain,
  water: Waves,
};
const demoStart = () =>
  makeCharacter(
    "The Wanderer",
    "A story yet to be written",
    "",
    DEFAULT_WORLD.locations[0],
    DEFAULT_WORLD,
  );
export default function App() {
  const cloud = useCloud(),
    isDemo = !cloud.user;
  const [localWorld, setLocalWorld] = useState<World>(() =>
    normalizeWorld(readLocal("ms:world:v1", DEFAULT_WORLD)),
  );
  const [demoCharacter, setDemoCharacter] = useState<Character | null>(() =>
    readLocal("ms:character:v1", demoStart()),
  );
  const [demoJourneys, setDemoJourneys] = useState<Journey[]>(() =>
    readLocal("ms:journeys:v1", []),
  );
  const published = isDemo ? localWorld : cloud.world,
    character = isDemo ? demoCharacter : cloud.character,
    journeys = isDemo ? demoJourneys : cloud.journeys;
  const [tab, setTab] = useState<"atlas" | "journal" | "character" | "editor">(
      "atlas",
    ),
    [mobileOpen, setMobileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false),
    [characterOpen, setCharacterOpen] = useState(false),
    [aboutOpen, setAboutOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    new URLSearchParams(window.location.hash.slice(1)).get("location"),
  );
  const [selected, setSelected] = useState<Hex | null>(null),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const [grid, setGrid] = useState(false),
    [terrain, setTerrain] = useState(false),
    [borders, setBorders] = useState(true),
    [labels, setLabels] = useState(true),
    [layersOpen, setLayersOpen] = useState(false);
  const [draft, setDraft] = useState<World | null>(null),
    [past, setPast] = useState<World[]>([]),
    [future, setFuture] = useState<World[]>([]),
    [tool, setTool] = useState<EditorTool>("pan"),
    [paintTerrain, setPaintTerrain] = useState<Terrain>("plains"),
    [brushSize, setBrushSize] = useState(1),
    [draftBorder, setDraftBorder] = useState<Point[]>([]),
    [kingdomEdit, setKingdomEdit] = useState<Kingdom | null>(null),
    [placementKingdom, setPlacementKingdom] = useState<string | null>(null),
    [editorCategory, setEditorCategory] = useState<"landscape" | "places">(
      "places",
    ),
    [viewKingdom, setViewKingdom] = useState<string | null>(null),
    [viewEntry, setViewEntry] = useState<PlaceEntry | null>(null);
  const [editLocation, setEditLocation] = useState<Location | null>(null),
    [busy, setBusy] = useState(false),
    [assetBusy, setAssetBusy] = useState(false),
    [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
      null,
    ),
    [now, setNow] = useState(Date.now()),
    [travelConfirm, setTravelConfirm] = useState(false),
    [gridSettings, setGridSettings] = useState(false),
    [gridConfirm, setGridConfirm] = useState(false);
  const editor = tab === "editor" && (isDemo || cloud.admin),
    world = editor && draft ? draft : published,
    canEdit = isDemo || cloud.admin;
  const mapRef = useRef<MapHandle | null>(null),
    draftRef = useRef(draft);
  draftRef.current = draft;
  const travelLock = useRef(false),
    travelRequest = useRef<{ fingerprint: string; id: string } | null>(null);
  const notice = useCallback(
    (text: string, error = false) => setToast({ text, error }),
    [],
  );
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.error ? 10000 : 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!saveLocal("ms:world:v1", localWorld))
      notice(
        "Browser storage is full. Export your world to preserve edits.",
        true,
      );
  }, [localWorld, notice]);
  useEffect(() => {
    saveLocal("ms:character:v1", demoCharacter);
    saveLocal("ms:journeys:v1", demoJourneys);
  }, [demoCharacter, demoJourneys]);
  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(() => {
      if (!saveLocal(`ms:draft:${cloud.user?.uid ?? "demo"}`, draft))
        notice("Draft could not be autosaved. Export your world.", true);
    }, 500);
    return () => clearTimeout(timer);
  }, [draft, cloud.user, notice]);
  useLayoutEffect(() => {
    setTab("atlas");
    setDraft(null);
    setSelected(null);
    setPast([]);
    setFuture([]);
    setTravelConfirm(false);
    setCharacterOpen(false);
    setViewEntry(null);
    setViewKingdom(null);
    setEditLocation(null);
    setKingdomEdit(null);
    setTool("pan");
    setDraftBorder([]);
  }, [cloud.user?.uid]);
  useEffect(() => {
    const handler = () =>
      setSelectedId(
        new URLSearchParams(window.location.hash.slice(1)).get("location"),
      );
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) &&
        !target.isContentEditable &&
        !document.querySelector("dialog[open]")
      ) {
        e.preventDefault();
        setTab("atlas");
        setMobileOpen(true);
        setTimeout(
          () =>
            document
              .querySelector<HTMLInputElement>(
                'input[aria-label="Search locations"]',
              )
              ?.focus(),
          0,
        );
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const location = world.locations.find((l) => l.id === selectedId) ?? null;
  const destination = selected ?? (location ? hexAt(location, world) : null);
  const route = useMemo(
    () =>
      character && destination
        ? findRoute(hexAt(character, world), destination, world)
        : null,
    [character, destination?.q, destination?.r, world],
  );
  const energy = character ? energyNow(character, now) : 0;
  const places = world.locations.filter(
    (l) =>
      (filter === "all" || l.kind === filter) &&
      (l.name + " " + l.region + " " + l.summary)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const selectLocation = useCallback((id: string) => {
    setSelectedId(id);
    setSelected(null);
    window.history.replaceState(
      null,
      "",
      `#location=${encodeURIComponent(id)}`,
    );
    setMobileOpen(false);
  }, []);
  const selectHex = useCallback((h: Hex) => {
    setSelected(h);
    setSelectedId(null);
    window.history.replaceState(null, "", window.location.pathname);
    setMobileOpen(false);
  }, []);
  function closeDetails() {
    setSelected(null);
    setSelectedId(null);
    window.history.replaceState(null, "", window.location.pathname);
  }
  function focusLocation(l: Location) {
    selectLocation(l.id);
    mapRef.current?.focus(l);
  }
  function navigate(next: typeof tab) {
    setTab(next);
    setMobileOpen(true);
    if (next === "editor" && canEdit && !draft) {
      const saved = readLocal<World | null>(
        `ms:draft:${cloud.user?.uid ?? "demo"}`,
        null,
      );
      setDraft(
        saved && saved.version === published.version
          ? normalizeWorld(saved)
          : structuredClone(published),
      );
      setPast([]);
      setFuture([]);
    }
  }
  const checkpoint = useCallback(() => {
    if (draftRef.current) {
      setPast((p) => [...p.slice(-29), structuredClone(draftRef.current!)]);
      setFuture([]);
    }
  }, []);
  function changeWorld(next: World) {
    checkpoint();
    setDraft(normalizeWorld(next));
  }
  const paint = useCallback(
    (h: Hex) => {
      setDraft((current) => {
        if (!current) return current;
        const tiles = { ...current.tiles };
        const cells =
          brushSize === 1
            ? [h]
            : allHexes(current).filter((n) => hexDistance(n, h) < brushSize);
        for (const n of cells) {
          const t = tileAt(n, current);
          tiles[key(n)] = {
            ...t,
            ...(tool === "terrain"
              ? { terrain: paintTerrain }
              : tool === "road" || tool === "erase-road"
                ? { road: tool === "road" }
                : { river: tool === "river" }),
          };
        }
        return { ...current, tiles };
      });
    },
    [tool, paintTerrain, brushSize],
  );
  function undo() {
    if (!past.length || !draft) return;
    setFuture((f) => [draft, ...f]);
    setDraft(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
  }
  function redo() {
    if (!future.length || !draft) return;
    setPast((p) => [...p, draft]);
    setDraft(future[0]);
    setFuture((f) => f.slice(1));
  }
  async function publish(confirmed = false) {
    if (!draft) return;
    const geometryChanged =
      draft.radius !== published.radius ||
      draft.offsetX !== published.offsetX ||
      draft.offsetY !== published.offsetY;
    if (geometryChanged && !confirmed) {
      setGridConfirm(true);
      return;
    }
    setBusy(true);
    try {
      for (const l of draft.locations.filter((l) => l.starting))
        if (tileAt(hexAt(l, draft), draft).terrain === "water")
          throw new Error("Starting settlements must be walkable.");
      if (character) {
        const updated = characterAfterWorldChange(
          character,
          draft,
          geometryChanged,
        );
        if (tileAt(hexAt(updated, draft), draft).terrain === "water")
          throw new Error(
            "Your traveler’s tile or grid-reset destination must remain walkable.",
          );
      }
      let next: World;
      if (isDemo) {
        next = { ...draft, version: published.version + 1 };
        saveLocal("ms:world-backup:v1", published);
        if (demoCharacter) {
          const updated = characterAfterWorldChange(
            demoCharacter,
            next,
            geometryChanged,
          );
          setDemoCharacter(updated);
          if (geometryChanged && updated.originLocationId) {
            const origin = next.locations.find(
              (l) => l.id === updated.originLocationId,
            )!;
            setDemoJourneys((list) =>
              [
                {
                  id: crypto.randomUUID(),
                  from: locationLabel(demoCharacter, published),
                  to: `${origin.name} (grid reset)`,
                  cost: 0,
                  at: Date.now(),
                },
                ...list,
              ].slice(0, 20),
            );
          }
        }
        setLocalWorld(next);
      } else next = await call<World>("publishWorld", { world: draft });
      setDraft(next);
      setPast([]);
      setFuture([]);
      setGridConfirm(false);
      notice(
        isDemo
          ? "World changes saved in this browser."
          : "World published for all players.",
      );
    } catch (e) {
      notice(friendlyError(e), true);
    } finally {
      setBusy(false);
    }
  }
  function beginCharacterCreation() {
    if (!isDemo && cloud.application?.status === "pending") {
      setTab("character");
      setMobileOpen(true);
      notice("Your character is already awaiting admin review.");
      return;
    }
    setCharacterOpen(true);
  }
  async function create(data: CharacterCreationData) {
    try {
      if (isDemo) {
        const l = published.locations.find(
          (l) => l.id === data.locationId && l.starting && l.kingdomId,
        );
        if (!l || tileAt(hexAt(l, published), published).terrain === "water")
          throw new Error("Choose a walkable starting settlement.");
        if (
          demoCharacter &&
          data.expectedGeneration !== characterGeneration(demoCharacter)
        )
          throw new Error("Your character changed. Reopen character creation.");
        setDemoCharacter({
          ...makeCharacter(data.name, data.title, data.bio, l, published),
          realName: data.realName,
          portrait: data.portrait,
          incarnationId: data.requestId,
          currentLocationId: l.id,
          internalLocationId: null,
        });
        setDemoJourneys([]);
      } else await call<Character>("createCharacter", data);
      closeDetails();
      setTab("character");
      setMobileOpen(true);
      travelRequest.current = null;
      notice(
        isDemo
          ? "Your story has a place in the world."
          : "Your character was submitted for admin review.",
      );
    } catch (e) {
      throw new Error(friendlyError(e));
    }
  }
  async function travel() {
    if (!route || !destination || !character || travelLock.current) return;
    travelLock.current = true;
    setBusy(true);
    try {
      const now = Date.now(),
        pos = center(destination, published);
      if (isDemo) {
        const current = demoCharacter!;
        const validated = findRoute(
          hexAt(current, published),
          destination,
          published,
        );
        if (!validated || !validated.steps)
          throw new Error("Choose a reachable destination.");
        const update = {
          ...current,
          ...pos,
          ...spendEnergy(current, validated.cost, now),
        };
        setDemoCharacter(update);
        setDemoJourneys((list) =>
          [
            {
              id: crypto.randomUUID(),
              from: locationLabel(current, published),
              to: locationLabel(pos, published),
              cost: validated.cost,
              at: now,
            },
            ...list,
          ].slice(0, 20),
        );
      } else {
        const fingerprint = `${characterGeneration(character)}:${key(destination)}:${published.version}:${character.x}:${character.y}:${character.energy}`;
        if (travelRequest.current?.fingerprint !== fingerprint)
          travelRequest.current = { fingerprint, id: crypto.randomUUID() };
        await call("travel", {
          destination: pos,
          worldVersion: published.version,
          generation: characterGeneration(character),
          requestId: travelRequest.current.id,
        });
        travelRequest.current = null;
      }
      setNow(now);
      setTravelConfirm(false);
      notice(`You’ve arrived at ${locationLabel(pos, published)}.`);
      mapRef.current?.focus(pos);
    } catch (e) {
      notice(friendlyError(e), true);
      setTravelConfirm(false);
    } finally {
      setBusy(false);
      travelLock.current = false;
    }
  }
  function exportWorld() {
    const blob = new Blob([JSON.stringify(world, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "merging-sun-world.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice("World exported, including locations and lore.");
  }
  function addLocation(p: Point) {
    const kingdom = draft?.territories.find((k) => k.id === placementKingdom);
    if (!kingdom) {
      notice("Choose a kingdom before adding a settlement.", true);
      return;
    }
    setTool("pan");
    setEditLocation({
      id: `place-${crypto.randomUUID().slice(0, 8)}`,
      name: "",
      kind: "town",
      ...p,
      kingdomId: kingdom.id,
      entries: [],
      region: kingdom.name,
      summary: "",
      lore: "<p>Every place has a story.</p>",
      starting: false,
    });
  }
  function finishBorder() {
    if (
      !draft ||
      !kingdomEdit ||
      draftBorder.length < 3 ||
      draftBorder.length > 150 ||
      !kingdomEdit.name.trim()
    )
      return;
    const kingdom = {
      ...kingdomEdit,
      name: kingdomEdit.name.trim(),
      points: draftBorder,
    };
    changeWorld({
      ...draft,
      territories: draft.territories.some((k) => k.id === kingdom.id)
        ? draft.territories.map((k) => (k.id === kingdom.id ? kingdom : k))
        : [...draft.territories, kingdom],
    });
    setKingdomEdit(null);
    setDraftBorder([]);
    setTool("pan");
    notice("Kingdom and border saved to the draft.");
  }
  function cancelKingdomEdit() {
    setKingdomEdit(null);
    setDraftBorder([]);
    setTool("pan");
  }
  function resizeGrid(radius: number, offsetX: number, offsetY: number) {
    if (!draft) return;
    const next = { ...draft, radius, offsetX, offsetY, tiles: {} };
    const tiles: World["tiles"] = {};
    for (const h of allHexes(next)) {
      const old = hexAt(center(h, next), draft);
      if (draft.tiles[key(old)]) tiles[key(h)] = { ...draft.tiles[key(old)] };
    }
    changeWorld({ ...next, tiles });
    notice(
      "Grid updated. Existing paint transferred by tile center; review before publishing.",
    );
  }
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(published);
  if (!cloud.authReady)
    return (
      <main className="creation-loading" role="status">
        <Sun size={36} />
        <p>Opening the atlas…</p>
      </main>
    );
  if (window.location.pathname.replace(/\/$/, "") === "/admin/activate")
    return (
      <>
        <AdminActivation
          user={cloud.user}
          admin={cloud.admin}
          onSignIn={() => setAuthOpen(true)}
        />
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      </>
    );
  if (characterOpen)
    return (
      <Suspense
        fallback={
          <main className="creation-loading">
            <Sun size={36} />
            <p>Opening your story…</p>
          </main>
        }
      >
        <CharacterCreation
          world={published}
          demo={isDemo}
          scope={cloud.user?.uid ?? "demo"}
          existing={character}
          application={isDemo ? null : cloud.application}
          onClose={() => setCharacterOpen(false)}
          onSave={create}
        />
      </Suspense>
    );
  return (
    <div className="app-shell">
      <nav className="rail" aria-label="Main navigation">
        <a
          className="brand-mark"
          href="#"
          aria-label="Merging Sun home"
          onClick={() => {
            navigate("atlas");
            closeDetails();
          }}
        >
          <Sun size={29} strokeWidth={1.35} />
        </a>
        <div className="rail-main">
          {(
            [
              { id: "atlas", label: "World atlas", icon: MapIcon },
              { id: "journal", label: "Lore library", icon: BookOpen },
              { id: "character", label: "My character", icon: UserRound },
            ] as const
          ).map((n) => (
            <button
              key={n.id}
              title={n.label}
              aria-label={n.label}
              className={`rail-item ${tab === n.id ? "active" : ""}`}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={21} />
              <span>
                {n.id === "atlas"
                  ? "Atlas"
                  : n.id === "journal"
                    ? "Lore"
                    : "Character"}
              </span>
            </button>
          ))}
          {canEdit && (
            <button
              title="World editor"
              aria-label="World editor"
              className={`rail-item ${editor ? "active" : ""}`}
              onClick={() => navigate("editor")}
            >
              <Settings2 size={21} />
              <span>Editor</span>
            </button>
          )}
        </div>
        <div className="rail-bottom">
          <button
            className="rail-item"
            title="About this preview"
            aria-label="About this preview"
            onClick={() => setAboutOpen(true)}
          >
            <Info size={19} />
          </button>
          <button
            className="account-avatar"
            aria-label={cloud.user ? "Sign out" : "Sign in"}
            title={cloud.user ? "Sign out" : "Sign in"}
            onClick={() =>
              cloud.user
                ? void signOut(auth).catch((e) =>
                    notice(friendlyError(e), true),
                  )
                : setAuthOpen(true)
            }
          >
            {cloud.user ? <LogOut size={17} /> : <UserRound size={18} />}
          </button>
        </div>
      </nav>
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-wordmark">
            MERGING SUN<span>A WORLD WORTH BELONGING TO</span>
          </div>
          <button
            className="icon-button mobile-close"
            aria-label="Close sidebar"
            onClick={() => setMobileOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="sidebar-scroll">
          {(tab === "atlas" || tab === "journal") && (
            <>
              <div className="section-intro">
                <span className="eyebrow">
                  {tab === "atlas"
                    ? "YOUR NEXT CHAPTER"
                    : "STORIES OF THE REALM"}
                </span>
                <h1>
                  {tab === "atlas" ? "A world awaits." : "The living archive."}
                </h1>
                <p>
                  {tab === "atlas"
                    ? "Find a place. Discover its story.\nLeave a little of your own."
                    : "Every place holds a story.\nFollow a thread into the world."}
                </p>
              </div>
              <div className="search-field">
                <Search size={17} />
                <input
                  aria-label="Search locations"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search the world…"
                />
                {query && (
                  <button
                    className="bare"
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                  >
                    <X size={14} />
                  </button>
                )}
                <kbd>/</kbd>
              </div>
              <div className="filter-tabs" aria-label="Location types">
                {[
                  { id: "all", label: "All places" },
                  { id: "city", label: "Cities" },
                  { id: "town", label: "Towns" },
                  { id: "village", label: "Villages" },
                  { id: "landmark", label: "Landmarks" },
                ].map((f) => (
                  <button
                    key={f.id}
                    className={filter === f.id ? "active" : ""}
                    onClick={() => setFilter(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {tab === "atlas" &&
                !query &&
                filter === "all" &&
                world.locations.length > 0 && (
                  <button
                    className="featured-card"
                    onClick={() => {
                      const l =
                        world.locations.find((l) => l.id === "emberfall") ??
                        world.locations[0];
                      if (l) focusLocation(l);
                    }}
                  >
                    <div className="featured-art">
                      <div className="feature-sun" />
                      <div className="city-silhouette">
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                      </div>
                      <span className="featured-label">
                        BEGIN YOUR EXPLORATION
                      </span>
                    </div>
                    <div className="featured-copy">
                      <span className="eyebrow">THE HEART OF THE REACH</span>
                      <h3>
                        {world.locations.find((l) => l.id === "emberfall")
                          ?.name ??
                          world.locations[0]?.name ??
                          "Discover the world"}
                      </h3>
                      <p>A thousand hearths. A thousand stories.</p>
                      <span className="feature-link">
                        Discover this place <ArrowUpRight size={16} />
                      </span>
                    </div>
                  </button>
                )}
              <div className="list-heading">
                <span>
                  {query
                    ? "SEARCH RESULTS"
                    : tab === "journal"
                      ? "LORE ENTRIES"
                      : "PLACES TO DISCOVER"}
                </span>
                <span>{places.length} places</span>
              </div>
              <div className="place-list">
                {places.map((l) => {
                  const Icon = icons[l.kind];
                  return (
                    <button
                      className={`place-item ${selectedId === l.id ? "selected" : ""}`}
                      key={l.id}
                      onClick={() => focusLocation(l)}
                    >
                      <span className={`place-icon ${l.kind}`}>
                        <Icon size={20} strokeWidth={1.5} />
                      </span>
                      <span className="place-copy">
                        <strong>{l.name}</strong>
                        <small>{l.region || l.kind}</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  );
                })}
                {!places.length && (
                  <div className="empty-state">
                    <Search size={25} />
                    <p>No places found.</p>
                    <button
                      className="text-button"
                      onClick={() => {
                        setQuery("");
                        setFilter("all");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
              <div className="sidebar-tip">
                <Compass size={22} strokeWidth={1.3} />
                <p>
                  Not all who wander are lost.
                  <br />
                  <span>Click anywhere on the map to plan a journey.</span>
                </p>
              </div>
            </>
          )}
          {tab === "character" && (
            <>
              <div className="section-intro">
                <span className="eyebrow">YOUR PLACE IN THE WORLD</span>
                <h1>Your story.</h1>
                <p>
                  {isDemo
                    ? "A local traveler, ready to explore."
                    : "A character. A journey. A world to call home."}
                </p>
              </div>
              {!isDemo && cloud.application && (
                <section
                  className="application-status form-stack"
                  aria-label="Character review status"
                >
                  <h3>
                    {cloud.application.status === "pending"
                      ? "Awaiting admin review"
                      : cloud.application.status === "rejected"
                        ? "Changes requested"
                        : "Character approved"}
                  </h3>
                  <p>{cloud.application.candidate.name}</p>
                  {cloud.application.status === "pending" && (
                    <p>
                      {character
                        ? "Your current character remains active while this replacement is reviewed."
                        : "You can explore the lore while an admin reviews your character. Travel becomes available after approval."}
                    </p>
                  )}
                  {cloud.application.status === "rejected" && (
                    <>
                      <p className="rejection-reason">
                        {cloud.application.rejectionReason}
                      </p>
                      <button
                        className="button primary"
                        onClick={() => beginCharacterCreation()}
                      >
                        Edit and resubmit
                      </button>
                    </>
                  )}
                </section>
              )}
              {character ? (
                <>
                  <div className="character-profile">
                    <div className="portrait large">
                      {!isDemo &&
                      (character.portraitPath || character.portrait) &&
                      cloud.user ? (
                        <CharacterPortrait
                          uid={cloud.user.uid}
                          version={characterGeneration(character)}
                          alt={`${character.name} portrait`}
                        />
                      ) : character.portrait ? (
                        <img
                          src={character.portrait}
                          alt={`${character.name} portrait`}
                        />
                      ) : (
                        <Sun size={40} strokeWidth={1} />
                      )}
                    </div>
                    <h2>{character.name}</h2>
                    <span>{character.title || "Traveler of the Reach"}</span>
                    <small className="origin-label">
                      Origin ·{" "}
                      {published.locations.find(
                        (l) => l.id === character.originLocationId,
                      )?.name ?? "No origin settlement"}
                    </small>
                    <p>
                      {character.bio || "Your story is still being written."}
                    </p>
                    {character.realName && (
                      <p className="private-name">
                        Player: {character.realName}
                        <small>Only you and admins can read this name.</small>
                      </p>
                    )}
                    <button
                      className="button secondary"
                      onClick={() => {
                        mapRef.current?.focus(character);
                        setMobileOpen(false);
                      }}
                    >
                      <LocateFixed size={16} /> Find on map
                    </button>
                  </div>
                  <div className="stats-row">
                    <div>
                      <span>ENERGY</span>
                      <strong>
                        {energy}
                        <small> / 100</small>
                      </strong>
                    </div>
                    <div>
                      <span>JOURNEYS</span>
                      <strong>
                        {journeys.length}
                        {journeys.length === 20 ? "+" : ""}
                      </strong>
                    </div>
                  </div>
                  <div className="info-note">
                    <Zap size={18} />
                    <span>
                      Recover 1 energy every 5 minutes, up to 100. Travel is
                      instant.
                    </span>
                  </div>
                  <div className="list-heading">
                    <span>RECENT JOURNEYS</span>
                    <Clock size={14} />
                  </div>
                  {journeys.length ? (
                    journeys.map((j) => (
                      <div className="journey-item" key={j.id}>
                        <Footprints size={17} />
                        <div>
                          <strong>{j.to}</strong>
                          <small>From {j.from}</small>
                          <time>
                            {new Date(j.at).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        </div>
                        <span>
                          −{j.cost}
                          <Zap size={12} />
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">
                      <Footprints size={26} />
                      <p>Your first journey is waiting.</p>
                      <span>Choose a place on the map to begin.</span>
                    </div>
                  )}
                  <button
                    className="button secondary full"
                    disabled={
                      !isDemo && cloud.application?.status === "pending"
                    }
                    onClick={() => beginCharacterCreation()}
                  >
                    {isDemo
                      ? "Create your own demo character"
                      : "Recreate character"}
                  </button>
                  {!isDemo && !cloud.admin && (
                    <a className="text-button" href="/admin/activate">
                      Activate admin access
                    </a>
                  )}
                </>
              ) : (
                <div className="empty-state">
                  <UserRound size={36} />
                  <h3>Who will you become?</h3>
                  <p>Give your character a name and a place to begin.</p>
                  <button
                    className="button primary"
                    disabled={
                      !isDemo && cloud.application?.status === "pending"
                    }
                    onClick={() => beginCharacterCreation()}
                  >
                    {cloud.application?.status === "pending"
                      ? "Awaiting review"
                      : "Create character"}{" "}
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
          {editor && draft && (
            <>
              <div className="section-intro editor-intro">
                <span className="eyebrow">
                  {isDemo ? "LOCAL SANDBOX" : "ADMIN WORKSPACE"}
                </span>
                <h1>Shape the world.</h1>
                <p>
                  {isDemo
                    ? "Try the tools. Changes stay in this browser."
                    : "Draft changes, then publish them for your players."}
                </p>
              </div>
              <div className="editor-status">
                <span className={dirty ? "status-dot amber" : "status-dot"} />
                {dirty ? "Unpublished changes" : "Up to date"}
                <span className="undo-buttons">
                  <button
                    className="icon-button"
                    aria-label="Undo map edit"
                    disabled={!past.length}
                    onClick={undo}
                  >
                    <Undo2 size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Redo map edit"
                    disabled={!future.length}
                    onClick={redo}
                  >
                    <Redo2 size={16} />
                  </button>
                </span>
              </div>
              <div
                className="segmented editor-categories"
                aria-label="Editor category"
              >
                {(["places", "landscape"] as const).map((category) => (
                  <button
                    key={category}
                    className={editorCategory === category ? "active" : ""}
                    aria-pressed={editorCategory === category}
                    onClick={() => {
                      if (
                        kingdomEdit &&
                        !window.confirm("Discard the unsaved kingdom form?")
                      )
                        return;
                      cancelKingdomEdit();
                      setEditorCategory(category);
                      closeDetails();
                    }}
                  >
                    {category === "places" ? "Places" : "Landscape"}
                  </button>
                ))}
              </div>
              {editorCategory === "places" ? (
                <>
                  <PlacesEditor
                    world={draft}
                    demo={isDemo}
                    onChange={changeWorld}
                    onEditSettlement={setEditLocation}
                    onFocus={focusLocation}
                    onAddSettlement={(id) => {
                      setPlacementKingdom(id);
                      setTool("location");
                      closeDetails();
                      setMobileOpen(false);
                    }}
                    kingdomEdit={kingdomEdit}
                    onEditKingdom={(k) => {
                      setKingdomEdit(k);
                      setDraftBorder(k.points);
                      setTool("pan");
                      closeDetails();
                    }}
                    onKingdomChange={setKingdomEdit}
                    borderPoints={draftBorder}
                    onBorderPoints={setDraftBorder}
                    drawing={tool === "border"}
                    onDraw={() => {
                      setDraftBorder([]);
                      setTool("border");
                      setMobileOpen(false);
                    }}
                    onSaveKingdom={finishBorder}
                    onCancelKingdom={cancelKingdomEdit}
                  />
                  {tool === "location" && (
                    <p className="info-note">
                      Click the map to place a settlement in{" "}
                      {
                        draft.territories.find((k) => k.id === placementKingdom)
                          ?.name
                      }
                      .
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="tool-grid">
                    {(
                      [
                        { id: "pan", label: "Navigate", icon: MousePointer2 },
                        { id: "terrain", label: "Terrain", icon: Brush },
                        { id: "river", label: "Add river", icon: Waves },
                        { id: "road", label: "Add road", icon: Footprints },
                        { id: "erase-road", label: "Erase road", icon: Minus },
                        {
                          id: "erase-river",
                          label: "Erase river",
                          icon: Minus,
                        },
                      ] as const
                    ).map((t) => (
                      <button
                        className={tool === t.id ? "active" : ""}
                        key={t.id}
                        onClick={() => {
                          setTool(t.id);
                          setDraftBorder([]);
                        }}
                      >
                        <t.icon size={19} />
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>
                  {tool === "terrain" && (
                    <>
                      <label className="field-label">BASE TERRAIN</label>
                      <div className="terrain-options">
                        {(
                          ["plains", "forest", "mountain", "water"] as Terrain[]
                        ).map((t) => {
                          const Icon = terrainIcons[t];
                          return (
                            <button
                              key={t}
                              className={paintTerrain === t ? "active" : ""}
                              onClick={() => setPaintTerrain(t)}
                            >
                              <Icon
                                size={18}
                                style={{ color: TERRAIN_COLORS[t] }}
                              />
                              <span>{t}</span>
                              <small>
                                {t === "water"
                                  ? "Blocked"
                                  : `${COSTS[t]} energy`}
                              </small>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {[
                    "terrain",
                    "river",
                    "erase-river",
                    "road",
                    "erase-road",
                  ].includes(tool) && (
                    <>
                      <label className="field-label">BRUSH SIZE</label>
                      <div className="segmented">
                        {[1, 2, 3].map((s) => (
                          <button
                            key={s}
                            className={brushSize === s ? "active" : ""}
                            onClick={() => setBrushSize(s)}
                          >
                            {s === 1 ? "Single" : s === 2 ? "Small" : "Large"}
                          </button>
                        ))}
                      </div>
                      <div className="info-note">
                        <Info size={17} />
                        <span>
                          {tool === "terrain"
                            ? "Paint by clicking or dragging across hexes. Water blocks walking."
                            : tool === "river"
                              ? "Add +3 energy whenever a traveler enters a river tile."
                              : tool === "road"
                                ? "Roads halve terrain costs. River surcharges stay the same. Paint by clicking or dragging."
                                : tool === "erase-road"
                                  ? "Remove roads without changing terrain or rivers."
                                  : "Remove the river modifier without changing base terrain."}
                        </span>
                      </div>
                    </>
                  )}
                  {tool === "pan" && (
                    <div className="info-note">
                      <MousePointer2 size={17} />
                      <span>
                        Explore the draft, select locations to edit, or click a
                        hex to test a route.
                      </span>
                    </div>
                  )}
                  <WorldAssetUpload
                    kind="map"
                    onBusyChange={setAssetBusy}
                    value={draft.mapAssetId}
                    demo={isDemo}
                    onChange={(mapAssetId, mapNativeZoom) =>
                      changeWorld({
                        ...draft,
                        mapAssetId,
                        mapNativeZoom: mapNativeZoom ?? 3,
                      })
                    }
                  />
                  <button
                    className="disclosure"
                    onClick={() => setGridSettings((s) => !s)}
                  >
                    <span>
                      <Layers size={16} /> Grid settings
                    </span>
                    {gridSettings ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </button>
                  {gridSettings && (
                    <div className="grid-settings">
                      <label>
                        Hex radius <strong>{draft.radius} px</strong>
                        <input
                          aria-label="Hex radius"
                          type="range"
                          min={28}
                          max={80}
                          step={2}
                          value={draft.radius}
                          onChange={(e) =>
                            resizeGrid(
                              Number(e.target.value),
                              draft.offsetX,
                              draft.offsetY,
                            )
                          }
                        />
                      </label>
                      <div className="form-row">
                        <label>
                          Offset X
                          <input
                            aria-label="Grid offset X"
                            type="number"
                            min={-80}
                            max={80}
                            value={draft.offsetX}
                            onChange={(e) =>
                              resizeGrid(
                                draft.radius,
                                Math.max(
                                  -80,
                                  Math.min(80, Number(e.target.value)),
                                ),
                                draft.offsetY,
                              )
                            }
                          />
                        </label>
                        <label>
                          Offset Y
                          <input
                            aria-label="Grid offset Y"
                            type="number"
                            min={-80}
                            max={80}
                            value={draft.offsetY}
                            onChange={(e) =>
                              resizeGrid(
                                draft.radius,
                                draft.offsetX,
                                Math.max(
                                  -80,
                                  Math.min(80, Number(e.target.value)),
                                ),
                              )
                            }
                          />
                        </label>
                      </div>
                      <p className="fine-print">
                        Pointy-top hexes · 5 km per step. Changing grid size or
                        alignment returns characters with an origin to their
                        original starting settlement when published. Characters
                        without an origin keep their map position. Energy is
                        unchanged. Paint transfers by tile center; inspect
                        before saving.
                      </p>
                    </div>
                  )}
                </>
              )}
              {!isDemo && cloud.admin && (
                <>
                  <CharacterReview world={published} />
                  <AdminInvitations />
                </>
              )}
              <div className="editor-actions">
                <button
                  className="button primary full"
                  disabled={busy || assetBusy || !dirty || !!kingdomEdit}
                  onClick={() => void publish()}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Save size={16} />
                  )}{" "}
                  {isDemo ? "Save local world" : "Publish world"}
                </button>
                <button className="button secondary full" onClick={exportWorld}>
                  <Download size={16} /> Export world
                </button>
                <button
                  className="text-button"
                  disabled={!dirty}
                  onClick={() => {
                    if (window.confirm("Discard unpublished changes?")) {
                      setDraft(structuredClone(published));
                      setPast([]);
                      setFuture([]);
                      cancelKingdomEdit();
                    }
                  }}
                >
                  Discard draft changes
                </button>
                {isDemo && (
                  <button
                    className="text-button"
                    onClick={() => {
                      const previous = readLocal<World | null>(
                        "ms:world-backup:v1",
                        null,
                      );
                      if (!previous) {
                        notice(
                          "No earlier published version is available yet.",
                        );
                        return;
                      }
                      changeWorld({
                        ...normalizeWorld(previous),
                        version: published.version,
                      });
                      notice(
                        "Previous world restored into the draft. Review, then save.",
                      );
                    }}
                  >
                    Restore previous local world
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        <div className="sidebar-footer">
          {character ? (
            <>
              <button
                className="traveler-summary"
                onClick={() => navigate("character")}
              >
                <span className="portrait">
                  <Sun size={23} strokeWidth={1.25} />
                </span>
                <span>
                  <strong>{character.name}</strong>
                  <small>
                    <MapPin size={11} />
                    {locationLabel(character, published)}
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
              <div className="energy-label">
                <span>
                  <Zap size={13} /> ENERGY
                </span>
                <strong>
                  {energy}
                  <small> / {MAX_ENERGY}</small>
                </strong>
              </div>
              <div className="energy-track">
                <i style={{ width: `${energy}%` }} />
              </div>
              <div className="footer-caption">
                {isDemo
                  ? "DEMO TRAVELER · SAVED ON THIS DEVICE"
                  : "YOUR CHARACTER · SYNCED WITH FIREBASE"}
              </div>
            </>
          ) : (
            <button
              className="button primary full"
              onClick={() => beginCharacterCreation()}
            >
              <Plus size={16} /> Create your character
            </button>
          )}
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-title">
            <button
              className="icon-button mobile-menu"
              aria-label="Open sidebar"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={21} />
            </button>
            <Globe2 size={18} />
            <span>The World Atlas</span>
            <ChevronRight size={13} />
            <small>{editor ? "World editor" : "The known world"}</small>
          </div>
          <div className="topbar-actions">
            <span className="preview-badge">
              <i />
              {isDemo
                ? "LOCAL PREVIEW"
                : cloud.status === "connected"
                  ? "CONNECTED"
                  : "BACKEND NOT READY"}
            </span>
            {cloud.user ? (
              <span className="user-label">
                {cloud.admin ? <Shield size={14} /> : <UserRound size={14} />}{" "}
                {cloud.user.email?.split("@")[0]}
              </span>
            ) : (
              <button
                className="text-button sign-in"
                onClick={() => setAuthOpen(true)}
              >
                Sign in <ArrowUpRight size={15} />
              </button>
            )}
          </div>
        </header>
        <section className="map-stage" aria-label="World atlas">
          <WorldMap
            world={world}
            population={isDemo ? undefined : cloud.population}
            onKingdom={editor ? undefined : setViewKingdom}
            character={character}
            selected={destination}
            route={route}
            grid={grid}
            terrain={terrain}
            borders={borders}
            labels={labels}
            editor={editor}
            tool={tool}
            draftBorder={editor ? draftBorder : []}
            onSelect={selectHex}
            onLocation={selectLocation}
            onPaint={paint}
            onStroke={checkpoint}
            onPlace={addLocation}
            onBorder={(p) => {
              if (kingdomEdit)
                setDraftBorder((points) =>
                  points.length < 150 ? [...points, p] : points,
                );
            }}
            onReady={(handle) => {
              mapRef.current = handle;
              if (location) handle.focus(location);
            }}
          />
          <div className="map-heading">
            <span className="map-heading-icon">
              <Sun size={22} strokeWidth={1.3} />
            </span>
            <div>
              <h2>The lands of Merging Sun</h2>
              <p>
                {editor
                  ? "Your world, waiting to be shaped."
                  : "Every journey begins with a place."}
              </p>
            </div>
          </div>
          {editor && tool !== "pan" && (
            <div className="editing-banner">
              <Brush size={15} />
              {tool === "terrain"
                ? `Painting ${paintTerrain}`
                : tool === "river"
                  ? "Adding river modifiers"
                  : tool === "erase-river"
                    ? "Erasing river modifiers"
                    : tool === "road"
                      ? "Adding roads"
                      : tool === "erase-road"
                        ? "Erasing roads"
                        : tool === "location"
                          ? "Click to place a settlement"
                          : "Click to draw the kingdom border"}
              <button
                onClick={() => setTool("pan")}
                aria-label="Stop editing tool"
              >
                <X size={15} />
              </button>
            </div>
          )}
          {cloud.user && cloud.status === "unavailable" && (
            <div className="backend-notice">
              <Info size={16} />
              <span>
                Signed in. Deploy the included Firebase backend and rules to
                enable your saved world.
              </span>
            </div>
          )}
          <div className="map-tools">
            <button
              aria-label="Zoom in"
              title="Zoom in"
              onClick={() => mapRef.current?.zoom(0.5)}
            >
              <Plus size={20} />
            </button>
            <button
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() => mapRef.current?.zoom(-0.5)}
            >
              <Minus size={20} />
            </button>
            <div className="tool-divider" />
            <button
              aria-label="Fit entire world"
              title="Fit entire world"
              onClick={() => mapRef.current?.home()}
            >
              <Globe2 size={19} />
            </button>
            <button
              aria-label="Find my character"
              title="Find my character"
              onClick={() =>
                character
                  ? mapRef.current?.focus(character)
                  : beginCharacterCreation()
              }
            >
              <LocateFixed size={19} />
            </button>
          </div>
          <div className="map-bottom-left">
            <div className="layers-wrap">
              <button
                className={`layer-trigger ${layersOpen ? "active" : ""}`}
                onClick={() => setLayersOpen((o) => !o)}
                aria-expanded={layersOpen}
              >
                <Layers size={17} /> Map layers <ChevronDown size={14} />
              </button>
              {layersOpen && (
                <div className="layers-menu">
                  <h3>Make the map yours</h3>
                  {[
                    { label: "Hex grid", value: grid, set: setGrid },
                    {
                      label: "Terrain colors",
                      value: terrain,
                      set: setTerrain,
                    },
                    {
                      label: "Kingdom borders",
                      value: borders,
                      set: setBorders,
                    },
                    { label: "Place names", value: labels, set: setLabels },
                  ].map((l) => (
                    <label key={l.label}>
                      {l.label}
                      <input
                        type="checkbox"
                        checked={l.value}
                        onChange={(e) => l.set(e.target.checked)}
                      />
                    </label>
                  ))}
                  <p>River marks appear with the grid or terrain layer.</p>
                </div>
              )}
            </div>
            <div className="map-scale">
              <span>1 hex ≈ {KM_PER_HEX} km</span>
              <i />
            </div>
          </div>
          {!destination && !editor && (
            <div className="explore-hint">
              <MousePointer2 size={15} />
              <span>Select a place to uncover its story</span>
            </div>
          )}
          <div className="map-credit">
            {world.mapAssetId
              ? "MERGING SUN WORLD"
              : "ILLUSTRATED PLACEHOLDER WORLD"}{" "}
            <span>·</span> ATLAS v0.1
          </div>
          {destination && (
            <aside
              className="detail-panel"
              aria-label={location ? "Location details" : "Journey planner"}
            >
              <div
                className={`detail-illustration ${location?.kind ?? "wilds"}`}
              >
                <div className="detail-sun" />
                <div className="detail-hills" />
                <span className="detail-kind">
                  {location ? location.kind.toUpperCase() : "THE OPEN ROAD"}
                </span>
                <button
                  className="close-detail"
                  aria-label="Close location details"
                  onClick={closeDetails}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="detail-scroll">
                <div className="detail-title">
                  <span className="eyebrow">
                    {location?.region || "ANOTHER STEP INTO THE WORLD"}
                  </span>
                  <h2>
                    {location?.name ||
                      `${tileAt(destination, world).terrain.charAt(0).toUpperCase() + tileAt(destination, world).terrain.slice(1)} hex`}
                  </h2>
                  <p>
                    {location?.summary ||
                      `Hex ${key(destination)} · ${tileAt(destination, world).river ? "River modifier · +3 entry energy" : "Follow your own path."}`}
                  </p>
                </div>
                {location && (
                  <>
                    <div className="detail-actions">
                      <button
                        className="text-button"
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(
                              `${window.location.origin}${window.location.pathname}#location=${location.id}`,
                            )
                            .then(() => notice("Location link copied."))
                            .catch(() =>
                              notice(
                                "Copy this page’s address to share the location.",
                              ),
                            );
                        }}
                      >
                        <LinkIcon size={14} /> Share place
                      </button>
                      {editor && (
                        <button
                          className="text-button"
                          onClick={() => {
                            setEditorCategory("places");
                            setEditLocation(location);
                          }}
                        >
                          <Settings2 size={14} /> Edit place
                        </button>
                      )}
                    </div>
                    <article
                      className="lore-content"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(location.lore, {
                          USE_PROFILES: { html: true },
                          FORBID_TAGS: [
                            "style",
                            "form",
                            "input",
                            "button",
                            "iframe",
                          ],
                          FORBID_ATTR: ["style", "target"],
                        }),
                      }}
                    />
                    <p className="fine-print">
                      {isDemo
                        ? "Demo world"
                        : `${cloud.population[location.id] ?? 0} characters here · includes offline players`}
                    </p>
                    {!!internalLocations(location).length && (
                      <section className="internal-entries">
                        <h3>Within {location.name}</h3>
                        {internalLocations(location).map((entry) => (
                          <button
                            className="kingdom-card"
                            key={entry.id}
                            onClick={() => setViewEntry(entry)}
                          >
                            <BookOpen size={18} />
                            <span>
                              <strong>{entry.name}</strong>
                              <small>{entry.summary}</small>
                            </span>
                            <ChevronRight size={14} />
                          </button>
                        ))}
                      </section>
                    )}
                  </>
                )}
                <div className="travel-card">
                  <div className="travel-heading">
                    <Footprints size={18} />
                    <h3>
                      {editor ? "Test a walking route" : "Plan your journey"}
                    </h3>
                    <span>WALKING</span>
                  </div>
                  {!character ? (
                    <>
                      <p>
                        Create a character to preview a route from your starting
                        settlement.
                      </p>
                      <button
                        className="button primary full"
                        onClick={() => beginCharacterCreation()}
                      >
                        Create character <ArrowRight size={15} />
                      </button>
                    </>
                  ) : route?.steps === 0 ? (
                    <div className="arrival-note">
                      <Check size={18} /> You are here. Make yourself at home.
                    </div>
                  ) : !route ? (
                    <div className="info-note">
                      <Waves size={18} />
                      <span>
                        No walking route reaches this tile. Water is impassable;
                        choose another destination.
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="route-stats">
                        <div>
                          <strong>
                            {route.steps * KM_PER_HEX}
                            <small> km</small>
                          </strong>
                          <span>{route.steps} hexes</span>
                        </div>
                        <div>
                          <strong>
                            {route.cost}
                            <small>
                              {" "}
                              <Zap size={15} />
                            </small>
                          </strong>
                          <span>energy required</span>
                        </div>
                      </div>
                      <details className="cost-details">
                        <summary>
                          Travel cost breakdown <ChevronDown size={13} />
                        </summary>
                        {Object.entries(route.terrainCosts)
                          .filter(([, cost]) => cost > 0)
                          .map(([t, cost]) => (
                            <div key={t}>
                              <span>{t} terrain</span>
                              <strong>{cost}</strong>
                            </div>
                          ))}
                        {route.riverEntries > 0 && (
                          <div>
                            <span>
                              {route.riverEntries} river entries × {RIVER_COST}
                            </span>
                            <strong>{route.riverEntries * RIVER_COST}</strong>
                          </div>
                        )}
                        {route.roadSavings > 0 && (
                          <p>
                            Terrain totals include a 50% road discount, saving{" "}
                            {route.roadSavings} energy.
                          </p>
                        )}
                        {route.rounding > 0 && (
                          <div>
                            <span>Round journey total up</span>
                            <strong>+{route.rounding}</strong>
                          </div>
                        )}
                        <p>
                          The starting hex is free. Roads halve terrain cost.
                          River surcharges are added in full; the final journey
                          total is rounded up.
                        </p>
                      </details>
                      {route.cost > energy && (
                        <p className="energy-warning">
                          You need {route.cost - energy} more energy.
                          {route.cost > MAX_ENERGY
                            ? " This journey exceeds your capacity; choose a closer stop."
                            : ` Recover 1 every ${REGEN_MS / 60000} minutes.`}
                        </p>
                      )}
                      <button
                        className="button primary full"
                        disabled={editor || route.cost > energy || busy}
                        onClick={() => setTravelConfirm(true)}
                      >
                        {editor
                          ? "Preview only while editing"
                          : `Travel here · ${route.cost} energy`}
                        <ArrowRight size={16} />
                      </button>
                      <p className="travel-caption">
                        {editor
                          ? "Save your draft and leave the editor to travel."
                          : "Spend energy. Arrive immediately."}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </aside>
          )}
        </section>
        <footer className="statusbar">
          <span>
            <span className="status-dot" />
            {editor
              ? "WORLD EDITOR"
              : isDemo
                ? "EXPLORE AT YOUR OWN PACE"
                : "YOUR WORLD, CONNECTED"}
          </span>
          <span>
            {editor
              ? `${Object.keys(world.tiles).length} painted tiles · ${world.locations.length} places`
              : "Somewhere in this world, your story belongs."}
          </span>
          <button onClick={() => setAboutOpen(true)}>
            About the atlas <ArrowUpRight size={12} />
          </button>
        </footer>
      </main>
      {toast && (
        <div
          className={`toast ${toast.error ? "error-toast" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <Info size={19} /> : <Check size={19} />}
          <span>{toast.text}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {viewEntry && (
        <Modal
          title={viewEntry.name}
          subtitle={viewEntry.summary}
          onClose={() => setViewEntry(null)}
          wide
        >
          <article
            className="lore-content"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(viewEntry.lore, {
                USE_PROFILES: { html: true },
                FORBID_TAGS: ["style", "form", "input", "button", "iframe"],
                FORBID_ATTR: ["style", "target"],
              }),
            }}
          />
          {published.locations.find((l) =>
            internalLocations(l).some((e) => e.id === viewEntry.id),
          ) && (
            <LocationOccupancy
              location={published.locations.find((l) =>
                internalLocations(l).some((e) => e.id === viewEntry.id),
              )!}
              entry={viewEntry}
              character={character}
              world={published}
              demo={isDemo}
              onEnter={(c) => {
                if (isDemo) setDemoCharacter(c);
                notice(`Entered ${viewEntry.name}.`);
              }}
            />
          )}
        </Modal>
      )}
      {viewKingdom && world.territories.find((k) => k.id === viewKingdom) && (
        <Modal
          title={world.territories.find((k) => k.id === viewKingdom)!.name}
          onClose={() => setViewKingdom(null)}
        >
          <div className="form-stack">
            {world.territories.find((k) => k.id === viewKingdom)!
              .emblemAssetId && (
              <img
                className="emblem-preview"
                src={emblemUrl(
                  world.territories.find((k) => k.id === viewKingdom)!
                    .emblemAssetId!,
                )}
                alt="Kingdom emblem"
              />
            )}
            <article
              className="lore-content"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(
                  world.territories.find((k) => k.id === viewKingdom)!.lore,
                  {
                    USE_PROFILES: { html: true },
                    FORBID_TAGS: ["style", "form", "input", "button", "iframe"],
                    FORBID_ATTR: ["style", "target"],
                  },
                ),
              }}
            />
            {world.locations
              .filter((l) => l.kingdomId === viewKingdom)
              .map((l) => (
                <button
                  className="kingdom-card"
                  key={l.id}
                  onClick={() => {
                    setViewKingdom(null);
                    selectLocation(l.id);
                  }}
                >
                  {l.name}
                </button>
              ))}
          </div>
        </Modal>
      )}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      {editLocation && draft && (
        <Suspense
          fallback={
            <div className="toast" role="status">
              Opening lore editor…
            </div>
          }
        >
          <LocationForm
            location={editLocation}
            key={editLocation.id}
            kingdoms={draft.territories}
            scope={`${cloud.user?.uid ?? "demo"}:${published.version}`}
            onClose={() => setEditLocation(null)}
            onSave={(l) => {
              changeWorld({
                ...draft,
                locations: draft.locations.some((x) => x.id === l.id)
                  ? draft.locations.map((x) => (x.id === l.id ? l : x))
                  : [...draft.locations, l],
              });
              selectLocation(l.id);
              notice("Location saved to your world draft.");
            }}
            onDelete={() => {
              changeWorld({
                ...draft,
                locations: draft.locations.filter(
                  (l) => l.id !== editLocation.id,
                ),
              });
              closeDetails();
            }}
          />
        </Suspense>
      )}
      {travelConfirm && route && (
        <Modal
          title="Take the next step"
          subtitle={`Travel to ${location?.name ?? (destination ? locationLabel(center(destination, world), world) : "your destination")}`}
          onClose={() => {
            if (!busy) setTravelConfirm(false);
          }}
        >
          <div className="form-stack">
            <div className="journey-confirm">
              <Footprints size={28} />
              <div>
                <strong>{route.steps * KM_PER_HEX} km on foot</strong>
                <span>Arrive immediately</span>
              </div>
              <strong>
                {route.cost} <Zap size={18} />
              </strong>
            </div>
            <p>
              You’ll spend <strong>{route.cost} energy</strong> and have{" "}
              <strong>{energy - route.cost}</strong> remaining.
              {isDemo ? " This journey is saved only in this browser." : ""}
            </p>
            <button
              className="button primary"
              disabled={busy || route.cost > energy}
              onClick={() => void travel()}
            >
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Check size={17} />
              )}{" "}
              Confirm journey
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setTravelConfirm(false)}
            >
              Stay a little longer
            </button>
          </div>
        </Modal>
      )}
      {gridConfirm && (
        <Modal
          title="Publish a new grid?"
          subtitle="Characters with an origin return to it"
          onClose={() => {
            if (!busy) setGridConfirm(false);
          }}
        >
          <div className="form-stack">
            <div className="info-note">
              <MapPin size={20} />
              <span>
                Changing the grid size or alignment returns characters to their
                original starting settlement. Characters whose origin was
                deleted keep their map position. Energy and character details
                stay the same.
              </span>
            </div>
            <p>
              Review your terrain and starting settlements before continuing.{" "}
              {isDemo
                ? "This affects only your local demo traveler."
                : "This affects every player in the shared world."}
            </p>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void publish(true)}
            >
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Check size={16} />
              )}{" "}
              Publish grid & return characters
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setGridConfirm(false)}
            >
              Keep reviewing
            </button>
          </div>
        </Modal>
      )}
      {aboutOpen && (
        <Modal
          title="A world worth belonging to"
          subtitle="Merging Sun · First playable atlas"
          onClose={() => setAboutOpen(false)}
        >
          <div className="about-content">
            <p>
              Explore an illustrated world, discover its lore, and give your
              character a place within it.
            </p>
            <h3>This is a placeholder realm</h3>
            <p>
              The map, place names, and stories are samples. The local preview
              lets you try the world editor and travel without an account. Demo
              changes remain on this device.
            </p>
            <h3>Travel rules</h3>
            <p>
              Roads halve terrain costs. Walking normally costs 2 energy for
              plains, 4 for forest, and 7 for mountains. A river modifier adds 3
              on entry. Water blocks walking. Each hex step represents about 5
              km.
            </p>
            <p>
              Energy regenerates by 1 every 5 minutes, to a maximum of 100.
              Spend energy to arrive immediately.
            </p>
            <h3>Your connected world</h3>
            <p>
              Firebase sign-up and login are configured. Saved characters,
              secure travel, and admin publishing require the included Firebase
              backend and security rules to be deployed. Admin access uses a
              server-assigned role.
            </p>
            <button
              className="button primary full"
              onClick={() => setAboutOpen(false)}
            >
              Back to the atlas <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
