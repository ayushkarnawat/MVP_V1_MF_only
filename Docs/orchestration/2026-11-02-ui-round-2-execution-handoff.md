# Handoff: executing the UI round 2 and sign-up / sign-in redesign (2 Nov 2026), for the manager's Claude account

Written at the end of the planning session, for the Claude account that **executes** this work. **Same owner, same repo, same branch** (`leapswitch-redesign` of `ayushkarnawat/MVP_V1_MF_only`). Nothing in the app has been built. The planning is finished, every question is answered, and the implementation plan is written. Your job is to read, get familiar, then run the plan with the Claude-Codex method: **you are the orchestrator, Codex is the worker.** Read this file top to bottom first.

---

## 0. The state in one minute

- **What was decided and planned:** nine change requests from the owner (round 2), the sign-up, sign-in and onboarding redesign from two PDFs, six life goals (the one approved database change), and a set of amendments (round 3). All are in the planning page and turned into one step-by-step implementation plan of **8 stages (S0 to S7) and 54 tasks**.
- **What is built:** nothing. Not one line of product code.
- **Questions open:** none. Q1 to Q70 are answered (Q31 and Q32 were withdrawn, Q55 was superseded by Q59). The six goal codes are approved. The decisions table at the end of the planning page is the single list of what was decided.
- **What must happen before S0:** the **whole change-requests plan** (`Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md`, Runs 1 to 7, including Head of Family and migration 0050) is executed, merged and deployed (Q51). Check it: `git tag -l "cr-run-*"` should show `cr-run-7-done`, and `cd backend && alembic heads` should show `0050` or later. If it is not done, do not start S0. Tell the owner.
- **Pushes:** the plan files are already on the branch (the owner pushed them). **No product code is pushed and nothing is deployed until the owner gives an explicit go at S7.** Commits are local, by the orchestrator only.

---

## 1. Where everything is

All paths are in the repo on `leapswitch-redesign`. If a file below is missing, ask the owner. They placed it manually.

| What | Path | Use |
|---|---|---|
| **The implementation plan (execute this)** | `Docs/superpowers/plans/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md` | Run sheet, rules, decisions, method, then S0 to S7 task by task |
| **The planning page (the spec)** | `Docs/orchestration/2026-11-02-auth-redesign-plan.html` | Mockups, flows, copy tables, every decision. Self-contained, about 4 MB, opens offline in any browser. **Render it** (Playwright is available) and look at the mockups, not only the text |
| Earlier planning handoff | `Docs/orchestration/2026-11-02-auth-redesign-handoff.md` | History of the sign-up and sign-in work (rules, code map, PDF notes). **It stops at version 7 of the page.** Where it disagrees with the plan or the page's decisions table, the plan and the table win. Section 4.4 has the helper script for editing the HTML |
| The change-requests plan (runs first) | `Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md`, with `2026-10-31-execution-handoff.md`, `2026-10-31-readiness-review.md`, `Docs/orchestration/2026-11-01-orchestrator-handoff-change-requests.md` | The method this work copies, and the code it must land on first |
| The method (rules for Claude and Codex) | `.claude/skills/model-orchestration/SKILL.md` and `references/` (`delegation-rules.md`, `handoff-doc-template.md`, `escalation-triggers.md`, `no-codex-fallback.md`) | How to delegate, the handoff doc format, the review gate |
| Project rules | `CLAUDE.md`, `AGENTS.md` | Read first, every session, as the repo requires |
| The two PDFs | **not in the repo** | The sign-up and sign-in mockups. The owner holds them. The eight sketches are needed at S6 Phase 1 (section 7) |
| The published planning page | `https://claude.ai/artifact/2XXVC1pKJyTSZJxzMzG1aF` | **Private to the previous account.** You probably cannot open or update it. **The committed HTML is the source of truth** |

---

## 2. Reading order (do this before anything else)

