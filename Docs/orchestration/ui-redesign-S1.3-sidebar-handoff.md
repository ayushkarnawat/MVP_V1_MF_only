# Handoff: ui-redesign S1.3 (shell PR 1: shell tokens and Sidebar)
**Status:** OPEN (ready to dispatch). No Opus review (not a +O run); Codex review is batched into S1.4's review.
**Parent plan:** `Docs/superpowers/plans/2026-10-23-shell-pr1-router-registry-sidebar.md` Task **T4** (run R3), plus "Locked decisions" 2 to 5, 8 and 11 and the Global Constraints there. Contract: `Docs/orchestration/2026-10-22-nav-shell-contract-v1.md` v1.6. Visual reference: `Docs/orchestration/2026-10-24-desktop-preview-all-pages.html` (sidebar and active underline).
**Branch:** `feat/shell-nav` (holds S1.1 and S1.2). **Orchestrator:** Claude Code. **Worker:** Codex (manual relay).

## Task
Implement T4: `shell/theme/shell-tokens.css` (the exact `--shell-*` values, light, `prefers-color-scheme` dark guarded by `:root:not([data-theme="light"])`, and `[data-theme="dark"]`), imported from `shell/index.ts`; `shell/layout/Sidebar.tsx`, `SidebarItem.tsx`, `SidebarGroup.tsx` and `Sidebar.test.tsx`. Tests first, using the Step 1 list in the plan. The Sidebar gets everything from the registry (`buildRegistry`) and the pathname; use `AppLink`, `modeOf`, `activeRowId`, `paths`, `modeMemory` (Back) from `shell/nav`. Active row: dark icon, semi-bold label, 2 px `--shell-accent` underline along the bottom edge of the row, no fill (NOT a left bar). Equity group: a `button` with `aria-expanded`, toggles without changing the URL, Enter and Space work, state in `sessionStorage["unifolio.shell.equityOpen"]`, forced open (stored choice not overwritten) while a child is active, quiet "contains active" state. Placeholder rows: greyed, `aria-disabled="true"`, no href, focusable, "Coming soon" tooltip on hover and focus (`@radix-ui/react-tooltip`, already installed; verify with `ls node_modules/@radix-ui`, do not install).
Carry-over from the S1.2 reviews, in scope here because the Sidebar depends on it: `AppLink` and `useAppNavigate` must follow `redirectTo` (a link whose route redirects to a placeholder, e.g. `/portfolio/equity`, must render disabled; navigation to it must be blocked). Add a small exported helper in `shell/nav/resolve.ts` (e.g. `finalRoute(route, routes)`, cycle-safe, stops at a non-redirect) with tests, and use it in both. No other change to `nav/`.

## Constraints
Only files under `frontend/src/shell/theme/`, `shell/layout/` (the three new components, the test), `shell/index.ts`, and the `nav/` change above. Not touched: registry, route files, existing screens, `App.tsx`, `main.tsx`, `features/**`, `mobile/**`, `tokens.css`, `package.json`, lockfile, `Docs/`, backend. No raw hex in components (only in `shell-tokens.css`). No new dependency, no `npm install`. Fonts DM Sans / Manrope via existing classes. Git read-only. LF, UTF-8. Run only: `npx vitest run src/shell`, `npx tsc -b`, `npx oxlint src/shell`.

## Review Focus
One active row only; Investments active only on `/portfolio`; the Mutual Fund row is active on every `/portfolio/mutual-funds/...` path; toggling Equity never navigates; keyboard operation; a route flipped to `live` becomes a link with no sidebar edit (fixture registry test); landmark label; the dark and light token sets are both present.

## Report
CODEX REPORT block, run label S1.3 (template in `ui-redesign-HB1-compute-holdings-handoff.md`), one fenced block at the end.

## Orchestrator record
(pending)
