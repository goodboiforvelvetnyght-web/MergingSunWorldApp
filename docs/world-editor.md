# Desktop world editor

Open **World editor** on a PC while signed in as an admin. The workspace is designed for a mouse and keyboard at a browser width of at least 1100 pixels. Player map navigation and character flows remain available on phones.

The top ribbon contains the active tools, undo/redo, grid visibility, snapping and saving. The World Explorer on the left selects kingdoms, settlements and internal encyclopedia entries. The Properties panel on the right edits the selection. The bottom strip shows map coordinates and mouse controls.

## Navigation

- Hold the **middle mouse button** and drag to pan, including while a drawing or painting tool is active.
- Scroll the wheel to zoom toward the pointer. The map's plus/minus and fit-world buttons are also available.
- Use **Navigate** for normal left-button map panning and settlement selection.
- **Right-click** a border point, border segment, settlement or map background to open its available actions. Escape or a click outside closes the menu.

## Borders through points

Choose **Places → New kingdom**, or select a kingdom and choose **Edit kingdom & border**. New kingdoms use a smooth spline that passes through the placed points. Existing borders retain their straight segments until explicitly changed.

Choose **Add border points** and click to add anchors. Three anchors close the outline. Choose **Finish drawing** or **Select points** to stop adding anchors. Select and drag a numbered point to move it; the outline updates during the drag. The Properties panel also offers exact coordinate editing.

**Smooth border / Straight border** switches the whole outline. Select a point and use **Sharp corner** for a deliberate corner within a smooth outline; **Make smooth** restores its smooth connection. There are no tangent handles.

Right-click a segment to **Insert point here**, or a point to insert after it, delete it, or change its corner type. A closed border keeps at least three points and supports up to 150. **Snap to hex** optionally snaps moved/added border points and newly placed settlements to tile centers. Turning snapping on does not move existing points by itself.

Undo/redo reverses drawing, point insertion/deletion, corner/style changes and coordinate edits. A completed point drag is one undo action. Use Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y; Delete/Backspace removes the selected point when the border has more than three. Keyboard editing inside text fields and lore editors keeps its normal behavior. Escape returns to selection/navigation.

**Save kingdom to draft** applies the form to the world draft. Borders remain part of their kingdoms and cannot be deleted independently. Admins remain responsible for border placement; no containment or overlap validation is added.

## Landscape and roads

**Landscape** contains terrain, river, road and erase brushes, along with the existing grid and map-artwork settings. **Grid** toggles hex outlines; painting shows terrain modifiers while the tool is active.

Road tiles connect into smooth visible paths through tile centers, with branches and loops. Gameplay still uses the existing hex graph: roads halve terrain cost, river cost is added in full and the final journey total is rounded up. Visual curves do not change pathfinding, terrain or energy costs. Rivers remain tile modifiers.

## Draft and publication

**Save draft** saves the world draft and any open kingdom/border form in this browser for the current account. Reopening the editor after a refresh restores a saved border form if the published world version still matches. Browser storage is device-specific; use **Export world** to back up completed world edits. Complete settlement and entry forms with their own save buttons before saving/publishing the world.

**Publish world** sends completed world edits to all players. Publication is disabled while a kingdom or settlement form is open or an image upload is processing. The local preview instead offers **Save local world**, which affects only this browser. Unpublished changes and the last explicit draft-save time appear in the ribbon. Existing server version checks and world backups remain in place.

Changing a border's shape or road appearance does not relocate characters. The existing grid-change and map-alignment rules apply only when those settings are changed and published.