1. `CLAUDE.md` and `AGENTS.md`. Note the non-negotiables (test first, `Decimal` never `float`, the stack is decided) and the Session State pointer.
2. This handoff, all of it.
3. `.claude/skills/model-orchestration/SKILL.md` and `references/handoff-doc-template.md` and `delegation-rules.md`.
4. **The implementation plan**, all of it. Part 1 (rules, decisions, method) twice if needed. Then Part 2 stage by stage.
5. **The planning page**: render it in a browser and read at least these sections: the summary, `flows`, the nine screens (`l1` to `s6`), `goals`, then the round 2 sections `c1` to `c9` and `c3ui` (every state of the returns graph, drawn), then **Round 3** (`amend`: A to F), `exec`, and the decisions tables. The table of contents is the left sidebar.
6. The earlier planning handoff, for the history only.
7. Skim the code the plan cites (the plan lists names and files). The plan was written at commit `bd8cd19`. **S0 re-checks every cited name at the real start commit.**
8. Check the state: the change-requests tags, `alembic heads`, the full test suites, `git log --oneline -20`.

Then tell the owner in **under 15 lines** what you understood, what is ready and what you need (section 9). Do not change anything yet.

---

## 3. The job and the eight stages

Each stage is one run of the Claude-Codex loop with its own start commit, Codex clone, gate and tag. The plan's run sheet has the full table. In short:

| Stage | What | Needs |
|---|---|---|
| **S0** | Record the start commit, re-read cited code, baselines, Codex clone, probe, write the S1 handoffs | The change-requests plan done |
| **S1** | Quick fixes: greeting follows the member (1), category label (2), overlap pairs link to the comparison (4), member pop-up before Add data (7), Returns toggle renamed with info icons (9). Tasks 1.1 to 1.5 may run in parallel | S0 |
| **S2** | Interactive Home donut with a funds pop-up (6), new funds and their transactions after an in-app upload (8) | S1 |
| **S3** | Name mismatch adds a family member and never renames the account holder (5). The largest change in the import service | S2 |
| **S4** | Actual XIRR graph as grouped bars, toggle moved above the period buttons, benchmark shown as pills (3) | S1 task 1.5 |
| **S5** | The six life goals, the one migration, the schema, Profile, the mobile goals screen, the queries that read goals | S4 |
| **S6** | The sign-up and sign-in redesign, 5 phases, with the round 3 amendments | S3 and S5 |
| **D.1** | Documentation update by Claude, the owner reviews the diff | S6 |
| **S7** | Staging QA and rollout, one deploy | S6, D.1 and the owner's explicit go |

---

## 4. The owner's rules and working style (read this twice)

These came from the owner over the whole planning session. They apply to you.

1. **UI only**, with two approved backend exceptions: the goals change (S5), and the small additive response fields the plan names. **Nothing else on the backend.**
2. **Do exactly what is asked, nothing more.** If a message lists several changes, do only those. Change only the screen or file named. Offer extensions, do not make them. If something needs a new screen that is not in the PDFs or the plan, ask first. The owner interrupted work twice in the planning session because it went beyond the request.
3. **Redesign only the screens that are in the PDFs.** Today's statement import screens stay as they are.
4. **Do not change an answered decision.** If a task seems to need one changed, stop and ask. (The owner did change several answers during planning, always explicitly.)
5. **The existing Inception performance graph is not changed.** Its style, layout and behaviour stay. The only change next to it is the toggle row above its period buttons (S4).
6. **Plain writing**, in documents and on screen: short sentences, no em-dashes, no "not X but Y" constructions, no invented scare-quoted labels, no jargon in the UI ("TRI", "proxy" and "fallback" never appear on screen).
7. **The model is never switched without the owner asking.** Opus only on the three named triggers in `references/escalation-triggers.md`, and only with the owner's approval.
8. **Commits:** local, by the orchestrator, on `leapswitch-redesign`, prefix `ui-s<N>:` for stage work (`docs:` for pure documentation), a local tag `ui-s<N>-done` after each stage's gate. **Never push to `main` or `feat/leapswitch-staging`. Never force-push.** No product push and no deploy until the owner's explicit go at S7. Never commit statement PDFs or any CAS file.
9. **Never run on staging:** `clean-db.sh`, `restore.sh`, `rollback.sh`, any deploy script, or any write, except at S7 with the owner's go. Never add `--allow-nav-writes`. Never stop a running recompute. Never edit files on the VM. (From the change-requests handoff; re-read its section 6 for the full list.)
10. The owner decides fast and gives short answers ("A", "B", "yes"). Keep your questions short, give a recommendation, and number your options.

