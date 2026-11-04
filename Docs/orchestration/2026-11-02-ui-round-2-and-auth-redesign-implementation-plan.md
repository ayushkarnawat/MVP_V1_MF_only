# UI Round 2 and Sign-up / Sign-in Redesign: Implementation Plan

> **Read first.** This is the one plan. Part 1 holds the method, the global rules and the decisions. Part 2 is the stages S0 to S7 in order, each with its tasks step by step. The spec is the planning page `Docs/orchestration/2026-11-02-auth-redesign-plan.html` (artifact "Unifolio Auth Redesign Plan", version 17 and later). **Where this plan and the spec disagree, stop and ask the owner.** All 42 numbered questions (Q29 to Q70, with Q31 and Q32 withdrawn) and the older Q1 to Q28 are answered. **One new question is open: Q71** (see Part 1, Open question). It is only needed at S6 Task 6.11.

> **Team and method (changed 3 Nov 2026).** Claude is the **orchestrator**. **Codex does all backend tasks** and **Antigravity (Gemini) does all frontend tasks**. There is no manager in the loop: the owner and Claude run every stage. Each task below carries a worker tag: **[Codex]**, **[Antigravity]** or **[Claude]**. One handoff document per task, written by Claude at the start of its stage, **not in these plans**. Each worker has one standing rules file: `Docs/orchestration/ui-common-rules-codex.md` and `Docs/orchestration/ui-common-rules-antigravity.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** build, on `leapswitch-redesign`, the nine round-2 change requests of 2 Nov 2026 and the sign-up, sign-in and onboarding redesign from the two PDFs: (1) Home greeting follows the selected member, (2) category column shows only the category, (3) the Actual XIRR view of the fund's Returns gets its own grouped-bar graph, the toggle moves above the period buttons and the benchmark is named in pills, (4) overlap pairs link to the two-fund comparison, (5) a statement in a different name adds a family member and never renames the account holder, (6) the Home allocation donut becomes interactive, (7) Add data and Add Investment ask which family member first, (8) new funds and their transactions are shown after an in-app upload, (9) the Returns toggle is renamed with info icons, plus the six life goals, the new split-card auth screens, the email change on Back, required answers on screen 4, and the Connect accounts to All set path.

**Architecture:** additive and staged. Eight stages (S0 to S7) in the order below, each one run of the orchestrator-and-two-workers loop with its own start commit, gate and tag. The new auth screens are built beside the old ones behind a `variant` prop, so mobile keeps today's look and the flip in `App.tsx` is the rollback. The only schema change is the goals migration (S5). New funds, the Current graph and the greeting need no migration.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, Pydantic v2, pytest (SQLite in unit tests, Postgres in `tests/functional_postgres`); React 19, Vite, Tailwind, vitest + Testing Library, Playwright for screenshots.

**Spec:** `Docs/orchestration/2026-11-02-auth-redesign-plan.html` and its handoff `Docs/orchestration/2026-11-02-auth-redesign-handoff.md`. The decisions table at the end of the page is the single list of what was decided.

**Start condition and where the branch stands (updated 3 Nov 2026).** Runs 1 to 6 of the change-requests plan (`2026-10-31-change-requests-implementation-plan.md`) are done, including Head of Family backend and frontend (migrations `0050` to `0052`, Alembic head `0052`, so the goals migration is `0053`). **The manager is building Run 7 (frontend only: logos, one heading per card, the green button token, the benchmark explanation and info icon) at the same time as this plan, so we do not wait for it. We start now, in the order below.** Run 7 touches `SchemeLogo`, the card headings and button token, the valuation and benchmark text; the stages below that reuse those wait. **Hold until Run 7 is on the branch:** S1 task 1.5, S4 tasks 4.2 to 4.4, and all of S6 (the green token and logo). Everything else may run now, backend and frontend. Every file and line reference in this plan was read on 2 Nov 2026 at commit `bd8cd19`; **S0 re-checks every cited name at the real start commit** and again for each hold-list task when Run 7 lands. If a name moved, use the new one. If the behaviour cannot be kept, stop and ask. Reuse what the runs already built: `OtpStubBanner`, and (once Run 7 is in) its green token and shared info icon.

**Commits and pushes.** **Where work happens.** The orchestrator session runs in the `wt/docs` worktree on `leapswitch-redesign`. **All commits and all pushes are made there and nowhere else**, on `leapswitch-redesign` (no side branch). The manager is building Run 7 (frontend) on the same branch at the same time, so before every commit run `git pull --ff-only origin leapswitch-redesign` and keep each task's commit to its own files. Tasks that touch Run 7's files wait (hold list below). Workers never run a git command that changes anything. Claude reads each diff and commits with the prefix `ui-s<N>:` and a local tag `ui-s<N>-done` after each stage's gate (rollback point: revert the commit range). Never push to `main` or `feat/leapswitch-staging`, never force-push, nothing is deployed before the owner's explicit go at S7, and product code is pushed only when the owner says so. The Windows clone Antigravity edits is a separate clone (never `wt/docs`), synced from the repo head before each task (see the rules file).

**Test commands:** backend `cd backend && pytest <touched files>`; Postgres-only behaviour `pytest tests/functional_postgres/<file>` with `TEST_DATABASE_URL` set (`docker compose up postgres`); frontend `cd frontend && npx vitest run <touched files>`, plus `npm run build` (runs `tsc -b`) and `npm run lint` at the end of every stage. No live network in tests. Run only the touched files per task. Run the full backend and frontend suites once per stage before its handoff documents may move to DONE.

---

## Run sheet: the order, in eight steps

Each stage is one run of the orchestrator-and-two-workers loop (see Method). Do not start a stage before the one above it is tagged. Stage details are in Part 2.

| Step | Stage | What | Tasks | Starts when | Ends with |
|---|---|---|---|---|---|
| 0 | **S0** Start and baseline | Record the start commit, re-read the cited code, take baselines, sync the Antigravity clone, make the Codex clone, write the S1 handoffs | 0.1 to 0.7 | Now. Runs 1 to 6 are done; Run 7 is built by the manager in parallel and does not block S0 | Tag `ui-s0-done` |
| 1 | **S1** Quick fixes | Greeting follows the member (1), category label (2), overlap pairs link to the comparison (4), member pop-up before Add data (7), Returns toggle renamed with info icons (9) | 1.1 to 1.6 (all five are Antigravity tasks, run one after the other) | S0 done | Tag `ui-s1-done` |
| 2 | **S2** Home donut and new funds | Interactive Home donut with a funds pop-up (6), new funds and their transactions after an in-app upload (8) | 2.1 to 2.6 (Codex does 2.1, 2.3, 2.4 while Antigravity does 2.2 and 2.5) | S1 done | Tag `ui-s2-done` |
| 3 | **S3** Name mismatch | The account holder is never renamed, the statement's people are added as family (5) | 3.1 to 3.6 | S2 done (shared import confirm) | Tag `ui-s3-done` |
| 4 | **S4** Actual XIRR graph | Toggle moved up, grouped-bar graph for Actual XIRR, benchmark pills (3) | 4.1 to 4.5 | S1 task 1.5 done and Run 7 on the branch (for 4.2 to 4.4; 4.1 backend may start now) | Tag `ui-s4-done` |
| 5 | **S5** Six goals | The one migration, enum, schema, Profile, mobile screen, queries | 5.1 to 5.5 | S4 done | Tag `ui-s5-done` |
| 6 | **S6** Sign-up and sign-in redesign | Foundations, login, sign-up front, sign-up back, states | 6.1 to 6.16 (5 phases) | S3 and S5 done and Run 7 on the branch | Tag `ui-s6-done` |
| 6b | **Task D.1** Documentation | PRD, schema doc, decisions, session, guides | D.1 | S6 done, the owner reviews the diff | Owner approves |
| 7 | **S7** Staging QA and rollout | Deploy guide, QA checklist, one deploy | 7.1 to 7.3 | S6 and D.1 done, and the owner's explicit go | Tag `ui-s7-done` |

**Every stage does the same seven things, in this order:** (1) record the start commit, sync Antigravity's Windows clone to it and, for a stage with backend tasks, make a fresh Codex clone and run the cheap probe; (2) write the handoff documents for the stage's tasks; (3) for each task: failing tests, confirm they fail for the stated reason, implement, tests green, the orchestrator reads the diff and commits `ui-s<N>:`; (4) run the stage checks; (5) the mandatory adversarial review (`/codex:adversarial-review` through `codex:codex-rescue`, for backend and frontend commits alike), which the owner relays; (6) fix findings under the review-loop rules and re-review; (7) tag `ui-s<N>-done`, add the delegation-log line, update `session.md`.

---

# Part 1: Method, rules and decisions

## Global Constraints

Every task in every stage inherits these.

- **UI only, with two approved backend exceptions.** (a) The goals change (S5): one migration, the six-value enum, the schema, the route and the report script. (b) Small additive response fields named in the stages (Home allocation `funds`, confirm `new_funds`, returns `benchmark_label`, import-resolve `add-as-family`). **No other backend change.** A new field on a response model has a default, so old clients keep working.
- **No new migration except S5.** Run `alembic heads` at S0 and again at S5. At the time of writing the Alembic head is `0052` (Runs 5 and 6 added `0050` to `0052`), so the goals migration is expected to be `0053`. If the number is taken, stop.
- **Money and units are `Decimal`**, serialised as strings. The frontend formats and never adds money. Percent figures on the Current graph are display-only numbers parsed from the response strings.
- **Mobile is unchanged.** Under 768 px, or a `/mobile` path, the legacy look stays (Q20). The only mobile change is the goals screen (six goals, up to six, the All of it shortcut), because the backend would otherwise reject its old values.
- **The existing Inception performance graph is not changed** (its lines, colours, legend, notes, period buttons). The only change next to it is the toggle row above its period buttons (S4).
- **Plain words.** Every label added to a screen is readable by a first-time investor. No "TRI", "proxy", "fallback" in the UI (the existing benchmark labels already follow this).
- **Light only on auth screens** (Q21). The app screens follow their own theme tokens.
- **Design tokens:** use the app's tokens (`--ui-*`, `--pos-text`, `--neg-text`, `--c2`, `--c3`, and the green token introduced by change-requests Run 7). Add only the auth mint tints in `styles/auth-tokens.css`.
- **Test first, always.** Failing test, confirm it fails for the stated reason, implement, tests green. This is enforced by the repo's TDD rule.
- **Do not change an answered decision.** If a task seems to need one changed, stop and ask.
- **Charts and screens keep accessibility:** every new control is keyboard reachable with a visible focus, every error is announced, every motion respects `prefers-reduced-motion`.
- **Untouched:** SIP logic, the import engine's matching rules (except the one new resolve answer in S3), the shell routes other than the one new compare route, the legal pages, the print view, the phone app.

## Decisions at a glance

The spec's decisions table is the source. These are the ones that shape the code.

| Topic | Decision | Task |
|---|---|---|
| Greeting | Head's first name in the family view, the selected member's first name in a member view (Q29) | S1 T1.1 |
| Category | Strip every prefix before the first dash, show only the category (Q30) | S1 T1.2 |
| Overlap pairs | Replace the Combined Weight column with an `Overlap comparison` column holding a View more link. New route `/portfolio/mutual-funds/overlap/compare/:fundA/:fundB` with Back to the portfolio overlap page. The individual fund's own list stays. `combinedWeight()` stays in code because the Key insights sentence uses it (Q33, Q34) | S1 T1.3 |
| Add data | In the family view a pop-up asks which member, nobody pre-selected, Continue disabled until one is chosen. Member view skips it. The header dropdown stays (Q43, Q44) | S1 T1.4 |
| Returns toggle | Labels `Model Portfolio Returns` and `Actual XIRR`, an info icon on each with a short tooltip (Q48, Q49, Q50) | S1 T1.5, moved in S4 |
| Home donut | Hover dims the others, click opens a pop-up with the class, its value and share, and its funds, from a new `funds` field (Q41, Q42) | S2 T2.1, T2.2 |
| New funds | Existing users who add data inside the app only, never for the sign-up upload. All new funds, collapsible section, each fund shows invested amount, latest transaction date and its transactions (cap 20, then View all in Import History). A new fund is a scheme the member held nothing of before this import (Q45 to Q47, Q69, Q70) | S2 T2.3 to T2.5 |
| Name mismatch | The pop-up says whose account it is and offers `Add {name} as a family member` or `Upload a different file`. The account holder is never renamed, keeps no PAN until their own file is uploaded. No third link. Several people: same pop-up and flow, the other people go through today's people-found step (Q35 to Q39) | S3 |
| Current graph | Grouped bars, one pair per period (1Y, 3Y, 5Y, Since first investment), your holding and the benchmark with the same cash flows, each bar one table cell, from the response the table already loads. No period buttons. Not-held, no-benchmark, loading and error states. Toggle moved into the performance card (Q52 to Q56, Q59, Q60) | S4 |
| Benchmark pills | Under the Benchmark row label, the index name and the source as pills. Needs `benchmark_label` on the returns response (Q57, Q58) | S4 |
| Goals | Six codes approved: `wealth_creation`, `retirement`, `childrens_education`, `buy_home`, `financial_freedom`, `tax_planning`. Up to six allowed, one to six in the database check. The All of it shortcut stays. The legacy `primary_goal` column and type are dropped (Q13 B, Q13b B, Q68 A) | S5 |
| Auth screens | One split card, centred 360 px form block, fixed top bar and bottom row, left panel with one left edge, gentle float on the sketches (Q61, Q62). Login 1 headline and paragraph sit lower and left-aligned | S6 |
| Screen 3 on Back | Both fields editable. A changed email goes through `requestContactChange` and `verifyContactChange` (they already exist in `AuthContext`), the old email is replaced (Q65, Q66) | S6 |
| Screen 4 | Nothing pre-selected, no Skip, both answers required, a small error on Continue, a Select all (Clear all when all are chosen) on goals. Desktop only (Q67) | S6 |
| Connect to All set | Step 5 of 5, today's import screens with no step bar, All set as Done, resume on All set when an import is complete (Q7, Q63, Q64) | S6 |

## Open question (needed only at S6 Task 6.11)

**Q71. Should the old email address get the "your email was changed" notice when a person changes their email on Back during sign-up?** The existing backend function that the change uses (`send_contact_change_notice`) always emails the **old** address a notice with a 7-day undo link. During sign-up the person typed that old address minutes ago, so the notice is noise, and a typo address would receive mail from us. **Recommendation:** leave the backend as it is (the UI-only rule), and have Claude check at S6 Task 6.11 whether the notice is sent in the sign-up flow. If it is, the owner decides whether to accept it or to approve one small backend flag that skips the notice before the account is complete. Do not start Task 6.11 before the owner answers.

## Review Focus

Failure modes no single task's tests would otherwise exercise, most likely first. Each is pinned by a test in the task named.

1. **The account holder is renamed or loses their identity** (S3). A different-name statement must never change the self member's name, name source or PAN, and must write no name-change row (T3.1, T3.2).
2. **PAN lands on the wrong person** (S3). Lalchand's PAN goes to Lalchand. When Prateek later uploads his own file his PAN must be stored on Prateek and must not look taken (T3.2).
3. **The new-funds list leaks into sign-up** (S2). The sign-up upload shows no list, returns none, and runs no query (T2.3, T2.5).
4. **The Inception view changes** (S4). Its markup apart from the toggle slot, and the other charts that share `Segmented` or the performance endpoint, must be identical to before (T4.3).
5. **The graph disagrees with the table** (S4). Every bar equals its table cell for every response shape (T4.4).
6. **Goals rejected or accepted wrongly** (S5). Old codes, an empty list and duplicates behave as specified, six goals are accepted, the migration runs up, down and up on Postgres (T5.1, T5.2).
7. **Email change locks the user out or double-sends** (S6). A changed email is only saved after the new code is verified, a taken address is refused, the old email stops signing in only after verify, resend respects the 60-second throttle (T6.8).
8. **Mobile regresses** (S6). The legacy variant renders exactly as before (T6.2, T6.15).
9. **Old stored payloads and old clients.** A response without the new field renders (Home allocation without `funds`, confirm without `new_funds`, returns without `benchmark_label`) as today, never a crash (every frontend task that reads a new field).

## File Structure

| Area | Files (modify unless marked create) |
|---|---|
| Home backend | `backend/app/api/home.py`, `app/services/home/allocation.py`, `app/services/home/schemas.py` |
| Home frontend | `frontend/src/features/home/components/AllocationDonut.tsx`, `features/home/sections/Allocation.tsx`, `features/home/types.ts`; create `features/home/components/AllocationClassDialog.tsx` |
| Mutual Funds | `features/mutual-funds/overview/HoldingsTable.tsx`, `features/mutual-funds/overlap/TopPairs.tsx`, `ComparisonState` host; create `features/mutual-funds/overlap/CompareFundsPage.tsx`, `src/lib/categoryLabel.ts` |
| Shell | `shell/nav/ImportProvider.tsx`, `shell/nav/paths.ts`; create `shell/nav/MemberPickerDialog.tsx`, `shell/routes/portfolio-mutual-funds-overlap-compare.route.tsx` |
| Individual fund | `features/individual-fund/components/Segmented.tsx`, `overview/ReturnsTable.tsx`, `overview/PerformanceChart.tsx` (one slot only), `OverviewPage.tsx`, `overlap/ComparisonState.tsx` (back label); create `overview/CurrentReturnsChart.tsx`, `overview/BenchmarkPills.tsx`, `overview/ReturnsModeToggle.tsx` |
| Fund page backend | `backend/app/services/fund_page/schemas.py`, `returns.py` |
| Import backend | `backend/app/services/import_/service.py`, `confirm_people.py`, `schemas.py`, `backend/app/api/imports.py`; create `services/import_/new_funds.py` |
| Import frontend | `features/import/prompts/NameMismatchDialog.tsx`, `prompts/PromptHost.tsx`, `useImportFlow.ts`, `api.ts`, `types.ts`, `useImportOrchestration.tsx`, `ImportHistoryList.tsx`; create `features/import/NewFundsList.tsx`, `ImportStats.tsx` |
| Goals | `backend/alembic/versions/<next>_primary_goals_life_goals.py` (create), `app/models/enums.py`, `app/models/user.py`, `app/services/auth/schemas.py`, `app/api/auth.py`, `backend/scripts/report_onboarding_goals.py`; frontend `features/auth/types.ts`, `features/auth/Q3Purpose.tsx`, `features/profile-v2/lib/onboardingOptions.ts`, `lib/goalChips.ts`, `components/GoalsDialog.tsx`, `pages/PersonalInfoPage.tsx`, `fixtures/me.ts` |
| Auth redesign | `frontend/src/App.tsx`, `features/auth/AuthEntryFlow.tsx`, `OnboardingFlow.tsx`, `SoloCasUpload.tsx`, `onboardingSteps.ts`, `validation.ts`; create `styles/auth-tokens.css`, `features/auth/redesign/*`, `public/illustrations/auth/*` |
| Docs | `Docs/PRDs/PRD-02-Signup-Onboarding.md`, `Docs/PRDs/Database-Schema-Unifolio.md`, `backend.md`, `database.md`, `decisions.md`, `log.md`, `session.md`, `DEFERRED_FEATURES.md`, the two staging DB guides, the new deploy guide |

## Team: who does what

| Who | Does | Never does |
|---|---|---|
| **Claude** (orchestrator) | Interface design and the backend contract for every task, the migration text, the handoff documents, prompts for both workers, reading every diff, running the gates, all commits and tags, the review dispatches, the documentation update, the deploy guide | Writes product code except small review fixes under the skill's "Review-loop fix authorship" rule |
| **Codex** (backend worker) | Every task tagged **[Codex]**: API routes, services, schemas, the goals migration, report scripts, backend tests | Any frontend file. Any git command that changes anything. A migration number or interface the handoff did not give |
| **Antigravity** (frontend worker; Gemini 4 "Argon" first, Gemini 3.8 high if that runs out) | Every task tagged **[Antigravity]**: components, pages, hooks, styles, sketches, frontend tests, fixtures | Any `backend/**` file. Any git command that changes anything. A guess at a backend field: it builds against the contract in the handoff |

**Lane rules**
1. **Backend first, frontend against a contract.** For a stage with both lanes, the handoff states each response shape exactly (field names, types, an example payload). Antigravity builds against that payload and the fixtures in the handoff, so both lanes can run **at the same time**. Claude checks the two against each other at the stage gate with the real endpoint.
2. **One session per worker, one task at a time.** "May run in parallel" in a stage means one Codex task and one Antigravity task together. Two tasks for the same worker run one after the other.
3. **The owner relays.** The owner pastes Claude's prompt into the worker's tool and pastes the worker's report back. Claude never assumes a worker finished until the report is pasted and the diff is read.
4. **Handoffs and rules files.** Each task has a handoff `Docs/orchestration/<slug>-handoff.md` (Claude writes it). Each worker's prompt names its handoff and its rules file. Paste-ready prompt templates are in the rules files.
5. **Hold list and pulls.** Tasks 1.5, 4.2 to 4.4 and all of S6 wait for the manager's Run 7. Before every commit the orchestrator runs `git pull --ff-only origin leapswitch-redesign`, so the manager's commits are in. When Run 7 lands, S0 task 0.2 is repeated for the hold-list tasks.
6. **Escalation.** A worker that hits a question the handoff does not answer stops and lists two options with a recommendation. It never decides anything about identity, consent, money or who may sign in.

## Method: the orchestrator and two workers loop (as used for Sub-projects 1 and 2, the analytics UX changes and the change-requests plan)

1. **Roles.** See "Team: who does what". Claude is the orchestrator and never delegates interface design, the migration, verification, commits or the review decision. Codex (`codex:codex-rescue`) implements backend tasks. Antigravity implements frontend tasks. A genuine Claude subagent is a fallback only under the three conditions in `references/delegation-rules.md`. Opus only on the three named triggers in `references/escalation-triggers.md`, and only after asking the owner. **The model is never switched without the owner asking.**
2. **Per stage, before any dispatch:** (a) record the starting commit on `leapswitch-redesign`; (b) **Antigravity:** the orchestrator syncs a separate Windows clone for Antigravity (a folder under `C:\\Users\\Dell`, named by the owner at S0, never the `wt/docs` worktree) to that commit, and Antigravity edits only there; its checks run through `Docs/orchestration/cr-r6-fe-check.sh` (`test`, `types`, `lint`, `build`) on WSL's own disk, exactly as in Runs 6 and 7. The orchestrator copies the verified files into the repo and commits. **Codex (stages with backend tasks: S2, S3, S4, S5):** clone `leapswitch-redesign` at that commit into a fresh directory on the native filesystem (`git clone --branch leapswitch-redesign file://<repo> ~/ui-s<N>`, then a throwaway branch `codex/ui-s<N>`), dispatch Codex there, then copy the verified changes back; (c) for Codex, run the **cheap probe first**: one dispatch to write a one-line file, `git add` it, `git commit` it, expecting that Git writes fail in the sandbox, in which case Codex implements and self-checks and **the orchestrator does every staging, commit and merge**; (d) provision `backend/.venv` in the Codex clone only after the probe passes. The Antigravity lane needs no probe, its rules forbid mutating git.
3. **Per task, the standard cycle.** Step 1 failing tests (named, with assertions); Step 2 run them and confirm they fail for the stated reason; Step 3 implement the stated signatures; Step 4 run the task's test files and confirm they pass; Step 5 the orchestrator verifies the diff (`git diff --stat`, reads the changed files, re-runs touched-area tests) and commits with the prefix `ui-s<N>:`.
4. **Handoff documents.** One per task, or per group of tasks that share files and one worker, at `Docs/orchestration/<slug>-handoff.md`, written by the orchestrator at the start of the stage from the stage's tasks. Each states the worker, scope, files, interfaces (with example payloads for the backend contract), tests, constraints and the reasoning. The prompt refers to the handoff by path, to the worker's rules file and to the spec section by id. Status OPEN, IN REVIEW, DONE. One line per decision goes in `Docs/orchestration/delegation-log.md`.
5. **Parallel dispatch** is one Codex task with one Antigravity task, and only when they share no files (stated per stage). A worker never runs two tasks at once.
6. **Mandatory review gate before a handoff may be DONE:** `/codex:adversarial-review` against the stage's commit range (`<start commit>..HEAD`), dispatched through `codex:codex-rescue` with `run_in_background: true`, never `isolation: "worktree"`. The wrapper is forwarder-only: **the owner must type `/codex:status <id>` and `/codex:result <id>` and relay the output**. Tell the owner this when each review is dispatched. Findings are never applied automatically. A verdict that contradicts a direct read of the cited lines is re-dispatched, not acted on. The orchestrator may fix findings directly only under the "Review-loop fix authorship" criteria in the skill, followed by a scoped re-review. Stop after a round whose remaining findings are lower severity, correctness-safe and would need a bigger primitive: record them as known limits.
7. **Verification tiering:** intermediate rounds re-run only the touched-area test files; the round expected to reach DONE, and any round touching shared code beyond the task's own files, gets the full backend and frontend suites.
8. **Deeper check** on S3 (identity and PAN) and S5 (migration and data): a second, scoped adversarial-review round after fixes and an orchestrator hand check of the named cases.
9. **Stage gates, in order:** touched-file tests; full suites; `npm run build` and `npm run lint`; old-payload tests; then the stage's own checks (synthetic CAS gates for S2 and S3, Postgres functional tests for S3 and S5, migration up, down and up for S5, Playwright screenshots for every screen change, timing script for Home for S1 and S2). Then tag `ui-s<N>-done`, add the delegation-log line, update `session.md`.


---

# Part 2: The stages, step by step

## Stage S0: Start, Re-read and Baseline

> Run through the orchestrator-and-workers method in Part 1. No product code is written in S0. Commit prefix `ui-s0:` (documentation only).

**Goal:** begin from the real, final code of the change-requests plan, prove every name the other stages cite, record the starting state and the baselines, and prepare the worker lanes (Antigravity's clone, Codex's clone) and the handoff documents.

**Gate to start:** the owner says go and gives the start commit (the head of `leapswitch-redesign` in `wt/docs`). Run 7 is not required (Q51 is relaxed by the owner on 3 Nov: it runs in parallel and only the hold-list tasks wait for it).

---

### Task 0.1: Record the start **[Claude]**

- [ ] Record the start commit of `leapswitch-redesign` and the date in `Docs/orchestration/ui-run-log.md` (create). One line per stage will be added there.
- [ ] Run `cd backend && alembic heads` and record the head. **Expected: `0052`** (Head of Family and the later runs). The goals migration takes the next free number after it. If two heads appear, stop.
- [ ] Confirm the owner's list: only **Q71** is open (needed at S6 Task 6.11). Everything else is answered and the goal codes are approved.

### Task 0.2: Re-read the code the plans cite **[Claude]**

Read each item and write one line in the run log: **unchanged**, **moved to X**, or **behaviour changed (explain)**. Where a name moved, this plan's behaviour wins and the new name is used. The stage plans were written on `bd8cd19`.

| Area | Cited names to verify |
|---|---|
| Head of Family (the main risk for S3 and S6) | How "the account holder" is stored and found after Runs 5 and 6: the `self` relationship, any `is_head` column, `users.head_*`, `_self_member`, `resolve_self`, `has_permanent_pan`. S3 and S6 say "self member"; if Head of Family changed this, the plans follow the new rule. |
| Home | `_display_name` and `_summary` in `app/api/home.py`; `ScopeContext` fields `scope`, `member_id`, `member_name`; `load_allocation`, `ClassRow`, `ClassRowOut` |
| Auth | `OtpVerify.tsx`, `OtpStubBanner.tsx` (created by Run 6 task 6.1), `ReconsentGate.tsx`, `features/auth/api.ts`, `types.ts`, `AuthContext` (`requestContactChange`, `verifyContactChange`), `onboardingSteps.ts`, the green token (`bg-[var(--pos)]`, Run 7) |
| Import | `service.py`: `_self_member`, `_self_match`, `_me_key`, `next_prompt`, `resolve_name`, `_finish`; `confirm_people.py`: `confirm_people_import`, `confirm_single_member_import`; `api/imports.py` header `x-upload-surface` and `_UPLOAD_SURFACES`; `PersonConfirmResult`, `ImportConfirmResponse` |
| Fund page | `ReturnsTable.tsx` (`MODE_OPTIONS`, `useFundSection`, `wantCurrent`), `Segmented.tsx`, `PerformanceChart.tsx`, `OverviewPage.tsx`, `returns.py` (`inception_returns`, `current_returns`), `ReturnsResponse`, `BENCHMARK_LABELS`, `benchmark_for_scheme` |
| Charts | `components/ui/charts/grouped-bar-chart.tsx` props (`buckets`, `seriesColors`, `formatValue`, `ariaLabel`, `onBucketClick`, `height`, `width`) |
| Shell | `shell/nav/ImportProvider.tsx`, `paths.ts`, `registry/registry.test.ts`, `ScopeValue` (`viewMode`, `memberId`, `members`) |
| Goals | `PrimaryGoal` enum, `UpdateMeBody._dedupe_goals`, `update_me`, the CHECK `ck_users_primary_goals_allowed`, the frontend goal files listed in the this plan |

### Task 0.3: Baselines **[Claude]**

- [ ] Home summary and allocation timing: run the repo's Home timing script twice for a recomputed test user and record both. The change-requests handoff says the Home and benchmark baselines were never measured on 30 Oct. If they still do not exist, measure them now. **S1 and S2 must stay within 10% of these.** Per the change-requests rules: no script may be more than 10% slower than the baseline.
- [ ] Record the full backend and frontend suite results at the start commit (counts of passed tests), so a later regression is visible.
- [ ] Record `npm run build` and `npm run lint` results.
- [ ] Run the synthetic CAS gates once (normal and mfapi-blocked) and record the pass counts. S2 and S3 compare against them.

### Task 0.4: Worker lanes: Antigravity clone, Codex clone and the cheap probe **[Claude]**

- [ ] **Antigravity:** sync the Windows clone to the start commit, check `cr-r6-fe-check.sh types` runs, and give the owner the first prompt (rules file `ui-common-rules-antigravity.md`).
- [ ] **Codex:** clone at the start commit into a native directory: `git clone --branch leapswitch-redesign file://<repo> ~/ui-s1` (repeat per stage with a fresh clone).
- [ ] Run the cheap probe (Codex only): one dispatch that writes a one-line file, `git add`s it and `git commit`s it. Record whether Git writes work in the sandbox. If they fail, the orchestrator does every staging and commit.
- [ ] Provision `backend/.venv` in the Codex clone only after the probe. Frontend packages live in the WSL mirror used by the check script.

### Task 0.5: Assets the owner must supply **[Claude]**

- [ ] **The eight sketch images** for the auth screens (laptop with asset cards, phone, envelope, ID card, person, floating cards, wallet, tick) and the logo, as the crops of the two PDFs (Q23 option B). The PDFs are not in the repo. Ask the owner to attach them, or to place the cropped files in `frontend/public/illustrations/auth/`. S6 Phase 1 needs them. Without them, S1 to S5 are unaffected.

### Task 0.6: Write the handoff documents for S1 and the two rules files **[Claude]**

- [ ] Put `ui-common-rules-codex.md` and `ui-common-rules-antigravity.md` in `Docs/orchestration/` (Claude wrote them; the owner commits).
- [ ] For each S1 task write `Docs/orchestration/<slug>-handoff.md` (status OPEN) from the S1 plan: scope, files, interfaces, tests, constraints, and the spec section id. Handoffs for later stages are written at the start of each stage.
- [ ] Add one delegation-log line per decision.

### Task 0.7: S0 gate **[Claude]**

- [ ] The run log has the start commit, the head, the re-read results, the baselines and the probe result. Tag `ui-s0-done` locally. Claude commits; the owner pushes.

---

## Stage S1: Quick Fixes (changes 1, 2, 4, 7, 9)

> Run through the orchestrator-and-workers method in Part 1. Commit prefix `ui-s1:`. Handoff slugs: `ui-s1-greeting-member`, `ui-s1-category-label`, `ui-s1-overlap-compare`, `ui-s1-member-picker`, `ui-s1-returns-toggle-labels`. Spec sections: `c1`, `c2`, `c4`, `c7`, `c9` of the planning page.

**Goal:** five small, independent changes with no migration. **Parallel dispatch is allowed**: the five tasks share no source files. The only shared test files are `shell/nav/paths.test.ts` and `shell/registry/registry.test.ts`, touched by T1.3 only. The orchestrator commits one task at a time.

**Stage checks (on top of the stage gate):** the Home timing script for change 1 (the summary endpoint) stays within 10% of the S0 baseline; Playwright screenshots at 1440 and 1024 of the five changed screens; the full suites; build and lint.

---

### Task 1.1: Greeting follows the selected member (change 1, Q29) **[Antigravity]**

**Cause:** `_display_name(db, user.id)` in `backend/app/api/home.py` always returns the head's first name (the member whose relationship is self, else the first member). The endpoint already resolves the scope with `resolve_scope` and holds `ctx.member_name`.

**Files:** Modify `backend/app/api/home.py` (`_display_name`, and its call in `_summary`). Tests: `backend/tests/api/test_home_routes.py` (use the file's existing client and the helpers in `home_fixture.py`). Frontend regression: the existing Home page test file and `features/home/sections/Greeting.test.tsx`.

**Interfaces:** `_display_name(db: Session, user_id: uuid.UUID, ctx: ScopeContext) -> str`. In the family view (`ctx.scope == "aggregate"`) keep today's rule exactly (self member, else the first member, first word, title case, empty string if none). In a member view use `ctx.member_name` the same way (first word, title case). If that name is empty, fall back to the family-view rule. `_summary` passes `ctx`. **If Head of Family changed how the head is found (S0 task 0.2), the family-view rule follows the new "head" lookup.**

- [ ] **Step 1: Failing tests.** `test_summary_greeting_name_is_the_heads_first_name_in_the_family_view`; `test_summary_greeting_name_is_the_selected_members_first_name_in_a_member_view`; `test_summary_greeting_name_falls_back_to_the_head_when_the_member_name_is_empty`; `test_summary_greeting_name_title_cases_and_takes_the_first_word` (for example `prateek KUMAR sanjayti` gives `Prateek`); the existing test that another account's member id is refused must still pass unchanged. Frontend: `Greeting.test.tsx` already renders `summary.display_name`, so add one Home page test: `greeting heading changes when the selected member changes` (mock two summaries with different `display_name`, switch the scope, assert the heading text).
- [ ] **Step 2:** run them and confirm the backend member-view test fails because the name is the head's.
- [ ] **Step 3: Implement** as above. No frontend code change is expected. If the Home page does not refetch on scope change, fix the dependency list (it should key on `scopeKey`).
- [ ] **Step 4: Verify:** `cd backend && pytest tests/api/test_home_routes.py` and `cd frontend && npx vitest run src/features/home`. Expected all pass.

### Task 1.2: Category column shows only the category (change 2, Q30) **[Antigravity]**

**Files:** Create `frontend/src/lib/categoryLabel.ts` and `categoryLabel.test.ts`. Modify `frontend/src/features/mutual-funds/overview/HoldingsTable.tsx` (the Category cell, `row.sebi_category || "—"`). Test `HoldingsTable.test.tsx`.

**Interfaces:** `export function categoryLabel(raw: string | null | undefined): string`. Returns the text after the **first** ` - `, trimmed. If there is no dash it returns the trimmed text. If the value is empty or null it returns `"—"`. Sorting and filtering keep using the original value. If the table has an export path, use the helper there too so the screen and the file agree (check the file for it).

- [ ] **Step 1: Failing tests.** `strips Equity Scheme`; `strips Equity Schemes` (with the s: the data is not spelled the same on every row); `strips Debt Scheme and Hybrid Scheme`; `keeps everything after the first dash` (for example `Equity Scheme - Large & Mid Cap Fund`); `returns the text when there is no dash`; `returns a dash for empty and null`. `HoldingsTable.test.tsx`: `the Category cell shows the short form`.
- [ ] **Step 3: Implement.** **Verify:** `npx vitest run src/lib/categoryLabel.test.ts src/features/mutual-funds/overview/HoldingsTable.test.tsx`.

### Task 1.3: Overlap pairs link to the two-fund comparison (change 4, Q33, Q34) **[Antigravity]**

**Files:** Modify `features/mutual-funds/overlap/TopPairs.tsx`, `shell/nav/paths.ts`, `shell/registry/registry.test.ts`, `shell/nav/paths.test.ts`, `features/individual-fund/overlap/ComparisonState.tsx`. Create `shell/routes/portfolio-mutual-funds-overlap-compare.route.tsx`, `features/mutual-funds/overlap/CompareFundsPage.tsx`. Tests: `TopPairs.test.tsx`, `TopPairs.asks.test.tsx`, `CompareFundsPage.test.tsx`.

**Interfaces:**
- `paths.mutualFunds.compare: (fundA: string, fundB: string) => string` returning `/portfolio/mutual-funds/overlap/compare/${fundA}/${fundB}`.
- New route: id `portfolio-mutual-funds-overlap-compare`, path `/portfolio/mutual-funds/overlap/compare/:fundA/:fundB`, label `Fund comparison`, `parentId: "portfolio-mutual-funds"`, `layout: "app"`, `scope: "family-or-member"`, `status: "live"`, `section: null`, `page: () => import("../../features/mutual-funds/overlap/CompareFundsPage")`. Copy the shape of `portfolio-mutual-funds-fund-overlap.route.tsx`.
- `CompareFundsPage`: reads `fundA` and `fundB` from the route and renders the existing `ComparisonState` (`features/individual-fund/overlap/ComparisonState.tsx`) with `otherSchemeId = fundB`. `ComparisonState` takes `ctx: FundPageContext`, so the page must build the context for fund A the way `features/individual-fund/OverlapPage.tsx` does. **The orchestrator reads that file first and decides, before dispatch, how the new page obtains `ctx`** (preferred: reuse the same `FundPageFrame` or context provider with fund A, without the tab bar if the frame draws one; if that needs a prop, add it with a default so the individual page is unchanged).
- `ComparisonState` gets two optional props with defaults equal to today's behaviour: `backLabel?: string` (default today's text) and nothing else. `onBack` on the new page navigates to `paths.mutualFunds.overlap()`.
- `TopPairs.tsx`: remove the `combinedWeight` import and use (the import at the top and the `const cw = combinedWeight(...)` line) and the **Combined Weight** header and cell. Add a last column headed `Overlap comparison` whose cell is a link (an anchor rendered with the router `Link`) with the text `View more` and an arrow, `href = paths.mutualFunds.compare(pair.fund_a.scheme_id, pair.fund_b.scheme_id)`. A row click that selects the pair (for the heatmap panel) stays. **Do not delete `combinedWeight` from `features/mutual-funds/overlap/overlapLogic.ts`** (note: the individual fund page has its own, different `features/individual-fund/overlap/overlapLogic.ts`): `buildOverlapInsights` uses it for the Key insights sentence. A test pins that.
- The individual fund page's Top Funds with Overlap list is not touched.

- [ ] **Step 1: Failing tests.** `TopPairs`: `no longer renders a Combined Weight column`; `renders an Overlap comparison column with a View more link per row`; `each link points to the compare route of its two funds`; `clicking a row still selects the pair`; `the key insights sentence still reads the combined weight` (call `buildOverlapInsights` with a fixture and assert the sentence is unchanged). `paths.test.ts`: the compare path. `registry.test.ts`: add `["portfolio-mutual-funds-overlap-compare", "/portfolio/mutual-funds/overlap/compare/:fundA/:fundB"]` to `urlMap`. `CompareFundsPage.test.tsx`: `renders the comparison for two scheme ids`; `Back goes to the portfolio overlap page`; `a bad id shows the existing error state`. `ComparisonState` tests: `backLabel overrides the back text and the default is unchanged`.
- [ ] **Step 3: Implement.** Verify the endpoints the comparison calls accept any two funds the user holds in the selected view, not only a fund's own top list (read the comparison calls in `individual-fund/api.ts`; if a limit exists, record it in the delegation log and stop to ask, because lifting it is a backend change).
- [ ] **Step 4: Verify:** `npx vitest run src/features/mutual-funds/overlap src/features/individual-fund/overlap src/shell`. Browser back after View more returns to the pair table.

### Task 1.4: Which member? pop-up before Add data (change 7, Q43, Q44) **[Antigravity]**

**Files:** Modify `shell/nav/ImportProvider.tsx`. Create `shell/nav/MemberPickerDialog.tsx`, `MemberPickerDialog.test.tsx`. Tests: `ImportProvider.test.tsx`, `shell/layout/TopBar.test.tsx`, `shell/routes/wrappers.test.tsx`.

**Interfaces:** `ImportProvider.openImport(explicitMemberId?: string)` keeps its signature (`ImportValue` in `scopeTypes.ts`). New behaviour: if `explicitMemberId` is given, or `viewMode === "member"`, or there is one member or none, navigate exactly as today. If `viewMode === "aggregate"` and there are two or more members, open `MemberPickerDialog` (state held in the provider) instead of navigating. `MemberPickerDialog` props: `members: ScopeMember[]`, `open`, `onCancel`, `onContinue(memberId: string)`. Nobody pre-selected; `Continue` is disabled until one member is chosen; `Cancel` and Esc close. On Continue it runs the same navigation as today with `paths.import(memberId)` and `state: { origin }`, keeping the existing replace-then-push sequence. Close the dialog if the view mode or member changes while it is open. Built with `components/ui/dialog.tsx`. Each row: initials, name, and the relationship when `member.profile` has one (read `HouseholdMember` for the field names; show "No data yet" only if a real has-data flag exists on the member).

Every button already goes through `openImport` (TopBar, `PortfolioPage`, `FundPageFrame`, `MutualFundsFrame`, the Home empty states and the greeting link), so this one change covers them all.

- [ ] **Step 1: Failing tests.** `family view with two members opens the picker and does not navigate`; `member view navigates straight to that member`; `an explicit member id navigates straight`; `one member navigates straight`; `Continue is disabled until a member is chosen`; `Cancel closes and stays on the page`; `Continue navigates to the chosen member with the origin state`; `changing the view closes the picker`; `the header dropdown on the import page is unchanged` (existing `ImportWrapper` tests pass).
- [ ] **Step 3: Implement.** **Verify:** `npx vitest run src/shell`.

### Task 1.5: Returns toggle renamed with info icons (change 9, Q48 to Q50) **[Antigravity]**

**Files:** Modify `features/individual-fund/components/Segmented.tsx`, `features/individual-fund/overview/ReturnsTable.tsx` (`MODE_OPTIONS`). Tests: `Segmented.test.tsx`, `ReturnsTable.test.tsx`, and any test that finds the buttons by the old names `Inception` or `Current` (search `features/individual-fund` tests and the page-level tests).

**Interfaces:** `SegmentedOption<V>` gains `info?: string`. When set, the option renders the label button and, next to it, a separate small round info button (`aria-label="About {label}"`) that opens the app's `Tooltip` (`components/ui/tooltip.tsx`) on hover, focus and click, using the controlled-open pattern of `features/mutual-funds/other/ValuationByFund.tsx` (so it also works on keyboard and touch). The tooltip content is capped near 18rem wide. **Clicking the info button never calls `onChange`.** Options without `info` render exactly as today (the performance period buttons use `Segmented` too). `MODE_OPTIONS` becomes `{ value: "inception", label: "Model Portfolio Returns", info: "The fund's own track record, the same for every investor. It shows how the fund did against its benchmark and similar funds over each period." }` and `{ value: "current", label: "Actual XIRR", info: "How your own money in this fund has done, based on when and how much you invested. It only shows if you hold the fund, and is compared with the benchmark on the same dates." }`. **The values stay `inception` and `current`** (they are the API's `mode`). The text `Not held by X. Inception returns are still shown.` is not changed (Q50).

- [ ] **Step 1: Failing tests.** `Segmented`: `an option without info renders as before`; `an option with info shows an info button`; `the tooltip opens on hover, on focus and on click`; `Esc closes it`; `clicking the info button does not call onChange`. `ReturnsTable`: `shows the new labels and not the old ones`; `switching still requests inception and current`; `each info icon shows its text`.
- [ ] **Step 3: Implement.** Check the layout at 1440, 1024 and 390: the group wraps under the title on narrow widths, the title is never pushed off the card.
- [ ] **Step 4: Verify:** `npx vitest run src/features/individual-fund`.

### Task 1.6: S1 integration and gate **[Claude]**

- [ ] Section-list tests and old-payload tests (a Home summary without the changes, a Comparison without `backLabel`). `npm run build`, `npm run lint`, full suites. The Home timing script. Screenshots of: Home greeting in a member view, the Mutual Funds Category column, the Top overlapping fund pairs table and the compare page, the member pop-up, the Returns toggle with each tooltip open.
- [ ] Review gate over the stage's commit range (`/codex:adversarial-review` through `codex:codex-rescue`, background; the owner relays status and result). Fix findings under the review-loop rules. The orchestrator commits and tags `ui-s1-done`.

---

## Stage S2: Home Allocation Donut and New Funds After an Upload (changes 6 and 8)

> Run through the orchestrator-and-workers method in Part 1. Commit prefix `ui-s2:`. Handoff slugs: `ui-s2-home-donut`, `ui-s2-new-funds`. Spec sections: `c6`, `c8` (and Q41, Q42, Q45 to Q47, Q69, Q70).

**Goal:** (6) the Home allocation donut gets the Mutual Funds donut's hover, click and keyboard behaviour, with a pop-up listing the class and its funds; (8) after an in-app upload, show the new funds and their transactions in a collapsible section, never for the sign-up upload.

**Order and parallelism:** tasks 2.1 and 2.2 (change 6) share Home files; tasks 2.3 to 2.5 (change 8) share the import files. **Change 6 and change 8 share no files and may run in parallel.** Inside each change the tasks run in order.

**Stage checks:** the Home timing script stays within 10% of the S0 baseline (the allocation response grows); the synthetic CAS gates (normal and mfapi-blocked) pass at the S0 counts (confirm is shared); Playwright screenshots at 1440 and 1024: Home donut (idle, hover, pop-up), the import result (open and collapsed section, none for a sign-up import), the notice, Import History; full suites, build, lint.

---

### Change 6: Home donut (tasks 2.1 and 2.2)

### Task 2.1: Funds per class on the Home allocation response (Q42) **[Codex]**

**Files:** Modify `backend/app/services/home/allocation.py` (`ClassRow`, `build_allocation`, `parse_stored_allocation`, `load_allocation`), `backend/app/services/home/schemas.py` (`ClassRowOut`), `backend/app/api/home.py` (the `_allocation` route builds `ClassRowOut(**row.__dict__)`). Tests `backend/tests/services/home/test_allocation.py`, `backend/tests/api/test_home_routes.py`.

**Interfaces:** `ClassRow` gains `funds: tuple[ClassFund, ...] = ()` and `ClassRowOut` gains `funds: list[ClassFundOut] = []`, where `ClassFund` / `ClassFundOut` are `scheme_id: str`, `name: str`, `value: Decimal` (string in the response), `share_of_class: Decimal` (percent, two places). Defaults keep every existing caller and every stored payload working.
- **Two sources.** The response has `source: "analytics" | "dashboard_buckets"`. For `analytics` the funds come from the stored look-through section's per-class funds (the Mutual Funds page already reads them through `classFunds(variant, key)` in `allocationLogic.ts`, so the stored `classes[].funds` exists: read `parse_stored_allocation` and the stored schema to confirm the field names). For `dashboard_buckets` they are derived from the holdings: `bucket_values(items: Iterable[tuple[Decimal, str]])` takes `(value, sebi_category)` per scheme, so thread the scheme id and name through the same loop and group by `bucket_class`.
- Share of class = fund value / class value, two places, and the shares of one class sum to 100.00 within rounding (the last fund absorbs the remainder).
- Funds sorted by value, largest first. A class with no funds has an empty list. Scope (family or member) is applied as the rest of the response already does.

- [ ] **Step 1: Failing tests.** `test_each_live_class_carries_its_funds_sorted_by_value`; `test_fund_shares_of_a_class_sum_to_100`; `test_class_with_no_funds_has_an_empty_list`; `test_analytics_source_reads_funds_from_the_stored_section`; `test_dashboard_buckets_source_derives_funds_from_holdings`; `test_member_scope_lists_only_that_members_funds`; `test_stored_section_without_funds_gives_empty_lists` (old payload); `test_old_clients_ignore_the_new_field` (the existing response tests pass unchanged). Route test: the field is present and typed.
- [ ] **Step 3: Implement.** **Verify:** `cd backend && pytest tests/services/home/test_allocation.py tests/api/test_home_routes.py`. Run the Home timing script.

### Task 2.2: The interactive donut and its pop-up (Q41, Q42) **[Antigravity]**

**Files:** Modify `frontend/src/features/home/components/AllocationDonut.tsx`, `features/home/sections/Allocation.tsx`, `features/home/types.ts` (`ClassRowOut` gets `funds?: ClassFundOut[]`). Create `features/home/components/AllocationClassDialog.tsx`. Tests `AllocationDonut.test.tsx`, `Allocation.test.tsx`, `AllocationClassDialog.test.tsx`, the Home page test.

**Interfaces:** the Home `AllocationDonut` already has `onSliceClick?: (key: string) => void` and `Allocation.tsx` already has `onClassClick`. Add to the donut: slices as keyboard-focusable controls (`role="button"`, `tabIndex=0`, `aria-label="Debt 22.0%"`, Enter and Space), a hover and focus state that dims every other slice to 38% opacity and highlights the matching legend row (and the reverse), and a selected state while the pop-up is open. Copy the behaviour and the values from `features/mutual-funds/allocation/AssetClassCard.tsx` (the inner ring: `opacity: isDim ? 0.38 : 1`, `aria-pressed`, hover and focus handlers) so the two pages feel the same. **Do not refactor the Mutual Funds donut in this stage.** A shared ring component is a possible later clean-up; it was recommended in the spec, not requested.
`AllocationClassDialog` (props `open`, `onClose`, `row: ClassRowOut`, `hideValues?: boolean`) shows the class name, its value and share, and a table of its funds (name through `SchemeLogo`, value, share of the class), built from `components/ui/dialog.tsx`. If `row.funds` is missing or empty it shows the class total and share and the words `Fund details are not available for this class yet.` A class with 0 or null value is not clickable. Rupee amounts honour the page's hide-values setting (read how Home passes it to the other sections).

- [ ] **Step 1: Failing tests.** Donut: `hovering a slice dims the others and highlights its legend row`; `focus does the same`; `click calls onSliceClick with the class key`; `Enter and Space open it`; `a zero slice is not interactive`; `each slice has an accessible label`. Dialog: `lists the funds with value and share`; `shows the totals-only message without funds`; `hides amounts when values are hidden`; `Esc and the close button close it`; `focus is trapped and returns to the slice`. `Allocation`: `clicking a slice opens the pop-up for that class`; `a payload without funds renders and the pop-up shows the fallback`.
- [ ] **Step 3: Implement.** **Verify:** `npx vitest run src/features/home`.

### Change 8: New funds and their transactions (tasks 2.3 to 2.5)

### Task 2.3: Find the new funds and their transactions (backend, Q46, Q47) **[Codex]**

**Files:** Create `backend/app/services/import_/new_funds.py`, `backend/tests/services/import_/test_new_funds.py`. Modify `backend/app/services/import_/schemas.py` (`PersonConfirmResult` and a new `NewFundOut`, `NewFundTxOut`), `confirm_people.py` (after a person's import is saved), `backend/app/api/imports.py`. Read first: `app/models/transaction.py`, `folio.py`, `imports.py`, `app/models/enums.py` (`TransactionType`).

**Interfaces:**
```python
@dataclass(frozen=True)
class NewFundTx:  # one stored transaction of a new fund in this import
    date: date; type: TransactionType; amount: Decimal; units: Decimal

@dataclass(frozen=True)
class NewFund:
    scheme_id: uuid.UUID; scheme_name: str; amc_name: str | None
    invested_amount: Decimal          # Q47
    latest_transaction_date: date     # Q47
    transaction_count: int
    transactions: tuple[NewFundTx, ...]   # capped, newest first

TRANSACTIONS_CAP = 20

def find_new_funds(db: Session, import_id: uuid.UUID, member_id: uuid.UUID) -> list[NewFund]: ...
```
**Rules.**
- A scheme is **new** (Q46 A) if this import inserted at least one transaction for it and the member has **no transaction of that scheme in any other import** (match through `Folio.household_member_id = member_id` and `Folio.scheme_id`). A fund sold completely and bought again later is therefore not new.
- `invested_amount` is the total of the `amount` of this import's transactions of that scheme whose type is in `INVESTED_TYPES = {PURCHASE, PURCHASE_SIP, SWITCH_IN}`. Whether redemptions in the same statement are netted off is a decision for the orchestrator at the start of the task: default **not netted** (the figure answers "how much went in"); record it in the delegation log and in the field docstring.
- `latest_transaction_date` is the latest date among **all** of this import's transactions of that scheme.
- `transactions` are this import's rows of that scheme, newest first, at most `TRANSACTIONS_CAP`; `transaction_count` is the full count. Funds are ordered by `invested_amount` descending.
- All money is `Decimal`. The query filters by `import_id`, which on Postgres touches only the partitions in the import's date range.
- A scheme whose only rows in this import are `OPENING_BALANCE`, `STT`, `STAMP_DUTY`, `MISC` or `REVERSAL` is not listed as new.

- [ ] **Step 1: Failing tests** (`test_new_funds.py`, using the repo's synthetic fixtures or factories): `first_import_lists_every_fund_as_new`; `later_import_lists_only_the_fund_the_member_did_not_hold`; `a_repeat_of_the_same_file_lists_nothing`; `sold_then_bought_again_is_not_new`; `two_members_in_one_file_get_separate_lists`; `invested_amount_totals_purchases_sips_and_switch_ins_only`; `latest_date_is_the_latest_of_all_the_funds_rows_in_the_import`; `transactions_are_capped_at_20_newest_first_with_the_full_count`; `a_fund_with_only_opening_balance_is_not_new`; `funds_are_ordered_by_invested_amount`; `money_is_decimal`.
- [ ] **Step 3: Implement.** **Verify:** `cd backend && pytest tests/services/import_/test_new_funds.py`.

### Task 2.4: Confirm response, surface gating and the history endpoint **[Codex]**

**Files:** Modify `schemas.py`, `confirm_people.py`, `app/api/imports.py`, the parse route's session creation in `services/import_/service.py`. Tests `tests/api/test_imports_confirm_*.py` (find the existing confirm tests with `grep -l "confirm" tests/api`), `tests/services/import_/test_new_funds_surface.py`.

**Interfaces:**
- `PersonConfirmResult` gains `new_funds: list[NewFundOut] = []`, and `created: bool = False` (true when the person became a new household member in this confirm; S3 uses it). `NewFundOut`: `scheme_id`, `scheme_name`, `amc_name`, `invested_amount` (string), `latest_transaction_date`, `transaction_count`, `transactions: list[NewFundTxOut]`.
- **Surface gating (Q70).** The parse route already reads the header `x-upload-surface` (`api/imports.py`, around line 312, validated against `_UPLOAD_SURFACES`; the sign-up upload sends `onboarding_upload`). **Store the validated surface in the import session at parse** (add a `surface` key where the session dict is created, near `me_choice` and `u3_declined`). In confirm, if `session["surface"] == "onboarding_upload"` return `new_funds = []` and skip the query. Every other surface returns the list.
- **History endpoint.** `GET /imports/{import_id}/new-funds` returns `list[NewFundOut]` for one import, derived the same way, 404 for another user's import (reuse the ownership check of the other import routes). **Sign-up imports return an empty list:** an import is a sign-up import when its `uploaded_at` is before the owner user's `onboarding_completed_at`, or when onboarding is not yet completed. A legacy user with `onboarding_completed = true` and a null `onboarding_completed_at` is treated as an existing user. Read how `list_household_import_history` resolves the member's user (the `user_id` on `HouseholdMember`).

- [ ] **Step 1: Failing tests.** `confirm_returns_new_funds_for_an_in_app_upload`; `confirm_returns_none_for_the_onboarding_upload_and_runs_no_new_funds_query` (patch `find_new_funds` and assert not called); `old_clients_ignore_new_funds` (existing confirm tests pass); `history_endpoint_matches_the_confirm_list_for_the_same_import`; `history_endpoint_is_empty_for_a_sign_up_import`; `history_endpoint_returns_404_for_another_users_import`; `surface_is_stored_in_the_session_and_unknown_surfaces_fall_back_to_import_upload`.
- [ ] **Step 3: Implement.** **Verify:** `pytest tests/api -k "confirm or history or new_funds" tests/services/import_/test_new_funds*.py`. Run the synthetic CAS gate.

### Task 2.5: New funds section in the three places (frontend, Q45, Q69, Q70) **[Antigravity]**

**Files:** Modify `frontend/src/features/import/types.ts` (`PersonConfirmResult.new_funds?`, `created?`; `NewFund`, `NewFundTx`), `api.ts` (the history call `getImportNewFunds(importId)`), `useImportOrchestration.tsx` (the notice), `ImportHistoryList.tsx`. Create `features/import/NewFundsList.tsx`, `ImportStats.tsx`, tests for each. **First read** `ImportFlow.tsx` and `useImportOrchestration.tsx` to find the component that shows the result after confirm; the stage handoff names it.

**Interfaces:**
- `ImportStats` shows three tiles: **New funds** (highlighted), **Transactions added**, **Already saved** (today's counts).
- `NewFundsList` (props `funds: NewFund[]`, `defaultOpen?: boolean`, `hideValues?: boolean`): one collapsible section with a header (title `New funds in this statement`, the count, a chevron; `aria-expanded`; click or Enter toggles; starts open, a setting). **All funds are listed, no cap and no Show more.** Each fund is one row (initials or `SchemeLogo`, name, fund house, `N transactions`, invested amount, latest transaction date, chevron) that opens to a table of its transactions (date, type label, amount, units), at most 20, then a link `View all in Import History`. Rows start closed.
- Type labels for the table come from the stored type (`purchase` → Purchase, `purchase_sip` → SIP, `switch_in` → Switch in, `redemption` → Redemption, `dividend_reinvest` → Dividend reinvested, `bonus` → Bonus, others title-cased).
- **When it renders (Q70).** Only when the import did not come from sign-up. The component that hosts the result checks `surface !== "onboarding_upload"` (`ImportFlow` already receives `surface` and passes it to the upload container) **and** `new_funds` is non-empty. For sign-up imports nothing renders (the user goes on to All set). An empty `new_funds` for an in-app import shows the `No new funds in this statement` state with the existing counts.
- **Notice.** After Add data the notice text becomes `Import complete · N new funds, M transactions added`, with up to two fund names and a `View new funds` action that opens the same list in a dialog. No transactions in the notice.
- **History.** Opening an import row fetches `getImportNewFunds` lazily and renders `NewFundsList`; a sign-up import returns an empty list, so nothing shows.

- [ ] **Step 1: Failing tests.** `NewFundsList`: `lists every new fund`; `starts open and collapses and expands from the header and the keyboard`; `a fund row opens its transactions`; `shows at most 20 transactions and a View all link when there are more`; `hides amounts when values are hidden`; `renders nothing for an empty list`. `ImportStats`: three tiles with the counts. Host: `an in-app import shows the section`; `the sign-up import shows no section`; `a confirm response without new_funds renders as today`. Notice: `shows the count and two names and the View new funds action`. History: `opens an import and fetches its new funds once`; `a sign-up import shows none`.
- [ ] **Step 3: Implement.** **Verify:** `npx vitest run src/features/import`.

### Task 2.6: S2 gate **[Claude]**

- [ ] Section-list tests, old-payload tests (a Home allocation without `funds`, a confirm without `new_funds`), `npm run build`, `npm run lint`, full suites, the Home timing script, the synthetic CAS gates (normal and mfapi-blocked) against the S0 counts, screenshots. Review gate over the stage's range; the owner relays. Tag `ui-s2-done`.

---

## Stage S3: Name Mismatch Adds a Family Member (change 5)

> Run through the orchestrator-and-workers method in Part 1. Commit prefix `ui-s3:`. Handoff slug: `ui-s3-add-as-family`. Spec: section `c5` and Round 3 F (Q35 to Q40, Q36 revised, Q39 B). **One handoff, one worker, one reviewer.** This is the largest change in the import service. Identity and PAN safety get a second, scoped review round (Method point 8).

**Goal:** when the first statement is in a different name from the account holder's, the pop-up says whose account it is and offers `Add {name} as a family member` or `Upload a different file`. Choosing the first adds the people in the file as family members and the normal flow continues. **The account holder is never renamed, never gets another person's PAN, and keeps their data empty until their own file is uploaded.** No third link (Q39 B). A file with several people gets the same pop-up and flow (Q36 revised): the other people go through today's people-found step.

**Prerequisite read (S0 task 0.2, repeated here):** how Head of Family (change-requests Runs 5 and 6) stores and finds the account holder. This plan says "self member". If the head is now a flag or a different relationship, use the new lookup everywhere this plan says `_self_member`.

**Stage checks:** the synthetic CAS gates (normal and mfapi-blocked) at the S0 counts; the Postgres functional tests for PAN claims; one real statement uploaded under a different typed name (the owner supplies it, as the change-requests plan did); full suites, build, lint; screenshots of the pop-up (one person, several people) and of Home with a no-data head.

---

### Task 3.1: The resolver and its route (backend) **[Codex]**

**Files:** Modify `backend/app/services/import_/service.py` (near `resolve_name`, line ~874), `backend/app/services/import_/schemas.py`, `backend/app/api/imports.py` (near the other resolve routes, lines ~409 to 458). Tests: `backend/tests/services/import_/test_service.py`, `backend/tests/api/test_imports_people_routes.py`.

**Read first (the orchestrator, before the handoff):** `service.py`: `_self_member`, `_is_first_upload`, `_self_match` (line ~463), `_me_key` (~472), `next_prompt` (~539, the first-upload block that returns `self_name_mismatch` and `which_is_self`), `_advance` (~649), `_finish` (~844), `resolve_name` (~874), `resolve_self` (~911), `_live_session`. `people_resolution.py`: `resolve_self`, `plan_people`, `SelfMatch` (`SelfKind` already includes `"absent"`). `confirm_people.py`: `confirm_people_import`, `_confirm_claimed`, `_resolve_member`, `_finalise_pan_claims` and where new members are created (`relationship=None`, near line 586).

**Interfaces:**
```python
@_serialised
def resolve_add_as_family(db: Session, session_id: str, user_id: uuid.UUID) -> ImportPreviewResponse:
    """U2 new answer: keep the account holder as they are; everyone in the file is planned as a person
    (new family member, or matched by PAN or exact name as today). Never touches the self member."""
```
- It runs `_live_session`, then `next_prompt`. If the current prompt is not `self_name_mismatch`, return `_finish(db, session_id)` (same guard as `resolve_name`).
- Otherwise set `session["add_as_family"] = True`, set `session["me_choice"] = None`, `session["u3_declined"] = False`, `db.flush()`, return `_finish(db, session_id)`.
- `_self_match(session, self_member)`: if `session.get("add_as_family")` return `SelfMatch("absent", None, [])` first. Because `_me_key` only accepts `pan`, `exact`, `variant`, no person is chosen as the account holder, so `plan_people(..., me_key=None)` plans every person as new, or as an existing member or another account's PAN as today.
- `next_prompt`'s first-upload block already ignores `"absent"` (it acts on `"mismatch"` and `"ambiguous"` only). **Prove it with a test and fix any later step that assumes the file contains the account holder** (the self claim in `_advance`, `member_not_in_file` for the self target, `cross_account_pan_blocked`'s first-upload exemption, `_finalise_pan_claims`, the onboarding completion). A code comment (F11) says Add-data uploads of a relative's file already have no Me, so the engine should already allow it. The first-upload case with the self member as the upload target is the one to prove.
- **Do not write** any `HouseholdMemberNameChange` row. Do not change `self_member.name`, `name_source`, `name_updated_at`, `pan_lookup_hash` or any PAN field.
- **Route:** `POST /imports/sessions/{session_id}/resolve-add-as-family` using `_run_resolve(lambda: resolve_add_as_family(db, session_id, user.id))`. No body. Keep `resolve-name` for old clients.
- `PersonConfirmResult.created: bool` (added in S2 T2.4; if S2 is not merged, add it here with default `False`): true when the person became a new household member in this confirm.

- [ ] **Step 1: Failing tests.**
  - `test_add_as_family_leaves_the_account_holder_untouched` (name, name_source, name_updated_at, no PAN hash, no name-change row).
  - `test_add_as_family_creates_the_statements_person_as_a_new_member_with_relationship_none`.
  - `test_add_as_family_attaches_the_funds_to_the_new_member_not_the_account_holder`.
  - `test_add_as_family_stores_the_people_pan_on_the_new_member_only` (the self member has no PAN claim, `pending_claims` holds only the new members).
  - `test_add_as_family_with_several_people_creates_each_through_the_normal_people_found_step` (no new prompt type; the existing people-found flow runs).
  - `test_add_as_family_when_the_account_holder_is_in_the_file_is_never_reached` (a match is found, no `self_name_mismatch`, behaviour unchanged).
  - `test_add_as_family_outside_a_name_mismatch_prompt_just_finishes` (guard).
  - `test_resolve_name_still_renames_for_old_clients` (existing behaviour, unchanged).
  - `test_no_member_not_in_file_or_self_claim_prompt_fires_for_the_first_upload_with_no_account_holder`.
  - Route: `test_resolve_add_as_family_route_returns_the_next_preview_and_409_for_the_next_prompt`; `test_route_is_refused_for_another_users_session`.
- [ ] **Step 2:** run them; confirm they fail because the route and function do not exist, and (for the "no prompt fires" test) record which later step, if any, fails after the flag is added.
- [ ] **Step 3: Implement** as above. **Verify:** `cd backend && pytest tests/services/import_/test_service.py tests/services/import_/test_confirm_people.py tests/api/test_imports_people_routes.py`.

### Task 3.2: Later upload of the account holder's own file **[Codex]**

**Files:** Tests only (`backend/tests/services/import_/test_service.py` or a new `test_add_as_family_followup.py`), plus a fix in `people_resolution.py` only if a test proves a defect.

**What it proves (Q38):** after 3.1, the self member has no PAN and the user's original typed name. When the account holder later uploads their **own** file, `resolve_self` matches by name (exact or variant, because `has_permanent_pan` is false), the PAN is stored on the self member and **not** on the family member added earlier, `classify_detected_pan` does not report that PAN as another member's, and a variant name raises today's name notice (`accept_name_update`, "ask"), not the mismatch pop-up.

- [ ] **Step 1: Failing tests.** `test_account_holders_own_file_after_add_as_family_matches_the_self_member_by_name_and_stores_the_pan_on_them`; `test_a_variant_typo_brings_up_the_name_variant_notice_not_the_mismatch_prompt`; `test_the_family_members_pan_is_not_moved_to_the_account_holder`; `test_a_large_typo_shows_the_mismatch_prompt_again` (the known limit, recorded as accepted in Q39).
- Use two synthetic statements for different people from `Docs/CAS Files/synthetic/pdfs/` (`pdf_path(name)` finds a file in any subfolder; the family and couple files `r2_couple_rohan_priya_10yr.pdf` and `big_family_ayush_anand_7yr.pdf` are candidates; password `MF@123`). The orchestrator picks two and names them in the handoff.
- [ ] **Step 3:** fix only what the tests prove. **Verify:** `pytest tests/services/import_`. On Postgres: `pytest tests/functional_postgres -k "pan or claim"` with `TEST_DATABASE_URL`.

### Task 3.3: The pop-up and the new answer (frontend) **[Antigravity]**

**Files:** Modify `frontend/src/features/import/prompts/NameMismatchDialog.tsx`, `prompts/PromptHost.tsx` (the `self_name_mismatch` case), `useImportFlow.ts` (the resolve union, line ~34), `features/import/api.ts` (the resolve calls; copy the existing `resolveName` call), `types.ts`. Tests `prompts/prompts.test.tsx`, `NameMismatchDialog` tests, `useImportFlow` tests.

**Interfaces:**
- `NameMismatchDialogProps`: `isOpen`, `enteredName` (the account holder's name), `statementName` (the person the statement is in), `error?`, `onAddAsFamily: () => void`, `onUploadDifferent: () => void`. **Remove `onUseName`.**
- Copy: title `This is {enteredName}'s account`; body `You uploaded {statementName}'s file. Do you want to add {statementName} as a family member, or upload a different file?`; primary button `Add {statementName} as a family member`; secondary `Upload a different file` (also the way out of the close button). Use the same dialog frame (`PromptDialog`) and button classes (`PRIMARY_BTN`, `SECONDARY_BTN` from `prompts/copy.ts`).
- The resolve union gains `{ kind: "addAsFamily" }` and `PromptHost` sends it for `self_name_mismatch`. The old `{ kind: "name" }` stays in the union and in the API client (the backend keeps `resolve-name`), but nothing calls it from the dialog. The pop-up shows the statement's name only, as today (the prompt details are unchanged: `entered_name`, `statement_name`). No list of people and no extra buttons.
- A server error shows in the dialog the way `error` does today.

- [ ] **Step 1: Failing tests.** `shows the account holder's name in the title and the statement's name in the body`; `the primary button reads Add {name} as a family member and sends the addAsFamily answer`; `Upload a different file and the close button discard the session`; `there is no Yes, that's me button`; `PromptHost sends addAsFamily for self_name_mismatch`; `the api client posts to resolve-add-as-family`; `an error from the server shows in the dialog`.
- [ ] **Step 3: Implement.** **Verify:** `cd frontend && npx vitest run src/features/import`.

### Task 3.4: Complete profile after the import (Q37) **[Antigravity]**

> **SUPERSEDED 4 Nov 2026 (owner, QA).** The queue of Complete profile dialogs after an import was removed from `useImportOrchestration` (decisions.md, 4 Nov). Q37 was a Name mismatch answer; this task widened it to every import that creates a member, which made new users wait and type before reaching the app. The text below is kept as history only.

**Files:** Modify `features/import/useImportOrchestration.tsx`, the component that hosts the post-confirm step (read `ImportFlow.tsx` first), reuse `features/dashboard/members/CompleteProfileDialog`. Tests alongside.

**Interfaces:** after confirm, for each `people[]` entry with `created === true` show the existing `CompleteProfileDialog` for that member, one after another, skippable, so the user can set the relation, and the other details, with the profile-completed percentage the dialog already shows. A member that already existed is not asked. Nothing new is drawn. The dialog's data comes from `listHouseholdMembers` / `updateMemberProfile` (existing).

- [ ] **Step 1: Failing tests.** `shows the profile dialog for each created member, in order`; `does not show it for a member that already existed`; `Skip leaves the relation empty and continues`; `saving a relation calls updateMemberProfile once`; `the dialog does not appear for a sign-up import with no created members`.
- [ ] **Step 3: Implement.** **Verify:** `npx vitest run src/features/import src/features/dashboard/members`.

### Task 3.5: The account holder with no data (Home, Mutual Funds, Analytics) **[Antigravity]**

**Files:** Tests first; fix only what a test proves. Existing: `features/home/sections/Greeting.tsx` already labels a member `No data yet` (`has_data`).

- [ ] **Step 1: Failing tests.** `Home in the family view shows the head's name and No data yet beside them while another member has data`; `Home in the head's own view shows the existing empty state`; `Mutual Funds and Analytics in the head's view show their empty states`; `the greeting still names the head in the family view` (S1 T1.1).
- [ ] **Step 3:** fix defects only. **Verify:** `npx vitest run src/features/home src/features/mutual-funds`. Take a screenshot of each state.

### Task 3.6: S3 gate **[Claude]**

- [ ] The synthetic CAS gates (normal and mfapi-blocked) at the S0 counts, with a new scenario added to the harness for "first upload in another person's name, then add as family, then the account holder's own file". The Postgres functional tests. One real statement under a different typed name, checked by hand: the account holder unchanged, the person added, the funds on the person, the PAN on the person.
- [ ] Full suites, build, lint, screenshots. Review gate, then a **second scoped round** focused on identity, PAN claims and the old `resolve-name` path. The owner relays each review. Tag `ui-s3-done`.

---

## Stage S4: Actual XIRR Graph, Toggle Moved Up, Benchmark Named (change 3)

> Run through the orchestrator-and-workers method in Part 1. Commit prefix `ui-s4:`. Handoff slug: `ui-s4-returns-graph`. Spec: sections `c3` and `c3ui` (3 · UI and every state) with Q52 to Q60 and Q31/Q32 withdrawn. **Depends on S1 task 1.5** (the renamed toggle with info icons). Tasks run in order: they share `ReturnsTable.tsx`, `OverviewPage.tsx` and `types.ts`.

**Goal:** (a) the toggle (`Model Portfolio Returns` / `Actual XIRR`) moves into the performance card, above the period buttons, and drives both the graph and the Returns table; (b) the Actual XIRR view gets a grouped bar graph drawn from the response the Current table already loads, one pair of bars per table period; (c) the Benchmark row names the benchmark as pills (index name and source), on both table views.

**The existing Inception graph is not changed.** Its component code is not edited except one optional slot. Its tests pass without edits.

**Backend:** one additive field only, `benchmark_label` on the returns response. **No new route, no new query, no migration.**

**Stage checks:** screenshots of the Inception view at 1440 and 1024 before and after (identical except the toggle row); screenshots of every state drawn in the spec's "3 · UI and every state" (all data, shorter holding, no benchmark and its two notices, not held for a member and for a family, loading, error, narrow width); full suites; build; lint. No timing or query-plan check is needed (no new query).

---

### Task 4.1: `benchmark_label` on the returns response (backend, Q57, Q58) **[Codex]**

**Files:** Modify `backend/app/services/fund_page/schemas.py` (`ReturnsResponse`), `backend/app/services/fund_page/returns.py` (the two builders: the `ReturnsResponse(...)` returns in `inception_returns` and in `current_returns`, around lines 170 and 361 at `bd8cd19`). Tests: create `backend/tests/services/fund_page/test_returns_benchmark_label.py`.

**Interfaces:** `ReturnsResponse.benchmark_label: str | None = None`. Both builders set it to `BENCHMARK_LABELS.get(choice.index_key) if choice.index_key is not None else None`, using the same lookup the performance response uses (`from app.services.fund_page.benchmark_select import BENCHMARK_LABELS`, already imported in `performance.py`). `choice` is the existing `benchmark_for_scheme(db, scheme.id)` result in each builder. `declared_benchmark_name` and `benchmark_source` stay as they are. The frontend type already declares `benchmark_label?` on both responses ("additive, pending on the backend").

- [ ] **Step 1: Failing tests.** `test_inception_response_carries_the_benchmark_label`; `test_current_response_carries_the_benchmark_label`; `test_label_is_null_when_there_is_no_benchmark_index`; one test per source value (`factsheet`, `closest`, `category`, `none`): the label and `benchmark_source` are as expected; `test_existing_fields_are_unchanged` (golden compare of `rows`, `columns`, `benchmark_reason`, `benchmark_note`, `printed_as_of`).
- [ ] **Step 3: Implement.** **Verify:** `cd backend && pytest tests/services/fund_page/test_returns_benchmark_label.py tests/services/fund_page`.

### Task 4.2: Benchmark pills in the table (frontend, Q57, Q58) **[Antigravity]**

**Files:** Create `frontend/src/features/individual-fund/overview/BenchmarkPills.tsx` and `BenchmarkPills.test.tsx`. Modify `lib/benchmarkDisplay.ts` (short source words), `overview/ReturnsTable.tsx` (the Benchmark row label cell, both views). Tests `ReturnsTable.test.tsx`.

**Interfaces:** `BenchmarkPills({ name, source, declaredName }: { name: string | null; source: BenchmarkSource | null | undefined; declaredName?: string | null })`.
- Two small pills under the row label, 11 px, 2 by 9 px padding, 6 px gap, 5 px below the label.
  1. The **index name** in a neutral pill: `benchmarkDisplayName(name)` (it turns TRI into Total Return). If `name` is null but `source === "none"` and `declaredName` is set, show `benchmarkDisplayName(declaredName)`.
  2. The **source** in a pill coloured by kind: `factsheet` → green `From the factsheet`; `closest` → blue `Closest index we hold`; `category` → amber `Chosen by category`; `none` with a declared name → dashed `As printed in the factsheet`. The words come from `BENCHMARK_SOURCE_LABELS` and `BENCHMARK_PRINTED_LABEL`; add a `BENCHMARK_SOURCE_SHORT` map beside them so the two sets cannot drift.
- If no name can be shown, render nothing and the row reads `Benchmark` as today.
- `ReturnsTable`: the Inception row label is `Benchmark` plus `BenchmarkPills`, and the Current row label is `Benchmark, same cash flows` plus the same pills (Q58 A). The block under the table (`returns-benchmark-details`) stays as it is.
- Colours use the app tokens (the green for `factsheet` is `--pos-text` on a tinted background; blue `--c2`; amber `--c3`), not literals.

- [ ] **Step 1: Failing tests.** One test per source value for the pills' words and kind; `name only when the source is missing`; `nothing when no name`; `the printed case shows the declared name and the dashed pill`; `ReturnsTable shows the pills under the Benchmark row in both views`; `a response without benchmark_label renders the row as today`; `the details block under the table is unchanged`.
- [ ] **Step 3: Implement.** **Verify:** `npx vitest run src/features/individual-fund/overview src/lib/benchmarkDisplay.test.ts`.

### Task 4.3: Lift the mode and the Current request; move the toggle (Q52, Q53) **[Antigravity]**

**Files:** Create `overview/ReturnsModeToggle.tsx` (+ test). Modify `overview/ReturnsTable.tsx`, `OverviewPage.tsx`, `overview/PerformanceChart.tsx` (**one optional prop only**). Tests: `ReturnsTable.test.tsx`, `PerformanceChart.test.tsx` (must pass **unedited**), `OverviewPage.test.tsx`.

**Interfaces:**
- `ReturnsModeToggle({ mode, onChange })` renders `Segmented` with the S1 options (labels and info). It is the only place those options are defined; `ReturnsTable` stops defining `MODE_OPTIONS`.
- `OverviewPage` holds `mode: ReturnsMode` (`useState<ReturnsMode>("inception")`) and the Current request: `const current = useFundSection<ReturnsResponse>(signal => fundPageApi.returns(schemeId, "current", scope, signal), [schemeId, scope], { enabled: wantCurrent })` with `wantCurrent` set the first time the mode becomes `current`, exactly as `ReturnsTable` does today. The Inception request stays inside `ReturnsTable`.
- `ReturnsTable` props become `{ schemeId, scope, fundName, mode, current }`. It no longer renders its own toggle (its header keeps only the `Returns` title) and reads `current` from props. Its table rendering, the not-held message and the category request are unchanged.
- `PerformanceChart` gets `toggleSlot?: ReactNode`, rendered **above** the period `Segmented` inside its card. With no slot nothing changes.
- `OverviewPage` renders `<PerformanceChart toggleSlot={<ReturnsModeToggle .../>} />` when the mode is `inception`. For `current` see task 4.4. On narrow screens the order stays Performance, Details, Returns (the existing `order-*` classes).

- [ ] **Step 1: Failing tests.** `ReturnsModeToggle`: `shows the two options with their info icons`; `calls onChange with inception or current`. `OverviewPage`: `the toggle sits in the performance card above the period buttons`; `switching the toggle changes the table`; `the Current request is not sent until Current is chosen`; `the Returns card header has no toggle`. `ReturnsTable`: `reads current from props`. **The existing `PerformanceChart` tests pass without any edit** (this is the proof the Inception graph is unchanged). `PerformanceChart`: `renders the slot above the period buttons when given, and nothing extra when not`.
- [ ] **Step 3: Implement.** **Verify:** `npx vitest run src/features/individual-fund`.

### Task 4.4: The Actual XIRR graph, grouped bars (Q54, Q55 superseded, Q59 D) **[Antigravity]**

**Files:** Create `overview/CurrentReturnsChart.tsx` and its test. Modify `components/ui/charts/grouped-bar-chart.tsx` **only if needed for dashes** (see below). Modify `OverviewPage.tsx`, `fundCopy.ts` (the no-benchmark notice words). Tests alongside.

**Read first (the orchestrator, before the handoff):** `components/ui/charts/grouped-bar-chart.tsx`. Its props at `bd8cd19`: `buckets: { label: string; values: number[] }[]`, `seriesColors: string[]`, `formatValue: (n: number) => string`, `ariaLabel: string`, `onBucketClick?`, `height?`, `width?`. A missing value is drawn as `0` (`b.values[s] ?? 0`).

**Interfaces:**
- `CurrentReturnsChart({ data, fundName })` where `data` is the Current `ReturnsResponse` (`mode === "current"`). **Buckets** are the table columns in order: `1Y`, `3Y`, `5Y`, `Since first investment` (`columnHeader(col)`); **series 0** is `rows.holding_xirr[col]` (colour `var(--c2)`), **series 1** is `rows.benchmark_same_flows?.[col]` (colour `var(--c3)`). Values are the response strings parsed to numbers for display only; the label formatter is `formatPercent(value, { digits: 1 })`. **Each bar equals its table cell.**
- **Missing figures.** A null cell has no bar and a dash under the group label, with the table's own words as the tooltip (`You have not held this fund for this long.`). If `GroupedBarChart` cannot draw that (it draws a 0-height bar), add an **optional** prop (for example `missing?: boolean[][]`, default none) with its own tests, and do not change any existing behaviour or test.
- **Negative values** draw below a baseline and the axis includes the negative range (check `niceTicks`; extend only if the chart cannot, with tests).
- **One series** when `rows.benchmark_same_flows` is null: only the holding bars and one legend item, plus a notice (`fundCopy.ts`): `no_benchmark` → `No benchmark applies to this fund type, so only your holding is shown.`; `no_history` → `Benchmark history is not available yet, so only your holding is shown.` The same sentence appears under the table for that case.
- **Legend:** the same markup and look as `PerformanceChart`'s (dot, name, no figures because each bar carries its value). The benchmark legend name is `data.benchmark_label` (through `benchmarkDisplayName`) plus `, same cash flows`; the holding legend is `Your holding (XIRR)`.
- **Not held** (`current.status === "unavailable"` and `reason === "not_held"`): in place of the chart the card shows a designed state (outlined box, clock icon, title `{member name} does not hold this fund`, or `No one in your family holds this fund` in the family view; body `Actual XIRR uses your own purchases of a fund. Model Portfolio Returns shows how the fund itself has done.`, and a button `Show Model Portfolio Returns` that sets the mode to `inception`, Q60). The table keeps its existing `Not held by X.` message. The member name comes from `useScope().selectedMember`.
- **Loading and error** use `SectionState` (skeleton for the chart area; an error with a retry), with the toggle always visible.
- **No period buttons.** In the `current` mode the performance card shows the toggle, the legend and the chart only.
- `OverviewPage` shows `CurrentReturnsChart` in the performance card (with the same `ReturnsModeToggle` slot) when `mode === "current"`.
- No new `fundPageApi` call and no new response type: it reads the object already fetched for the table.

- [ ] **Step 1: Failing tests.** `every bar equals its table cell` (a sample response and a synthetic one, all four columns); `a null cell draws no bars and a dash`; `a negative XIRR draws below the baseline`; `a missing benchmark row draws one series and the notice for each reason`; `the legend names the benchmark with the label and same cash flows`; `not held shows the designed state for a member and for the family view`; `Show Model Portfolio Returns switches the mode`; `loading and error use SectionState and keep the toggle`; `no period buttons are rendered in this view`; `a response with no benchmark_label falls back to the plain word Benchmark`. If the chart is extended: tests for the new optional prop and a test that all existing chart tests still pass unedited.
- [ ] **Step 3: Implement.** **Verify:** `npx vitest run src/features/individual-fund src/components/ui/charts`.

### Task 4.5: S4 gate **[Claude]**

- [ ] `PerformanceChart` tests unedited and green; full suites; `npm run build`; `npm run lint`; old-payload tests (a returns response without `benchmark_label`, a Current response without the benchmark row).
- [ ] Before and after screenshots of the Inception view at 1440 and 1024: identical except the toggle row. Screenshots of every Current state. A real-statement check by hand: the bars against the Current table for one real fund, including one with an opening balance (the table's own maths already handles it).
- [ ] Review gate over the stage's range; the owner relays. Tag `ui-s4-done`.

---

## Stage S5: The Six Life Goals (the approved database change)

> Run through the orchestrator-and-workers method in Part 1. Commit prefix `ui-s5:`. Handoff slug: `ui-s5-goals-six`. Spec: the planning page's "New goals: backend and database" section and Round 3 D and E (Q13 B, Q13b B, Q68 A; the six codes approved on 2 Nov). **Deeper check** (Method point 8): a second, scoped review round and a hand check of the named cases.

**Goal:** replace the four product goals with the six life goals, allow one to six goals (the All of it shortcut stays and now selects all six), drop the deprecated single-goal column and its native type, and make every screen and query that reads goals agree. The staging database is cleared before this ships, so no user data is converted.

**The six codes (approved):** `wealth_creation` (Build my wealth), `retirement` (Plan for retirement), `childrens_education` (Fund my children's education), `buy_home` (Buy a home), `financial_freedom` (Achieve financial freedom), `tax_planning` (Plan my taxes). They replace `consolidated_view`, `understand_holdings`, `family_management`, `performance_comparison`. No old value maps onto a new one.

**Migration number:** run `alembic heads` at the start of the stage. At the time of writing the head is `0052`, so this migration is expected to be `0053`. **If the number is taken, stop.** Down-revision is the head at that time.

**Stage checks:** migration up, down and up on Postgres; `pytest tests/functional_postgres` for the goals tests; the head assertion in `tests/test_migrations.py` updated; full suites; build; lint; screenshots of the mobile goals screen and the Profile goals dialog and chips.

---

### Task 5.1: The migration **[Codex]**

**Files:** Create `backend/alembic/versions/<next>_primary_goals_life_goals.py`. Modify `backend/tests/test_migrations.py` (the head assertion, currently `"0052 (head)"`, and add a round-trip test), `backend/tests/functional_postgres/test_member_detection_postgres.py` (rewrite `test_0019_primary_goals_check_constraint_on_postgres`).

**Interfaces (the shape; final code is written test-first):**
```python
_NEW = '["wealth_creation","retirement","childrens_education","buy_home","financial_freedom","tax_planning"]'
def upgrade() -> None:
    is_pg = op.get_bind().dialect.name == "postgresql"
    op.execute("UPDATE users SET primary_goals = NULL")      # 1. no old value maps to a new one
    if is_pg:                                                 # 2. swap the CHECK: six codes, 1 to 6 items
        op.drop_constraint("ck_users_primary_goals_allowed", "users", type_="check")
        op.create_check_constraint("ck_users_primary_goals_allowed", "users",
            "primary_goals IS NULL OR CASE WHEN jsonb_typeof(primary_goals) = 'array' "
            f"THEN jsonb_array_length(primary_goals) BETWEEN 1 AND 6 AND primary_goals <@ '{_NEW}'::jsonb ELSE false END")
    with op.batch_alter_table("users") as batch:              # 3. drop the single-goal column, then its enum type
        batch.drop_column("primary_goal")
    if is_pg:
        op.execute("DROP TYPE IF EXISTS primarygoal")
def downgrade() -> None: ...  # recreate the type, the column and the old CHECK; clear goals first
```
The column is dropped, not altered, because Postgres cannot remove values from an enum. Read `0019_user_primary_goals.py` for the exact old CHECK text and the Postgres-only guards it uses, and mirror them. A downgrade clears goals first because the new values cannot be represented in the old shape.

- [ ] **Step 1: Failing tests.** `test_head_is_the_goals_migration`; `test_upgrade_downgrade_upgrade_round_trip` (after upgrade `primary_goal` is gone and saved goals are NULL; after downgrade the column and the old CHECK are back); Postgres: `test_primary_goals_check_allows_one_to_six_new_codes` (a bad value, an empty array, seven items and an old code are each refused by the CHECK; one and six are accepted); `test_primarygoal_enum_type_is_gone` (`pg_type` has no `primarygoal`); `test_users_table_has_no_primary_goal_column`.
- [ ] **Step 3: Implement.** **Verify:** `cd backend && pytest tests/test_migrations.py`; `pytest tests/functional_postgres/test_member_detection_postgres.py` with `TEST_DATABASE_URL`; migration up, down, up by hand on the local Postgres.

### Task 5.2: Enum, model, schema, route and report script (backend) **[Codex]**

**Files:** Modify `backend/app/models/enums.py` (`PrimaryGoal`: six members, lowercase values as above), `app/models/user.py` (delete the `primary_goal` column and its "dual-written until 0021" comment; update the comment on the CHECK), `app/services/auth/schemas.py` (`UpdateMeBody`: delete the legacy `primary_goal` field and `_fold_legacy_goal`, and the `model_validator` import if nothing else uses it; `_dedupe_goals` bounds `1 <= len(unique) <= MAX_GOALS` with `MAX_GOALS = 6` and the message `Pick between 1 and 6 goals.`), `app/api/auth.py` (`update_me`: delete the `user.primary_goal = PrimaryGoal(goals[0])` dual write; drop the `PrimaryGoal` import if unused), `backend/scripts/report_onboarding_goals.py` (docstring; replace the `all_four` figure with `picked_all` = users who chose all six; the per-goal counts follow `GOALS = [g.value for g in PrimaryGoal]` automatically). Tests: `tests/api/test_auth_routes.py` (the goal tests near lines 687 to 730), `tests/scripts/test_report_onboarding_goals.py`.

- [ ] **Step 1: Failing tests.** `test_patch_me_saves_goal_list` (replaces the dual-write test; asserts only `primary_goals` is written); `test_patch_me_accepts_all_six_goals`; `test_patch_me_dedupes_goals`; `test_patch_me_rejects_an_old_code`; `test_patch_me_rejects_an_empty_list` (422 with the new message); `test_patch_me_rejects_an_unknown_seventh_code`; delete `test_patch_me_accepts_legacy_single_primary_goal` and add `test_patch_me_ignores_a_legacy_primary_goal_field_in_the_body` (extra field ignored or 422, whichever the model config gives; assert it is not stored); `test_user_created_without_goals_stores_sql_null` stays. Report: `test_report_counts_the_six_goals`; `test_report_picked_all_counts_users_with_all_six`; `test_report_skipped_counts_users_without_goals`.
- [ ] **Step 3: Implement.** **Verify:** `pytest tests/api/test_auth_routes.py tests/scripts/test_report_onboarding_goals.py tests/test_migrations.py`.

### Task 5.3: Frontend goal files (types, Profile, mobile screen, fixtures) **[Antigravity]**

**Files (verified present at `bd8cd19`):** `frontend/src/features/auth/types.ts` (`PrimaryGoal` union: six strings), `features/profile-v2/lib/onboardingOptions.ts` (`GOAL_OPTIONS`: the six, the copy slide's labels, the old subtitles dropped; this list is the single source for sign-up, the mobile screen and Profile), `features/profile-v2/lib/goalChips.ts` (**keep** the branch that collapses a full set into "All of it"; it now applies when all six are set), `features/profile-v2/components/GoalsDialog.tsx` (allow all six; keep the "Why choose? All of it." button as the select-all shortcut; add the hint `Select all that apply`), `features/auth/Q3Purpose.tsx` (the **mobile** goals screen: six options from the shared list, up to six, the All of it shortcut selects all six, Skip stays, six small drawings reusing the PDF chip icons; layout otherwise unchanged), `features/auth/OnboardingFlow.tsx` (types only), `features/profile-v2/pages/PersonalInfoPage.tsx` and `fixtures/me.ts` (new codes in fixtures; the page passes the saved list through). Tests to update: `onboardingOptions.test.ts`, `goalChips.test.ts`, `GoalsDialog.test.tsx`, `FinancialDetailsCard.test.tsx`, `PersonalInfoPage.test.tsx`, `fixtures/fixtures.test.ts`, `Q3Purpose.test.tsx`, `OnboardingFlow.test.tsx`, `AuthEntryFlow.test.tsx`, `AuthContext.test.tsx`, `auth/api.test.ts`, `App.test.tsx`, `mobile/MobileRoot.test.tsx`.

**The mobile screen must change in the same release.** If it kept sending the four old values the backend would refuse them.

- [ ] **Step 1: Failing tests.** `onboardingOptions`: `GOAL_OPTIONS has the six codes and labels in order`. `goalChips`: `shows the saved labels`; `collapses all six to All of it`; `shows an unknown code as a humanised label` (the existing safety net). `GoalsDialog`: `allows choosing all six`; `the All of it button selects all six`; `saves the chosen codes`; `the hint reads Select all that apply`. `Q3Purpose`: `shows six options`; `the All of it shortcut selects all six`; `Skip still works`; `sends only the new codes`. Fixtures and the remaining tests: new codes in expected payloads.
- [ ] **Step 3: Implement.** **Verify:** `cd frontend && npx vitest run src/features/auth src/features/profile-v2 src/App.test.tsx src/mobile`.

### Task 5.4: Queries and guides that read goals (Q13, Round 3 E) **[Claude]**

**Files:** `Docs/orchestration/2026-09-30-staging-db-verification-guide.md` (lines ~167 and ~202 select the single `primary_goal` column and **break** after the migration: change both to `primary_goals`), `Docs/orchestration/2026-10-01-post-deploy-db-check-guide.md` (line ~240, `SELECT primary_goals FROM users WHERE phone_number = :'phone';`: the query is fine, the expected values become the new codes), the new staging deploy guide (S7). Optional and offered only: a Postgres helper `SELECT g, count(*) FROM users, jsonb_array_elements_text(primary_goals) AS g GROUP BY g ORDER BY 2 DESC;`. Queries saved outside the repo (DBeaver, dashboards, spreadsheets) that filter on the four old values or select `primary_goal` are **the owner's to check**; list them in the deploy guide.

- [ ] **Step 1:** a grep test in the repo's docs checks is not available, so the orchestrator runs `grep -rn "primary_goal\b" --include=*.md --include=*.sql --include=*.py .` and records every hit in the delegation log. After the stage the only hits are the migration files and the history notes.
- [ ] **Step 3:** edit the two guides. (The wider documentation update is task D.1.)

### Task 5.5: S5 gate **[Claude]**

- [ ] Migration up, down, up on Postgres; the Postgres functional tests; the head assertion; full suites; build; lint; old-payload tests (a `/auth/me` payload with an old code renders as a humanised label, never a crash).
- [ ] Hand checks by the orchestrator: a PATCH with the six, with one, with an old code, with an empty list, with duplicates; `\d users` shows no `primary_goal`; `\dT` shows no `primarygoal`; the report script runs.
- [ ] Review gate, then a **second scoped round** on the migration and the schema. The owner relays each. Tag `ui-s5-done`.

---

## Stage S6: Sign-up, Sign-in and Onboarding Redesign (Phases 1 to 5, with the Round 3 amendments)

> Run through the orchestrator-and-workers method in Part 1. Commit prefix `ui-s6:`. Handoff slugs: `ui-s6-foundations`, `ui-s6-login`, `ui-s6-signup-front`, `ui-s6-signup-back`, `ui-s6-states`. Spec: the planning page's sections `l1` to `s6`, `connect`, `flows`, `mobile`, `system`, `gaps`, `state`, `code` and Round 3 A to D (Q1 to Q28, Q61 to Q68). **Depends on S3 and S5** (screen 4 needs the six goals; the upload step shares `SoloCasUpload` with the S3 follow-ups). It also depends on the change-requests plan being merged: it builds on `OtpStubBanner.tsx` (Run 6), the green token (Run 7), Head of Family and the changed `OtpVerify.tsx`, `ReconsentGate.tsx`, `features/auth/api.ts` and `types.ts`.

**Goal:** the nine PDF screens (login 1 to 3, sign-up 1 to 6) plus the derived verify-email screen (3b), built as new components **beside** the old ones, switched by a `variant` prop (`"split"` desktop, `"legacy"` mobile). One shared state machine, so fixes help both. Behaviour is unchanged except the named amendments: the email change on Back, required answers on screen 4, the resume rule, the screen order of today's flow kept.

**What is NOT built (decisions):** a Google button on login (hidden behind one setting, code kept, Q1); a voice-call code (the `Get code via call` control is drawn but has no function, Q4); redesigns of the statement import screens (today's are used as they are, Q17); the screen-order change of the earlier request (cancelled, not asked again); dark mode on auth screens (forced light, Q21); mobile screens (unchanged, Q20); screens with no mockup stay as they are (link-account, Google steps, re-consent gate, pending-deletion, Q24).

**Today's order stays** (phone, phone code, email, email code, then name): the new flow shows **phone, phone code, name and email together (screen 3), email code (3b)**, then screens 4 to 6. The account is created when the email code is verified, as the backend requires, so the typed name waits in `sessionStorage` until the session exists (T6.10).

**Verified names at `bd8cd19` (S0 re-checks):** `AuthEntryFlow.tsx` handlers `handlePhoneSubmit`, `handleSignupPhoneSubmit`, `handleEmailLoginRequest`, `handleEmailGateSubmit`, `handleEmailOtpSubmit`, `handleEmailOtpResend`, `handlePhoneOtpSubmit`, `handleGoToLogin`, `handleGoToSignup`; `OnboardingFlow.tsx` `resumeStep(me)` and `initHistory`; `onboardingSteps.ts` (`ONBOARDING_STEPS`: `landing, phone, otp, q1_name, q2_investing, q3_purpose, cas_upload, done`); `SoloCasUpload({ name })` (finds or creates the self member and renders `ImportFlow`); `validation.ts` (`validateIndianPhone`, `validateEmail`, `validatePersonName`, `formatPhoneForDisplay`); `AuthContext` (`updateMe`, `refreshMe`, `requestContactChange(channel, identifier)`, `verifyContactChange(channel, identifier, otp)`); `api.ts` (`createHouseholdMember`, `listHouseholdMembers`, `updateMemberProfile`); `App.tsx` (`isMobile`, `AuthEntryFlow initialMode`, `OnboardingFlow isMobile`).

**Stage checks:** Playwright screenshots of every screen and state at 1440 and 1024 against the PDFs and the spec's mockups; the mobile regression (the legacy variant renders as before: existing mobile tests unedited and green); reduced-motion test; accessibility pass (focus order, announced errors, labelled code cells, contrast of the mint tints); full suites; build; lint.

---

### Phase 1: Foundations (`ui-s6-foundations`)

Tasks 6.1, 6.2, 6.3 and 6.4 touch different files and **may run in parallel**; 6.5 follows 6.3.

### Task 6.1: Auth tokens and motion **[Antigravity]**

**Files:** Create `frontend/src/styles/auth-tokens.css` (imported by the new components only), `features/auth/redesign/authMotion.test.ts`.

**Interfaces:** mint tints (left panel `#E4FAEC` fading to `#F6FEF9`), the card shadow, the step-bar colours, the green from the shared token (Run 7), and `@keyframes authFloat` (translateY 0, -6px, 0; 7 s ease-in-out) applied to `.auth-sketch`, with per-sketch variants set by a data attribute (`data-motion="float|tilt|breathe"`, durations and distances from the spec's motion table). `@media (prefers-reduced-motion: reduce) { .auth-sketch { animation: none } }`. Transform only.

- [ ] **Step 1: Failing tests.** `the css defines authFloat`; `the css turns the animation off under prefers-reduced-motion` (read the file text and assert the media block); `every sketch variant is defined`.
- [ ] **Step 3: Implement.** **Verify:** `cd frontend && npx vitest run src/features/auth/redesign/authMotion.test.ts`.

### Task 6.2: The `variant` prop **[Antigravity]**

**Files:** Modify `frontend/src/App.tsx`, `features/auth/AuthEntryFlow.tsx`, `features/auth/OnboardingFlow.tsx`. Create `features/auth/redesign/variant.ts`. Tests `App.test.tsx`, `AuthEntryFlow.test.tsx`, `OnboardingFlow.test.tsx`.

**Interfaces:** `export type AuthVariant = "split" | "legacy"`. Both flows take `variant?: AuthVariant` with default `"legacy"` so existing callers and tests are unchanged. `App.tsx` passes `variant={isMobile ? "legacy" : "split"}` at the two desktop call sites (lines ~121 and ~125 at `bd8cd19`) and `"legacy"` on the mobile call sites. Until later tasks land, `"split"` renders the legacy screens, so this task is safe to merge alone. The flip in `App.tsx` is the rollback.

- [ ] **Step 1: Failing tests.** `App passes split on desktop and legacy on mobile`; `AuthEntryFlow legacy renders AuthShell exactly as before` (existing tests pass unedited); `OnboardingFlow legacy is unchanged`.
- [ ] **Step 3: Implement.**

### Task 6.3: Layout components **[Antigravity]**

**Files:** Create `features/auth/redesign/AuthSplitCard.tsx`, `AuthLeftPanel.tsx`, `StepProgress.tsx`, `AuthField.tsx`, `AuthAlert.tsx`, `SegmentedTabs.tsx`, `InfoCard.tsx`, `StatusRow.tsx`, and a test for each.

**Interfaces and layout (the spec's "A · Spacing, centring and motion"):**
- `AuthSplitCard({ left, right, step?, onBack?, bottom? })`: a card with 40 px padding and equal-height panels. The **right panel is three rows**: a 56 px top bar (Back on the left, `StepProgress` on the right, identical on every screen), a content area that centres **one block 360 px wide, centred both ways**, and a 56 px bottom row for the Log in or Sign up link or the shield line. Below 1024 px the panels stack; the block stays centred and at most 360 px.
- `AuthLeftPanel({ sketch, motion, headline, paragraph, rows?, infoCard?, status? })`: logo top left, the sketch centred in the space left (class `auth-sketch`, `data-motion`), 28 px, the headline (green accent words), 12 px, the paragraph, 24 px, the three rows 16 px apart, **all sharing one left edge**. The block keeps its position from the bottom so one-line headlines do not move the rows.
- `StepProgress({ step, total = 5, done? })`: `Step 2 of 5` and five segments; `done` shows `Done` with all five full (Q7). Never "of 6".
- `AuthField({ id, label, hint?, error?, icon?, ...input })`: label above, 48 px input, 12 px radius, error and hint linked by `aria-describedby`.
- `AuthAlert({ tone, children, action? })`: the one shared red alert with an optional green shortcut button (today's pattern redrawn), `role="alert"`.
- `SegmentedTabs` (Email | Mobile number), `InfoCard`, `StatusRow` as drawn in the spec.

- [ ] **Step 1: Failing tests.** `AuthSplitCard renders the three right-panel rows and centres one 360px block`; `the top bar is the same on every screen` (Back and step positions); `stacks below 1024px`; `StepProgress shows Step 2 of 5 and Done with five full bars and never of 6`; `AuthField links its hint and error to the input`; `AuthAlert is announced and shows an optional shortcut`; `AuthLeftPanel keeps rows on one left edge and applies the motion class`; `SegmentedTabs is keyboard operable`.
- [ ] **Step 3: Implement.** **Verify:** `npx vitest run src/features/auth/redesign`.

### Task 6.4: Code panel, countdown and masks **[Antigravity]**

**Files:** Create `features/auth/redesign/OtpPanel.tsx`, `useResendCountdown.ts`, tests. Modify `features/auth/validation.ts` (`maskPhone`, `maskEmail`), `validation.test.ts`.

**Interfaces:**
- `maskPhone(phone: string): string` returns `+91 ••••• 43210` (keeps `+91` and the last five digits). `maskEmail(email: string): string` keeps the first two letters of the name and the full domain: `si••••••@gmail.com` (Q6).
- `useResendCountdown(start = 60)` returns `{ seconds, active, restart }`; it starts at 60 after each send, matching the backend's 60-second throttle (`RESEND_THROTTLE_SECONDS`), and `mm:ss` is formatted by a helper. It is display only: the server still answers 429 `Please wait Ns` and that message is shown.
- `OtpPanel({ channel: "phone" | "email", identity, onSubmit, onResend, onBack, onEditIdentity, devOtp, error, submitLabel })`: a presentation over the existing `OtpVerify` behaviour and `OtpInput` (six cells, labelled); heading `Verify your mobile number` or `Verify your email address`; the countdown; the submit button label from the screen; the `OR` line and a `Get code via call` control that is **drawn and has no function** (rendered as `aria-disabled`, not focus-trapping, no handler, Q4); the dev code strip uses `OtpStubBanner` if the change-requests Run 6 created it, otherwise the existing `Local Dev OTP` markup, and shows only when `devOtp` is set.

- [ ] **Step 1: Failing tests.** `maskPhone keeps +91 and the last five digits`; `maskEmail keeps two letters and the domain`; `maskEmail handles a one-letter name`; `the countdown starts at 60 and enables Resend at 0`; `a 429 message from the server is shown`; `six labelled cells`; `Get code via call is shown and does nothing`; `the dev code strip shows only when a code is given`; `Edit number and Back call their handlers`.
- [ ] **Step 3: Implement.** **Verify:** `npx vitest run src/features/auth/validation.test.ts src/features/auth/redesign`.

### Task 6.5: Sketches and the dev index page **[Antigravity]**

**Files:** Create `frontend/public/illustrations/auth/*` (the eight sketches and the logo, from the owner, S0 task 0.5) and `features/auth/redesign/DevIndex.tsx` plus its route, **only when `import.meta.env.DEV`**.

**Interfaces:** `DevIndex` renders every new screen with fake props at `/dev/auth-screens` so the owner can review all of them before any flow is wired (the plan's Phase 1 end condition). It is excluded from production builds by the `DEV` guard and a test.

- [ ] **Step 1: Failing tests.** `DevIndex lists every screen`; `DevIndex is not registered in a production build` (assert on the guard).
- [ ] **Step 3: Implement.** Review gate for Phase 1 with Playwright screenshots of the dev index.

---

### Phase 2: Login (`ui-s6-login`). Tasks run in order (they share `AuthEntryFlow.tsx`).

### Task 6.6: Login screen 1 (Q1 to Q3, login 1 position) **[Antigravity]**

**Files:** Create `features/auth/redesign/LoginEntry.tsx`, `authConfig.ts`, tests. Modify `AuthEntryFlow.tsx` (the split branch).

**Interfaces:** `authConfig.ts` exports `AUTH_SHOW_GOOGLE = false` (one setting; the Google component and path stay in the repo). `LoginEntry` shows `Welcome back`, the sub line, `SegmentedTabs` (**Email is the default**, Q3), one field, `Get OTP`, `OR`, `New to Unifolio? Sign up`. It calls the existing `handleEmailLoginRequest(email)` or `handlePhoneSubmit(phone)` directly, so today's separate email and phone login steps are skipped. Back goes to sign-up screen 1 (Q2); sign-up has no Back. Existing validators and the error mapping stay (`No account found` becomes an inline `AuthAlert` with a Sign up shortcut). **Left panel (login 1 only):** headline `One dashboard for your family's financial life` (green accent on `financial life`), paragraph `Pick up where you left off.`, the three rows; the headline and paragraph sit about 38 px lower than the sketch's top and are **left-aligned**, and the three rows stay left-aligned (the 2 Nov decision).

- [ ] **Step 1: Failing tests.** `Email is the default tab`; `submitting an email calls handleEmailLoginRequest`; `switching to Mobile calls handlePhoneSubmit`; `validation errors show inline`; `no account found shows the alert with a Sign up shortcut`; `no Google button when AUTH_SHOW_GOOGLE is false and it appears when true`; `Back and the Sign up link go to sign-up screen 1`; `the headline block is left-aligned`.
- [ ] **Step 3: Implement.**

### Task 6.7: Login code screens **[Antigravity]**

**Files:** Modify `AuthEntryFlow.tsx`. Create `redesign/LoginCode.tsx` (thin wrapper) and a test.

**Interfaces:** mobile: phone sketch, left panel `Welcome back.` with the masked number and `Edit number`; email: envelope sketch with the masked address and `Edit email address`; right: `OtpPanel` with `Verify and log in`. `Edit` and Back return to login 1 with the typed value kept. After a correct code: session, then Home, or onboarding first if it was not finished, as today.

- [ ] **Step 1: Failing tests.** `shows the masked number for the mobile login and the masked email for the email login`; `Edit returns to login 1 with the value kept`; `a correct code logs in through the existing handler`; `a wrong or expired code shows the shared alert`; `resend respects the countdown`.
- [ ] **Step 3: Implement.** Phase 2 review gate.

---

### Phase 3: Sign-up front (`ui-s6-signup-front`). Tasks run in order.

### Task 6.8: Sign-up screen 1 (Q8, Q11) **[Antigravity]**

**Files:** Create `redesign/SignupPhoneEntry.tsx`, test. Modify `AuthEntryFlow.tsx`.

**Interfaces:** `Step 1 of 5`, `Let's get started`, `Enter your mobile number to create your Unifolio account.`, a **fixed +91** field with no chevron, `Get OTP`, the line `By continuing, you agree to our Terms & Conditions and Privacy Policy.` (**the only place it appears**, linking the public legal pages), `Already have an account? Log in`. It keeps `handleSignupPhoneSubmit`, the accepted Terms and Privacy versions that travel with the request, the disabled-until-documents-load rule, and the `Log in instead` shortcut on the 409 account-exists error. No Back.

- [ ] **Step 1: Failing tests.** `the field is fixed +91`; `the consent line is shown and links the legal pages`; `Get OTP is disabled until the documents load`; `submit sends the accepted versions`; `account exists shows the shortcut`; `no Back is rendered`.

### Task 6.9: Sign-up screen 2 **[Antigravity]**

**Files:** Create `redesign/SignupCode.tsx`, test. **Interfaces:** `Quick and secure.`, `We've sent a 6-digit verification code to +91 98765 43210` (not masked, the user just typed it), `Edit number`; right `Step 2 of 5`, `Verify your number`, six cells (the PDF draws five), `Verify & Continue`. Back and Edit go to screen 1 with the number kept. A correct code leads to screen 3 through `handlePhoneOtpSubmit` (the backend answers `email_required` with a pending token).

- [ ] **Step 1: Failing tests.** `six cells`; `Edit and Back return to screen 1 with the number`; `a correct code moves to screen 3`; `409 account exists shows Log in instead`.

### Task 6.10: Screen 3 and 3b, the pending name, account creation **[Antigravity]**

**Files:** Create `redesign/AccountDetails.tsx`, `pendingSignup.ts`, `EmailCode.tsx`, tests. Modify `AuthEntryFlow.tsx`, `OnboardingFlow.tsx`, `SoloCasUpload.tsx` (only the self-member save point).

**Interfaces:**
- `AccountDetails`: `Step 3 of 5`, `Create your account`, `Tell us a few basic details to get started.`, `Full name (as per PAN card)` (placeholder `e.g. Siddharth Surve`, hint `Enter your name exactly as it appears on your PAN card.`, validated by `validatePersonName`), `Email address` (**required**, no `(optional)`, Q9; `validateEmail`), `Continue`, and the line `Your data is encrypted and protected.` (kept as drawn, Q11). Left panel: `Let's start with the basics.` and the info card `Why do we need your PAN name?`. Back goes to screen 1 (the phone code is used up; the pending token lasts 10 minutes).
- `pendingSignup.ts`: `savePendingSignup({ name, phone })`, `readPendingSignup()`, `clearPendingSignup()` on `sessionStorage` key `unifolio.pendingSignup`, wrapped in try and catch, cleared after the self member is saved, or if the signed-in phone does not match.
- On Continue it calls `handleEmailGateSubmit(email)` and saves the typed name. Screen 3b (`EmailCode`): envelope sketch, `Almost there.`, `Confirm your email so we can keep your account secure and send you important updates.`, the masked address and `Edit email address`; right `Step 3 of 5` (the email check is a sub-step of step 3), `Verify your email address`, six cells, `Verify & Continue`, resend countdown, **no** `Get code via call` on this screen if the spec's 3b mockup omits it (it does; the login email screen keeps it per the PDF). Words approved on 2 Nov. Back goes to screen 3 with name and email kept.
- When the session appears, the save point reads the pending name, calls the existing list-then-create guard so **the self member is created once and never twice**, clears the store and moves to screen 4. If there is no stored name (a refresh), `resumeStep` returns the name step and screen 3 shows the name field with the verified email read-only.

- [ ] **Step 1: Failing tests.** `name and email are validated and required`; `the encryption line is shown and the consent line is not`; `Continue saves the pending name and requests the email code`; `the verify screen shows the masked address and counts down`; `after the session exists the self member is created once from the stored name`; `a double mount or double click creates one self member`; `a refresh between the code and the name shows only the name field with the email read-only`; `a stored name for another phone is ignored and cleared`; `sessionStorage failing does not break the screen`.

### Task 6.11: The return trip, email change (Q10 amended, Q65, Q66) **[Antigravity]**

**Files:** Modify `redesign/AccountDetails.tsx`, `EmailCode.tsx`, `OnboardingFlow.tsx`. Tests alongside.

**Interfaces:** Back from screen 4 shows screen 3 with **name and email filled and both editable**, with the note under the email field `If you change it, we send a new code to the new address.` On Continue it compares with what is saved; only changed values trigger work. **Name changed:** `updateMemberProfile(selfMemberId, { name })` (existing, the PAN-name rules apply). **Email changed:** `AuthContext.requestContactChange("email", newEmail)` (the backend's `POST /auth/contact-change/request`, which checks the address is free, sends the code **to the new address** with the 60-second throttle), then screen 3b for the new address, then `AuthContext.verifyContactChange("email", newEmail, otp)` which replaces the email identity and `users.email`, then `refreshMe()`, then screen 4 with the answers kept. **Back from 3b returns to screen 3 with the typed address kept; the old email stays active until the code is verified.** A taken address shows the backend's message inline on screen 3. A reload on 3b loses the pending change and shows the saved email. **No backend change** (the endpoints and the context functions exist). Old email stops working for sign-in once verified, by design (Q66 A).

- [ ] **Step 1: Failing tests.** `Back shows both fields editable and filled`; `an unchanged screen moves on without any request`; `a changed name calls updateMemberProfile`; `a changed email requests a code for the new address and shows 3b`; `a correct code verifies, refreshes me and continues`; `Back from 3b keeps the typed address and the old email stays`; `an address used by another account shows the inline message`; `a 429 shows the wait message`; `both changed saves the name first then runs the email check`; `the stub code is shown in stub mode`.
- [ ] **Step 3: Implement.** Phase 3 review gate.

---

### Phase 4: Sign-up back (`ui-s6-signup-back`). Needs S5. Tasks run in order.

### Task 6.12: Screen 4, investor profile (Q12 amended, Q13b B, Q67, Q68) **[Antigravity]**

**Files:** Create `redesign/InvestorProfile.tsx`, `OptionRow.tsx`, `ChipCheckbox.tsx`, tests. Modify `OnboardingFlow.tsx`, `onboardingSteps.ts`.

**Interfaces:** `Step 4 of 5`. Left: `Help us personalise your experience.`, the paragraph and the three rows. Right: `How do you usually invest?` with the four options mapped to `beginner` (`I'm just getting started`), `self_directed` (`I manage my own investments`), `advisor_assisted` (`I work with a financial professional`), `mixed` (`A mix of both`); then `What are you working towards? (Select all that apply)` with the six chips from `GOAL_OPTIONS` and a **Select all** link on the heading that becomes **Clear all** when all six are chosen; `Continue`. **Nothing is pre-selected. There is no Skip. Both answers are required.** Pressing Continue with an unanswered question shows a small red line under it (`Choose how you usually invest.` and `Choose at least one goal.`), announced with `role="alert"`, and moves focus to the first one. The button is always enabled. On success one call: `updateMe({ investor_type, primary_goals, onboarding_step: "q2_investing" })`. **Desktop only**: mobile keeps its own screens and its Skip. Resume maps the old saved steps `q2_investing` and `q3_purpose` to this screen with answers filled. Back goes to screen 3 (editable, T6.11).

- [ ] **Step 1: Failing tests.** `nothing is pre-selected and there is no Skip`; `Continue with neither answered shows both errors and focuses the first`; `one answered and one not shows only the missing one`; `Select all selects all six and becomes Clear all`; `Clear all clears them`; `a single choice for the first question`; `Continue saves the investor type and the goals in one updateMe call`; `a tester resumed from q3_purpose sees the answers filled`; `the errors are announced`.
- [ ] **Step 3: Implement.**

### Task 6.13: Screen 5, Connect accounts **[Antigravity]**

**Files:** Create `redesign/ConnectAccounts.tsx`, `SourceRow.tsx`, tests. **Interfaces:** `Step 5 of 5`, `What would you like to connect first?`, `You can always add more accounts later.`, **Mutual funds** active (`Import your holdings via CAMS or MF Central`, wording kept as drawn, Q15), then `Stocks & ETFs`, `PMS & AIFs`, `Real estate`, `Gold`, `Bank accounts, loans & credit cards`, each with a `Coming soon` pill and not selectable (Q14). `Continue` renders the existing `SoloCasUpload` (today's import screens, no step bar, Q17, Q64) and writes the step `cas_upload`. **No skip** (Q16 B). Back goes to screen 4 with answers filled; today's import screens keep their own links.

- [ ] **Step 1: Failing tests.** `only Mutual funds is selectable`; `coming-soon rows ignore clicks and keys`; `Continue shows the import screens`; `the step is saved as cas_upload`; `Back returns to screen 4 with answers`; `there is no skip`.

### Task 6.14: Screen 6, All set, and the resume rule (Q18, Q19, Q63, Q64) **[Antigravity]**

**Files:** Create `redesign/AllSet.tsx`, tests. Modify `SoloCasUpload.tsx` (add an `onImported(result)` prop, the existing completion write moves behind the button), `OnboardingFlow.tsx` (`resumeStep`), `onboardingSteps.ts`.

**Interfaces:** shown **after the import finishes and before `onboarding_completed` is written**. Left: `You're all set!` and the three status rows (Accounts connected, Importing your investment data, Preparing your dashboard) with their one-line descriptions. Right: the step label `Done` with all five bars full, a tick, `Getting your accounts ready`, the card `Accounts being imported` listing **only real rows** (Mutual Funds, `Imported via CAS statement`, ticked), `View details ›` opening Profile, Import History (`paths.profileImportHistory()`, `/profile/settings/import-history`), the tip `While we fetch your data...`, and `Go to my dashboard`, which writes `updateMe({ onboarding_completed: true })` through the existing completion path and navigates to `/home`. **No timed redirect.** The existing `couldn't finish` retry state in `SoloCasUpload` stays.
- **Resume (Q26, Q64):** `resumeStep` maps `q1_name` and a missing self name to screen 3, `q2_investing` and `q3_purpose` to screen 4, `cas_upload` to screen 5, **and, when the user has a completed import and onboarding is not completed, to All set** (use the existing `GET /imports/history` (`list_household_import_history`) and treat any completed item as complete; this is one read at resume, no new endpoint). `trust_primer` keeps its existing special case.
- The import result is only used to list the real rows.

- [ ] **Step 1: Failing tests.** `All set shows after the import and before completion is written`; `the list shows only real rows`; `Go to my dashboard writes onboarding_completed once and opens Home`; `View details opens Import History`; `no timed redirect`; `a reload on All set with a completed import resumes on All set`; `a reload during an import resumes at the import`; `old saved steps map to the right screens`; `the retry state still shows when completion fails`.
- [ ] **Step 3: Implement.** Phase 4 review gate.

---

### Phase 5: States, tablet, accessibility and tests (`ui-s6-states`)

### Task 6.15: States and regression **[Antigravity]**

**Files:** Modify the redesign components; add Playwright specs under the repo's existing e2e or screenshot folder.

- [ ] **Error and loading states** use `AuthAlert` everywhere: bad number, bad email, wrong or expired code, five wrong attempts, resend too soon, account exists, no account, send failed, session expired. Sending and verifying use today's `Sending...` and `Verifying code...` on the pill button.
- [ ] **Tablet** (768 to 1023 px): the right panel stacks over the sketch and headline. **Under 768 px or a `/mobile` path** the legacy screens render and every existing mobile test passes unedited (Review Focus 8).
- [ ] **Accessibility pass:** focus order, visible focus, announced errors, labelled code cells, contrast of the mint tints, reduced motion.
- [ ] **Tests.** `AuthEntryFlow.test.tsx` gets the split-variant cases (the legacy cases stay); `OnboardingFlow.test.tsx` gets resume and All set; `SoloCasUpload*.test.tsx` the new hook. Playwright: every screen and state against the spec's mockups at 1440 and 1024.

### Task 6.16: S6 gate **[Claude]**

- [ ] Full suites; `npm run build`; `npm run lint`; the old-payload tests; the mobile regression; screenshots; a manual walk of sign-up (phone, code, name and email, email code, screen 4 required answers, Back and an email change, Connect accounts, an import under a different typed name from S3, All set, Home) and of login by email and by mobile.
- [ ] Review gate over the stage's range, run per phase and once over the whole stage. The owner relays each. Tag `ui-s6-done`.

---

## Task D.1: Documentation update **[Claude]** (after S6, before S7; the owner reviews the diff)

**Files:** `Docs/PRDs/PRD-02-Signup-Onboarding.md` (FR-5 goals; FR-7 and FR-7a: screen 4 questions are now required on desktop, mobile keeps Skip; the new screen order), `Docs/PRDs/Database-Schema-Unifolio.md` (goals columns, new head migration), `backend.md`, `database.md`, `decisions.md` (one line per decision above), `log.md`, `session.md`, `DEFERRED_FEATURES.md` (the Profile financial-details entry names the stored goals), `CLAUDE.md` Session State pointer (Alembic head after S5), `Docs/orchestration/2026-09-30-staging-db-verification-guide.md` lines 167 and 202 (select `primary_goals`, not `primary_goal`), `Docs/orchestration/2026-10-01-post-deploy-db-check-guide.md` line 240 (expected values are the new codes), the Profile planning docs that name the old goals.

- [ ] Draft each change as a diff, list every PRD sentence that now conflicts (FR-7 and FR-7a are known), and show the owner before committing.

---

## Stage S7: Staging QA and Rollout

> Run through the orchestrator-and-workers method in Part 1. Commit prefix `ui-s7:` (documents only). Handoff slug: `ui-s7-staging`. **Starts only after S6 is tagged `ui-s6-done`, task D.1 (documentation update) is reviewed by the owner, and the owner gives an explicit go.** Nothing is pushed and nothing is deployed before that go (repo rule). The owner commits and pushes manually.

**Goal:** one staging deploy of S1 to S6 on LeapSwitch, a written deploy guide, a QA checklist per change, and a verified rollback path. The goals migration is the only schema change.

**Rules from earlier releases (copied, they still apply):** never run `clean-db.sh`, `restore.sh`, `rollback.sh` or any deploy script on staging except at this stage with the owner's explicit go; never add `--allow-nav-writes`; never stop a running recompute; never edit files on the VM; staging is one VM with docker compose, so the order is stop, migrate, start.

---

### Task 7.1: Write the staging deploy guide **[Claude]**

**Files:** Create `Docs/orchestration/<date>-staging-deploy-guide-ui-round-2.md` in the format of `2026-10-29-staging-deploy-guide-individual-fund.md` and `2026-10-20-leapswitch-staging-deploy-guide-analytics-and-chandra.md` (the owner runs it with Claude, as the earlier guides were run by their operator).

**Contents (the sequence, from the spec's goals release section):**
1. State of the VM before: Alembic head recorded, services healthy.
2. Frontend and backend build from the final commit. Verify the images differ from the running ones.
3. `sudo ./scripts/clean-db.sh` (the owner's go): user-domain data is wiped, so no goals are converted. Reference tables are untouched.
4. Backend builds first, then `docker compose run --rm backend alembic upgrade head` (deploy README step 5) applies the goals migration. Stop, migrate, start: an old backend instance still running after the column drop would error.
5. Start the backend, then the front end goes live. A cached old front end sends old goal codes and gets a 422: hard refresh.
6. **No forced analytics recompute is required**: no stored analytics section changed. (If S2 T2.1 is found to need a new stored field, add the recompute step and the timing scripts here and tell the owner.)
7. Verification queries with the new codes (`primary_goals` only; the old `primary_goal` queries were fixed in S5 T5.4), `\d users` shows no `primary_goal`, `\dT` shows no `primarygoal`.
8. A list for the owner of queries saved outside the repo that must be checked (S5 T5.4).
9. The rollback: revert the commit ranges in reverse order (`ui-s6`, `ui-s5`, ...), the goals migration downgrade, and the `variant` flip in `App.tsx` for the auth redesign alone.

- [ ] Claude writes it, the owner reads it, nothing runs.

### Task 7.2: QA checklist (the owner runs it, Claude records) **[Claude]**

One row per check, with the expected result and a screenshot where noted. Use the synthetic statements in `Docs/CAS Files/synthetic/pdfs/` (password `MF@123`) and the owner's real statements, which are never committed.

| # | Area | Check |
|---|---|---|
| 1 | Greeting | In the family view Home greets the head. Switch to a member: the greeting changes to that member's first name |
| 2 | Category | Mutual Funds fund list shows only the category (no `Equity Scheme -`) |
| 3 | Overlap | Portfolio Overlap: the pairs table has Overlap comparison with View more. It opens the two-fund comparison at the new address. Back returns. The individual fund's Top Funds with Overlap still works |
| 4 | Add data | In the family view Add data and Add Investment ask which member first. In a member view they do not. The header dropdown is still there |
| 5 | Returns toggle | Fund page: `Model Portfolio Returns` and `Actual XIRR` with info icons that open on hover, focus and tap |
| 6 | Actual XIRR graph | The toggle sits above the period buttons and drives the graph and the table. Grouped bars equal the table cells. A fund not held shows the designed state. A fund with no benchmark shows the notice. The Inception graph is unchanged (compare to the S4 screenshot) |
| 7 | Benchmark pills | The Benchmark row shows the index name and its source as pills on both table views |
| 8 | Home donut | Hover dims the others, click opens the pop-up with the class and its funds, keyboard works |
| 9 | New funds | After Add data with a new fund: counts, the collapsible New funds section, funds and their transactions. After the sign-up upload: no section. Import History shows it for an in-app import and not for the sign-up one |
| 10 | Name mismatch | Sign up as Prateek, upload another person's statement: the pop-up says whose account it is and offers Add {name} as a family member. After it, the head is unchanged and has no data, the person is added, funds are on them, the Complete profile dialog appears. Later upload of the head's own statement matches the head and stores the PAN on them |
| 11 | Goals | Six goals in sign-up, the mobile screen and Profile. Select all and Clear all. An old client gets a 422 |
| 12 | Sign-up | Phone, code, name and email, email code, screen 4 with required answers and the errors, Connect accounts, import, All set, Home. Reload on each step resumes correctly, including on All set after an import |
| 13 | Email change | Back to screen 3, change the email: a new code goes to the new address, verify, the new email is stored, the old one no longer signs in |
| 14 | Login | Email and mobile, masked identity, Edit returns with the value kept, resend countdown, no Google button |
| 15 | Mobile | Under 768 px the old mobile screens render and work, including the goals step |
| 16 | Motion and accessibility | Sketches float gently and stop with reduced motion. Keyboard-only walk through sign-up |
| 17 | Rollback | Flip the `variant` in a test build and confirm the old screens return |

- [ ] The owner records pass or fail with a screenshot per row. Any fail goes back to the stage that owns it.

### Task 7.3: Rollout and close-out **[Claude]**

- [ ] The owner reviews the QA results and gives the explicit go. The owner runs the deploy guide with Claude. The orchestrator updates `session.md`, `decisions.md`, `log.md` and the delegation log (task D.1 already prepared them) and the Priority 1 item in `CLAUDE.md` is left untouched (unrelated).
- [ ] Tag `ui-s7-done`. Open items, if any, go to `DEFERRED_FEATURES.md`: layered sketches for richer motion, a shared donut ring component for Home and Mutual Funds, restyling of the screens that had no mockup (link account, re-consent gate), the optional Postgres goals-count query.


---

## Handoff slugs

`ui-s1-greeting-member`, `ui-s1-category-label`, `ui-s1-overlap-compare`, `ui-s1-member-picker`, `ui-s1-returns-toggle-labels`; `ui-s2-home-donut`, `ui-s2-new-funds`; `ui-s3-add-as-family`; `ui-s4-returns-graph`; `ui-s5-goals-six`; `ui-s6-foundations`, `ui-s6-login`, `ui-s6-signup-front`, `ui-s6-signup-back`, `ui-s6-states`; `ui-s7-staging`.
