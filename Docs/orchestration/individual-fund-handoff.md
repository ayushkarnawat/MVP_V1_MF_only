# Handoff: individual-fund (Individual fund page, Overview and Insights)
**Status:** READY, nothing started. D1 and D2 decided; Run 1 prompt below; waiting for the owner's explicit go, 2026-10-23
**Parent plans (binding; read each plan's "Global Constraints" and "Review Focus" first, then only the run's tasks):** backend `Docs/superpowers/plans/2026-10-23-individual-fund-backend-plan.md` (tasks BT1..BT14), frontend `Docs/superpowers/plans/2026-10-23-individual-fund-frontend-plan.md` (tasks FT1..FT13). In this handoff the plan task "Task N" of the backend plan is written BT<N> and of the frontend plan FT<N>.
**Spec and decisions:** `Docs/orchestration/2026-10-23-individual-fund-functionality-backend-spec.md`, `...-layout.md`, `...-tdd.md`, `...-backend-decisions-proposal.md`; workbooks `2026-10-23-individual-fund-planning-decisions-v1.html` (L1-L20) and `2026-10-23-individual-fund-design-mockups.html` (S1-S14, M1-M11, all answered).
**Orchestrator:** Claude Code · **Worker:** Codex (manual relay, one run per prompt)

## How this works
Same loop as Sub-projects 1 and 2 and the analytics UX fixes: the user pastes the run's prompt into Codex; Codex implements test-first and prints the CODEX REPORT (template at the bottom); the user pastes it back; Claude re-runs the run's affected tests in WSL, reviews (Codex adversarial review via relay; Opus on the runs marked Opus, to be approved by the owner), and commits **one commit per plan task** with explicit paths, never pushes. Run sections are written when the run is READY, not all up front. Every run's result is appended under its section and one line goes into `Docs/orchestration/delegation-log.md`.

**Decisions (owner, 2026-10-23):**
- **D1 branch:** commit on whichever branch the implementation is currently on (today `feat/leapswitch-staging`), one commit per plan task, explicit paths, never push. No separate branch.
- **D2 Opus reviews:** for the riskiest parts. Proposed set: R1 (shared holdings code), R5 (peer cache and concurrency) and the final whole-branch review (R13); I will ask before using Opus on any other run that turns out risky.
- **D3 frontend start (still open):** the frontend plan needs the shell PR 1 (`renderInShell`, `PageLayout`, `useScope`, route registry; the shell is not in the repo yet). Runs R8 onward stay HELD until it exists or the owner says to stack on `feat/shell-nav`.