---

## 5. The decisions that shape the code (the plan's table has the rest)

- Greeting: head's first name in the family view, the selected member's first name in a member view (Q29).
- Category column: strip every prefix before the first dash (Q30).
- Overlap pairs: the Combined Weight column is replaced by `Overlap comparison` with a View more link to a new route `/portfolio/mutual-funds/overlap/compare/:fundA/:fundB`. `combinedWeight()` stays in the code because the Key insights sentence uses it (Q33, Q34).
- Add data and Add Investment: in the family view a pop-up asks which member, nobody pre-selected, Continue disabled until chosen. The header dropdown stays (Q43, Q44).
- Returns toggle: `Model Portfolio Returns` and `Actual XIRR`, with info icons. Internal values stay `inception` and `current` (Q48 to Q50).
- Actual XIRR graph: **grouped bars**, one pair per period (1Y, 3Y, 5Y, Since first investment), each bar one table cell, from the response the table already loads. No new route, no new query. No period buttons. Designed states for not held, no benchmark, loading, error (Q52 to Q60).
- Benchmark: shown as pills (index name and source), which needs one new field `benchmark_label` on the returns response (Q57, Q58).
- Home donut: hover dims, click opens a pop-up with the class, its funds and shares, from a new `funds` field on the Home allocation response (Q41, Q42).
- New funds after an upload: **existing users adding data inside the app only, never for the sign-up upload.** All new funds listed, in a collapsible section. A new fund is a scheme the member held nothing of before the import. Each fund shows the invested amount, the latest transaction date and its transactions (20 per fund, then View all in Import History) (Q45 to Q47, Q69, Q70).
- Name mismatch: the pop-up says whose account it is and offers `Add {name} as a family member` or `Upload a different file`. **The account holder is never renamed and gets no one else's PAN.** No third link. Several people in the file: same pop-up and flow, the others go through today's people-found step (Q35 to Q39).
- Goals: six codes (`wealth_creation`, `retirement`, `childrens_education`, `buy_home`, `financial_freedom`, `tax_planning`), one to six allowed, the All of it shortcut stays, the old `primary_goal` column and its type are dropped, desktop screen 4 requires both answers with no Skip, and has a Select all (Q13 B, Q13b B, Q67, Q68 A, codes approved).
- Auth screens: one split card, a centred 360 px form block, a fixed top bar and bottom row, gentle float on the sketches that stops with reduced motion, login 1 headline lower and left-aligned (Q61, Q62).
- Screen 3 on Back: both fields editable. A changed email goes through the **existing** `requestContactChange` and `verifyContactChange` (they are already in `AuthContext`), and the old email is replaced (Q65, Q66).
- Connect accounts to All set: Step 5 of 5, today's import screens with no step bar, All set as Done, resume on All set when an import is complete (Q7, Q63, Q64).

---

## 6. How to run a stage (the loop, concretely)

The plan's Method section has the full nine points. The practical sequence for each stage:

1. **Start.** Record the start commit. If the repo is on a non-native mount, clone it at that commit into a fresh native directory (`git clone --branch leapswitch-redesign file://<repo> ~/ui-s<N>`) with a throwaway branch `codex/ui-s<N>`. Run the **cheap probe**: one Codex dispatch that writes a one-line file, `git add`s it and `git commit`s it. If Git writes fail there, Codex implements and self-checks and **you** do every staging, commit and merge.
2. **Write the handoff documents** for the stage's tasks, at `Docs/orchestration/<slug>-handoff.md` (the slugs are listed at the end of the plan). Use this skeleton (the repo's template):

