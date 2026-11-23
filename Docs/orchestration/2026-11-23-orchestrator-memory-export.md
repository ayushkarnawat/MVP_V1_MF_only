# Orchestrator memory export (23 Nov 2026)

The first Claude account kept these notes in its private auto-memory (`C:\Users\Ayush\.claude\projects\D--Unifolio-code\memory\`). A second account does not have them. **Recreate them in your own memory directory** (one file per entry, the same frontmatter, plus a one-line pointer in your `MEMORY.md`), or at least read them once: they hold the owner's standing preferences and hard-won operating facts. They are copied verbatim below; entries refer to each other with `[[name]]`.

Index (the first account's `MEMORY.md`):

- [Opus only for final review](feedback-opus-only-final-review.md) — Sonnet subagents for mid-PR reviews, Opus for whole-branch gates
- [Redesign branch model](project-redesign-branch-model.md) — one PR per page onto leapswitch-redesign, deployed to a new link together
- [UI redesign two-account switch](project-ui-redesign-account-switch.md) — shared checkout, WSL-only frontend checks, handoff doc location
- [Keep the decisions register updated](feedback-decisions-register.md) — log orchestrator decisions and Lows after every run, in the run's docs commit
- [Small changes: merge directly](feedback-small-changes-direct-merge.md) — small docs/script fixes go straight to leapswitch-redesign, no PR
- [Worker fallback order](project-worker-fallback-order.md) — Codex limit: Antigravity Claude Sonnet 5.5 high, then Gemini, then all-Claude linear
- [Run 6 Gemini + frontend check script](project-run6-gemini-frontend-setup.md) — Run 6 worker setup and the fast WSL check script
- [Release branch model](project-release-branch-model.md) — deploy from release/change-requests (D:\unifolio-release), not leapswitch-redesign
- [Copy never changes in design passes](feedback-copy-never-changes-in-design-passes.md) — look only; keep the built wording even if a mockup picture differs
- [Define scope and blast radius](feedback-define-scope-and-blast-radius.md) — say what goes and what stays; own mistakes; no extra UI
- [NAV held-fund refresh fix](project-nav-held-fund-refresh-fix.md) — nav-daily now uses AMFI dates; where cron, log, digest, .env live on the VM
- [Staging VM access and network](reference-staging-vm-access-and-network.md) — WSL-only SSH by hostname, one public interface with unifolio-web, runbook path
- [Codex cannot run API tests](project-codex-sandbox-cannot-run-testclient.md) — TestClient stalls in its sandbox; Claude runs them
- [WSL quoting and deletion flags](feedback-wsl-quoting-never-delete-flags.md) — scripts not inline vars; no rsync --delete in subagent briefs
- [One combined M2 stakeholder message](feedback-one-combined-m2-stakeholder-message.md) — send one message after all of M2; draft saved, refresh files at the end

---

## File: `feedback-copy-never-changes-in-design-passes.md`

```markdown
---
name: copy-never-changes-in-design-passes
description: "In any visual or design pass the wording stays exactly as built; only look, layout and structure change, even when a mockup picture shows other words"
metadata:
  node_type: memory
  type: feedback
  originSessionId: f646b0ed-b45b-4f63-bd81-1a6e4b16c911
  modified: 2026-11-04T09:48:57.526Z
---

In a design or visual-fidelity pass, never change the copy. The words already in the app are the approved copy (they come from the copy sheets), even where a clean mockup picture shows different words (for example the mockup said "Enter the OTP", the app says "Verify your number": the app wording stays).

**Why:** the owner said it twice on 4 Nov 2026 ("no changes in the copy... it's just the design"). Mockup pictures can be older than the copy sheets, so a picture is a source for the look only.

**How to apply:** take the LOOK from the clean mockup picture and the WORDS from the code. When the picture and the code disagree on words, keep the code and do not even ask. Audit the branch diff for string changes before a deploy. Related: [[feedback-small-changes-direct-merge]] for the docs flow; the visual-fix gate lives in `Docs/orchestration/auth-visual-fix/visual-gate.md`.
```

## File: `feedback-decisions-register.md`

```markdown
---
name: feedback-decisions-register
description: "Keep the UI-redesign decisions register updated after every run; it separates owner, plan and orchestrator decisions"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 045d5be6-48a5-4617-9dbb-b06a948cdaad
  modified: 2026-10-26T02:36:33.222Z
---

After every run (handoff verified and committed), add the decisions Claude took where a plan was silent or changed, plus any carried-forward Low findings with a planned disposition, to `Docs/orchestration/ui-redesign-decisions-register.md`, in the same docs commit as the run's orchestrator record. Mark each entry as owner, plan or orchestrator, say what changes if the owner vetoes it, and record owner confirmations as they come.

**Why:** the owner asked (26 Oct 2026) to know which decisions were theirs, the plan's, or Claude's, and wants them tracked so nothing silently becomes policy.

**How to apply:** do it as part of the verification step, not later. Never switch branches to do it while Codex is running on a task branch; edit in place and commit with the run's docs. Related: [[project-redesign-branch-model]], [[project-ui-redesign-account-switch]].
```

## File: `feedback-define-scope-and-blast-radius.md`

```markdown
---
name: feedback-define-scope-and-blast-radius
description: "Owner is wary of wide changes; name exactly what is removed and what stays, own mistakes plainly, never pad a fix with new UI"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 0d1f81d6-b8fc-4418-911b-8500e28582f7
  modified: 2026-11-04T12:15:48.461Z
---

On the 4 Nov 2026 QA fix (Complete profile dialog after imports) the owner was upset on three counts: I wrote "you want the old flow back" as if the regression were theirs; I proposed to remove the "N members detected" screen along with the dialog; and I floated an extra notice for the family view. They said "I am very afraid of you and your blast radiuses" and "let's not invent".

**Why:** the app is being QA'd by a small team and every unrequested change costs them a re-test; the previous Task 3.4 itself widened a one-case decision (Q37, name mismatch) into every import.

**How to apply:** when a fix removes something, state in the plan exactly what goes and a list of what is deliberately left untouched, and prove it with the tests that cover the untouched parts. Own the mistake in plain words (the plan I or an earlier worker followed was wrong) with no "you want it back". Offer no extra UI unless asked; pick the smallest change. Prefer the owner's own wording of the flow. Related: [[feedback-copy-never-changes-in-design-passes]].
```

## File: `feedback-one-combined-m2-stakeholder-message.md`

```markdown
---
name: one-combined-m2-stakeholder-message
description: "Owner wants ONE complete stakeholder message after all of M2 is done, not a part-1 message then a part-2 update"
metadata:
  node_type: memory
  type: feedback
  originSessionId: a62e4028-e134-4ad1-a3c1-c31904d246e9
  modified: 2026-11-20T04:52:54.456Z
---

For the M2 release the owner (Aditi) decided on 20 Nov 2026 to send a single, complete stakeholder message (with the Excel files and the tutorial video) once the whole of M2 is on staging, not a message after part 1 and a short one after part 2.

**Why:** she does not want stakeholders to get two messages for one milestone; the part-1 draft is saved and she will send it combined.

**How to apply:** the saved draft is `Docs/orchestration/2026-11-20-m2-stakeholder-message-draft.md`. When M2 is complete: update that text (move "not live yet" items into the live list), regenerate the two workbooks on the final deployed code (same price date as the message; method is in the draft), recheck the numbers, and hand her the final text and files. Do not push a part-2 "short update" on her. Likely the same for M3 and M4. See [[project-release-branch-model]].
```

## File: `feedback-opus-only-final-review.md`

```markdown
---
name: feedback-opus-only-final-review
description: "Owner's review-cost policy for the UI redesign: Opus only for the final whole-branch review, Sonnet subagents for other reviews"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 045d5be6-48a5-4617-9dbb-b06a948cdaad
  modified: 2026-10-26T10:00:14.310Z
---

Opus reviews burned the most quota. Owner proposed (25 Oct 2026) using Opus only for a complete whole-branch review at the end of a PR or wave (S2.7, MF15, PR10, M2), and Sonnet subagents for every other "+O" review.

**Update 26 Oct:** owner's rule for backend PR reviews: Sonnet by default; when unsure, tell the owner and ask before any Opus run (they decide). Don't start fix runs for review findings unless the owner says so when quota is low.

**Why:** the first account hit 91-98% of its 5-hour limit mostly from repeated Opus reviews. But an Opus review caught a High that two Codex rounds missed (shell-tokens.css never in the bundle), so the final gate must still include a built-output check (grep dist CSS for --shell-* definitions) and a manual app run.

**How to apply:** use `Agent` with `model: "sonnet"` for intermediate reviews; ask before using Opus anywhere except the named final gates. Full policy: `Docs/orchestration/2026-10-25-account-switch-return-handoff.md` section 3. Owner had not formally confirmed the exact run list yet. See [[project-ui-redesign-account-switch]].
```

## File: `feedback-small-changes-direct-merge.md`

```markdown
---
name: small-changes-direct-merge
description: "For small docs or script fixes on leapswitch-redesign, push/merge directly; no PR needed"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 149688f2-1bc9-41a3-896b-194b6c5cd82f
  modified: 2026-10-29T09:28:47.581Z
---

For small fixes (a guide edit, a file-mode fix, a correction to something already merged), commit and push straight to `leapswitch-redesign`, or merge the PR yourself, without asking first or opening a PR for it.

**Why:** the owner said so on 29 Oct 2026 ("if it's a small change, just make the change and merge it, no need to make a PR") after PR #37/#38 on the deploy hardening, and had also told me to merge #37 myself.

**How to apply:** only for small, low-risk changes (docs, executable bit, wording). Larger code changes still go through a PR and the usual review rules in [[project-redesign-branch-model]]. Always `git fetch` before branching from `origin/leapswitch-redesign`; a stale local ref once gave me an old tree. On the VM, every `docker compose` command runs from `deploy/leapswitch`, never the repo root.
```

## File: `feedback-wsl-quoting-never-delete-flags.md`

```markdown
---
name: feedback-wsl-quoting-never-delete-flags
description: "Never pass shell variables inline through wsl.exe; run WSL commands from a script file; subagent prompts must forbid rsync --delete and any destructive flag outside scratch"
metadata:
  type: feedback
---

On 18 Nov 2026 a read-only review subagent ran `rsync -a --delete` through `wsl.exe -d Ubuntu -- bash -lc '...$D...'`; the outer shell expanded `$D` to empty, so the destination became `/` in WSL (as user ayush) and it ran about two minutes before being killed (permission errors on system paths; no confirmed loss; `~/.nvm` is absent afterwards and it could not be proved whether it ever existed). The same quoting bug made my own check loops print empty variables.

**Why:** `wsl.exe` and Git Bash expand `$VAR` and `~` in the outer shell before WSL sees them.
**How to apply:** put every non-trivial WSL command in a script file (scratchpad, `sed -i 's/\r$//'`) and run `wsl.exe -d Ubuntu -- bash "/mnt/c/.../script.sh"` with `MSYS_NO_PATHCONV=1`; in subagent briefs state: no `rsync --delete`, `rm -rf` or other deletion outside the scratchpad, build the mirror only with `Docs/orchestration/wave-fe-check.sh` or a guarded script that refuses an empty destination. Background `vite` servers must be started as long-lived background tasks and stopped with a pattern like `[v]ite` so the kill does not match its own shell.
```

## File: `project-codex-sandbox-cannot-run-testclient.md`

```markdown
---
name: project-codex-sandbox-cannot-run-testclient
description: "Codex's Windows sandbox cannot run FastAPI TestClient (API) tests: they stall on a loopback socket; Claude runs them"
metadata:
  type: project
---

On 18 Nov 2026 Codex (Windows desktop app, worktree under `D:\unifolio-*`) reported BLOCKED on B-1: every test that uses Starlette's `TestClient` stalled at `socket.accept` in `asyncio.proactor_events._make_self_pipe` (the sandbox blocks loopback sockets). Service-level and pure-function tests ran fine (51 passed before the first API test). The same tests pass in 10 seconds in Claude's own shell with `D:\Unifolio code\backend\.venv-win\Scripts\python.exe -m pytest` from the worktree.

**Why:** an environment restriction, not a code problem; adding timeouts or editing config does not help.
**How to apply:** in every Codex handoff say: write the API tests, run only the service-level ones, list what could not run; Claude runs the API tests and, for a tiny change, may implement it directly (log as worker=orchestrator in `delegation-log.md`). See [[project-worker-fallback-order]].
```

## File: `project-nav-held-fund-refresh-fix.md`

```markdown
---
name: project-nav-held-fund-refresh-fix
description: "16 Nov 2026 fix: nav-daily now refreshes held funds from AMFI's own dates; where the cron, log, digest and .env really live on the staging VM"
metadata:
  node_type: memory
  type: project
  originSessionId: 1f9169fe-28ba-4c87-8fbf-57e4276cbc44
  modified: 2026-11-16T07:58:11.097Z
---

nav-daily used to skip any fund with a NAV in the last 3 days (a peers-only cost saver), so held funds on stored-only Home/Portfolio pages sat 1-3 days behind. Fixed 16 Nov 2026 (commit `b231b6f4`, `held_nav_refresh.py`); record: `Docs/orchestration/2026-11-16-staging-deploy-record-nav-held-fund-fix.md`.

- VM cron is root's crontab and its `RUN` path points at the MAIN clone `/opt/unifolio` (still on feat/leapswitch-staging), not the redesign worktree. The nav digest script is called from `/opt/unifolio-redesign`.
- Real `.env` is `/opt/unifolio/deploy/leapswitch/.env` (root, 600); the redesign `.env` is a symlink. `OPS_ALERT_EMAIL` there is the recipient list for all job emails (now ayush, siddharth, aditi).
- Log: `/var/log/unifolio-nav.log` (`NAV_SUMMARY` / `NAV_PROBLEM` lines); digest email 14:10 IST. Runs 06:00 full, 10:30 and 14:00 held-only.
- deploy.sh often loses the `:previous` backend image (no rollback image after the 16 Nov deploy).

**Why:** owner depends on correct daily NAV for later plans. **How to apply:** when debugging stale prices or cron on staging, read the log first; remember sudo is needed for docker and the log, and the WSL-only SSH rule.
```

## File: `project-redesign-branch-model.md`

```markdown
---
name: project-redesign-branch-model
description: "How the UI redesign PRs are organised and deployed (one PR per page/flow, all onto leapswitch-redesign, deployed to a new link, ls-staging untouched)"
metadata:
  node_type: memory
  type: project
  originSessionId: 045d5be6-48a5-4617-9dbb-b06a948cdaad
  modified: 2026-10-25T09:20:26.770Z
---

Every page or flow of the redesign is one PR. All PRs land on `leapswitch-redesign` (PRs #9, #10 already target it). That branch is deployed to its own new link only once the whole redesign is on it; the existing `ls-staging` environment stays unchanged.

**Why:** the owner wants a structured, reviewable path and a single integrated test of the whole redesign. Transitional states (for example the shell's "Coming soon" landing with no enabled path to Mutual Funds) are expected on the integration branch and only matter if a branch is deployed alone.

**How to apply:** stack a PR on its predecessor's branch while the predecessor is unmerged (PR #11 is based on `feat/shell-nav`), then retarget to `leapswitch-redesign` after the predecessor merges; never merge a PR myself; the owner decides pushes and merges. Orchestration docs live on `leapswitch-redesign` and are merged into task branches. See [[project-ui-redesign-account-switch]] and [[feedback-opus-only-final-review]].
```

## File: `project-release-branch-model.md`

```markdown
---
name: project-release-branch-model
description: From 3 Nov 2026 evening the change-requests release is built on release/change-requests (worktree D:\unifolio-release), not on leapswitch-redesign, which also holds the other session's UI round 2 work
metadata:
  type: project
---

Another orchestrator session (the owner's intern, own machine, branch `ui-round-2`) committed UI round 2 work (ui-s0 to ui-s3, with deliberate red tests) onto `leapswitch-redesign` between 11:48 and 15:04 on 3 Nov 2026. To deploy only the change-requests release, I built `release/change-requests` from `7b773475` plus my later commits cherry-picked, in a separate worktree `D:\unifolio-release`. Docs: `Docs/orchestration/2026-11-03-release-branch-model.md` (on the release branch).

**Why:** the deploy (S.1) must not ship half-built UI round 2 code or red tests; nothing was rewritten or force-pushed.
**How to apply:** all further change-requests work is committed in `D:\unifolio-release` (cherry-pick from the Windows clone `C:\Users\Ayush\cr-run-1`, which is reset to the release head); run backend tests from there with the venv `D:\Unifolio code\backend\.venv-win`; frontend gates with `CR6_SRC=/mnt/d/unifolio-release/frontend CR6_DST=$HOME/cr6-fe-fix` (scratch script `gate_release.sh`). `D:\Unifolio code` stays on `leapswitch-redesign` (the shared union; do not commit there). The release branch is pushed as a new branch only at the owner's push word. See [[project-run6-gemini-frontend-setup]].
```

## File: `project-run6-gemini-frontend-setup.md`

```markdown
---
name: project-run6-gemini-frontend-setup
description: "How Run 6 (Head of Family frontend) is run with Gemini in Antigravity, and the fast WSL frontend check script"
metadata:
  node_type: memory
  type: project
  originSessionId: 294f65e8-d679-4632-ac8d-30c5abd282b6
  modified: 2026-11-02T10:29:04.019Z
---

Run 6 (frontend of Head of Family) is built by Gemini in Antigravity (Gemini 4 "Argon", then Gemini 3.8 high), one task at a time (T6.0 backend preview route and consent reason, T6.1 banner, T6.2 dialog, T6.2b undo page), per [[project-worker-fallback-order]]. Docs: `Docs/orchestration/cr-r6-common-rules.md` and `cr-r6-head-dialog-handoff.md`.

Frontend checks must run through `Docs/orchestration/cr-r6-fe-check.sh` (mirrors the Windows clone `C:\Users\Ayush\cr-run-1` into WSL `~/cr6-fe`, which holds a copy of node_modules): about 50 s for a folder, versus about 8 min from `/mnt/c` or `/mnt/d`.

**Why:** the Windows clone has no node_modules (Linux binaries) and cross-drive runs are very slow.
**How to apply:** tell the worker to use the script; re-sync the clone to the repo head (`git fetch "D:\Unifolio code" leapswitch-redesign; git reset --hard FETCH_HEAD` in the clone) before each task. Related: [[project-ui-redesign-account-switch]].
```

## File: `project-ui-redesign-account-switch.md`

```markdown
---
name: project-ui-redesign-account-switch
description: UI redesign orchestration runs across two Claude accounts sharing one checkout; frontend checks must run in WSL
metadata:
  node_type: memory
  type: project
  originSessionId: 045d5be6-48a5-4617-9dbb-b06a948cdaad
  modified: 2026-10-25T06:29:36.882Z
---

The owner alternates two Claude Code accounts on the UI redesign (Claude orchestrates, Codex implements via manual relay in the owner's chat). Both share `D:\Unifolio code` (WSL: `/mnt/d/Unifolio code`), so only one session may be active at a time. The Windows desktop app session and the older WSL terminal session differ in toolchain: `frontend/node_modules` has only Linux bindings, so vitest/tsc/oxlint/build run in WSL Ubuntu, never Windows.

**Why:** state lives only in committed docs on `leapswitch-redesign` (primary: `Docs/orchestration/2026-10-25-account-switch-return-handoff.md`); memory and Codex chats are per account.

**How to apply:** at session start run `git branch --show-current; git status --short`, read that handoff and `ui-redesign-session.md`, update both before hitting a limit. The owner is new to the desktop app (previously terminal only), so explain app mechanics briefly. See [[feedback-opus-only-final-review]].
```

## File: `project-worker-fallback-order.md`

```markdown
---
name: project-worker-fallback-order
description: "Owner's order for which worker model implements tasks when Codex hits its usage limit (set 2 Nov 2026, Run 5 close-out)"
metadata:
  node_type: memory
  type: project
  originSessionId: 294f65e8-d679-4632-ac8d-30c5abd282b6
  modified: 2026-11-02T06:30:14.847Z
---

Codex (desktop app, owner pastes prompts) was at about 1% of its hourly limit on 2 Nov 2026, after Run 5 Task 5.5. From Task 5.6 onward the owner's order for the implementing worker is:

1. Antigravity with **Claude Sonnet 5.5 on high**, until its quota runs out.
2. Then the Gemini model the owner called "Gemini 4 Argon" (as dictated; confirm the exact name in the Antigravity picker).
3. Then **Gemini 3.8 high**.
4. When all of Antigravity is out, everything runs linearly in this Claude session (no worker, no handoff overhead).

**Why:** usage limits, not quality; the owner keeps the orchestrator (this Claude) as reviewer and committer in every case, exactly as with Codex.

**How to apply:** keep writing the same handoff docs and prompts (they are model-neutral); the worker never commits; review every diff and re-run the tests here; use a different model family for adversarial reviews when possible (a Gemini reviewer for Claude-written code and the reverse). Prior Gemini (Antigravity) packets were used in the UI redesign (see [[project-ui-redesign-account-switch]]). When the worker is Claude itself, the work is done inline and the independent adversarial review still has to come from another model or a fresh subagent given the code, not the conclusion ([[feedback-opus-only-final-review]]).
```

## File: `reference-staging-vm-access-and-network.md`

```markdown
---
name: reference-staging-vm-access-and-network
description: "How to reach and check the LeapSwitch staging VM (hostname, WSL-only SSH, CloudPe API, never Detach) and where the runbook is"
metadata:
  node_type: memory
  type: reference
  originSessionId: 573ef2c0-983f-4497-b064-63fd816b0cfd
  modified: 2026-11-09T10:38:28.997Z
---

Staging VM `unifolio-staging-1` on CloudPe. Full detail, pre-flight check and recovery: `Docs/orchestration/2026-11-09-runbook-staging-network-and-access.md`.

- SSH: `ssh deploy@ls-redesign.unifolio.in`, **from the laptop's WSL only** (the Windows key is refused). Use the hostname, never the IP: the public IP changed on 9 Nov 2026 (now 45.64.107.180) after the public interface was detached by mistake.
- VM must have exactly one `public` interface carrying security group `unifolio-web` (never `default`, which allows all traffic). Never click Detach on the VM's Networking tab.
- DNS stays on AWS Route 53 (zone `unifolio.in`, AWS CLI in WSL works). Three A records: ls-redesign, ls-staging, ls-staging-api.
- CloudPe control: the REST API `https://app.cloudpe.com/api/v1` with a `cpk_` key works (ask the owner for the key; it is not stored). The OpenStack CLI in WSL is dead (its auth host no longer resolves).
- A backend rebuild needs 10 GB free (guard in `deploy.sh`); on 9 Nov, 8.3 GB was free after a deploy, so the next backend deploy needs space freed first.

**Why:** the 9 Nov outage cost hours because the symptom (SSH timeout) pointed at a security group rule, not at the missing public interface. **How to apply:** before any staging task, run the runbook's section 4 pre-flight; when both HTTPS and SSH fail, go straight to its section 5.
```
