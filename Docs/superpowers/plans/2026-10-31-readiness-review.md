# Readiness review: can Runs 1 to 7 be executed smoothly? (31 Oct 2026)

**How to read this.** Each item is either **verified** (with the command or file that proves it) or a **named risk** with a fallback. Nothing here claims certainty beyond that. Written by the planning session after Step 0, against the final plan (`2026-10-31-change-requests-implementation-plan.md`, Revision 3). No product code was written or run beyond read-only probes.

## 1. Gate table

| Gate | Status | Evidence | If it goes wrong |
|---|---|---|---|
| G1 category counts | Closed | 30 Oct VM counts; 18 undecided funds decided by the 65% rule on **net** domestic equity (owner, 31 Oct). The list of the 18 with results is produced on the VM at Task 1.4 | Fund with no holdings: left out with a plain sentence |
| G2 recompute and baselines | **Open (named fallback)** | Recompute 6 min 10.9 s verified 30 Oct. **Home and benchmark-matrix timings never measured** | Do not start Run 2 without them. The manager measures after 06:35 IST on a trading day, twice each, recomputed user; owner decides if a Run 2 start without them is acceptable |
| G3 P/E and P/B reader list | Closed | Rescan 31 Oct of 17 files: ITI, Kotak, ICICI passive, Invesco print per-fund figures (ABSL, UTI in automatic files); no house added | Computed-from-holdings path is the default for every house |
| G4 benchmark names in factsheets | Closed | All fetched houses print benchmark text (30 Oct scan) | Last month's mapping or the labelled index |
| G5 index names and series | **Closed 31 Oct** | S9 verified: Nifty 50 Arbitrage price series equals printed returns (1y 7.33, 3y 7.43 vs 7.42, 5y 6.69; `step0-data/vm2-out/bench_verify_2026-10-31.log` and the report R3.7). S8: debt A-I/A-II/A-III, Hybrid Composite Debt, Equity Savings not in niftyindices' tool (Fixed Income and Multi Asset lists enumerated), NSE `ind_close_all` (167) or NSE's live list (139) | Printed returns in the returns table; labelled category index elsewhere |
| G6 terms (S10) | **Closed by owner** | Owner decision 31 Oct: staging unchanged, written request to NSE Indices separately, policy note before production | none |
| G7 sources / S6 | **Partly answered** | NSE list and detail addresses work (200, 31 Oct); detail has no equity/book value; XBRL zip not opened | Task 2.12 starts with the XBRL check (owner-approved download); if no equity there, Phase C stays on labelled fallbacks |
| G8 Axis file | **Open (named fallback)** | Owner could not find an October-issue Axis file; staging holds Axis rows from the 12 Oct import of 31 Aug data | Axis stays on 31 Aug data; owner supplies a file later; hand import command is unchanged for Axis (it is registry-MANUAL) |
| G9 SBI passive and Mahindra readers | **Closed 31 Oct (fixed and tested locally; not yet on the VM)** | Probe before: both rejected (0 scheme pages). After the fix, on the real files: SBI passive 35 scheme pages, SBI active 57, Mahindra 27, Sundaram and Angel One accepted; 7 new reader tests plus 302 existing fund-manager tests pass in WSL | The fixes reach the VM only with the staging deploy; if they fail there, import SBI active only |

## 2. Precondition probes (run 31 Oct)

