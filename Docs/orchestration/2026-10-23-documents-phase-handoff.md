# Handoff: documents phase for the redesigned desktop web app (Home + shell)

**Written:** 2026-10-23, by the account that finished the planning/research phase. **For:** the owner's other Claude account. **Status:** planning-phase questions are all answered and frozen; the documents phase has NOT started; nothing is built. This file is deliberately not committed.

## 1. Who and what

The owner (Aditi, product owner; a manager builds other pages) is redesigning the DESKTOP web app of Unifolio (Indian mutual-fund tracker; React 19, Vite 8, Tailwind 3.4, lucide-react, vitest; FastAPI + SQLAlchemy; SQLite local, Postgres staging on a LeapSwitch VM). Source of truth: `Docs/Web app UI mockups MFs.pdf` (untracked in the repo; wins over older docs; tell the owner about conflicts, never edit an existing doc without asking). Read `AGENTS.md` and `CLAUDE.md` first.

## 2. Rules (from the owner; all still in force)

- Never commit or push unless told. Do not commit this handoff. Do not implement anything until the owner says go; answering questions is not a go.
- Mobile is out of scope and untouched. Existing screens (Dashboard, History, Analytics, Scenarios, Profile, import) are not changed, rebuilt or split: only thin wrapper route files.
- The owner is low on usage: be economical, batch work, prefer Sonnet-class defaults, run only affected tests, no full suites. Lead schema proposals with the reuse-existing-tables alternative.
- A new Claude session must use the `superpowers:writing-plans` skill for the plans, and `task-observer` per CLAUDE.md (invoke it at session start).

## 3. The frozen decision record (read this first)

The planning artifact, stored in the repo as HTML: `Docs/orchestration/2026-10-23-portfolio-snapshot-decisions-v20.html` (live version: `https://claude.ai/artifact/Hg7j92jMRCJqdsJw6ENQc5`, version 20). It contains the full research (PDF page by page, mockup element by element, code reconnaissance, news research with appendix), 40+ question cards with replies, the F1 measurements, the B7 and F3 write-ups, and the **locked decisions L1 to L47** (the `LOCKED` array in the HTML). Open the HTML in a browser or read the `LOCKED` and `REPLIES` blocks in the file. Saved card answers live only in the live artifact's database; the replies and decisions in the file are the record.

Decisions frozen on 22 Oct (all in the artifact): E12 news ladder (L40, L41), B3 wording "Data from n of n family members" meaning "2 of 4" style counts (L44), B7 add Nifty Smallcap 250 (L45), search bar ON HOLD (L46: nothing built or planned for search; its spec and D1 to D6 stay recorded, not acted on), B1 pro-rata sector split now, index-informed version deferred (L47, logged in `DEFERRED_FEATURES.md`, uncommitted), shell contract v1.2 answers (L43).

## 4. Shell contract (committed)

`Docs/orchestration/2026-10-22-nav-shell-contract-v1.md` is **v1.2** (commit 8476835): react-router v7; three-level navigation; Equity is an expandable group (no page) with children Direct Stocks, Mutual Fund, US Stock, FDs & bonds; clicking Portfolio opens Investments (`/portfolio`); no member in the URL; no Planning sub-menu; Liabilities, Help placeholders; Back returns to the last non-Portfolio screen; Profile sections as routes later. Companion docs: `2026-10-22-nav-shell-architecture.md` (committed; **still needs the small Equity-group patches** the owner rejected on 22 Oct: Sidebar and registry notes, build step 3, router-version risk row) and `2026-10-22-nav-shell-claude-session-brief.md` (committed, v1.2). Contract assumptions still to confirm with the owner: FDs & bonds under Equity (reads like Debt) and Mutual Fund and US Stock as two items. The contract still shows the search box in the top bar; add a one-line "search on hold" note if the owner agrees.

Older handoff `2026-10-22-left-panel-planning-handoff.md` (uncommitted) is partly stale (it lists O1 to O11 as open); its "Update" section may or may not exist; trust this file and the contract instead.

## 5. What the owner asked for next: the documents phase

Produce, in this order, planning documents for the Home screen and shell (mutual funds only; family-combined first; web desktop only), then a combined artifact for any remaining open questions, then implementation plans:

1. **Functionality + backend spec** (per section 1 to 8 of Home, endpoints, calculations, jobs, tables: reuse-first, justify any new table).
2. **Layout doc** (page and section layout on desktop, states: loading, empty, partial data, error; family vs member scope).
3. **Section-wise design system + utilities + UI mockups** (tokens, components, chart components needed, mockup per section; note there is no line/area chart component yet, `d3-shape` is installed).
4. **Reuse versus new**, with how each new piece is built.
5. **TDD** (test design per section and for the shell; affected tests only).
6. **Architecture doc** (extend the existing shell architecture; add Home).
7. **PRD** (Home; follow the repo's `Docs/` PRD style; ask before editing existing PRDs, PRD-01 etc. may need a version note).
8. **Flow docs** (user flows, compute and trigger flows for Home versus Dashboard; the F3 flows are in the artifact's F3 reply).
9. **Backend decisions** (append-only style in `decisions.md` only with the owner's go; otherwise a proposal doc).
10. **Combined artifact** (only if new open questions arise; follow the same recipe: answers saved in the artifact db, question ids never renumbered).
11. **Writing plans** with `superpowers:writing-plans`, once all questions are resolved.

Put new documents under `Docs/orchestration/` with the `2026-10-23-` style prefix unless the owner says otherwise. Raise any PRD/ADR/schema conflict with the owner before resolving it.

## 6. Key technical facts to rely on (verified; details in the artifact)

- **Home compute (F1/F3):** Home = thin endpoints over `compute_holdings` plus reads of stored Analytics sections (never starts a recompute); Dashboard computes only when its page opens. Measured offline: daily value series built from one bulk NAV read 8 to 240 ms (naive per-fund-per-date build 1.2 to 29 s, so forbidden); day-change contributors 5 to 20 ms; benchmark 1 to 8 ms; XIRR is the slow part (0.7 to 1.0 s), so cache or load lazily; snapshot rebuild 0.3 to 0.9 s, not on load. Target first load about 1.5 s. Unmeasured: live fund-price fetches (holdings code re-downloads full NAV history when no row is dated today; `allow_stale_today` exists), real look-through timing. Risks: holdings cache is per worker (3 workers), opening-balance route does not invalidate the holdings cache.
- **B1:** pro-rata sector attribution of each fund's exact rupee day change by sector weight; reconciles to the headline; labelled "estimated"; holdings coverage under 50% falls back to the category view.
- **News (section 5 and appendix of the artifact):** GDELT raw GKG 15-minute files only; one new job `refresh_news.py`, three cron lines, one new table `news_items` (migration 0044), per-user scoring at request time, update rules and the E12 ladder (L40, L41), top five per kind plus the minimum-size rule, credit on the About/legal page. A lawyer's review before launch and a one-to-two-week dark launch were the recommendations.
- **B7:** add a value to the `BenchmarkIndex` enum, a Postgres `ALTER TYPE ... ADD VALUE IF NOT EXISTS` migration (pattern in 0006), one line in `_TRADING_INDEX_NAME` in `nse_indices_client.py`; confirm the exact NSE trading name via NSE's index discovery API first (niftyindices.com was unreachable from the earlier sandbox); tests asserting exactly four indices will need updating; sector indices must not join this enum.
- **B3:** "connected" means at least one confirmed `Import` (`_has_data` in `dashboard/aggregate.py`).

## 7. Still open or unwritten at handoff

- Two contract assumptions above (FDs & bonds placement; Mutual Fund and US Stock as two items); Liabilities assumed a placeholder.
- E3 icon mockups (next artifact, not started). F1 live fund-price fetch cost needs a staging run. B7 trading name unverified.
- Architecture-doc Equity patches (section 4); "search on hold" note in the contract; `DEFERRED_FEATURES.md` addition uncommitted.
- Everything in section 5 is not started.

## 8. Practical notes

- **Check `git status` and `git log` before relying on the next list:** another session was seen working in this same tree right after this file was written (commit 8b3f037 added the left-panel documents, and the contract, brief, architecture and left-panel plan had new uncommitted edits that this account did not make). Treat what is on disk as current.
- Working tree: `/mnt/c/Users/Dell/Desktop/MVP v1/MVP_V1_MF_only` on branch `feat/leapswitch-staging`. Uncommitted when this account stopped (may have changed): the PDF, this file, the artifact HTML copy, the older left-panel handoff and its artifact template, and the `DEFERRED_FEATURES.md` change. Only the contract/brief/architecture changes (up to 8476835) are committed.
- The scratchpad under `/tmp` gets wiped between sessions; to edit the artifact, `Artifact read` the URL, then Read the saved file before Edit, and republish with the same file path (capabilities `{"db":{}}` carry forward).
- Memory index notes exist at `~/.claude/projects/-mnt-c-Users-Dell-Desktop-MVP-v1-MVP-V1-MF-only/memory/` (including `project_home_snapshot_planning.md`).
