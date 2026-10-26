# UI redesign: decisions register (who decided what)

Written 26 Oct 2026 by the orchestrator (Claude Code), at the owner's request. Purpose: separate (A) decisions the owner made, (B) decisions already written into the plans and specs that the runs followed, and (C) **decisions the orchestrator took where a plan was silent or where the run changed the plan**. Every (C) entry is open to the owner's veto; changing one means a small follow-up run, listed under "If you veto". The per-run detail is in each run's handoff ("Orchestrator record") and in `delegation-log.md`.

## A. Owner decisions (stated in chat; not to be re-asked)
1. Branch model: one PR per page or flow, all onto `leapswitch-redesign`; the redesign deploys together to a new link; `ls-staging` untouched.
2. Manual relay: the orchestrator writes a handoff and a short Codex prompt; the owner relays and pastes the CODEX REPORT; the orchestrator verifies, commits and never merges.
3. Opus only for final whole-branch reviews (blanket approval for the named final gates); Sonnet or Codex otherwise.
4. Efficiency changes adopted 25 Oct: fewer full test runs, no re-review of Lows or test-only fixes, one batched Codex review per PR (Opus and Codex in parallel at the final gate), recurring findings become automatic guard tests, a WSL-native test copy.
5. Shell: profile "(Me)" name derivation as the real onboarding appends it; the Equity group can be collapsed on a child page; "fix the Lows as well"; the import-notice multi-hop Back resurfacing accepted as a documented limitation (revisit in run I1).
6. Home allocation donut = **option C**: read the stored `asset_allocation` Analytics section, fall back to the Dashboard's shallow buckets when it is absent.
7. PR #10: take the recommended choice (Draft, retitled); push HB1 and HB2 (the "hybrid"); the units replay is added to HB3.
8. Fix the CI now (done, two layers).
9. **26 Oct, MB3:** agreed that the portfolio and fund benchmark computations each build their own window inputs (some snapshot reads are done twice; the timing gate decides whether a shared memo is needed), and that a +O run gets a Sonnet review at verification with Opus kept for the final whole-PR gate. The owner also asked that this register be kept up to date after every run.

## B. Decisions already in the plans and specs (followed, not new)
Retention 6 months; Home uses stored prices (P7 A); gain excludes new money, Modified Dietz (B5); movers measure price movement only (B2); sector view is a labelled estimate with a 50 percent coverage fallback to category; greeting from the IST clock; "flat" under 0.05 percent; donut class list with Equity, Debt, Gold, Others live and four coming-soon classes; windows exactly 1Y, 3Y, 5Y and since inception; four new NSE indices; additive-only changes (old UI, mobile, PDF export keep reading what they read); a household with too little history gets "unavailable", never an exception (BT3 review focus 2); migration number 0045 for the benchmark enum.

## C. Orchestrator decisions (plan silent, or the run changed the plan)

### Where a run changed something the plan said
| # | Plan said | Run did | Why | If you veto |
|---|---|---|---|---|
| C1 | BT3: a window is available only if **every member that has data** has a non-partial snapshot at the start month | A member who started investing **after** the window start contributes 0 and the window stays available; a member who held at the start but has a partial or missing snapshot makes it unavailable; and `V0 <= 0` makes it unavailable | The literal rule would blank 1Y for a family where one member joined 6 months ago; `V0 > 0` is what stops a "3Y" figure from silently being a 14-month figure | Revert to the literal rule: one small edit in `build_window_context` plus its tests |
| C2 | BT3 signatures `compute_window_rows(db, member_ids, transactions, today)` and a per-fund function that reads month detail per fund | Pure functions taking a prebuilt `WindowContext`, terminal values and `IndexLevels`; reads isolated in `build_window_context` and `load_index_levels` | One month-detail walk per window instead of per fund per window; the maths becomes directly testable | MB3 wires the engine, so changing it later costs a refactor of one module |
| C3 | BT4 adds `BenchmarkWindowRow` and `FundWindowXirr` | Added in MB2, because the engine returns them (nothing wired into any payload) | The engine cannot return types that do not exist yet | None needed |
| C4 | Migration `0045`, "stop if the head is not 0043/0044" | `0045` chains from `0043` (0044 does not exist); the later News migration must chain after 0045 | Alembic needs one linear chain | Renumber when the News plan is built |
| C5 | BT1 step 3: verify the NSE trading names "from a machine that can reach niftyindices.com (the VM)" | I verified them myself from this laptop with read-only requests (price and TRI, 13 to 23 Oct window) | The public endpoint answered; no VM access needed | Re-verify from the VM if you prefer (one command set) |
| C6 | Home plan T7: "donut equals the Dashboard allocation" | Replaced by option C (owner decision, A6), then designed as: stored section gives the mix, live holdings give the rupee amounts | The hero total, donut centre and family bar must agree to the paisa | See HB3b below |
| C7 | BT1: "`refresh_benchmark_daily.py` deliberately unchanged" | Unchanged, but its **test** hard-coded `fetches=8 succeeded=6`; changed to 16 and 14 | Eight indices make 16 fetches | None |

