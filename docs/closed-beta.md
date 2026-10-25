# Closed beta: arrival, guidance and cities

Anonymous visitors see the title screen first: the supplied background artwork, a frosted overlay, the Merging Sun logo and a bottom-center **Click to start** prompt. The whole title screen is a button and works with Enter or touch. The welcome screen provides Google/email sign-in and registration. Existing signed-in sessions continue directly to the atlas. Signing out returns to the welcome choices. `/admin/activate` keeps its direct sign-in flow.

The processed images live under `public/brand/`. They were downloaded from the owner's shared Drive folder. The background is served as optimized 2400px and 1200px WebP copies; the transparent logo remains PNG. The app does not embed Google Drive links or need Drive authorization to display its artwork. The original artwork is preserved outside the repository.

Newly signed-in visitors see **Your story begins here** until they dismiss the guide on that device. **Player guide** in the navigation reopens it. It explains character creation and approval, exploring lore while waiting, travel energy, city entry, and the distinction between map navigation and leaving. Chat and events are explicitly future updates. Registration is open, beta progress may be reset, and friends send feedback through Messenger. Pending submissions link directly to the lore library; rejections retain the written reason and Edit and resubmit.

## City presence and navigation

Travel, character approval and grid-origin resets place a character on a settlement's hex **outside** it. The player chooses **Enter city**. This costs no energy and opens a city page occupying the main content area while the navigation and top toolbar remain available. City lore and its internal locations can be read remotely, but entering requires being on that city's hex. Entering the city puts the character in the city lobby; visiting Town Commons or another internal location is a separate action.

**Back to map** changes only the display. **Return to city** reopens the city and the character's internal location. Neither action writes character state. **Leave city** clears city and room presence, preserves coordinates and energy, and returns to the map. Characters must leave before traveling. The same city cannot be entered again to accidentally reset a selected internal location.

The backend handles city/room entry and exit in the existing `enterLocation` transaction. It checks character generation, physical hex, optional world version, and current city before changing presence. An approved active character is required. Direct room entry from outside is rejected. Character profiles and portraits are visible to other players while sharing the same hex, including characters in different rooms or outside a city. City counts include characters who explicitly entered. Hex counts include everyone, including offline characters, and map badges appear only for occupied hexes. Existing characters keep their positions, energy and city/room. Counts and the private character hex index migrate automatically using `presenceVersion: 3`. The travel model is versioned so older browser tabs must refresh before spending energy.

## Editor artwork opacity

The **Artwork** slider in the editor ribbon fades only the base map imagery (0–100%). It remains available while editing places or terrain. Roads, borders, grid and markers keep their existing appearance. The setting stays in this browser and does not enter the world draft or publication. The player atlas always displays the artwork at full opacity.

## Local preview and beta preparation

Developers can explicitly open `/?preview=1` for the existing isolated local preview. It is labeled LOCAL PREVIEW and keeps edits in browser storage; it grants no Firebase roles or permission to change the shared world. Atlas/editor regression tests explicitly select this mode. Title-screen tests use fresh storage, and Auth-emulator checks exercise the title-to-sign-in-to-guide path.

Before inviting friends, an admin must mark at least one walkable city as a starting settlement. If no starting settlements exist, players can read lore and the creation flow explains that the world is waiting for a starting city. Do not replace the live world with placeholder content to create one.

### Occupied hexes and public profiles

The public population document retains `counts` for explicit city occupancy and
adds `hexCounts` for all active approved characters, including offline characters.
Map badges show only positive hex totals, once per hex. City entry and room changes
do not affect hex totals. Walking, sailing, approval/recreation and published grid
or map-alignment changes update both aggregates atomically. Migration adds a private
`hexKey` index to character records without moving them or spending energy.

Click a hex badge while your character is there to open **Characters here**.
Profiles include public names, titles, backstories, origins and portraits; real
names, energy, application data and rejection reasons are never returned. Lists
refresh every 30 seconds and can be refreshed manually. Leaving the hex closes the
panel. The server validates current world, generation and physical hex for list
requests and independently checks portrait access. The legacy `getRoomCharacters`
callable remains an alias for same-hex browsing. Character documents and Storage
portraits retain their existing direct-read restrictions.

During birth-city selection, kingdom emblems and labels are hidden. The map fits
the selected kingdom's walkable starting cities (or its settlements if no starting
city is available), within the configured zoom limits. Selecting a city focuses it.
