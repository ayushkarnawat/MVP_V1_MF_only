# Handoff: ui-redesign S2.2 (shell PR 2: MemberBanners, ImportProvider, import wrapper)
**Status:** OPEN (ready to dispatch). Not a +O run. After this run: ONE Codex review prompt covering S2.1 and S2.2.
**Parent plan:** `Docs/superpowers/plans/2026-10-23-shell-pr2-scope-wrappers-switch.md` Task **T2** (run R2), with Locked decisions 4, 5, 6 (the `import` row) and the Global Constraints ("port, do not rewrite"). Contracts: `Docs/orchestration/2026-10-22-nav-shell-contract-v1.md` v1.6; `2026-10-23-shell-flows.md` section 6.
**Branch:** `feat/shell-nav-switch` (holds shell PR1 and S2.1). **Orchestrator:** Claude Code. **Worker:** Codex (manual relay).

## Task
Create: `shell/scope/MemberBanners.tsx` (+ test), `shell/nav/ImportProvider.tsx` (+ test), `shell/nav/importDoneTarget.ts` (+ test), and replace `shell/routes/import.route.tsx` (flip to `status: "live"`, `page: () => import("../wrappers/ImportWrapper")`, with `ImportWrapper.tsx` under `shell/wrappers/`; the import route keeps `layout: "focus"`). Nothing is mounted yet (T4 mounts `ScopeProvider` and `ImportProvider` inside `ShellRoot`); do not edit `ShellRoot.tsx`, `App.tsx` or `main.tsx`.
Port, do not rewrite, from `frontend/src/features/dashboard/MainDashboardFlow.tsx` (read-only; re-read it, plan line numbers drift): the PAN conflict banner, profile nudge or "Edit profile" button and the Complete profile dialog (JSX and handlers moved as is, including `onSaved` -> `invalidateApiCache()` then `refreshMembers()`, `onMerged(targetId)` -> invalidate, refresh, select the merged member via `useScope().setMember`, close); the add-data header behaviour (`isAddingData`, `targetAddMemberId`, `addDataAllowsMemberChoice` rules and the member select vs "Importing for <name>" chip); the way `ImportFlow` is rendered (keyed by member) and `clearCasResumeStep2(memberId)` on leaving. Banners show for a single selected member (member mode) on `scope: "family-or-member"` routes except Profile; nothing in aggregate mode, on Profile or on `scope: "none"` routes (read the matched route through the registry and `resolveRoute`).
`ImportProvider`: provides the existing `ImportContext`; `openImport(memberId?)` navigates to `/import?member=<id>` (use `paths.import`) with the origin pathname in router state (`{ origin }`; `FocusLayout` already reads `state.origin`); with no argument from aggregate mode, the import header lets the user choose a member. `onDone(notice)` of `ImportFlow` calls `importDoneTarget(origin)` and navigates with `replace` to it, passing `{ importNotice: notice }` in router state.
**Plan conflict, decision already taken (do not re-ask):** the T2 Step 1 line in the plan says `importDoneTarget` always returns `/portfolio/mutual-funds`. That is superseded by Locked decision 5 (owner, v1.3): `importDoneTarget(origin)` returns `/portfolio` ONLY when the stored origin is `/portfolio`; every other origin, or none, returns `/portfolio/mutual-funds`. Test both. Back link before completion returns to the origin, default `/portfolio/mutual-funds`.
Use `useScope()` from PR1/S2.1 for members, mode and `refreshMembers`; use `useAuth()` for `me`.

## Tests first
Step 1 list in plan T2, with fakes for the API client (`vi.mock`), `MemoryRouter`, and `TestScopeProvider` from `shell/testing.tsx`. Add: `importDoneTarget("/portfolio")` -> `/portfolio`; `importDoneTarget("/home")`, `undefined`, `/portfolio/mutual-funds/analytics` -> `/portfolio/mutual-funds`.

## Constraints
Only new files under `frontend/src/shell/` (plus tests) and the replaced `routes/import.route.tsx`; `shell/index.ts` may export. Not touched: `MainDashboardFlow.tsx`, `App.tsx`, `main.tsx`, any existing screen or dialog, `features/**`, `mobile/**`, `tokens.css`, `package.json`, lockfile, `Docs/`, backend. The registry contract test must still pass (the import route's id, path, layout stay). Do not change which other routes are live. No new dependency, no `npm install`. No raw hex. Git read-only. LF, UTF-8. Run only: `npx vitest run src/shell`, `npx tsc -b`, `npx oxlint src/shell`.

## Review Focus
Behaviour parity with `MainDashboardFlow` for banners, dialog save/merge and the import header; `clearCasResumeStep2` called on leaving; the notice reaches the destination via router state; refresh/deep link on `/import?member=<id>` works; no `window.history` use; the `/portfolio` origin rule.

## Report
CODEX REPORT block, run label S2.2 (template in `ui-redesign-HB1-compute-holdings-handoff.md`), one fenced block at the end.

## Orchestrator record
(pending)
