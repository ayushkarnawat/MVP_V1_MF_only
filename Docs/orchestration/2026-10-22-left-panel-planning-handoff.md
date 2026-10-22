# Handoff: planning the left sidebar (navigation shell) with a new Claude account

**Written:** 2026-10-22, by the previous Claude account, for the Claude account that will continue the **left sidebar / navigation shell planning**. **Not committed on purpose** (the product owner asked for that). Repo: `MVP_V1_MF_only`, branch `feat/leapswitch-staging`. Planning only; nothing is built.

**How to use this file:** read it fully before replying to the product owner. Section 6 says what to do first. Section 8 explains how to build the planning artifact so it looks and works like the previous one.

---

## 1. Who and what

- **Product:** Unifolio, a mutual-fund portfolio tracker for India (FastAPI backend, React 19 + Vite 8 + Tailwind 3.4 frontend, Postgres in staging). Read `AGENTS.md` and `CLAUDE.md` in the repo root first and follow them.
- **People:** the product owner (Aditi) is building the **Portfolio Snapshot (Home) screen**. A manager is building **all other pages**. They work in separate branches and PRs, merged into `feat/leapswitch-staging`.
- **Why the shell matters:** the new UI has a **left sidebar** that every page lives inside. The owner's worry: Home is theirs, the other pages are the manager's, so how and when is the sidebar built and how do the pages connect to it? The agreed answer is a **shell contract** that both sides plan against (section 4).
- **Source of truth for the new UI:** `Docs/Web app UI mockups MFs.pdf` (31 pages) and the owner's screenshots. Where an older document (PRD, ADR, schema) disagrees, **the PDF wins**, but say so and **never edit an existing document without asking first**.

## 2. Working rules and preferences (learned in this project)

1. **Never commit or push unless the owner asks.** Commits so far were each explicitly requested. Nothing has ever been pushed.
2. **Planning is not a go.** Answering questions in an artifact is not approval to build. Build only on an explicit "go".
3. **Ask before assuming** anything the docs mark as open; **stop and say so when two documents conflict**.
4. **Reuse first.** When proposing a new table, job or dependency, lead with the reuse-existing alternative and justify the new one.
5. **Run only the tests a change touches**; no live network in tests; the repo blocks real HTTP in tests.
6. **Deliverables:** reports and plans go to `Docs/orchestration/` as `.md`. The owner also asks for **Artifacts** for planning workbooks (section 8).
7. **Be economical.** The owner was repeatedly low on usage. Prefer short, targeted work; do not spawn many agents; avoid re-reading large files.
8. **Tone and wording:** plain language, short sentences, no jargon; say what is verified and what is an estimate. Give a recommendation with reasons, not a menu.
9. **Do not touch mobile and do not change existing screens** (decisions L29, L30 below).
10. The owner's **planning flow** for everything (their words, F4 note): (1) functionality and backend research (what is reused vs built new, with database/ER diagrams); (2) layout (not UI/UX): app flow, diagrams, flow charts; (3) section-wise docs (design systems, utility, reused vs new, UI mockups); (4) tie into a TDD (technical decisions doc), architecture and architectural decisions doc, PRD, flow doc, backend decisions doc; (5) combine into an artifact with any new open questions; (6) writing plans; (7) Claude-Codex execution.

## 3. What happened so far (chronological summary)

1. **PDF analysis.** All 31 pages read; Home mockup analysed element by element; differences between PDF text, mockup images and the owner's notes tabulated. (Pages 10, 11, 14, 20, 22, 23, 28, 29, 31 are images; 9, 10, 14, 28, 29, 31 were viewed later.)
2. **Portfolio Snapshot planning workbook** (an Artifact, private to the previous account): PDF and mockup analysis, codebase recon, news research, about 48 question cards with options, recommendation, why and risk, locked decisions L1-L39, replies to the owner's notes, a delivery plan, risks, a conversation log. The owner answered 47 of 48 cards; answers are stored in the artifact's own database.
3. **News research** (for the Home news card): four parallel research runs; conclusion: Google/Bing RSS and publisher RSS are not licensed for commercial use; **GDELT raw files are the only news source for now** (free, commercial-use licence, worked in tests); a paid API is a possible later option. Integration plan, update rules, cost and effort written into that workbook.
4. **Shell strategy** (the part you continue): shell first, one small PR, route registry, contract that pages plan against (section 4). The owner agreed to write the **contract and URL map first**, let the manager plan against it, and write the **shell plan** (one overall plan, not per page) afterwards.
5. **Documents written and committed locally** (not pushed): the shell contract v1.1, a brief for other Claude sessions, and an architecture draft (section 5).
6. **A filesystem outage** (WSL lost the `/mnt/c` drive for a long stretch) cost some working files; recovered by `wsl --shutdown` and rebuilding from the conversation.
7. **Still running or unfinished at handoff:** see section 7.

