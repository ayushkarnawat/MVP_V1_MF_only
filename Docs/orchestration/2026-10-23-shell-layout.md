# Navigation shell: layout (draft v1)

**Status:** draft, 2026-10-23. Doc 2. Desktop only (mobile untouched). Colours follow `Docs/Unifolio Colour Palette.pdf` (see the design system, doc 3). Source for structure: PDF pp. 2-3, 9, 10 and the left-panel decisions N2 to N8.

## 1. Page frame

```
+------------------+--------------------------------------------------+
| Sidebar          | Top bar                                          |
| (about 224 px,   |  [Search box] ............ [Ask Mira] [Family v] [theme] |
|  full height)    +--------------------------------------------------+
|                  | Member banners (single member, not on Profile)   |
|                  | Page area (route's page; scrolls)                |
|                  |                                                  |
+------------------+--------------------------------------------------+
```

- **Sidebar:** fixed width, always visible, no collapse button (N6, contract O8). Full viewport height; its own list scrolls if the window is short. The width of about 224 px is an **estimate** from the mockup proportions.
- **Top bar:** sticky above the page area. Items left to right: search box (placement only; behaviour on hold, L46), then right-aligned Ask Mira, the family selector, the theme toggle. No avatar (L31). The family selector is one dropdown (Family Combined first, then each member), hidden on routes without a scope (SF4, SF5). A temporary "+ Add data" button sits beside Ask Mira until the Investments page ships its own control (SF3).
- **Page area:** max width as the current app (the current shell uses `max-w-7xl`; **verified**), horizontal padding as today, scrolls independently of the sidebar. The standard page header (`PageLayout`: title, subtitle, actions, tabs) belongs to the page.
- **Banners:** PAN conflict banner and profile nudge above page content for a single selected member on `family-or-member` pages, except Profile, as today.
- **Below 768 px** the existing mobile tree takes over; the shell never renders at that width.

## 2. Sidebar, main mode

Top to bottom: wordmark (existing `UnifolioLogo`, links to `/home`), Home, Portfolio, Liabilities, Planning, flexible space, divider, Profile, Help & Support. Home, Liabilities and Help are greyed "Coming soon" rows until their pages are live. Planning goes to `/planning/scenarios` (live).

## 3. Sidebar, Portfolio mode

Wordmark, **Back** (arrow icon, text "Back"), Investments, **Equity** (arrow; group), its four children indented, Debt, Gold, Real Estate, Others, flexible space, divider, Profile, Help & Support.

- **Equity group:** a button with an expanded or collapsed state; clicking the label or the arrow toggles; it never navigates. Children: Direct Stocks, Mutual Fund, US Stock, FDs & bonds, with icons (C1).
- **Active:** one row at a time. On any Mutual Funds page the Mutual Fund row is active and Equity is open with a quiet "contains active" state; Investments is active only on `/portfolio` (A3).
- **Greyed rows** (Investments until the page exists, Direct Stocks, US Stock, FDs & bonds, Debt, Gold, Real Estate, Others) show a "Coming soon" tooltip and are not clickable.

## 4. Focus layout (`/import`)

No sidebar. A slim header: Back link on the left (returns to the screen the import was opened from, default `/portfolio/mutual-funds`; SF6), "Importing for <member>" chip or the member select when Add data was opened from Family Combined, theme toggle on the right. Below, the unchanged `ImportFlow` and the privacy footer line ("Read-only statement parsing · Zero transaction permissions"). This reproduces today's full-screen "Add data" screen (**verified** in `MainDashboardFlow`).

## 5. Standard states

| State | Where | What it shows |
|---|---|---|
| Loading | a lazy page | `PageState` loading (existing `Skeleton`) inside the page area; the sidebar and top bar stay |
| Placeholder | a typed URL for an unbuilt page | one shared "Coming soon" page with the page name and a link to Investments (C4) |
| Not found | unknown path | not-found page inside the layout |
| Error | a page throws | an error boundary per page area with a retry; sidebar stays usable |
| Members loading | scope provider | selector shows a skeleton; pages wait for the scope to resolve |
| One member | scope provider | member mode; no "Family Combined" choice; selector shows the member |
| Redirect | `/`, `/planning`, `/portfolio/equity` | replace navigation (no history entry) |

## 6. Theme

Light and dark only (L33). The theme toggle is the existing component; colours come from the palette (doc 3).

## 7. Open items

None open. SP1 to SP5 and SF1 to SF6 were answered on 23 Oct (all as recommended except SF1, which is answer B: land on the Home placeholder). **Temporary tab strip (SF2):** the Dashboard, History and Analytics wrappers draw a small strip above the unchanged screen until the Mutual Funds owner ships the real in-page menu.