```markdown
# Handoff: <slug>
**Status:** OPEN | IN_PROGRESS | REVIEW | DONE
**Parent plan:** Docs/superpowers/plans/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md, Stage S<N>, Task <N.M>
**Spec:** Docs/orchestration/2026-11-02-auth-redesign-plan.html, section <id>

## Task
What Codex builds, concrete and bounded. Point at the plan's task for files, interfaces and tests. Do not restate the plan.

## Constraints
The rules that apply (Decimal not float, test first, UI only, the Inception graph is not changed, mobile unchanged ...). Reference the plan's Global Constraints, do not copy them.

## Approaches considered and rejected
The nuance a prompt summary would lose (for example: why the new-funds list is not shown for the sign-up upload).

## Open questions
What Codex should flag back and not guess. (For example: "if the chart cannot draw a dash for a missing value, stop and report".)
```

3. **Dispatch Codex** with `Agent(subagent_type: "codex:codex-rescue", run_in_background: true, description: "<short label>", prompt: "...")`. `description` is required. The prompt **refers to the handoff by path**. Use this shape:

```text
You are the worker in a Claude-Codex loop. Work only in this clone: <path>, branch codex/ui-s<N>.
Read, in this order: AGENTS.md, then Docs/orchestration/<slug>-handoff.md, then the task it points to in
Docs/superpowers/plans/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md.
Rules: test first. Write the failing tests named in the task, run them and show that they fail for the stated reason,
then implement the stated signatures, then run the task's verify command. Do not change files outside the task's list
without saying why. Do not run git add or git commit if the probe showed Git writes fail. Do not touch the existing
Inception performance graph, mobile screens, or any answered decision. If something in the plan does not match the code,
stop and report it. Do not guess.
Report: files changed, test names added, commands run with their results, and anything you were unsure about.
```

   Parallel dispatch (N calls in one block) only for tasks the plan marks as sharing no files.
4. **Verify every result yourself.** `git diff --stat`, read the changed files, re-run the touched tests, then commit with `ui-s<N>:`. If an agent's notice is missing or contradicts the repo, check `git log` and the tests directly. Never trust a self-report alone.
5. **Stage checks** from the stage's section, then the full backend and frontend suites, `npm run build`, `npm run lint`.
6. **Review gate (mandatory):** `/codex:adversarial-review` over `<start commit>..HEAD`, dispatched through `codex:codex-rescue` with `run_in_background: true`, **never `isolation: "worktree"`**. The wrapper only forwards, so **the owner has to type `/codex:status <id>` and `/codex:result <id>` and paste the output back to you.** Tell the owner this each time. Findings are never applied automatically. A verdict that contradicts a direct read of the cited lines is re-dispatched. Fix findings yourself only under the "Review-loop fix authorship" rules in the skill, then run a scoped re-review. S3 and S5 get a second scoped round.
7. **Close the stage:** tag `ui-s<N>-done`, add one line to `Docs/orchestration/delegation-log.md` per decision (and per handoff status change), update `session.md`.

---

## 7. What you need from the owner and the manager before and during the work

| Need | When | Why |
|---|---|---|
| Confirmation that the change-requests plan is executed, merged and deployed, and the start commit | Before S0 | Q51 and Q40. Head of Family changes how the account holder is found, which S3 and S6 depend on |
| The Home and benchmark timing baselines | S0 task 0.3 | The change-requests handoff says they were never measured. S1 and S2 must stay within 10% of them |
| **The eight sketch images and the logo** as crops of the two PDFs, in `frontend/public/illustrations/auth/` | Before S6 Phase 1 (task 6.5) | The PDFs are not in the repo. S1 to S5 do not need them |
| **One real statement** to upload under a different typed name | S3 gate | The real-file check. Real statements are never committed |
| The synthetic statements | S2 and S3 gates | In the repo: `Docs/CAS Files/synthetic/pdfs/` (password `MF@123`). The harness scripts are `portfolio_synthetic_gate.py`, `fund_synthetic_gate.py`, `home_synthetic_gate.py` |
| Local Postgres | S3 and S5 | `docker compose up postgres`, then `TEST_DATABASE_URL`. Needed for the functional tests and the migration up, down, up |
| The owner's review of the documentation diff | Task D.1 | PRD-02 FR-7 and FR-7a conflict with the required screen 4 answers. The owner knows and decided it, the PRD still has to be updated |
| The owner's explicit go to push and deploy | S7 | Repo rule |

