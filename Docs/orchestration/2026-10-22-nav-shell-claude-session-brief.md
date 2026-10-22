# Brief for Claude sessions: the navigation shell (left sidebar) that every new page plugs into

**How to use this file:** copy everything inside the code block below and paste it as the first message of any Claude session that will plan or build a page of the new web app UI (yours or your manager's). It is self-contained. The full details live in `Docs/orchestration/2026-10-22-nav-shell-contract-v1.md`; the brief tells Claude to read it.

**Status of the contract:** draft v1, 2026-10-22. Treat the open decisions (section 11 of the contract) as provisional.

```text
You are working on Unifolio (Indian mutual-fund tracker; React 19, Vite 8, Tailwind 3.4, lucide-react icons; FastAPI backend), in the repo "MVP_V1_MF_only", integration branch `feat/leapswitch-staging`. First read AGENTS.md and CLAUDE.md in the repo root and follow them (ask before assuming anything the docs mark as open; stop and say so when two documents conflict; never commit or push unless I say so).

CONTEXT. We are redesigning the web app UI in phases, planning first and building only when I say so. The source of truth for the new UI is `Docs/Web app UI mockups MFs.pdf` and its screenshots; where an older document disagrees with the PDF, the PDF wins, but you must tell me about the conflict and never edit an existing document without asking me first. The app is moving from today's top navigation bar (tab state in `MainDashboardFlow`, no router) to a LEFT SIDEBAR "shell" with a top bar. Two people build different pages in separate branches and PRs that merge into `feat/leapswitch-staging`, so the shell is defined by a CONTRACT that every page plans against.

READ FIRST: `Docs/orchestration/2026-10-22-nav-shell-contract-v1.md`. It is the contract and the URL map. Do not plan or build the sidebar, the router or the top bar yourself; they are one separate shell PR (`feat/shell-nav`) with its own plan. Your job is the page(s) I name.

WHAT THE SHELL IS (summary; the contract has the details).
1. Navigation has three levels. Level 1, the main sidebar: Home, Portfolio, Liabilities, Planning, and at the bottom Profile and Help & Support. Level 2, "Portfolio mode": when the path is under /portfolio the sidebar changes to a Back button, Investments, Equity, Debt, Gold, Real Estate, Others (footer unchanged). Level 3, in-page menus (for example the Mutual Funds tabs Overview, Performance, Allocation, Holdings, Transactions, Overlap, Other Analytics) belong to the page, not the shell.
2. The URL map is fixed. Every screen already has its final path (for example /home, /portfolio, /portfolio/mutual-funds/holdings, /portfolio/mutual-funds/funds/:schemeId, /planning/scenarios, /profile, /import). Placeholder "Coming soon" pages exist at all of them from the shell's first merge, so you may link to any page now. Never invent a path; if you need one, ask.
3. A page joins the menu by one file: `frontend/src/shell/routes/<route-id>.route.tsx`. It declares id, path, label, Lucide icon, section, order, parent, layout (app or focus), scope, mobile behaviour and a lazy component. The shell builds the sidebar, the mobile bottom bar and the router by scanning that folder. You replace the component in YOUR file; you do not edit the sidebar, the router or anyone else's route file, and you do not change your route's path, id, label, icon, section or order.
4. The shell gives every page: `useScope()` (the family-or-member selection: viewMode, memberId, members, selectedMember, scopeKey, setMember, setAggregate, refreshMembers; a one-member household starts in member mode, several members start in aggregate mode), `<PageLayout title subtitle actions tabs />`, `paths` (typed link builders; always link through `paths`, never hard-coded strings), `AppLink` and `useAppNavigate`, `useImport()` (openImport(memberId)), standard loading/empty/error states, the shared `<MiraComingSoonDialog />`, and a test helper `renderInShell(ui, { path, scope })`.
5. Mobile uses the same registry: each route says whether it is a bottom-bar tab. Today mobile has separate views, so a route may supply `mobileComponent`; otherwise the desktop component must be responsive. Use the theme CSS variables in `frontend/src/styles/tokens.css` (--color-bg, --color-surface, --color-ink, --color-text-secondary, --color-border, --color-accent, --color-positive, --color-negative, --color-warning); light and dark must both work.
6. The existing screens (Dashboard, History, Analytics, Scenarios, Profile, Add data/import) are being moved into the new routes without changing behaviour: Dashboard to /portfolio/mutual-funds, Analytics to /portfolio/mutual-funds/analytics, History to /portfolio/mutual-funds/history, Scenarios to /planning/scenarios, Profile to /profile, import to /import.
7. Auth, onboarding, the re-consent gate, the pending-deletion screen and the maintenance banner stay outside the shell, unchanged.

WHAT I NEED FROM YOU WHEN YOU PLAN A PAGE.
- Put a "Shell integration (contract v1)" section in the page plan, using the template in section 9 of the contract: route id and path, menu position and icon, mobile behaviour, layout, scope, how it registers, what it uses from the shell, what it must not touch, the dependency on the nav-shell PR, how it is tested (renderInShell), and that links go through `paths`.
- State which contract version you assume. If the page needs something the contract does not offer, do not work around it: describe the gap and propose a small `shell:` change for me to approve.
- Treat the open decisions in section 11 of the contract as provisional and mark anything in your plan that depends on them.
- Page plans follow the project's rules: reuse existing code and tables first and justify any new table before proposing it; run only the test files a change touches; no live network in tests; do not build until I say go.

WHAT NOT TO DO. Do not build, scaffold, install dependencies or edit files until I explicitly say go. Do not create or change anything under `frontend/src/shell/` except your own route file once building is approved. Do not change the URL map or the route fields. Do not add a new page that is not in the URL map without asking. Do not commit or push.

If anything in the contract looks wrong, ambiguous or in conflict with the PDF or the code, stop and tell me before planning around it.
```

## For the person sending this

- Send the contract file alongside the brief, or tell the other session its path (`Docs/orchestration/2026-10-22-nav-shell-contract-v1.md`). The brief tells Claude to read it.
- If the contract changes, update the version and the change log in the contract file; the brief does not need editing unless the summary points above change.
