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

## 9. Progress update (documents phase, 2026-10-23, second account)

Owner's pasted card answers received (differ from recs: E11 B, E14 B, E15 B, E3 B, E8 C, G4 plain light/dark). Contract assumptions confirmed: FDs & bonds under Equity; Mutual Fund and US Stock separate.
Written (uncommitted, `2026-10-23-` prefix): home-functionality-backend-spec, home-layout, home-design-system, home-reuse-vs-new, home-tdd, home-architecture, home-prd, home-flows, home-backend-decisions-proposal. Equity patches to the shell architecture were already present on disk; none made. Not done: pixel/icon mockups (after owner approves doc 3), combined artifact (4 small open questions Q1-Q4 in the spec, section 13, may be asked inline instead), writing-plans (gated on Q1-Q4 and owner go). Artifact db at the live URL is not readable from this account (404).

## 10. Answers round 2 (2026-10-23)

H1-H25 and M1-M17 answered. Differences from the recommendations: H6 extend retention, H14 staging run before plans lock, H20 add basic tracking, H24 news in the same release, M17 greyed links (L32 stands); H3 no choice (default 0.05%). Docs updated; search-on-hold lines added to the contract and shell architecture (approved). New follow-ups N1-N6 are in the mockup artifact (retention length, staging run, tracking scope, tracking storage and privacy, news gating, which PRD-03 copy gets the version note; PRD-01 was a mistake, the landing statement is in PRD-03). Not yet done: append BD1-BD16 to decisions.md and update the schema doc (approved, waiting for N-answers), plans (blocked on the staging run per H14).

## 11. Answers round 3 (2026-10-23)

N1 6 months; N2 script `backend/scripts/measure_home_staging.py` prepared (read-only; imports verified, not run: the local dev database is not migrated; the owner runs it on the VM and pastes the output; plans wait for it); N3 seven events; N4 Google Analytics 4, plan in `2026-10-23-home-tracking-ga4-plan.md` (own table and endpoint withdrawn); N5 news live from day one; N6 note on both PRD-03 copies, wording in `2026-10-23-prd-03-version-note-draft.md`, shown to the owner first. New follow-ups P1-P8 (consent, identity, GA properties, Google settings, page view, policy copy, compute_holdings allow_stale_today, who creates the GA properties). Finding: `compute_holdings` has no allow-stale-today parameter (only `get_nav_on_or_before` does).

## 12. Deferred to the final "all doc update" pass (owner, 2026-10-23)

- Apply the PRD-03 version note to **both** copies: `Docs/PRD-03-Main-Dashboard.md` as version 1.1 (history stops at 1.0; add the resolution line under its still-open landing question) and `Docs/PRDs/PRD-03-Main-Dashboard.md` as version 1.4 (history reaches 1.3; add the line after the existing resolved landing question). Wording: `2026-10-23-prd-03-version-note-draft.md`. Not applied yet.
- Append BD1-BD16 to `decisions.md` and add the new table and columns to `Database-Schema-Unifolio.md` (approved; wait for P1-P8 answers).
- Still blocking the plans: the staging measurement output (`backend/scripts/measure_home_staging.py`, run on the VM) and answers to P1-P8.

## 13. Event tracking deferred (owner, 2026-10-23)

Tracking is out of the Home release. Logged as PRIORITY 2 in `DEFERRED_FEATURES.md` (uncommitted edit). Docs updated to say deferred (spec 9a, PRD H15 and section 6, BD14, TDD, reuse-vs-new, architecture, GA4 plan header). Artifact questions P1-P6 and P8 are therefore not needed now; P7 (compute_holdings allow_stale_today) is still open. Plans no longer include tracking or the consent-purpose change.

## 14. Staging measurement result (2026-10-23)

Run by the manager on the staging VM (three households, 12 to 46 funds). Home cold open FAILS the 1.5 s budget (4.9 to 24.3 s) because the NAV freshness check re-downloads every fund's history on every cold holdings call until today's NAV is published (never, on weekends and holidays). Warm holdings 0 ms; look-through, allocation and bulk NAV reads (1 year) are fine. Details in the spec section 2. The script's "read-only" guard missed the NAV cache insert (a Core statement), so the run wrote nav_history cache rows on staging (harmless, on_conflict_do_nothing, same as opening the Dashboard); guard fixed and a `--simulate-fresh-cache` flag added (imports verified, not run). The VM was fast-forwarded to commit 6e17132 and its backend image rebuilt (live containers not restarted). New open question P9: fix the freshness rule in nav.py (existing production code, helps the Dashboard too) as well as P7. Plans wait for P7 and P9.

## 15. P7 and P9 simplified (owner, 2026-10-23)

P7 is now a yes/no: Home uses the prices the 06:00 job already stores, no new jobs or tables, plus one small optional setting on compute_holdings. P9 is now a yes/no: fix the Dashboard too (recommended: no, log it as a known gap).

## 16. P7 and P9 answered (owner, 2026-10-23)

P7 A: Home uses the prices stored by the 06:00 job (small optional setting on compute_holdings, no new jobs or tables). P9 A: the Dashboard is left as is; the slowness is logged in DEFERRED_FEATURES.md (uncommitted). All planning questions are now answered. Remaining: the final all-docs update (PRD-03 notes 1.1 and 1.4, BD1-BD17 into decisions.md, schema doc) and the four plans, which the owner will ask for.

## 17. Plans written (owner go, 2026-10-23)

Four plans in `Docs/superpowers/plans/`: `2026-10-23-nav-shell-plan.md`, `2026-10-23-home-backend-plan.md`, `2026-10-23-home-frontend-plan.md`, `2026-10-23-news-plan.md` (uncommitted). Implementation still needs the owner's explicit go. Remaining doc work: PRD-03 notes (1.1 and 1.4), BD1-BD17 into decisions.md, schema doc, final review of the plans.

## 18. Shell is built separately (owner, 2026-10-23)

The left panel and shell are NOT part of this work. `2026-10-23-nav-shell-plan.md` is kept as a reference banner-marked plan for whoever builds it. The Home frontend plan connects to the panel only through the contract v1.2 route file, with a local adapter and stub until the shell exists. Active plans: Home backend, Home frontend, news. The earlier answers H23 (four plans) and H25 (shell first) are superseded.

## 19. Original four-plan strategy reinstated (owner, 2026-10-23)

Section 18 is superseded: the shell is built in this effort again. Order: shell PR 1, then in parallel the Home backend, news backend and shell PR 2, with Home frontend stacked on PR 1; Home and shell PR 2 release together. The shell-plan banner is removed; the Home frontend plan depends on shell PR 1 again (the adapter and stub are an optional fallback only).

## 20. Who builds the shell (owner, 2026-10-23)

The owner will build the shell (left panel, router, scope provider) themselves, following `Docs/superpowers/plans/2026-10-23-nav-shell-plan.md`. Still to settle by the owner as the shell builder: active-row style (green pill versus 2 px underline) and the plural versus singular menu labels. Home work (backend, news, frontend) starts only on the owner's explicit go.