## 4. The shell contract in brief (the full text is in the repo)

Read `Docs/orchestration/2026-10-22-nav-shell-contract-v1.md` (v1.1) in full. Summary:

- **Navigation model, three levels.** L1 main sidebar: Home, Portfolio, Liabilities, Planning; footer Profile and Help & Support. L2 Portfolio mode (any path under `/portfolio`): Back, Investments, Equity, Debt, Gold, Real Estate, Others. L3 in-page menus (for example the Mutual Funds tabs Overview, Performance, Allocation, Holdings, Transactions, Overlap, Other Analytics) belong to the page, not the shell.
- **URL map** fixed for all screens (about 28 routes), with placeholders at every path from the shell's first merge.
- **Route module:** one file per page, `frontend/src/shell/routes/<route-id>.route.tsx`, scanned with `import.meta.glob`; fields id, path, label, icon, section, order, parentId, layout (app or focus), scope, status (`live` or `placeholder`), title, lazy page. Placeholder links render disabled until a page goes live (decision L32).
- **What the shell gives pages:** `useScope()` (family-or-member), `PageLayout`, `paths`, `AppLink`/`useAppNavigate`, `useImport()`, `PageState`, `MiraComingSoonDialog`, `renderInShell`.
- **Page owners** touch only their own route file and feature folder; shell changes are separate `shell:` PRs.
- **Open decisions (with recommended defaults):** O1 router library (DECIDED 22 Oct: react-router v7); O2 how instrument pages (Mutual Funds, Stocks) relate to asset-class pages (Equity, Debt, Gold ...); O4 scope in the URL (no); O5 Planning sub-menu (none); O6 Liabilities (placeholder); O9 Back destination (last non-Portfolio screen, default `/home`); O10 Profile sections as routes (later); O11 Help & Support (placeholder). **Closed:** O3, O7, O8 (mobile out of scope), O12 (existing screens wired by wrapper files only).

## 5. Files in the repo

Committed locally on `feat/leapswitch-staging` (never pushed):

| File | Commit | What it is |
|---|---|---|
| `Docs/orchestration/2026-10-22-nav-shell-contract-v1.md` | b0c3566 | The contract v1.1 and URL map |
| `Docs/orchestration/2026-10-22-nav-shell-claude-session-brief.md` | b0c3566 | Paste-ready brief for other Claude sessions (contract v1.1) |
| `Docs/orchestration/2026-10-22-nav-shell-architecture.md` | b0c3566 | In-depth router and shell structure: as-is wiring, target structure, folder layout, scope provider, wrapper table for existing screens, what changes, build sequence, risks (Mermaid diagrams) |
| `Docs/orchestration/2026-10-22-portfolio-snapshot-decisions.html` | 0420b36 | An **old** export of the Portfolio Snapshot workbook (stale: before the reply boxes and later answers) |

Untracked (not committed): `Docs/Web app UI mockups MFs.pdf` (the mockups), this handoff, and `Docs/orchestration/2026-10-22-left-panel-handoff-artifact-template.html`, a copy of the **latest** workbook page (version 14) to use as the artifact template (section 8).

## 6. What you should do first

1. Read, in this order: `AGENTS.md`, `CLAUDE.md`, this handoff, the contract, the architecture draft, then skim the PDF pages 2-3, 9, 12-19, 21-31 (render with PyMuPDF; `pdftoppm` is not installed; install into a scratch folder with `pip install --target <dir> pymupdf`).
2. **Brainstorm first**, in conversation, before any artifact: ask the owner the questions below, one or two at a time, with your recommendation, in plain language. Do not build, scaffold or install anything.
3. After the brainstorm, research what is needed, then **create the artifact** (section 8) containing the research, the plans and the open questions, and let the owner answer in it.

