# Handoff: ui-redesign S1.4 (shell PR 1: scope contract, top bar, Mira dialog, layouts, ShellRoot)
**Status:** DONE (028342a, fix 0a7db46). Not a +O run. After this run: ONE Codex review prompt covering S1.3 and S1.4.
**Parent plan:** `Docs/superpowers/plans/2026-10-23-shell-pr1-router-registry-sidebar.md` Tasks **T5 and T6** (run R4; the plan lists files, behaviour and the Step 1 tests), plus Locked decisions 1, 9, 10, 11 and the Global Constraints. Contract: `Docs/orchestration/2026-10-22-nav-shell-contract-v1.md` v1.6 (section on `useScope`/`useImport`).
**Branch:** `feat/shell-nav` (holds S1.1 to S1.3). **Orchestrator:** Claude Code. **Worker:** Codex (manual relay).

## Task
Do T5 then T6, tests first each time.
T5: `scope/scopeTypes.ts`, `scope/ScopeContext.tsx` (context, `useScope` throwing a clear error outside a provider, `ImportContext`/`useImport`), `layout/FamilySelector.tsx`, `layout/TopBar.tsx`, `mira/MiraComingSoonDialog.tsx`, each with its test. Reuse the existing UI parts: look in `frontend/src/components/ui` (and wherever `ThemeToggle` and `UnifolioLogo` live; `grep` for them) and import them as they are; if one of `Select`, `ThemeToggle`, `Button`, `Modal` does not exist or its props do not fit, build the smallest local equivalent inside `shell/` and say so under Deviations; do not edit existing files.
T6: `layout/AppLayout.tsx`, `FocusLayout.tsx`, `PageLayout.tsx`, `PageState.tsx`, replace the stub `layout/PlaceholderPage.tsx` and `NotFoundPage.tsx` (keep their exports so route files keep working), `ShellRoot.tsx` (exports `ShellRoutes`, which takes no router, and `ShellRoot`, which wraps it in `BrowserRouter`), `testing.tsx` (`renderInShell(ui?, { path, scope, routes })`, `TestScopeProvider`), tests `AppLayout.test.tsx`, `PlaceholderPage.test.tsx`, `ShellRoot.test.tsx`. Export the public surface from `shell/index.ts`.
Points to follow: `AppLayout` page area has `Suspense` (loading `PageState`), an error boundary with a retry button, `document.title = "<route title> · Unifolio"`, scroll-to-top on pathname change; `FocusLayout` has no sidebar and reproduces today's Add Data header (look at the existing import screen's header for what it shows, read-only); the FamilySelector hides on `scope: "none"` routes and shows no Family Combined option for a one-member household; the top bar has no avatar and the search box and Ask Mira open the dialog; `ShellRoutes` uses `React.lazy(route.page)` plus `Navigate replace` for redirect routes, with `*` showing `NotFoundPage` inside `AppLayout`. Keyboard: dialog closes on Escape; everything operable by keyboard. Colours only through `var(--shell-*)`.
Important: the shell is NOT mounted anywhere in PR 1; do not touch `App.tsx` or `main.tsx`.

## Constraints
Only files under `frontend/src/shell/` (and tests). Not touched: existing screens, `App.tsx`, `main.tsx`, `features/**`, `components/**`, `mobile/**`, `tokens.css`, `package.json`, lockfile, `Docs/`, backend. No raw hex in components. No new dependency, no `npm install`. Git read-only. LF, UTF-8. Run only: `npx vitest run src/shell`, `npx tsc -b`, `npx oxlint src/shell`.

## Review Focus
`/` ends at `/home`; `/planning` goes to `/planning/scenarios`'s target as the registry says (follow the registry, not the plan text, if they differ, and report it); `/portfolio/equity` ends on Mutual Funds; `/nope` renders not-found with the sidebar; `/import` has no sidebar; a page that throws leaves sidebar and top bar standing; `useScope` outside a provider throws a readable error; selector rules; dialog focus and Escape.

## Report
CODEX REPORT block, run label S1.4 (template in `ui-redesign-HB1-compute-holdings-handoff.md`), one fenced block at the end.

## Orchestrator record
Codex report DONE (213 tests). Orchestrator re-ran: green, tsc and oxlint clean, only frontend/src/shell changed, shell not mounted. Codex review (S1.3+S1.4) FAIL: Back memory never recorded (Medium, AppLayout now calls rememberBack on pathname change); trailing-slash URL lost the active marker (Low). Both fixed with a new test; 214 pass. Deviation accepted: shell-local dialog because the existing Modal has no focus trap.
