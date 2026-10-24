# Handoff: ui-redesign S2.1 (shell PR 2: ScopeProvider, persistence, reset wiring)
**Status:** DONE (2f430e4); Codex review batched into S2.2. Not a +O run in the run catalogue (the PR2 plan marks R1 for Opus; the orchestrator will run a Codex review, and an Opus review only if the owner approves it for this run).
**Parent plan:** `Docs/superpowers/plans/2026-10-23-shell-pr2-scope-wrappers-switch.md` Task **T1** (run R1), plus its Global Constraints and Locked decisions 1 to 3. Contract v1.6 (`useScope`). PR 1 provides `ScopeContext`, `useScope`, `shouldResetScope`, `buildRegistry`, `renderInShell`/`TestScopeProvider` under `frontend/src/shell/`.
**Branch:** `feat/shell-nav-switch` (cut from `feat/shell-nav`, which holds all of shell PR 1). **Orchestrator:** Claude Code. **Worker:** Codex (manual relay).

## Task
Create `shell/scope/ScopeProvider.tsx`, `ScopeProvider.test.tsx`, `scopeStorage.ts`. The provider is NOT mounted anywhere yet (T4 mounts it). It reads `useAuth()` (`me`; find the hook with grep), `useLocation()` and `buildRegistry()`, and provides the existing `ScopeContext` value (`ScopeValue` in `scopeTypes.ts`, do not change that type; if it truly cannot carry something you need, report it under Open questions).
Port from `frontend/src/features/dashboard/MainDashboardFlow.tsx` (read-only; re-read it, the plan's line numbers drift): the members state and effect (lines ~41 to 80; one member starts in member mode, several start in aggregate with the first member preselected, a failed fetch leaves members empty and does not throw), `refreshMembers` (~line 110) with the `invalidateApiCache()` calls exactly where that file makes them (the provider's `refreshMembers` itself refetches; document in a comment who calls `invalidateApiCache`), and `toMemberOption`. Rename `handleMemberSelect` to `setMember`; add `setAggregate`. Add the reset effect from the plan (`shouldResetScope(prev, next, routes, members.length)` on pathname change, then set aggregate mode and clear the member? decide: aggregate mode keeps `memberId` as the preselected first member exactly like today's aggregate state; note your choice in a comment). Add persistence in `scopeStorage.ts`: `sessionStorage["unifolio.shell.scope"] = { mode, memberId }`; read after the member fetch and re-validate (a missing member falls back to the default rule); a throwing storage must not break anything. `scopeKey` changes when mode or member changes (use the format `TestScopeProvider` uses: `aggregate` or `member:<id>`).
Reuse, do not duplicate, logic that exists in `shell/` (`shouldResetScope`, `ScopeContext`).

## Tests first (Step 1 list in the plan)
Fake `getHouseholdMembers` and `invalidateApiCache` via `vi.mock` of the API client; `MemoryRouter` with a probe component showing `viewMode`/`memberId`/`scopeKey`. Cases: one member starts in member mode; two members start aggregate with the first preselected; `setMember` then `setAggregate`; `refreshMembers` updates the list; `/portfolio/mutual-funds` (member picked) to `/holdings` keeps the pick; to a fund page keeps it; to `/portfolio/debt` resets; `/home` into Portfolio resets; to `/profile` leaves it; one member never resets; a stored pick survives a remount and a stored member that no longer exists falls back; fetch failure leaves empty members; `scopeKey` changes. Use real route paths from the registry (`/portfolio/equity/direct-stocks` etc. may be placeholders; `shouldResetScope` works on the registry regardless of status).

## Constraints
Only new files under `frontend/src/shell/scope/` (plus tests); `shell/index.ts` may export `ScopeProvider`. Do not edit `MainDashboardFlow.tsx`, `App.tsx`, `main.tsx`, any existing screen, `features/**`, `mobile/**`, `tokens.css`, `package.json`, lockfile, `Docs/`, backend. No new dependency, no `npm install`. Git read-only. LF, UTF-8. Run only: `npx vitest run src/shell/scope src/shell/nav`, `npx tsc -b`, `npx oxlint src/shell`.

## Review Focus
Behaviour parity with `MainDashboardFlow` (default modes, member switching); the reset rule against the real registry; stale-member fallback; no unhandled promise rejection on a failed fetch; the effect re-fetches when `me` changes but does not reset a user's pick on every render; no `window.history`/`popstate` use.

## Report
CODEX REPORT block, run label S2.1 (template in `ui-redesign-HB1-compute-holdings-handoff.md`), one fenced block at the end.

## Orchestrator record
Codex report DONE. Orchestrator re-ran src/shell: 243 passed, 1 skipped; tsc and oxlint clean; only the 3 new files plus the index export. Read ScopeProvider.tsx: parity rules, stale-response guard and loading-time navigation recheck look right.
