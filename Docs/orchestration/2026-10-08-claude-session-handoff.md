# Claude session handoff — 2026-10-08

**For:** the next Claude Code session (a different Claude account) picking up from here.
**Read this whole file first**, then `AGENTS.md`, `CLAUDE.md` and `session.md`, then the documents named under "Read next". Don't re-derive what's written here.

---

## 1. What we are doing right now (one paragraph)

We are executing **`Docs/superpowers/plans/2026-10-07-analytics-speed-and-stamp-duty.md`**: make the Analytics page load in seconds instead of 30+ minutes on staging, stop TER from being fuzzy-matched to the wrong fund, and make Total Invested include stamp duty so it equals the CAS. It's built with the **Claude (orchestrator) + Codex (worker)** flow over three Codex runs. **Run 1 (analytics speed, Tasks 1–5B) is DONE and reviewed. Run 2 (stamp duty, Tasks 6–7) has just been sent to Codex** by the user. When the user pastes Codex's Run 2 report into your session, you take over at step 4 of the cycle below.

---

## 2. Read next, in this order

1. **The plan:** `Docs/superpowers/plans/2026-10-07-analytics-speed-and-stamp-duty.md`. It's binding. It has Global Constraints, Review Focus, Tasks 1, 2 (revised 8 Oct), 3, 4, 5, 5B, 6, 7, 8, 9 and 10, plus "Self-review notes" listing every correction made after Run 1.
2. **The Codex handoff:** `Docs/orchestration/analytics-speed-stamp-duty-handoff.md`. It's what Codex reads. Sections: How this works, Run 1 round 1 ruling, Run 1 final state, Constraints, Rejected approaches, Self-review, the CODEX REPORT template, and the Round log (rounds 1–4 so far).
3. **Decisions:** the last entry of `decisions.md`, "2026-10-07/08 — Analytics speed fix and stamp duty", which gives every decision with its reason.
4. **Deferred:** `DEFERRED_FEATURES.md`, sections "Added 2026-10-07" and "Question 3 in full". It covers what we decided NOT to build, and why.
5. **Delegation log:** `Docs/orchestration/delegation-log.md`, the last ~8 lines (2026-10-08).
6. **The two explainer pages** (the user reviewed and decided on these). Local copies, because the online versions belong to the previous Claude account and may not open for you:
   - `Docs/orchestration/pages/2026-10-07-analytics-speed-fix.html` (why it's slow, costs, the job schedule, decisions)
   - `Docs/orchestration/pages/2026-10-07-analytics-stamp-duty-change-map.html` (before/after flows, ER diagrams, every file, the "Inputs check", job timing)
   - Online, if they open for you: https://claude.ai/artifact/RTvmbJVy1SrpH6XJYYWnqx and https://claude.ai/artifact/VjuDFpFp9EELeT7fcDuA7s. If you can't edit them, update the local copies and offer to publish new pages from your account.

---

## 3. How the Claude + Codex flow works here (manual relay)

There is **no Codex agent you can call**: `codex:codex-rescue` is not available as a subagent type in this environment. The flow is a **manual relay through the user**:

1. **You write a short prompt** for one Codex "run". It points Codex at the handoff doc and the plan rather than restating them. You give it to the user in a fenced code block.
2. **The user pastes it into Codex** (Codex runs on Windows in the same repo: `C:\Users\Dell\Desktop\MVP v1\MVP_V1_MF_only`).
3. **Codex implements the run test-first**, self-reviews, and prints a **CODEX REPORT** (template in the handoff doc).
4. **The user pastes the report to you. You then:**
   1. Read it critically. Check task status, deviations, open questions and self-review findings.
   2. Check the tree: `git status --porcelain`, `git diff --stat`, and read the actual diff of the run's files.
   3. Re-run the affected tests yourself, in WSL (commands in section 6). Never the full suite.
   4. For migrations: up, down and up on local Postgres, plus `tests/functional_postgres tests/test_migrations.py`.
   5. For Terraform changes: `terraform -chdir=infra fmt -check -recursive` and `terraform -chdir=infra/envs/staging validate`. **Never plan, apply or init.**
   6. **Mandatory review gate:** dispatch a **fresh Claude reviewer** with the `Agent` tool (`subagent_type: general-purpose`, `model: opus`, `run_in_background: true`). The prompt must say read-only, no edits, no git writes; give the scope, the plan sections, what to look for, and the test command; ask for a verdict plus findings by severity. Wait for the notification; don't poll.
   7. **Fix the review's findings yourself** if they're small and the files are already in your context (this is the "review-loop fix authorship" rule in `.claude/skills/model-orchestration/SKILL.md`). Work test-first: write the failing test, watch it fail, fix, watch it pass. Otherwise write a Codex fix-round prompt.
   8. **Send a scoped re-review** to the same reviewer with `SendMessage` (its agent ID is in your own session once you dispatch one), listing exactly what changed.
   9. **Record everything:** a row in the handoff's Round log, a line in `Docs/orchestration/delegation-log.md`, and a note in the plan's "Self-review notes" if the plan itself was wrong.
5. **Then write the next run's prompt.**

**Rules for you as orchestrator** (from the user's standing preferences and memory):
- **Never `git commit` or `git push`.** The user commits manually. Delete files with `rm`, not git.
- **Run only affected tests**, never the full backend or frontend suites.
- **Plan answers are not a go:** when the user answers questions about a plan or page, update the documents only. Build only on an explicit "go".
- **Ask before assuming** on anything the docs mark open; if a plan conflicts with the code or a decision, stop and say so (`CLAUDE.md`).
- **Deliverables:** reports go to `Docs/orchestration/*.md`; manager-facing walkthroughs go out as Artifacts.
- **Real CAS PDFs are personal data:** counts only in docs and logs; never copy names, PANs, folios or amounts. **Never write CAS passwords into any file.** Ask the user for them when you need to run real files.
- **Staging guides must start the stopped bastion before any SSM tunnel and stop it at the end.** Use two terminals (A: tunnel, B: commands); `psql` is installed on the manager's laptop.
- Never point `TEST_DATABASE_URL`/`DATABASE_URL` at staging. Never touch `backend/.env`.
- `Decimal`, never `float`, in money paths. LF line endings. Curly apostrophe ’ in user-facing copy.
- Write plainly for the user. They want clear explanations, step-by-step, with the "why", and they often ask "is this the same as…?" or "are there gaps?". Answer those directly and honestly, including what isn't verified.

---

## 4. Where things stand, in detail

### Done and accepted (uncommitted; the user commits)
**Run 1: Tasks 1, 2, 3, 4, 5, 5B.** Codex built them, then the orchestrator verified, fixed the review findings, and got a re-review.
- **Task 1:** Analytics never runs the TER refresh. `analytics/ter.py` and `scorer.py` only read `scheme_ter`.
- **Task 2 (revised 8 Oct):** TER is linked once per scheme to AMFI's SEBI scheme code (`NSDLSchemeCode`) by an exact cleaned name. The code is stored on `schemes.ter_scheme_code` / `ter_link_source` / `ter_linked_at` (**migration 0031**). Every month joins by code; there is **no fuzzy matching anywhere**; an unlinked scheme's month row is cleared to NULL; manual links are never replaced.
  - Why: fuzzy matching gave ~1,040 funds another fund's TER. For example, Kotak Business Cycle got Tata Business Cycle's TER, because AMFI fills each month gradually and on 8 Oct HDFC, Kotak and Nippon hadn't filed October.
  - On real data after the fixes: **7,041 links, 0 cross-fund-house, 0.6 s.**
- **Task 3:** the job `ter-monthly` → `ter-daily`, `backend/scripts/jobs/refresh_ter_daily.py` (with `--month MM-YYYY`), Terraform schedule `cron(20 6 * * ? *)` Asia/Kolkata. The log line includes `new_links`.
- **Task 4:** `refresh_nav_daily.py` also warms the peers of every held category. If one category fails, it rolls back and continues.
- **Task 5:** the stuck-run ceiling is 15 minutes, with a heartbeat: `started_at` is refreshed after every section.
- **Task 5B:** NSE index history counts as fresh within 4 days for Analytics. The `benchmark-daily` job passes `fresh_within=timedelta(0)` so it still downloads daily. `_fetched_from` memo per process.
- **Verified (WSL):**
  - 270 analytics/scripts/API tests pass;
  - Postgres 0030↔0031 round trip clean;
  - 43 functional_postgres + migration tests pass;
  - terraform fmt and validate clean.
- **Reviews:** a fresh Opus review gave APPROVE WITH FIXES; all findings were fixed or accepted; the scoped re-review gave APPROVE WITH FIXES (Lows only), and those are fixed. Details are in the handoff Round log (rows 1–4).

### In progress
**Run 2: Tasks 6 and 7 (stamp duty), with Codex now.**
- **Task 6:** the parser attaches the CAS's unit-less "Stamp Duty" rows to their same-day purchase (`NormalizedTransaction.stamp_duty`; several purchases that day → the one it's 0.005% of); **migration 0032** adds `transactions.stamp_duty NUMERIC(14,2)`; `confirm_people` writes and back-fills it; `opening_restore` carries it.
- **Task 7:** `lot_rules.cost_per_unit()` is used in every lot replay (holdings, opening_balance ×2, the parser's `_fifo_cost`), and `dashboard/xirr.paid_amount()` in XIRR, benchmark and cash flow.
- **When the report arrives, check especially:**
  - Review Focus 1: several purchases on one day.
  - Review Focus 2: an opening balance must not double-count stamp duty.
  - Review Focus 3: a later overlapping statement fills in stamp duty rather than inserting a duplicate.
  - Review Focus 5: a pre-deploy preview session still loads.
  - Migration 0032 on Postgres (partitioned `transactions`: plain `ALTER TABLE … ADD COLUMN` on Postgres, batch mode on SQLite).
  - Decimal everywhere.
- **Expected result:** "CAS 10 Yr" Total Invested goes from ₹37,22,451 to ₹37,22,637, equal to the CAS. That's only checkable on the real files in Task 8.

### Next
1. **Run 2 review cycle** (section 3, step 4).
2. **Run 3 = Task 8, synthetic parts, by Codex:**
   - the generator prints cost including stamp duty (`gen_scenarios.py` `buy()`: `gross / units`), and all synthetic PDFs plus `truth.json` are regenerated;
   - the harness truth attaches stamp duty;
   - new gates: invested = CAS cost (±₹1), Analytics ≤ 30 s on p20_20yr with the NAV job run first, and no TER refresh.
   
   Write the Run 3 prompt in the same style as Runs 1 and 2: point at the handoff and plan Task 8; synthetic only; Codex never opens real files.
3. **Orchestrator, after Run 3:**
   - **Task 8, real-file part:** run `Docs/CAS Files/synthetic/harness/tools/run_real.sh`. Ask the user for the passwords and export them as `PW_MAIN`, `PW_CP225`, `PW_CP219`; never write them down. Expect every run to pass except **CP219252880** (a known empty statement, see section 5), and "CAS 10 Yr" invested = CAS cost.
   - **Synthetic gate:** run `Docs/CAS Files/synthetic/harness/tools/run_gate.sh`. Expect 88/88 (44 scenarios × normal/blocked).
   - **Task 9:** Postgres round trip 0030 → 0032, `functional_postgres`, the affected backend suites, and the baseline-doc entry in `Docs/orchestration/2026-10-06-cas-import-baseline.md`.
   - **Task 10:** docs (`decisions.md` is already written for 7–8 Oct, so check and extend; `log.md` append; `backend.md`/`database.md`; `session.md`; the `CLAUDE.md` "Latest" line), plus the **new staging guide** `Docs/orchestration/2026-10-08-staging-deploy-guide-analytics-stamp-duty.md`.
   
   **The staging guide must include:**
   1. Start the bastion; open the two-terminal tunnel.
   2. Check staging is on migration `0030`.
   3. Build and push the image; `alembic upgrade head` (0031 + 0032); roll the backend service.
   4. Terraform: expect **3 to add, 3 to destroy** (ter_monthly → ter_daily) and nothing else.
   5. Run `scripts/clean-staging-db.sh` (user data only).
   6. `DELETE FROM scheme_ter;` once (the 7 Oct run saved ~1,040 wrong fuzzy TERs).
   7. Run `ter-daily` **twice**: first `--month 09-2026` (last month's feed is complete, which gives the fallback; ~624 pages, re-run if AMFI times out), then with no argument.
   8. Check no linked scheme points at another fund house.
   9. Run `nav-daily` once.
   10. Re-test A1, A2, C2, C6 and D2 on staging: Analytics under a minute; Total Invested equals the statement.
   11. Stop the bastion.
4. **Final review** of the whole change, then hand the user the list of files to commit.

---

## 5. Other open items (not part of this plan; don't build without a go)
- **Empty statement dead end (CP219252880):** a statement with 0 folios hits `self_name_mismatch`, and "Yes, that's me" loops. Proposed fix: reject an empty statement at parse with "This statement has no mutual fund holdings or transactions for its period. Request a CAS for a longer period." **Awaiting the user's go.**
- **"Other" in Portfolio Allocation:** index funds ("Other Scheme – Index Funds") and solution-oriented funds fall into "Other" (`dashboard/allocation_labels.py`). Proposed: group index funds by what they track and children's/retirement funds as Hybrid. **Awaiting the user's go.**
- **No real KFintech statement** has been tested (none available; A3 skipped).
- **Staging screenshots (7 Oct):** A1, A2, C1, C3, C5, C7 and E1 passed. D2 (TER "Save" line gone) couldn't be checked because Analytics didn't load. Re-check after this deploy.
- **Phase 7 Task 3 (remove the Import Review screen)** waits for the user's confirmation after staging. The prepared pieces are `frontend/.../confirmBody.ts` and `UnidentifiedFundsDialog.tsx`, both unused. See `session.md`.
- **Deferred by decision** (`DEFERRED_FEATURES.md`): fix E, the "still calculating" message, the rest of question 3 (Analytics keeps its AMFI list download and live held-fund NAV), the manual TER-link script, and storing category returns once a day.

---

## 6. Environment and commands (WSL)

- **Repo:** `/mnt/c/Users/Dell/Desktop/MVP v1/MVP_V1_MF_only`.
- **Backend tests:** from `backend/`, `python3 -m pytest <files> -q -p no:cacheprovider` (system Python 3.14 has the deps; `backend/.venv` is a Windows venv that Codex uses).
- **Frontend tests:** `npx vitest run --pool=threads <files>`; `npx tsc -b`. (No frontend change in this plan.)
- **Local Postgres:** `localhost:5433`, database `unifolio_test`, user/password `unifolio`.
  - Start it: `~/pg16/x/pgserver/pginstall/bin/pg_ctl -D ~/pg16/data -o "-p 5433 -c listen_addresses='*' -k /tmp" -l ~/pg16/log.txt start`.
  - Before migration commands and Postgres tests: `export DATABASE_URL=postgresql+psycopg2://unifolio:unifolio@localhost:5433/unifolio_test TEST_DATABASE_URL=$DATABASE_URL`.
  - Round trip: `python3 -m alembic upgrade head && python3 -m alembic downgrade 0030 && python3 -m alembic upgrade head && python3 -m alembic current`.
  - Tests: `python3 -m pytest tests/functional_postgres tests/test_migrations.py -q -p no:cacheprovider` (~3.5 min).
- **Terraform:** `~/bin/terraform`. fmt and validate only.
- **Synthetic harness:** `Docs/CAS Files/synthetic/harness/`.
  - `test_deep.py`: one scenario per process; env `SEQ=a.pdf,b.pdf OUT=x.json [MASTER_FILE] [SNAP=1] [DELETE_FIRST=1|DELETE_LAST=1] [MFAPI_BLOCKED=1] [ANALYTICS=1]`.
  - `test_real_check.py`: real files, counts only.
  - `tools/run_gate.sh` and `tools/gate_scenarios.txt`: the full 44-scenario gate.
  - `tools/run_real.sh`: real-file runs; passwords come from env vars.
  - `tools/net_timing.py`: a pytest plugin that times NSE/AMFI/mfapi calls inside one Analytics run (`PYTHONPATH=…/tools … -p net_timing`).
- **CAS PDFs:** outside the repo. Real files are in `/mnt/c/Users/Dell/Desktop/Unifolio/CAS Files/`; synthetic ones in `…/synthetic/` (password `MF@123`, documented in the synthetic README). The AMFI fund-list snapshot is `Docs/CAS Files/synthetic/navall_2026-10-06.txt`.
- **AWS:** this WSL has **no AWS credentials**. Anything on AWS (deploy, logs, psql to staging) is run by the user on their manager's laptop from a guide you write.

---

## 7. Key numbers to sanity-check against

| What | Value |
|---|---|
| Analytics run, local p20_20yr, before | ~6 min (TER refresh 205 s, peer NAVs 142–206 s, NSE 32 calls / 127 s on 8 Oct) |
| Analytics run on staging, before | 30–60+ min (refresh could repeat; 0.5 vCPU Fargate) |
| Analytics target after | ≤ 30 s locally (Task 8 gate), < 1 min on staging (estimate) |
| TER feed, 8 Oct | October 11,647 rows (partial); September 62,393 (complete); 1,813 names ↔ 1,813 SEBI codes |
| TER links | 7,041 of 8,661 Direct/Regular schemes; unlinked mostly Nippon 694, Kotak 407, HDFC 331 (not filed yet) |
| Stamp duty | 0.005% from 1 Jul 2020; "CAS 10 Yr" gap ₹186 (₹37,22,451 → ₹37,22,637) |
| Migrations | head on staging 0030; this plan adds 0031 (TER link) and 0032 (stamp duty) |
| Synthetic gate | 88/88 (44 scenarios × 2) before this plan |
| Real files | 8 statements; all pass except CP219252880 (empty statement, known) |