| Fact a task relies on | How checked | Result |
|---|---|---|
| Alembic head is 0046; 0047 to 0050 are free | `ls backend/alembic/versions` (last: `0046_job_runs.py`, down_revision "0044"); independent reviewer confirmed | **Verified** |
| Files the plan says to modify exist | Script over every `**Files:**` line (modify entries): 113 checked, 110 exist; the 3 missing (`benchmark_registry.py` by T3.1, `auth/head_change.py` by an earlier Run 5 task) are created by earlier tasks | **Verified** (3 created in-plan) |
| Backend tests run in WSL | `wsl ... backend/.venv/bin/python -m pytest tests/scripts/test_import_manual_fund_managers.py` : **7 passed** | **Verified** |
| Node, npm, `node_modules` in WSL | `which node npm`, `ls frontend/node_modules` | **Verified** (frontend suites not run) |
| Sundaram has a reader | `fund_manager_layouts.py:1155 "sundaram"`; reader accepted the real Sept file (100 pages) | **Verified** |
| Angel One, SBI active accepted by their readers | `looks_like_current_factsheet` on the real files | **Verified** |
| SBI passive and Mahindra readers | Same check: both failed before the fix; after it both pass on the real files (35 and 27 scheme pages) | **Verified** (local) |
| Automatic job vs manual rows | Code read of `amfi_factsheet_client.py`: job skips only `MANUAL` houses, overwrites on success, leaves rows on failure | **Verified (code read)**; a unit test is attempted in Task 1.5b |
| Importer 45-day staleness | `looks_like_current_factsheet` docstring and code: newest "as on" within 45 days; Sept files expire 14 Nov | **Verified**; `--as-of` added to the task |
| Only equity funds have a benchmark today | `fund_page/benchmark_select.py: benchmark_for` returns None for non-Equity | **Verified**; plan's legacy-section rule follows |
| Every benchmark consumer reads daily TRI levels | grep of `BenchmarkIndexHistory` use in `analytics/benchmark*.py`, `fund_page/*`, `home/wealth.py` (report R3.8) | **Verified** |
| NSE financial results endpoints answer | `curl` with the NSE cookie, 200 (list 130 filings for Reliance; detail 51 fields) | **Verified**; book value absent |
| niftyindices endpoints and lists | Direct requests 31 Oct; 12 requests in all | **Verified** |
| Postgres functional tests run | `docker compose up postgres` not tried | **Unverified**: named risk R7 |
| Codex can write Git objects in its clone | Plan's cheap probe, not run | **Unverified**: Method step 2 handles both outcomes |
| Derivative `pct_to_nav` sign in stored holdings | Needs staging or a populated local DB | **Unverified**: first step of T1.2 and T1.4 |
| The 18 funds' net equity % | Needs staging holdings | **Unverified**: manager's VM query at T1.4 |
| Staging DB state after today's imports | Per-house query: 49 houses with 2026-10-01 rows except Sundaram 0; 6 houses unregistered | **Verified** (note: period is the import month) |

