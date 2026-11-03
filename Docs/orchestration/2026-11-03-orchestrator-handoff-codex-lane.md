# Orchestrator handoff: the Codex (backend) lane of UI round 2 (3 Nov 2026)

For a **second Claude session** that runs only the **backend lane** (Codex). The first session keeps the **frontend lane** (Antigravity) and all frontend gates. Same owner, same repo `ayushkarnawat/MVP_V1_MF_only`. Do not switch models unless the owner asks. Keep replies short; the owner relays Codex's prompts and reports between you and Codex.

## 0. Read first (and nothing else yet)
1. `CLAUDE.md`, `AGENTS.md`.
2. This file.
3. `Docs/orchestration/ui-common-rules-codex.md` (Codex's standing rules and its report block).
4. Then, per task: the plan's task text only (`Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md`, use `grep -n "^### Task"` and read the one range) and the matching handoff. Never read the whole plan or the 4 MB planning HTML.
Token rules: grep and line ranges, `git diff --stat`, no recaps, do not re-read files you just edited. Quality is not traded for tokens: tests first, read every Codex diff, run the review gate.

## 1. Split of work
| Lane | Session | Owns |
|---|---|---|
| **Backend (Codex)** | **you** | Tasks 2.1, 2.3, 2.4 (S2), 3.1, 3.2 (S3), 4.1 (S4), 5.1, 5.2 (S5), and 5.4 (Claude task: queries and guides that read goals). Backend baselines and gates (below). Backend review gates. |
| **Frontend (Antigravity)** | first session | All `[Antigravity]` tasks, Run 7 re-reads, frontend baselines and gates, screenshots, the hold list (1.5, 4.2 to 4.4, all of S6). |
Stage tags `ui-s<N>-done` need both lanes. The **frontend session owns the stage gate and the tag**. You report "backend part of S<N> verified at commit X" and the gate evidence; the owner tells the frontend session.

## 2. Where you work (important: two sessions must not collide)
- **Your worktree: `C:\Users\Dell\Desktop\MVP v1\wt\docs-be`**, local branch `ui-be-lane` (already created from `origin/leapswitch-redesign`). The first session uses `wt/docs` on `leapswitch-redesign`. Two worktrees cannot hold the same branch, so you publish to the same remote branch like this, every time:
  ```
  git fetch origin
  git rebase origin/leapswitch-redesign        # your commits go on top of the other session's
  git push origin ui-be-lane:leapswitch-redesign
  ```
  Never force-push. Never push to `main` or `feat/leapswitch-staging`. Commit prefix `ui-s<N>:` (`docs:` for documentation). Co-author line as in the system reminder. Commit only files you changed; never `git add -A` at the repo root.
- **Shared files** (`Docs/orchestration/ui-run-log.md`, `delegation-log.md`, `session.md`): append lines only, rebase before every commit, never rewrite another session's lines.
- **Frontend twin fixtures.** A backend golden fixture under `backend/tests/fixtures/home/` has an identical copy under `frontend/src/features/home/fixtures/`. When a backend change needs a new golden value, update **both** copies (as done for `summary_member.json`) and tell the owner so the frontend session re-runs the Home tests. Never touch other frontend files.

## 3. State at this handoff
- Remote head of `leapswitch-redesign` at handoff: `ab188616` (check `git log --oneline -5 origin/leapswitch-redesign`; the manager also pushes Run 7 commits to it).
- Alembic head by file chain: `0052`. S5's migration is **`0053`** (down_revision `0052`).
- **Done and committed:** Task 1.1 backend (`4eb5e873`): `_display_name(db, user_id, ctx)` in `backend/app/api/home.py`; golden `summary_member.json` display_name now `Dev`; backend `tests/api` plus `tests/services/home` = 290 passed.
- **In flight:** Codex was given **Task 2.1** (Home allocation funds per class) in `/home/delladiti/ui-s2` (WSL, branch `codex/ui-s2`, based on `ab188616`). Its report is pending; the owner will paste it to you.
- **Not started:** 2.3, 2.4, 3.1, 3.2, 4.1, 5.1, 5.2, 5.4.
- **Open question for the owner, S6 only:** Q71. Not yours.

## 4. The Codex queue, in this order (one task at a time per Codex session)
1. **2.1** (running). 2. **2.3**. 3. **2.4**. All three in `ui-s2-backend-handoff.md`.
4. **4.1** `ui-s4-benchmark-label-handoff.md` (small, independent; can go before S2 if Codex is idle).
5. **5.1 then 5.2** `ui-s5-goals-six-handoff.md` (migration `0053`; deeper check: second scoped review round and an orchestrator hand check of the named cases; needs a local Postgres for the functional test and up, down, up).
6. **3.1 then 3.2** `ui-s3-add-as-family-handoff.md`. **Blocked until 2.4 is committed** (needs `PersonConfirmResult.created`). Identity and PAN safety: second scoped review round. The handoff has the Head of Family warning (`household_members.is_head` exists; "account holder" is still the `self` member via `_self_member`).
7. **5.4** (Claude's own task: queries and guides that read goals; plan Task 5.4) after 5.2.
Each task: Codex clone fresh per stage (`git clone --branch leapswitch-redesign file:///mnt/c/Users/Dell/Desktop/MVP\ v1/MVP_V1_MF_only ~/ui-s<N>` inside WSL, then `git checkout -b codex/ui-s<N>`; fetch the latest head first so it contains the handoffs).

## 5. How Codex runs here (learned in this session)
- Codex runs on Windows and reaches the Linux clone only through `wsl.exe -d Ubuntu -- bash -lc '...'`. Its prompt must say so.
- **`git commit` fails in Codex's clone** (Author identity unknown). Accepted: Codex implements and self-checks; **you** copy the verified files into `wt/docs-be`, read the diff, run the tests, and commit. Never change git config in the clone.
- Python: `/home/delladiti/cr-venv/bin/python -m pytest` (has FastAPI, SQLAlchemy). Backend tests from WSL's own disk are fast.
- A Codex clone made before a handoff was committed will not contain it (this happened once): fetch and `git merge --ff-only origin/leapswitch-redesign` in the clone, or re-clone.
- Prompt template (fill the angle brackets):
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/<slug>-handoff.md (your task: <ids> ONLY)
Work only in /home/delladiti/<clone> on branch codex/ui-s<N>. Run every command through wsl.exe -d Ubuntu -- bash -lc '...'. Tests first. Git is read-only (git commit fails here with Author identity unknown: expected, the orchestrator commits). Do not touch frontend/**. Use /home/delladiti/cr-venv/bin/python -m pytest. If a golden fixture needs a new value, do not edit it: report the fixture and the exact new JSON.
Reply with the CODEX REPORT block from the rules file, nothing else.
```
- Per task cycle: report arrives → check `git diff --stat` in the clone, read every changed file, copy into `wt/docs-be`, run the task's tests plus the touched areas, fix golden fixtures yourself (both twins) if the report asks, commit `ui-s<N>:`, rebase, push, one line in `delegation-log.md`, update `ui-run-log.md` at stage end.

## 6. Decisions already made (do not reopen)
- Task 1.1 is backend, so it went to Codex (the plan tagged it Antigravity by mistake). Empty selected-member name cannot occur through the real endpoint; do not change `summary.py`.
- 2.3: `invested_amount` is **not** netted for redemptions. 2.4: a sign-up import is one uploaded before the owner's `onboarding_completed_at` (or onboarding not complete); a completed user with a null date is an existing user.
- Plan's `PersonConfirmResult.created: bool` is added in 2.4; 3.1 uses it.
- Contracts with example payloads are in the handoffs; the frontend builds against them. If the code forces a different field name, tell the owner so the frontend fixtures are updated at the stage gate.

## 7. Backend baselines and gates still open (S0 leftovers, yours)
- Full backend suite at the start commit: first run stopped at its first failure after **2243 passed**; the one failure `tests/services/analytics/test_portfolio_disclosure_client.py::test_run4b_real_fixtures_match_cached_master` needs an untracked local cache file (`backend/.cache/amfi_navall/nav_all.txt`) and is environmental. Re-run without `-x` once and record the pass count in `ui-run-log.md`. (`~/ui-s0` is a clean clone at an older head; use a fresh one.)
- Home timing baseline (S1 and S2 must stay within 10%): `backend/scripts/measure_home_staging.py` is a staging script; on a local synthetic database use the synthetic gates (`home_synthetic_gate.py`, `portfolio_synthetic_gate.py`, `fund_synthetic_gate.py`, each takes a `db_path` of a computed database) and the harness in `Docs/CAS Files/synthetic/` (README there). If no usable timing baseline exists locally, record that and agree with the owner how to measure.
- Synthetic CAS gates (normal and `MFAPI_BLOCKED=1`) pass counts at the start commit, for S2 and S3 to compare against.
- Postgres: S3 and S5 need a local Postgres (`docker compose up postgres`, or `~/pg16` in WSL); set `TEST_DATABASE_URL`.
- Review gate per backend stage: `/codex:adversarial-review` over `<stage start commit>..HEAD` through `codex:codex-rescue` with `run_in_background: true`, never `isolation: "worktree"`. Tell the owner to type `/codex:status <id>` and `/codex:result <id>` and paste the output. Findings are never applied automatically.

## 8. Owner's rules (they apply to you)
UI only plus the approved backend exceptions in the plan (goals S5, and the small additive fields it names). Do exactly what is asked. No product push to `main` or `feat/leapswitch-staging`; no deploy before the owner's go at S7; never run `clean-db.sh`, `restore.sh`, `rollback.sh` or deploy scripts. Never commit statement PDFs or real data. Plain short writing, no em-dashes. The owner answers short ("A", "yes"); ask short questions with a recommendation and numbered options.

## 9. First actions
1. `cd "C:\Users\Dell\Desktop\MVP v1\wt\docs-be"`, `git fetch origin`, `git rebase origin/leapswitch-redesign`, `git log --oneline -5`, check `ls backend/alembic/versions | tail -2` shows `0052`. Tell the owner in under 6 lines.
2. Wait for the owner to paste Codex's **Task 2.1** report; review it as in section 5.
3. Then the queue in section 4.
