# Packet HBCD-FE-4: "Request from CAMS" is a real link (D-2) (Antigravity)
**Head of Family item 2 (D-2); plan `Docs/superpowers/plans/2026-11-25-hof-bcd-adddata-plan.md`, Task 10.** **Owner decision (26 Nov):** build it now on the Chrome evidence of the test page (a real `<a target="_blank">` whose click handler opens the floating window **first** works; opening it after a wait is refused). The red tests are written by Codex (`hbcd-rt-2`, handoff `Docs/orchestration/2026-11-26-hbcd-rt-2-d2-handoff.md`): **read that handoff's "contract" section: it fixes the behaviour you build.** Evidence: `Docs/orchestration/spike/checklist-spike/link-test.js` (branch `batch/h-spike2b`): the handler calls `requestWindow` synchronously on the click and never `preventDefault`s.

**Your clone:** `C:\Users\Dell\ag-hbcd4` (branch `ag/hbcd4-link`, cut from `batch/hbcd` after the checklist lane and the D-2 red tests are merged). Work only there. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, `Docs/orchestration/2026-11-26-hbcd-rt-2-d2-handoff.md`, then this packet.
**This machine blocks WSL and npm for you: run NO shell command at all and request no bypass.** Make the edits, re-read each edited file once, and report "checks not run (tools unavailable)": Claude runs every check.

## Files
Modify `frontend/src/features/import/RequestCamsPath.tsx`, `frontend/src/features/import/checklist/CamsChecklist.tsx`, `frontend/src/features/import/checklist/checklistCopy.ts`, `frontend/src/features/import/checklist/checklistStore.ts`, `frontend/src/features/import/checklist/useCamsChecklist.ts` (only if the type change needs it). **Do not touch** any test, `api.ts` (`getCamsLink()` already exists), `pendingCopy.ts`, `CamsChecklistHost.tsx`, `TwoPathImportContainer.tsx`, `WaitingForCasView.tsx`, `checklist-tokens.css`, `backend/**`, `frontend/src/mobile/**`, any other file. **No wording of your own** (the only copy change is deleting two strings). Guards: no hex or `rgb(`; every `<button`/`<a` used as a control has `data-clickable` and a `data-effect` from {open, switch, retry, close, select, expand, navigate, sort}; no bare text literals in JSX in `CamsChecklist.tsx`.