## 3. Conflict check
- **Files touched by several tasks:** Run 1 tasks share analytics `schemas.py`, `mutual-funds/types.ts`; T1.4 and T1.5 both edit `overlap/OverlapPage.tsx` → **all Run 1 tasks are sequential** (T1.5b independent). Run 2: T2.6, T2.8, T2.9 share `OtherAnalyticsPage.tsx`/`otherLogic.ts` → T2.9 after T2.8. Run 3: T3.5 and T3.6 share `types.ts` and `performance/` → T3.6 after T3.5. All fixed in the plan after the independent review.
- **Migrations:** 0047 (T2.1), 0048 (moved to **T2.5**, after the ranking models and `fund_ranking.py` are removed), 0049 (T3.1, edited in place by T3.2, T3.3; never applied to a shared database before Run 3's gate), 0050 (Run 5). Run `alembic heads` at each run start.
- **Payload fields added vs removed:** additive only within the release; `FundBenchmarkRow.benchmark_index` becomes optional (old payloads parse); the stored `benchmark_funds` section and `_benchmark_index_for_category` stay unchanged for legacy UI, print and phone views.
- **Tests that break by design:** `tests/functional_postgres/test_benchmark_enum_0045.py` (enum becomes text in 0049; update in T3.1); the existing Nippon refusal test in the manual-import tests (runs without the new flag).

## 4. Independent review (fresh agent, saw the plan and the repo, not these conclusions)
Findings and what was done. All accepted; none rejected.
1. *Importer rejects the files for age (45 days) after the long wait to the staging deploy, and a late import is stored under the import month.* **Accepted.** `--as-of` for the staleness check only; the file's own date is printed; reference period stays the import month; a reminder to check the four houses after the 10 Nov job; Task 2.2b cannot see these houses (documented).
2. *Task 3.3 would change the legacy `benchmark_funds` section and its required enum.* **Accepted.** Legacy mapping unchanged; new `benchmark_for_scheme` for new surfaces only; optional field.
3. *Task 3.1 text key not carried into the typed code (ValuationIndex, FundBenchmarkRow, `_tri_levels`, `BENCHMARK_LABELS`) and the Postgres enum/PK conversion.* **Accepted.** Listed in T3.1; the 0045 test updated.
4. *Task 1.4 relies on a non-existent field; no data path; `scheme_universe.py` is the wrong home; the 18-fund list needs staging.* **Accepted.** New `equity_universe.py`, `net_domestic_equity_pct` from the latest holdings batch (not household-scoped), derivative sign read first, the list produced by the manager on the VM.
5. *Parallel tasks that share files.* **Accepted.** Sequenced (section 3).
6. *Migration 0048 ahead of the code that depends on it.* **Accepted.** Moved to T2.5.
7. *0049 spread across tasks.* **Accepted.** Edited in place, stated.
8. *Smaller:* price-only routing into TRI rows (**accepted**, registry `source` selects the endpoint), `Numeric(12,2)` precision (**accepted**, checked in T3.1), Nippon test and the no-layout refusal test (**accepted**), overwrite test hosting (**accepted**, with a code-read fallback), the asset-class map description (**accepted**, noted in T1.2).
*Not verified by the reviewer:* the real files on the VM (the planning session probed them locally), staging counts, Postgres behaviour, the frontend, and Runs 5 and 6 file claims beyond existence. These stay on the risk register.

## 5. Risk register

| # | Risk | Likelihood | Effect | Early signal | Fallback |
|---|---|---|---|---|---|
| R1 | G2 baselines missing at Run 2 start | Medium | Cannot prove "no more than 10% slower" | No timing file in `Docs/orchestration` | Manager measures after 06:35 IST; or owner accepts Run 2 gating on its own before/after run |
| R2 | The SBI passive or Mahindra reader fix misbehaves on the VM's copy of the files | Low | Those houses stay one month behind | The import prints `not_a_factsheet` | Import SBI active only; Mahindra waits for next month's automatic job |
| R3 | Staging import lands after 14 Nov and the file is rejected for age | High if deploy is late | Import writes nothing | "stale" message | `--as-of 2026-10-31` (built in) |
| R4 | Axis stays stale | Certain until a file is found | 402 Axis scheme rows one month behind | Per-house query shows the 12 Oct import | Owner supplies the file; hand import of Axis needs no code |
| R5 | A failed automatic house is unnoticed (one of the five failed houses is unidentified) | Medium | Silent staleness | `FUND_MANAGER_ALERT` not recorded durably | Task 2.2b alert; manager reads the job's own output after each run |
| R6 | Book value is not in the XBRL attachment | Medium | Phase C (P/B from filings) not built | XBRL check in T2.12 shows no equity | Phase C skipped; labelled fallbacks stay |
| R7 | Postgres functional tests cannot run on the executor's machine | Medium | Run 5 gate unprovable | `docker compose up postgres` fails | Manager runs them on the VM's Postgres or a local container |
| R8 | Git writes fail in the Codex sandbox | Medium | Orchestrator must do all commits (already the fallback) | Cheap probe fails | Method step 2(c): Codex self-checks only |
| R9 | A new benchmark series disagrees with printed returns | Low to medium | Index left inactive | `benchmark_series_check.py` FAIL | Labelled category index; owner informed |
| R10 | Gold ETF proxy differs from the printed gold return by over 0.5 points | Medium | Gold funds show printed returns only | T3.1b check | Printed returns only |
| R11 | Recompute claim left by an interrupted run | Low | A user's analytics skipped | `analytics_recompute_status` | One-household recompute clears it; never stop a recompute |
| R12 | Disk space or build state on the VM at deploy | Low to medium | Failed deploy | `check-disk.sh`, `check-memory.sh` | Manager frees space; no deploy until clean |
| R13 | A derivative `pct_to_nav` is unsigned in stored data | Unknown | Net-equity rule wrong for hedged funds | Probe at T1.2 and T1.4 | Use gross equity and flag it to the owner before shipping |
| R14 | Plain-words rule broken by a developer string | Medium | Confusing screen | Test scanning the string table | Review gate checks every new string |

## 6. Owner sign-off list (decisions that are still yours)
Every earlier decision is recorded. Remaining, none blocks Run 1:
1. **When to deploy to staging and push** (explicit go at Task S.1).
2. **The Axis October-issue file** (find it, or accept 31 Aug for now).
3. **Whether Run 2 may start without the G2 baselines** if the manager cannot measure them (recommended: do not start without).
4. **The written request to NSE Indices and the privacy-policy note** (before production, not staging).
5. **The 10 Nov re-check** of the factsheet publication and of the four houses' automatic job (recommended dates: 3, 6, 10 Nov for publication; after the 10 Nov job for the four houses).
6. **If the SBI passive or Mahindra import fails on the VM**: accept a partial import (SBI active only) for this month.
