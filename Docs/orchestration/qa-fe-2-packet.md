# Packet QA-FE-2 for Gemini (Antigravity): sign-up and sign-in polish (B1 errors, B2 login lands on Home, B3 Back from View details and Import History)

**Status:** READY FOR GEMINI. The red tests are committed. Your job is to make them green by changing **only** the files each task lists, so the changed screens look exactly like the mockups below and **every other screen stays exactly as it is today**.
**Rules file (read first; this packet adds to it and wins where they differ):** `Docs/orchestration/ui-common-rules-antigravity.md`. **Spec (decisions and mockups):** `Docs/superpowers/specs/2026-11-06-qa-fixes-design.html`, sections B1, B2, B3. **Plan:** `Docs/superpowers/plans/2026-11-06-qa-fixes-implementation.md`, Tasks 5, 6, 7. **Packet QA-FE-1** is already built; do not touch its files.
You cannot see the screen. The orchestrator takes screenshots of your result next to the mockups and sends back exact differences. Do not improvise a look: where this packet gives a class, size or token, use it; where it says nothing, keep what the file does today.

## Where to work
- Only in the worker clone named in your prompt (`qa-fe`, a git worktree). You never run a git command that changes anything (read-only `status`, `diff`, `log` are fine).
- Checks (PowerShell; the script mirrors the clone to WSL's own disk and runs the tool):
```
wsl.exe -d Ubuntu -- env CR6_SRC="/mnt/c/Users/Dell/Desktop/MVP v1/wt/qa-fe/frontend" CR6_DST=/home/delladiti/qa-fe-worker bash "/mnt/c/Users/Dell/Desktop/MVP v1/wt/qa-fe/Docs/orchestration/cr-r6-fe-check.sh" test src/features/auth src/shell/nav src/features/profile-v2 src/features/profile
wsl.exe -d Ubuntu -- env CR6_SRC="/mnt/c/Users/Dell/Desktop/MVP v1/wt/qa-fe/frontend" CR6_DST=/home/delladiti/qa-fe-worker bash "/mnt/c/Users/Dell/Desktop/MVP v1/wt/qa-fe/Docs/orchestration/cr-r6-fe-check.sh" types
wsl.exe -d Ubuntu -- env CR6_SRC="/mnt/c/Users/Dell/Desktop/MVP v1/wt/qa-fe/frontend" CR6_DST=/home/delladiti/qa-fe-worker bash "/mnt/c/Users/Dell/Desktop/MVP v1/wt/qa-fe/Docs/orchestration/cr-r6-fe-check.sh" lint
```
- **Before you start** red: `authErrors.test.tsx`, `ImportDetailsDialog.test.tsx` and `useBack.test.tsx` (they fail to load: the modules do not exist yet); 3 tests in `AuthContext.logout.test.tsx`; 6 in `OnboardingFlow.details.test.tsx`; 1 in `OnboardingFlow.split.screens.test.tsx`; 1 in `AllSet.test.tsx`; 3 in `ImportHistoryPage.test.tsx`. Everything else under `src/features/auth src/shell/nav src/features/profile-v2 src/features/profile` passes. Keep it all green.

## Hard rules for this packet
1. **The red test files are fixed.** Do not edit, weaken or delete a test. If one seems wrong, say which and why under Open questions and make the rest pass.
2. **Only the files listed in each task may change.** The orchestrator diffs your clone against an allowed-files list. If a task seems to need another file, STOP and list it under Open questions.
3. **Unchanged UI stays byte-identical.** Do not touch: `features/auth/Mobile*`, `mobile/**`, `features/auth/redesign/*` files not named below, the other auth screens' layout and copy, `features/profile/ImportHistorySection.tsx` (its list and delete flow are not changed; see T3), `features/profile-v2` anything except `pages/ImportHistoryPage.tsx`.
4. No new dependency, no `package.json`/lockfile change, no `any`, no `console.`, no em dashes in user-visible text, no new user-visible words beyond the ones written here. A `.tsx` file that exports a component must not also export a constant or hook.
5. Colours only through tokens. The sign-up and sign-in screens are **always light**: error colours must never follow the app theme.
6. Desktop only. Mobile (`/mobile` paths, `isMobile`, `variant="legacy"`) behaves exactly as today.

---

## T1. Sign-up and sign-in errors that read clearly in any theme (B1)

**Files you may change:** `frontend/src/styles/auth-tokens.css`, `frontend/src/features/auth/redesign/AuthAlert.tsx`, `AuthField.tsx`, `InvestorProfile.tsx`, `OptionRow.tsx`, `ChipCheckbox.tsx`, `SignupPhoneEntry.tsx`. **New file:** `frontend/src/features/auth/redesign/AuthInlineError.tsx`.
**Tests that must go green:** `src/features/auth/redesign/authErrors.test.tsx`. **Must stay green:** all of `src/features/auth` (especially `InvestorProfile.test.tsx`, `AuthAlert.test.tsx`, `AuthField*.test.tsx`, `SignupPhoneEntry.test.tsx`).

### Why (so you do not reintroduce it)
The messages are 13 px text in `--neg-text`, which is a deep red in the light theme but a pale red (`#F87171`) in dark mode, while the sign-up card is always light. For anyone using dark mode it is pale red on near-white, faint and odd.

### The mockup. Before / after, real HTML from the approved spec (the screen is the always-light sign-up screen 4)
```html
<!-- BEFORE -->  <div class="errold">Choose how you usually invest.</div>      <!-- plain 13px #F87171 text -->
<!-- AFTER -->
<div class="opt bad">…answer…</div> <div class="opt bad">…answer…</div>          <!-- every answer of the failing group has the red outline -->
<div class="errnew"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#B42318" stroke-width="1.5"/><path d="M8 4.5v4.2M8 11.2v.1" stroke="#B42318" stroke-width="1.7" stroke-linecap="round"/></svg>Choose how you usually invest.</div>
<div class="chips gchips bad">…six goal chips, each with the red outline…</div>
<div class="errnew">…icon…Choose at least one goal.</div>
/* .errnew { display:flex; gap:7px; align-items:center; color:#B42318; background:#FEF3F2; border:1px solid #FDA29B;
             border-radius:10px; padding:7px 10px; font-size:13.5px; font-weight:600; margin-top:6px }
   .opt.bad, .gchips.bad .gchip { border-color:#FDA29B } */
```

### Exact changes
1. **`styles/auth-tokens.css`.** In the existing first `:root { ... }` block add: `--auth-error: #B42318; --auth-error-bg: #FEF3F2; --auth-error-line: #FDA29B;` (these are the only hex colours you add; they must **not** be redefined in any dark-mode block). Replace the rule `.auth-field[data-invalid="true"] { border-color: var(--neg-text, #DC2626); }` with `border-color: var(--auth-error);` (so the file no longer contains `--neg-text`). Add:
```css
.auth-choice[data-invalid="true"] { border-color: var(--auth-error-line); }

.auth-inline-error {
  display: flex; align-items: center; gap: 7px; margin-top: 6px; padding: 7px 10px;
  border: 1px solid var(--auth-error-line); border-radius: 10px;
  background: var(--auth-error-bg); color: var(--auth-error);
  font-size: 13.5px; font-weight: 600; line-height: 1.35;
}
```
   Put `.auth-choice[data-invalid="true"]` **after** the `.auth-choice[aria-checked="true"]` rule so that, if both ever apply, the red outline wins.
2. **`AuthInlineError.tsx` (new).** `export function AuthInlineError({ id, children }: { id?: string; children: ReactNode })` renders `<p id={id} role="alert" data-testid="auth-inline-error" className="auth-inline-error"><CircleAlert size={16} aria-hidden="true" className="shrink-0" />{children}</p>` (lucide `CircleAlert`). The message must be the only text inside (a test compares `textContent`).
3. **`AuthAlert.tsx`.** The error tone classes become `border-[var(--auth-error-line)] bg-[var(--auth-error-bg)] text-[var(--auth-error)]` (replacing the three `--neg-text` classes). The info tone, the `role` and the action button are unchanged.
4. **`AuthField.tsx`.** The error `<p>` becomes `<AuthInlineError id={`${id}-error`}>{error}</AuthInlineError>`. Same id, so `aria-describedby` and `aria-invalid` keep working.
5. **`SignupPhoneEntry.tsx`.** The `fieldError` `<p id="signup-phone-error" ...>` becomes `<AuthInlineError id="signup-phone-error">{fieldError}</AuthInlineError>`.
6. **`OptionRow.tsx` / `ChipCheckbox.tsx`.** New optional prop `invalid?: boolean`; the button gets `data-invalid={invalid ? "true" : undefined}`. Nothing else changes.
7. **`InvestorProfile.tsx`.** The two messages become `<AuthInlineError>Choose how you usually invest.</AuthInlineError>` and `<AuthInlineError>Choose at least one goal.</AuthInlineError>` (same words, same order, same conditions). Pass `invalid={typeError}` to every `OptionRow` and `invalid={goalsError}` to every `ChipCheckbox`. The error states already clear on answering; keep that. Focus still goes to the first control of the first failing group (unchanged).

### Do not change
Any wording, the order of messages, focus handling, `role="alert"` announcements, the layout tokens, other auth screens' error text (they get the new look through `AuthAlert`/`AuthField` automatically).

---

## T2. After a manual logout, the next login opens Home (B2)

**File you may change:** `frontend/src/features/auth/AuthContext.tsx`. **Tests:** `src/features/auth/AuthContext.logout.test.tsx` (red) and the existing `AuthContext.test.tsx` (stays green).

### Why
`logout()` clears the session but leaves the page address alone, so the next login draws the signed-in screens at the old address (for example `/profile/family`). The router is created fresh at login (`ShellRoot` mounts a new `BrowserRouter`), so resetting the address at logout is enough: the root route already redirects `/` to `/home`.

### The change
At the end of `logout()` (after `clearToken(); setTokenState(null); setMe(null);`), add:
```ts
// Desktop only; the mobile app keeps its own behaviour (same test App.tsx uses to detect a mobile route).
if (typeof window !== "undefined" && !window.location.pathname.startsWith("/mobile") && !window.location.hash.startsWith("#/mobile")) {
  window.history.replaceState(null, "", "/");
}
```
That is the whole change. `replaceState` (not `pushState`): it adds no history entry, and it drops any query and hash.
**Do not** call it anywhere else: the expired-session path in `resume()` (it calls `clearToken()` directly), a page opened directly while signed out, and login must keep the address, so a pasted link or an expired session returns the person to that page after login. The tests check all of that.

---

## T3. Back from "View details" and from Import History (B3)

**Files you may change:** `frontend/src/features/auth/OnboardingFlow.tsx`, `features/auth/redesign/AllSet.tsx`, `features/profile-v2/pages/ImportHistoryPage.tsx`. **New files:** `frontend/src/features/auth/redesign/ImportDetailsDialog.tsx`, `frontend/src/shell/nav/useBack.ts`.
**Tests that must go green:** `src/features/auth/redesign/ImportDetailsDialog.test.tsx`, `src/shell/nav/useBack.test.tsx`, `src/features/auth/OnboardingFlow.details.test.tsx`, the changed tests in `AllSet.test.tsx`, `OnboardingFlow.split.screens.test.tsx` and `ImportHistoryPage.test.tsx`. **Must stay green:** everything under `src/features/auth`, `src/features/profile`, `src/features/profile-v2`, `src/shell`.

### Why
During sign-up, "View details" used to save "onboarding complete" and open the signed-in Import History page, so the browser Back had no All set screen to return to. Decision (R3): "View details" now opens the import details **as a dialog over All set** (read-only); Back (the button, the cross, Escape and the browser's Back) closes it; onboarding is saved complete **only** when the person presses "Go to my dashboard". Inside the account, the Import History page's fixed "← Settings" link becomes "← Back", which returns to the screen the person came from (Settings, or Mutual Funds when they came from the new-funds list), falling back to Settings.

### The mockup (during sign-up). Real HTML from the approved spec, light theme
```html
<div class="m m-light"><div style="text-align:center;font-weight:700;font-size:15px;margin-bottom:8px">You're all set!</div>
  <div style="border:1px solid var(--m-line);background:#fff;border-radius:14px;padding:12px;margin-bottom:10px">
    <div class="flex between"><b style="font-size:14px">Import details</b><span class="muted" aria-hidden="true">✕</span></div>
    <div class="muted sm" style="margin:3px 0 8px">Your imported statements</div>
    <div class="flex between" style="padding:6px 0;border-top:1px solid var(--m-line)"><span>Mutual Funds · CAS statement</span><span class="muted sm">289 transactions · Imported</span></div>
    <div style="margin-top:8px"><span class="btn q">← Back</span></div>
  </div>
  <div style="text-align:center"><span class="btn g">Go to my dashboard</span></div></div>
```
Use the **same dialog shell the other sign-up pop-ups use** (`PromptDialog` in `features/import/prompts/PromptDialog.tsx`: title, the cross, Escape, outside click, footer). Do not invent a new look: the cross, the corner radius, the backdrop and the focus trap come from it.

### `AllSet.tsx`
Props become `{ onFinish: (target: "home") => void | Promise<void>; onViewDetails: () => void }`. "Go to my dashboard" behaves exactly as today (`finish("home")`, busy state, "Opening...", single call on a double click, the retry message). "View details" now calls `onViewDetails()` directly (it is no longer routed through `finish`, so it is never blocked by, and never triggers, a save). Keep its label, `aria-label="View details ›"`, classes and `disabled={busy}` exactly.

### `ImportDetailsDialog.tsx` (new)
`export function ImportDetailsDialog({ open, onClose }: { open: boolean; onClose: () => void })`. Built on `PromptDialog` (`isOpen={open}`, `title="Import details"`, `onClose={onClose}`, footer = one button `<Button type="button" variant="outline" onClick={onClose}>← Back</Button>` from `@/components/ui/button`). It loads only while open: `getHouseholdImportHistory()` from `@/features/import/api`, once per opening (cleanup flag against a late response). Content, in order:
- a muted line under the title: `Your imported statements` (13 px, `text-[var(--ui-text-muted)]`);
- while loading: `Loading…`; on failure: `Could not load import details.`; when empty: `No imports yet.` (all `text-sm text-[var(--ui-text-muted)]`);
- one **row per statement group** (group with `groupKey` from `@/features/profile/historyGroups`), `data-testid="import-details-row"`, `flex items-start justify-between gap-3 border-t border-[var(--ui-divider)] py-2` (the first row's top border is the divider under the muted line): left a `<div className="min-w-0">` with `<p className="text-sm font-medium text-[var(--ui-text)]">Mutual Funds · CAS statement</p>`, then `<p className="text-xs text-[var(--ui-text-muted)]">` with the period `1 Jan 2016 – 5 Oct 2026` (use `formatDate` exported by `features/profile/ImportHistorySection.tsx`; when either date is null: `Statement period unavailable`), and for a group of several people one more `<p className="text-xs text-[var(--ui-text-muted)]">` with the `member_name`s joined by `, `; right `<span className="shrink-0 text-xs text-[var(--ui-text-muted)]">{n} transaction(s) · {status}</span>` where `n` is the sum of `new_transactions_count ?? 0` over the group (`1 transaction`, otherwise `N transactions`) and `status` is `Imported` when `isCompletedImport(item.status)` (from `@/features/import/importStatus`, status of the first item of the group), otherwise the status with underscores turned into spaces and the first letter capitalised (`Processing`).
- **Read-only: no delete control anywhere.** Do not render `ImportHistorySection` (it is themed for the signed-in app and has delete buttons); this list is a small separate view of the same data.

### `OnboardingFlow.tsx`
- `finish` becomes `async () => {...}` for home only: keep exactly today's behaviour for `"home"` (push `/home`, then `updateMe({ onboarding_completed: true })`, and on failure put the previous address back and rethrow). Remove the `"import-history"` branch and the now-unused `paths` import if nothing else uses it.
- Add state `const [detailsOpen, setDetailsOpen] = useState(false)` and:
```ts
const openDetails = () => { window.history.pushState({ onboardingDetails: true }, "", window.location.href); setDetailsOpen(true); };
// The dialog's Back, cross and Escape go through the browser history so that the entry opening pushed is consumed.
const closeDetails = () => { if (window.history.state?.onboardingDetails) window.history.back(); else setDetailsOpen(false); };
useEffect(() => {
  if (!detailsOpen) return;
  const onPop = () => setDetailsOpen(false);
  window.addEventListener("popstate", onPop);
  return () => window.removeEventListener("popstate", onPop);
}, [detailsOpen]);
```
- In `renderStep`, the `all_set` branch returns `<><AllSet onFinish={finish} onViewDetails={openDetails} /><ImportDetailsDialog open={detailsOpen} onClose={closeDetails} /></>`.
- Nothing else in this file changes. Mobile onboarding (`isMobile`, `variant="legacy"`) never reaches this branch and is untouched.
- A reload on All set or on the dialog starts again on All set through the existing resume rule (`resumeStepSplit` + completed import); nothing to add.

### `useBack.ts` (new, `shell/nav/`)
```ts
export function useBack(fallback: string): () => void   // hook only (.ts)
```
Uses `useNavigate()` and `useLocation()` from `react-router`. The first screen of a visit (a pasted link, a reload) has `location.key === "default"`; every later one has its own key. Returns a stable callback: when `key === "default"` it calls `navigate(fallback, { replace: true })`, otherwise `navigate(-1)`.

### `ImportHistoryPage.tsx`
Replace the `AppLink` "Settings" link with a **button**: `<button type="button" onClick={back} className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--shell-text-body)] hover:text-[var(--ui-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"><ArrowLeft size={16} aria-hidden="true" />Back</button>` with `const back = useBack(paths.profileSettings())`. Same position above the section. Remove the now-unused `AppLink` import. Everything else on the page (the frame, the section and its props) is unchanged.

---

## Report (one block, nothing else)
Failing counts before and after, with the exact commands; `git status --short` (only the files named above); every file edited outside the lists and why (there should be none); decisions this packet did not cover; what you could not check (you cannot see the screen: say so); Open questions.

## What the orchestrator checks after you
Screenshots at 1440x810 and 1920x1080 of sign-up 4 with both errors (and in a dark-mode browser), All set with the dialog open next to the mockup, Import History with Back; a click-through of sign-up to the end (View details, Back, browser Back, Go to my dashboard), log out and in from Profile, Family (lands on Home) and a pasted deep link while signed out (lands on that page); the neighbouring screens against the baseline; the diff against the allowed-files list.
