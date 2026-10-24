# Navigation shell: functionality and backend spec (draft v1)

**Status:** draft for owner review, 2026-10-23. Planning only; nothing is built. Document 1 of the shell documents phase (companion to the Home documents). Claims are marked **verified**, **estimate** or **unverified**.
**Scope:** desktop web only. Mobile untouched. Existing screens (Dashboard, History, Analytics, Scenarios, Profile, import) unchanged and wired in by thin wrapper route files only. The search box keeps its place in the top bar; its behaviour is on hold (L46) and is not specified here.
**Inputs:** the left-panel planning decisions N1 to N13 (artifact "Left Panel Plan", `2026-10-22-left-panel-plan.html`), contract v1.2 (`2026-10-22-nav-shell-contract-v1.md`), the architecture draft, and `Docs/Web app UI mockups MFs.pdf` pp. 2-3 and 9. Where this document disagrees with an older one, the open question is listed in section 11. The owner closed on 23 Oct: FDs & bonds sits under Equity; Mutual Fund and US Stock are two items.

## 1. What the shell is

One React module, `frontend/src/shell/`, mounted only in the desktop branch of `MainApp`, after the existing gates (login, onboarding, re-consent, deletion). It owns: the router and route registry, the left sidebar (two modes), the top bar frame, the layouts (app, focus), the family-or-member scope, the Back memory, the member banners and Complete profile dialog, standard page states, and the "Mira, coming soon" popup. It owns no page content.

## 2. Route registry

One file per page: `frontend/src/shell/routes/<route-id>.route.tsx`, default-exporting a `ShellRoute` (contract section 5). The registry scans them with `import.meta.glob("./routes/*.route.tsx", { eager: true })` (Vite 8.2.0 installed; glob takes literal relative patterns, `eager: true` imports statically; **verified**). Each file's `page` is a dynamic import wrapped with `React.lazy`, so only metadata loads eagerly. Route-level `lazy` on `<Route>` is **unverified** in declarative mode and is not used.

```ts
interface ShellRoute {
  id: string;                     // equals the file name stem
  path?: string;                  // a group node has one only to redirect a typed URL
  kind?: "page" | "group";        // default "page"
  label: string; modeLabel?: string; icon: LucideIcon;
  section: "main" | "portfolio" | "footer" | null;
  order: number; parentId?: string;
  layout: "app" | "focus";
  scope: "family-or-member" | "none";
  status: "live" | "placeholder";
  title: string;
  page?: () => Promise<{ default: ComponentType }>;
  redirectTo?: string;
}
```

### 2.1 The route table (from contract v1.2; about 31 files, **estimate**)

| Route id | Path | Sidebar | Layout | Scope | Status | Page |
|---|---|---|---|---|---|---|
| `root` | `/` | none | app | none | live | redirect to `/home` (SF1 answer B) |
| `home` | `/home` | main 1 | app | family-or-member | placeholder | none (Home PR flips it) |
| `portfolio` | `/portfolio` | main 2; "Investments" in Portfolio mode | app | family-or-member | placeholder | none (Portfolio phase) |
| `portfolio-equity` | `/portfolio/equity` | Portfolio 2, group | app | none | live | redirect to `/portfolio/mutual-funds` |
| `portfolio-equity-direct-stocks` | `/portfolio/equity/direct-stocks` | child of Equity | app | family-or-member | placeholder | none |
| `portfolio-mutual-funds` | `/portfolio/mutual-funds` | child of Equity | app | family-or-member | **live** | Dashboard wrapper |
| `portfolio-equity-us-stocks`, `portfolio-equity-fds-bonds` | `/portfolio/equity/us-stocks`, `/portfolio/equity/fds-bonds` | child of Equity | app | family-or-member | placeholder | none |
| `portfolio-debt`, `-gold`, `-real-estate`, `-others` | `/portfolio/<name>` | Portfolio 3 to 6 | app | family-or-member | placeholder | none |
| `portfolio-mutual-funds-performance`, `-allocation`, `-holdings`, `-transactions`, `-overlap` | `/portfolio/mutual-funds/<name>` | none (in-page menu) | app | family-or-member | placeholder | none |
| `portfolio-mutual-funds-analytics` | `/portfolio/mutual-funds/analytics` | none | app | family-or-member | **live** | Analytics wrapper |
| `portfolio-mutual-funds-history` | `/portfolio/mutual-funds/history` | none | app | family-or-member | **live** | History wrapper |
| `portfolio-mutual-funds-fund` (+ `-overlap`, `-insights`) | `/portfolio/mutual-funds/funds/:schemeId` (+ `/overlap`, `/insights`) | none | app | family-or-member | placeholder | none |
| `liabilities` | `/liabilities` | main 3 | app | none | placeholder | none |
| `planning` | `/planning` | main 4 | app | none | live | redirect to `/planning/scenarios` |
| `planning-scenarios` | `/planning/scenarios` | none | app | none | **live** | Scenarios wrapper |
| `profile` | `/profile` | footer 1 | app | none | **live** | Profile wrapper |
| `profile-import-health` | `/profile/import-health` | none | app | family-or-member | live | ImportHealth wrapper |
| `help` | `/help` | footer 2 | app | none | placeholder | none |
| `import` | `/import?member=<id>` | none | focus | none | **live** | ImportFlow wrapper |
| `not-found` | `*` | none | app | none | live | shell page |