## Runs
| Run | Tasks | Reviewer |
|---|---|---|
| **R1** | BT1 (`compute_holdings` scheme filter and `allow_stale_today`; shared with Home's T1) | Opus |
| R2 | BT2, BT3 (skeleton and scope; summary and folios) | Codex |
| R3 | BT4, BT5, BT6 (performance, returns, risk and bands) | Codex |
| R4 | BT7, BT8 (composition; manager and score) | Codex |
| R5 | BT9, BT10, BT11 (peer cache and series, rolling and period returns, scatter) | Opus |
| R6 | BT12 (insights engine) | Codex |
| R7 | BT13, BT14 (router, regression, measurement script mode) | Codex |
| R8 | FT1, FT2, FT3 (tokens, formatting, API, hooks, three charts) HELD on D3 | Codex |
| R9 | FT4, FT5 (frame and routes; stat band and score) HELD | Codex |
| R10 | FT6, FT7, FT8 (performance chart, returns table, details and risk) HELD | Codex |
| R11 | FT9, FT10 (holdings and allocation; insights first half) HELD | Codex |
| R12 | FT11, FT12 (rolling, period returns, scatter; page assembly) HELD | Codex |
| R13 | FT13 (QA, measurement; synthetic checks by a Sonnet subagent in the harness folder only) | Opus (whole branch) |

## Constraints (non-negotiable)
**Git read-only whitelist** (`status`, `diff`, `log`, `show`, `grep`, `ls-files`): never `add`/`commit`/`stash`/`checkout`. **Never touch** `infra/`, real CAS PDFs, `Docs/` (plans and artifacts are Claude's), existing migrations (this work adds none), any file under `frontend/src/shell/` except the two route files named in the frontend plan, existing screens, `FundScoreDetailModal`, `SchemeLogo`, or mobile code. **Follow the plan literally**; mechanics deviations go under "Deviations", behaviour or interface questions under "Open questions". **Test-first** (failing test, see it fail, then code). **Run only the named test files plus every importer `git grep` finds**, never full suites. Backend on Windows from `backend\`: `.venv\Scripts\python.exe -m pytest <files> -q`; frontend from `frontend\`: `npx vitest run <files>` and `npx tsc -b`. Money: `Decimal` backend (strings on the wire), decimal strings frontend via `lib/decimal.ts`. New payload fields always have defaults. LF endings, UTF-8, **no new dependencies, no new table, job or migration**, stack locked. No live network in tests (`tests/offline_http.py`). If the plan's line numbers or names differ from the code, trust the code, note it under Deviations. The page never starts an Analytics recompute and never calls `compute_holdings` without `scheme_ids`.

## Run 1 — BT1 only (`compute_holdings` scheme filter and stored-prices setting)
**Before coding:** run `git log --oneline -20 -- backend/app/services/dashboard/holdings.py backend/app/services/dashboard/nav.py` and `git grep -n allow_stale_today`. If Home's task T1 already added `allow_stale_today` to `compute_holdings`, reuse it exactly (same name and behaviour), add only the missing `scheme_ids` filter and its tests, and report this under Findings. If it has not, implement both as the plan says.

Implement the backend plan's **Task 1** exactly: `async def compute_holdings(db, household_member_ids, *, scheme_ids: frozenset[uuid.UUID] | None = None, allow_stale_today: bool = False) -> list[HoldingRow]`; the filter is applied to folios before `_load_folio_transactions` loads transactions (do not change that function's other callers); the cache key becomes `(tuple(sorted(ids)), date.today(), scheme_ids, allow_stale_today)` and `peek_cached_holdings` and `invalidate_holdings_cache` use the same shape (invalidate removes every key containing the member id); `get_navs_on_or_before` in `nav.py` accepts `allow_stale_today` and then trusts a cached row on any date up to today without fetching. Existing callers pass nothing and must behave exactly as today.
Tests first, in `backend/tests/services/dashboard/test_holdings.py` and `test_nav.py`: `test_scheme_filter_returns_only_requested_schemes`, `test_filtered_and_unfiltered_cache_entries_do_not_collide`, `test_unfiltered_default_behaviour_unchanged`, `test_allow_stale_today_never_fetches` (patch `app.services.dashboard.nav._fetch_nav_history` to raise; stored NAV dated yesterday; value uses it), `test_default_still_fetches_when_today_row_missing`, plus a `test_invalidate_removes_filtered_entries`.
Run: `test_holdings.py`, `test_nav.py`, every importer `git grep` finds of `compute_holdings` or `peek_cached_holdings` (list them under Tests), and `tests/api/test_dashboard_holdings_route.py`. Do not start BT2.
Report extras: the final signatures of the three changed functions, and the exact cache-key tuple.

## Run 1 result
(pending)

## CODEX REPORT — template (one fenced code block, at the very end)
```
CODEX REPORT — individual-fund — Run <1..13>
Run date/time: <…>    Environment: Windows    Python/Node: <version>    Baseline HEAD: <hash>

1. TASK STATUS
   Task <id>: DONE | PARTIAL | BLOCKED — <one line>
2. FILES (grouped by plan task)
   New (untracked): …   Modified: …   Staged (must be empty): …
3. TESTS (exact command + last 3 lines)
   RED: …   GREEN: …   Extra files via git grep: …   tsc: … (frontend runs)
4. DEVIATIONS (mechanics only)
5. FINDINGS (what the code showed that the plan did not say)
6. OPEN QUESTIONS / BLOCKERS
7. SELF-REVIEW FINDINGS
   - [High/Med/Low] file:line — finding — FIXED | NOT FIXED (why)
8. CONFIRMATIONS
   - No git write commands: YES/NO   - Full suites not run: YES/NO
```
