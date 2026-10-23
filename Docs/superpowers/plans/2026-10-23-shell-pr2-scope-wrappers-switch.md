# Navigation Shell PR 2 (scope, wrappers, switch-over) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans, applied through the Claude–Codex method in "Execution method" below. Steps use
> checkbox (`- [ ]`) syntax. **Planning only until the user says "go".** Depends on PR 1
> (`2026-10-23-shell-pr1-router-registry-sidebar.md`) being merged or stacked: PR 2 imports its registry, sidebar, layouts, `ScopeContext`, `paths` and `resetRule`.

**Goal:** Switch the new shell on. Move the family-or-member scope, member banners and import entry out of `MainDashboardFlow` into the shell, wrap the existing screens in thin route files (screens unchanged), add the two temporary pieces (tab strip, "+ Add data"), replace `DashboardPlaceholder` with `ShellRoot` in the desktop branch of `App.tsx`, retire the old shell, and port the three existing test files.

**Architecture:** `ScopeProvider` and `ImportProvider` wrap the router inside `ShellRoot`. Seven wrapper route files read the scope and render the unchanged screens with today's props. The only edit to existing runtime code is the desktop branch of `App.tsx`.

**Tech Stack:** as PR 1; no new dependency.

**Spec:** `Docs/orchestration/2026-10-22-nav-shell-contract-v1.md` (v1.2), `2026-10-23-shell-functionality-backend-spec.md` (sections 5 to 8, 7a), `-shell-reuse-vs-new.md` (sections 1 and 3), `-shell-tdd.md`, `-shell-flows.md`, and the Shell Design Workbook (https://claude.ai/artifact/PEfZsLkuKVr1dMpbeDXqnP; private, so every decision is carried verbatim below).

## Phases

| Phase | Covers | Ships |
|---|---|---|
| T1 | `ScopeProvider`, persistence, reset wiring | tested provider, unmounted |
| T2 | `MemberBanners`, `ImportProvider`, import wrapper | tested, unmounted |
| T3 | Wrapper route files, temporary tab strip, status flips | tested wrappers |
| T4 | Switch `App.tsx`, retire old shell, port tests | **shell on screen** |
| T5 | Boundary and landing tests, manual check on a synthetic household | verified |
| T6 | Docs and log updates | closed |

Order is strict: T1 → T2 → T3 → T4 → T5 → T6. T4 is the only task that changes what users see.

## Global Constraints

- **Test-driven, always.** Failing test first.
- **Existing screens are not changed.** `DashboardView`, `HistoryView`, `AnalyticsView`, `ScenariosScreen`, `ProfileView`, `ImportFlow`, `ImportHealth`, the member dialogs and banners, `mobile/**`, auth, onboarding, legal, `main.tsx` and `tokens.css` are untouched. Allowed edits to existing files: `App.tsx` (desktop branch only), deletion of `MainDashboardFlow.tsx`, `NavigationShell.tsx` (+ `.module.css`), `DashboardPlaceholder.tsx`, and edits to `App.test.tsx`, `MainDashboardFlow.test.tsx` (deleted after porting), `NavigationShell.test.tsx` (deleted after porting).
- **Port, do not rewrite.** The scope and banner logic is copied from `MainDashboardFlow.tsx` (lines 41 to 80, 110 to 123, 142 to 159, 250 to 265) and changed only as the rules below state.
- **Money rules:** this PR touches no money values.
- **Run only affected tests:** `cd frontend && npx vitest run <files> 2>&1 | tail -20`; `npx tsc -b`; `npx oxlint <paths>`. No full suite except the gate named at the end. No live network (fake `getHouseholdMembers` and the API client in tests).
- **Mobile branch, auth gates (login, onboarding, re-consent, pending deletion, maintenance banner) are unchanged.**
- **Never push. Stage explicit paths only.**

## Locked decisions (frozen; PR 1's list also applies)

1. **Scope** (`useScope()`): `{ viewMode, memberId, members, selectedMember?, scopeKey, setMember(id), setAggregate(), refreshMembers() }`. Fetch members with `getHouseholdMembers()` on mount and when `me` changes; one member starts in member mode; several start in aggregate mode with the first member preselected (today's rule). `refreshMembers()` after a rename, merge or import, with `invalidateApiCache()` where `MainDashboardFlow` calls it today.
2. **Reset rule:** on a pathname change call `shouldResetScope(prev, next, routes, members.length)` (from PR 1); when true, set aggregate mode. Moves inside one sidebar row (Mutual Fund Overview to Holdings, or a fund page opened from a tab) keep the pick. A one-member household never resets. Routes with scope `none` never change it.
3. **Persistence:** the pick is stored in `sessionStorage["unifolio.shell.scope"]` as `{ mode, memberId }`, re-validated against the member list after the fetch (a missing member falls back to the default). A refresh keeps the pick; entering a different sidebar row still resets it.
4. **Banners:** PAN conflict banner, profile nudge or "Edit profile" button, and the Complete profile dialog show above the page for a single selected member on `family-or-member` routes except Profile (`MemberBanners`, JSX moved as is).
5. **Import:** `useImport().openImport(memberId?)` navigates to `/import?member=<id>` with the origin path in router state. From Family Combined without a member the import header lets the user choose (today's `addDataAllowsMemberChoice`). `/import` uses the focus layout. On `ImportFlow`'s `onDone(notice)` the wrapper navigates (replace) to `/portfolio/mutual-funds` with `{ importNotice: notice }` in router state. **Decided by the owner (23 Oct): completion always goes to `/portfolio/mutual-funds` with the notice, never to the origin screen.** The code keeps this in one function `importDoneTarget()` that takes no origin. The import header's Back link (before completion) still returns to the origin screen, default `/portfolio/mutual-funds` (SF6). Leaving the import screen calls `clearCasResumeStep2(memberId)` as today.
6. **Wrappers** (route files flip from `placeholder` to `live`): `portfolio-mutual-funds` (Dashboard), `portfolio-mutual-funds-history`, `portfolio-mutual-funds-analytics`, `planning-scenarios`, `profile`, `profile-import-health`, `import`. Props as in `-shell-reuse-vs-new.md` section 3 (`DashboardView`: `importNotice` from router state, `onDismissImportNotice` clears it, `viewMode`, `memberId`, `onAddDataForMember` = `openImport`, `onOpenHistory` = navigate to History; `HistoryView`: `viewMode`, `memberId`, `memberName`; `AnalyticsView`: `viewMode`, `memberId`, `onAddDataForMember`, `activeMemberName`; `ScenariosScreen`: none; `ProfileView`: `onOpenImportHealth` = navigate, `name` (the "(Me)" member's name without the suffix, else "Account holder"), `email`, `phoneNumber`, `logout`, `requestAccountDeletion`, `requestContactChange`, `verifyContactChange`, `onMembersChanged` = `invalidateApiCache()` + `refreshMembers()`; `ImportHealth`: `memberId` in member mode only, `onBack`).
7. **Temporary tab strip (SF2):** the Dashboard, History and Analytics wrappers render `TemporaryMfTabs` (links Dashboard `/portfolio/mutual-funds`, History, Analytics; current one marked) above the unchanged screen. Removed when the Mutual Funds owner ships the real in-page menu; a test asserts its presence so removal is deliberate.
8. **Temporary "+ Add data" (SF3):** the top bar button from PR 1 is wired to `openImport()`; removed when the Investments page ships its own Add Investment control.
9. **Landing:** `/` redirects to `/home`; Home is a placeholder (Coming soon) until the Home PR. Staging waits for every page. Back's fallback is `/home`.
10. **App.tsx switch:** in the desktop branch replace `<DashboardPlaceholder />` with `<ShellRoot />` (inside the existing gates). Nothing else in `App.tsx` changes.

## Review Focus

- Behaviour parity with `MainDashboardFlow`: default member mode, member switching, banners, profile dialog save and merge, import notice, `clearCasResumeStep2`, ProfileView `name` derivation.
- No `window.history` / `popstate` / `unifolioTab` left in the tree (grep).
- The reset rule across the real route table (not only fixtures).
- `/print/analytics`, legal pages and the mobile branch never mount the router.
- The tab strip and "+ Add data" are the only temporary UI and both are tested.

## Execution method (the Claude–Codex method, `model-orchestration` skill)

Same roles and per-run procedure as PR 1 (handoff doc per run, delegation-log line, probe on first dispatch, Codex via `codex:codex-rescue` in background, Claude verifies, mandatory adversarial review with a manual relay, Claude commits by explicit paths, never push, Sonnet fallback if Codex quota is exhausted).

| Run | Tasks | Model notes |
|---|---|---|
| R1 | T1 (ScopeProvider, persistence, reset wiring) | Codex; **Opus review** (the riskiest logic: moved state, reset rule) |
| R2 | T2 (MemberBanners, ImportProvider, import wrapper) | Codex |
| R3 | T3 (seven wrappers, tab strip, flips) | Codex |
| R4 | T4 (switch, retire, port tests) | Codex implements; **Claude verifies every ported assertion against the old file**; **Opus review** |
| R5 | T5 (boundary tests, manual check) | Claude (manual check on staging data is Claude-led) |
| R6 | T6 (docs, log) | Claude |
| R7 | Final: whole-branch review | **Opus review, with approval** |

## P0: Pre-flight (Claude, after "go")

- [ ] PR 1 merged (or branch `feat/shell-nav-switch` stacked on `feat/shell-nav`). Baseline: `npx vitest run src/features/dashboard/MainDashboardFlow.test.tsx src/features/dashboard/NavigationShell.test.tsx src/App.test.tsx` pass; `npx tsc -b` clean.
- [ ] Re-read `MainDashboardFlow.tsx` and confirm the line numbers cited above (they drift).
- [ ] Import completion target is decided (locked decision 5): no owner question remains.

## T1: ScopeProvider (run R1)

**Files:** create `shell/scope/ScopeProvider.tsx`, `ScopeProvider.test.tsx`, `scopeStorage.ts`.

`ScopeProvider` takes `children`, reads `useAuth()` (`me`), `useLocation()` and the registry (`buildRegistry()`), and provides the PR 1 `ScopeContext`. Port the members effect and `refreshMembers` unchanged; add the reset effect and persistence:

```tsx
const prev = useRef(location.pathname);
useEffect(() => {
  if (shouldResetScope(prev.current, location.pathname, routes, members.length)) setViewMode("aggregate");
  prev.current = location.pathname;
}, [location.pathname]);
```

- [ ] **Step 1: Failing tests** (fake `getHouseholdMembers`, `MemoryRouter` with `Routes`, a probe component showing `viewMode`/`memberId`): one member starts in member mode; two members start in aggregate with the first preselected; `setMember` then `setAggregate`; `refreshMembers` updates the list and calls `invalidateApiCache` path as `MainDashboardFlow` did; navigating from `/portfolio/mutual-funds` (member picked) to `/portfolio/mutual-funds/holdings` keeps the pick; to the fund page keeps it; to `/portfolio/debt` resets; from `/home` into Portfolio resets; to `/profile` leaves it; one member never resets; a stored pick survives a remount (refresh) and a stored member that no longer exists falls back; `getHouseholdMembers` failure leaves empty members and does not throw; `scopeKey` changes when mode or member changes.
- [ ] **Step 2:** implement (copy the effect and handlers, rename `handleMemberSelect` to `setMember`). **Step 3:** run the test file; PASS; `tsc`.

## T2: Banners, import provider, import wrapper (run R2)

**Files:** create `shell/scope/MemberBanners.tsx`, `MemberBanners.test.tsx`, `shell/nav/ImportProvider.tsx`, `ImportProvider.test.tsx`, `shell/routes/import.route.tsx` (replaces the PR 1 placeholder version), `shell/nav/importDoneTarget.ts`, `importDoneTarget.test.ts`.

- [ ] **Step 1: Failing tests.** `MemberBanners`: shows the PAN conflict banner and the nudge (or "Edit profile" at 100%) for a single selected member on a `family-or-member` route; shows nothing in aggregate mode, on Profile, or on a `none` route; the Complete profile dialog opens from both buttons and, on save, calls `invalidateApiCache` and `refreshMembers`; on merge it selects the merged member (ported from `MainDashboardFlow`). `ImportProvider`/`import.route`: `openImport("m1")` navigates to `/import?member=m1` with the origin in state; from aggregate with no member `addDataAllowsMemberChoice` is true and the header shows a member select, else a chip "Importing for <name>"; `ImportFlow` is keyed by member; `onDone(notice)` navigates (replace) per `importDoneTarget`; leaving calls `clearCasResumeStep2`. `importDoneTarget`: always returns `/portfolio/mutual-funds` with the notice, whatever the origin state holds.
- [ ] **Step 2:** implement by moving JSX and handlers. **Step 3:** run the four test files; PASS.

## T3: Wrapper route files and tab strip (run R3)

**Files:** replace the PR 1 placeholder route files for the seven wrapper routes with live ones; create `shell/nav/TemporaryMfTabs.tsx`, `TemporaryMfTabs.test.tsx`, `shell/routes/wrappers.test.tsx`.

- [ ] **Step 1: Failing tests** (`wrappers.test.tsx`, mock the screens with `vi.mock` so props can be asserted; one real `DashboardView` render stays in `DashboardView.test.tsx`, untouched): each wrapper renders its screen with the props from decision 6; Dashboard reads `importNotice` from router state and its dismiss clears it; `onOpenHistory` navigates to the History route; Profile `name` strips " (Me)"; `ImportHealth` gets a `memberId` only in member mode; the three wrappers with the strip render it, `ScenariosScreen` and `ProfileView` do not; `TemporaryMfTabs` marks the current tab and links the three routes; deep link and refresh on each of the seven live paths render the screen; back and forward between two live pages work.
- [ ] **Step 2:** write the wrappers (each file: the `ShellRoute` with `status: "live"` and `page: () => import("./wrappers/<Name>Wrapper")`, plus the wrapper component under `shell/wrappers/`). **Step 3:** run `npx vitest run src/shell`; PASS; `tsc`; `oxlint src/shell`.

## T4: Switch on, retire the old shell, port tests (run R4)

**Files:** modify `frontend/src/App.tsx` (desktop branch only); delete `features/dashboard/MainDashboardFlow.tsx`, `NavigationShell.tsx`, `NavigationShell.module.css`, `DashboardPlaceholder.tsx`; port then delete `MainDashboardFlow.test.tsx` and `NavigationShell.test.tsx`; update `App.test.tsx`.

- [ ] **Step 1: Port first.** List every `it(...)` in the three test files (8 + 15 + about 7). For each, write the equivalent assertion in the new shell tests (scope, banners, import, sidebar, wrappers) **before** deleting anything; record the mapping table `old test -> new test` in the handoff. History-state assertions (`unifolioTab`) become URL assertions. Tests that no longer describe behaviour (the old top-bar Family/Per Member switch, the old header layout) are listed as retired with a reason.
- [ ] **Step 2: Failing test** in `App.test.tsx`: a ready desktop user at `/` ends on `/home` inside the shell (sidebar and top bar present, placeholder shown); the mobile branch still renders `MobileRoot`; an unauthenticated user still sees `AuthEntryFlow`.
- [ ] **Step 3:** replace `DashboardPlaceholder` with `ShellRoot` (wrapped in `ScopeProvider` and `ImportProvider` inside `ShellRoot`); delete the old files; fix imports. `grep -rn "MainDashboardFlow\|NavigationShell\|DashboardPlaceholder\|unifolioTab" frontend/src` returns nothing outside the deleted files' own history.
- [ ] **Step 4:** run `npx vitest run src/App.test.tsx src/shell src/features/dashboard src/features/history src/features/analytics src/features/profile src/features/import`; PASS; `npx tsc -b`; `npm run build`.

## T5: Boundary, landing and manual check (run R5, Claude)

- [ ] **Tests:** `shell/boundary.test.tsx`: `/print/analytics` and the legal paths do not mount the shell (assert via `main.tsx`'s predicate, no edit to `main.tsx`); `MainApp` mobile viewport and `/mobile` do not mount `ShellRoot`.
- [ ] **Manual check (one pass, dev server, light and dark):** both sidebar modes; Equity expand and collapse by mouse and keyboard; greyed rows and tooltip; focus ring on every row; deep link and refresh on `/portfolio/mutual-funds/holdings`; Back after Profile and after a deep link; scope rule with a two-member synthetic household (`Docs/CAS Files/synthetic/pdfs/realistic/`, password `MF@123`): pick a member, move between the three MF tabs (kept), then to Profile and back (reset); `/import` focus layout and its Back link; `/portfolio/equity` redirect; narrowing below 768 px switches to the mobile tree; existing screens look unchanged inside the page area.
- [ ] Record results in the handoff; fix anything visibly broken (one pass).

## T6: Docs and log (run R6, Claude)

- [ ] Update `Docs/orchestration/2026-10-22-nav-shell-contract-v1.md` change log (what shipped; the temporary pieces and when they go), the delegation log, `session.md` top section, and `log.md` (append-only). Do **not** append to `decisions.md` without the owner's go (the proposal is `2026-10-23-shell-backend-decisions-proposal.md`).

## F: Final gate (run R7)

- [ ] `cd frontend && npx vitest run src/shell src/App.test.tsx` plus the touched feature folders pass; independent full frontend run once (`npx vitest run`) because the diff touches `App.tsx`; `npx tsc -b`; `npm run build`; `npx oxlint src`.
- [ ] `git diff --stat feat/leapswitch-staging...HEAD`: only the allowed files.
- [ ] Opus adversarial review (with approval) of the whole branch, then fix per "Review-loop fix authorship".
- [ ] Owner's staging check is **not** part of this PR: staging waits until every page from the PDF is built.

## Open items

Removal of the tab strip and "+ Add data" when their replacements ship; the owner's CODEOWNERS enforcement setting; moving `tokens.css` to the palette (a later task, changes existing screens).