Group-node rule: `portfolio-equity` has `kind: "group"`, no `page`, a `redirectTo`. Each child names it as `parentId`. The sidebar tree uses `parentId`, not the URL prefix (Mutual Funds sits under Equity although its path is `/portfolio/mutual-funds`).

### 2.2 Validation (runs in a unit test and, in development, at startup)

Unique ids and paths; every row of 2.1 has a file; every `parentId` exists; a group has children, no `page`, and a `redirectTo` that resolves to a live route; every menu item has label and icon; `redirectTo` has no cycles; a `live` route has a `page` or a `redirectTo`.

## 3. Router

`react-router` `^7.18.4`, declarative mode: `BrowserRouter`, `Routes`/`Route`, `Outlet`, `NavLink`, `useNavigate`, `useLocation` (**verified** in the docs; 7.18.4 needs Node 20 or later and React 18 or later, **verified** on the npm registry, so it fits the Node 20 builds in CI and `deploy.sh`). Real paths, not hash routes; hosting already falls back to `index.html` (Caddy `try_files`, CloudFront 403/404 to `/index.html`; verified by the earlier session). Each page renders inside `Suspense` with `PageState` loading. `document.title` is set to `<route title> · Unifolio`; scroll resets to the top of the page area on navigation; unknown paths show the shell's not-found page inside the layout. No guards inside the router: login, onboarding, consent and deletion stay as the gates they are.

The router never sees `/print/analytics` or the legal pages (`main.tsx` sends them around `App`; **verified**) nor mobile (`MainApp` branches before the router mounts; **verified**).

## 4. Sidebar logic (derived from the URL, no separate state)

- **Mode:** Portfolio mode on every path under `/portfolio` (including `/portfolio` itself), main mode elsewhere.
- **Main mode items:** registry rows with `section: "main"` by `order`; footer rows (`footer`) in both modes.
- **Portfolio mode items:** Back row, then `section: "portfolio"` roots by `order`; children of a group are rendered indented under it.
- **Active row:** the registry route whose path equals the URL or is its longest prefix, then mapped up its `parentId` chain to the nearest route that has a sidebar row. Investments is active only on `/portfolio`. Everything under `/portfolio/mutual-funds` highlights **Mutual Fund**; Equity shows a quiet "contains active" state (N3, A3).
- **Equity open state:** open when a child is active; otherwise it keeps what the user last chose in this session (A5); stored in `sessionStorage`.
- **Placeholder rows:** rendered disabled (not clickable, not focusable as a link) with a "Coming soon" tooltip; they turn on when the route's `status` becomes `live` (L32).
- **Footer:** Profile and Help & Support, the same in both modes. Logo click goes to `/home` (C2).

## 5. Scope provider (moved out of `MainDashboardFlow`)

State and behaviour move unchanged from `MainDashboardFlow` (**verified**, lines 41 to 80 and 110 to 123): fetch members with `getHouseholdMembers()` on mount and when `me` changes; one member means member mode, several mean aggregate mode with the first member preselected; `refreshMembers()` after a rename, merge or import with `invalidateApiCache()` where it is called today; the raw member is exposed as `selectedMember` for the banners.

`useScope()` returns `{ viewMode, memberId, members, selectedMember?, scopeKey, setMember(id), setAggregate(), refreshMembers() }`.

