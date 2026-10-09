# Claude session handoff — 2026-10-09 (Sub-project 1 analytics, mid-A14)

**For:** the next Claude Code session (new Claude account, same machine and repo). Read this
whole file first, then `AGENTS.md` and `CLAUDE.md`, then the files it points to. It's written
so you can continue without the previous conversation.

**Repo:** `/mnt/c/Users/Dell/Desktop/MVP v1/MVP_V1_MF_only` (WSL), branch `feat/enhanced-ui`.
HEAD at handoff: `08b0b6e`. You orchestrate; Codex builds; the user relays between you.

---

## 1. Where we are, in one paragraph

Sub-project 1 adds five analytics attributes to Unifolio: **14** Investment & Withdrawal,
**12** TRI benchmark, **09** Fund ranking, **04** Fund manager allocation, **11** Scenario
simulator. Planning is finished; every plan was re-checked against the code on 9 Oct and
corrected; the user decided run order **14 → 12 → 09 → 04 → 11**. **A14's backend is built,
reviewed and committed. A14's frontend (Codex Run 2) is built and its review returned three
Med findings that still need fixing** (section 4.1). After that: commit A14 Tasks 4–6, run
the synthetic CAS harness, write docs, mark A14 done, then start A12 (its handoff is ready).

---

## 2. How we work (Claude ↔ Codex) — follow exactly

- **Roles.** Claude Code = orchestrator: reads plans, checks them against the code, writes
  handoff docs, rules on Codex's questions, verifies in WSL, runs reviews, makes small fixes,
  commits, runs the synthetic harness, writes docs. **Codex = worker**: builds one "run" per
  prompt from a handoff doc, test-first, self-reviews, prints a CODEX REPORT. Skill:
  `.claude/skills/model-orchestration/` (load it). Task-observer skill too (CLAUDE.md asks).
- **Manual relay, one Codex session at a time.** The `codex:codex-rescue` agent isn't available
  in these sessions. You give the user a short prompt; they paste it into Codex (Windows, repo
  root, fresh session); they paste Codex's report back to you.
- **Codex environment:** Windows, `backend\.venv\Scripts\python.exe -m pytest <files> -q -p no:cacheprovider`;
  frontend `npx vitest run <files>` and `npx tsc -b`. Codex's git is read-only (whitelist in
  each handoff) — it never stages or commits.
