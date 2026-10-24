# Navigation Shell PR 1 (router, registry, sidebar, layouts) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans, applied through the Claude–Codex method in "Execution method" below. Steps use
> checkbox (`- [ ]`) syntax. **Planning only until the user says "go".** (`superpowers:writing-plans` is not installed in
> this environment; this plan follows the layout of `2026-10-19-analytics-ux-fixes-plan.md`.)

**Goal:** Build the first of two shell pull requests: the router dependency, the route registry with one route file per page, the left sidebar (main mode and Portfolio mode with the Equity group), the top bar frame, the layouts and states, and the tests. **Not switched on:** nothing in `App.tsx` changes, so the app behaves exactly as today until PR 2.

**Architecture:** One new module `frontend/src/shell/`. Pure functions (route resolution, active row, mode, Back rule, scope-reset rule) are separate from React so they are unit-tested without a router. `ShellRoot` builds `<Routes>` from the registry and is exported but not mounted.

**Tech Stack:** React 19, Vite 8.2.0, Tailwind 3.4, `lucide-react` 0.475.0, Vitest 4.1.10 + Testing Library 16 (jsdom), **new:** `react-router ^7.18.4` (declarative mode: `BrowserRouter`, `MemoryRouter`, `Routes`, `Route`, `Outlet`, `NavLink`, `useNavigate`, `useLocation`, `matchPath`).

