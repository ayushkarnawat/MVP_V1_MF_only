# Handoff: a04-fund-manager
**Status:** OPEN — Run 1 approved and committed (`bede56a`…`4f72480`); Run 2 approved and committed; Runs 3–9 and close-out done; open gaps are Priority 1 (DEFERRED_FEATURES.md) (Task 8 onboarding runs 3–8), 2026-10-10
**Parent plan:** `Docs/superpowers/plans/2026-10-09-attribute-04-fund-manager-allocation.md` (binding, as revised 9 Oct — read its "Revised 2026-10-09" block, Global Constraints and Review Focus 1–7 first)
**Spec:** `Docs/analytics/2026-10-07-sub-project-1-planning.md`, "Attribute 04" · `Docs/analytics/2026-10-08-attribute-04-fund-manager-spec.md` · catalogue: `Docs/analytics/2026-10-09-attribute-04-factsheet-layouts.md` · explainer: `Docs/orchestration/subproject1-execution/a04-fund-manager.html`
**Orchestrator:** Claude Code (rulings, WSL + Postgres verification, review, commits, docs) · **Worker:** Codex
**Review baseline:** HEAD when the user pastes the prompt (`git log -1 --format=%h`, put it in the report)

---

## How this works (read first)

1. The user pastes a short prompt into Codex naming the run.
2. Codex reads this file and the plan, then implements the run's tasks in order, test-first.
3. Codex self-reviews, fixes what it can, and ends by printing the **CODEX REPORT** (template below) in one fenced code block.
4. Claude Code re-runs the tests in WSL, runs the migration on local Postgres, reviews, commits per task, and closes the run or writes a fix round.

## Runs

| Run | Plan tasks | What |
|---|---|---|
| **Run 1** | 1, 3b, 2, 3, 4, 5, 6, 21 | Backend: table + migration, per-AMC readers (Nippon, Edelweiss, HDFC, Kotak, ABSL) with real-text fixtures, the 55-entry registry, matching/import/checks/alerts, monthly job + Terraform alarm, household aggregation (3-month staleness), the analytics section, the manual-import CLI |
| **Run 2** | 7 | Frontend: `FundManagerSection.tsx`, types, Analytics + print wiring |
| **Runs 3–9** | 8 (batches) | Onboard the other 51 AMCs, one procedure each, coverage ≥ 90% or a reason per miss |

## Where things stand — 2026-10-09

