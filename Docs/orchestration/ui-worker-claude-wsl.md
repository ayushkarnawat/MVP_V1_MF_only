# Worker handoff: Claude in WSL replaces Codex for the backend lane (3 Nov 2026)

Codex usage ran out. From here the **backend worker is a second Claude account running in the WSL terminal**. The orchestrator (the Claude session in `wt/docs-be`) is unchanged and keeps every orchestrator duty. The worker does exactly what Codex did, with the same protocol, so the queue continues without changes.

## 1. Who does what
| Role | Where | Does |
|---|---|---|
| Orchestrator | Windows, `C:\Users\Dell\Desktop\MVP v1\wt\docs-be`, branch `ui-be-lane` | writes prompts, reviews every diff, copies verified files, regenerates golden fixtures (both twins), runs the tests, commits, rebases, pushes, logs. Never delegated. |
| Worker | WSL, a fresh clone `~/ui-s<N>` per task | red tests, then code, self-checks, then one **WORKER REPORT**. Nothing else. |

## 2. Worker rules (same as Codex's, `Docs/orchestration/ui-common-rules-codex.md` still applies, read it first; read "Codex" there as "worker")
- **You are the worker, not an orchestrator.** Ignore the parts of `CLAUDE.md` that tell you to invoke `task-observer` or `model-orchestration`, and never delegate to Codex, agents or workflows. Do the task yourself, in this session.
- Work only in your clone, on its `codex/ui-s<N>` branch (keep the prefix, it is the naming the orchestrator expects). Never touch `wt/docs`, `wt/docs-be` or the Windows checkout.
- **Tests first**: red, then green, then refactor. Show the red count before the implementation.
- **Git is read-only after the clone and the branch checkout.** No commit, add, stash, config, push. The orchestrator commits. Do not change git config.
- Do not touch `frontend/**`. Do not edit golden fixtures: report the fixture name and the exact new JSON. No migrations, dependencies or deploy scripts unless the task says so. `Decimal`, never `float`, for money.
- Identity and PAN code (S3, S5): change only what the job names. Production code never reads or changes `household_members.is_head` (tests may, only to prove it unchanged). If a task needs more than it names, STOP and report.
- Python: `/home/delladiti/cr-venv/bin/python -m pytest` from the clone's `backend/` directory (venv has FastAPI and SQLAlchemy). Run commands from WSL's own disk, not `/mnt/c`, it is much faster. In WSL you run bash directly: no `wsl.exe` wrapper.
- Postgres for tests that need it: binaries under `~/pg16/x/pgserver/pginstall/bin` (`initdb`, `pg_ctl`, `createdb`). Start a throwaway cluster on a free port with a trust user, export `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:<port>/<db>`, stop it and delete its directory when done. Never touch another cluster.
- Plain short writing, no em-dashes. Do not read the whole implementation plan: only the task text the handoff names (`grep -n "^### Task"`, read that range).
- No real statements or personal data are ever committed. Synthetic CAS files are under `Docs/CAS Files/synthetic/pdfs/` (password `MF@123`).

## 3. Per-task setup (the orchestrator pastes this, filled in)
```
rm -rf ~/ui-s<N> && git clone --branch ui-round-2 file:///mnt/c/Users/Dell/Desktop/MVP\ v1/MVP_V1_MF_only ~/ui-s<N> && cd ~/ui-s<N> && git checkout -b codex/ui-s<N>
```
The orchestrator first refreshes the source ref (WSL clones read the main repo's local branch, not the remote): `git -C "C:/Users/Dell/Desktop/MVP v1/MVP_V1_MF_only" fetch origin ui-round-2:ui-round-2`. HEAD must equal the commit the prompt names. A clone made before a handoff was committed does not contain it: re-clone.

## 4. The report block (reply with exactly this, nothing else)
```
WORKER REPORT: <slug> <task ids>
Task status: DONE | PARTIAL | BLOCKED, one line why
Workspace / branch / baseline HEAD
Per task or job: what was implemented (bullets); tests with the exact command, the RED count, the GREEN count
Full run: tests/services/home tests/services/import_ tests/api (plus any others the prompt names), exact counts, every failure named
git diff --check and git status --short
Real synthetic request/response examples for every new or changed endpoint
Contract differences from the handoff (field names, URLs, value casing)
Golden fixtures that need updating: file and exact new JSON, or NONE
Deviations, open questions (one line each), confirmations (no frontend, no fixtures, no git writes)
```

## 5. Orchestrator cycle (unchanged)
Report arrives, `git diff` in the clone, read every changed file, copy into `wt/docs-be` (`wsl.exe -d Ubuntu -- bash -lc "cat /home/delladiti/ui-s<N>/<path>"` to the same path), fix goldens and twins, run the suites, commit `ui-s<N>:`, `git fetch`, `git rebase origin/ui-round-2`, `git push origin ui-be-lane:ui-round-2`, one line in `delegation-log.md` (shared file: append only, on conflict keep both sides).

## 6. Review gate without Codex
`/codex:adversarial-review` is not available while Codex usage is out. Substitute: the orchestrator starts a **fresh `general-purpose` Claude subagent** (not a fork, so it is not anchored on the orchestrator's view), gives it only the commit range, the paths and the focus list, and asks for ranked findings with file and line and a reproduction for each. Findings are never applied automatically; each reproduced one goes back to the worker as a job with a red test first. Record in `delegation-log.md` that the reviewer was a Claude subagent. Use Codex again for the S5 migration and identity gates if its usage returns.

## 7. Status at this handoff
- Remote head of the old shared branch `leapswitch-redesign` before the S3b commit; from now on the shared branch is `ui-round-2` (see `2026-11-03-ui-round-2-branch-and-worktrees.md`): `d6874510` (S2 backend, S2 review fixes, task 4.1, S3 tasks 3.1 and 3.2).
- S3b (add-as-family guard against a pending Self PAN claim, partial-share rounding) built by Codex, verified by the orchestrator, committed after this file.
- Done backend: 1.1, 2.1, 2.3, 2.4, 3.1, 3.2, 4.1.
- **Remaining queue:** 5.1 then 5.2 (`ui-s5-goals-six-handoff.md`, migration `0053`, needs Postgres: up, down, up), then 5.4 (orchestrator's own task: queries and guides that read goals, plan Task 5.4).
- Review gates still owed: S3b re-check (the guard is in identity code) and S5 (second scoped review round plus the orchestrator's hand check of the named cases).
- Baselines still unrecorded: full backend suite pass count, Home timing, synthetic CAS gates (normal and `MFAPI_BLOCKED=1`).
