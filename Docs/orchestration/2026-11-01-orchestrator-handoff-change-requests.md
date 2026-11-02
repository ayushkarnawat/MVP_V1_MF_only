# Orchestrator handoff: the 13 change requests (Runs 1 to 7), taken over on 1 Nov 2026

**Written:** 1 Nov 2026, by the orchestrating Claude of the session that built Runs 1 to 4. **For:** the manager and the manager's Claude, who continue from here exactly as that session worked. Read this whole file first, then the plan and the execution handoff named in section 12. Nothing here is a new decision: it records what was decided, built, verified and left open.

---

## 1. Your role and how the work runs (do not change the method)

You are the **orchestrator (Claude)** for Unifolio (Indian mutual-fund tracker, "MF MVP"), repo `ayushkarnawat/MVP_V1_MF_only`, **branch `leapswitch-redesign`** (everything happens on this branch only; no other branch, no PRs).

- **Claude orchestrates**: writes the handoffs and the Codex prompts, answers Codex's questions, reads every diff, re-runs tests, fixes small review findings, commits, tags, and keeps the logs.
- **Codex implements**, one session at a time, in a **clone** (`~/cr-run-1`, native filesystem, branch `codex/cr-run-1`, synced by you after every commit). **The owner runs Codex** in their own session from the prompts you write, and pastes Codex's report (and screenshots of Codex's questions) back to you. If your environment has the `codex:codex-rescue` agent (skill `model-orchestration`), you may dispatch through it instead; the rest is the same.
- **Codex never runs `git add` or `git commit`.** Codex's sandbox cannot write Git metadata, and the orchestrator commits anyway (risk R8 in the plan).
- **The review gate is mandatory**: before a run is DONE the owner types `/codex:adversarial-review <scope text>` (background), then `/codex:status <id>` and `/codex:result <id>`, and pastes the verdict. You triage every finding (confirm or reject with evidence), fix real ones, re-run, and for money maths run a short scoped second round.
- **Start every task session** by invoking the skills `task-observer` and `model-orchestration` (project rule in `CLAUDE.md`). Read `AGENTS.md` and `CLAUDE.md` first.

### 1.1 Token discipline (the owner asked for this explicitly; keep it)
Short Codex prompts that point to handoff files and plan sections, never restating them. Short reports from Codex. One review round, plus a scoped second round only for money maths. Run touched tests only during tasks, and **one full gate per run**. Read diffs, not whole files. Group tasks into **one Codex session per area** (we used: T3.1+T3.1b, then T3.2+T3.3+T3.4, then T3.5+T3.6, then T4.1+T4.2), asking Codex to report **per task** with the files per task so you can split the patch into per-task commits (shared files may go in one commit; say so in the message).

### 1.2 How to talk to the owner
Plain, short answers. When Codex asks a question (the owner pastes a screenshot), reply with: the decision in one line (**"Answer 1, approve"** or the option number), why in one sentence, then a fenced block the owner pastes into Codex. Give a recommendation, not a survey. Ask the owner only for decisions that are genuinely theirs (product wording, risk acceptance, anything the docs mark open); settle technical details yourself and report them. Report outcomes faithfully: failures with their output, skipped steps said as skipped, verified things stated plainly.

---

## 2. Hard rules (security and safety; they still apply, verbatim from the handoff)

