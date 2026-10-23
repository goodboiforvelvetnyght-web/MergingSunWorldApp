# Terrain and World Rules

In **World editor → Landscape**, choose **Terrain** to replace the base terrain without removing features, roads or rivers. Choose **Add feature / Erase feature** and select a feature. Features stack; hills replace mountains and mountains replace hills. River and road shortcuts remain available. Coast is manually painted; the map artwork does not determine passability. Features are drawn over the terrain layer, and destination details list the features on a selected hex.

In **World Rules**, edit the spreadsheet. Base costs must be whole numbers from 1 to 100; feature costs from 0 to 100. A blocked rule prevents walking even with a road. A road-required rule needs a road. Costs on blocked rows are retained for future use if that restriction is changed; they do not make the hex walkable.

Road effects apply to the row's cost, except **No discount on entire hex**, which overrides all discounts on that hex. By default, mountains use this override and require roads. A mountain on plains costs 2 + 18 = 20; adding a forest and river makes it 25. Other road costs are halved where eligible, then the final journey total is rounded up once.

**Save draft** stores edits in this browser and account. **Restore defaults** modifies the draft and can be undone. **Publish world** applies the rules to everyone, with a server-side version check and a backup of the previous world. It does not spend energy or move characters. Starting settlements must be walkable; publication rejects changes that newly block occupied hexes. Geometry changes retain their separate origin-reset behavior.

Existing map data is converted when read: forest → plains + forest, mountain → plains + mountain, water → ocean. Roads, rivers, locations, character position, energy and history are preserved. Converted tiles and defaults are written with the next publication. Existing occupants of legacy mountain hexes can leave; the starting hex is not charged. An already blocked occupied hex may remain unchanged during a rules publication. An older browser with the previous travel model is asked to refresh before it can spend energy under the new rules.

The rule definitions use stable IDs in `shared/travelRules.ts`, separate from individual map hexes. This provides a foundation for future content definitions. Building definitions, resource production, inventory and other asset authoring are not part of this update.

## Dense grids

Hex radius supports **8–128 map units** in Grid settings and artwork alignment. A smaller radius creates more hexes without changing the artwork's dimensions. Publishing a grid change retains the existing confirmation and origin-reset behavior; it never changes character energy.

World publication supports up to 40,000 painted tiles. Stored tile values use two base-36 characters per coordinate, preserving base terrain, all features, roads and rivers. Old object-based worlds remain readable, editor drafts and exports remain expanded, and published backups use the same compact format. The existing 800 KB document guard applies to the stored world including lore. `worlds.tiles` and `worldBackups.tiles` are exempt from automatic indexing because they are read by document ID; this also keeps dense grids below Firestore's index-entry limit.

Travel uses a heap-backed A* frontier and covers the supported grid without the old 10,000-visit cutoff. Painting enumerates only the local brush footprint, while grid overlays render the visible map area with a buffer as you pan and zoom.

### Harbour travel

Settlements can enable **Has harbour** in their details. Towns and villages may
also have harbours; landmarks cannot. Editors place harbours manually, without
coast or sea-connectivity calculations. At least two harbours are needed to sail.

**World Rules → Travel costs → Ship travel** sets the flat energy cost (default
10; whole numbers 1–100). Distance, roads and terrain do not change this fare.
An approved character must have entered the departure city. Its **Harbour**
section lists other harbours, provides destination lore and asks for confirmation.
The server validates the current world, character and both harbours, deducts energy
and moves the character inside the destination city, outside any internal room.
Population counts and journey history update in the same transaction. Repeating
a request cannot charge twice. Characters must leave the arrival city to walk.
