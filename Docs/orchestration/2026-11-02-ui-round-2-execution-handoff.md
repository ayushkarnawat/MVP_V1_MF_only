# Handoff: executing the UI round 2 and sign-up / sign-in redesign (updated 3 Nov 2026), for the orchestrating Claude session

Same owner, same repo, same branch (`leapswitch-redesign` of `ayushkarnawat/MVP_V1_MF_only`). The planning is finished, every question except Q71 is answered, and the implementation plan is written. **The team changed on 3 Nov 2026: there is no manager. The owner and Claude run every stage. Claude is the orchestrator. Codex does all backend work. Antigravity (Gemini) does all frontend work.** Read this file top to bottom first.

---

## 0. The state in one minute

- **What was decided and planned:** nine change requests (round 2), the sign-up, sign-in and onboarding redesign from two PDFs, six life goals (the one approved database change), and the round 3 amendments. One implementation plan of **8 stages (S0 to S7) and 54 tasks**, each task tagged **[Codex]**, **[Antigravity]** or **[Claude]**.
- **What is built of this plan:** nothing yet.
- **What is built underneath it:** change-requests Runs 1 to 6 (incl. Head of Family, migrations `0050` to `0052`, Alembic head `0052`) are on `leapswitch-redesign` at `6d7c84f`. **Run 7 (frontend: logos, one heading per card, green button token, benchmark explanation and info icon) is still open.** Its Antigravity handoff is `cr-r7-logo-pass-handoff.md`, rules `cr-r7-common-rules.md`.
- **Order:** start now. The manager builds Run 7 in parallel. Hold list (wait for Run 7): task 1.5, tasks 4.2 to 4.4, all of S6.
- **Questions open:** one. **Q71** (the plan's "Open question"): should the old email address get the change notice when the email is changed on Back during sign-up? Needed only at S6 Task 6.11.
- **Where to work and push:** only the `wt/docs` worktree on `leapswitch-redesign`. Pull (`--ff-only`) before every commit. No deploy and no product-code push before the owner's go at S7.

---

## 1. Where everything is

All paths are in the repo on `leapswitch-redesign`. If a file below is missing, ask the owner. They placed it manually.

| What | Path | Use |
|---|---|---|
| **The implementation plan (execute this)** | `Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md` | Run sheet, rules, decisions, method, then S0 to S7 task by task |
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

## 3. The job, the eight stages and the two lanes

Each stage is one run of the loop with its own start commit, gate and tag. The plan's run sheet has the full table and the "Team: who does what" section has the lane rules. In short:

| Stage | What | Codex (backend) | Antigravity (frontend) |
|---|---|---|---|
| **S0** | Start commit, re-read cited code, baselines, set up both lanes, write S1 handoffs | none | none |
| **S1** | Greeting (1), category (2), overlap compare link (4), member pop-up (7), Returns toggle labels (9) | none | 1.1 to 1.5 |
| **S2** | Home donut (6), new funds after an upload (8) | 2.1, 2.3, 2.4 | 2.2, 2.5 |
| **S3** | Name mismatch adds a family member (5) | 3.1, 3.2 | 3.3, 3.4, 3.5 |
| **S4** | Actual XIRR graph, toggle up, benchmark pills (3) | 4.1 | 4.2, 4.3, 4.4 |
| **S5** | Six life goals, the one migration `0053` | 5.1, 5.2 | 5.3 |
| **S6** | Sign-up and sign-in redesign, 5 phases | none (Task 6.11 may need one small backend flag if Q71 says so) | 6.1 to 6.15 |
| **D.1** | Documentation update | Claude | Claude |
| **S7** | Staging QA and rollout, one deploy | Claude with the owner | Claude with the owner |

Claude does every [Claude] task: the handoffs, the contract (example payloads) for each backend field, verification, commits, tags, reviews, the deploy guide.

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
8. **Commits and pushes:** only in the `wt/docs` worktree, on `leapswitch-redesign` (no side branch), by the orchestrator, prefix `ui-s<N>:` (`docs:` for documentation), a local tag `ui-s<N>-done` after each stage's gate. **Never push to `main` or `feat/leapswitch-staging`. Never force-push.** No deploy and no product-code push before the owner's explicit go at S7. Never commit statement PDFs or any CAS file.
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

The plan's Method section has the nine points. The sequence for each stage:

1. **Start.** Record the start commit. Sync Antigravity's Windows clone to it. For a stage with backend tasks (S2 to S5) also make a fresh Codex clone (`git clone --branch leapswitch-redesign file://<repo> ~/ui-s<N>`, branch `codex/ui-s<N>`) and run the cheap probe (one Codex dispatch that writes a one-line file and tries `git add` and `git commit`). If Git writes fail there, Claude does every staging and commit.
2. **Write the handoff documents** at `Docs/orchestration/<slug>-handoff.md` (slugs at the end of the plan). Mark the worker at the top. For a backend task, include the exact response shape and an example payload, because the frontend worker builds against it. Skeleton:

```markdown
# Handoff: <slug>
**Status:** OPEN | IN_PROGRESS | REVIEW | DONE
**Worker:** Codex | Antigravity
**Rules:** Docs/orchestration/ui-common-rules-codex.md | ui-common-rules-antigravity.md
**Parent plan:** Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md, Stage S<N>, Task <N.M>
**Spec:** Docs/orchestration/2026-11-02-auth-redesign-plan.html, section <id>

## Task
Concrete and bounded. Point at the plan's task for files, interfaces and tests. Do not restate the plan.

## Contract (backend fields the other lane depends on)
Field names, types, example payload, error codes and messages.

## Constraints
Reference the plan's Global Constraints and the rules file. Do not copy them.

## Approaches considered and rejected
## Open questions
What the worker should flag back and not guess.
```

3. **Give the owner the prompt for each worker.** Both rules files end with a paste-ready prompt. The owner pastes it into Codex or Antigravity and pastes the worker's report back. Backend and frontend tasks of the same stage may run at the same time. Codex may also be dispatched from this session with `Agent(subagent_type: "codex:codex-rescue", run_in_background: true, ...)` where the plugin is available.
4. **Verify every report yourself.** `git diff --stat`, read the changed files, re-run the touched tests, copy the verified files into the repo, commit with `ui-s<N>:`. For the two lanes together, check the real endpoint against the frontend's fixture at the stage gate.
5. **Stage checks** from the stage's section, then the full backend and frontend suites, `npm run build`, `npm run lint`.
6. **Review gate (mandatory):** `/codex:adversarial-review` over `<start commit>..HEAD`, for backend and frontend commits alike, dispatched through `codex:codex-rescue` with `run_in_background: true`, never `isolation: "worktree"`. The owner types `/codex:status <id>` and `/codex:result <id>` and pastes the output back. Findings are never applied automatically. Claude fixes findings only under the skill's "Review-loop fix authorship" rules, then a scoped re-review. S3 and S5 get a second round.
7. **Close the stage:** tag `ui-s<N>-done`, one line per decision in `Docs/orchestration/delegation-log.md`, update `session.md`.

---

## 7. What you need from the owner before and during the work

| Need | When | Why |
|---|---|---|
| Run 7 on the branch (the manager builds it) | Before the hold-list tasks (1.5, 4.2 to 4.4, S6) | They reuse its logo, green token, info icon and benchmark text |
| The answer to **Q71** | Before S6 task 6.11 | Whether the old email gets a notice during sign-up |
| Antigravity's Windows clone path, and confirmation that the check script runs | S0 task 0.4 | It was `C:\\Users\\Dell` is this machine; ask which folder is the separate Antigravity clone |
| The Home and benchmark timing baselines | S0 task 0.3 | The change-requests handoff says they were never measured. S1 and S2 must stay within 10% of them |
| **The eight sketch images and the logo** as crops of the two PDFs, in `frontend/public/illustrations/auth/` | Before S6 Phase 1 (task 6.5) | The PDFs are not in the repo. S1 to S5 do not need them |
| **One real statement** to upload under a different typed name | S3 gate | The real-file check. Real statements are never committed |
| The synthetic statements | S2 and S3 gates | In the repo: `Docs/CAS Files/synthetic/pdfs/` (password `MF@123`). The harness scripts are `portfolio_synthetic_gate.py`, `fund_synthetic_gate.py`, `home_synthetic_gate.py` |
| Local Postgres | S3 and S5 | `docker compose up postgres`, then `TEST_DATABASE_URL`. Needed for the functional tests and the migration up, down, up |
| The owner's review of the documentation diff | Task D.1 | PRD-02 FR-7 and FR-7a conflict with the required screen 4 answers. The owner knows and decided it, the PRD still has to be updated |
| The owner's explicit go to push and deploy | S7 | Repo rule |

Check these are still true for the owner's machine: backend tests run in WSL with `backend/.venv/bin/python -m pytest`; frontend checks run in WSL only through `cr-r6-fe-check.sh`; do not run `npm` from Windows PowerShell.

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
2. Tell the owner in under 15 lines what you understood and what differs from this handoff.
3. Check where Run 7 stands (`git log --oneline -10`), but do not build it.
4. When the owner says go, run **S0**, then the first batch (see the orchestrator handoff section 4). Hand the owner the worker prompts from the rules files.
5. Work and push only from `wt/docs`.

---

## 10. If the plan or the planning page needs a change

- The owner may change an answer or add a request. Do exactly what is asked. Change the implementation plan (a markdown file, edit it directly) and, if the decision belongs on the page, the planning page.
- **The planning page is one self-contained HTML file** (images and the diagram library are embedded). To edit it, use the split and rebuild helper in section 4.4 of the earlier handoff (`plan_tool.py split` and `build`), edit the small `index.html`, rebuild, and render it in Playwright to check the diagrams and mockups. The scripts that generated the round 2 and round 3 sections from source were **not** kept in the repo, so edit the HTML directly.
- The page was published as a private artifact from another account. If the owner wants it republished from your account, publish a new artifact from the HTML (the body from `<title>`, without the embedded diagram library, images through the `files` map, as the earlier handoff describes).
- **A lesson from the planning session:** chain build and publish steps so that a failed build stops everything (`set -e`). Once a failed build was followed by a publish of a stale copy. Always check that a file contains what you expect before you deliver it.
- Keep the plan and the page consistent. If a decision changes, update both, and say which sections changed.

---

## 11. Things not to do

- Do not build Run 7 and do not start the hold-list tasks before it is on the branch.
- Do not push product code or deploy before the owner's go at S7. Never push to `main` or `feat/leapswitch-staging`, never force-push.
- Do not change the Inception performance graph, the mobile screens, today's import screens or any answered decision.
- Do not add screens, labels or options that the plan or the PDFs do not have. Offer them instead.
- Do not let a worker run a git command that changes anything, and do not let Antigravity touch `backend/**` or Codex touch `frontend/**`.
- Do not delegate architecture, multi-file interface design, migrations' text, final assembly or commits.
- Do not skip the review gate, and never apply a finding automatically.
- Do not switch models.
- Do not commit statement PDFs, factsheets or any real CAS file.
