# Navigation shell contract and URL map (v1.2, draft for review)

**Status:** draft v1.2, 2026-10-22. Planning only; nothing is built. v1.2 replaces v1.1; v1 was first committed as 8c13782 (local only).

**What changed in v1.2 (owner's answers to the open decisions, 22 Oct):** router is react-router v7 (O1); **Equity is an expandable group, not a page** (O2 redesigned): its children are Direct Stocks, Mutual Fund, US Stock, and FDs & bonds; clicking Portfolio opens Investments; the selected member is not in the URL (O4); no Planning sub-menu (O5); Liabilities is a placeholder page (O6); Back goes to the last non-Portfolio screen (O9); Profile sections as routes later (O10); Help & Support placeholder (O11). Assumptions made without an explicit answer are marked **(assumed)** in section 10 and should be confirmed.
**Source of truth:** `Docs/Web app UI mockups MFs.pdf` (pp. 2-3 and 9 sidebar; 12-19, 21-26 Portfolio and Mutual Funds; 27-31 Planning and Profile) and the screenshots. Where this contract and an older document disagree, the PDF wins.
**Related:** `2026-10-22-portfolio-snapshot-decisions.html` (decisions L7-L39), `2026-10-22-nav-shell-claude-session-brief.md`, `2026-10-22-nav-shell-architecture.md` (in-depth structure).

**What changed from v1:** mobile is out of scope and removed; the top bar has no avatar; links to pages that are not built yet are disabled by a route `status`; existing screens are wired in unchanged by wrapper files only (O12 closed); the search box has three groups; the landing flow is fixed; light and dark themes only; O3, O7, O8 closed.

## 0. Purpose

The new desktop app has a left sidebar that every page lives inside. Two people build different pages in separate branches, merged by PR into `feat/leapswitch-staging`. This contract fixes four things every page plan and PR can rely on: **(1)** the URL map, **(2)** the route module (one small file per page), **(3)** what the shell gives every page, **(4)** the rules for editing and changing it. It is not the shell implementation plan (a separate, single plan for the whole shell) and says nothing about page contents.

## 1. Scope

**The shell owns:** the router and route registry; the desktop left sidebar (two modes) and top bar; the family-or-member scope (state that today lives in `MainDashboardFlow`); the member banners and Complete profile dialog that `MainDashboardFlow` shows today; a standard page layout and loading, empty, error and not-found states; the shared "Mira, coming soon" popup; a test helper.
**Unchanged and outside the shell:** sign-up, login, onboarding, the re-consent gate, the pending-deletion screen, the maintenance banner, the print and legal pages (`main.tsx` sends those around `App`).
**Out of scope in this phase (decisions L29, L30):**
- **Mobile.** Nothing on mobile is touched: not the bottom bar, not routes, not design. The router is mounted only in the desktop branch, after the existing gates.
- **Existing screens** (Dashboard, History, Analytics, Scenarios, Profile, import) are not changed, rebuilt or split. The shell may only wrap them unchanged (section 6).
**Themes:** light and dark only (decision L33). No other accessibility rules in this phase.

## 2. Facts checked in the code (2026-10-22)

- Today's desktop app has a **top navigation bar** (`features/dashboard/NavigationShell.tsx`), with tabs Dashboard, History, Analytics, Scenarios, Profile. The active tab is React state plus `window.history.state.unifolioTab`.
- **No router library** is installed (React 19, Vite 8, Tailwind 3.4, `lucide-react` for icons).
- Family-or-member state (`viewMode`, `selectedMemberId`, members, raw members) lives in `MainDashboardFlow`. One member starts in member mode; several start in aggregate mode.
- "Add data" (CAS import) is a full-screen mode inside `MainDashboardFlow`; a dev screen `ImportHealth` is reached from Profile.
- Theme tokens are CSS variables in `src/styles/tokens.css` (`--color-bg`, `--color-surface`, `--color-ink`, `--color-text-secondary`, `--color-border`, `--color-accent`, `--color-positive`, `--color-negative`, `--color-warning`).
- Hosting already supports real URLs: Caddy uses `try_files {path} /index.html`; CloudFront maps 403 and 404 to `/index.html`.
- The PDF's mockup *images* for Portfolio, Planning and Profile still draw the older sidebar; the PDF *text* (pp. 3 and 9) gives the new one. This contract follows the text.

## 3. Navigation model

```
Level 1  Main sidebar          Home | Portfolio | Liabilities | Planning      (footer: Profile | Help & Support)
Level 2  Portfolio mode        [Back] | Investments | Equity v | Debt | Gold | Real Estate | Others   (same footer)
                               Equity v expands in place: Direct Stocks | Mutual Fund | US Stock | FDs & bonds
Level 3  In-page menus         belong to the page (for example the Mutual Funds tabs); not the shell
```

- **Main mode** is shown on every route except those under `/portfolio`; **Portfolio mode** on every route under `/portfolio`, with a **Back** row on top.
- **Back (O9):** the last non-Portfolio screen the user was on; default `/home`. Remembered for the session.
- **Portfolio entry:** clicking Portfolio in the main sidebar opens `/portfolio`, the Investments page, and switches to Portfolio mode.
- **Scope rule (v1.2, revised after the Left Panel Plan answers):** every page change shows **Family Combined** (owner's answer B1, "reset to Family Combined everywhere", confirmed 23 Oct). Opening any Portfolio page, whatever view Home was in, and moving to any other page, including between Portfolio pages, resets the scope to Family Combined. **Exception (confirmed 23 Oct):** moving between the in-page tabs of one page, for example Mutual Funds Overview to Holdings, keeps the picked member. "Same page" means the previous and next routes belong to the same sidebar row: each route is traced up its `parentId` chain to the nearest route that has a sidebar row, and if both reach the same row the reset is skipped. A member picked on a page stays picked while the user moves between that page's tabs. The rule applies to households with several members; a single member stays in member mode as today. A refresh on the same page keeps the pick for the browser-tab session. The rule lives in `useScope()`.
- **Equity group:** Equity has a small expand arrow. Clicking it (or the label) expands or collapses the list; it never navigates, because Equity is not a page. Its children are real routes. The group opens by itself when the current path is one of its children; otherwise it keeps whatever the user last chose, remembered for the session. A typed `/portfolio/equity` redirects to `/portfolio/mutual-funds`.
- **Active item:** the path equals the item's path or starts with it plus `/`. Investments is active only on `/portfolio` itself. Everything under `/portfolio/mutual-funds` highlights **Equity > Mutual Fund**, and the Equity group shows as active whenever one of its children is.
- The footer (Profile, Help & Support) is the same in both modes. No collapsed sidebar in v1.

| Mode | Order | Label | Path | Icon (proposed; confirm in the installed lucide-react) |
|---|---|---|---|---|
| main | 1 | Home | `/home` | `Home` |
| main | 2 | Portfolio | `/portfolio` | `Briefcase` |
| main | 3 | Liabilities | `/liabilities` | `Receipt` |
| main | 4 | Planning | `/planning` | `Target` |
| footer | 1 | Profile | `/profile` | `User` |
| footer | 2 | Help & Support | `/help` | `CircleHelp` |
| portfolio | 0 | Back | last non-Portfolio screen | `ArrowLeft` |
| portfolio | 1 | Investments | `/portfolio` | `LayoutGrid` |
| portfolio | 2 | Equity (expandable group, no page) | `/portfolio/equity` redirects to `/portfolio/mutual-funds` | `TrendingUp` |
| portfolio, child of Equity | 2.1-2.4 | Direct Stocks, Mutual Fund, US Stock, FDs & bonds | `/portfolio/equity/direct-stocks`, `/portfolio/mutual-funds`, `/portfolio/equity/us-stocks`, `/portfolio/equity/fds-bonds` | `ChartCandlestick`, `ChartPie`, `Globe`, `PiggyBank` (proposed; all four exist in lucide-react 0.475.0, checked 22 Oct) |
| portfolio | 3-6 | Debt, Gold, Real Estate, Others | `/portfolio/debt`, `/gold`, `/real-estate`, `/others` | `Landmark`, `Coins`, `Building2`, `Shapes` |

**Top bar:** a search box, Ask Mira, the family selector, the theme toggle. **No avatar** (decision L31); Profile is in the sidebar footer. Search (decision L39) is one box with a dropdown of three groups: Your funds, All funds, Ask Mira. In the shell's first version the box opens the shared "Mira, coming soon" popup; the real search (a new `GET /funds/search` endpoint plus the dropdown) is a follow-up PR whose owner is to be agreed. Its behaviour is specified in the Portfolio Snapshot workbook (G2 reply).

## 4. URL map

All paths are final for v1.2. A placeholder ("Coming soon") exists at every path from the shell's first merge.

| Route id | Path | Menu | Layout | Who / when | Existing screen (wrapped unchanged) |
|---|---|---|---|---|---|
| `root` | `/` | none | n/a | redirect to `/home` | n/a |
| `home` | `/home` | main 1 | app | Portfolio Snapshot (Aditi) | none (placeholder until built) |
| `portfolio` | `/portfolio` | main 2; "Investments" in Portfolio mode | app | Portfolio phase | none |
| `portfolio-equity` | `/portfolio/equity` (group node, `kind: "group"`; no page, `redirectTo: /portfolio/mutual-funds`) | Portfolio mode 2 (expandable group) | app | shell | n/a |
| `portfolio-equity-direct-stocks`, `portfolio-equity-us-stocks`, `portfolio-equity-fds-bonds` | `/portfolio/equity/<direct-stocks\|us-stocks\|fds-bonds>` | child of Equity | app | placeholders | none |
| `portfolio-debt`, `-gold`, `-real-estate`, `-others` | `/portfolio/<debt\|gold\|real-estate\|others>` | Portfolio mode 3-6 | app | placeholders | none |
| `portfolio-mutual-funds` | `/portfolio/mutual-funds` | child of Equity ("Mutual Fund"); also linked from the Investments page | app | Portfolio phase | **Dashboard** (`DashboardView`) |
| `portfolio-mutual-funds-performance`, `-allocation`, `-holdings`, `-transactions`, `-overlap` | `/portfolio/mutual-funds/<performance\|allocation\|holdings\|transactions\|overlap>` | in-page menu | app | placeholders | none |
| `portfolio-mutual-funds-overlap-compare` | `/portfolio/mutual-funds/overlap/compare` | none | app | placeholder | none |
| `portfolio-mutual-funds-analytics` | `/portfolio/mutual-funds/analytics` | in-page menu ("Other Analytics") | app | existing | **Analytics** (`AnalyticsView`) |
| `portfolio-mutual-funds-history` | `/portfolio/mutual-funds/history` | none (temporary) | app | existing | **History** (`HistoryView`) |
| `portfolio-mutual-funds-fund` (+ `/overlap`, `/insights`) | `/portfolio/mutual-funds/funds/:schemeId` | none | app | placeholders | none |
| `liabilities` | `/liabilities` | main 3 | app | placeholder | none |
| `planning` | `/planning` | main 4 | app | redirect to `/planning/scenarios` | none |
| `planning-scenarios` | `/planning/scenarios` | none | app | existing | **Scenarios** (`ScenariosScreen`) |
| `profile` | `/profile` | footer 1 | app | existing | **Profile** (`ProfileView`) |
| `profile-import-health` | `/profile/import-health` | none | app | existing dev screen | `ImportHealth` |
| `help` | `/help` | footer 2 | app | placeholder | none |
| `import` | `/import?member=<memberId>` | none | **focus** (no sidebar) | existing | the "Add data" mode (`ImportFlow`) |
| `not-found` | `*` | none | app | shell | none |

- The Mutual Funds in-page menu (Overview, Performance, Allocation, Holdings, Transactions, Overlap, Other Analytics) is built by that page's owner; its paths are fixed here so they can be linked.
- **Profile sections** are reserved as `/profile/:section` (personal, family, connected-accounts, notifications, preferences, security, subscription, tax, data-privacy) for when Profile is redesigned. In v1 `/profile` is the existing screen.
- **Instrument routes (O2, v1.2):** the Equity children are routes in their own right (Mutual Fund keeps `/portfolio/mutual-funds` so existing mappings do not move). Equity itself has no page: a typed or bookmarked `/portfolio/equity` redirects to `/portfolio/mutual-funds`. The Investments page may still show instrument shortcuts, linking through `paths`.
- **Legacy mapping:** `dashboard` is `/portfolio/mutual-funds`; `history` is `/portfolio/mutual-funds/history`; `analytics` is `/portfolio/mutual-funds/analytics`; `scenarios` is `/planning/scenarios`; `profile` is `/profile`.

## 5. The route module

**One file per page in `frontend/src/shell/routes/`, named `<route-id>.route.tsx`. Adding a page means adding or replacing a file; nobody edits a shared file.** The shell builds the sidebar, the top bar links and the router by scanning that folder with `import.meta.glob`.

```ts
export interface ShellRoute {
  id: string;                          // unique, kebab-case; equals the file name stem
  path?: string;                       // from the URL map; a group node (Equity) has one only so a typed URL redirects (redirectTo)
  kind?: "page" | "group";             // "group" = expandable menu node, no page (default "page")
  label: string;
  modeLabel?: string;                  // label in Portfolio mode (e.g. "Investments" for "Portfolio")
  icon: LucideIcon;
  section: "main" | "portfolio" | "footer" | null;   // null = not in the menu
  order: number;
  parentId?: string;
  layout: "app" | "focus";             // "focus" = full screen, no sidebar (import)
  scope: "family-or-member" | "none";
  status: "live" | "placeholder";      // placeholder = links to it render disabled
  title: string;
  page: () => Promise<{ default: ComponentType }>;   // lazy
  redirectTo?: string;
}
```

- **Placeholders:** the shell PR creates a file for every row of section 4. An owner replaces `page` and flips `status` to `live`. They do not change `path`, `id`, `label`, `icon`, `section` or `order` without section 7.
- **Disabled links (decision L32):** a link to a `placeholder` route renders greyed with a "Coming soon" tooltip, and switches on by itself when the route goes `live`. No page edit is needed.
- **A contract test** fails if two routes share an id or path, a URL-map path has no file, a parent is missing, or a menu item lacks an icon or label.

## 6. What the shell gives every page

1. **`useScope()`**: `{ viewMode: "aggregate" | "member"; memberId; members; selectedMember?; scopeKey; setMember(id); setAggregate(); refreshMembers() }`. Defaults keep today's rule. It also applies the scope rule (section 3): Family Combined on every page change except moves between the in-page tabs of one page, with a refresh keeping the pick for the session.
2. **`<PageLayout title subtitle actions tabs? />`**: the standard page header and content area.
3. **`paths`**: typed link builders; pages must link through them, never hard-coded strings.
4. **`<AppLink>` and `useAppNavigate()`**, including disabled links.
5. **`useImport()`**: `openImport(memberId?)`.
6. **`<PageState loading | error | empty />`** and **`<MiraComingSoonDialog />`**.
7. **`renderInShell(ui, { path, scope })`** from `shell/testing`.
8. Theme variables from `tokens.css`; light and dark both work.

**Existing screens (decision L38):** each gets a thin wrapper route file that reads the scope and renders the unchanged component with the props `MainDashboardFlow` passes today. Nothing inside the screens is edited.

## 7. Guarantees, rules and changes

- Deep links, refresh, back and forward work on every path. An unknown path shows the shell's not-found page.
- **Landing (decision L35):** after login, authentication then `/home`. After sign-up: authentication, onboarding, CAS upload, then `/home`.
- Member banners (PAN conflict, profile nudge) appear above page content for a single selected member on `family-or-member` pages, except Profile, as today.
- **Page owners** may add or replace their own route files and their own feature folders. They may not edit anything else under `frontend/src/shell/`. A shell change is its own small PR labelled `shell-contract`.
- **Changing the contract:** changes may be made at any time with a notice to both owners and a change-log line (owner's answer D4, 22 Oct). Every page plan states the version it assumes. A change to a path, id, field meaning or the scope hook's shape also needs the shell reviewers' approval under section 9, and the notice must say which pages it affects.
- **Change log:** v1 (2026-10-22): first version. v1.1 (2026-10-22): mobile out of scope, no avatar, route status, wrapper files, three-group search, landing flow. v1.2 (2026-10-22): Equity becomes an expandable group with four children, `kind: "group"` and optional `path` added to the route module, `/portfolio/equity` removed, react-router v7 confirmed, open decisions answered. v1.2 revised (2026-10-22, before anything was pushed, after the Left Panel Plan answers): `/portfolio/equity` is a redirect to `/portfolio/mutual-funds`; child icons added; Portfolio scope rule; router pinned to `^7.18.4`; two-PR delivery and CODEOWNERS review; contract changes allowed with a notice.

## 8. Template for every page plan

```
## Shell integration (contract v1.2)
- Route id / path: <id> / <path>   (from the URL map; do not invent paths)
- Menu: <main n | portfolio mode n | footer n | none>, label, icon, parent
- Layout: <app | focus>      Scope: <family-or-member | none>
- How it registers: replaces frontend/src/shell/routes/<id>.route.tsx and sets status "live"
- Uses from the shell: useScope(), PageLayout, paths, PageState, MiraComingSoonDialog (only what applies)
- Must not touch: anything under frontend/src/shell/ except its own route file
- Depends on: the nav-shell PR (contract v1.2); until merged, this plan assumes it as written
- Tests: mounted with renderInShell(...)
- Links to other pages: only through paths.*; links to placeholder pages are disabled automatically
```

## 9. Branches and PRs

The shell is delivered in two PRs (owner's answer D1, 22 Oct). **PR 1** `feat/shell-nav`: router, registry, sidebar, top bar frame, placeholders and tests, not yet switched on. **PR 2**: the scope move, the wrapper files for existing screens and the `App.tsx` switch. Every change under `frontend/src/shell/` needs review by both owners, enforced with a `CODEOWNERS` file (D2). PR 1 merges first into `feat/leapswitch-staging`. Then, branched from updated staging: `feat/home-snapshot` and `feat/portfolio-<page>` for each page; each touches only its own route file and feature folder. A page may start stacked on `feat/shell-nav` before it merges, then retarget.

## 10. Decisions on the open questions (answered 22 Oct)

O1 router: **react-router v7, `^7.18.4`** (one new dependency; v8.5 needs Node 22.22 and our CI and deploy script use Node 20; a v8 and Node 22 upgrade is a later task). O2 portfolio menu: **Equity is an expandable group, not a page**; children Direct Stocks, Mutual Fund, US Stock, FDs & bonds; Portfolio opens Investments. O4 scope in the URL: **no**; shell state, remembered per session; only `/import` carries `?member=`. O5 Planning sub-menu: **none**. O6 Liabilities: **a placeholder page "Liabilities"** (assumed placeholder; confirm if it is to be built now). O9 Back: **the last non-Portfolio screen** (default `/home`). O10 Profile sections as routes: **later, not in v1**. O11 Help & Support: **placeholder for now**.

**Confirmed by the owner (Left Panel Plan, 22 Oct):** FDs & bonds sits under Equity as listed; Debt, Gold, Real Estate and Others are plain greyed links with no children; Equity opens on child pages and otherwise remembers its last state; a typed `/portfolio/equity` redirects to `/portfolio/mutual-funds`; the scope rule above (Family Combined on every page change, except between the in-page tabs of one page); a shared Coming soon page for greyed URLs; the logo goes to `/home`; basic keyboard and screen-reader semantics only; Back remembers only live screens with the normal layout, otherwise `/home`.

**Still to confirm:** nothing.

**Confirmed 23 Oct:** (a) the slug `direct-stocks` for the Direct Stocks child (an earlier workbook used `stocks`). (b) the "same page" test for the tab exception uses the shared sidebar row (section 3), so a fund page (`/portfolio/mutual-funds/funds/:schemeId`) opened from a Mutual Funds tab keeps the picked member, because both belong to the Mutual Funds row.

**Closed earlier:** O3 (`/mobile` handling: mobile untouched), O7 (mobile bar: out of scope), O8 (collapsible sidebar: not in v1), O12 (existing screens: wrapper files only, decision L38).