### Where the plan gave the function but not the convention (Home backend)
| # | Decision | Run |
|---|---|---|
| C8 | A flow belongs to a period if `start < date <= end`; Modified Dietz weights by multiply-then-divide; percentages quantized to 4 decimal places, ROUND_HALF_UP | HB2 |
| C9 | The bulk NAV read looks back 10 calendar days so a weekend or holiday start can be forward-filled | HB2 |
| C10 | Movers: change = units at the **previous close** x (latest NAV - previous NAV), so a purchase on the NAV date adds no gain and a redemption on it keeps its price move (the plan told me to verify V1 and compute from the bulk read if `today_gain` differed; it did) | HB3 |
| C11 | Cents: floor each amount, give the missing cents by largest remainder, ties by key ascending, so the bars add to the headline to the paisa (the spread helper was later fixed to use exact fractions so repeating ties follow the rule) | HB3, HB3b |
| C12 | Sector label only from `stock_master.sector`, never `scheme_holdings.sector_raw` (it carries debt ratings); unmapped, debt and cash become "Other" | HB3 |
| C13 | Funds with an older latest NAV than the group's latest date, or no NAV, are **excluded from the headline and listed** (`partial`) | HB3 |
| C14 | The as-of date is the latest NAV date among held funds; "flat" is judged on the percentage, not the amount; top contributor rules | HB3 |
| C15 | Units replay reuses the holdings code's own `FifoState`, one folio query and one transaction query | HB3 |