**Reset rule (N9, B1, confirmed 23 Oct):** when the location pathname changes, resolve the previous and next routes; map each up its `parentId` chain to the nearest route with a sidebar row; if the two rows differ, set aggregate mode (several members) or leave member mode (one member). Same row (for example Mutual Fund Overview to Holdings, or a fund page opened from a Mutual Funds tab) keeps the pick (B1 follow-up, confirmed). Routes with `scope: "none"` ignore the scope.
**Refresh (B4):** the current pick is stored in `sessionStorage` and re-validated against the member list on load; if the stored member no longer exists the provider falls back to the default.
**Not in the URL (O4).** Only `/import` carries `?member=<id>`.
**Banners:** PAN conflict banner, profile nudge and the Complete profile dialog (`MemberBanners`) show above page content for a single selected member on `family-or-member` pages, except Profile, as today.

## 6. Back memory

On every pathname change, if the previous route is outside `/portfolio`, has `layout: "app"` and `status: "live"`, store its full path in `sessionStorage` (`unifolio.shell.back`). The Back row navigates there; with nothing stored, or a stored path that is no longer live, it goes to the fallback, `/home` (SF1 answer B). Back never targets `/import` or a placeholder (C5).

## 7. Import entry and exit

`useImport()` returns `openImport(memberId?)`. It navigates to `/import?member=<id>` with the origin path in router state (used by the focus layout's Back link) and keeps today's rule that Add Data from Family Combined without a member lets the user choose the member (`addDataAllowsMemberChoice`; **verified** in `MainDashboardFlow`). On `ImportFlow`'s `onDone(notice)` the wrapper calls `importDoneTarget(origin)`: when the stored origin is `/portfolio`, it navigates back there with the notice in location state; for every other origin (including no stored origin) it keeps the v1.2 behaviour and navigates to the Mutual Funds route with the notice, as `DashboardView` reads it as `importNotice` today. **v1.3 (23 Oct):** this is the only origin `importDoneTarget()` treats differently — it replicates `MainDashboardFlow`'s existing "switch back to the Dashboard tab" behaviour for every pre-existing origin, and only adds the Portfolio home page as a new case because that page did not exist when the always-Mutual-Funds rule was written. Today's "Clear CAS resume step" call on Back (`clearCasResumeStep2`) moves into the import wrapper.

## 7a. Temporary pieces and top bar choices (owner answers, 23 Oct)

- **Family selector (SF4, SF5):** one dropdown in the top bar listing Family Combined first, then each member; a one-member household shows just the member; hidden on routes with `scope: "none"`. It calls `setAggregate()` and `setMember(id)`.
- **"+ Add data" button (SF3):** a temporary top-bar button beside Ask Mira that calls `openImport()` (Family Combined without a member lets the user choose, as today). Removed with a contract change note when the Investments page ships its own Add Investment control.
- **Temporary tab strip (SF2):** the `portfolio-mutual-funds`, `-history` and `-analytics` wrapper files render a small strip (Dashboard, History, Analytics) above the unchanged screen, built from `AppLink` and the registry. Removed when the Mutual Funds owner ships the real in-page menu. The screens themselves are not edited.

## 8. Landing

After login the user lands on `/home`; after sign-up, authentication, onboarding and CAS upload, then `/home` (L35). A deep link to a valid path is respected once the gates pass. **Decided (SF1 answer B, 23 Oct):** `/home` is a placeholder (the shared Coming soon page) until the Home PR sets `home` to `live`. All pages are built before anything is staged, so no user sees the placeholder in staging. Consequence for development: while `/portfolio` is also a placeholder, the main-mode Portfolio row is greyed, so developers reach `/portfolio/mutual-funds` by URL until the Portfolio phase lands.

## 9. Backend

**No new endpoint, table, migration or job.** The shell reads existing calls only: `getHouseholdMembers`, the existing auth calls (`logout`, deletion, contact change), and whatever the wrapped screens call today. Navigation state lives in the browser (`sessionStorage`). No server-side navigation state. Proposals are in `2026-10-23-shell-backend-decisions-proposal.md`. Home's endpoints are a separate document set.

## 10. Edge cases

Refresh and deep link on every path; back and forward through router history (the `unifolioTab` history-state code is retired with `MainDashboardFlow`); a stored scope for a deleted member; a stored Back path that became a placeholder; narrowing the window below 768 px switches to the mobile tree as today and widening returns to the shell at the same URL (**verified** in the architecture draft); typed `/portfolio/equity` redirects to `/portfolio/mutual-funds` (A2); an unknown path shows not-found.

## 11. Open questions raised by this document (ids in the combined artifact)

None open. All of SF1 to SF6, SP1 to SP5 and SD1 were answered on 23 Oct (see section 7a and the Shell Design Workbook).