- **Your verification (WSL):** backend `cd backend && python3 -m pytest <files> -q -p no:cacheprovider`
  (system Python 3.14 has the deps; `backend/.venv` is a Windows venv — don't use it).
  Frontend `cd frontend && npx vitest run <files>` and `npx tsc -b` (slow on /mnt — use
  `run_in_background` for long runs). **Run only the test files a change touches, never full suites.**
- **Review gate (mandatory before a run is "done").** Dispatch an independent reviewer as a
  Claude subagent (`Agent`, `general-purpose`, **model sonnet** — token budget). **Opus only** for
  A04's matcher review, A11's engine review, and the final review across all five. Give it the
  plan path, the diff scope, what to check, and ask for a verdict + findings by severity.
- **Fixing findings:** small and in context → fix yourself, test-first (review-loop fix
  authorship), and record it in the handoff's round log; larger → a new Codex round.
- **Commits (user decision 9 Oct, Sub-project 1 only):** follow each plan task's `git add` /
  `git commit` step — **you** commit, one commit per task, after verifying. Never push. End
  messages with `Co-Authored-By: <your model> <noreply@anthropic.com>`. Outside plan tasks
  (docs, handoffs, artifacts), don't commit — tell the user which files changed; they commit.
  **Before each Codex run, make sure your doc changes are committed** (ask the user), or
  Codex's self-review may treat them as stray changes.
- **Logs:** every handoff status change → one line in `Docs/orchestration/delegation-log.md`;
  each run's outcome → the handoff's "Round log".
- **Testing gate per attribute (user, 9 Oct):** after review + commit, run the **synthetic**
  CAS harness only (no real CAS files). All synthetic PDFs use password **`MF@123`**; they live
  in `/mnt/c/Users/Dell/Desktop/Unifolio/CAS Files/synthetic/`. Extend the harness per
  attribute so it checks the new section's **values**, not just presence (section 5).
- **Staging:** none per attribute. All five go to staging together at the end (user, 9 Oct).
- **Plans:** edit plans **in place** (never write a new plan), keep the mirror copy in
  `Docs/analytics/plans/<same-name>-plan.md` identical (`cp` then `diff -q`).
- **The user's style:** wants detailed explanations with options + a recommendation + why,
  then decides; doesn't want over-engineering or anything that breaks the core of what each
  attribute calculates; likes artifacts for explainers (see section 7).

---

## 3. Decisions made on 9 Oct (don't re-litigate)

| Topic | Decision |
|---|---|
| Run order | 14 → 12 → 09 → 04 → 11, serial |
| Commits | Claude commits per plan task; never push |
| API field names in new TS types | snake_case (no camelCase layer exists) |
| A14 old 8 Oct plan | deleted; the committed 9 Oct plan is binding |
| A14 money | stamp duty included (`paid_amount`); a bounced SIP's `REVERSAL` nets against Invested |
| A14 gifts (option A) | gifts never Invested/Withdrawn; `absolute_gain = current + withdrawn − invested − gifts_net`; note under tiles |
| A14 missed SIPs, 2 folios of one fund | earliest statement end per member+scheme |
| TRI | used for every fund-vs-index comparison; price kept as raw data only; no fallback to price |
| A12 TRI history | daily job asks TRI from 1 Jan 1990 (price stays 10 yrs); no backfill script |
| Where plan fixes go | edited in place in the plans (+ mirrors) |
| Staging | once, at the end of Sub-project 1, on a wiped database |
| CAS testing | synthetic files only, per attribute, after review |

Recorded in `Docs/orchestration/delegation-log.md` (9 Oct lines) and each plan's
"Revised 2026-10-09" note. Also note commit `ccae0e0` (from the remote, 9 Oct) recorded in
`decisions.md`: **A11's hypothetical values and SEBI disclaimer are release gates** in
`DEFERRED_FEATURES.md`, and **A04 must scope all 57 AMCs individually**. Fold those into the
A11/A04 plans before those runs.

---

## 4. A14 — Investment & Withdrawal (in progress)

Plan: `Docs/superpowers/plans/2026-10-09-attribute-14-investment-withdrawal.md` ·
Handoff: `Docs/orchestration/a14-investment-withdrawal-handoff.md` (read its Round log).

**Done and committed:** Run 1 backend — `976bb2f` (Task 2 schemas incl. `gifts_net`),
`bf0e6cd` (Task 1 compute module with all rulings), `b3dc253` (Task 3, 8th `_SECTIONS` entry).
Reviewed (Sonnet): APPROVE; findings fixed. 91 backend tests green in WSL.

**Built, NOT committed (working tree):** Run 2 frontend by Codex + orchestrator fixes:
- new: `frontend/src/components/ui/charts/bar-chart.tsx` (+ `.test.tsx`),
  `frontend/src/features/analytics/InvestmentWithdrawalSection.tsx` (+ `.test.tsx`)
- modified: `features/analytics/types.ts`, `AnalyticsView.tsx`, `AnalyticsView.test.tsx`,
  `useAnalyticsScope.test.ts`, `mobile/features/analytics/MobileAnalyticsView.tsx`, `MobileAnalyticsView.test.tsx`
- orchestrator already added: period labels under bars (thinned to ≥48px apart),
  keyboard activation (role=button, tabIndex 0, Enter/Space), `formatLabel` prop,
  drill-in heading "January 2026", axis "Jan ’26". 59 tests green + `tsc -b` clean in WSL
  (files: the two new test files, AnalyticsView, MobileAnalyticsView, useAnalyticsScope,
  `features/dashboard/MainDashboardFlow.test.tsx`, `mobile/MobileRoot.test.tsx`).

### 4.1 Next: fix the Run 2 review findings (test-first, yourself)

Review verdict: CHANGES NEEDED. Fix these:
1. **[Med] `bar-chart.tsx` — `role="img"` on the `<svg>`** hides the per-bar buttons from
   assistive tech. Change to `role="group"` (keep the `aria-label`).
2. **[Med] many periods on a narrow screen** (20 yrs monthly ≈ 240 bars on 320px → ~1px
   slots, overlapping bars, untappable). Give each period a minimum slot (12px): chart width =
   `max(container width, n × 12 + margins)` inside an `overflow-x: auto` wrapper, initially
   scrolled to the end (latest months). Clamp `barWidth` to `(slot − GAP) / 2`. Add a test.
3. **[Med] `InvestmentWithdrawalSection.tsx` — skeleton forever on a failed section**
   (`isLoading || !data`). Show the skeleton only when `isLoading`; when `!data`, render the
   card with a short message, e.g. "Investment & withdrawal data isn't available right now."
   (the view's existing failed-section banner + Retry still shows). Other sections show a
   "No … data available" line when data is null (e.g. `CategoryRankingSection.tsx:72`). Add a test.
4. [Low] comment in `bar-chart.tsx` that a negative bucket (a reversal posted in a later month)
   is drawn as a zero-height bar on purpose; [Low] the `rupees` JSDoc sits above `MONTHS` —
   move it above `rupees`.

Then re-run the 7 frontend test files above + `npx tsc -b`, and dispatch a **scoped**
re-review (Sonnet) of just these fixes.

### 4.2 Then commit A14 Tasks 4–6 (three commits)

- Task 4: `bar-chart.tsx`, `bar-chart.test.tsx` — "feat: add reusable visx bar chart component".
- Task 5: `types.ts`, `useAnalyticsScope.test.ts`, and the **AGGREGATE_FIELD/type hunks** of
  both views + their test fixtures — "feat: register investment_withdrawal as the 8th analytics
  section (frontend)". The views mix Task 5 and Task 6 hunks; if splitting with
  `git add -p` isn't practical non-interactively, commit Tasks 5+6 together and say so in the message.
- Task 6: the section component + its test + the render hunks — "feat: render investment &
  withdrawal analysis section".

### 4.3 Then the synthetic harness gate for A14

I extended the harness (uncommitted): `Docs/CAS Files/synthetic/harness/test_deep.py` has a new
`a14_checks()` and asserts `out["a14"]["mismatches"]` is empty when `ANALYTICS=1`. It checks:
tiles agree (net, gain incl. `gifts_net`); monthly and yearly sums = tiles; each bucket = its
entries; months continuous through the current month; current value = dashboard holdings;
SIP count/total = dashboard SIP list (series_count weighted); invested/withdrawn/gifts = the
CAS rows of the last file (skipped when a fund has an opening balance or `A14_TRUTH=0`).
**First result (p20_20yr, run 9 Oct before the handoff — 6 min 50 s):** the run FAILED, on
the A14 check only, and the failure is in the **harness**, not the app:
- **A14 matched the CAS rows exactly:** Invested ₹5,27,02,707.15 = CAS, Withdrawn
  ₹93,73,311.50 = CAS, gifts 0; SIPs 5 active / ₹2,20,210.23 = dashboard; 248 continuous
  months; all 8 sections present, none failed; reconcile all-match; stamp_unattached 0; 0 TER fetches.
- **Mismatch:** `current value 198247435.82 != dashboard 198247435.8206767` — the app rounds the
  summed holdings to paise; the check summed the dashboard's unrounded per-holding values.
  **Fix the check** in `a14_checks()` (section 4 of it): compare against
  `cv_dash.quantize(D("0.01"))`. Don't change the app.
- **Then watch the timing gate:** this run's `analytics_seconds` was **49.6 s**; the harness's
  next assertion (after the A14 one) is `analytics_seconds <= ANALYTICS_MAX_SECONDS` (default
  **30**), so it will likely fail next. Don't raise the limit (rule from the analytics-speed
  handoff, `Docs/orchestration/analytics-speed-stamp-duty-handoff.md`). Find out whether A14
  added the time or it was already over: time each section (e.g. re-run with the
  `investment_withdrawal` `_SectionSpec` temporarily removed, or log per-section durations in
  `recompute_household_analytics` locally — don't commit that), compare, and report the numbers
  to the user before changing anything. If A14 is the cost, the likely culprit is
  `compute_holdings`/`compute_active_sips` per scope; if not, it's a pre-existing gap to raise
  with the user (WSL on /mnt is slower than the earlier measurements).

Command (WSL, from `backend/`, ~7 min each; use `run_in_background`):

```bash
H="../Docs/CAS Files/synthetic/harness"; M="$(realpath "../Docs/CAS Files/synthetic/navall_2026-10-06.txt")"; E=/tmp/syn; mkdir -p $E
env SEQ=p20_20yr.pdf OUT=$E/p20.json SNAP=1 ANALYTICS=1 MASTER_FILE="$M" PYTHONWARNINGS=ignore \
  timeout 1800 python3 -m pytest "$H/test_deep.py" -q -p no:cacheprovider --rootdir "$H" > $E/p20.log 2>&1
```

Scenario set (from `harness/rundeep.sh`; all with `ANALYTICS=1 MASTER_FILE=…`):
`p20_20yr.pdf` (SNAP=1) · `p10_10yr.pdf` · `p7_7yr.pdf` · `p20_FY.pdf,p20_20yr.pdf` (stale) ·
`fam_10yr.pdf` (family) · `p20_10yr.pdf,p20_FY_altfolio.pdf` (**A14_TRUTH=0**: other folio) ·
`p20_FY.pdf,p20_20yr.pdf` with `DELETE_FIRST=1` · `p7_7yr.pdf,p7_7yr.pdf` (twice).
If a mismatch appears, decide whether the app or the check is wrong (read the `a14` block in
the output JSON) before changing anything. Commit nothing in `Docs/CAS Files/` yourself — tell
the user the harness file changed.

### 4.4 Then close A14

Docs: `log.md` (append), `session.md` (overwrite current status), `backend.md` (new section +
gift/SIP rules), the A14 handoff Status → DONE + round log, `delegation-log.md`, the
`Docs/orchestration/subproject1-execution/a14-investment-withdrawal.html` page (status "done",
harness results). Known accepted limits: a GIFT_IN stored at ₹0 (CAS had no NAV) still
counts in Gain; long monthly ranges scroll horizontally.

---

## 5. A12 — TRI benchmark (next)

Plan (revised in place 9 Oct, mirror synced): `Docs/superpowers/plans/2026-10-09-attribute-12-tri-benchmark-sourcing.md`.
Handoff ready: `Docs/orchestration/a12-tri-benchmark-sourcing-handoff.md` — **one run, Tasks 1–6**.
Key points already in the plan: `return_type` column (Python default PRICE + server default),
migration with a **SQLite `batch_alter_table` branch** (`tests/test_migrations.py`
round-trips on SQLite) and a downgrade that **deletes TRI rows first** (both verified on
SQLite 9 Oct); daily job TRI from 1990; Task 6 switches `benchmark.py` to TRI and moves
`test_benchmark.py` fixtures to TRI; Task 5 updates the existing job test in
`tests/scripts/test_background_jobs.py`. Migration will be **0033** (check `ls` first).
Your extra step after Codex: run `alembic upgrade head`, `downgrade -1`, `upgrade head`
against **local Postgres** in WSL (Codex can't). A12's synthetic gate: the harness should show
TRI rows loaded and the benchmark section computed (extend `test_deep.py` similarly; the
harness hits real NSE — measured fine: one request per index, ~1 MB, ~0.3 s).

**Prompt for Codex (A12 Run 1)** — give it after A14 is committed and docs are committed:
```
Read Docs/orchestration/a12-tri-benchmark-sourcing-handoff.md and follow it exactly.
Do Run 1: plan Tasks 1–6 from Docs/superpowers/plans/2026-10-09-attribute-12-tri-benchmark-sourcing.md, in order, test-first.
Create only the one migration file; never run alembic against a real database. Don't commit or stage anything. End by printing the CODEX REPORT from the handoff, filled in, in one fenced code block.
```

---

## 6. After A12 — what's still open

- **A09 Fund ranking** — plan: `Docs/superpowers/plans/2026-10-09-attribute-09-fund-ranking.md`.
  Decided: composite_score bug fix (store the composite, not the percentile), `toPercentString`,
  add the same-day duplicate-write test. **Open (user's call): fix 3, thin category** —
  recommended: use the ranked count for both size and the thin flag, like `category_ranking.py:267`.
  Plan not yet revised; handoff not written.
- **A04 Fund manager** — decided: fund-level matching + write to every plan variant in the
  `(amc_name, base_name)` family, plus ISIN when printed and a SEBI-category gate on fuzzy;
  per-AMC catch-all + commit per AMC + `FUND_MANAGER_ALERT` log line → CloudWatch metric filter
  + alarm → existing `ops_alerts` SNS (no new app permissions); rows older than 3 months count as
  unavailable; download **every reachable AMC's factsheet** to build a layout catalogue before
  Run 1; factsheet content + "as on" month check for every resolver. **Waiting on the user:**
  HDFC, Kotak, Edelweiss factsheet PDFs + page URLs (ops team), saved outside the repo, e.g.
  `Desktop/Unifolio/Factsheets/2026-09/`. Also fold in `ccae0e0` (all 57 AMCs scoped individually).
- **A11 Scenario simulator** — 8 proposed fixes not yet reviewed by the user (settled scenarios
  never computed → add compute-all script; postgres ARRAY breaks every SQLite test (verified) →
  `JSON().with_variant(ARRAY)`; gold ETFs bucketed as Index/ETF; seed check 31 vs 34 rows;
  three engine tests broken; household-weighted portfolio %; Franklin freeze match on
  `base_name`; frontend fetch/nav/tokens), plus one decision (picker quick stat: recommended Nifty
  50 TRI move). Fold in `ccae0e0`'s release gates. Heaviest attribute; Opus review.
- **End of Sub-project 1:** one staging deploy for all five (wiped DB), the user's manual check,
  final Opus review across all five.

---

## 7. Explainer artifacts

Six explainer pages exist (overview + one per attribute). The published links belong to the
**previous Claude account**, so you can't update those URLs. The standalone HTML copies are in
`Docs/orchestration/subproject1-execution/` (**still untracked — ask the user to commit them**).
They include, per attribute: before/after flow and ER diagrams (Mermaid), a change map, the run
passes, and an "Issues, by status" section (Resolved / Waiting on your decision / Waiting on
files / Proposed). To update one, edit the HTML file directly and republish it with the
Artifact tool as a new artifact on this account (tell the user the new link). Memory says
manager-facing explainers go out as artifacts; reports otherwise go to `Docs/orchestration/` as `.md`.

---

## 8. Memory (local to this machine — should still be there)

`~/.claude/projects/-mnt-c-Users-Dell-Desktop-MVP-v1-MVP-V1-MF-only/memory/MEMORY.md` lists:
deliverables as .md vs artifacts; justify new tables; **never commit (exception: Sub-project 1
plan tasks, never push)**; token-budget plan execution (Sonnet default, Opus for riskiest +
final); run affected tests only; plan answers are not a go (update artifacts, build on explicit
go); CAS test file locations; guides start/stop the bastion; **CAS-test every attribute
(synthetic only, MF@123)**. If the memory directory is missing on this account, treat the rules
above as binding anyway.

---

## 9. Exactly where the previous session stopped

The user asked the new session to take over **everything from this point**. The previous
session's last state:
- Run 2 review: **done** (verdict CHANGES NEEDED). **None of its fixes are applied** (§4.1).
- A14 frontend: **uncommitted** (§4.2 not started).
- Synthetic gate: harness extended (uncommitted), **one run done** (p20, result in §4.3);
  the harness rounding fix and the timing question are next; the other 7 scenarios not run.
- Docs for A14's close (§4.4): not started.
- A12: handoff ready, not issued.
- Uncommitted doc changes the user was asked to commit before switching: this file, the A14
  handoff round log, `delegation-log.md`, `Docs/orchestration/subproject1-execution/`, and
  `Docs/CAS Files/synthetic/harness/test_deep.py`. Check `git status` — if they're still
  uncommitted, ask the user to commit them (only the frontend files should stay uncommitted
  for you to commit per task).

## 10. Your first actions

1. Load the task-observer and model-orchestration skills; read `AGENTS.md`, `CLAUDE.md`, this file,
   and the A14 handoff's Round log.
2. `git status --short` / `git log --oneline -5` — confirm the working tree matches section 4.
3. Do section 4.1 → 4.2 → 4.3 (harness rounding fix first, then the timing question, then
   the remaining 7 scenarios) → 4.4, reporting to the user at each step.
4. Ask the user to commit the docs (this file, the harness change after its run, the
   `subproject1-execution/` folder), then give them the A12 prompt (section 5).
