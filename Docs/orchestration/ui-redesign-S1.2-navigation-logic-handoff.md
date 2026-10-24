# Handoff: ui-redesign S1.2 (shell PR 1: navigation functions, paths, AppLink, Back memory)
**Status:** DONE (9de1e5b, fix e186296). **Opus review after the Codex review (approved).**
**Parent plan:** `Docs/superpowers/plans/2026-10-23-shell-pr1-router-registry-sidebar.md` Task **T3** (run R2 of that plan; the plan contains the reference code for `resolve.ts` and `resetRule.ts`). Contract: `Docs/orchestration/2026-10-22-nav-shell-contract-v1.md` (v1.6, sections 3 and 6). Run catalogue: handoff section 6, run **S1.2**.
**Branch:** `feat/shell-nav` (already holds S1.1: registry, 41 route files, contract test). **Orchestrator:** Claude Code · **Worker:** Codex (manual relay).

## Task
Implement plan **Task T3** exactly: `shell/nav/resolve.ts` (`resolveRoute`, `modeOf`, `rowOf`, `activeRowId`), `paths.ts` (typed builders for every live and placeholder route, including the fund trio and Profile sections), `modeMemory.ts` (Back memory), `AppLink.tsx`, `useAppNavigate.ts`, `scope/resetRule.ts`, each with its test file, tests first, then minimal code. Use the registry that exists (`shell/registry/*`); do not change it, except that if a `paths` builder needs an id or path the registry lacks, report it under Open questions instead of adding it.
Points the plan leaves to you: `resolveRoute` must pick the most specific match (a route with fewer params wins, then the longer path) so `/portfolio/mutual-funds/funds/:schemeId/insights` beats `/portfolio/mutual-funds/funds/:schemeId`; the scope-reset rule table is the one in the plan's T3 Step 1 (confirmed by the owner 23 Oct): Family Combined on every page change except between pages that share one sidebar row; single-member households never reset; `scope: none` routes never reset.

## Constraints
Test-first. Only files under `frontend/src/shell/nav/` and `frontend/src/shell/scope/` are created (plus their tests). No edit to the registry, route files, existing screens, `App.tsx`, `main.tsx`, `features/**`, `mobile/**`, `tokens.css`, `package.json`, the lockfile, `Docs/`, backend. No new dependency (do not run npm install). No raw hex. Git is read-only for you (`status`, `diff`, `log`, `show`, `grep`, `ls-files`). LF, UTF-8. Run only: `npx vitest run src/shell/nav src/shell/scope src/shell/registry`, `npx tsc -b`, `npx oxlint src/shell`. No full suite.

## Review Focus (from the plan)
A route flipped from `placeholder` to `live` becomes a link everywhere with no other edit (AppLink test with a fixture registry); `rowOf` handles tab routes, the fund page (`/funds/:schemeId`) and redirect routes; Back never remembers `/import`, a Portfolio path or a placeholder, and falls back to `/home` when storage throws; the reset rule table, including `/profile` (scope none) and single-member households.

## Report
CODEX REPORT block, run label S1.2 (template in `ui-redesign-HB1-compute-holdings-handoff.md`), as one fenced block at the end.

## Orchestrator record
Codex report DONE (143 tests). Codex review FAIL: encoded path bypassed placeholder guard (Medium), ignored relative option (Low); both fixed. Opus review PASS with Medium (encoded slash must stay encoded) and Lows; fixed: slash handling, query/hash stripped, modeOf case/decoding, NaN member count, focusable placeholder, empty member id; reset tests added (154 pass, tsc clean). Deferred, recorded in session file: redirect-following guards, scope reset via Equity redirect.