### Home allocation details inside option C (HB3b)
| # | Decision | If you veto |
|---|---|---|
| C16 | Stored section supplies only the **mix**; rupee amounts come from live holdings so everything adds up to the hero total | Use the stored rupees (centre label could differ by a day's NAV move) |
| C17 | Stored section ignored when `failed_at` is set, when Analytics flagged it thin (`hide_headlines`), or when it is older than the latest confirmed import (the old section stays until a recompute replaces it) | Loosen or tighten the rule |
| C18 | Fallback mapping: Equity and Debt as the Dashboard; categories containing "gold" or "silver" become Gold; Hybrid and the rest become Others; flagged `approximate` | Keep Hybrid separate (needs a new class) |
| C19 | Only the `as_disclosed` variant (not the Analytics "arbitrage as cash" toggle); percentages of total value, not of covered value; Others = total - equity - debt - gold (includes cash-like, derivative lines and undisclosed funds) | Add the toggle or show an "uncovered" slice |

### Windowed XIRR details (MB2, not yet run)
C20 start date = month end N years before the last completed month end of the `today` argument; C21 index levels loaded per index with a 10-day lookback (the existing code has no limit); C22 a fund not held at the window start has no windowed value; C23 `SI` window start date shown = earliest transaction date.

### Store the windows (MB3, handoff written, not yet run)
| # | Decision | If you veto |
|---|---|---|
| C33 | Portfolio and fund computations each build their own `WindowContext` and index levels (duplicated snapshot and month-detail reads per scope). **Owner agreed 26 Oct.** The timing gate decides whether to add a short-lived memo keyed by (member ids, today) | Add the memo (a small change in `benchmark.py`) |
| C34 | The windows are computed **after** the legacy numbers; any failure gives `windows = []` plus a warning, never a failed section; one fund's failure blanks only that fund | Let failures propagate (not recommended) |
| C35 | The four new indices' TRI history is topped up at compute time by the **portfolio** computation only (the legacy four already are by the legacy code); the **fund** computation fetches and loads only the legacy four, because a fund's benchmark is always one of them (amended after the Sonnet review, 26 Oct); price history is never fetched; a failed top-up leaves those columns `None` | Rely on the 06:00 daily job only (columns empty until its first run after deploy) |
| C36 | New fields default to `[]` and sit last, so old stored payloads validate and old clients ignore them | none |
| C37 | The timing script is read-only, in the house style of the other `measure_*` scripts, with the plan's gate (under 3 s added per scope) printed as PASS/FAIL; it can only be run where the new code is deployed (Wave 5, run I2, or an earlier one-off build on the VM) | Run an earlier one-off build on the VM |
| C38 | Verification of a +O run uses an independent Sonnet review aimed at the hot path (recompute time, old payloads); Opus is kept for the final whole-PR gate (MB4). **Owner agreed 26 Oct** | Ask for Opus on this run |

### MB3 outcome and the speed-up run (MB3b)
| # | Decision | If you veto |
|---|---|---|
| C40 | A rollback after a failure in the window code happens **only for database errors** (it expires every loaded row, which costs one refresh query per row); the window inputs are built **after** all legacy numbers in the fund path and rows are refreshed with one re-select after a commit (found by the Sonnet review; fixed in the MB3 commit) | none (a correctness and cost fix) |
| C41 | **Resolved by MB3b (C45 to C47): the gate now passes locally.** MB3 was **committed although the timing gate failed** (7.1 s against 3 s on the 651-transaction local household), because it is functionally complete, nothing is deployed, and the plan says to fix the speed rather than relax the gate; the fix is the separate run MB3b | Hold the commit back until MB3b is done |
| C42 | MB3b: a **new faster solver for the new numbers only** (`xirr_fast`: same Newton method and tolerance, 18-digit precision, one exponential per flow per iteration); the legacy `xirr()` and every legacy number stay untouched; the since-inception row reuses the rates the legacy code already computes (equal by construction) | Make the legacy solver faster instead (every legacy number would shift in its far digits) |
| C43 | The measurement script's read-only guard blocks writes and schema changes (not "anything but SELECT"), has `--allow-nav-writes` for the pre-evening-NAV case, and uses `postgresql_readonly` on Postgres | none |
| C44 | A floor on gate evidence: the gate is measured locally first (CPU-bound Decimal work, so SQLite versus Postgres changes little) and again on staging at the integration wave (run I2) | Run the staging check earlier with a one-off build |
| C45 | MB3b was **BLOCKED by a contradiction in my own handoff** (windows use the fast solver, yet three existing tests demanded digit-for-digit equality with the legacy solver for window rates). Resolution: the digit-for-digit rule applies to the **since-inception** numbers only (they now equal the legacy values by construction); window rates are checked against the fast solver exactly and against the legacy solver within 1e-8. The orchestrator finished the run itself | Keep the legacy solver for windows (the gate would fail again) |
| C46 | The measurement script times the **production** call pattern (since-inception rates passed in; two contexts and two level loads) so the gate is not overstated; the gate figure is "added by windows" = 2 x context + 2 x levels + pure maths | none |
| C47 | `xirr_fast` and the legacy solver may differ only for absurd rates (above about 1e9 a year); accepted | none |

### Low findings carried forward, with the planned disposition (orchestrator recommendation, 26 Oct; owner may veto)
| # | Finding (run) | Plan | When |
|---|---|---|---|
| L1 | `SI` portfolio rate ends at the real `date.today()` while the index replay ends at the context's `today` (MB2); identical in production | Fix: compute the `SI` portfolio rate in `benchmark_windows.py` from the same flows with the terminal at `ctx.today`, keeping the digit-for-digit equality test at `today == date.today()` | One small cleanup run (`MX1`) after MB4, before the integration wave |
| L2 | `dashboard/allocation.py` and `analytics/allocation.py` still run their own category lookups and carry stale comments saying `HoldingRow` lacks the category (MB2) | Fix the stale **comments only**; leave the queries (removing them edits hot shared code for a one-query saving) | Same cleanup run |
| L3 | The window loader treats an index level more than 10 days older than the date asked as missing; the legacy lookup has no limit (MB2) | **Accept** as designed (an index series that stale is broken data, and `None` is safer than a wrong rate); revisit only if the daily job is seen missing days | none |
| L4 | `HB3`'s movers: a zero-change bar has empty `scheme_ids` in the fund view (HB3) | Set it to the bar's own fund if a route needs it | In HB5 if needed |
| L6 | `get_snapshots` rebuilds on every call for a member with a permanently unpriced fund (existing behaviour), and the window context now calls it at recompute time, twice per scope; also no negative cache for failed new-index fetches, and `earliest` reaches back to the 5Y start for short histories (MB3 review) | Measure on staging at the integration wave; if it shows, build the window context from `get_month_detail` only (read-only) or add the shared memo (C33) | I2 |
| L5 | Allocation: `as_disclosed` only, the stored mix can be a day old, an opening-balance edit does not refresh the stored section until the next recompute, Hybrid sits in Others in the fallback (HB3b) | Accept for staging; revisit with real data | HB5 synthetic gate (T12) |

### Process decisions
C24 Every run is verified by me with a scope check, tests of every file that references the changed code, an independent differential check, and a mutation check; gaps found are closed by me with test-only additions. C25 Defects found in a worker's code or in an earlier run (the `spread_cents` tie bug, a leaked mock in Codex's allocation tests) are fixed by me test-first in the same commit, and recorded in the run's orchestrator record. C26 Docs live on `leapswitch-redesign` and are merged into each task branch before a Codex run; code is committed on the task branch; nothing is pushed or merged without the owner's word (MB1, HB3b, HB3 and the MB2 work are local until pushed). C39 This register is updated at the end of every run, in the same docs commit as the run's orchestrator record (owner request, 26 Oct). C27 CI second layer: the five disclosure tests need a gitignored AMFI cache, so the workflow seeds it from the committed public feed (verified locally).

### Shell (earlier sessions; details in the return handoff sections 2c to 2e)
C28 Back handling: the Import health Back link pops history when it came from Profile and otherwise replaces with Profile; the import focus Back pops only when it has an origin. C29 The import notice is tied to the user id so it is not shown to another user after logout. C30 Saved scope records the page it was saved on and resets when a different page is opened. C31 A foreign `?member=` id is ignored. C32 The shell stylesheet is imported in `ShellRoot`. These were review findings fixed test-first with the owner's standing "fix the Lows" instruction.