From the earlier handoff, check these are still true for the manager's machine: backend tests run in WSL with `backend/.venv/bin/python -m pytest`; frontend checks run in WSL only; do not run `npm` from Windows PowerShell.

---

## 8. Things in the plan that are deliberately left for you to decide at the start of a task

The plan flags each of these. Decide, record it in the delegation log, and tell the owner only if it changes a decision.

- **S1 task 1.3:** how the new compare page gets its fund context for `ComparisonState` (it takes a `FundPageContext`). Read `features/individual-fund/OverlapPage.tsx` and reuse its way of building the context.
- **S2 task 2.3:** whether redemptions in the same statement are netted off the invested amount. Default: not netted. The invested types are purchase, SIP purchase and switch-in.
- **S2 task 2.4:** where the upload surface is stored in the import session (the parse route already reads the `x-upload-surface` header). Add it to the session dict if it is not stored.
- **S2 task 2.5:** which component hosts the result after confirm (read `ImportFlow.tsx` and `useImportOrchestration.tsx` first).
- **S4 task 4.4:** whether `GroupedBarChart` can draw a dash for a missing value. If not, add an **optional** prop with its own tests and no change to existing behaviour.
- **S6 task 6.14:** the resume check for All set uses `GET /imports/history`. Confirm it is the simpler read.
- **After Head of Family (S0 task 0.2):** every place the plan says "the self member" or `_self_member`.

---

## 9. What to do first, in order

1. Do the reading in section 2. Do not change anything.
2. Reply to the owner in under 15 lines: what you understood (the job, the 8 stages, the rules), what is ready, and what you found that differs from this handoff (especially the change-requests state and anything that moved since `bd8cd19`).
3. Ask the owner for: the start commit and the confirmation that the change-requests plan is deployed; the sketch images and the real statement (they can come later, see section 7); and whether the Codex plugin is installed and working on the manager's machine (`codex:codex-rescue`). If it is not, follow `references/no-codex-fallback.md` (ask once, record the answer).
4. When the owner says go, run **S0**, then the stages in order.

---

## 10. If the plan or the planning page needs a change

- The owner may change an answer or add a request. Do exactly what is asked. Change the implementation plan (a markdown file, edit it directly) and, if the decision belongs on the page, the planning page.
- **The planning page is one self-contained HTML file** (images and the diagram library are embedded). To edit it, use the split and rebuild helper in section 4.4 of the earlier handoff (`plan_tool.py split` and `build`), edit the small `index.html`, rebuild, and render it in Playwright to check the diagrams and mockups. The scripts that generated the round 2 and round 3 sections from source were **not** kept in the repo, so edit the HTML directly.
- The page was published as a private artifact from another account. If the owner wants it republished from your account, publish a new artifact from the HTML (the body from `<title>`, without the embedded diagram library, images through the `files` map, as the earlier handoff describes).
- **A lesson from the planning session:** chain build and publish steps so that a failed build stops everything (`set -e`). Once a failed build was followed by a publish of a stale copy. Always check that a file contains what you expect before you deliver it.
- Keep the plan and the page consistent. If a decision changes, update both, and say which sections changed.

---

## 11. Things not to do

- Do not start S0 before the change-requests plan is done.
- Do not push product code or deploy before the owner's go at S7.
- Do not change the Inception performance graph, the mobile screens, today's import screens or any answered decision.
- Do not add screens, labels or options that the plan or the PDFs do not have. Offer them instead.
- Do not delegate architecture, multi-file interface design, migrations, final assembly or commits to Codex.
- Do not skip the review gate, and never apply a finding automatically.
- Do not switch models.
- Do not commit statement PDFs, factsheets or any real CAS file.
