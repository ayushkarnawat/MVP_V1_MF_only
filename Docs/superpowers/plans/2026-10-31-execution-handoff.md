# Execution handoff: the 13 change requests (Runs 1 to 7, then staging)

**Written 31 Oct 2026 by the planning session. Audience: the intern (or any new session) who executes the plan.** Nothing is implemented yet. Read this file first, then `AGENTS.md`, then the plan.

## 1. What you are doing, in one paragraph
You execute `Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md` (the **final plan**, Revision 3) on branch `leapswitch-redesign`, run after run, using the Claude–Codex method: **Claude orchestrates** (writes the handoff document per task, checks, commits, reviews), **Codex implements and self-checks**. You do not write product code yourself unless the plan says so. Everything is committed locally; **nothing is pushed** until the owner gives an explicit go at the staging step.

## 2. State at hand-over
- Branch `leapswitch-redesign`; Alembic head `0046` (Run 2 will create 0047 and 0048, Run 3 0049, Run 5 0050).
- Step 0 is finished. Evidence and decisions: `Docs/orchestration/2026-10-31-factsheet-state-and-benchmark-gaps.md` (**Revision 3** wins over earlier sections), `unifolio-change-briefing-handoff.md` (decisions D1 to D40, updates of 31 Oct), and the briefing page `unifolio-change-briefing.html`.
- The readiness review (what was checked, what is a named risk) is `Docs/superpowers/plans/2026-10-31-readiness-review.md`. **Read its risk register before Run 1.**
- Run 1 handoff documents already exist (five files, `Docs/orchestration/cr-r1-*-handoff.md`). Handoffs for Runs 2 to 7 are written by you at the start of each run (they depend on migration numbers and measurements from earlier runs).
- The factsheets for September data (the "October issue") for 17 houses are on the staging VM in `/home/deploy/factsheets-oct2026` and on the owner's laptop in `D:\Factsheets October`. Axis has no file. Nine houses were hand-imported; the four others wait for Task 1.5b.