- **Latest migration is `0034` (A09).** This one is expected to be `0035` — run `ls backend/alembic/versions | sort | tail -5` first.
- **Real text for fixtures** is in `C:\Users\Dell\Desktop\Unifolio\Factsheets\2026-10-catalogue\` (Nippon, Edelweiss and the other fetched AMCs; `manual_hdfc_aug2026.txt`, `manual_kotak_sep2026.txt`). Copy two scheme pages per reader **verbatim** into `backend/tests/fixtures/factsheets/` (1–3 KB each). Never commit the PDFs or the full dumps.
- **The readers in Task 3b were run on the real files on 9 Oct** with Task 3's matcher: Nippon 100/108 live funds, Edelweiss 75/76, HDFC 53/53 active, Kotak 112/120, ABSL 82/104 (ABSL stays `layout=None` in the registry until its Task 8 onboarding).
- **No live network calls in tests.** Mock `httpx`; the only real-world data in tests is the fixture text.

## Constraints (non-negotiable)

**Running alongside A11 (10 Oct, Runs 8–9).** Another Codex session is building A11 (scenario simulator) in this same working tree. Never edit, revert or format its files: `backend/app/services/analytics/scenario_*.py`, `backend/app/api/scenarios.py`, `backend/app/models/reference.py`, `backend/app/config.py`, `backend/app/main.py`, `backend/tests/conftest.py`, `backend/scripts/compute_all_scenarios.py`, `backend/scripts/jobs/backfill_scheme_nav_history.py`, `refresh_nav_daily.py`, new migrations, and their tests. List only this run's files in the report. If a shared test fails in an A11 file, report it, don't fix it.

**Git — read-only, whitelist.** Only `git status`, `git diff`, `git log`, `git show`, `git grep`, `git ls-files`. Leave everything uncommitted.

**Allowed to create:** exactly one new migration. **Don't run `alembic upgrade`/`downgrade` against any real database.** **Terraform:** edit `infra/modules/scheduler/main.tf` as Task 4 says and run only `terraform fmt -check` / `terraform validate` — never `plan` or `apply`.

**Never touch:** `backend/.env`, existing migrations, `frontend/` (Run 1), real CAS PDFs, `Docs/**`, `DEFERRED_FEATURES.md`, `decisions.md`, `log.md`, `session.md`, `CLAUDE.md`, `AGENTS.md`, `backend.md`, `database.md`.

**Follow the plan literally.** Mechanics differ? Adapt minimally and record under "Deviations". Behaviour, formula or interface would change? Stop that part, record it under "Open questions", continue.

**Test-first.** Test → fail for the right reason → implement → green.

**Tests: only the named files, never a full suite.** Windows, from `backend\`: `.venv\Scripts\python.exe -m pytest <files> -q -p no:cacheprovider`. Final run includes every new test file plus `tests/services/analytics/test_recompute.py`, `tests/api/test_analytics_route.py`, `tests/test_migrations.py`; `git grep` the tests for `_SECTIONS` and `SchemeFundManager` and add what matches.

**Project rules** (`AGENTS.md`): Decimal, never float; LF, UTF-8; no new dependencies (`pypdfium2` is already installed).

## Approaches considered and rejected (don't re-litigate)

- **One generic manager regex** — matched 5 of 22 AMCs' real files; per-AMC readers instead (card 3).
- **"First line of the page is the scheme name"** — wrong for most AMCs; per-AMC heading rules.
- **Matching per plan row** — matching is per fund family, written to every plan row (card 1).
- **An AUM tie-break and a saved alias table** — not needed: matching hit 100% of extracted names on the real files.
- **The job publishing to SNS itself** — needs a task role; a log metric filter + alarm instead (card 2).
- **Edelweiss as manual** — its page served the September file over plain HTTP on 9 Oct.
- **Deferring any AMC past staging** — every AMC is onboarded in Runs 3–9.

## Open questions (Codex: flag back, don't guess)

- If a fixture page from the real text doesn't produce exactly what the plan's reader expects, report the page and the output — don't loosen the regex to pass.
- If `infra/modules/scheduler/variables.tf` names differ from the Terraform in Task 4, use the real names and list them as a deviation.

---

## Self-review (before printing the report)

1. `git diff --stat` / `git status --porcelain`: every change belongs to this run.
2. `git diff --cached --stat` is empty.
3. Review against Review Focus 1–7. Also check:
   - every manager write goes to all rows of the matched family;
   - matching never crosses AMCs;
   - a stale or non-factsheet file writes nothing;
   - one AMC raising doesn't stop the loop and logs one `FUND_MANAGER_ALERT` line;
   - MANUAL and `layout=None` AMCs are skipped by the job;
   - registry keys equal NAVAll `amc_name` values exactly;
   - no float maths;
   - fixtures are verbatim excerpts.
4. Fix what you find, re-run the affected tests, and list every finding.

---

## CODEX REPORT — template (print this, filled in, in ONE fenced code block at the very end)

```
CODEX REPORT — a04-fund-manager — Run <n>
Run date/time: <…>    Environment: Windows    Python: <version>    Baseline HEAD: <hash>

1. TASK STATUS
   Task <n>: DONE | PARTIAL | BLOCKED — <one line>   (one line per task)

2. FILES (grouped by plan task, so the orchestrator can commit per task)
   Task <n>: <files>
   Migration file + revision id: <name>, revision <id>, down_revision <id>
   New (untracked):     <from git status --porcelain>
   Staged (must be empty): <git diff --cached --stat>

3. TESTS (exact command + last 3 lines of output)
   RED:   <command> → <failed as expected because …>   (per task)
   GREEN: <command> → <N passed …>
   Extra files added via grep: <files>

4. DEVIATIONS FROM THE PLAN (mechanics only)
   - <task/step> — said <…>; code needed <…>; file:line — why

5. OPEN QUESTIONS / BLOCKERS
   - <question> — what I'd need decided

6. SELF-REVIEW FINDINGS
   - [High/Med/Low] file:line — <finding> — FIXED | NOT FIXED (why)

7. ANYTHING ELSE CLAUDE SHOULD KNOW

8. CONFIRMATIONS
   - No git write commands used: YES/NO
   - Full suites not run: YES/NO
   - No alembic upgrade/downgrade against a real database: YES/NO
   - Docs/, infra/, frontend/ (Run 1), existing migrations untouched: YES/NO
```

---

## Round log (orchestrator appends after each report)

| Round | Run | Result | Notes |
|---|---|---|---|
| 1 | Run 1 | approved 2026-10-09 | Tasks built (Codex: 116 passed, 1 deliberate failure). Codex's 7 questions ruled — fixed by orchestrator test-first: Mrs/Mr honorific bug (plan bug), HDFC overseas-footnote co-managers, joint holdings shown once, future as-on dates ignored; plus HDFC handover note found in the real file; kept: no category gate without a printed category, exactly-0.05 accepted, JSON_API per onboarding, ABSL needs dates (Review Focus 5 → Kotak). Review (Opus): CHANGES NEEDED → all 8 fixed test-first: per-fund roles + card badge only when all agree, whole-word month names, dead link falls through, 60 MB cap, &amp;/\\u0026 decoding, directory <40 AMCs alert, duplicate name written once, 3-month window = 3 periods. WSL 129 passed; Postgres 0035 round trip clean; terraform fmt/validate passed (Codex). Committed per task. Pending: CLI on the real HDFC/Kotak files (Task 21 Step 5) with the scheme master loaded. |
| 2 | Run 2 | approved 2026-10-09 | Task 7 built (37 tests, tsc clean). Codex question ruled: the PDF prints every card open (`printMode`, orchestrator, test-first). Orchestrator also: valid phrasing content inside the card button, `fundManager` optional on old exports, "₹" on amounts like the other cards. Review (Sonnet): APPROVE (Lows: shared currency helper, name-keyed state, failed section via page banner, mobile scope gate — all consistent with siblings). 51 tests + tsc clean. |
| 3 | Run 3 | approved 2026-10-10 | Batch 1: 8 of 10 onboarded (commit `0cba4eb`); orchestrator re-ran every enabled AMC live and reproduced coverage (Abakkus 4/4, ABSL 103/104, Canara 27/27, Capitalmind 4/4, DSP 88/92, Groww 62/62, Helios 8/8, HSBC 44/45; Nippon 99/107, Edelweiss 75/76). Bajaj (no current file) and LIC (needs boxes + multi-scheme pages, approved for Run 4) off. Orchestrator fixes, test-first: link dates from file name + dedupe (replaces HSBC special case). Review (Sonnet): CHANGES NEEDED → fixed: Groww departed manager ("Ceased to be FM") was written as current (High); ABSL previous-year fallback in January; Groww malformed document skipped; Canara keeps a manager without a parseable date. 121 tests pass. |
| 4 | Run 4 | approved 2026-10-10 | Batch 2 + LIC (commit `2c2af4d`): 8 enabled, coverage reproduced live through the real import path (LIC 43/43 with word boxes, NJ 7/7, PPFAS 7/7, Quantum 15/15, Shriram 10/11, Sundaram 40/40, Unifi 3/3, Zerodha 22/23). Mirae (two files a month), quant (month-date form) and Samco (no current file) off — Run 4 rulings in plan. Orchestrator fix, test-first: day-first/ordinal managing-since dates parsed. Review done inline by the orchestrator (the review subagent hit an API usage limit): no defects in the multi-scheme/boxes plumbing, AMC-scoped adapters, aliases or the shared departed-manager filter. 172 + 8 date tests pass. |
| 5 | Run 5 | approved 2026-10-10 | Commit `14ed159`. quant 30/31 and PGIM 25/25 on (reproduced live). Multi-file `documents` and per-AMC `as_on_pattern` built. Mirae/Choice/UTI readers built, off until the Run 5 rulings (whole-file date scan; same-fund exact ties) are implemented in Run 6. Axis, ICICI, ITI, Trust, WhiteOak: bot-protected / JS sources — user decision pending (manual import recommended). Review (Sonnet): CHANGES NEEDED → fixed by orchestrator, test-first: a fund on two pages/files lost the first page's managers (merge per fund, write once; manual CLI imports all files in one pass); PGIM role pattern swallowed the next manager's "(w.e.f." and dropped that manager; PGIM trailing separators; Choice names with dots/hyphens. UTI `date.today()` note: already testable via the module date fixture. 222 tests pass. |
| 6 | Run 6 | approved 2026-10-10 | Commits `dc3889b`, `13d7685`, `d1086db`. Codex's final test run was blocked by the Windows sandbox; orchestrator ran it in WSL (320 → 325 passed after fixes). Coverage reproduced: Mirae 98/99, Choice 4/4 (live); Axis 88/89, ICICI 152/158, ITI 20/21, Trust 11/11, WhiteOak 22/22 (MANUAL, user's files via the CLI path). Orchestrator fixes, test-first: UTI live returned `no_factsheet_link` — October files are named "Fund Watch (Active)", pattern only matched `watch_active` (widened incl. `%20`/`-`; live 84/88 on the October files); Codex's tie question ruled: compare `canonical_category` (A09) — UTI regular/segregated Credit Risk and Medium Term now tie (+4); ICICI table split "Masoomi Jhurmarvala" (word 0.06pt left of a column edge → columns by word centre); WhiteOak "((Equity)" role; ITI "19-June-23" date; manual CLI passes `as_on_pattern`. Review (Sonnet): APPROVE. Kept, recorded: whole-file date scan's residual risk (a later date printed inside a stale file — accepted under ruling 1); ICICI prose names with initials, Axis name substring pairing, prose-only departures (none seen in real files). ICICI's 6 legacy Dividend/Cash Option families left unmatched (96%; no shared-normalisation change). Stale `index.lock` (Codex sandbox) removed again before commit. |
| 7 | Run 7 | approved 2026-10-10 | Commit `315e9cf`. Codex's final run blocked by the Windows sandbox again; orchestrator ran it in WSL (368 → 376 passed after fixes). Live coverage reproduced: 360 ONE 12/12, Angel One 11/11, Baroda BNP 47/47, Franklin 38/42, Jio BlackRock 15/16; every extracted name checked by hand (no fragments). Orchestrator ruling: Bank of India enabled at 22/25 (a reason per miss: two closed-end tax series + Value Fund absent from the file) — live 22/25. Review (Sonnet): CHANGES NEEDED → fixed test-first: Jio action regex could span two server references; only the first page chunk was searched; hex RSC row ids; Franklin dropped hyphen/apostrophe surnames. (Its High — BOI "enabled" test vs disabled entry — was read mid-change; resolved by the ruling.) Kept, recorded: `_link_date` digit boundaries (would change link dating for every enabled AMC; the 45-day gate catches a stale pick); Angel dropdown-first dating; Franklin/360 readers' title/Dr./Mrs. edge cases. 360 ONE prints managing-since only in performance footnotes → Run 8. Off pending user: ASK (one-fund file vs 3-scheme gate), Bandhan (401 without an API key — not to be worked around), Invesco (403), JM Financial (406). |
| 8 | Run 8 | approved 2026-10-10 | Commit `8839404` (A11's files, in the same tree, excluded). Codex's final run sandbox-blocked; orchestrator ran it in WSL (427 → 439 passed). Coverage reproduced: SBI 104/120 (16 FMP/LTAF series have no manager page), Tata 67/68, Motilal 88/90, Mahindra 27/27, ASK 1/1, 360 ONE 12/12 (live); Bandhan 87/89, Invesco 44/50, JM 17/17 (MANUAL, CLI path). Names checked by hand: SBI's Srinivasan/Pant left only the `*` fund and are correctly current elsewhere; no same-fund duplicates (SBI's two spellings of two managers are across funds — left as printed). User ruling: Mahindra's anonymous, encrypted download list stays automatic (page's own public decoding, no credentials); switch to MANUAL if it breaks. Review (Sonnet): CHANGES NEEDED → fixed test-first: 196 Run 8 managing-since dates were unparsed (U+FFFE separators, "Dec-2023", "Jan - 2026", "July 1st ,2025", "13-October-2025") — orchestrator then checked all 34 automated AMCs live: Run 8 AMCs 0 unparsed; UTI trailing comma fixed; Tata skips an erroring month. Kept, recorded: SBI/Tata/Motilal date links by label only (Run 3 ruling 1 — URL folders carry unrelated years). For Run 9: HSBC reader captures trailing text into since_raw on 6/117 rows ("Sep 08, 2026 Fund Performance (CAGR)…"). |
| 9 | Run 9 | approved 2026-10-10 | Commit `cce6e60` (A11 Run 2's frontend files, in the same tree, excluded). Codex's final run sandbox-blocked; orchestrator ran it in WSL (478 → 481 passed after fixes). Live coverage reproduced: Navi 17/18, Old Bridge 3/3, Taurus 8/10 (2 liability pools, no managers), Wealth Company 11/12, Union 32/32, Samco 13/13 (now publishing current files), HSBC 44/45; dates: 0 unparsed except "inception". Orchestrator fixes, test-first: HSBC names printed one per line came back joined ("Mahesh Chhabria Mr. Shriram Ramanathan") — split, each with its own date; U+FFFE stored as "-" in names/roles/dates (Union role); review: Taurus falls back to last year's listing in early January. Review (Sonnet): APPROVE (Lows kept: Taurus partial box fallback, Union three-part names degrade to NULL date). Off with evidence: AlphaGrep, IL&FS (IDF), Lakshya, Monarch (no current factsheet published), Bajaj (July file latest). **Task 8 complete:** 55 AMCs — 40 automatic, 10 MANUAL (Axis, Bandhan, HDFC, ICICI Prudential, Invesco, ITI, JM Financial, Kotak, Trust, WhiteOak), 5 off. |
| 10 | Close-out | done 2026-10-10 | Real monthly job on local Postgres: 40/40 AMCs, 1,424 funds, no alerts; peaked at 2.9 GB (unclosed PDFium handles) → fixed `9c64f77` (0.94 GB, <2 min) and job memory 2 GB `5f2f779`. Task 21 Step 5 done: manual CLI on all 10 real files against Postgres (HDFC 53 active — passive file untested, Kotak 112, ICICI 156, Axis 88, Bandhan 87, Invesco 44, WhiteOak 22, ITI 20, JM 17, Trust 11). Synthetic gate 8/8 with new `a04_checks` (FM_FILE fixture from the real run): 0 mismatches. Docs: log.md, backend.md, database.md, decisions.md, deploy guide numbers. Open gaps → Priority 1 in DEFERRED_FEATURES.md (deadline 10 Nov 2026). |
