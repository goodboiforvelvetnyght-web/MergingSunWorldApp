# Events

Events opens a full-width workspace. Admins create Saturday fights or major events, write the story and aftermath, supply the real-world date/time and venue, and optionally select a world-map location. Published events appear in the browser and as clickable flags at that location. Unpublish an event to hide it; draft events are admin-only.

Major events have two named sides, each with an uploaded background and logo. Uploads use the existing image processing and Storage system (PNG/JPEG/WebP up to 6 MB). Desktop shows both rosters side by side; mobile stacks them.

Admins add already-verified participants with character name, public player identity, class and side. Payment and external registration are not tracked. Admins can correct details, move sides or remove a participant.

An approved character owner can request a link from an unlinked entry after agreeing to event-wide profile visibility. Admins review requests (refreshed every 20 seconds), approve/reject them, or link an approved character directly by account UID with the participant's agreement. Only one request/link per account per event is allowed. Removing a link permits a new request.

The registration fields remain unchanged when linked. The character's name, title, biography and portrait reference are copied on approval. Event readers can access this snapshot regardless of hex; private real names, energy, applications and account details are never included. Portrait files remain private in Storage and are delivered through a callable that checks the event is published and the link is still approved. Later character edits do not change the snapshot. Unlink/relink to replace it.

The first version allows 500 participants per event. Portraits load as entries approach the viewport. Existing world draft publication is independent of event publication.

## Public links and presentation

Every published event has a stable `/events/<event-id>` link. Admins use **Copy event link** to share it. The link opens a full-browser event page, including story, rosters and approved character snapshots, without requiring an account or passing through the title screen. Draft, unpublished and missing events show an unavailable page to visitors. Signing in is prompted only when requesting a character link.

Major events present each side's artwork behind a single frosted roster panel with a thin gold border and prominent logo. The rosters are side by side on desktop and stacked on mobile. A single **Link my character** action opens a searchable registration picker. Admins switch on **Manage event** to reveal editing and request-review actions; ordinary browsing keeps these controls hidden.
