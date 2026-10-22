# Brief for Claude sessions: the navigation shell (left sidebar) that every new page plugs into

**How to use this file:** copy everything inside the code block below and paste it as the first message of any Claude session that will plan or build a page of the new desktop web app UI (yours or your manager's). It is self-contained. The full details live in `Docs/orchestration/2026-10-22-nav-shell-contract-v1.md` (contract v1.2); the brief tells Claude to read it.

**Status:** contract v1.2, draft, 2026-10-22. Treat the open decisions (section 10 of the contract) as provisional.

```text
You are working on Unifolio (Indian mutual-fund tracker; React 19, Vite 8, Tailwind 3.4, lucide-react; FastAPI backend), repo "MVP_V1_MF_only", integration branch `feat/leapswitch-staging`. First read AGENTS.md and CLAUDE.md and follow them (ask before assuming anything the docs mark as open; stop and say so when two documents conflict; never commit or push unless I say so).

CONTEXT. We are redesigning the DESKTOP web app UI in phases: planning first, building only when I say so. The source of truth is `Docs/Web app UI mockups MFs.pdf` and its screenshots; where an older document disagrees, the PDF wins, but tell me about the conflict and never edit an existing document without asking. The app is moving from today's top navigation bar (tab state in `MainDashboardFlow`, no router) to a LEFT SIDEBAR "shell" with a top bar. Two people build different pages in separate branches and PRs merged into `feat/leapswitch-staging`, so the shell is defined by a CONTRACT every page plans against.

READ FIRST: `Docs/orchestration/2026-10-22-nav-shell-contract-v1.md` (contract v1.2 and the URL map). Do not plan or build the sidebar, router or top bar; they are one separate shell PR (`feat/shell-nav`) with its own plan. Your job is the page(s) I name.

OUT OF SCOPE, DO NOT TOUCH: (1) MOBILE: no mobile design, routes, bottom bar or mobile views; mobile stays exactly as it is. (2) EXISTING SCREENS (Dashboard, History, Analytics, Scenarios, Profile, import): do not change, rebuild or split them; the shell only wraps them unchanged. (3) Themes: light and dark only; no other accessibility rules.

WHAT THE SHELL IS.
1. Three levels. Level 1, main sidebar: Home, Portfolio, Liabilities, Planning; footer Profile and Help & Support. Level 2, Portfolio mode (any path under /portfolio): Back, Investments, Equity (an expandable group with Direct Stocks, Mutual Fund, US Stock, FDs & bonds; not a page itself), Debt, Gold, Real Estate, Others. Clicking Portfolio opens Investments. Level 3, in-page menus (for example the Mutual Funds tabs) belong to the page.
2. The URL map is fixed and every screen has its final path (for example /home, /portfolio, /portfolio/mutual-funds/holdings, /portfolio/mutual-funds/funds/:schemeId, /planning/scenarios, /profile, /import). Placeholder "Coming soon" pages exist at all of them. Never invent a path; ask.
3. A page joins by one file: `frontend/src/shell/routes/<route-id>.route.tsx` (id, path, label, icon, section, order, parent, layout, scope, status live|placeholder, title, lazy page). You replace the page in YOUR file and set status to live. You never edit the sidebar, router, other route files, or your route's path, id, label, icon, section or order.
4. The shell gives every page: `useScope()` (viewMode aggregate|member, memberId, members, selectedMember, scopeKey, setMember, setAggregate, refreshMembers), `<PageLayout title subtitle actions tabs />`, `paths` (always link through it), `AppLink` and `useAppNavigate`, `useImport()`, `PageState`, `MiraComingSoonDialog`, and `renderInShell(ui, { path, scope })` for tests.
5. A link to a page whose status is placeholder renders DISABLED ("Coming soon") and turns on automatically when that page goes live.
6. Top bar: search, Ask Mira, family selector, theme toggle. No avatar. Search is one box with three groups (your funds, all funds, Ask Mira); in the first version it opens the "Mira, coming soon" popup.
7. Landing: after login, Home; after sign-up: authentication, onboarding, CAS upload, then Home. Auth, onboarding, consent, deletion and the maintenance banner stay outside the shell, unchanged.

WHAT I NEED WHEN YOU PLAN A PAGE. Put a "Shell integration (contract v1.2)" section in the plan using the template in section 8 of the contract. State the contract version you assume. If the page needs something the contract does not offer, do not work around it: describe the gap and propose a small `shell:` change for me to approve. Mark anything that depends on the contract's open decisions (section 10). Follow the project rules: reuse existing code and tables first and justify any new table; run only the test files a change touches; no live network in tests; do not build until I say go.

DO NOT build, scaffold, install dependencies or edit files until I say go. Do not change the URL map or route fields. Do not commit or push. If anything in the contract looks wrong or conflicts with the PDF or the code, stop and tell me.
```

## For the person sending this

- Send the contract file alongside the brief, or tell the other session its path (`Docs/orchestration/2026-10-22-nav-shell-contract-v1.md`). The brief tells Claude to read it.
- If the contract changes, update its version and change log; the brief only needs editing if the summary points above change.
