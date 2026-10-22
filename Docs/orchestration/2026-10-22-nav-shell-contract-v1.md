# Navigation shell contract and URL map (v1, draft for review)

**Status:** draft v1, written 2026-10-22, not yet agreed by both owners. Planning only; nothing is built.
**Source of truth:** `Docs/Web app UI mockups MFs.pdf` (pages 2-3 and 9 for the sidebar; 12-19 and 21-26 for the Portfolio and Mutual Funds pages; 27-31 for Planning and Profile) and the screenshots. Where this contract and an older document disagree, the PDF wins (decision L8 in the Portfolio Snapshot workbook).
**Related:** `2026-10-22-portfolio-snapshot-decisions.html` (decisions L7, F2, F7a, F7b, G3), `2026-10-22-nav-shell-claude-session-brief.md` (the paste-ready brief for other Claude sessions).

## 0. Why this document exists

The new app has a left sidebar that every page lives inside. Two people are building different pages, in separate branches, merged through PRs into `feat/leapswitch-staging`. If the shell and the pages are not agreed first, the navigation gets built twice or breaks on merge.

This document fixes four things that every page plan and every page PR can rely on:

1. **The URL map**: the final address of every screen.
2. **The route module**: the small file each page adds to appear in the menu.
3. **The shell's runtime API**: what the shell gives every page (family or member scope, page layout, links, test helper).
4. **The rules**: who may edit what, and how the contract changes.

It does **not** describe page contents, and it is **not** the shell implementation plan. The shell has one overall implementation plan (a separate document, written after this contract is agreed). It is not per page: the sidebar is one component, and each page only adds one route file and a short "Shell integration" section to its own plan (template in section 9).

## 1. What the shell is, and is not

**The shell owns:**
- The router (real URLs) and the route registry.
- The desktop **left sidebar** (two modes, section 3) and the **top bar** (search, Ask Mira, family selector, theme toggle, avatar).
- The **mobile bottom bar** and mobile header, built from the same registry.
- The **family or member scope** (today this state lives in `MainDashboardFlow`).
- The member banners and the Complete profile dialog that `MainDashboardFlow` shows today (PAN conflict banner, profile nudge, `CompleteProfileDialog`).
- A standard page layout, a standard loading, empty and error state, and a "page not found" screen.
- The shared "Mira, coming soon" popup (used by the top bar and by Home).
- A test helper that mounts a page inside the shell.

**The shell does not own (unchanged):** sign-up and login, onboarding, the re-consent gate, the pending-deletion screen, the maintenance banner. These stay before the shell mounts, exactly as in `App.tsx` today.

**Pages own:** everything inside their own page area, including any in-page tabs (for example the Mutual Funds menu: Overview, Performance, and so on).

## 2. Facts this contract is built on

Checked in the code on 2026-10-22:

- The desktop app today has a **top navigation bar** with tabs, not a left sidebar (`features/dashboard/NavigationShell.tsx`). Tabs: Dashboard, History, Analytics, Scenarios, Profile. The active tab is kept in component state and in `window.history.state`.
- There is **no router library** (checked `frontend/package.json`). Stack: React 19, Vite 8, Tailwind 3.4, `lucide-react` for icons (67 files import it).
- The family or member scope is state inside `MainDashboardFlow`: `viewMode` (`aggregate` or `member`), `selectedMemberId`, the member list and the raw members. A household with one member starts in member mode; with several it starts in aggregate mode.
- **Desktop and mobile are two separate trees.** Mobile is `MobileRoot` with `MobileAppShell` (header, bottom bar, device frame) and its own views. Mobile tabs today: dashboard, analytics, scenarios, import. Mobile is chosen by viewport under 768 px, or by a `/mobile` path or `#/mobile` hash (which also shows a phone-shaped frame on wide screens).
- "Add data" (the CAS import flow) is a **full-screen mode** inside `MainDashboardFlow` (`isAddingData`), not a tab. A hidden dev screen (`ImportHealth`) is reached from the Profile page.
- Theme colours come from CSS variables in `src/styles/tokens.css`: `--color-bg`, `--color-surface`, `--color-ink`, `--color-text-secondary`, `--color-border`, `--color-accent`, `--color-positive`, `--color-negative`, `--color-warning`.

From the PDF:

- **Main sidebar (page 3):** logo at the top; Home, Portfolio, Liabilities, Planning; and at the bottom Profile and Help & Support.
- **Portfolio mode (page 9):** when Portfolio is clicked the left pane changes to: logo, a Back button, Investments, Equity, Debt, Gold, Real Estate, Others, and at the bottom Profile and Help & Support.
- **Top bar (all mockups):** search box ("Search for a fund, stock, or ask Mira..."), Ask Mira, a "Family Combined" dropdown, a theme toggle, and an avatar with initials.
- **Mutual Funds pages (pages 13-19):** an in-page menu: Overview, Performance, Allocation, Holdings, Transactions, Overlap, Other Analytics. Individual fund pages: pages 24-26. Overlap comparison: page 21.
- **Planning (pages 27-29):** the mockups show the Scenarios screen with in-page tabs (Retirement Planning, Child's Education, Home Purchase, Wealth Goals, What If, Custom Scenario; and a second screen of predefined market scenarios).
- **Profile (pages 30-31):** a page with its own secondary menu (Personal Information, Family Members, Connected Accounts, Notifications, Preferences, Security, Subscription & Billing, Tax Information, Data & Privacy).

**A discrepancy to know about.** The mockup *images* on the Portfolio, Planning and Profile pages still draw the older sidebar (Home, Analytics, Investments, Performance, Scenarios, Profile). The PDF's *text* (pages 3 and 9) gives the new structure. This contract follows the text, as agreed (decision L7).

## 3. The navigation model

Three levels. Only levels 1 and 2 belong to the shell.

```
Level 1  Main sidebar            Home | Portfolio | Liabilities | Planning        (footer: Profile | Help & Support)
Level 2  Portfolio mode          [Back] | Investments | Equity | Debt | Gold | Real Estate | Others   (footer: Profile | Help & Support)
Level 3  In-page menus (pages)   e.g. Mutual Funds: Overview | Performance | Allocation | Holdings | Transactions | Overlap | Other Analytics
```

### 3.1 Sidebar modes

- **Main mode** is shown on every route except those under `/portfolio`.
- **Portfolio mode** is shown on every route under `/portfolio`. The first row is a **Back** button.
- **Back button behaviour (proposed, O9):** go to the last non-Portfolio screen the user was on; if none, go to `/home`.
- **Active highlight:** an item is active when the current path equals its path or starts with its path plus `/`. In Portfolio mode, everything under `/portfolio/mutual-funds` highlights **Investments** (the mockup on page 14 does the same).
- The footer group (Profile, Help & Support) is identical in both modes.
- Collapse or icon-only sidebars are **not** in v1 (O8).

### 3.2 Sidebar items

Icons are Lucide names proposed for design review; confirm they exist in the installed `lucide-react` version when building.

| Mode | Order | Label | Path | Icon (proposed) |
|---|---|---|---|---|
| main | 1 | Home | `/home` | `Home` |
| main | 2 | Portfolio | `/portfolio` | `Briefcase` |
| main | 3 | Liabilities | `/liabilities` | `Receipt` |
| main | 4 | Planning | `/planning` | `Target` |
| footer | 1 | Profile | `/profile` | `User` |
| footer | 2 | Help & Support | `/help` | `CircleHelp` |
| portfolio | 0 | Back | (last non-Portfolio screen, default `/home`) | `ArrowLeft` |
| portfolio | 1 | Investments | `/portfolio` | `LayoutGrid` |
| portfolio | 2 | Equity | `/portfolio/equity` | `TrendingUp` |
| portfolio | 3 | Debt | `/portfolio/debt` | `Landmark` |
| portfolio | 4 | Gold | `/portfolio/gold` | `Coins` |
| portfolio | 5 | Real Estate | `/portfolio/real-estate` | `Building2` |
| portfolio | 6 | Others | `/portfolio/others` | `Shapes` |

### 3.3 Mobile bottom bar (proposed; decision F7b is still open)

Home, Portfolio, Planning, Profile. Liabilities and Help & Support go into a "More" sheet. Import is reached from the Portfolio > Mutual Funds page header and from Profile. Each route says in its module whether it is a tab (section 5), so the bar is built from the registry and changing it later is a one-line change per route.

## 4. The URL map

All paths are final for v1. Placeholders exist at every path from the shell's first merge, so any page can link to any other page today.

| Route id | Path | Menu | Layout | Today / who builds | Existing screen it takes over |
|---|---|---|---|---|---|
| `root` | `/` | none | n/a | redirect to `/home` | n/a |
| `home` | `/home` | main 1 | app | Portfolio Snapshot (Aditi) | none (new; placeholder until built) |
| `portfolio` | `/portfolio` | main 2, and "Investments" in Portfolio mode | app | Portfolio phase (placeholder) | none |
| `portfolio-equity` | `/portfolio/equity` | Portfolio mode 2 | app | placeholder | none |
| `portfolio-debt` | `/portfolio/debt` | Portfolio mode 3 | app | placeholder | none |
| `portfolio-gold` | `/portfolio/gold` | Portfolio mode 4 | app | placeholder | none |
| `portfolio-real-estate` | `/portfolio/real-estate` | Portfolio mode 5 | app | placeholder | none |
| `portfolio-others` | `/portfolio/others` | Portfolio mode 6 | app | placeholder | none |
| `portfolio-mutual-funds` | `/portfolio/mutual-funds` | none (reached from the Investments page) | app | Portfolio phase | **Dashboard** (`DashboardView`), moved as is |
| `portfolio-mutual-funds-performance` | `/portfolio/mutual-funds/performance` | in-page menu | app | placeholder | none |
| `portfolio-mutual-funds-allocation` | `/portfolio/mutual-funds/allocation` | in-page menu | app | placeholder | none |
| `portfolio-mutual-funds-holdings` | `/portfolio/mutual-funds/holdings` | in-page menu | app | placeholder | none |
| `portfolio-mutual-funds-transactions` | `/portfolio/mutual-funds/transactions` | in-page menu | app | placeholder | none |
| `portfolio-mutual-funds-overlap` | `/portfolio/mutual-funds/overlap` | in-page menu | app | placeholder | none |
| `portfolio-mutual-funds-overlap-compare` | `/portfolio/mutual-funds/overlap/compare` | none | app | placeholder | none |
| `portfolio-mutual-funds-analytics` | `/portfolio/mutual-funds/analytics` | in-page menu ("Other Analytics") | app | existing screen, re-parented | **Analytics** (`AnalyticsView`), moved as is |
| `portfolio-mutual-funds-history` | `/portfolio/mutual-funds/history` | none (temporary) | app | existing screen, re-parented | **History** (`HistoryView`), moved as is; folds into Transactions later |
| `portfolio-mutual-funds-fund` | `/portfolio/mutual-funds/funds/:schemeId` | none | app | placeholder | none |
| `portfolio-mutual-funds-fund-overlap` | `/portfolio/mutual-funds/funds/:schemeId/overlap` | none | app | placeholder | none |
| `portfolio-mutual-funds-fund-insights` | `/portfolio/mutual-funds/funds/:schemeId/insights` | none | app | placeholder | none |
| `liabilities` | `/liabilities` | main 3 | app | placeholder | none |
| `planning` | `/planning` | main 4 | app | redirect to `/planning/scenarios` | none |
| `planning-scenarios` | `/planning/scenarios` | none | app | existing screen, re-parented | **Scenarios** (`ScenariosScreen`), moved as is |
| `profile` | `/profile` | footer 1 | app | existing screen | **Profile** (`ProfileView`), moved as is |
| `profile-import-health` | `/profile/import-health` | none | app | existing dev screen | `ImportHealth` |
| `help` | `/help` | footer 2 | app | placeholder | none |
| `import` | `/import?member=<memberId>` | none | **focus** (no sidebar) | existing flow | the "Add data" mode (`ImportFlow`) |
| `not-found` | `*` | none | app | shell | none |

Notes on the map:

- **The Mutual Funds in-page menu (level 3) is built by the Mutual Funds page owner.** The paths for its tabs are fixed here so they can be linked now.
- **Profile sections.** The PDF shows a secondary menu on Profile. In v1 `/profile` is the existing single screen. When Profile is redesigned, its sections become `/profile/:section` (personal, family, connected-accounts, notifications, preferences, security, subscription, tax, data-privacy). Those paths are reserved now.
- **Planning.** `/planning` redirects to `/planning/scenarios`. Planning has no sidebar sub-menu in v1 (O5). The in-page tabs on the Scenarios screen are inside the page.
- **Instrument tabs on the Investments page** (Mutual Funds, Stocks, FDs, Bonds, Gold, US Stocks, Other Assets in the page 10 mockup) are page content. Only Mutual Funds has a route in v1. How instrument pages relate to the asset-class pages (Equity, Debt, Gold ...) is an open decision (O2).
- **Dynamic segments:** `:schemeId` is a scheme UUID from the schemes table.
- **Legacy mapping:** old tab names map as `dashboard` to `/portfolio/mutual-funds`, `history` to `/portfolio/mutual-funds/history`, `analytics` to `/portfolio/mutual-funds/analytics`, `scenarios` to `/planning/scenarios`, `profile` to `/profile`.

## 5. The route module (how a page joins the menu)

**Rule: one file per page, in `frontend/src/shell/routes/`, named `<route-id>.route.tsx`. Adding a page means adding or replacing a file. Nobody edits a shared file.** The shell builds the sidebar, the bottom bar and the router by scanning that folder with Vite's `import.meta.glob` (Vite 8 is installed).

Proposed shape (illustrative; the shell PR makes it real and the shape is part of contract v1):

```ts
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

export interface ShellRoute {
  id: string;                          // unique, kebab-case; equals the file name stem
  path: string;                        // from the URL map, e.g. "/portfolio/mutual-funds/holdings"
  label: string;                       // sidebar and bottom-bar label
  modeLabel?: string;                  // label when shown in Portfolio mode (e.g. "Investments" for "Portfolio")
  icon: LucideIcon;
  section: "main" | "portfolio" | "footer" | null;   // null = not in the menu
  order: number;                       // position within its section
  parentId?: string;                   // e.g. "portfolio-mutual-funds" for its sub-pages
  layout: "app" | "focus";             // "focus" = full screen, no sidebar (import)
  scope: "family-or-member" | "none";  // does this page react to the family/member selector
  title: string;                       // default page title
  mobile: false | { tab?: boolean; tabOrder?: number; more?: boolean };
  desktop: () => Promise<{ default: ComponentType }>;          // lazy page component
  mobileComponent?: () => Promise<{ default: ComponentType }>; // optional; otherwise `desktop` must be responsive
  redirectTo?: string;                 // for pure redirects such as "/planning"
}
```

Rules:

- **Placeholders.** The shell PR creates a file for every row of the URL map. Each placeholder shows "Coming soon" inside the standard page layout. **A page owner replaces the `desktop` (and optionally `mobileComponent`) of their own file. They do not change `path`, `id`, `label`, `icon`, `section` or `order`** unless the change goes through section 8.
- **Existing mobile views.** Mobile has separate views today (`MobileDashboardView`, `MobileAnalyticsView`). A route may supply `mobileComponent` for these. If it does not, the desktop component is used and must work at phone width.
- **A contract test** (in the shell PR) fails if: two routes share an id or a path; a path in the URL map has no file; a `parentId` does not exist; a menu item has no icon or label.

## 6. What the shell gives every page (runtime API)

All exported from `frontend/src/shell/` (names are the contract; implementation is the shell PR's job).

1. **`useScope()`**: the family or member selection, replacing the state in `MainDashboardFlow`.
   ```ts
   {
     viewMode: "aggregate" | "member";
     memberId: string | null;          // the selected member (also set in aggregate mode, as today)
     members: { id: string; name: string }[];
     selectedMember?: HouseholdMember; // raw member (profile completion, PAN conflict flag)
     scopeKey: string;                 // "aggregate" or "member:<id>"; use in cache keys
     setMember(id: string): void;      // switches to member mode
     setAggregate(): void;
     refreshMembers(): Promise<void>;  // after a rename, merge or import
   }
   ```
   Initial values keep today's rule: one member means member mode; several members mean aggregate mode.
2. **`<PageLayout title subtitle actions tabs? />`**: the standard page header and content area. `tabs` is for level-3 in-page menus.
3. **`paths`**: typed link builders, for example `paths.home()`, `paths.portfolio.mutualFunds.fund(schemeId)`, `paths.import(memberId)`. **Pages must link through `paths`, never hard-coded strings.**
4. **`<AppLink to>` and `useAppNavigate()`**: navigation that respects focus layouts and the mobile `/mobile` prefix (O3).
5. **`useImport()`**: `openImport(memberId?)` replaces the `handleAddDataTrigger` in `MainDashboardFlow`.
6. **Standard states:** `<PageState loading | error | empty />`, based on what `MobileAppShell` renders today, so every page looks the same when loading or failing.
7. **`<MiraComingSoonDialog />`**: the shared popup (decision L4). Home and the top bar use the same one.
8. **Theme and style:** use the CSS variables from `src/styles/tokens.css`. Nothing in the shell hard-codes colours that the tokens already provide. Light and dark both work (decision G4).
9. **Test helper:** `renderInShell(ui, { path, scope })` from `shell/testing`, which mounts a page with the router, the scope and the layout.

## 7. Behaviour the shell guarantees

- Deep links and browser refresh work on every path. Browser back and forward work (this replaces the `unifolioTab` history-state trick).
- An unknown path shows the shell's not-found page, inside the layout.
- The sidebar and the bottom bar always agree with the registry.
- Changing the family or member selection re-renders pages through `useScope()` without a reload.
- The member banners (PAN conflict, profile nudge) appear above page content when a single member is selected and the page's `scope` is `family-or-member`, as they do today on every tab except Profile.
- The `focus` layout (import) hides the sidebar and shows a Back link and the theme toggle, as the current "Add data" screen does.
- Auth, onboarding, re-consent, pending deletion and the maintenance banner behave exactly as today.
- **Moving the existing screens (Dashboard, History, Analytics, Scenarios, Profile, Import) changes where they live, not what they do.** This is the riskiest part of the shell PR and gets the most testing: back and forward, refresh, deep links, mobile.

## 8. Rules and how the contract changes

**Page owners may** add or replace their own route files and everything under their own feature folder.
**Page owners may not** edit anything under `frontend/src/shell/` except their own route files. If a page needs something the shell does not offer, open a small PR titled `shell: ...` and label it `shell-contract`.

**Changing the contract:**
- Additive changes (a new optional field, a new helper) are allowed in v1 with a note in this document's change log.
- Anything that changes a path, an id, a field's meaning or the scope hook's shape needs both owners' approval and bumps the version to v2.
- Every page plan states which contract version it assumes.

**Change log:** v1 draft, 2026-10-22: first version.

## 9. For page plans: the "Shell integration" section (template)

Copy this into every page plan.

```
## Shell integration (contract v1)
- Route id / path: <id> / <path>   (from the URL map; do not invent paths)
- Menu: <main n | portfolio mode n | footer n | none>, label <...>, icon <Lucide name>, parent <id or none>
- Mobile: <tab n | more sheet | none | desktop component is responsive | mobileComponent supplied>
- Layout: <app | focus>      Scope: <family-or-member | none>
- How it registers: replaces the placeholder file frontend/src/shell/routes/<id>.route.tsx
- Uses from the shell: useScope(), PageLayout, paths, PageState, MiraComingSoonDialog (list only what applies)
- Must not touch: anything under frontend/src/shell/ other than its own route file
- Depends on: the nav-shell PR (contract v1) being merged; until then this plan assumes contract v1 as written
- Tests: mounted with renderInShell(...)
- Links to other pages: only through paths.*
```

## 10. Branches and PRs

- **PR 1 `feat/shell-nav`** merges first into `feat/leapswitch-staging`. It is small and reviewed by both owners.
- Then, each branched from the updated staging branch: `feat/home-snapshot` (Home), and `feat/portfolio-<page>` for each Portfolio page. Each page PR touches only its own route file and feature folder.
- **Stacked option:** a page can start on top of `feat/shell-nav` before it merges, and retarget to staging afterwards.
- **Optional:** require both owners' review for any change under `frontend/src/shell/`.

## 11. Open decisions (need confirmation before freezing v1)

Each has a recommended default so work can proceed.

| # | Decision | Recommended default |
|---|---|---|
| O1 | Router library | A mainstream router such as react-router. It is a new dependency, and the choice was already approved in principle as F2 (add a router now). Confirm the library. |
| O2 | How the instrument tabs (Mutual Funds, Stocks, FDs ...) relate to the asset-class pages (Equity, Debt, Gold ...) | Keep both: `/portfolio/<asset-class>` for the sidebar items and `/portfolio/mutual-funds/...` for the instrument page. Mutual Funds highlights Investments. Revisit when Stocks arrive. |
| O3 | The legacy `/mobile` path and `#/mobile` hash | Keep working: a `/mobile` prefix forces the mobile layout (and the phone frame) and is stripped before routing. |
| O4 | Is the member selection part of the URL? | No in v1: it is shell state (remembered per session). Only `/import` carries `?member=`. |
| O5 | Does Planning get a sidebar sub-menu? | No in v1. |
| O6 | What does Liabilities contain? | A "Coming soon" placeholder until someone is assigned. |
| O7 | Mobile bottom bar items (F7b) | Home, Portfolio, Planning, Profile; Liabilities and Help in a More sheet. |
| O8 | Collapsible or icon-only sidebar | Not in v1. |
| O9 | Back button destination in Portfolio mode | The last non-Portfolio screen, default `/home`. |
| O10 | Profile sections as separate routes | Later, when Profile is redesigned. Paths reserved in section 4. |
| O11 | Help & Support | A placeholder page at `/help` for now. |

## 12. What the shell PR must contain (for the later shell plan)

This list is for the shell implementation plan, which is a separate document. It is one plan for the whole shell, not one per page.

- The router, the registry, the contract test, the placeholder route files for every row of section 4.
- The desktop sidebar (both modes), the top bar, the mobile bottom bar and header, all built from the registry.
- `useScope`, `PageLayout`, `paths`, `AppLink`, `useAppNavigate`, `useImport`, `PageState`, `MiraComingSoonDialog`, `renderInShell`.
- The existing screens moved into their new routes without behaviour changes, with tests for back and forward, refresh, deep link and mobile.
- A one-page "how to add a page" guide.
