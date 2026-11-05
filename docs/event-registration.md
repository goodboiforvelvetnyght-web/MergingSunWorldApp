# Event registration

Admins open **Events → Manage event → Registration settings**. This is separate from event story/roster editing.

The form uses the MIT-licensed SurveyJS renderer and a focused in-app editor. Survey Creator is not installed or required. Admins can edit labels, required status, choices, help text, step headings and question order; add short/long text, phone, single/multiple-choice and acceptance fields; and remove custom fields. The five identity/contact fields retain stable identifiers and remain required. Conditional logic is not included.

Opening copy, each side's costume guidance, and terms use the existing rich-text editor. **Upload illustration** stores images in Firebase Storage through the admin-only image processor and inserts them into the text. PNG/JPEG/WebP up to 6 MB; images resize responsively.

**Save form draft** preserves private work. **Preview registration** runs the journey without submitting. **Publish registration settings** creates an immutable version of the form and terms, and opens/closes registration according to its checkbox. Event publication is also required for public submissions. Existing events start with registration closed.

Players use `/events/<event-id>/register`, without an app account: opening artwork → side selection → costume guidance and acknowledgement → SurveyJS questions → review and terms → receipt. Details are kept in session storage for the current tab, cleared after a successful submission. This is a request only: no place reservation or automatic payment processing. The active SurveyJS instance keeps its current answers through background refreshes and updates text as it is typed. A new published version shows a notice and blocks submission; the participant can explicitly reload the updated form with their answers carried forward and must review the current guidance and terms.

Requests are private Firestore documents. Admin review includes submitted answers and the accepted form/terms version. Original answers and the side originally accepted are retained alongside corrected answers. Save corrections before confirming. **Confirm after payment** atomically creates a public roster entry containing only character name, public player identity and class. Rejection requires a reason and removes any corresponding roster entry and character link. Existing character-link requests remain a separate opt-in flow.

## Google Sheets

In the event's Google Sheets tab, paste an existing spreadsheet URL. Share it as **Editor** with `merging-sun-runtime@mergingsunapp-2.iam.gserviceaccount.com`. Google Sheets API must be enabled in `mergingsunapp-2`; deployment attempts to enable it, while the connection screen reports missing access. No spreadsheet is created or publicly shared automatically.

Connecting creates an event-specific tab and queues existing requests. The app owns columns **A–CF**. Keep organizer notes in **CG onward**. Use filter views where possible and do not edit registration references. Rows are located by their stable reference before updating, so ordinary sorting does not create duplicate registrations. Avoid sorting or editing the same rows during an active update.

A Firestore-triggered worker copies new requests and later status/correction changes, using RAW values so user text cannot execute as spreadsheet formulas. A per-event lease serializes writes, retries locate the existing row, and the worker records revision/token acknowledgements. Transient failures retry automatically through Eventarc; expired or persistent failures can be requeued with **Reconnect and retry synchronization**. Firestore remains the source of truth and submissions succeed even without a sheet connection. Historical question identifiers receive stable columns (up to 75 over the lifetime of an event); the registration UI supports up to 40 active questions. Google Sheets can be delayed by API quotas or service outages.

No payment details are tracked. Spreadsheet access is an organizer responsibility because the sheet includes private contact information. Do not publish it to the web.

Deployment operators can also run the **Test and deploy Firebase** GitHub workflow with `setup_registration_sheet` enabled with an explicit event ID and spreadsheet URL. Its setup endpoint accepts only the deployment service account, enforced by Cloud Run IAM and a verified Google identity token. This avoids requiring an organizer's Firebase login for an authorized setup operation; normal organizer connections still use the admin-only app callable.