**Questions to brainstorm (all have a recommended default in the contract):** O1 to O11; whether the shell PR also builds the search box (the search spec, D1 to D6, is in the Portfolio Snapshot workbook; recommendation: the shell ships a box that only opens the Mira popup, and real search is built with the fund page); the exact sidebar visual design (width, collapsed or not, active state, grouping, icons from `lucide-react`); the top bar layout; the page layout and header; how the Back button in Portfolio mode behaves in edge cases (deep link straight into `/portfolio/...`, refresh); the test strategy for the shell; the PR slicing and review rules (CODEOWNERS or both owners); how the manager's branches rebase when the contract changes; what the shell PR must NOT do (existing screens untouched, mobile untouched, backend untouched).

**Research the plan will need** (verify; do not assume): the chosen router library's current major version and the API used in the architecture draft (declarative mode, `NavLink`, `Outlet`, lazy routes with `Suspense`); that `import.meta.glob` works as assumed with the installed Vite; how Vitest should mount routed components; the exact props each existing screen needs (the architecture draft has a table, verified from `MainDashboardFlow`); a check that nothing else uses `window.history` or hash routing besides `MainDashboardFlow` and the `/mobile` detection; hosting (already verified: Caddy `try_files {path} /index.html` and CloudFront 403/404 to `/index.html`).

**Deliverables the owner expects from this planning round:** the brainstorm; a research summary; the **one overall shell implementation plan** (steps, files, PR slices, tests, risks, effort estimate labelled as an estimate); and an artifact with all of it plus open-question cards. The earlier plan was: contract and URL map (done), page planning in parallel, then the shell plan, then execution only when the owner says go.

## 7. State of the Portfolio Snapshot work (context; not yours to finish)

The owner's Home planning is largely decided. Decisions that affect the shell: **L7** navigation follows the PDF (Home, Portfolio, Liabilities, Planning, Profile, Help & Support); **L29** router yes, mobile out of scope and untouched; **L30** existing screens not changed, rebuilt or split; **L31** no avatar in the top bar; **L32** links to unbuilt pages disabled; **L33** light and dark only, no other accessibility rules; **L35** landing flow (login to Home; sign-up through onboarding and CAS upload to Home); **L38** existing screens wired in by wrapper files only; **L39** the search box does all three (your funds, all funds, Ask Mira).

Unfinished on the Home side at handoff (belongs to the previous account or later): the F1 measurement of Home-like computations on the largest synthetic statements (an agent was running; its report, if it finished, is at `/tmp/claude-1000/-mnt-c-Users-Dell-Desktop-MVP-v1-MVP-V1-MF-only/work/home-research/measure.md`, and `/tmp` may have been cleared); the sector view accuracy research (B1: pro-rata attribution cannot show offsetting losers, so a credible sector view needs sector index returns); the definition of "connected" family members (B3: members with a confirmed import, `has_data`; PAN stored encrypted); the Nifty Smallcap 150 work (B7: native Postgres enum needs `ALTER TYPE ... ADD VALUE`; the daily job iterates every `BenchmarkIndex`, so a new index flows into Analytics tables); the Home versus Dashboard compute map and flow diagrams (F3); the E12 news priority ladder (the owner will brainstorm); the shell contract's open decisions.

## 8. How to build the planning artifact so it looks and works like the previous one

The previous artifact (title "Portfolio Snapshot Decisions") is **private to the other account**, so you cannot open its link. Use the template file `Docs/orchestration/2026-10-22-left-panel-handoff-artifact-template.html` (the latest published page). Reuse its **styles, structure and script**; replace the content with the left-panel planning. Do not copy Portfolio Snapshot content.

**Look.** One HTML page with a sticky contents rail on the left and a single reading column. Design tokens at the top (`:root`) with light and dark values; fonts Bricolage Grotesque (headings), DM Sans (body), DM Mono (labels and ids). Components: hero with two "rule" boxes (source of truth, scope); tables in scrolling containers; `details` blocks for long research; callout boxes; a boxed one-minute summary; decision cards.

**Sections used (adapt):** where we are; research (PDF, code, current wiring); decisions you made (locked cards, ids L1...); section blueprint; a sticky filter bar (All, Unanswered, Answered) with an "X of N answered" counter and a "saved" note; the open-question cards; the delivery plan; risks; things to verify; conversation log; glossary; "Your answers" with a **Copy my answers** button.

**Question cards (the key pattern).** Each card has: id and title, a plain question, context, **options** (letter, label, detail; the recommended one tagged), **Why I recommend X**, **If this goes wrong**, a **Use recommended** and a **Reset** button, and a free-text note. Questions live in a JS array `Q` of groups with items `{id, t, ask, ctx, opts:[{k,l,d}], rec, why, risk}`. Locked decisions live in an array `LOCKED` of `[id, title, text]`. Replies to the owner's notes live in a map `REPLIES` keyed by question id and render as a green "Reply to your note" box under the card.

