# Terrain and World Rules

In **World editor → Landscape**, choose **Terrain** to replace the base terrain without removing features, roads or rivers. Choose **Add feature / Erase feature** and select a feature. Features stack; hills replace mountains and mountains replace hills. River and road shortcuts remain available. Coast is manually painted; the map artwork does not determine passability. Features are drawn over the terrain layer, and destination details list the features on a selected hex.

In **World Rules**, edit the spreadsheet. Base costs must be whole numbers from 1 to 100; feature costs from 0 to 100. A blocked rule prevents walking even with a road. A road-required rule needs a road. Costs on blocked rows are retained for future use if that restriction is changed; they do not make the hex walkable.

Road effects apply to the row's cost, except **No discount on entire hex**, which overrides all discounts on that hex. By default, mountains use this override and require roads. A mountain on plains costs 2 + 18 = 20; adding a forest and river makes it 25. Other road costs are halved where eligible, then the final journey total is rounded up once.

**Save draft** stores edits in this browser and account. **Restore defaults** modifies the draft and can be undone. **Publish world** applies the rules to everyone, with a server-side version check and a backup of the previous world. It does not spend energy or move characters. Starting settlements must be walkable; publication rejects changes that newly block occupied hexes. Geometry changes retain their separate origin-reset behavior.

Existing map data is converted when read: forest → plains + forest, mountain → plains + mountain, water → ocean. Roads, rivers, locations, character position, energy and history are preserved. Converted tiles and defaults are written with the next publication. Existing occupants of legacy mountain hexes can leave; the starting hex is not charged. An already blocked occupied hex may remain unchanged during a rules publication. An older browser with the previous travel model is asked to refresh before it can spend energy under the new rules.

The rule definitions use stable IDs in `shared/travelRules.ts`, separate from individual map hexes. This provides a foundation for future content definitions. Building definitions, resource production, inventory and other asset authoring are not part of this update.