**Spec (all in `Docs/orchestration/`, committed with this plan):** `2026-10-22-nav-shell-contract-v1.md` (v1.2, the URL map and route fields), `2026-10-23-shell-functionality-backend-spec.md`, `-shell-layout.md`, `-shell-design-system.md`, `-shell-reuse-vs-new.md`, `-shell-tdd.md`, `-shell-flows.md`, `-shell-prd.md`, and the artifact "Shell Design Workbook" (https://claude.ai/artifact/PEfZsLkuKVr1dMpbeDXqnP; private, so this plan carries every decision verbatim below). Palette: `Docs/Unifolio Colour Palette.pdf`.

**Visual parity and chrome (added 24 Oct, owner-approved).** The finished page must look like its signed-off mockup(s) named in this plan, in light and dark. (1) The mockups' own sidebar, top bar, avatar and page-state buttons are not built: the shell draws the sidebar and top bar (contract v1.6). (2) **Parity step:** in the last run of this page the orchestrator runs it locally on the synthetic household and compares it with the mockup in the browser, light and dark, at 1280 and 1024 px, and lists every difference (layout, colours, type, spacing, states, copy, hover and click behaviour); differences are fixed before the run is DONE, or logged for a QA run with the owner's agreement. (3) Wherever this page lists a fund, the fund name opens the individual fund page through `paths` (the route is enabled by the Individual Fund runs). (4) Each page keeps the surface style of its own mockup (owner, 24 Oct).

## Phases

| Phase | Covers | Ships |
|---|---|---|
| T1 | dependency, skeleton, lazy-route spike | compiles, no behaviour change |
| T2 | registry, types, about 30 route files, contract test | tested data layer |
| T3 | pure navigation functions, `paths`, `AppLink`, Back memory | tested logic |
| T4 | shell tokens, Sidebar | tested sidebar |
| T5 | scope contract types, family selector, top bar, Mira dialog | tested frame parts |
| T6 | layouts, states, `ShellRoot`, test helper | tested shell, unmounted |
| T7 | CODEOWNERS, "how to add a page" note | docs |

Order is strict: T1 → T2 → T3 → T4 → T5 → T6 → T7 (each task imports the previous).

## Global Constraints

- **Test-driven, always** (`AGENTS.md`): failing test first, then minimal code.
- **Existing screens are not changed.** `App.tsx`, `main.tsx`, `MainDashboardFlow`, `NavigationShell`, `DashboardPlaceholder`, `mobile/**`, `tokens.css` and every file under `features/` are untouched in PR 1. The only existing files edited are `frontend/package.json` and its lockfile.
- **Mobile untouched. Backend untouched.** No new endpoint, table or migration.
- **Run only the affected tests:** `cd frontend && npx vitest run <files> 2>&1 | tail -20`; type check `cd frontend && npx tsc -b 2>&1 | tail -8`; lint `cd frontend && npx oxlint <paths>`. No full suites except the gate named below. No live network.
- **One dependency only:** `react-router@^7.18.4`. Install nothing else. (v8.5 needs Node 22.22; CI and `deploy/leapswitch/scripts/deploy.sh` use Node 20.)
- **Colours:** only `--shell-*` tokens defined in `shell/theme/shell-tokens.css`, never raw hex in components, and `tokens.css` is not edited. Fonts DM Sans (headings), Manrope (body).
- **Never push. Never commit unrelated changes:** stage explicit paths only (the tree holds other sessions' files).
- **Route files are the only per-page files.** A route file imports only from `../registry/types`, `lucide-react` and its own page.

## Locked decisions (frozen)

1. Router `react-router ^7.18.4`, real paths, declarative mode. Route-level `lazy` is **not** used: each route file's `page` is `() => import(...)`, wrapped by `React.lazy` + `Suspense` in `ShellRoot`.
2. Main sidebar: Home `/home`, Portfolio `/portfolio`, Liabilities `/liabilities`, Planning `/planning`; footer Profile `/profile`, Help & Support `/help`. Portfolio mode (any path under `/portfolio`): Back, Investments (`/portfolio`), Equity (group), Debt `/portfolio/debt`, Gold `/portfolio/gold`, Real Estate `/portfolio/real-estate`, Others `/portfolio/others`, then the same footer.
3. Equity is a group (`kind: "group"`): it only expands; label or arrow toggles; children Direct Stocks `/portfolio/equity/direct-stocks`, Mutual Fund `/portfolio/mutual-funds`, US Stock `/portfolio/equity/us-stocks`, FDs & bonds `/portfolio/equity/fds-bonds`, with icons `ChartCandlestick`, `ChartPie`, `Globe`, `PiggyBank`. A typed `/portfolio/equity` redirects to `/portfolio/mutual-funds`. Equity opens when a child is active, otherwise keeps the user's last choice in `sessionStorage`.
4. One active row at a time. A route's row is its nearest ancestor-or-self (through `parentId`) that has a sidebar row. Investments is active only on `/portfolio`. On any `/portfolio/mutual-funds/...` path the Mutual Fund row is active and Equity is open with a quiet "contains active" state.
5. Rows for `status: "placeholder"` routes are greyed, not links, `aria-disabled`, with a "Coming soon" tooltip; they turn on when the route flips to `live`.
6. Back: stores the last route outside `/portfolio` that has `layout: "app"` and `status: "live"` (`sessionStorage` key `unifolio.shell.back`); never `/import` or a placeholder; fallback `/home`.
7. Scope rule (used in PR 2, defined and tested here as a pure function): on a path change, reset to Family Combined only if the previous and next routes have different sidebar rows and the next route's scope is `family-or-member`. A one-member household never resets.
8. Look: about 224 px, always visible, no collapse. Active row: dark icon and label, semi-bold, 2 px green underline along the bottom edge of the row (the palette's "underline", as drawn in `Docs/orchestration/2026-10-24-desktop-preview-all-pages.html`), no fill. Surface `--shell-card` with a `--shell-divider` right border. Greyed rows use `--shell-text-disabled`. Labels Manrope Medium 14 px. Focus ring 2 px `--shell-accent`.
9. Top bar frame: search box (placeholder input that opens the Mira popup; no search behaviour, decision L46), temporary "+ Add data" button, Ask Mira, family selector (one dropdown: Family Combined first, then members; hidden on routes whose `scope` is `none`), theme toggle (existing `ThemeToggle`). No avatar.
10. Placeholder page: one shared Coming soon page with the page name and a link to Investments. Not-found page inside the layout. Landing `/` redirects to `/home` (placeholder until Home goes live).
11. Basic semantics only: `nav` landmark with a label, `aria-current="page"` on the active row, the Equity row is a `button` with `aria-expanded`.

## Review Focus (inputs no single task would otherwise test)

- The registry works under Vitest (`import.meta.glob` eager) and under `vite build`; route count equals the URL-map count.
- A route flipped from `placeholder` to `live` becomes a link everywhere with no other edit.
- No file outside `frontend/src/shell/`, `frontend/package.json`, the lockfile and `.github/CODEOWNERS` changes.
- The sidebar never navigates when Equity is toggled; keyboard toggles it.
- `rowOf` handles tab routes, the fund page (`/funds/:schemeId`) and redirect routes.

## Execution method (the Claude–Codex method, `model-orchestration` skill)

**Roles.** Claude is the orchestrator: writes handoff docs, verifies, runs the review gate, performs all git staging and commits. Codex is the default implementer (`codex:codex-rescue`, `run_in_background: true`), self-tests where it can, and never touches git (the sandbox cannot write `.git`). Sonnet subagents are the fallback implementer/reviewer; Opus only where marked, with approval.

**Runs are the dispatch unit** (tasks sharing files are batched, per the token-budget rule):

| Run | Tasks | Model notes |
|---|---|---|
| R1 | T1, T2 (dependency, spike, registry, 30 route files, contract test) | route files are mechanical; Codex |
| R2 | T3 (pure navigation functions, paths, AppLink, Back memory) | Codex; **Opus review** (the reset and active-row logic is shared with PR 2) |
| R3 | T4 (tokens, Sidebar) | Codex |
| R4 | T5, T6 (frame parts, layouts, `ShellRoot`, helper) | Codex |
| R5 | T7 (CODEOWNERS, how-to note) | Claude |
| R6 | Final: whole-branch review and manual check | **Opus review, with approval** |

**Per-run procedure** (no exceptions): (1) Claude pre-flight: read the run's files, confirm paths, write `Docs/orchestration/shell-pr1-r<N>-<slug>-handoff.md` from the handoff template (Status OPEN), append one line to `Docs/orchestration/delegation-log.md`. (2) First dispatch of the session: the three-step probe from `delegation-rules.md` (write, `git add`, `git commit`); expect git to fail in the sandbox. (3) Dispatch Codex; wait for the notification, never poll. (4) Claude verifies independently: `git status`, `git diff --stat`, then the run's affected tests. (5) Mandatory review gate: `/codex:adversarial-review` via `codex:codex-rescue` (never with `isolation: worktree`); **tell the user up front the result needs a manual relay** (`/codex:status <id>`, `/codex:result <id>`). Fix findings per "Review-loop fix authorship". (6) Commit (orchestrator, explicit paths), set the handoff to DONE, update the delegation log. Never push. If Codex quota is exhausted, Claude builds the run directly and a Sonnet subagent reviews.

## P0: Pre-flight (Claude, after "go")

- [ ] Create branch `feat/shell-nav` from `leapswitch-redesign` (PR targets `leapswitch-redesign`). Confirm `git status` shows no unrelated staged files.
- [ ] Confirm `cd frontend && npx tsc -b` and `npx vitest run src/features/dashboard/NavigationShell.test.tsx` pass before any change (baseline).
- [ ] Re-read the contract section 4 URL map; the route list below must still match it.

## T1: Dependency, skeleton and lazy-route spike (run R1)

**Files:** modify `frontend/package.json` and `frontend/package-lock.json`; create `frontend/src/shell/index.ts` (empty export), `frontend/src/shell/spike.test.tsx` (kept as a permanent regression test).

- [ ] **Step 1: Failing test** `shell/spike.test.tsx`: render a `MemoryRouter initialEntries={["/a"]}` containing a `Routes` with `/a` rendering a `React.lazy(() => import("./spikeFixture"))` page inside `Suspense`; `await screen.findByText("lazy ok")`. Create `shell/spikeFixture.tsx` exporting default `() => <p>lazy ok</p>`. Run: fails (module `react-router` not found).
- [ ] **Step 2:** `cd frontend && npm install react-router@^7.18.4`. Confirm `package.json` gains exactly one dependency line.
- [ ] **Step 3:** run the spike test; expected PASS. Run `npx tsc -b` and `npx vitest run src/features/dashboard/NavigationShell.test.tsx` (still passes).
- [ ] **Step 4 (check):** `import.meta.glob` under Vitest: add to the spike test a second case using `import.meta.glob("./spikeFixture.tsx", { eager: true })` and assert one key. If it fails, stop and report (Review Focus item 1 depends on it).

## T2: Registry, route files and contract test (run R1)

**Files:** create `shell/registry/types.ts`, `buildRegistry.ts`, `registry.test.ts`, and `shell/routes/<id>.route.tsx` for every row below.

`types.ts`:

```ts
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

export interface ShellRoute {
  id: string;                      // equals the file name stem
  path?: string;                   // a group node has one only to redirect a typed URL
  kind?: "page" | "group";         // default "page"
  label: string;
  modeLabel?: string;              // label in Portfolio mode
  modeIcon?: LucideIcon;           // additive field: icon in Portfolio mode
  icon: LucideIcon;
  section: "main" | "portfolio" | "footer" | null;
  order: number;
  parentId?: string;
  layout: "app" | "focus";
  scope: "family-or-member" | "none";
  status: "live" | "placeholder";
  title: string;
  page?: () => Promise<{ default: ComponentType }>;
  redirectTo?: string;
}
```

`buildRegistry.ts` exports `buildRegistry(modules?)` (defaults to `import.meta.glob("../routes/*.route.tsx", { eager: true })`, each module's `default`), returning routes sorted by `section` (main, portfolio, footer, null) then `order`; and `validateRegistry(routes): string[]` returning error strings (empty when valid): duplicate id; duplicate path; id not equal to the file stem; missing `parentId` target; a `group` without children, with a `page`, without `redirectTo`, or whose `redirectTo` target is missing or not `live`; a redirect cycle; a `live` route with neither `page` nor `redirectTo`; a menu route (section not null) without label or icon; a non-group route without `page` and without `redirectTo`.

**Route table** (id | path | label | section/order | parent | layout | scope | status | page or redirect). All `title` = label; icons from the contract table.

| id | path | section/order | parent | scope | status | page / redirect |
|---|---|---|---|---|---|---|
| `home` | `/home` | main 1 | none | family-or-member | placeholder | PlaceholderPage |
| `portfolio` | `/portfolio` | main 2 (`modeLabel` Investments, `modeIcon` LayoutGrid) | none | family-or-member | placeholder | PlaceholderPage |
| `liabilities` | `/liabilities` | main 3 | none | none | placeholder | PlaceholderPage |
| `planning` | `/planning` | main 4 | none | none | live | redirect `/planning/scenarios` |
| `planning-scenarios` | `/planning/scenarios` | null | `planning` | none | placeholder in PR 1 (PR 2 flips to live) | PlaceholderPage |
| `profile` | `/profile` | footer 1 | none | none | placeholder in PR 1 | PlaceholderPage |
| `profile-import-health` | `/profile/import-health` | null | `profile` | family-or-member | placeholder in PR 1 | PlaceholderPage |
| `help` | `/help` | footer 2 | none | none | placeholder | PlaceholderPage |
| `portfolio-equity` | `/portfolio/equity` | portfolio 2, `kind: "group"` | none | none | live | redirect `/portfolio/mutual-funds` |
| `portfolio-equity-direct-stocks` | `/portfolio/equity/direct-stocks` | portfolio 1 | `portfolio-equity` | family-or-member | placeholder | PlaceholderPage |
| `portfolio-mutual-funds` | `/portfolio/mutual-funds` | portfolio 2 | `portfolio-equity` | family-or-member | placeholder in PR 1 (PR 2 flips to live) | PlaceholderPage |
| `portfolio-equity-us-stocks` | `/portfolio/equity/us-stocks` | portfolio 3 | `portfolio-equity` | family-or-member | placeholder | PlaceholderPage |
| `portfolio-equity-fds-bonds` | `/portfolio/equity/fds-bonds` | portfolio 4 | `portfolio-equity` | family-or-member | placeholder | PlaceholderPage |
| `portfolio-debt`, `portfolio-gold`, `portfolio-real-estate`, `portfolio-others` | `/portfolio/<debt\|gold\|real-estate\|others>` | portfolio 3, 4, 5, 6 | none | family-or-member | placeholder | PlaceholderPage |
| `portfolio-mutual-funds-performance`, `-allocation`, `-holdings`, `-transactions`, `-overlap` | `/portfolio/mutual-funds/<name>` | null | `portfolio-mutual-funds` | family-or-member | placeholder | PlaceholderPage |
| `portfolio-mutual-funds-analytics`, `-history` | `/portfolio/mutual-funds/analytics`, `/history` | null | `portfolio-mutual-funds` | family-or-member | placeholder in PR 1 (PR 2 flips to live) | PlaceholderPage |
| `portfolio-mutual-funds-fund`, `-fund-overlap`, `-fund-insights` | `/portfolio/mutual-funds/funds/:schemeId` (+ `/overlap`, `/insights`) | null | `portfolio-mutual-funds` | family-or-member | placeholder | PlaceholderPage |
| `import` | `/import` | null | none | none | placeholder in PR 1 (PR 2 flips to live) | PlaceholderPage; `layout: "focus"` |
| `root` | `/` | null | none | none | live | redirect `/home` |
| `not-found` | `*` | null | none | none | live | NotFoundPage |

(about 30 route files; the exact count is whatever the table produces, asserted by the test below.)

Each route file is the same shape, for example `portfolio-mutual-funds.route.tsx`:

```tsx
import { ChartPie } from "lucide-react";
import type { ShellRoute } from "../registry/types";

const route: ShellRoute = {
  id: "portfolio-mutual-funds", path: "/portfolio/mutual-funds",
  label: "Mutual Fund", icon: ChartPie, section: "portfolio", order: 2,
  parentId: "portfolio-equity", layout: "app", scope: "family-or-member",
  status: "placeholder", title: "Mutual Funds",
  page: () => import("../layout/PlaceholderPage"),
};
export default route;
```

- [ ] **Step 1: Failing tests** `registry.test.ts`: (a) `buildRegistry()` returns exactly the ids in the table (assert the id list, which also pins the count); (b) `validateRegistry` returns `[]` for the real registry; (c) one synthetic bad registry per rule above, each asserting its error string; (d) `portfolio-equity` redirects to `/portfolio/mutual-funds`; (e) Mutual Fund's `parentId` is `portfolio-equity`; (f) every `section !== null` route has a label and icon; (g) a route file whose `id` differs from its file stem fails. Run: fail.
- [ ] **Step 2:** write `types.ts`, `buildRegistry.ts`, the route files and a stub `layout/PlaceholderPage.tsx` / `NotFoundPage.tsx` (default exports rendering the route title) so the dynamic imports resolve.
- [ ] **Step 3:** run `npx vitest run src/shell/registry/registry.test.ts src/shell/spike.test.tsx`; PASS. `npx tsc -b`; `npx oxlint src/shell`.

## T3: Navigation functions, paths, AppLink, Back memory (run R2)

**Files:** create `shell/nav/resolve.ts`, `resolve.test.ts`, `paths.ts`, `paths.test.ts`, `modeMemory.ts`, `modeMemory.test.ts`, `AppLink.tsx`, `AppLink.test.tsx`, `useAppNavigate.ts`, `scope/resetRule.ts`, `scope/resetRule.test.ts`.

`resolve.ts` (pure, no React):

```ts
import { matchPath } from "react-router";
import type { ShellRoute } from "../registry/types";

export function resolveRoute(pathname: string, routes: ShellRoute[]): ShellRoute | undefined {
  const hits = routes.filter(r => r.path && r.path !== "*" && matchPath({ path: r.path, end: true }, pathname));
  // most specific wins: fewest params, then longest path
  return hits.sort((a, b) => (b.path!.length - a.path!.length))[0];
}
export function modeOf(pathname: string): "main" | "portfolio" {
  return pathname === "/portfolio" || pathname.startsWith("/portfolio/") ? "portfolio" : "main";
}
export function rowOf(route: ShellRoute | undefined, byId: Map<string, ShellRoute>): ShellRoute | undefined {
  let r = route; // nearest ancestor-or-self that has a sidebar row (section !== null)
  while (r) { if (r.section !== null) return r; r = r.parentId ? byId.get(r.parentId) : undefined; }
  return undefined;
}
export function activeRowId(pathname: string, routes: ShellRoute[]): string | undefined { /* resolveRoute then rowOf */ }
```

`resetRule.ts`:

```ts
export function shouldResetScope(prevPath: string, nextPath: string, routes: ShellRoute[], memberCount: number): boolean {
  if (memberCount <= 1 || prevPath === nextPath) return false;
  const byId = new Map(routes.map(r => [r.id, r]));
  const next = resolveRoute(nextPath, routes);
  if (!next || next.scope !== "family-or-member") return false;
  const prevRow = rowOf(resolveRoute(prevPath, routes), byId);
  const nextRow = rowOf(next, byId);
  return prevRow?.id !== nextRow?.id;
}
```

`modeMemory.ts`: `shouldRemember(route): boolean` (`section`-agnostic: `modeOf(path)==="main"`, `layout==="app"`, `status==="live"`, kind not group); `rememberBack(pathname, routes, storage = sessionStorage)`; `readBack(routes, storage)` returns the stored path only if it still resolves to a live app-layout non-Portfolio route, else `"/home"`. All storage access wrapped in try/catch.

`paths.ts`: typed builders mirroring the table (`paths.home()`, `paths.portfolio()`, `paths.equity.directStocks()`, `paths.mutualFunds.root()`, `.performance()`, `.allocation()`, `.holdings()`, `.transactions()`, `.overlap()`, `.overlapCompare()`, `.analytics()`, `.history()`, `.fund(schemeId)`, `.fundOverlap(schemeId)`, `.fundInsights(schemeId)`, `paths.debt()`, `.gold()`, `.realEstate()`, `.others()`, `.liabilities()`, `.planning()`, `.scenarios()`, `.profile()`, `.importHealth()`, `.help()`, `paths.import(memberId?)`). A test asserts every builder's output resolves to a route in the real registry.

`AppLink.tsx`: looks up the route for `to`; if its `status` is `placeholder` renders a `<span aria-disabled="true">` (same children, class `shell-link-disabled`, `title="Coming soon"`), else a router `<Link>` / `NavLink`. Props: `to`, `children`, `className`, `activeClassName?`.

- [ ] **Step 1: Failing tests.**
  - `resolve.test.ts`: `/portfolio` → `portfolio`; `/portfolio/mutual-funds/holdings` → its own route, and its `rowOf` is `portfolio-mutual-funds`; `/portfolio/mutual-funds/funds/INF123` → the fund route with row `portfolio-mutual-funds`; `/portfolio/equity` → the group; unknown path → undefined; `modeOf("/portfolio/equity/us-stocks")` is `portfolio`, `modeOf("/profile")` is `main`.
  - `resetRule.test.ts` (the table the user confirmed): Home → `/portfolio/mutual-funds` true; `/portfolio/mutual-funds` → `/portfolio/mutual-funds/holdings` false; → the fund page false; `/portfolio/mutual-funds` → `/portfolio/debt` true; any → `/profile` false (scope none); `/profile` → `/portfolio/mutual-funds` true; same path false; one member always false.
  - `modeMemory.test.ts`: remembers `/planning/scenarios`; never `/import`, never a `/portfolio/...` path, never a placeholder; `readBack` falls back to `/home` when nothing stored, when storage throws, and when the stored path became a placeholder.
  - `paths.test.ts`, `AppLink.test.tsx` (live target renders `<a href>`, placeholder renders `aria-disabled` with no `href`; flipping a fixture route's status flips the element without any other change).
- [ ] **Step 2:** implement. **Step 3:** run `npx vitest run src/shell/nav src/shell/scope/resetRule.test.ts`; PASS; `npx tsc -b`.

## T4: Shell tokens and Sidebar (run R3)

**Files:** create `shell/theme/shell-tokens.css`, `layout/Sidebar.tsx`, `SidebarItem.tsx`, `SidebarGroup.tsx`, `Sidebar.test.tsx`.

`shell-tokens.css` defines, on `:root` (light) and under both dark mechanisms the app uses (`@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and `[data-theme="dark"]`): `--shell-page #FCFCFC / #111111`, `--shell-card #F5F5F5 / #1A1A1A`, `--shell-divider #ECECEC / #2E2E2E`, `--shell-border-input #DFDFDF / #2E2E2E`, `--shell-text #111111 / #FCFCFC`, `--shell-text-body #4B4B4B / #A3A3A3`, `--shell-text-secondary #717171 / #A3A3A3`, `--shell-icon-muted #9B9B9B / #737373`, `--shell-text-disabled #C4C4C4 / #5A5A5A`, `--shell-accent #22C55E` (both), `--shell-tooltip-bg #2A2A2A / #212121`, `--shell-tooltip-text #FFFFFF / #FCFCFC`. Import it from `shell/index.ts`.

Sidebar behaviour (all from the registry and the current `pathname` via props, so tests need no router for logic): mode by `modeOf`; main mode lists `section: "main"` by order then the footer; Portfolio mode lists a Back row, the `portfolio` route as Investments (using `modeLabel`/`modeIcon`), then `section: "portfolio"` roots, children of a group indented, then the footer. Wordmark is the existing `UnifolioLogo` linking to `/home`. Active row from `activeRowId`; the group shows "contains active". Equity open state: `useState` initialised from `sessionStorage["unifolio.shell.equityOpen"]`, forced open (without overwriting the stored choice) when a child is active.

- [ ] **Step 1: Failing tests** `Sidebar.test.tsx` (with `MemoryRouter` and the real registry): main mode lists Home, Portfolio, Liabilities, Planning, Profile, Help & Support; Portfolio mode lists Back, Investments, Equity, its four children, Debt, Gold, Real Estate, Others; Investments active only on `/portfolio`; on `/portfolio/mutual-funds/holdings` the Mutual Fund row has `aria-current="page"` and Equity has `aria-expanded="true"`; clicking Equity toggles `aria-expanded` and the URL does not change; Enter and Space on the focused Equity button toggle it; the closed state persists across a re-render via `sessionStorage`; placeholder rows have `aria-disabled="true"` and no `href`, and show "Coming soon" on hover and focus; a `live` fixture row is a link; Back navigates to the remembered path and to `/home` when none; the logo links to `/home`; the `nav` landmark has a label.
- [ ] **Step 2:** implement with Tailwind classes that use `var(--shell-*)` only; tooltip with the installed `@radix-ui/react-tooltip`. **Step 3:** run `npx vitest run src/shell/layout/Sidebar.test.tsx`; PASS; `tsc`; `oxlint`.

## T5: Scope contract types, family selector, top bar, Mira dialog (run R4)

**Files:** create `scope/scopeTypes.ts`, `scope/ScopeContext.tsx`, `layout/FamilySelector.tsx`, `FamilySelector.test.tsx`, `layout/TopBar.tsx`, `TopBar.test.tsx`, `mira/MiraComingSoonDialog.tsx`, `MiraComingSoonDialog.test.tsx`.

`scopeTypes.ts` exports the `useScope()` return type from the contract (`viewMode`, `memberId`, `members`, `selectedMember?`, `scopeKey`, `setMember`, `setAggregate`, `refreshMembers`) and the `useImport` type (`openImport(memberId?)`). `ScopeContext.tsx` exports `ScopeContext`, `useScope()` (throws a clear error outside a provider) and `ImportContext`/`useImport()`. PR 1 provides only the context; the real provider arrives in PR 2. Tests use a small `TestScopeProvider` in `shell/testing.tsx`.

- [ ] **Step 1: Failing tests.** `FamilySelector`: lists "Family Combined" first and then each member; a one-member household shows just the member and no Family Combined option; choosing a member calls `setMember`, choosing Family Combined calls `setAggregate`; renders nothing when the active route's scope is `none`. `TopBar`: shows the search placeholder, "+ Add data" (calls `openImport()`), Ask Mira, the selector and the theme toggle; no avatar; clicking the search box or Ask Mira opens the dialog. `MiraComingSoonDialog`: opens, shows "coming soon" text, closes with the button and Escape.
- [ ] **Step 2:** implement using the existing `Select` (`components/ui`), `ThemeToggle`, `Button` and `Modal`. **Step 3:** run the three test files; PASS.

## T6: Layouts, states, `ShellRoot`, test helper (run R4)

**Files:** create `layout/AppLayout.tsx`, `FocusLayout.tsx`, `PageLayout.tsx`, `PageState.tsx`, replace the stub `PlaceholderPage.tsx` and `NotFoundPage.tsx`, create `ShellRoot.tsx`, `testing.tsx`, and tests `AppLayout.test.tsx`, `PlaceholderPage.test.tsx`, `ShellRoot.test.tsx`.

- `AppLayout`: `Sidebar` + `TopBar` + page area (`Outlet`) with `Suspense` fallback `PageState` loading; sets `document.title` to `<route title> · Unifolio`; scrolls the page area to the top on pathname change; an error boundary around the page area with a retry button.
- `FocusLayout`: slim header (Back link to the origin path from router state, default `/portfolio/mutual-funds`, an optional member chip slot, `ThemeToggle`), no sidebar; reproduces the header of today's Add Data screen.
- `PlaceholderPage`: reads the matched route; shows its title, "Coming soon" and a link to Investments through `AppLink` (which is itself disabled while `/portfolio` is a placeholder, so the link renders as plain text then).
- `ShellRoot`: `<BrowserRouter>` (exported `ShellRoutes` takes no router so tests can mount it in `MemoryRouter`) building `<Routes>` from the registry: redirect routes use `<Navigate replace>`; others use `React.lazy(route.page)`; routes with `layout: "focus"` nest under `FocusLayout`, the rest under `AppLayout`; `*` renders `NotFoundPage`.
- `testing.tsx`: `renderInShell(ui?, { path, scope, routes })` wrapping `MemoryRouter` + `TestScopeProvider`.

- [ ] **Step 1: Failing tests.** `ShellRoot.test.tsx`: `/` ends at `/home` showing the placeholder title; `/planning` redirects to `/planning/scenarios`; `/portfolio/equity` redirects to `/portfolio/mutual-funds`; `/nope` shows not-found inside the layout; `/import` renders without the sidebar; title per route; a thrown page shows the error state and the sidebar stays. `AppLayout.test.tsx`: sidebar, top bar and page area present; the page area scrolls to top on navigation (mock `scrollTo`). `PlaceholderPage.test.tsx`: shows the route title and "Coming soon".
- [ ] **Step 2:** implement. **Step 3:** run `npx vitest run src/shell`; PASS; `npx tsc -b`; `npx oxlint src/shell`.

## T7: CODEOWNERS and how-to note (run R5, Claude)

- [ ] Create `.github/CODEOWNERS` with `/frontend/src/shell/ @ayushkarnawat @aditi-unifolio` (note: branch protection enforcement is a repository setting outside the code).
- [ ] Create `Docs/orchestration/2026-10-23-shell-how-to-add-a-page.md` (one page: copy a route file, set `status: "live"`, replace `page`, use `paths`, test with `renderInShell`).
- [ ] Append the contract change-log line for PR 1 only if a contract field changed (the additive `modeIcon` field: add one line to the contract's change log and section 5).

## F: Final gate (run R6, Claude + Opus review with approval)

- [ ] `cd frontend && npx vitest run src/shell src/features/dashboard/NavigationShell.test.tsx src/App.test.tsx` all pass; `npx tsc -b` clean; `npm run build` succeeds (proves the glob registry bundles).
- [ ] `git diff --stat leapswitch-redesign...HEAD` shows only `frontend/src/shell/**`, `frontend/package.json`, the lockfile, `.github/CODEOWNERS` and docs. No change to `App.tsx` or `features/**`.
- [ ] No manual dev-server check in PR 1: the shell is not mounted anywhere (no preview route is added). The visual and keyboard checks run in PR 2, once the shell is switched on.
- [ ] Adversarial review of the whole branch (Opus, with approval): rules above, boundary of the diff, accessibility basics, registry validation completeness.
- [ ] Record the result in the handoff docs and the delegation log; commit by explicit paths; never push.

## Open items carried to PR 2

Import completion target (contract v1.3: returns to the origin only when it is `/portfolio`, otherwise `/portfolio/mutual-funds`, with the notice); contract v1.6 (24 Oct) removed the `overlap-compare` route, which is why the registry has no row for it; the temporary tab strip and "+ Add data" wiring; the real scope provider; wrapper files; `App.tsx` switch.
