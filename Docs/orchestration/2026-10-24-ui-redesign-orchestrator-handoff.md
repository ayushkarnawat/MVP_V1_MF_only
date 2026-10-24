# UI redesign — orchestrator handoff (for the other Claude account)

**Written:** 2026-10-24 (rewritten after the owner's go on the doc edits). **For:** the Claude Code session on the owner's other account, which is the **orchestrator and reviewer**, with **Codex as the default implementer** — the same method as Sub-project 1, Sub-project 2 and the analytics enhancement. Visual overview of the plan and the finished app: https://claude.ai/artifact/QDpUv5wj5uLPsMNqgcHocb

## 0. Before this session starts (owner)

This file, the plans and the deploy files exist only in the working tree of the branch `leapswitch-redesign` (uncommitted). If the other account works in the **same folder**, nothing else is needed. If it works in a **different checkout**, the owner must first commit and push `leapswitch-redesign` with exactly these paths:
`deploy/leapswitch/{Caddyfile,docker-compose.yml,.env.example,README.md,scripts/deploy-redesign.sh}`, `Docs/orchestration/2026-10-24-ui-redesign-*.md`, `Docs/superpowers/plans/2026-10-24-*.md`, and the edited existing docs (`Docs/orchestration/2026-10-22-nav-shell-contract-v1.md`, `…2026-10-23-mutual-funds-page-design.md`, `…2026-10-23-shell-functionality-backend-spec.md`, `Docs/PRDs/PRD-06-Mutual-Funds-Page-Redesign.md`, `Docs/superpowers/specs/2026-10-24-mutual-funds-tdd-backend-flow.md`, and the edited plans under `Docs/superpowers/plans/2026-10-23-*.md`). `Docs/Web app UI mockups MFs.pdf` (untracked) should be committed too. Suggested message: `docs: UI redesign execution strategy, plans, handoff, preview-link deploy files`.

## 1. Mission

Build the redesigned **desktop** web app (shell with left sidebar, Home, Portfolio/Investments, Mutual Funds with 7 tabs, Individual Fund page, Planning, Profile) on branch **`leapswitch-redesign`**, previewed at **`ls-redesign.unifolio.in`** (frontend only; same API, VM, database, worker and cron as `ls-staging.unifolio.in`). When the owner approves, `leapswitch-redesign` is merged into `feat/leapswitch-staging`, which must keep working. Visual source of truth: `Docs/Web app UI mockups MFs.pdf` and the HTML mockups named in the plans. **Mobile is out of scope and untouched.** Total: **88 Codex runs** (catalogue in §6), about 13 orchestrator sessions.

## 2. Read first, in this order (the work is already planned; do not re-derive)

1. `AGENTS.md`, `CLAUDE.md`. Invoke the `task-observer` skill at session start and `model-orchestration` before any delegation.
2. **`Docs/orchestration/2026-10-24-ui-redesign-execution-strategy.md`** — plan of record: backend change map, gaps G1–G14 and their decisions, waves, run count.
3. `Docs/orchestration/2026-10-24-ui-redesign-manual-steps.md` (owner-only steps) and `Docs/superpowers/plans/2026-10-24-deploy-redesign-plan.md` (second link, redeploy loop, merge-back rehearsal and cutover).
4. `Docs/orchestration/2026-10-22-nav-shell-contract-v1.md` (**v1.6**).
5. The plans in `Docs/superpowers/plans/`: `2026-10-23-` `nav-shell-plan`, `shell-pr1-router-registry-sidebar`, `shell-pr2-scope-wrappers-switch`, `home-backend-plan`, `home-frontend-plan`, `news-plan`, `portfolio-home-page-implementation`, `profile-plan`, `individual-fund-backend-plan`, `individual-fund-frontend-plan`, `planning-scenarios-backend-plan`, `planning-scenarios-frontend-plan`; and `2026-10-24-` `mutual-funds-backend-plan`, `mutual-funds-frontend-plan`, `shared-ui-kit-plan`. Read a plan fully only when its run is next; read its headers and Review Focus now.
6. Mutual Funds sources behind those plans (read before reviewing or dispatching any Mutual Funds run): `Docs/PRDs/PRD-06-Mutual-Funds-Page-Redesign.md`; `Docs/orchestration/2026-10-23-mutual-funds-page-design.md` (§11 is the design philosophy); `Docs/superpowers/specs/2026-10-24-mutual-funds-{restructure-relayout,tdd-backend-flow}.md`; `Docs/orchestration/2026-10-24-mutual-funds-{redesign-handoff,cross-cutting-audit-findings}.md`; `…2026-10-23-mutual-funds-page-decisions.html`; the nine mockups `2026-10-23-mutual-funds-{overview,performance}-mockup.html` and `2026-10-24-mutual-funds-{allocation,holdings,transactions,other-analytics,overlap,individual-fund}-mockup.html` (each has its own data-source mapping, interaction spec and changelog at the bottom).
7. `.claude/skills/model-orchestration/references/` (delegation rules, handoff-doc template, escalation triggers, no-Codex fallback). Worked example of a Codex handoff doc: `Docs/orchestration/individual-fund-handoff.md`.

## 3. Rules from the owner (all in force)

- **Git model.** `leapswitch-redesign` exists and is checked out. Every task/page gets its own branch cut from it (names are in each plan); commit there (explicit paths, one commit per task or run, orchestrator only — Codex's sandbox cannot write `.git`). You may **push a task branch and open a PR targeting `leapswitch-redesign`** with `gh`. **Never push to `feat/leapswitch-staging` or `main`, never commit on them, never merge a PR without the owner's word.** The final PR `leapswitch-redesign` → `feat/leapswitch-staging` is opened by the owner. Commit messages end with the attribution line the harness gives you.
- **A "go" covers its wave only.** Wave 0 ends with a presentation to the owner; nothing is built before "go". Answering your questions is not a go.
- **Ask before editing any existing doc** (PRDs, schema doc, `decisions.md`, the contract, existing plans). Batch the asks per wave and show the diff. New files are fine. The doc edits agreed on 24 Oct are already applied; do not redo them.
- **Token budget.** The owner is low on usage: batched runs, Sonnet-class orchestrator by default, Codex implements, **Opus only on the runs marked "+ Opus" in §6 and only after the owner's one blanket approval** (ask once, at the end of Wave 0). Lean prompts that point at handoff docs. Keep every review gate. Stop at a run boundary when your own usage is low and leave the session file current.
- **Affected tests only** per run (the files the plan lists); full backend and frontend suites once at a wave end and before the final merge.
- **TDD; `Decimal` never `float`; mobile untouched; existing screens are wrapped, not edited** (exceptions: Scenarios is restructured under Planning; Dashboard/History/Analytics stop being routed once the Mutual Funds tabs go live, but their files stay until a post-merge cleanup).
- **The mockups/PDF win over old docs;** still tell the owner about conflicts. If a PRD, ADR or the schema seems to conflict with what you are about to build, stop and say so.
- **Additive backend only** (one backend serves both links and the mobile app): new endpoints, new nullable columns, new enum values, new JSON keys; never remove or reshape an existing field. A change that is not additive is stopped and flagged. Latest migration is `0043`; pre-assigned **0044 = news**, **0045 = the four new benchmark indices**; run `alembic heads` first and stop if a number is taken.
- **Synthetic CAS only** on the VM (`Docs/CAS Files/synthetic/pdfs/`, password `MF@123`). Real CAS files, factsheets, `.env` and secrets are never committed; never use credentials pasted in chat.
- **One shared backend rule on the VM.** While the preview exists, backend/worker deploys run only from the redesign worktree (`deploy-redesign.sh --full`); after every backend deploy, check that the old link still looks unchanged.
- **Review gate (mandatory, every run).** You verify independently (`git status`, `git diff --stat`, the run's affected tests), then dispatch `/codex:adversarial-review` through `codex:codex-rescue` (never `isolation: worktree`). **Tell the owner up front that each review result needs a manual relay** (`/codex:status <id>`, `/codex:result <id>`). Fix findings per "Review-loop fix authorship"; never auto-apply; never poll a Codex job; apply the stopping heuristic for low-severity correctness-safe remainders.
- **Every Codex run ends with a written report** (see §7 step 2). You paste its summary into the run's handoff doc and set Status `DONE` only after the gate.
- If Codex is unavailable or its quota is exhausted: `no-codex-fallback.md` (you build the run; a Sonnet subagent reviews).
- Environment: the repo sits on a WSL `/mnt/c` mount; a Codex dispatch's sandbox can only write under its own `cwd`. Follow `delegation-rules.md`: the first dispatch of a session runs the three-step probe (write a file, `git add`, `git commit`) and expect git to fail in the sandbox; clone into a native-filesystem directory if source writes fail.

## 4. State file

Create and keep current **`Docs/orchestration/ui-redesign-session.md`** (overwritten each session, short): current wave and run, branch heads and what is committed/pushed/open as PRs, decisions taken, open owner questions, next exact step. Read it first in every later session. Append permanent narrative to `log.md` only at wave ends.

## 5. Owner/manager manual steps (you cannot do these; remind at the right time)

| When | Step | Who |
|---|---|---|
| Wave 1 | Everything in `Docs/orchestration/2026-10-24-ui-redesign-manual-steps.md`: DNS record, Google OAuth origin, VM worktree, shared `.env` lines, first deploy | Owner |
| SSH times out but HTTPS works | CloudPe Security Group IP allowlist (the staging plan's Troubleshooting section) | Owner |
| Every Codex review | Relay `/codex:status` and `/codex:result` | Owner |
| Each task PR | Merge into `leapswitch-redesign` after your gate | Owner |
| After each page or backend wave | Redeploy the preview (frontend: `deploy-redesign.sh`; backend: fresh `backup.sh`, then `--full`, `alembic upgrade head`) and look at the page | Owner |
| Wave 6 | Browser QA on the preview link; send findings as a list | Owner/manager |
| Wave 7 | Tag `pre-redesign-staging`, push, open the final PR, approvals from `@ayushkarnawat` and `@aditi-unifolio`, merge, `deploy.sh`, remove the preview | Owner |

## 6. Waves and the run catalogue (88 runs)

Notation: **+O** = extra Opus review (blanket approval needed); **CL** = done directly by you. Task numbers refer to the plan named at the top of each block. Run IDs match the artifact. Do the runs of a block in order; blocks follow the dependency order given in each wave.

**Wave 0 (you, no Codex) — do this first, then stop for the owner's "go".**
1. Read §2. Check the branch is `leapswitch-redesign`, `git status` shows only the expected files.
2. Review the four 24 Oct plans against their sources; fix anything wrong inline and tell the owner. Anything that needs an edit to an *existing* doc is a proposal.
3. Create `ui-redesign-session.md` with the run catalogue as a checklist.
4. Present to the owner in one message: what you found, the run order for Wave 1–2, the blanket Opus-approval request, and ask for "go" for Waves 1–2.

**Wave 1 — second link (1 run).** `L1` (CL with the owner): deploy plan T3 and the manual-steps doc; verify the preview serves, sign-in works, CORS is clean and the old link is unchanged.

**Wave 2 — shell, 13 runs (dependency for every page frontend).** Branches `feat/shell-nav` then `feat/shell-nav-switch` (stacked).
- Shell PR1 (`shell-pr1-router-registry-sidebar`): `S1.1` T1+T2 · `S1.2` T3 **+O** · `S1.3` T4 · `S1.4` T5+T6 · `S1.5` T7 (CL) · `S1.6` Final **+O**.
- Shell PR2 (`shell-pr2-scope-wrappers-switch`): `S2.1` T1 · `S2.2` T2 · `S2.3` T3 · `S2.4` T4 **+O** · `S2.5` T5 (CL) · `S2.6` T6 (CL) · `S2.7` Final **+O**.

**Wave 2b — backend, 19 runs (no shell dependency; run alongside Wave 2, in this order).**
- Home backend (`home-backend-plan`, branch `feat/home-snapshot`): `HB1` T1 **+O** (single `compute_holdings(scheme_ids, allow_stale_today)` change; everyone else consumes it) · `HB2` T2+T4+T5 · `HB3` T6+T7+T8 · `HB4` T9+T10 (T10 needs MB1) · `HB5` T11+T12 (T3 was removed; T13 is done; T14 docs are asked at a wave end).
- Mutual Funds backend (`2026-10-24-mutual-funds-backend-plan`, branch `feat/mf-backend`; BT1 first): `MB1` BT1 · `MB2` BT2+BT3 · `MB3` BT4 **+O** · `MB4` BT5 (needs `IB1`). BT6 is folded into `I1`/`I2`.
- Individual Fund backend (`individual-fund-backend-plan`, branch `feat/individual-fund-page`): `IB1` T2+T3 (T1 is a consumer of `HB1`) · `IB2` T4–T6 · `IB3` T7–T9 · `IB4` T10–T12 · `IB5` T13+T14.
- Planning backend (`planning-scenarios-backend-plan`): `PB1` T1–T3 · `PB2` T4–T7 (T5 needs `HB1`).
- News (`news-plan`, branch `feat/home-news`, migration 0044): `NB1` T1–T4 · `NB2` T5+T6 · `NB3` T7–T9. News is shown directly; keep the credit text.

**Wave 3 — shared UI kit, 2 runs (`shared-ui-kit-plan`, branch `feat/ui-kit`).** `K1` T1 · `K2` T2. Merges before any page frontend that imports it.

**Wave 4 — pages (frontend), 43 runs.** Order: Portfolio → Home → Mutual Funds → Individual Fund → Planning → Profile. One branch per page; the route file flips to `live` in the page's last run; after each page the owner redeploys the preview and looks at it.
- Portfolio (`portfolio-home-page-implementation`): `PF1` T1+T2 · `PF2` T3+T4 · `PF3` T5+T6 · `PF4` T7+T8.
- Home (`home-frontend-plan`): `HF1` T1–T3 (T4 moved to the kit) · `HF2` T5+T6 · `HF3` T7+T8 · `HF4` T9+T10 · `HF5` T11+T12.
- Mutual Funds (`2026-10-24-mutual-funds-frontend-plan`): `MF1` T1 · `MF2` T2+T3 · `MF3` T4 · `MF4` T5 · `MF5` T6 · `MF6` T7 **+O** · `MF7` T8 · `MF8` T9 · `MF9` T10 · `MF10` T11 · `MF11` T12 · `MF12` T13 · `MF13` T14 · `MF14` T15 (needs `IF1`, `MB4`) · `MF15` T16 **+O**.
- Individual Fund (`individual-fund-frontend-plan`): `IF1` T1+T4 · `IF2` T5–T7 · `IF3` T8+T9 · `IF4` T10+T11 · `IF5` T12+T13.
- Planning (`planning-scenarios-frontend-plan`): `PL1` T1–T3 · `PL2` T4+T5 · `PL3` T6+T7 · `PL4` T8–T10.
- Profile (`profile-plan`; Opus review pre-approved by the owner for R4, R6 and the final gate): `PR1` T1 · `PR2` T2+T3 · `PR3` T4 · `PR4` T5 **+O** · `PR5` T6 · `PR6` T7 **+O** · `PR7` T8 (CL) · `PR8` T9 (CL) · `PR9` T10 (CL, only on the owner's explicit go) · `PR10` Final **+O**.

**Wave 5 — integration, 4 runs** (deploy plan T6; MF backend BT6). `I1` all routes live, temporaries removed, full suites · `I2` performance gates (Home ≤ 1.5 s, History month detail ≤ 1 s, benchmark recompute within budget) · `I3` docs batch (ask first) and the staging deploy guide (terminal labels A/B/C) (CL) · `I4` integration fixes.

**Wave 6 — QA fixes, 4 runs.** `Q1`–`Q4` from the owner's findings on the preview link.

**Wave 7 — merge, 2 runs** (deploy plan T6/T7). `M1` merge `feat/leapswitch-staging` into `leapswitch-redesign`, full suites, old-code-on-new-schema check, number comparison between links, mobile smoke test · `M2` final Codex adversarial + Opus review of the whole branch **+O**, hand the owner the PR and the cutover guide.

Totals: 1 + 13 + 19 + 2 + 43 + 4 + 4 + 2 = **88**.

## 7. Per-run procedure (identical to Sub-project 1/2; no exceptions)

1. **Pre-flight.** Read the run's plan sections and the files they name; confirm paths and names against the code (the code wins over the plan; tell the owner of differences). Pull `leapswitch-redesign`; merge `origin/feat/leapswitch-staging` into it at the start of each session if it moved (merge, never rebase).
2. **Handoff doc.** Write `Docs/orchestration/ui-redesign-<run-id>-<slug>-handoff.md` from `handoff-doc-template.md`: Status OPEN; goal; exact files; failing tests first; exact test commands; the do-not-touch list; the plan's Review Focus lines that apply; and a mandatory **Report** section that Codex fills in at the end with: (a) files changed, (b) every test command run and its exact pass/fail counts, (c) deviations from the plan and why, (d) open questions, (e) anything it could not do or verify. Append one line to `Docs/orchestration/delegation-log.md`.
3. **Dispatch.** `Agent(subagent_type: "codex:codex-rescue", run_in_background: true, description: "<run id + label>", prompt: "Read <handoff path>; implement it; run the listed tests; fill in the Report section; do not touch git")`. Wait for the notification.
4. **Verify independently.** `git status`, `git diff --stat` (scope matches the handoff), the run's affected tests; full suite only if shared code was touched or this run closes a gate.
5. **Review gate.** `/codex:adversarial-review` via `codex:codex-rescue`; tell the owner a manual relay is coming; triage; fix directly if small (per the skill) or re-dispatch; scoped re-review. For **+O** runs, then the Opus review.
5b. **Visual parity (the last run of every page, and each shell PR).** After the review gate, run the page locally on the synthetic household and open it next to its mockup (named in the plan header) in the browser pane, light and dark, at 1280 and 1024 px. Write the list of differences into the run's handoff doc (layout, colours, type, spacing, states, copy, hover and click behaviour). Fix them before DONE, or log them for a QA run with the owner's agreement. Ignore the mockup's own sidebar, top bar and avatar (the shell draws them). The reference for how the whole app should look is `Docs/orchestration/2026-10-24-desktop-preview-all-pages.html` (the same file is the "app after all 88 runs" tab of the roadmap artifact).
6. **Commit and record.** Commit on the task branch (explicit paths); push the branch and open the PR into `leapswitch-redesign` at the end of the last run of a branch (or earlier if the owner asked); set the handoff DONE with the Report pasted in; update `delegation-log.md` and `ui-redesign-session.md`. Tell the owner in a few lines: run id, what changed, test counts, review verdict, next run.

## 8. Opening prompt to paste into the other Claude

```
You are the orchestrator/reviewer for the Unifolio desktop UI redesign, using the same Claude-Codex method as Sub-project 1, Sub-project 2 and the analytics enhancement. Codex is the default implementer; you write the Codex handoff docs, verify, run the mandatory adversarial-review gate, and do all git commits.

Start now:
1. Invoke the task-observer skill, then the model-orchestration skill.
2. Read, in full and in this order: AGENTS.md, CLAUDE.md, then Docs/orchestration/2026-10-24-ui-redesign-orchestrator-handoff.md (your instructions, rules and the 88-run catalogue; follow them exactly), then Docs/orchestration/2026-10-24-ui-redesign-execution-strategy.md (the plan of record).
3. The branch leapswitch-redesign already exists and is checked out; do not recreate it. Execute Wave 0 exactly as written in the handoff section 6: review the plans, create Docs/orchestration/ui-redesign-session.md, then STOP and present everything to me in one message, including the blanket Opus-approval request. Do not build anything until I say "go".

Standing rules: never push to feat/leapswitch-staging or main; task branches may be pushed and opened as PRs into leapswitch-redesign, and no PR is merged without my word; backend changes are additive only; affected tests only; mobile untouched; the mockup PDF wins over old docs but tell me about conflicts; do not edit any existing doc without asking; every Codex run ends with a written report in its handoff doc; I am low on usage, so keep token use lean (batched runs, Sonnet default, Opus only on the runs marked +O and only after my approval) and batch your questions into one message per wave.
```

## 9. Decisions already taken (do not re-ask)

Branch `leapswitch-redesign`; link `ls-redesign.unifolio.in` (read from dictation — the owner confirms if either name is wrong); PRs from task branches target `leapswitch-redesign`; the final merge into staging is fast-forward-only after merging staging into the redesign branch; sidebar active row = underline; Profile = plan defaults; Home uses stored prices, no new table, the staging measurement is done (see `decisions.md`; do not ask the manager to re-run it); News is shown directly; fund-house logos = `SchemeLogo` / `lib/amcLogos.ts` as in the old review screen, initials as fallback; Individual Fund page tabs = Overview, Overlap, Insights (comparison is a second state, no URL); the Mutual Funds docs' two "deferred" items (full CoverageBanner port, full ValuationSection edge states) are **in scope**; Growth/IDCW and the PDF-export button stay out; the shared UI kit owns charts, tokens and formatting; migrations 0044 (news) and 0045 (benchmark indices); benchmark windows are stored beside the old payload and are 1Y / 3Y / 5Y / Since inception.

Decided 24 Oct (owner, second pass): a fund name or row opens the individual fund page everywhere a page lists funds (replaces the Mutual Funds mockup's interim FundDetailModal; Home's fund links switch on by themselves when the route goes live); the individual fund page has three tabs, Overview, Overlap Analysis and Insights; each page keeps the surface style of its own mockup (no restyle); the shell's active row is a 2 px underline; Investments and Mutual Funds mockups are light only, dark is derived from the palette and checked in the parity step; the mockups' own sidebar and top bar are ignored; a visual-parity step ends every page; the Mutual Funds Overview fund table gets a Today's change column and sortable headers (Mutual Funds plan task 4) and Home's "View all by day's change" opens it sorted.

## 10. Open items for the owner

None blocking Wave 0. Worth a quick confirmation when you present: the two names above; the blanket Opus approval; and whether `PR9` (retiring the old Profile) should wait until the merge rehearsal.
