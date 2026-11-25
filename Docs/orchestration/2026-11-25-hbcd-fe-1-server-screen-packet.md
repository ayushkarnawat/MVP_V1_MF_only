# Packet HBCD-FE-1: Add data chooses its screen from the server, and the waiting card (Antigravity)
**Head of Family Part C and Part D, mockup 2 (cards A, B, C), plan `Docs/superpowers/plans/2026-11-25-hof-bcd-adddata-plan.md`, Task 6.** The red tests and the foundation are written and committed (`hbcd-rt-1`, `da9f970f` on `batch/hbcd-rt`): you make them pass and change nothing else. **Spec:** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16), Parts C and D, mockup 2. Decisions: **Q5 A** (Add data asks the server whether a request waits for this member and cancels by the id the server gives), **Q3 A** (Cancel request stays a separate button), Part D (the page chooses its screen from the server; the checklist and window focus never change the screen).

**Your clone:** `C:\Users\Dell\ag-hbcd1` (branch `ag/hbcd1-server-screen`, cut from `batch/hbcd-rt`). Work only there. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, then this packet.
**This machine blocks WSL and npm for you: run NO shell command at all and request no bypass.** Make the edits, re-read each edited file once, and report "checks not run (tools unavailable)": Claude runs every check.

## Files
Create `frontend/src/features/import/CamsWaitingCard.tsx`. Modify `frontend/src/features/import/TwoPathImportContainer.tsx` and `frontend/src/features/import/WaitingForCasView.tsx`. **Do not touch** any test, `pendingCopy.ts`, `usePendingCamsRequest.ts`, `api.ts`, `casResumeState.ts`, anything in `features/import/checklist/` (another lane, FE-2, builds the checklist side: do not call or change `finishedFromChecklist` or `clearFinishedFromChecklist`, and do not delete any store method), `RequestCamsPath.tsx`, `ImportFlow.tsx`, `backend/**`, `frontend/src/mobile/**`, any other file. **No wording of your own**: every string comes from `pendingCopy.ts` or `checklistCopy`, or already exists in the files you edit.
Existing foundation you use (read these first): `usePendingCamsRequest(memberId)` returns `{ status: "loading" | "none" | "waiting" | "error", request: { import_id, household_member_id, expires_at } | null, refresh }`; `cancelImportRequest(importId)` in `api.ts`; `pendingCopy.ts` constants `WAITING_CARD_TITLE`, `waitingCardFor(name)`, `WAITING_CARD_BODY`, `waitingCardExpires(hours)`, `WAITING_CARD_SHOW`, `WAITING_CARD_UPLOAD`; `useCamsChecklist(memberId)` (read only: `mode`, `focus`); `getChecklistStore`.

