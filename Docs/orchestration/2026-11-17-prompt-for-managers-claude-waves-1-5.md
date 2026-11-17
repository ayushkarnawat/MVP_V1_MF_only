# Prompt for the manager's Claude: run waves 1 to 5

Give this to the manager's Claude as the first message of a fresh session in the repo (branch `leapswitch-redesign`). It starts the whole process. Everything it needs is in the repo; nothing else has to be pasted.

---

You are the orchestrator (Claude) for the Unifolio MF MVP release program that was planned on 17 Nov 2026. Wave 0 (decisions and one implementation plan per batch) is finished. You run waves 1 to 5 and the four staging milestones, using the Claude (orchestrator) plus Codex (backend and code-heavy) plus Antigravity/Gemini (frontend, from detailed packets) method this project always uses.

## Read first, in this order

1. `AGENTS.md`, then `CLAUDE.md` (the non-negotiables; the Skill Observation and Model Orchestration rules apply: invoke the `task-observer` skill at the start and the `model-orchestration` skill before delegating).
2. `Docs/orchestration/2026-11-17-wave-0-handoff-for-managers-claude.md` (the map: what is decided, the plan files, what was deliberately not written, open items).
3. `Docs/orchestration/2026-11-17-program-execution-and-deployment-plan.html` (waves, milestones, branches, shared-file order, deploy rules, QA, production gate).
4. `Docs/orchestration/wave-common-rules.md`, then `ui-common-rules-codex.md` (for Codex tasks) or `ui-common-rules-antigravity.md` (for Antigravity tasks). `wave-common-rules.md` wins where they differ.
5. The plans in `Docs/superpowers/plans/2026-11-17-batch-*.md` for the wave you are starting, and the batch workbook each plan names as its spec.

## Non-negotiable rules for this program

- **Plans, then packets.** The plans are written. The detailed Antigravity packets and Codex handoffs are **not**: you write each one in detail at the moment its task starts, from the plan, the workbook's drawings and the repo as it is that day. A packet gives Antigravity measurements, states, exact copy, tokens, an allowed-files list and the red tests already written. Antigravity cannot see the screen: you screenshot its result next to the mockup and send back exact differences.
- **Wave-start check.** Every plan has one. Before building a batch, confirm each file and name the plan lists still exists and looks as described (plans were written up front, and the 16 Nov NAV fix already made two plans stale). Report drift to the user before building.
- **Capacity.** One Codex task at a time. Up to three Antigravity frontend-only tasks at once, each in its own clone and branch, only on disjoint files. Within a batch Codex or you go first (red tests, backend), then Antigravity. You never hand off design, integration or the final check; workers never commit, push, merge, stash, reset or check out.
- **The workbooks are the design.** Every screen, state, copy string, measurement and colour, and the CAMS tutorial video, must match the batch's planning workbook (the plan names it). A deviation is a defect: if a drawing and the live code disagree, stop and ask the user. The CAMS tutorial video (Batch H, task H-5) is built by Claude only, in the chosen Look 2 style, from the user's real recordings.
- **Tests first.** Failing test, see it fail for the stated reason, then implement. Run only the affected tests the plan names, never the full suites (the plans' final tasks name the full runs that are allowed).
- **Review.** An adversarial review of each handoff, then one whole-batch review before merging. Findings are never applied automatically; each reproduced finding becomes a red test first.
- **The old staging link (`ls-staging`) stays untouched and shares the backend and database.** Every backend change is additive: no field removed, renamed or changed in meaning. The only migration in the whole program is Batch B's (head is 0053; take the next free number at build time).
- **Review gate for numbers (Batch A).** Nothing that changes an XIRR, a rank or a category average is built until the user has approved the written fix proposal, one at a time.
- **Paused, do not touch:** GA4 (Batch G) and A4 (load times). No analytics events, no speed work. No phone code changes.
- **No real data anywhere.** Invented households only; no real folio, PAN, name, email, phone or CAS file in any evidence, video, fixture or log. Synthetic statements live in `Docs/CAS Files/synthetic/pdfs/`.
- **Commits, pushes, deploys, outward-facing documents:** only on the user's (Aditi's) explicit word. You never run a deploy; the deployer (you with the user's go, or the user) runs it from the written guide.

## Order of work

**Wave 1 (start here).** Branches `batch/b-journey`, `batch/c-hygiene`, `batch/a-numbers`, `batch/l-audit`, each cut from `leapswitch-redesign`.
- Batch B (`2026-11-17-batch-b-journey-plan.md`) and Batch C (`...batch-c-holdings-hygiene-plan.md`): Codex does the backend and all red tests; Antigravity builds the screens from your detailed packets; you orchestrate. B and C ship together in **M1**. Batch B's emails are given to Codex, not Antigravity (Antigravity may not edit `backend/**`); the plan flags this.
- Batch A (`...batch-a-numbers-plan.md`), Part 1 only: the fixtures, independent calculators, recount scripts and Excel export scripts on synthetic data; read-only; ships nothing. You write the fix proposals; the user decides.
- Batch L (`...batch-l-disclosures-audit-plan.md`): read-only audit of the November portfolio-disclosure round; no deploy; its timing follows the fund houses (first pass about day 10 to 12 of the month).
- Then **M1**: freeze with tag `m1-rc`, write the M1 deploy guide (pre-flight: free disk, a `:previous` backend image tagged **before** the build, an on-demand backup, the migration head; deploy outside the job windows 05:40 to 06:35, 10:30, 14:00 to 14:15; quick verify; the stored-analytics recompute for the category merge), then a deploy record. Use `Docs/orchestration/2026-11-03-release-branch-model.md` and the earlier deploy guides as the model.

**Wave 2.** A's approved fixes (A-FIX tasks), then Batch D, and Batch H part 1 (the link and pop-up; a placeholder video is fine). Ships in **M2** with the stored-result rebuild.

**Wave 3.** Batch K (search, one release) and Batch F stage 1 (the section list and anchors). K needs F's list first (`frontend/src/lib/pageSections.ts`).

**Wave 4.** Batch E, then Batch F's visible rail. Completes **M3** (with wave 3).

**Wave 5.** Batch I (PDF export) and Batch H part 2 (floating checklist, final video). **M4**.

**After M4.** Write the combined QA checklist (built from the program plan's cross-batch regression list and each batch's own checklist), run the single QA round with the user's team, fix defects (failing test first, then fix, then a patch deploy), then production once, only through the production gate in the program plan.

## What to do first

1. Do the reading above. Invoke `task-observer`, then `model-orchestration`.
2. For wave 1, run each plan's wave-start check and report any drift to the user in a short list.
3. Create the lane worktrees and branches, write the first handoffs and the first packets in detail, commit the red tests first (on the user's word), and start Codex on Batch B's first backend task and Antigravity on the first screen packet once its red tests exist.
4. Keep `Docs/orchestration/delegation-log.md` (one line per delegation) and `session.md` current. Ask the user before assuming on anything a plan or workbook marks as open or "needs your input"; if a PRD, ADR or schema seems to conflict with a plan, stop and say so.

When a wave's batches are merged and checked, tell the user which milestone is next and ask for the go to freeze and write its deploy guide.
