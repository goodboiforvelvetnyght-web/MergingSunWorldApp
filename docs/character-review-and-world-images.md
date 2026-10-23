# Character review, world images, and location occupancy

## Player flow

Character creation submits a private application. Its status appears under **My character**. New characters can explore lore while waiting; gameplay starts after approval. Rejection includes the admin's explanation and an **Edit and resubmit** action that restores the submitted details and portrait. A replacement waits in a separate application while the active character can continue playing. Approval archives the old incarnation and its journeys, then starts the replacement in its home settlement with 100 energy.

Characters already active before this update remain playable. Their portraits move to private Storage when their owner views them or an admin opens the editor. Admins can retry the migration from the review section. Migration preserves position, energy, and character identity.

Every settlement has a built-in **Town Commons**, in addition to its encyclopedia entries. Travel and approval leave the character outside on the settlement's hex. Enter city opens its full-page view; internal locations are entered separately, without an energy charge. Back to map preserves city and room presence. Leave city returns outside on the same hex. Other characters' names, titles, backstories, origins, and portraits are available only while sharing that internal location. The backend checks this, including direct requests. Real names, applications, and rejection reasons remain private to owners and admins.

Population numbers on settlement markers and lore pages count approved characters who explicitly entered that settlement, including offline players. Characters outside on the same hex are excluded. Internal-location member lists refresh every 30 seconds while open. Population totals update through a single Firestore aggregate when characters enter, travel, receive approval, or a world edit changes locations/grid geometry.

## Admin flow

- **World editor → Character reviews**: inspect the submitted story and player name, approve it, or reject it with a required reason of up to 2,000 characters. Concurrent decisions cannot overwrite one another.
- **World editor → Landscape → Map artwork**: upload PNG/JPEG/WebP (up to 25 MiB, 8192 pixels on the longest side, and 64 megapixels), watch upload and processing progress, review alignment, then **Publish world**. Restoring the placeholder is also a draft action.
- **Landscape → Grid settings**: adjust hex radius and X/Y offsets. Publishing geometry changes returns characters with surviving origins outside on their home settlement's hex. Characters whose origins were deleted keep their coordinates. Energy remains unchanged. Artwork-only changes do not move characters or change terrain rules.
- **Places → kingdom → Edit kingdom & border**: upload, replace, or remove a coat of arms or flag; set its map X/Y coordinates independently of the border. Blank coordinates use the mean of border vertices. Save the kingdom into the draft, then publish the world. Rectangular flags and transparent emblems retain their proportions.

Kingdom emblems and names appear at wide zoom, shrink at middle zoom, and disappear at close zoom. Small settlement markers are hidden at the widest zoom to reduce clutter. Selecting an emblem opens kingdom lore; during character creation it selects the birthplace kingdom. Emblems and borders cannot intercept painting, settlement placement, or border drawing.

## Image and data handling

New maps preserve their natural proportions and use a logical longest side of 2048 map units. Image pixels are independent: a sharper replacement with the same proportions changes neither the grid nor travel costs. The tile pyramid extends through zoom 5 for 8192-pixel maps, with eight concurrent tile writes and one processing job per function instance. Players fetch only nearby tiles. Legacy maps keep their 2400 × 1800 coordinates and existing processed tiles until an admin chooses new artwork.

When dimensions change, **Align the world with this map** previews a uniform fit of the existing world onto the new map. It moves terrain, grid, cities, borders, emblems and active characters together, preserving occupied hexes, rooms, energy and travel costs. **Remove old padding from the same artwork** is available for a legacy uploaded map. It crops its former padding; places and borders outside the artwork must be repositioned first, and publishing also refuses to crop any active character. These are draft changes with undo and version-checked publication. Plain grid edits still return characters with surviving origins to their homes; orphaned origins keep their map position. World backups preserve the previous layout.

The upload uses authenticated 1 MiB chunks (up to three in flight) instead of a large base64 request. Tickets are admin-owned, limited to ten new uploads per hour per admin and expire after one hour. Each part is hashed; final processing verifies the original checksum and file dimensions. Re-selecting the same file resumes a partial upload or reattaches to processing. A stale processing worker cannot overwrite a newer attempt. The processing deadline is nine minutes; the browser waits ten minutes. Progress updates are private. Finished chunks are deleted; the exact original remains under a private immutable asset path so tiles can be regenerated later. Unfinished/failed uploads expire but do not yet have scheduled garbage collection.

Emblems remain WebP thumbnails within 256 × 256 and accept up to 6 MiB. Portraits are private 512 × 512 WebP files. The manual Firebase workflow's **upload_diagnostics** option reads recent image errors and runtime limits without deploying; logs do not include image contents.

All image writes happen on the backend. Public Storage reads cover processed artwork and emblems only. Portrait objects have no public download tokens and deny direct SDK access even to their owners; authenticated callables enforce ownership, admin review, or current co-location. Firestore character documents retain their existing owner/admin read restrictions. Public character responses explicitly include only the allowed fields.

Image paths are immutable and validated against a completed asset manifest before a world can publish them. Draft uploads do not replace the live world's selected artwork. Unreferenced uploads are retained rather than deleting images that might still belong to another draft or a world backup; periodic asset garbage collection is a later maintenance task.

This version retains the existing world-publishing limit of 400 active characters. Population initialization and room browsing have the same explicit bound. Larger LARPs need batched migrations, paginated room lists, and a distributed population counter before raising this limit.

Storage access setup and the deployment preflight are documented in [GITHUB_DEPLOYMENT.md](../GITHUB_DEPLOYMENT.md#image-storage-access).
