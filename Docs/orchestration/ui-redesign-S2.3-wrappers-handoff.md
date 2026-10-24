# Handoff: ui-redesign S2.3 (shell PR 2: seven wrapper routes and the temporary tab strip)
**Status:** OPEN (ready to dispatch). Not a +O run. Codex review is batched into S2.4's review (S2.3 + S2.4 diff).
**Parent plan:** `Docs/superpowers/plans/2026-10-23-shell-pr2-scope-wrappers-switch.md` Task **T3** (run R3), Locked decisions 6 and 7 and the Global Constraints ("existing screens are not changed"). Props table: `Docs/orchestration/2026-10-23-shell-reuse-vs-new.md` section 3. Old behaviour to port: `frontend/src/features/dashboard/MainDashboardFlow.tsx` (read-only; re-read it, line numbers drift).
**Branch:** `feat/shell-nav-switch` (holds shell PR1, S2.1, S2.2). **Orchestrator:** Claude Code. **Worker:** Codex (manual relay).

## Task
Flip these route files from `placeholder` to `live` (keep id, path, layout, scope, order; `page: () => import("../wrappers/<Name>Wrapper")`), and create each wrapper under `shell/wrappers/` (the `import` one already exists from S2.2):
`portfolio-mutual-funds` (Dashboard: `DashboardView`), `portfolio-mutual-funds-history` (`HistoryView`), `portfolio-mutual-funds-analytics` (`AnalyticsView`), `planning` (`ScenariosScreen`; NOTE the registry route id/path for Planning is `planning` at `/planning` per contract v1.6, not `planning-scenarios`; use the registry as it is), `profile-personal` or the Profile route that currently renders `ProfileView` (check the registry: `/profile` redirects to `/profile/personal`; the wrapper goes on the route that is the Profile page; if the contract v1.6 sections make Profile sub-routes placeholders, only the one that hosts `ProfileView` flips; report which), `profile-import-health` (`ImportHealth`). Do NOT touch the `import` route (done) or flip any other route.
Props exactly as plan decision 6: `DashboardView`: `importNotice` from router state (`state.importNotice`), `onDismissImportNotice` clears it (replace navigation to the same URL with state cleared), `viewMode`, `memberId`, `onAddDataForMember` = `useImport().openImport`, `onOpenHistory` = navigate to the History route (`paths`); `HistoryView`: `viewMode`, `memberId`, `memberName`; `AnalyticsView`: `viewMode`, `memberId`, `onAddDataForMember`, `activeMemberName`; `ScenariosScreen`: none; `ProfileView`: `onOpenImportHealth` = navigate, `name` (the "(Me)" member's name without the suffix, else "Account holder"; port the exact derivation from `MainDashboardFlow`), `email`, `phoneNumber`, `logout`, `requestAccountDeletion`, `requestContactChange`, `verifyContactChange` (all from `useAuth()` as `MainDashboardFlow` passes them), `onMembersChanged` = `invalidateApiCache()` then `refreshMembers()`; `ImportHealth`: `memberId` in member mode only, `onBack`. Read each screen's prop types to confirm; if a prop in the plan does not exist on the screen, follow the screen and report.
`shell/nav/TemporaryMfTabs.tsx` (+ test): links Dashboard `/portfolio/mutual-funds`, History, Analytics through `AppLink`/`paths`; current one marked `aria-current="page"`; rendered above the screen in the Dashboard, History and Analytics wrappers only (not Scenarios, not Profile, not Import Health). Add a comment `// TEMPORARY (SF2): removed when the Mutual Funds frontend plan ships the real in-page menu` and a test asserting its presence in the three wrappers so removal is deliberate. Use `var(--shell-*)` tokens.
Member banners (`MemberBanners`, S2.2) are rendered by the layout level in T4 (AppLayout wiring is in S2.4); do not wire them here.

## Tests first (plan T3 Step 1, `shell/routes/wrappers.test.tsx`)
`vi.mock` the screens so props can be asserted; each wrapper renders its screen with the props above; Dashboard reads `importNotice` from router state and dismiss clears it; `onOpenHistory` navigates to History; Profile `name` strips " (Me)" and falls back to "Account holder"; `ImportHealth` gets `memberId` only in member mode; the three wrappers render the strip and Scenarios/Profile/ImportHealth do not; `TemporaryMfTabs` marks the current tab and links three routes; deep link and refresh on each live path render its screen (use `renderInShell` with the real registry); back and forward between two live pages. The registry contract test still passes.

## Constraints
Only files under `frontend/src/shell/` (wrappers, route files, `TemporaryMfTabs`, tests, `index.ts` export). Not touched: existing screens, `MainDashboardFlow.tsx`, `App.tsx`, `main.tsx`, `ShellRoot.tsx`, `features/**`, `mobile/**`, `tokens.css`, `package.json`, lockfile, `Docs/`, backend. No raw hex, no `window.history`/`popstate`/`unifolioTab`. No new dependency, no `npm install`. Git read-only. LF, UTF-8. Run only: `npx vitest run src/shell`, `npx tsc -b`, `npx oxlint src/shell`.

## Review Focus
Prop parity with `MainDashboardFlow` (same values, same handlers); only the listed routes became live; the strip only on the three pages; notice dismissal; `viewMode`/`memberId` come from `useScope()`; Profile name derivation.

## Report
CODEX REPORT block, run label S2.3 (template in `ui-redesign-HB1-compute-holdings-handoff.md`), one fenced block at the end.

## Orchestrator record
(pending)
