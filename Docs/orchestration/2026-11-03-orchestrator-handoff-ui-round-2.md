# Orchestrator handoff: UI round 2 and auth redesign (3 Nov 2026), desktop app

For the Claude session that **orchestrates the execution**. Same owner, repo `ayushkarnawat/MVP_V1_MF_only`, branch `leapswitch-redesign`. Short on purpose. The plan holds the detail; this file holds only what you need to start.

## 0. Token rules (follow these, they are the owner's request)
1. **Read only what the current step needs.** Never read the whole plan, the planning HTML (4 MB) or the old handoffs up front. Read the plan **one stage at a time** (`grep -n "^## Stage\|^### Task"` first, then read that range).
2. Use `grep`, line ranges and `git diff --stat`. Do not re-read a file you just wrote or edited.
3. Keep replies short: results, the next action, and what the owner must do. No recaps, no restating the plan.
4. Worker handoffs point at the plan's task by number. They do not copy it. Prompts are the paste-ready template from the rules file with the brackets filled.
5. Verify cheaply first: `git diff --stat`, touched tests only. Full suites once per stage.
6. Quality is not traded for tokens: tests first, read every worker diff, run the review gate.

## 1. Team
Claude = orchestrator (designs contracts, writes handoffs, reads every diff, commits, tags, reviews). **Codex = all backend tasks. Antigravity (Gemini) = all frontend tasks.** No manager. The owner relays prompts and reports between you and the workers. Rules files (each ends with a paste-ready prompt): `ui-common-rules-codex.md`, `ui-common-rules-antigravity.md`. Workers never run a git command that changes anything.

## 2. Where things are
| What | Path |
|---|---|
| The plan (execute this) | `Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md` (run sheet at the top, "Team: who does what", Method, then S0 to S7, every task tagged [Codex] / [Antigravity] / [Claude]) |
| Spec (planning page, render only when a task needs a mockup; use the section ids the plan cites) | `Docs/orchestration/2026-11-02-auth-redesign-plan.html` |
| Run 7 (frontend, open) | `cr-r7-logo-pass-handoff.md`, `cr-r7-common-rules.md`, `cr-r6-common-rules.md`, `cr-r6-fe-check.sh` |
| Method | `.claude/skills/model-orchestration/SKILL.md` (read only the parts you need) |
| Project rules | `CLAUDE.md`, `AGENTS.md` (read once) |

## 3. State
- Branch head when this was written: Runs 1 to 6 of the change-requests plan done (Head of Family, migrations `0050` to `0052`, Alembic head `0052`). **Run 7 is open** (frontend: logos, one heading per card, green button token, benchmark info icon). It goes **first**; S1, S4 and S6 reuse its token and icon.
- The UI round 2 plan (S0 to S7, 54 tasks) is written and **nothing of it is built**. The goals migration will be `0053`.
- **Open question Q71** (the plan's "Open question"): should the old email get the change notice when email is changed on Back during sign-up? Needed only before S6 task 6.11. Default recommendation: leave the backend as is.
- Nothing is deployed. No product push or deploy before the owner's explicit go at S7.
- Docs commit `docs: Codex backend and Antigravity frontend split...` may be unpushed in the cloud session. The owner pushes it manually (the cloud session cannot push: its GitHub App is installed on a different account than the repo owner).

## 4. First actions, in order
1. `git status`, `git log --oneline -8`, `git tag -l "cr-run-*"`, `cd backend && alembic heads`. Tell the owner in **under 8 lines**: head commit, whether Run 7 is tagged, Alembic head, anything unexpected.
2. If Run 7 is not tagged: the first work is the Run 7 Antigravity task. Give the owner the paste-ready prompt from `ui-common-rules-antigravity.md` with `cr-r7-logo-pass-handoff.md` as the handoff and the Windows clone path (`C:\Users\Ayush\cr-run-1` earlier; ask once if it changed). Review its report, read the diff, run the frontend suite, build, lint, `/codex:adversarial-review`, tag `cr-run-7-done` locally.
3. Then **S0** (plan tasks 0.1 to 0.7): record the start commit, re-read the code the plan cites at that commit, baselines, set up both lanes, write the S1 handoffs. Then S1 to S7 in order.
4. Each stage: handoffs (backend ones carry an exact response shape and example payload), prompts to the owner, verify reports, commit `ui-s<N>:`, stage checks, review gate, tag `ui-s<N>-done`, delegation-log line, `session.md`.
5. Stages with both lanes run the lanes at the same time (the frontend builds against the contract in the backend handoff). Check the real endpoint against the fixture at the stage gate.

## 5. Owner's rules (they apply to you)
- UI only, with the approved backend exceptions listed in the plan (goals S5, and the small additive fields it names). Do exactly what is asked, nothing more. Do not change an answered decision. Redesign only screens in the PDFs.
- The Inception performance graph, mobile screens and today's import screens are not changed (mobile only gets the six-goal screen).
- Plain writing: short sentences, no jargon on screen, no em-dashes.
- **Never switch models unless the owner asks.** Opus only on the three named triggers, after asking.
- Commits are local on `leapswitch-redesign`, prefix `ui-s<N>:` (`docs:` for documentation). Never push to `main` or `feat/leapswitch-staging`. Never force-push. Do not push product code or deploy before the owner's go at S7. Never commit statement PDFs or real data.
- Never run on staging: `clean-db.sh`, `restore.sh`, `rollback.sh`, deploy scripts, except at S7 with the owner's go.
- Tell the owner when the review gate is dispatched: they must type `/codex:status <id>` and `/codex:result <id>` and paste the output. Findings are never applied automatically.
- The owner answers short ("A", "yes"). Ask short questions with a recommendation and numbered options.

## 6. Needed from the owner later
The eight sketch images and logo crops from the two PDFs in `frontend/public/illustrations/auth/` (before S6 task 6.5); one real statement for the S3 gate; local Postgres for S3 and S5; the answer to Q71; their review of the documentation diff (task D.1); the explicit go at S7.
