# UI redesign: execution plan v2 (26 Oct 2026)

Supersedes the run order and the single-worker assumption of `2026-10-24-ui-redesign-orchestrator-handoff.md` sections 6 and 7 where they differ; everything else in that document (waves, decisions, the 88-run catalogue as a task list, the per-run procedure) still stands. Written by the orchestrator after the owner's instructions of 26 Oct. Owner decisions are in `ui-redesign-decisions-register.md` section A (entries 10 to 15).

## 1. Principles (unchanged by the speed-up)
- Every task keeps: a written packet, an independent worker, **my independent verification** (scope check, tests, differential and bug-injection checks for logic; tsc, lint, build, guard tests and a visual-parity pass against the mockup for screens), a recorded orchestrator record and register entries. Batching changes how many tasks a worker receives at once, not whether each is checked.
- The owner is not pulled back into design loops. Sources are already signed off; packets are derived from them (section 4). The owner sees a short status per packet and the register of decisions taken (veto afterwards), and is asked only for a true conflict between signed-off sources, once per page group.
- Nothing is deployed to production; nothing but the integration branch `leapswitch-redesign` receives merges; `feat/leapswitch-staging` and `main` are never pushed.

## 2. Lanes
| Lane | Who runs it | What | Concurrency |
|---|---|---|---|
| **C** | Codex, run by the owner (manual relay, unchanged) | Backend logic runs, one adversarial review per backend PR, and any front-end task no Gemini model can do | **One session at a time** (the owner's Codex limit) |
| **G** | Gemini in Antigravity, run by the owner | All front-end runs, including the hard ones with the strongest available model | One session to start; a second lane only if the pilot quality is good and my verification keeps up |
| **O** | Claude (me) | Packets, handoffs, verification, Sonnet reviews, Opus at the named final gates, commits, merges into `leapswitch-redesign` after review and green CI | Always |
Escalation rule: a front-end task goes to Codex only after the strongest Gemini model has failed it twice against a corrective packet from me.
Each lane works in its **own git worktree** (a branch can be checked out in one place only), under `~/wt/<branch>` on WSL's own disk; the main checkout stays on the docs branch. The front-end worktrees share one `node_modules` through a symlink (same lockfile).

## 3. Work map and order
### Lane C (Codex), 7 implementation sessions, each followed by my verification
| Session | Runs | Branch | Why this order |
|---|---|---|---|
| C1 | Portfolio backend: instrument-type allocation, summary, daily series (plan tasks 1 to 3, inside catalogue runs PF1 and PF2) | `feat/portfolio-backend` | Portfolio is the first page to preview; these are logic-heavy backend tasks hidden in the page plan |
| C2 | HB4 (worth-a-look, benchmark recommendation) + HB5 (routes, synthetic gate) | `feat/home-snapshot` (merge `feat/mf-backend` in first: needs the Smallcap 250 index) | Unblocks the Home preview and gives the **real fixtures** the Home front end is built against |
| C3 | NB1 to NB3 (news) | `feat/home-news` (after MB1 is on the integration branch: migration 0044 chains after 0045) | Home's news section |
| C4 | IB1 + IB2 | `feat/individual-fund-page` | MB4 needs IB1 |
| C5 | IB3 + IB4 | same | |
| C6 | IB5 + MB4 | `feat/individual-fund-page`, `feat/mf-backend` | Finishes the fund page and the Mutual Funds Overlap tab |
| C7 | PB1 + PB2 | `feat/planning-backend` | Planning is late in the page order |
Plus: one Codex adversarial review per backend PR (#10 Home, #12 Mutual Funds, Individual Fund, Planning, News, Portfolio backend) = 6, and the small cleanup run **MX1** (can be me). Profile's one backend line (`created_at` on `/auth/me`) I do myself.
Manual owner steps inside these runs (read-only checks on the VM): the news dry run (NB1 T1) and the staging timing scripts at the integration wave.

### Lane G (Gemini), 18 packets, each verified by me
| Packets | Runs | Branch |
|---|---|---|
| G1 | K1 + K2 (shared UI kit) — **the pilot** | `feat/ui-kit` |
| G2 to G3 | Portfolio front end (plan tasks 4 to 8) | `feat/portfolio-page` |
| G4 to G6 | Home (HF1 to HF5) | `feat/home-frontend` (split from `feat/home-snapshot`) |
| G7 to G11 | Mutual Funds (MF1 to MF15; MF14 needs IF and MB4 merged) | the plan's `feat/mf-*` branches |
| G12 to G13 | Individual Fund (IF1 to IF5) | `feat/individual-fund-frontend` |
| G14 to G15 | Planning (PL1 to PL4) | `feat/planning-frontend` (split from the backend branch) |
| G16 to G18 | Profile (PR2 to PR10; PR9 only on the owner's explicit go) | `feat/profile` |
Front-end branch splits (register C50): the Home and Planning plans put front-end and back-end work on one branch; two lanes cannot share a branch, so the front-end parts get their own branches (front-end files only live under `frontend/`, so the later merges are clean).
Order of pages follows the plan (Portfolio, Home, Mutual Funds, Individual Fund, Planning, Profile). The Home front end waits for the **real** Home fixtures (C2); the Mutual Funds front end can start on fixtures generated now from the finished backend work (MB1 to MB3).

### Integration and release (me, owner for the manual parts)
`L1` second link (owner's manual DNS and server steps; start the lead-time items early), `I1` all routes live, `I2` performance gates on staging (Home 1.5 s, month detail 1 s, benchmark windows 3 s, fund page tiers, planning), `I3` docs batch (ask first) and the deploy guide, `I4` fixes, `Q1` to `Q4` your QA findings, `M1` merge staging into the redesign branch with the old-code-on-new-schema check, `M2` final adversarial review (Codex) and Opus review of the whole branch, then the cutover.

## 4. The packet factory (how Gemini gets a perfect plan without new owner loops)
1. **Sources and precedence** (higher wins; a clash is logged in the register, not asked): signed-off mockups (the 24 Oct mockup PDF and `2026-10-24-desktop-preview-all-pages.html`) > the owner's decision documents and the register > the page's design, layout, design-system and TDD documents > the implementation plan > older documents. A conflict **between the owner's own signed-off sources** that the precedence cannot settle is asked once per page group.
2. **Everything a packet names is checked against the code before it is written:** every file path exists (or is marked "create"), every import and symbol is grepped and its real signature copied in, every backend type comes from a fixture generated by the real service (JSON saved under `Docs/orchestration/api-fixtures/<page>/`), every copy string and token is taken verbatim from the source. The code wins over the plan; differences go in the register.
3. **Packet template (v1):** goal and non-goals; preconditions with the exact baseline commands and their expected output; branch and worktree; **file map** (create / modify / do not touch); verified interfaces; fixtures; per-component spec (props, states, structure with `data-testid`, ARIA, tokens, verbatim copy, mockup reference); **tests first, written out in full for the critical ones and as given/when/then with exact selectors for the rest**; ordered steps with a checkpoint command after each; the Gemini guardrail block; acceptance (commands and expected outputs); stop conditions; the report template. Packets bundle runs of one page group; each bundled run keeps its own file allow-list so I can verify and commit them separately.
4. **Gemini guardrail block** (grows after the pilot): scope is the file map only; run the checkpoint command after every step and paste the real output; never edit tests to make them pass; stop and report instead of improvising when something differs from the packet; no new dependency; no refactors outside the packet; keep every user-visible string exactly as written.
5. **My verification of a Gemini packet:** git scope diff against the file map; `tsc -b`, `oxlint` on touched files, vitest on the affected files plus the page's guard tests (the interactivity rule, one rupee value per fund per page, tokens only), `npm run build`; for logic components an injected-bug check on the tests; then the visual-parity pass: the page running locally on the synthetic household next to its mockup in the browser pane, light and dark, 1280 and 1024 px, with the differences written into the run record. The worker's own report is data, not proof.
6. **The pilot (G1, the UI kit)** also tests the environment and the guardrails: step 0 proves Antigravity can edit the worktree, run `npm test` through WSL and report real output; the kit is mechanical, so failures show the model's habits cheaply. After it I record what Gemini does well and badly and tighten the template before G2.

## 5. Contracts, so front end and back end can move together
- A page's front end is built on typed fixtures; the fixture is the contract. Until the route exists the fixture comes from the backend spec; once a route (or a service) exists I generate the fixture from the real code on the synthetic household and save it.
- Backend verification includes "does the real payload still match the fixture the front end was built on"; a mismatch is fixed on whichever side is wrong before the integration wave, not at it.
- Integration (I1, I2) connects every page to the real routes and runs the timing and parity gates.

## 6. Previews before everything is finished
- **Local, per page, now:** at each page's last run I start the local environment (the QA recipe in `2026-10-25-local-qa-environment.md`), open the page beside its mockup, and give the owner screenshots; the owner can also run one command to click through it. No deploy needed.
- **On the new link:** `L1` is started early because DNS has lead time; once it exists, `deploy-redesign.sh` puts the integration branch there so the owner can look at finished pages (Portfolio, then Home, ...) on the real stack while the rest is built. The old link and `ls-staging` stay untouched; the VM needs its unused images cleaned first (about 2.6 GB) for builds.

## 7. Token policy
- **Codex** is used only for backend logic runs, one adversarial review per backend PR, and the escalation path; session count above is the whole budget (about 13 sessions including reviews).
- **Front-end reviews** are mine: a Sonnet review per front-end PR and Opus at the named gates (shell done; MF6, MF15, PR4, PR6, PR10, M2). Gemini is the executor for all front end.
- I keep packets lean by generating fixtures and verified interfaces mechanically rather than prose.

## 8. Estimate (mine, not measured; assumes the owner's current availability)
About 13 Codex sessions and 18 Gemini packets plus integration. At the pace of this session the sequential route is about two working weeks to a preview; with batching, the two lanes running together and Gemini on the front end, about one week to a full preview on the new link, then your QA. The critical path is the Gemini lane (18 packets) and my verification, not Codex.

## 9. Risks and the answer to each
| Risk | Answer |
|---|---|
| Gemini ignores a rule or invents an API | Verified interfaces and fixtures in the packet; checkpoint commands with pasted output; my verification; escalation rule; pilot first |
| Front-end built on a shape the backend later changes | Fixtures from real code; contract check in backend verification |
| Packet writing becomes my bottleneck | Lanes stay one packet ahead; packets are generated from verified facts; Sonnet subagents draft fixtures and interface lists |
| Antigravity cannot run the Linux-only `node_modules` | Worktrees live on WSL; the pilot's step 0 settles whether it opens them through WSL or runs commands through `wsl.exe` |
| Branch collisions | One branch per worktree; front-end splits (C50); the main checkout stays on the docs branch |
| Quality loss from bulk | Same checks per task; register entries; Opus at the named gates; the pilot gates the 43 page runs |

## 10. Next steps (in order)
1. Merge #9 (done 26 Oct) and #11 (after CI), sync the integration branch.
2. Create the worktrees and the shared `node_modules` link.
3. Write the pilot packet G1 (kit) and the Codex session C1 (Portfolio backend) so both lanes start together.
4. Owner: start the `L1` manual lead-time steps; run C1 on Codex and G1 on Antigravity; paste both reports.
