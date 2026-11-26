# Design note: remove the "waiting" page from the CAMS request flow (QA defect D-2, 26 Nov 2026)

Status: DRAFT for the owner's approval. Source: the owner's QA of `qa-rc` (`2026-11-26-qa-round-report.md`, D-2) and the owner's screenshot of the "Upload your statement" card (confirmed 26 Nov 2026: **"the upload page as before" is that card, `UploadForm`**).

## What the owner wants
1. Press **Request Statement on CAMS**: CAMS opens in a new tab and the floating checklist opens there (this part already works, D-2).
2. Back in the Unifolio tab: the **"Upload your statement" card (step 2)** is shown, with the floating checklist still open.
3. **No waiting page**: no "CAMS request waiting" card and no "Waiting for CAMS email" block.

## What is built today (and why it fails)
`frontend/src/features/import/TwoPathImportContainer.tsx`: after a request, `handleRequestInitiated` sets `view = "waiting"`, and a pending request read from the server (`usePendingCamsRequest`) also picks `"waiting"`. The waiting view renders `CamsWaitingCard` (patch 2) and `WaitingForCasView` ("Waiting for CAMS email" plus the collapsed "Already got the email? Upload it now" row). The release before patch 2 (`xr-rc`) showed the `"upload"` view (`UploadForm`) when the owner came back to the tab (resume marker plus the window focus handler, and `finishedFromChecklist`).

## The change (front end only; no back end, no migration)
- **After a request** (`handleRequestInitiated`): `setView("upload")` instead of `"waiting"`. Keep `setLocalRequest`, `setCasResumeStep2` and the pending refresh (the request must still exist for the upload to close it).
- **Server-driven first screen**: a member with a pending request opens on `"upload"`, not `"waiting"` (`effectiveView` in the same file). Checklist state, focus and notes still never change the screen (HB-05 stays true).
- **Remove from the Add data flow**: the `waiting` branch, `CamsWaitingCard` and its use, and `WaitingForCasView`'s use here (the component and its tests may stay only if something else imports it: check, otherwise delete with its tests).
- **Upload closes the request**: unchanged (the server closes the placeholder `Import` row for that member on import).
- **Back** on the upload card returns to the choice screen as it does today for a plain upload; the open request is not cancelled by Back.
- **Cancel request** disappears with the card. An unused request closes on import for that member or after 48 hours (and the one-off clean-up script handles old ones). **Owner to confirm** this is acceptable (the alternative is a small "Cancel request" text link under the upload card).
- **Unchanged**: the floating checklist and its strip, the request page row "Continue without it", `GET /cas-imports/pending`, `GET /cas-imports/cams-link`, the `waiting_cams_request` eligibility flag, and the Head of Family dialog's quiet line (HB-09).

## Tests the builder must write or update (failing first)
- After a successful request the upload card ("Upload your statement") is on screen and "CAMS request waiting" / "Waiting for CAMS email" are not.
- A member with a pending request opens straight on the upload card.
- Ticking checklist items, closing or reopening the checklist, and refocusing the tab never change the screen.
- Uploading a file for that member still closes the request and leaves another member's untouched.
- Remove or rewrite the tests of `CamsWaitingCard`, the `waiting` view and `WaitingForCasView` that no longer apply (list them in the report).

## QA rows to rewrite afterwards
HB-01 (card shows after reload) becomes "the upload card shows after reload"; HB-02 (Cancel request) and HB-03 (card in a second window) are dropped or changed per the cancel decision above; HB-04, HB-05, HB-07, HB-08 stay; HB-06, HB-09, HB-11 keep only the strings that still exist.

## Review and deploy
Front-end-only patch with the email sketches (D-1): Sonnet front-end review (G2), the owner's QA of the HB rows and the three emails in Chrome and Edge. Deploy is a front-end deploy (`deploy-redesign.sh`, no `--full` needed; the deploy guide for it must follow `deploy-guide-standing-lessons.md`).
