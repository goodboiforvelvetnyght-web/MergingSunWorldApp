# Character review, world images, and location occupancy

## Player flow

Character creation submits a private application. Its status appears under **My character**. New characters can explore lore while waiting; gameplay starts after approval. Rejection includes the admin's explanation and an **Edit and resubmit** action that restores the submitted details and portrait. A replacement waits in a separate application while the active character can continue playing. Approval archives the old incarnation and its journeys, then starts the replacement in its home settlement with 100 energy.

Characters already active before this update remain playable. Their portraits move to private Storage when their owner views them or an admin opens the editor. Admins can retry the migration from the review section. Migration preserves position, energy, and character identity.

Every settlement has a built-in **Town Commons**, in addition to its encyclopedia entries. Arriving by travel or receiving approval places the character in the Commons. A character on the settlement's hex can enter any of its internal locations without an energy charge. Other characters' names, titles, backstories, origins, and portraits are available only while sharing that internal location. The backend checks this, including direct requests. Real names, applications, and rejection reasons remain private to owners and admins.

Population numbers on settlement markers and lore pages count approved characters physically on that settlement's hex, including offline players. Internal-location member lists refresh every 30 seconds while open. Population totals update through a single Firestore aggregate when characters enter, travel, receive approval, or a world edit changes locations/grid geometry.

## Admin flow

- **World editor → Character reviews**: inspect the submitted story and player name, approve it, or reject it with a required reason of up to 2,000 characters. Concurrent decisions cannot overwrite one another.
- **World editor → Landscape → Map artwork**: upload PNG/JPEG/WebP (up to 6 MiB and 64 megapixels), inspect the processed map in the editor draft, then **Publish world**. Restoring the placeholder is also a draft action.
- **Landscape → Grid settings**: adjust hex radius and X/Y offsets. Publishing geometry changes returns characters with surviving origins to their home settlement's Commons. Characters whose origins were deleted keep their coordinates. Energy remains unchanged. Artwork-only changes do not move characters or change terrain rules.
- **Places → kingdom → Edit kingdom & border**: upload, replace, or remove a coat of arms or flag; set its map X/Y coordinates independently of the border. Blank coordinates use the mean of border vertices. Save the kingdom into the draft, then publish the world. Rectangular flags and transparent emblems retain their proportions.

Kingdom emblems and names appear at wide zoom, shrink at middle zoom, and disappear at close zoom. Small settlement markers are hidden at the widest zoom to reduce clutter. Selecting an emblem opens kingdom lore; during character creation it selects the birthplace kingdom. Emblems and borders cannot intercept painting, settlement placement, or border drawing.

## Image and data handling

World coordinates remain 2400 × 1800. Uploaded art is padded to 4:3 rather than distorted. Smaller maps use a tile pyramid through zoom 3 (2400 × 1800); larger originals use zoom 4 (up to 4800 × 3600). The client fetches only nearby tiles. Processing happens once during admin upload; no map image processing occurs during normal navigation. Emblems are WebP thumbnails within 256 × 256; portraits are private 512 × 512 WebP files.

Map preparation decodes each zoom level once and writes at most eight tiles concurrently. Each backend instance processes one upload at a time with a five-minute deadline; the browser waits up to six minutes. Keep the editor open until its preview appears, then publish. The manual Firebase workflow has an **upload_diagnostics** option that reads recent upload errors and function limits without deploying; logs never intentionally include image contents.

All image writes happen on the backend. Public Storage reads cover processed artwork and emblems only. Portrait objects have no public download tokens and deny direct SDK access even to their owners; authenticated callables enforce ownership, admin review, or current co-location. Firestore character documents retain their existing owner/admin read restrictions. Public character responses explicitly include only the allowed fields.

Image paths are immutable and validated against a completed asset manifest before a world can publish them. Draft uploads do not replace the live world's selected artwork. Unreferenced uploads are retained rather than deleting images that might still belong to another draft or a world backup; periodic asset garbage collection is a later maintenance task.

This version retains the existing world-publishing limit of 400 active characters. Population initialization and room browsing have the same explicit bound. Larger LARPs need batched migrations, paginated room lists, and a distributed population counter before raising this limit.

Storage access setup and the deployment preflight are documented in [GITHUB_DEPLOYMENT.md](../GITHUB_DEPLOYMENT.md#image-storage-access).
