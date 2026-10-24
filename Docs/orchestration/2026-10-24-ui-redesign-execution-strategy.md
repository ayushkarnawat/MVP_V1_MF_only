# UI redesign — combined execution strategy, gaps and run count

> **Revision 2 (24 Oct, after the owner's answers).** Branch is **`leapswitch-redesign`**; link is **`ls-redesign.unifolio.in`** (read from the dictated "newfolio"; change if wrong). All gap defaults accepted except where §4a overrides them. Repo-side deploy files are written (uncommitted); the detailed plan is `Docs/superpowers/plans/2026-10-24-deploy-redesign-plan.md`; owner-only steps are in `2026-10-24-ui-redesign-manual-steps.md`. The branch/PR model in G12 is replaced by §4a.

**Written:** 2026-10-24. **Status:** strategy + gap list for the owner's review. Nothing is built, nothing committed.
**Inputs read:** every plan, contract and spec committed 2026-10-22 → 2026-10-24 (shell contract v1.5; shell PR1/PR2 plans; Home backend/frontend/News plans; Portfolio ("Investments") page plan; Profile plan; Individual Fund backend/frontend plans; Planning backend/frontend plans; PRD-06 + Mutual Funds restructure/TDD specs, redesign handoff, cross-cutting audit), plus `deploy/leapswitch/*` for the second-link question.

---

## 1. New branch and second link — research result

**Yes, it works, with small additive changes and four caveats.**

### Branching
- Integration branch **`leapswitch-redesign`**, cut from `feat/leapswitch-staging`. Page work is done on sub-branches named in the plans (`feat/shell-nav`, `feat/home-snapshot`, `feat/individual-fund-page`, …) cut from `leapswitch-redesign`, and merged **into `leapswitch-redesign`** after review. Nothing touches `feat/leapswitch-staging` until the owner approves the final merge.
- Because `feat/leapswitch-staging` keeps moving (factsheet Priority 1, Scorer V2, hotfixes), every run starts with `git merge feat/leapswitch-staging` into `leapswitch-redesign` if it has moved. Never rebase.
- The untracked `Docs/Web app UI mockups MFs.pdf` should be committed on `leapswitch-redesign` (it is the source of truth) — owner's call.

### Second link — what exists today (verified in the repo)
- `deploy/leapswitch/Caddyfile`: two site blocks, `ls-staging.unifolio.in` (static files from `/srv/frontend`) and `ls-staging-api.unifolio.in` (reverse proxy to `backend:8000`). Caddy gets TLS automatically.
- `deploy.sh` builds the frontend in a throw-away `node:20-alpine` container with `VITE_API_BASE_URL=https://$LS_API_DOMAIN` baked in, then `docker compose up -d --build`.
- Auth is a **Bearer token in `localStorage`** (`features/auth/session.ts`), not a cookie. CORS is `ALLOWED_ORIGINS`, **comma-separated** (`main.py:_allowed_cors_origins`).

### Proposed design
| Piece | Change |
|---|---|
| Link | **`ls-redesign.unifolio.in`** (name is the owner's choice) — frontend only. It calls the **same** API `ls-staging-api.unifolio.in`, same VM, same Postgres, same worker, same cron. |
| DNS | One A record → the VM's IP. DNS is in Route 53 on AWS (per the migration plan), so this is a manual owner step. Must exist **before** Caddy is reloaded (Let's Encrypt needs it). |
| Caddyfile | New site block: `root * /srv/frontend-redesign`, same `try_files`, plus `header X-Robots-Tag "noindex"` so the preview is not indexed. |
| docker-compose | One extra read-only volume on `caddy`: the redesign dist folder → `/srv/frontend-redesign`. |
| `.env` | `ALLOWED_ORIGINS=https://ls-staging.unifolio.in,https://ls-redesign.unifolio.in` (no code change). |
| Deploy | New `deploy/leapswitch/scripts/deploy-redesign.sh`: second clone on the VM (e.g. `/opt/unifolio-redesign`, branch `leapswitch-redesign`), builds **only** the frontend into its own `dist`, no `compose up --build` of the backend. Backend deploys stay with the existing `deploy.sh`, run from the redesign clone only when the backend changed (see caveat 2). |
| Google sign-in | Add `https://ls-redesign.unifolio.in` to the OAuth client's authorised JavaScript origins (Google console, owner step). Email/phone OTP needs nothing. |

### Caveats the owner should know
1. **Separate origin = separate login.** `localStorage` is per origin, so testers sign in once on the new link. Same accounts, same data.
2. **One backend serves both links, so backend changes must be additive.** The old UI (and mobile) keep running against the redesign backend. Rule: new endpoints, new nullable columns, new enum values, new fields on JSON — never remove or reshape an existing field (see gap G6). Migrations are forward-only on the one shared DB; the backend image must therefore always be built from `leapswitch-redesign` (a superset), never from an older branch, once a redesign migration has run.
3. **Shared test data.** A wipe (`clean-db.sh`) or an import on one link shows on the other. That is the point, but tell testers.
4. **Mobile browsers** still get the old mobile app on both links (mobile is out of scope; the router mounts only in the desktop branch).

**Final merge:** `leapswitch-redesign` → `feat/leapswitch-staging` by PR (the shell's CODEOWNERS reviewers approve), then a normal `deploy.sh` makes `ls-staging.unifolio.in` the redesign. The redesign link is then deleted (Caddy block + DNS).

---

## 2. What is in the plan set (and what is missing)

| # | Area | Route(s) | Plans | State |
|---|---|---|---|---|
| 1 | Shell (router, sidebar, top bar, scope, wrappers, switch-on) | all | `nav-shell-plan`, `shell-pr1`, `shell-pr2` (+ contract v1.5) | Planned (frontend only). Blocks every page. |
| 2 | Home | `/home` | `home-backend-plan`, `home-frontend-plan` | Planned |
| 3 | Home News | `/home` card | `news-plan` | Planned (backend only; frontend is inside Home) |
| 4 | Portfolio ("Investments") | `/portfolio` | `portfolio-home-page-implementation` | Planned (backend + frontend in one plan) |
| 5 | **Mutual Funds — 7 tabs** | `/portfolio/mutual-funds[/…]` | `mutual-funds-backend-plan`, `mutual-funds-frontend-plan` (24 Oct) | Planned |
| 6 | Individual Fund page | `/portfolio/mutual-funds/funds/:schemeId` | `individual-fund-backend-plan`, `-frontend-plan` | Planned for Overview + Insights tabs only. The Overlap Analysis tab is **not** planned (G2). |
| 7 | Planning | `/planning` | `planning-scenarios-backend-plan`, `-frontend-plan` | Planned |
| 8 | Profile | `/profile/*` | `profile-plan` | Planned |
| 9 | Liabilities, Help & Support, Debt/Gold/Real Estate/Others/Direct Stocks/US/FDs | placeholders | in shell PR1 (route files) | Placeholders only — nothing to build beyond the shell |
| 10 | Second link + deploy + merge-back | infra | `deploy-redesign-plan` | Planned; repo files written |
| 11 | Shared UI kit (charts, tokens, formatting) | — | `shared-ui-kit-plan` | Planned (G5) |

Dependency graph: **Shell PR1 → Shell PR2 → every page's frontend.** Backend work for 2, 3, 6, 7, 5 does not need the shell and can run in parallel with it.

---

## 3. What changes in the backend

**Headline: the redesign is mostly a frontend rebuild. The backend is additive; nothing is rebuilt from scratch except two small jobs/tables.**

| Item | Kind | Size | Owner plan |
|---|---|---|---|
| `compute_holdings`: `allow_stale_today` (stored prices) and `scheme_ids` filter | Change to a hot shared function (cache key, signature) | Small but **risky** — touches the Dashboard's core | Home T1 + Individual Fund T1 (**duplicate**, G3) |
| Home endpoints (`api/home.py`): summary, day-change contributors, sector view, benchmark compare, greeting/data line, watch items | New endpoints over existing tables | Medium | Home backend |
| Home persistent store, retention 6 months | Home plan mentions "retention" and a possible **new table fallback** if the 1.5 s gate fails | Conditional | Home T13/T14 |
| **News**: `news_items` table, `stock_master.nse_symbol` column, `refresh_news.py` job, 3 cron lines, matching/scoring service, GDELT ingest | **New from scratch** (table + job + service) | Medium-large | News plan (migration "0044" per handoff) |
| `BenchmarkIndex` enum + `ALTER TYPE … ADD VALUE` migration + `_TRADING_INDEX_NAME` | Small change | Small | Home T3 (adds Smallcap 250) **and** MF TDD §2.2 (adds Next 50, Smallcap 250, Nifty 100, Nifty 200) — **duplicate** (G3) |
| Windowed (1Y/3Y/5Y/SI) benchmark XIRR + index × window matrix inside the `benchmark`/`benchmark_funds` analytics sections | **New math + changed precompute payload** | Medium; affects recompute time and the stored JSON shape | MF TDD §2.2.1–2.2.2 — **no plan** |
| `sebi_category` on dashboard `HoldingRow` | Additive field | Tiny | MF TDD §2.1 |
| Overlap "excluded funds" count | Possibly free, needs a check of `overlap.py` | Tiny | MF TDD §2.3 |
| Per-fund market-cap aggregation (+ per-fund overlap, fund-vs-fund comparison, Common Holdings by sector) | New endpoint(s) for the Individual Fund Overlap tab | Medium | **No plan** (G2) |
| Portfolio page: instrument-type allocation, portfolio summary, daily value series (3 endpoint pairs) | New endpoints, no table | Medium | Portfolio page plan |
| Individual Fund `/fund-page/{scheme_id}`: summary, folios, performance, returns table, risk, composition, manager, peers, rolling returns, scatter, insights engine | New router + service package, **no table/migration/job** | Large (14 tasks) | Individual Fund backend |
| Planning: additive scenario-API fields, display-group mapping, `by_asset_class`, `member_id` on results route; stored prices (needs Home T1) | Additive | Small-medium | Planning backend |
| Profile: `created_at` on `GET /auth/me` | One field | Tiny | Profile T1 |
| `scheme_master`/`stock_master` etc. | untouched | — | — |

**Migrations in the whole effort: exactly two new ones** — news (`news_items`, `nse_symbol`) and the benchmark enum values. Latest existing is `0043`. Pre-assign **0044 = news**, **0045 = benchmark enum values (the four new indices in one migration)**.

**Not changing:** CAS import, auth, analytics precompute pipeline shape, the scorer, SES, AWS. Mobile untouched.

**Restructured, not rebuilt:** the 21 analytics components are re-homed into 7 routes (frontend); `ScenariosScreen` is restructured in place under Planning; Dashboard/History/Analytics are wrapped by the shell first, then replaced by the Mutual Funds tabs.

---

## 4. Gaps and mismatches (planning, not UI/design)

Severity: **B** = blocks execution start, **M** = must be settled before the affected run, **L** = settle later. Each has a recommended default so the owner can answer with "ok".

**G1 (closed 24 Oct) — Mutual Funds plans.** Written: backend plan, frontend plan, shared UI kit plan (see §4a). No further action except the owner's review.

**G2 (B) — Two planning sets disagree about the Individual Fund page.** The 23 Oct plans give the page **Overview + Insights** tabs (Overlap tab "greyed"). The 24 Oct Mutual Funds mockup (signed off) says the page is **only** the header + **Overlap Analysis** (tabs dropped), and defines three overlap artifacts, two of them inside this page (fund overlap; fund-vs-fund comparison state). The backend for those two overlap states (per-fund overlap, comparison, per-fund market-cap, common holdings by sector) is in no plan.
*Default:* one page, header + **three tabs: Overview, Overlap Analysis, Insights** (the contract already reserves `/overlap` and `/insights`); Overview/Insights per the 23 Oct plans, Overlap per the 24 Oct mockup; the overlap backend is task BT5 of the Mutual Funds backend plan and the tab is task T15 of its frontend plan. The owner/manager confirm which of them owns each tab.

**G3 (B) — Duplicated and colliding backend work.**
(a) `compute_holdings(allow_stale_today)` is specified in **both** Home T1 and Individual Fund T1, with different signatures (IF adds `scheme_ids` and a cache-key change). Planning backend Task 5 also depends on it.
(b) `nifty_smallcap_250` is added by Home T3 **and** MF TDD §2.2.
(c) Migration numbers are written as "next free" in three plans.
*Default:* one task, one owner, merged first — **Home T1 is extended to the IF signature** (`scheme_ids` + `allow_stale_today`, one cache key design, one test file); IF T1 and Planning T5 consume it. **All four new benchmark indices go in one migration (0045) owned by the MF backend plan**; Home T3 is removed and Home depends on it. Migrations pre-assigned as in §3.

**G4 (M) — Contract changes forced by the Mutual Funds work are not in the contract or the shell plans.** The shell PR1 registry still has `portfolio-mutual-funds-overlap-compare` (the compare screen now lives inside the Individual Fund page) and the temporary `history` route / wrapper tab strip (History folds into Performance and retires). Shell PR1's "open items" still says import completion is "always `/portfolio/mutual-funds`" while contract v1.3 changed that.
*Default:* issue **contract v1.6** *before shell PR1 starts*: remove `overlap-compare`, keep `history` temporary with a stated retirement trigger (Performance goes live), restate import completion per v1.3; update the PR1/PR2 plan text accordingly. Shell PR1 is not yet built, so this costs only text edits.

**G5 (M) — Shared frontend building blocks have no single owner.** `LineAreaChart`, `GroupedBarChart`, `ScatterChart`, the palette/token file, the morph hook, and the MF page's new gauges/spectrum/ladder visuals are each planned as "whoever merges first owns it" in two or three plans.
*Default:* a short **"shared UI kit" run** right after shell PR2 (before Home frontend) builds the chart components and tokens once under `ui/charts/`; all page plans import them. Home's and IF's chart tasks shrink to usage.

**G6 (M) — Changing the `benchmark` analytics payload breaks the other link and mobile.** The index × window matrix reshapes stored JSON that the old UI, mobile and PDF export read; the shared backend serves both links.
*Default:* **additive only** — keep the existing keys as they are and add `benchmark_matrix` beside them; the old UI keeps reading the old keys until the final merge, then they are removed in a follow-up. Add a compute-time gate: the recompute for the largest synthetic household must stay under the current budget (the worker container is capped at 3 GB shared across 3 slots).

**G7 (M) — Four documents are waiting on the owner's approval, and the standing rule is "never edit a doc without asking".** PRD-03 version note, `Database-Schema-Unifolio.md` (news table, columns), `decisions.md` (Home BD1–BD17), PRD-06 §4.4 open items. Also the contract (G4).
*Default:* one batched approval at the end of each wave, with a diff shown, not one question per document.

**G8 (M) — Open items inside the plans that need the owner or manager, not Codex.** (1) Shell: active-row style (green pill vs 2 px underline — decided 23 Oct as underline, plan cross-check still lists it), plural vs singular sidebar labels (workbook plural, contract singular), Investments page tabs vs Equity children single source of truth. (2) Profile: unknown goal codes preserved on save (default taken). (3) Home: performance gate T13 needs the manager to run `measure_home_staging.py` on staging (target ≤ 1.5 s; the last run measured 4.9–24 s before T1); fallback is a new precompute table (owner decision). (4) News: lawyer review + 1–2 week dark launch before it shows to users; GDELT-only. (5) Real fund-house logos: no asset source decided — build with the initials fallback and a single swap point.
*Default:* build with the stated defaults; the orchestrator keeps a running "decisions taken" list in the session file.

**G9 (M) — No plan for the second link, deploy cadence or QA.** Nothing covers the Caddy/compose/DNS/Google-origin steps, the redeploy loop, the testers' checklist, or the final merge/cutover.
*Default:* a small `deploy-redesign` plan (≈2 runs, §1) plus a QA/fix wave (§5, Wave 6). Manual owner steps (DNS, Google origin) are listed in the handoff.

**G10 (M) — Review-gate approvals.** Opus reviews are pre-approved only for Profile (R4, R6, final). The other plans say "Opus, with approval". The Codex review dispatch needs a manual relay by the owner each time (the wrapper cannot be polled).
*Default:* the owner gives one blanket approval for Opus on exactly the riskiest runs listed in the handoff (shell navigation logic, `compute_holdings` change, benchmark matrix, scope provider/switch-on, final gate per branch). Everything else Codex-gate only.

**G11 (L) — Deferred items inside the signed-off mockups.** Full `CoverageBanner` port (Holdings, Other Analytics, Overlap) and full `ValuationSection` edge states are "tracked as planned work". Both reuse existing production components/fields.
*Default:* **in scope** of the MF frontend plan (cheap: port, not invent).

**G12 (L) — Branch/PR mechanics.** The contract wants PRs and CODEOWNERS (`@ayushkarnawat`, `@aditi-unifolio`) on `frontend/src/shell/`; the plans say "no commit or push without the owner's word".
*Default:* Claude commits locally on sub-branches (the project's sub-project convention), never pushes; the owner pushes `leapswitch-redesign` and opens the single final PR. Sub-branch → integration merges are local.

**G13 (L) — Shell PR2 temporary pieces** (tab strip for Dashboard/History/Analytics, "+ Add data" button) must be removed when the MF page and Investments ship; no plan owns the removal. *Default:* add to MF frontend plan's last task and Portfolio plan's route task.

**G14 (L) — Test policy.** Standing rule is affected tests only; the plans each add a final gate. *Default:* affected tests per run; **full backend + frontend suites once per wave end** and before the final merge; synthetic CAS harness (`MF@123` files) value checks for any change that touches numbers (fund-value-consistency rule).

---

## 4a. Owner decisions (24 Oct) that override or close the gaps above

- **G1 closed:** the Mutual Funds plans are written from PRD-06, design.md, the TDD and restructure specs, the audit and the nine mockups: `Docs/superpowers/plans/2026-10-24-mutual-funds-backend-plan.md` (6 tasks), `…-mutual-funds-frontend-plan.md` (16 tasks), `…-shared-ui-kit-plan.md` (2 tasks) and `…-deploy-redesign-plan.md`. Wave 0 reviews them with the owner; it no longer writes them.
- **G8 closed:** shell active row = underline (as decided); Profile = plan defaults; Home = stored prices, **no new table**, the staging measurement is done and docs are updated (Home T13 is dropped as a manual step; the orchestrator checks `decisions.md` for the recorded result instead of asking); News = shown directly (no dark launch, no waiting on legal for the preview); real fund-house logos = the same source as the old review screen (`SchemeLogo` / `amcLogos.ts`, wired for real now) with initials as fallback.
- **G9:** default, but detailed: the deploy plan.
- **G12 replaced:** work on `leapswitch-redesign` only. Each page/task gets its own branch cut from it, with a **PR targeting `leapswitch-redesign`**. When everything is built, test it all on the redesign link, then merge `leapswitch-redesign` into `feat/leapswitch-staging` (fast-forward after merging staging into it, so the merged tree is exactly what was tested). The orchestrator pushes task branches and opens PRs with `gh` (this is now authorised for task branches and `leapswitch-redesign` only); it never pushes to `feat/leapswitch-staging` or `main` and never merges a PR without the owner's word.
- **Shared data / separate login:** understood; backend, database and storage are the same for both links, data is wiped between rounds, so shared data is a non-issue.
- **Additive-only backend until the merge** (so the old link shows exactly what it shows today). A backend change that is not additive is stopped and flagged to the owner.
- **Merge-back safety (owner's main concern):** `feat/leapswitch-staging` must work after the merge. The guarantees are in the deploy plan T6/T7: staging merged into the redesign branch first, fast-forward-only final merge, full suites on the merged tree, an old-code-on-new-schema check, a synthetic-CAS number comparison between the two links, a mobile smoke test, a tag for rollback, and no removal of old screens/keys in this effort.

### Backend changes — corrected after reading PRD-06 and design.md (the list grew a little)
The Mutual Funds docs add these to §3 (all additive): `sebi_category` on `HoldingRow`; Overview synopsis and SIP/Compare-Distributors reuse existing data; **a one-time backfill of NSE history for the four new indices** (a data job on the VM, not code); the `benchmark_matrix` precompute (4 windows × 8 indices per scope — the biggest backend item and the one with a performance gate); overlap excluded-count (may be free); per-fund market-cap aggregation; Key-Insights sentence generation (frontend or backend, decided in the MF plan); chart-type picker and tab strip are frontend only. Individual Fund page tabs: **Overview / Overlap / Insights** — the Individual Fund plans own Overview and Insights, the Mutual Funds frontend plan T15 makes the (greyed) Overlap tab live (G2 settled; the 24 Oct mockup dropped the other two tabs only because that plan covers them). The count of migrations stays two, but the MF plan may find more once written; if so, they are pre-assigned 0046+ in that plan.

**Doc edits applied 24 Oct** (owner's go): contract v1.6; shell PR1 plan; Home backend T1/T3; Individual Fund backend T1 and frontend T1–T3; Home frontend T4 (+T1/T2 notes); News migration 0044; branch base `leapswitch-redesign` in the page plans; resolved-conflict notes in design.md, PRD-06, the TDD spec and the shell backend spec.

## 5. Execution waves

A **run** = one Codex dispatch (several tasks batched, as in the sub-project convention) + the orchestrator's independent verification + review gate where marked. Counts for planned items are read from the plans' own run tables or batched at 2–3 tasks/run; items marked † are my estimate.

| Wave | Content | Runs |
|---|---|---|
| **0 — Setup (Claude)** | Cut `leapswitch-redesign`; contract v1.6 + plan text edits (G4); apply G3 decisions to Home/IF plans; **write the two Mutual Funds plans (G1)** and the `deploy-redesign` plan; owner "go". Claude-only sessions, no Codex. | 2 planning sessions |
| **1 — Second link** | Files already written; owner runs the manual steps, orchestrator verifies (deploy plan T3) | 1† |
| **2 — Shell** | PR1 (R1–R6) then PR2 (R1–R7). In parallel (no shell dependency): Home T1 shared `compute_holdings`, MF backend (benchmarks migration 0045, `sebi_category`, matrix), News backend, Planning backend, IF backend | 6 + 7 = **13** (+ backend below) |
| **2b — Backend, parallel to Wave 2** | Home backend (T1–T12) 5 · News 3 · MF backend 4 (BT1; BT2+BT3; BT4; BT5) · IF backend 5 · Planning backend 2 | **19** |
| **3 — Shared UI kit** | Charts + tokens + morph hook (G5) | 2† |
| **4 — Pages (frontend)** | Portfolio page 4 · Home 5 · Profile 10 (Profile has R1–R10 including its own backend field) · Planning 4 · IF 5 · **MF page 15** (T1; T2+T3; T4; T5; T6; T7; T8; T9+T10; T11; T12; T13; T14; T15; T16 — per the plan's run groups) | **43** |
| **5 — Integration** | Wire every route `live`, `status` flips, remove temporaries, manual walkthrough on the redesign link, full suites, performance gates (Home ≤ 1.5 s, History month-detail, benchmark matrix recompute), docs batch (G7) | 4† |
| **6 — QA and fixes on the redesign link** | Owner/manager test on `ls-redesign`; fix runs | 4† (open-ended) |
| **7 — Merge** | Merge staging into `leapswitch-redesign`, final review (Codex adversarial + Opus), PR → `feat/leapswitch-staging`, `deploy.sh`, retire the second link | 2† |

### Run count

**≈ 88 implementation runs** (13 shell + 19 backend + 2 kit + 43 pages + 4 integration + 4 QA + 2 merge + 1 second link) **plus 2 Claude-only planning sessions** and **about 12 Opus gate reviews** (inside the runs above, not extra).
Without the Mutual Funds page: **≈ 70**. The Mutual Funds numbers (4 backend, 15 frontend) come from the written plan's task groups.

**Sessions:** a session handles ~6–8 runs before its context needs a handoff (the earlier sub-projects ran 12–14 runs across ~3 sessions each), so expect **≈ 12–14 orchestrator sessions** on the other account, spread over several weeks of the account's quota. Wave 2b (backend) and Wave 4 pages can proceed in alternation, so the critical path is: Wave 0 → Wave 2 shell (13 runs) → Wave 3 → Wave 4 → 5 → 6 → 7.

**Fastest safe order of pages in Wave 4:** Portfolio page → Home → Mutual Funds → Individual Fund → Planning → Profile (Profile last because it is independent and the old Profile stays reachable at `/profile/legacy`).

### What this session did *not* do
It did not read the 9 MF mockup HTML files or `PRD-06`/`design.md` line by line (they are inputs to the MF plan in Wave 0), did not open the PDF (no `pdfinfo` here), and did not run any code. The run counts for the MF page and the two integration waves are estimates; all other counts come from the plans.