## The edits
1. **`checklistCopy.ts`:** delete the two keys `open` ("Open the CAMS form") and `preparing` ("Getting your link ready"). Nothing else changes.
2. **`checklistStore.ts` (and `useCamsChecklist.ts` if needed):** the "link ready" state goes. Change the `CamsLink` type to `{ state: "idle" | "failed"; error: string | null }` (drop `url` and the `"preparing"` and `"ready"` states), the initial value to `{ state: "idle", error: null }`, and keep `setCamsLink(next: Partial<CamsLink>)`. Keep every other store method (including `finishedFromChecklist` and `clearFinishedFromChecklist`; another lane stopped using them, nothing deletes them).
3. **`CamsChecklist.tsx`:** delete the whole `{api.camsLink.state !== "failed" && ( <button ... copy.open / copy.preparing ... </button> )}` block (the "Open the CAMS form" button). Keep the `failed` block (the error message and its `Try again` button) exactly as it is.
4. **`RequestCamsPath.tsx`** (the main work):
   - **Prefetch the address on mount:** `const [camsUrl, setCamsUrl] = useState<string | null>(null); const [linkState, setLinkState] = useState<"loading" | "ready" | "failed">("loading");` and a `useEffect` that calls `getCamsLink()` (import it from `./api`), sets `camsUrl` and `"ready"` on success, `"failed"` on rejection (ignore the result if the component unmounted).
   - **Split the request into a shared function** `sendRequest(options: { openTab: boolean })` (a `useCallback`) holding today's logic after the `try`: `requestCamsStatement(memberId)`, `setCasResumeStep2(memberId)`, then **only if `options.openTab`** the existing "if the checklist mode is not `"window"` then `window.open(result.cams_url, "_blank")` inside a try/catch", then `onRequestInitiated(...)`; the `catch` sets the error and, when the checklist is on, `checklist.setCamsLink({ state: "failed", error: message })`; the `finally` resets the flags. Remove every `checklist.setCamsLink({ state: "preparing", ... })` and `{ state: "ready", ... }` call. Keep the double-submit guard (`requesting` ref) and the `isLoading` state.
   - **`handleLinkClick`** (the link's `onClick`, **synchronous, not `async`**): `if (requesting.current) return; if (checklist.supported && !withoutChecklist) checklist.open();` **first, before anything else, never after an await, and never call `preventDefault`**; then `void sendRequest({ openTab: false });`. (The link's own behaviour opens CAMS.)
   - **`handleRequest`** (the existing name, kept for the tutorial dialog's green button and for the fallback): `if (requesting.current) return;` set loading, clear the error, `if (checklist.supported && !withoutChecklist) checklist.open();` then `await sendRequest({ openTab: true })`-equivalent (it must still `window.open` the address when the checklist mode is not `"window"`, as today). `handleRequestFromTutorial` stays as it is.
   - **`checklistStore.setRetry`:** the checklist's "Try again" sends the request again **without opening another tab**: `checklistStore.setRetry(() => { void sendRequest({ openTab: false }); })`.
   - **The Request control** (replaces the `<Button onClick={handleRequest} ...>` block; keep the exact classes of today's button and its two label states):
     - `linkState === "ready" && camsUrl`: `<a href={camsUrl} target="_blank" rel="noopener noreferrer" data-clickable="" data-effect="open" aria-disabled={isLoading} onClick={handleLinkClick} className="<today's Button classes> flex items-center justify-center no-underline [pointer-events: none while loading via a class]"> ...same content as today (the spinner and "Opening CAMS Portal..." while `isLoading`, otherwise "Request Statement on CAMS" and the ExternalLink icon)... </a>` (accessible name `Request Statement on CAMS`; it must be a link, `role` link by being an `<a href>`).
     - `linkState === "loading"`: the same-looking `<Button disabled ...>` with the label `Request Statement on CAMS` (no `href`).
     - `linkState === "failed"`: today's `<Button onClick={handleRequest} ...>` (request, then `window.open` the address from the request response).
     - Use the file's existing `Button` classes through the same `className` string; if `Button` cannot render as an anchor, write the `<a>` with the same Tailwind class string.
   - Everything else on the page (the row, the off state, the tutorial link and dialog, the three guided steps, the reference card) stays exactly as it is. The phone app (`frontend/src/mobile/**`) is not touched.

## States (what must be true; Claude checks with the tests, the owner checks the real click in Chrome and Edge in the QA round)
| State | What happens |
|---|---|
| Address loaded, click the link (desktop, floating window supported) | CAMS opens in a new tab **by the link itself**; the floating checklist opens from the same click; the request is sent in the background; the waiting screen shows; **no `window.open` call** for CAMS; no "Open the CAMS form" button anywhere |
| Floating window refused or unsupported | CAMS still opens (the link); the checklist shows in the page panel; the request still goes through |
| Request fails | the message and `Try again` appear in the checklist (and the error under the Request control); Try again sends the request again without opening another tab |
| Address still loading | a disabled button with the same label |
| Address failed to load | today's behaviour (a button that requests, then opens the address from the response) |
| "Continue without it" pressed | the link opens CAMS only; no floating window; the request is sent |
| Phone | unchanged |

## Expected test results
Before your edit the D-2 tests of `RequestCamsPath.test.tsx` and `checklist/CamsChecklist.test.tsx` are red; after: they and all other tests of those files, `WaitingForCasView.test.tsx` and `TwoPathImportContainer.test.tsx` are green; `checklistLook.guard.test.ts`, `types` and `lint` clean.

## Report (one block, nothing else)
Files changed; one line per change; decisions the packet did not cover; anything you could not check; "checks not run (tools unavailable)".

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-26-hbcd-rt-2-d2-handoff.md (the behaviour contract)
5. Docs/orchestration/2026-11-26-hbcd-fe-4-d2-link-packet.md (your task: HBCD-FE-4)
Work only in C:\Users\Dell\ag-hbcd4 on branch ag/hbcd4-link.
IMPORTANT: run NO shell commands at all: no wsl.exe, no npm or npx, no git, no tests, no type check, no lint, and never request a sandbox bypass. This machine blocks them and a blocked command stops your whole task. Claude runs all checks after you.
Do only this: read the packet, edit only the files it names with your file tools, re-read each edited file once for syntax, imports and strings, then reply.
Do not touch backend/**, frontend/src/mobile/**, any *.test.* file, CamsChecklistHost.tsx, TwoPathImportContainer.tsx, WaitingForCasView.tsx, checklist-tokens.css, or any file the packet does not name. Use no wording of your own. Reply with the report block from the packet, nothing else.
```