- **Never run** `clean-db`, `restore`, `rollback` or deploy scripts. **Never use `--allow-nav-writes`** (nor `--include-live-fetch`). **Never stop a running recompute.**
- The only staging writes are: hand imports of owner-supplied files, the `fund-managers-monthly` job, and the staging deploy at **S.1 after the owner's explicit go**.
- **"Plain words on every label."** No "TRI", "proxy" or "fallback" in any user-visible string (display names rewrite "TRI" to "Total Return").
- **Never commit factsheet PDFs or any CAS file.** Real PDFs stay in `Desktop\Unifolio\Factsheets` (WSL `/mnt/c/Users/Dell/Desktop/Unifolio/Factsheets`), never in the repo.
- **Commit locally with the prefix `cr-r<N>:`. Do NOT push or deploy unless the owner explicitly says so.** (One push was authorised after Run 1; every further push needs a new explicit go.)
- **Never run `git worktree prune`** (it would destroy the Windows worktree metadata).
- `CLAUDE.md`: ask before assuming anything the docs mark open; if a PRD, ADR or the schema conflicts with what is being built, stop and say so.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (use the attribution your own session's system reminder gives, if different). PR bodies end with "🤖 Generated with [Claude Code](https://claude.com/claude-code)".
- Money is `Decimal`, never `float`; strings in payloads. Everything is additive within a run; section keys in `analytics_sections` never change; old stored payloads must render as an "updating" state, never an error.
- `frontend/src/features/mutual-funds/guards.test.ts`: when files are added or deleted only its count and expected-file list may change; **never change a guard rule.** (Count is now 56.)
- Deliverables are `.md` files under `Docs/orchestration`. Justify any new table before proposing it (lead with the reuse-existing-tables alternative).

---

## 3. Environment (as the previous session had it; adapt paths if yours differ, keep the principles)

- Main repo `/mnt/c/Users/Dell/Desktop/MVP v1/MVP_V1_MF_only` is on a detached HEAD; **branch `leapswitch-redesign` is checked out in a Windows-created worktree `/mnt/c/Users/Dell/Desktop/MVP v1/wt/docs`.** WSL git cannot use it normally. Commit with an explicit git dir, **always batching calls** (status over the 9p mount is slow), and **always `unset` afterwards** (a leaked `GIT_DIR` made a later `git diff` print nothing):
  ```
  cd "/mnt/c/Users/Dell/Desktop/MVP v1/MVP_V1_MF_only"
  export GIT_DIR="$PWD/.git/worktrees/docs" GIT_WORK_TREE="/mnt/c/Users/Dell/Desktop/MVP v1/wt/docs"
  cd "$GIT_WORK_TREE"; git apply --index <patch>; git commit -F - <<'EOF' ... EOF
  git log --oneline -1; unset GIT_DIR GIT_WORK_TREE
  ```
- **Patch flow**: in the Codex clone `git add <paths> && git diff --cached HEAD > ~/x.patch && git reset -q` (split by paths for per-task commits), apply and commit in the worktree as above, then **sync the clone** (only when Codex is not mid-work, it wipes uncommitted edits): `cd ~/cr-run-1 && git fetch -q "<main repo>" leapswitch-redesign && git reset -q --hard FETCH_HEAD`.
- Python: `~/cr-venv/bin/python -m pytest <files>` from `backend/` (the repo's own `.venv` is a Windows one). Run tests with `TZ=UTC`. Node: `export PATH=$HOME/.nvm/versions/node/v20.20.2/bin:/usr/bin:/bin` then `npx --no-install vitest run <files> --maxWorkers=2|3`, `tsc -b`, `oxlint`, `vite build`.
- Real factsheet PDFs and text dumps: `Desktop\Unifolio\Factsheets\2026-10\` (11 PDFs: Axis, Bandhan, Edelweiss, HDFC active, ICICI Pru, ITI, Invesco, JM, Kotak, Trust, WhiteOak) and `2026-10-catalogue\` (text dumps incl. Groww and manual WhiteOak). Claude can read these; Codex's sandbox cannot. Text snippets for Codex were put under `~/r2-snippets` (not in the repo).
- Claude's Docker access was denied on that machine (`permission denied` on the socket), so **Postgres could not be run** there (see open item O1).

### 3.1 Known baseline failures (not ours; do not "fix" unasked)
- **5 backend tests** need the missing local `backend/.cache/amfi_navall/nav_all.txt`: four in `test_portfolio_disclosure_client.py` and one in `test_portfolio_disclosure_manual.py`.
- **Date-bug tests that fail only on the 31st of a month** (`test_benchmark.py` "switches" x2, `date.today().replace(month=month-1)`; `test_investment_withdrawal.py::test_quiet_months_and_years…` fails when the host clock is UTC but Kolkata is already the next month). They pass on other days / with `TZ=Asia/Kolkata`.
- **Load-flaky frontend tests**: `OverviewPage.test.tsx` "failed card shows error and retry refetches only that card" and `features/home/useNews.test.tsx`; each passes alone.

---

## 4. Where everything stands

Remote-tracking ref `origin/leapswitch-redesign` seen from the previous machine = **`9fa3cf9b`** (T2.9). **Everything after it is local only and NOT pushed**; the manager cannot see those commits until the owner says "push". Branch tip when this file was written: `bc52488c` plus this handoff commit. Tags (local): `cr-run-1-done` = `4651840a`, `cr-run-2-done` = `9fa5e20a`. `cr-run-3-done` and `cr-run-4-done` are **not yet set** (see section 8).

| Run | Items | Build | Review | Tag | Remaining before DONE |
|---|---|---|---|---|---|
| 1 Allocation, fund manager, overlap | 3, 13, 4, 5, 6 (+1.5b) | done | 2 rounds, fixed | `cr-run-1-done` | nothing in code; owner items O6 to O8 |
| 2 Other Analytics | 7A, 8, 9, 10, composite deleted | T2.1 to T2.9 done, **T2.11 done**, T2.12 **parked** | Run 2 review fixed; T2.11 reviewed in the Run 3 review | `cr-run-2-done` | T2.10 timing against G2 baselines (VM); T2.12 probe (O3) |
| 3 Benchmarks and switches | 11, 12 | T3.1 to T3.6 done | review done, 5 findings: 4 fixed, 1 limitation | **not set** | O1 (Postgres), O2 (gold limitation word), T3.7 timing/real-data steps (VM) |
| 4 Consolidated family holdings | 2 | T4.1, T4.2 done | round 1 done, 2 findings fixed | **not set** | scoped round 2 (section 9), T4.3 timing (VM) |
| 5 Head of Family backend | 1 | not started | | | migration 0050 etc. |
| 6 Head of Family frontend | 1 | not started | | | |
| 7 Logos, headings, green buttons | | not started | | | |
| D.1 documentation update | | not started | | | Claude only, owner reviews the diff |
| S.1 staging deploy | | not started | | | **owner's explicit go**, G2 baselines first |

### 4.1 Commit list since the Step 0 start (`9424aaf9`), oldest first
Run 1: `cf1ce545` T1.5b, `6f958de8`, `89036917` T1.1, `60b334c7` T1.2, `a3bc1608` T1.3, `5dd23f29` T1.4, `f5934f46` T1.5, `04d3834c` / `61d1f0c1` / `7f94e5ef` review fixes, `4651840a` close-out. Docs `5869cd3c`, `1242d6a6`.
Run 2: `33376f3b` T2.1, `10a173b1` T2.2, `a0474868` T2.2b, `a75e5a16` T2.3, `9e462778` T2.4, `e449460f` T2.5, `86e0ea10` T2.6, `953f353b` T2.7, `2fead760` T2.8, `9fa3cf9b` T2.9, `9fa5e20a` review fixes (tag), `dd6f4af2` docs, `4d2b5b0a` T2.11.
Run 3: `4a203f4e` docs, `771f6834` T3.1+T3.1b, `56e1353f` T3.2 to T3.4 (one commit, shared files), `351a7352` T3.5, `55b2871f` T3.6, `bcce0a6b` WhiteOak reader fix, `ef811f5f` review fixes.
Run 4: `7e6981ea`, `3479193b` docs, `510d43a1` T4.1, `31e1f3fd` T4.2, `bc52488c` review fixes.

---

## 5. What was built, run by run (essentials, decisions, deviations)

### Run 1 (done, tag `cr-run-1-done`, pushed)
Market cap adds to 100% (`percentage_classified`, `unclassified_share_pct`); asset class has five slices incl. Real Estate (Home shows it live); fund manager cards with `pick_main_manager` (a single ordinary manager is "marked"; sole specialist and equal co-managers "assumed"); overlap counts equity funds only (`equity_universe.py`, 65% net domestic equity rule) with a By category tab and a fourth reason sentence "This type of fund isn't counted in an equity overlap."; Stock Concentration removed from every screen; importer flags `--this-month-only` and `--as-of` for the four hand-import houses (Angel One, SBI, Sundaram, Mahindra), `--as-of` is checked against the file's own real-clock date. Recorded limitation: a slash-style w.e.f. date is not read.

### Run 2 (tag `cr-run-2-done`)
- Migration **0047** (`scheme_reported_valuation`; `stock_master` columns `bse_scrip_code`, `pe_as_of`, `pb_as_of`, `pe_source`; check constraints), **0048** (drops the composite ranking; downgrade verified identical to 0034).
- Factsheet P/E and P/B readers **only for Invesco, ITI, Kotak, ABSL** (readings verified on the real pages). **UTI is not built** (needs a real sample page). `check_manual_factsheets.py` missed-month alert, one crontab line `0 6 15 * *` in `deploy/leapswitch/crontab.leapswitch` (the owner installs it at deploy).
- `valuation.py`: per-fund `ValuationValue`; a factsheet figure is used if latest and at most 75 days old; computed figures need 70% coverage; the **portfolio total is the harmonic mean of fund figures weighted by each fund's equity rupees** (owner's choice); a forward factsheet P/E is replaced by the computed trailing value in the total only; **the total is shown only if funds with a usable figure cover at least 70% of equity** (my decision, owner to confirm). Golden 14.285714 and 2.857143.
- Performance Ranking (ties 1,2,2,4; index funds detected by the words "index" or "ETF" in name or category: my decision), composite ranking deleted, banner sentence verbatim in `otherLogic.ts`, old composite payloads show "Performance rankings are updating."
- Category Average Comparison: simple means within category and plan, 3-year floor on every period, no size data; the legacy `category_avg_return` stays (simple blended mean) for desktop/print/phone until the cleanup release; four old fields (`scheme_return`, `category_rank`, `category_size`, `percentile`) retired from the payload (old payloads still parse; frontend types optional). **Deviations**: the Scorer's `_rank_and_percentile` moved unchanged into `scorer.py` as `_score_rank_and_percentile` (the plan assumed no other user); the fund page deliberately **keeps size weighting** (27.5% on the fixture) while the new screen uses simple means (23.33%): the owner may want to know. `OtherAnalyticsPage.tsx` and `analytics/types.ts` were touched as extra files.
- Hide Fund Quality Scores: `SHOW_FUND_QUALITY_SCORES = false`; the group is not mounted and its data is not requested from that page; the score is still computed; Individual Fund and Home unchanged.
- **T2.11 BSE price file**: bhavcopy address pinned; BSE-only held stocks priced from the close; ratios computed (BSE close / Yahoo trailing EPS, / Yahoo book value) where both inputs exist, else provider ratio as supplied, else screener.in; non-positive close/EPS/book never stored; a missing or unreadable file is non-fatal and keeps existing rows. **Header names (`FinInstrmId`, `ISIN`, `TckrSymb`, `SctySrs`, `ClsPric`, `TradDt`...), equity groups (A, B, T, X, XT, Z, ZP, M, MT), the ISO trade-date format and Yahoo `<ticker>.BO` are ASSUMED and UNVERIFIED** (O4).
- **T2.12 PARKED**: the NSE cookie handshake gave 403 from the Codex environment (probably needs an Indian IP). A standalone probe script is committed at `Docs/orchestration/step0-vm-scripts/probe_nse_xbrl.py` (O3). Nothing built.
- Run 2 review fixes: a manager-overridden old factsheet keeps its own month for valuation figures (ages out under the 75-day rule); Print and Phone valuation card decides on fund-figure coverage for fresh payloads; category gap rounded once (+0.1 pts).

### Run 3 (built; review fixes applied)
- **Migration 0049** `0049_benchmark_index_registry.py`: creates `benchmark_index_master` (23 seeded rows), converts `benchmark_index_history.index_name` from the Postgres enum to **text**, drops/recreates the composite primary key, widens `value` to `Numeric(18,6)`, creates `scheme_benchmark` (Tier 1 drives comparison; Tier 2, Additional, `tracked_match_quality`, `printed_return_1y/3y/5y`, `printed_as_of`). Downgrade refuses if new text keys exist. **Edited in place across T3.1 to T3.3; no 0051 exists. Not applied to any shared database.**
- Registry (`benchmark_registry.py`): the 8 legacy indices, the 9 verified sector/thematic names (Bank, IT, Financial Services, India Consumption, India Manufacturing, Energy, Total Market, Private Bank, Infrastructure), Midcap 100, Smallcap 100, Smallcap 50, `Nifty500 Multicap 50:25:25` (exact spelling; `... Index` returns zero rows), Nifty 50 Arbitrage (price endpoint, stored as TRI, active), Nifty 1D Rate (inactive). **The plan's "about 40 indices" became 23**: other candidates (Quality 30, Value 50, ESG, Healthcare, factors, G-Sec, SDL) are unverified and pending a VM check with `verify_benchmark_sources.sh`. Adding a verified name = one row, no migration. The daily job fetches TRI for every non-legacy master row; an empty or malformed response is a failure with an alert and later indices continue.
- `benchmark_series_check.py` (read-only; 0.05-point rule; gold ETF within 0.5 point) built; **only run on a synthetic fixture**.
- Notes strings live in **one backend table** `benchmark_notes.py`; the payload carries the rendered text (deviation from the plan's "frontend reads it"; do not create a second copy).
- Readers/normaliser (`benchmark_layouts.py`, `benchmark_names.py`): exact aliases only; BSE names map to labelled **closest** NSE index; CRISIL and other unavailable series return no key and keep the declared name; weighted blends are never reduced to one part; Tier 2 and Additional stored only. **WhiteOak was fixed against the real 31 Aug 2026 PDF** (name sits on the line above the "Benchmark" label; 21 of 21 funds read). **UTI and Groww geometry is UNVERIFIED and fails closed** (no real PDFs/boxes locally). Printed returns read for the **Axis table shape only**.
- Selection (`fund_page/benchmark_select.py`, `benchmark_for_scheme`) is new and used only by the new surfaces; `_benchmark_index_for_category` and the stored `benchmark_funds` output are unchanged (golden tests); additive optional `declared_comparison` on the section response (shape: `scheme_id, scheme_name, index_key, source: factsheet|closest|category|none, declared_name, note, mapping_age_days, windows[{window, start_date, fund_xirr, benchmark_xirr, reason}]`), computed from data already loaded (history reads 1 to 1) inside a try so a failure leaves only that field empty.
- Screens: source labels in plain words **(deviation: plan's "Proxy: NSE"/"Category fallback" replaced by "From the fund's factsheet", "Closest index we hold", "Chosen by the fund's category", "No benchmark"; a fund with printed figures but no series reads "As printed in the fund house's factsheet")**. T3.6: "Switches: Included/Excluded" control, default Excluded, Net invested unchanged, tile renamed "Net invested", print stays excluded.
- Review (7 areas) findings fixed in `ef811f5f`: declared comparison failure guard; wrapped weighted blend; malformed HTTP 200 index response; printed-figures label. **Finding left open (limitation, needs the owner's word, O2):** a passing gold-ETF check never reaches selection (nothing stores the check result), so gold and silver funds show printed returns only, which is the plan's own outcome for a failed check. Recommended: accept now, wire it later with a real VM check.

### Run 4 (built; round 1 fixed)
`consolidate_holdings` plus `HoldingRow.folios` (masked, last 4 characters); additive `consolidated` list on the family holdings endpoint only (member endpoint excludes `folios`, byte-identical); parent = sum of children to the paisa (child money rounded once, then summed); average price = total invested / total units (now plain decimal text, never `5E+1`); parent XIRR = stored combined-scope `fund_xirr` from `benchmark_funds`, child = that member's stored rate, a dash when none and always above four members; Direct and Regular stay separate parents; flags and the opening-balance disclaimer carry up. Frontend: parent rows with a split bar from unit ownership (largest-remainder shares total exactly 100.00%), expand button (`aria-expanded`, keyboard), member rows with masked folio, roomier spacing, phone cards; single-member view and old payloads unchanged. Hand-checked shared fund: units 363011.298 + 119110.797 = 482122.095; invested 9429932.04 + 2715749.99 = 12145682.03; value 12458547.75 + 4087882.55 = 16546430.30; average 25.1921290394. **No visual check was ever possible**; the synthetic family gate used fixed synthetic prices on parsed `fam_10yr.pdf` transactions, not a full import.

---

## 6. Lessons from the work so far (these cost real rework)
- **Never reword an existing message, reason code or label** Codex was not asked to change (Run 1 broke an older test by rewording the importer's `stale_month`).
- A helper the plan said was unused turned out to have other callers (the Scorer) and a test elsewhere compared against it: **make Codex grep every old name, field and section key across backend, frontend, print, phone, Home, fixtures.**
- **Check Codex's claims**: re-run its touched tests, read the diff, hand-check the maths; real-file checks found a bug no fixture did (WhiteOak).
- Reviews found real bugs each time (stale dates relabelled, wrong gate on Print/Phone, double rounding, an unguarded call, `5E+1`); always triage with evidence, never auto-apply.
- A background job that prints nothing can look hung: use background + a completion notification, never `sleep`.
- A timing/clock bug in a test is not a product bug: check the date before blaming the diff.

---

## 7. Open items, by who must act

**Owner / manager (decisions or things only they can do)**
- **O1 Postgres run of migration 0049 (up and down)**: never run (no Docker for Claude). Do it before tagging Run 3: start Postgres (`docker compose up -d postgres`), set `TEST_DATABASE_URL`, run `tests/functional_postgres/test_migration_0049.py` and `test_benchmark_enum_0045.py`, plus a manual `alembic upgrade 0049` / `downgrade 0048` on a copy holding legacy history rows. Biggest open risk in Run 3.
- **O2 Gold/silver ETF comparison**: accept as a limitation (recommended) or ask for the wiring. Needs a real VM check against the held gold ETFs.
- **O3 T2.12 (book value from filings)**: run `python3 probe_nse_xbrl.py --symbol TCS` and `--symbol HDFCBANK` from an Indian-IP machine (script is read-only, one attachment, no retries) and paste the output; if both total equity attributable to owners and shares in issue are present, Step B proceeds (handoff `cr-r2-filings-book-value-handoff.md`); if not, record that Phase C stays on labelled fallbacks.
- **O4 BSE price file**: `head -2` of a recent `BhavCopy_BSE_CM_0_0_0_<date>_F_0000.CSV` from the VM, plus one Yahoo `.BO` check for a held BSE-only stock; Claude then corrects the constants (one place: `BSE_COLUMNS`, `BSE_EQUITY_SERIES` in `stock_fundamentals_client.py`).
- **O5 G2 timing baselines** (`2026-10-31-g2-timing-run-steps.md`, also on branch `docs/g2-timing-run`): the manager's Claude runs them on a trading day after 06:35 IST, read-only. They gate the S.1 deploy, and T2.10, T3.7, T4.3 timing checks compare against them. **DONE 2 Nov 2026 (08:41 to 08:49 IST), all gates pass:** results in `2026-11-02-g2-baselines-results.md`. Lesson: "after 06:35 IST" is not enough for Home, fund page and the matrix, because the old code needs a stored price dated today (published in the evening); they were measured on the stored-price path (`--simulate-fresh-cache`, and the same in-process date change for the matrix). New-code checks (T2.10, T3.7 real-data, T4.3 timing) wait for the S.1 deploy.
- **O6 18-fund net-equity list** (Run 1): a VM read-only query. **O7** confirm the fund-manager role readings (Associate, Co-Fund Manager, portion labels, senior titles, future start dates). **O8** confirm Real Estate live on Home.
- **O9 Real PDFs for UTI and Groww** (with word boxes) so their benchmark and valuation readers can be verified and the UTI valuation reader built.
- **O10 Mapping check by hand (about 1 day, plan)** and the **real-data runs**: `benchmark_series_check.py` PASS table, `benchmark_diff_report.py` (read-only; owner reviews its output before any user sees changed benchmarks), the pending index candidates via `verify_benchmark_sources.sh`.
- **O11 Product decisions the owner should confirm** (made by the orchestrator): 70%-of-equity rule for the portfolio P/E and P/B total; index-fund detection by words; BSE ratio compute rule; fund page keeps size weighting while Category Average uses simple means; 23 registered indices instead of about 40; plain-word source labels replacing the plan's two labels; benchmark notes in the backend only.
- **O12 Push**: the owner decides when to push `leapswitch-redesign`; the manager's Claude needs the branch visible, so ask for the push before anything else (section 9 step 0).

**Orchestrator (you)**: the logs are behind. Not yet updated: `Docs/orchestration/delegation-log.md` (last entries are Run 1), `session.md`, the handoff `Status` fields for Runs 2 to 4 (still OPEN; set DONE after their gates), run reports (one short close-out per run like Run 1's `4651840a`), and the decisions register. Do these at each run's close-out, then fully in Task D.1.

---

## 8. Closing a run (checklist)
1. Gate: full backend (`TZ=UTC`, ignore `tests/functional_postgres`), full frontend vitest, `tsc -b`, `oxlint`, `vite build`; expect only the baseline failures in 3.1.
2. Run the plan's gate items for that run (hand-checks, old-payload and section-list tests, synthetic gates, timing scripts vs G2 baselines on the VM).
3. Adversarial review (scope text pattern: commit range, handoffs, plan tasks, "look hardest at" ranked list, rules, known failures, report format). Triage, fix, scoped second round if money.
4. Tag locally (`cr-run-N-done`), update handoff Status to DONE, delegation log, session note. **Do not push.**

---

## 9. Do these next, in order
0. **Ask the owner to push `leapswitch-redesign` to GitHub** (or confirm it is already visible to you); verify your checkout's tip equals the tip named in section 4 and that tags `cr-run-1-done` and `cr-run-2-done` exist. Stop and say so if commits are missing. Set up your Codex clone synced to the tip.
1. **Run 4 scoped second round** (money): `/codex:adversarial-review` over `31e1f3fd..bc52488c` (the Run 4 fix commit), scope: `_allocate_paisa`, `consolidate_holdings` average-price text (no exponent form anywhere in the payload), `splitShares` (largest remainder, totals exactly 100.00, zero-total and huge-unit inputs), no float on rupees; and a quick regression read that parent = sum of children still holds. Then tag `cr-run-4-done` once clean and the VM timing step (O5) is done or waived by the owner.
2. **Run 3 close**: O1 (Postgres), O2 (owner's word), then tag `cr-run-3-done` after T3.7's remaining VM items are done or waived by the owner in writing.
3. **Run 5 (Head of Family backend)**: write the handoffs (`cr-r5-*`, a common-rules file like `cr-r3-common-rules.md`), then the first Codex prompt. Plan "Run 5", Tasks 5.1 to 5.7: migration **0050**, OTP purpose/TTL/emails, eligibility and label flip, request lifecycle and four codes, the swap transaction, undo and `/auth/me`. This is **security-sensitive**: expect a deeper review.
4. **Run 6 (frontend for it)**, **Run 7 (logos, headings, green token)**, **Task D.1** (documentation update; Claude only, owner reviews the diff; the full file list is in the plan's "Documentation update"), then **S.1** (a new deploy guide `Docs/orchestration/2026-10-31-staging-deploy-guide-change-requests.md` written by Claude: migrations 0047 to 0050 together, forced analytics recompute, check queries, timing scripts vs baseline, QA checklist incl. the head-of-family hand-over with two real inboxes; **deploy only on the owner's explicit go**, G2 baselines first; follow the 30 Oct VM lessons: query `analytics_recompute_status` first, never stop a recompute, start long jobs in the background, read `.env` under `sudo`, confirm every scope of every user has all 15 sections).
5. T2.12 Step B only after O3 passes; UTI reader after O9.

Write per-run handoffs the same way as before (`Docs/orchestration/cr-r<N>-<slug>-handoff.md`, status line, run/slug/prefix/tasks, order, rules pointer, short notes); keep them short and point to the plan for task text.

---

## 10. Codex prompt pattern that worked (reuse)
```
Run <N>, <tasks>. Clone synced to <short sha>. Read Docs/orchestration/cr-r<N>-common-rules.md, <handoff files> and the plan's "<Task X.Y>" sections.
<2 to 6 lines: the non-obvious constraints, additive/legacy rules, the data shapes the next task needs>
Tests first with the plan's names. Never reword existing messages or labels. Edits outside the Files list: ask first or list with the reason. Plain words in user strings. Run only touched tests plus every test reading a name you change (grep old names across backend, frontend, print, phone, Home, fixtures).
Do not commit. Short report per task: failing counts before/after, exact commands, files per task, decisions not covered, extra files with reasons. No visual check is possible: say so.
```
Codex's questions arrive as screenshots with 2 options; answer "1" or "2" plus a pasteable instruction block; if Codex asks for data you do not have (a real sample, a verified list), say so, pick the fail-closed option, and flag the assumption for the owner.

---

## 11. Key paths
- Plan (authoritative, task text): `Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md`; execution handoff: `Docs/superpowers/plans/2026-10-31-execution-handoff.md`; readiness review: `2026-10-31-readiness-review.md`.
- Run docs: `Docs/orchestration/cr-r1-*`, `cr-r2-*` (common rules + 8 handoffs), `cr-r3-*` (common rules + 5), `cr-r4-*` (common rules + 2); evidence for benchmark readers: `cr-r3-session2-benchmark-evidence.md`.
- Step 0 data and VM scripts: `Docs/orchestration/step0-data/`, `step0-vm-scripts/` (`verify_benchmark_sources.sh`, `vm_checks.sh`, the XBRL probe), `2026-10-31-factsheet-state-and-benchmark-gaps.md`; G2 steps `2026-10-31-g2-timing-run-steps.md`.
- Priority 1 (separate track, deadline 10 Nov 2026 06:00 IST, next `fund-managers-monthly` run): fund-manager factsheet access gaps; see `DEFERRED_FEATURES.md` and `a04-factsheet-access-gaps.html`. The hand-import houses need their monthly import; the alert crontab line is in this branch.
- Synthetic CAS for gates: `Docs/CAS Files/synthetic/pdfs/` (password `MF@123`).