## 1. `TwoPathImportContainer.tsx`: the screen comes from the server
- Add `const pendingReq = usePendingCamsRequest(memberId);` and a new **optional** prop `memberName?: string` (nothing passes it yet; the card shows "for <name>" only when given).
- Make `view` state `useState<ImportView | null>(defaultTab ? (the mapping of defaultTab as today for "history" | "upload" | "waiting" | "request" | "choice") : null)`. `null` means "let the server decide". The effective view is `view ?? (pendingReq.status === "loading" ? "loading" : pendingReq.status === "waiting" ? "waiting" : "choice")` (`"error"` behaves like `"none"`: the choice screen). While `"loading"` render a quiet skeleton in the main area (use the existing `Skeleton` from `@/components/ui/skeleton`, a block about `h-48 w-full rounded-2xl`, `aria-busy="true"`, no text) and **no** choice screen yet.
- **Delete** these (the coupling the spec calls a defect): the initial-state lines that read `getChecklistState` / `hasCasResumeStep2`; the whole mount `useEffect` that sets `"upload"` from the browser note; the whole window-`focus` `useEffect`; the `useEffect` on `checklist.finishedFromChecklist`; the `uploadBanner` paragraph in the upload view; every `checklistStore.clearFinishedFromChecklist()` call (in `showView` and in the `requestCasVersion` effect, which keeps its `setView("request")`). Remove the imports that become unused (`getChecklistState`, `hasCasResumeStep2`, `checklistCopy`). **Keep** `setCasResumeStep2(memberId)` in `handleRequestInitiated` and `clearCasResumeStep2(memberId)` where they are (the phone uses the markers).
- **Request initiated in this session:** `handleRequestInitiated(importId, expiresAt)` stores `{ import_id, household_member_id: memberId, expires_at }` in local state (`localRequest`), sets the view to `"waiting"`, and calls `void pendingReq.refresh()`.
- **The request the waiting screen uses:** `const activeRequest = pendingReq.request ?? localRequest;`. Pass **`importId={activeRequest.import_id}`** to `WaitingForCasView` (the `"pending-import"` fallback is **deleted**; if the view is "waiting" with no request yet, render the skeleton instead).
- **Waiting screen markup:** inside `view === "waiting"` render `<CamsWaitingCard request={activeRequest} memberName={memberName} checklistMode={checklist.mode} onShowChecklist={checklist.focus} onUpload={...} onCancel={handleCancel} />` **above** the existing `<WaitingForCasView ... hideCancel />`.
- **`handleCancel`** (async, passed to the card, may reject so the card can show the error): `await cancelImportRequest(activeRequest.import_id); checklist.startOver(); clearCasResumeStep2(memberId); setLocalRequest(null); await pendingReq.refresh(); setView(null);` (so the server decides again: the choice screen). The test requires `getPendingCamsRequest` to have been called **exactly twice** in total after a successful cancel (the first load and this one refresh): call `refresh()` once, nowhere else. A rejected `cancelImportRequest` must **not** change the screen and must propagate to the card.
- **`onUpload`** (the card's "Upload the file"): expand the upload part of the waiting view: set a local boolean `uploadOpen` to true and pass it to `WaitingForCasView` as `uploadOpen` (new optional prop, below). Nothing else.
- `WaitingForCasView` still gets `onCancelled` (required by its props type; pass a no-op function: the container handles cancelling itself), `onUploadSubmit`, `surface` and the error props as today.

## 2. `WaitingForCasView.tsx`: two small optional props
- Add `hideCancel?: boolean` (default false): when true the header's "Cancel request" button is **not rendered** (the card owns Cancel). Everything else in the header (the clock, `Waiting for CAMS email`, the sentence) stays exactly as is.
- Add `uploadOpen?: boolean`: when it becomes true the existing "Already got the email? Upload it now" disclosure opens (initialise `isUploadOpen` from it and `useEffect` to open it when the prop turns true); the person can still close it. Nothing else changes in the file.

## 3. `CamsWaitingCard.tsx` (new): the card of mockup 2
```tsx
export interface CamsWaitingCardProps {
  request: { import_id: string; household_member_id: string; expires_at: string };
  memberName?: string;
  checklistMode: "window" | "panel" | "closed";
  onShowChecklist: () => void;
  onUpload: () => void;
  onCancel: () => Promise<void>;
}
export function CamsWaitingCard(props: CamsWaitingCardProps): JSX.Element
```
- Root: `<section data-testid="cams-waiting-card" aria-label={WAITING_CARD_TITLE} ...>` as a compact status card in the page's light language (use the Tailwind token classes the neighbouring `WaitingForCasView` uses: `rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs p-4 sm:p-5`; **no hex, no `rgb(`**).
- **Title row:** a small tile (`h-8 w-8 rounded-[10px] bg-[var(--color-bg)]`) with a lucide `Clock` icon (`aria-hidden`), then the title `WAITING_CARD_TITLE` (DM Sans, semibold, `text-sm sm:text-base`) and, when `memberName` is given, ` ` + `waitingCardFor(memberName)` in the muted colour on the same line.
- **Body line:** `WAITING_CARD_BODY` (`text-xs sm:text-sm`, muted) and, on the same line or just under it, `waitingCardExpires(hours)` where `hours = Math.max(1, Math.ceil((Date.parse(request.expires_at) - Date.now()) / 3_600_000))` (compute it in the component with `useMemo` on `request.expires_at`; no `Intl`, no `toFixed`, no `parseFloat`).
- **Actions row** (right-aligned on `sm` and up, wrapping on phones), in this order: (a) **only when `checklistMode === "window"`**: a quiet button `WAITING_CARD_SHOW` with `onClick={onShowChecklist}`; **no other checklist button in this card: the checklist's own status strip (another lane) owns "Reopen checklist" and "Reset checklist", and a second "Reopen checklist" button on the page would break tests**; (b) a secondary button `WAITING_CARD_UPLOAD` with `onClick={onUpload}`; (c) a ghost button with the text **`Cancel request`** (the string that already exists in `WaitingForCasView.tsx`) and `data-testid="cams-waiting-cancel"`.
- **Cancel behaviour:** local state `cancelling` and `error`; on click: set `cancelling`, clear `error`, `await onCancel()` in a `try`, on a thrown error set `error` to its message (or the existing text `Failed to cancel request.` if it has none), `finally` clear `cancelling`. While cancelling the button shows `Cancelling...` (existing wording) and is `disabled`. Show the error as a `<p role="alert">` under the actions, in the same negative style the neighbouring error notice uses.
- Every `<button` has `type="button"`, `data-clickable=""` and `data-effect` (`"open"` for Show checklist, `"expand"` for Upload the file, `"close"` for Cancel request); 2 px focus ring `focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]` on each; `min-h-[36px]`. Reduced motion: no animation. The card is the same on phones (no `hidden`).

## States (what must be true; Claude checks with the tests and the owner screenshots them in the QA round)
| State | What shows |
|---|---|
| Server says a request waits (first load or after a reload, any device) | the card (title, body, expiry in hours, Upload the file, Cancel request) above the existing "Waiting for CAMS email" block; no upload field until the person opens it |
| Floating checklist open | the card also has Show checklist |
| Closed or panel | no checklist button in the card (the strip owns it) |
| Cancel | cancels by the id the server gave, returns to the choice screen; on failure the card shows the message and stays |
| Nothing waits | the usual choice screen (a quiet skeleton while the answer loads) |
| Window regains focus, or the checklist is ticked, finished or closed | **the screen never changes** |

## Expected test results
Before: the seven new container tests and the cancel/reload tests red; after: every test of `TwoPathImportContainer.test.tsx` green, and in `WaitingForCasView.test.tsx` the tests that need the waiting screen from the server (some also need FE-2's strip for the Reopen and Reset buttons and may stay red until that lane merges: Claude checks them after both merge); `types` and `lint` clean; `features/mutual-funds/guards.test.ts` untouched (you add no file there).

## Report (one block, nothing else)
Files changed; one line per change; decisions the packet did not cover; anything you could not check; "checks not run (tools unavailable)".

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-25-hbcd-fe-1-server-screen-packet.md (your task: HBCD-FE-1)
Work only in C:\Users\Dell\ag-hbcd1 on branch ag/hbcd1-server-screen.
IMPORTANT: run NO shell commands at all: no wsl.exe, no npm or npx, no git, no tests, no type check, no lint, and never request a sandbox bypass. This machine blocks them and a blocked command stops your whole task. Claude runs all checks after you.
Do only this: read the packet, create and edit only the files it names with your file tools, re-read each edited file once for syntax, imports and strings, then reply.
Do not touch backend/**, frontend/src/mobile/**, any *.test.* file, anything in features/import/checklist/, RequestCamsPath.tsx, or any file the packet does not name. Use no wording of your own. Reply with the report block from the packet, nothing else.
```
