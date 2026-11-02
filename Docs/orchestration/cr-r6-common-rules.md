# Run 6 common rules (the `cr-r6-*` handoff points here)

Run 6 of 7: Head of Family, frontend (item 1), plus one small backend route the dialog needs. Plan: `Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md`, section "Run 6". Design source: the briefing's "Item 1 build" section (`Docs/orchestration/briefing-build/sections/sec_i1.html`, readable as text). Commit prefix `cr-r6:`. The worker is Gemini in Antigravity (Gemini 4 "Argon" first; Gemini 3.8 high if that runs out). The orchestrator (Claude) reviews every task, commits and tags. **The worker never runs `git add`, `git commit`, `git push` or any git command that changes anything.**

## Where to work and how to check
- Edit files in the Windows clone `C:\Users\Ayush\cr-run-1` (the orchestrator syncs it to the repo head before each task). Never edit `D:\Unifolio code`.
- **Frontend checks** run on WSL's own disk, through one script that mirrors the clone into `~/cr6-fe` and runs the tool (the Windows clone has no `node_modules`, and running from `/mnt/c` is ten times slower):
  - Tests: `wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/cr-r6-fe-check.sh" test <paths>` (one or more file or folder paths under `src/`, for example `src/features/profile-v2`). About a minute for a folder.
  - Types: `... cr-r6-fe-check.sh types`; lint: `... lint`; build: `... build`.
- **Backend checks** (only Task 6.0): from the clone's `backend` folder, `D:\Unifolio code\backend\.venv-win\Scripts\python.exe -m pytest <files> --basetemp=<an existing folder you create, for example C:\Users\Ayush\cr-tmp\w> -p no:cacheprovider`. Never point anything at a shared database. The Postgres functional tests are not needed in this run.
- Real PDFs and real data are never used. No visual check is possible for you: say so in the report where it applies; the orchestrator and the owner look at the screens later.

## Method per task
1. Read the task text in the handoff, then the real code it names (open the files; do not guess names). 2. Tests first, run them, show each fails for the stated reason. 3. Implement. 4. Run the touched tests **and every test file that reads a name you changed** (search the old names across `src/`). 5. Report in the format below.

## Hard rules
1. **Existing behaviour does not change.** Do not reword an existing string, label or error you were not asked to change. `features/profile-v2/guards.test.ts` and `boundary.test.ts` may change only a file count or an expected-file list when you add files, never a rule. If a guard blocks your design, stop and ask.
2. **Plain words on every user-visible string.** Short sentences, no jargon, never a guessed pronoun for a person (use the name, or "them").
3. **Server messages are shown as sent.** Head-change errors arrive as HTTP status plus `detail: {code, message}`; show `message` next to the control it belongs to (see the table in the handoff). Do not invent wording for a code that has a message. Anything not in the table gets one plain generic sentence and is listed in your report.
4. **Secrets and test codes.** A code returned by the API in the `otp` field is shown ONLY when it is non-null (stub mode) and only through the shared banner. Never log a code, an undo token, an email or a phone number. Never put the undo token in a query string, local storage or the console; it is read from the URL fragment, sent once in a POST body, then removed from the address bar.
5. **No client-side decisions about who may do what.** The button's visibility, the greyed members and the reasons all come from the API (`/auth/me` `head_member_id`, `GET /auth/head-change/eligibility`). The client never recomputes eligibility.
6. **After the change succeeds the client calls the app's existing `logout()` and shows the sign-in page** with a plain notice; it never keeps using the old session (the server has already deleted it).
7. **Old and new payloads.** `head_member_id` and `head_change_pending` are additive on `/auth/me`; a payload without them (an old test fixture) behaves as "not the head, nothing pending".
8. **Edits outside the task's Files list** (fixtures, shared components, other tests): ask first, or list each in the report with the reason.
9. **Anything that decides who can sign in, or whose consent counts: stop and ask** (two options and your recommendation) instead of choosing.

## Known failures that are not yours
Three frontend tests fail only when the whole suite runs under load and pass alone (78 tests in 3 files); backend failures in `tests/scripts/test_refresh_news.py` and one `test_fund_valuation_layouts` case, and 5 that need `backend/.cache/amfi_navall/nav_all.txt`.

## Report (keep it short)
Failing-test counts before; final counts with the exact commands; `git status --short` (new and changed files); the decisions the handoff did not cover; every file edited outside the Files list and why; anything you could not check (visual). No narrative of things that did not change.

## Gate (stricter: sign-in screens)
The orchestrator re-runs the touched tests and the whole frontend suite, builds, lints, reads the diff, then an independent review. The orchestrator commits and tags `cr-run-6-done` locally; nothing is pushed or deployed.