## 3. Order of work
| Step | What | Gate before it starts | Estimate (the plan's own figures) |
|---|---|---|---|
| 0 | Read this file, the readiness review, `AGENTS.md`, the plan's Global Constraints, Review Focus and Method. Record the starting commit. Clone for Codex (plan Method step 2). Run the cheap Git probe. | none | half a day |
| Run 1 | Items 3, 13, 4, 5, 6, plus Task 1.5b (the four-house hand import code). Handoffs: `cr-r1-market-cap-asset-class`, `cr-r1-fund-manager`, `cr-r1-overlap`, `cr-r1-remove-stock-concentration`, `cr-r1-this-month-import`. | none | 2 days + 0.5 for Task 1.5b |
| Run 2 | Item 7 Phase A, items 8, 9, 10, composite deletion (0047, 0048); Phases B and C of item 7 | **G2: the Home and benchmark-matrix timing baselines must exist** (see 5); T2.12 starts with one XBRL check | 5 days (+ Phases B, C of item 7) |
| Run 3 | Items 11 and 12 (0049) | none (G5 and G6 closed) | 4 days + 1 by hand + 1 for Task 3.1b |
| Run 4 | Item 2, consolidated family holdings | none | see the plan's run header |
| Runs 5 and 6 | Item 1, Head of Family (0050), backend then frontend | Postgres functional tests available | see the plan's run header |
| Run 7 | Logos, headings, green buttons | none | see the plan's run header |
| Docs update | Task D.1 (Claude only, owner reviews the diff) | after Run 7 | 1 day |
| Staging | Task S.1 (manager QA), one deploy, forced recompute, the four `--this-month-only` imports (Task 1.5b step 4 and 5) | the owner's explicit go to push | 1 to 2 days |

## 4. The method, in the order you do it each run
1. **Before any dispatch:** record the starting commit; clone `leapswitch-redesign` into a fresh native-filesystem directory (`~/cr-run-N`) and dispatch Codex there; run the **cheap probe** (one-line file, `git add`, `git commit`), expecting Git writes may fail in the sandbox; then the orchestrator does all staging and commits.
2. **Write the handoff document per task** (slug in the plan, status OPEN). For Run 1 they are already written.
3. **Per task:** failing tests first, confirm they fail for the stated reason, implement, tests green, orchestrator reads the diff and re-runs touched tests, then commits with the prefix `cr-r<N>:`.
4. **Run gate:** touched-file tests, then the full backend and frontend suites, `npm run build`, `npm run lint`, old-payload tests, the section-list tests; for Runs 3, 4 and 5 the synthetic gates; for Run 5 the Postgres functional tests; migration up, down, up on Postgres; the timing scripts for Runs 2 to 4 (no script more than 10% slower than the baseline).
5. **Mandatory review gate before DONE:** `/codex:adversarial-review` over `<start commit>..HEAD`, dispatched through `codex:codex-rescue` with `run_in_background: true`. **The human types `/codex:status <id>` and `/codex:result <id>`** and relays the output (tell the owner each time). Findings are never auto-applied. Opus only on the three named triggers in `references/escalation-triggers.md`, and only with the owner's approval.
6. Tag `cr-run-<N>-done` locally. Write one line per decision in `Docs/orchestration/delegation-log.md`. Update `session.md` at the end of each run.

## 5. Things that will bite if forgotten (from the readiness review)
- **G2 baselines.** The Home and benchmark-matrix timings were never measured (today's NAV was not stored on 30 Oct and the scripts abort on any write). Re-run them on the VM **after 06:35 IST on a trading day**, for a recomputed user, twice each, **before Run 2 starts**. The manager runs them.
- **Task 1.5b needs a deploy to reach the VM.** The VM runs the deployed image; the `--this-month-only` flag is in code, so it cannot run until the staging deploy (or a one-commit deploy the owner approves). Never edit files on the VM.
- **Task 1.5b readers:** Sundaram, Angel One and SBI active were probed on 31 Oct and are accepted by their readers. **SBI passive and Mahindra are rejected** (both houses changed their manager layout); the task includes fixing those two readers from saved page text. The importer also rejects files over 45 days old, so the staging import uses `--as-of 2026-10-31`. Repeat the probe first (Task 1.5b step 1).
- **Axis** has no October-issue file; it stays on 31 Aug until the owner supplies one. This is not a bug.
- **Recompute lessons (30 Oct):** query `analytics_recompute_status` first; never stop a running recompute (it leaves a 15-minute claim, the next run skips that user; a one-household recompute with `run_analytics_recompute.py --household <id>` clears it); `run-job.sh` prints nothing until the job ends, so start long jobs in the background; read `.env` commands under `sudo` (`ssh deploy@... 'sudo bash -s' <<'EOF' ... EOF`).
- **Windows drive, WSL:** run backend tests in WSL with `backend/.venv/bin/python -m pytest` (verified 31 Oct: the manual-import tests pass, 7 of 7). Frontend checks are WSL-only. Do not run `npm` from Windows PowerShell.
- **Benchmarks:** the app reads only `return_type == TRI` rows. Nifty 50 Arbitrage is stored as TRI (verified against printed 1, 3 and 5 year returns). The debt A-I/A-II/A-III and hybrid composite indices are **not buildable** from a free source; never add them. Every user-visible benchmark string comes from the plan's string table (no "TRI", "proxy", "fallback").
- **Plain words:** the owner's rule for every label.

## 6. Hard rules (never break these)
- **Never run on staging:** `clean-db.sh`, `restore.sh`, `rollback.sh`, any deploy script (unless the owner's explicit go at S.1), or any write other than: the hand import of owner-supplied files, `fund-managers-monthly`, and the staging deploy at S.1. **Never add `--allow-nav-writes`.** Never stop a running recompute.
- **No push.** No deploy. No new account or migration outside the plan's numbers. Never commit the factsheet PDFs or any CAS file.
- No scraping or access-control workarounds beyond what the resolver registry already does.
- SIP fixes and LinkedIn stay out. S10 is closed by owner decision: do not add release gates for it.
- Report outcomes faithfully (what ran, what failed, what is unverified). Ask the owner before assuming anything the docs mark open.

## 7. Who decides what
| Decision | Owner (Ayush) |
|---|---|
| S10 (terms): ignored for staging; the owner writes to NSE Indices separately; note in the privacy policy before production | decided |
| Gold and silver ETF proxy: use it if the 0.5-point check passes (Task 3.1b) | decided |
| 65% rule (net domestic equity): use it for the 18 undecided funds | decided |
| Four-house import: this month only, registry unchanged; moved to manual only after a second failed month | decided |
| Axis file, the 10 Nov factsheet re-check, the publication re-run on 3, 6 and 10 Nov | owner, later |
| Push and deploy to staging | owner's explicit go |

## 8. First command
```bash
cd "/mnt/d/Unifolio code" && git status -sb && git log --oneline -3 && cat Docs/superpowers/plans/2026-10-31-readiness-review.md | head -80
```
Then follow section 3, Step 0.

---

# Prompt to paste into the execution session

```
You are the orchestrator for Unifolio (MF MVP) execution on repo ayushkarnawat/MVP_V1_MF_only, branch leapswitch-redesign (commit locally, do NOT push, do NOT deploy). Read AGENTS.md and CLAUDE.md, then read in full and follow exactly:
Docs/superpowers/plans/2026-10-31-execution-handoff.md
It points to the final plan, the readiness review and the five Run 1 handoff documents. Method: Claude orchestrates, Codex implements one handoff at a time, you verify, commit and review; the owner types the /codex:status and /codex:result commands for the adversarial review. Hard rules: never run clean-db, restore, rollback or deploy scripts; never use --allow-nav-writes; never stop a running recompute; the only staging writes are the hand imports of owner-supplied files, the fund-managers-monthly job, and the staging deploy at S.1 after the owner's explicit go. Plain words on every label. Start by confirming you have read the files, then list: the starting commit, the cheap Git probe result, and the first task you will dispatch (Run 1, Task 1.5b step 1: the local reader probe on the four real files) and why.
```