**Saving answers (must keep).** The page declares `capabilities: {"db": {}}` when published and stores one document `answers/main` shaped `{ state: { "<questionId>": { c: "<option letter>", n: "<note>", t: <timestamp ms> } }, updatedAt }`. It also mirrors to `localStorage`, merges the two by the per-question timestamp `t`, and shows a small "saved" status. The owner's answers are therefore kept when the page is closed and when you republish. **Never renumber or reuse question ids**; a removed question's stored answer simply stays unused. Read answers with the `ArtifactData` tool (`get` on collection `answers`, doc `main`, with `out_dir` to save the JSON); write only with the owner's go and pin `if_version`.

**Publishing mechanics (lessons).**
- Write the page content **without** `<!doctype>`, `<html>`, `<head>`, `<body>`: the Artifact tool wraps it. Put `<title>` and the `claude:viewport-fit-sides` meta at the top.
- Publish with the Artifact tool, passing `capabilities: {"db": {}}` on the first publish (later publishes carry it forward). Use a stable `file_path`; edit the file with the Edit tool and republish the same path.
- To update an existing artifact from a fresh session: `Artifact read` the url (no `path`), then publish. If you start from the saved copy, strip the skeleton (everything outside `<body>...</body>`) first.
- Load the `artifact-design` and `artifact-capabilities` skills before writing; they carry the page contract (theme tokens for light and dark, external script and font rules, responsive gutters). Use Mermaid for diagrams (`<pre class="mermaid">`), which renders natively.
- Keep copy plain: no em-dash asides, no "not X, but Y" framing, no jargon. Mark every claim **verified** or **estimate** or **unverified**.
- Do not change how answered cards look when only recording answers; add replies in the reply box instead.

## 9. Things that went wrong, so you avoid them

- **Working files in `/tmp` can disappear** after a session resume or WSL restart. Keep anything important in the repo (uncommitted is fine) or in the artifact; do not rely on `/tmp`.
- **Do not trust an agent's number you have not seen evidence for.** Several research claims were first-pass and later corrected (for example the Google News licence, and the benchmark history limit: the daily job already stores total-return history from 1990).
- **Nothing is pushed.** The manager cannot see the local commits until the owner pushes; ask before pushing.
- **Mobile and existing screens are off limits** even when it would be convenient.
- **Search box:** the fund page does not exist yet and links to unbuilt pages are disabled; do not promise a working search before that page exists.

## 10. Quick reference

- Contract: `Docs/orchestration/2026-10-22-nav-shell-contract-v1.md`; brief: `...-nav-shell-claude-session-brief.md`; architecture: `...-nav-shell-architecture.md`.
- Current desktop shell code: `frontend/src/App.tsx`, `features/dashboard/MainDashboardFlow.tsx`, `NavigationShell.tsx`; mobile: `frontend/src/mobile/**` (do not touch).
- Verified facts: top navigation bar today (tabs Dashboard, History, Analytics, Scenarios, Profile); no router library; family-or-member state lives in `MainDashboardFlow`; "Add data" is a full-screen mode there; `main.tsx` already routes `/print/analytics` and the legal pages around `App`; only `App.test.tsx`, `MainDashboardFlow.test.tsx`, `NavigationShell.test.tsx` reference the current shell.
- Dev database `backend/unifolio_dev.db` is old (migration 0017) and has no disclosure tables; do not use it for anything that needs disclosures.


## Update, 22 Oct (after the handoff was written)

The open decisions O1 to O11 were answered by the owner and the contract is now v1.2 (commit 8476835): react-router v7; Equity is an expandable group (Direct Stocks, Mutual Fund, US Stock, FDs & bonds), not a page; Portfolio opens Investments; no scope in the URL; no Planning sub-menu; Liabilities placeholder; Back goes to the last non-Portfolio screen; Profile sections later; Help placeholder. Where the text above lists O1 to O11 as open or says Equity is a page, this update wins. Still to confirm: whether FDs & bonds belongs under Debt, and that Mutual Fund and US Stock are two items. Also decided since: E12 news ladder (L40, L41), B3 (L42); B1 sector options, the B7 Smallcap 150 doubt (index may not exist at NSE) and F1 measurements are in the planning artifact (version 17).
