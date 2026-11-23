# Waves 1 to 5: standing rules for every worker (Codex and Antigravity)

Read this **after** `ui-common-rules-codex.md` (backend) or `ui-common-rules-antigravity.md` (frontend). This file adds the rules of the 17 Nov 2026 program (`2026-11-17-program-execution-and-deployment-plan.html`) and **wins where they differ**.

## Who does what
- **Claude (orchestrator)** reads the plan, writes nothing a worker should write, reviews every diff, commits, merges, takes screenshots, writes deploy guides. Workers never commit, push, merge, stash, reset or check out.
- **Codex** = backend and code-heavy work. **One task at a time.** Codex also writes the red tests that Antigravity builds against.
- **Antigravity (Gemini)** = frontend only. **Up to three tasks at once**, each in its **own clone and branch**. Never `backend/**`.

## Capacity and lanes
- A plan tags each Antigravity task with a lane letter (G-a, G-b, G-c). Tasks in **different lanes of the same wave touch disjoint files** and may run together; tasks in one lane run in order. If you find you need a file outside your task's Files list, **stop and report it**; do not edit it (another lane may own it).
- Within a batch the order is: Codex or Claude first (red tests, types, fixtures, backend), then Antigravity. Do not start a packet whose "Before you start" tests do not exist yet.

## The old staging link stays untouched (program decision Q2)
`ls-staging` shares this backend and database. **Every backend change is additive only**: no field removed, renamed or changed in meaning; no route removed; response fields added with defaults. Old fields kept for the old link (for example `folio_masked`) stay and keep their tests. The only migration allowed in the whole program is Batch B's (head is 0053, B takes 0054 only if its plan says so). Do not edit any `ls-staging` configuration.

## Fixed project rules
- `Decimal`, never `float`, for money, units and NAV; decimals travel as strings. The client never adds money.
- Phone UI (`frontend/src/mobile/**`) and anything below 768 px that renders the legacy look stay unchanged.
- No real folio, name, PAN, email or phone anywhere: invented data only. Never log or commit a code, a token or a secret. No real CAS files; synthetic ones live in `Docs/CAS Files/synthetic/pdfs/` (password `MF@123`).
- GA4 and the load-times work (A4) are paused: add no analytics events and no speed work.
- No new dependency and no `package.json` or lockfile change unless the plan's task says so.
- Plain words in every user-visible string; no advice wording ("best", "should buy"); never guess a person's pronoun (use the name or "them"); no em dashes in user-visible text.

## Tests
- **Tests first, always:** write the failing test, run it, see it fail for the stated reason, then implement. The report says which tests were red first.
- **Run only the affected tests** the task names. Never the full suites. Frontend: `npx vitest run <file>`, then `npx tsc -b` and `npx oxlint <folder>` for the touched folders. Backend: `cd backend && pytest <file>::<test>`.
- Red test files written by Codex or Claude are **fixed**: Antigravity does not edit, weaken or delete them. If one looks wrong, say which and why under Open questions, and make the rest pass.

## The workbook is the design (all batches)
- Every screen, state, copy string, measurement, colour and the CAMS tutorial video **must match the batch's planning workbook** (its mockups and drawings, and the 17 Nov updates). The plan says which workbook; the orchestrator's packet quotes the exact drawing. A deviation is a defect, not a choice: if the workbook and the live code or a worker's result disagree, stop and ask the user. Mockups are artifact drawings made from reading the code, so where a drawing shows something the real component cannot do, report it instead of improvising.
- The CAMS tutorial video (Batch H) is built by **Claude only** in the chosen Look 2 style.

## Visual work (Antigravity)
- You cannot see the screen. Use only the sizes, classes, tokens and copy the packet gives, exactly. Where the packet says nothing, keep what the file does today. Colours only through the app tokens (`--ui-*`, `--pos`, `--pos-text`, `--pos-bg`); **no hex colours** unless the packet gives the token's own value.
- Every state in the packet (default, hover, focus, active, disabled, loading, empty, error, dark mode) must exist. Keyboard focus is always visible; motion respects `prefers-reduced-motion`.
- The orchestrator screenshots your result next to the mockup and sends exact differences back; fix only those.

## Before you start any task
1. Read, in order: the rules file for your lane, this file, then the packet or the plan task.
2. Run the plan's **Wave-start check** if it has not been run for this wave: confirm the files and names the task lists still exist and still look as described, and report drift before building.
3. Work only in the clone the orchestrator names.

## Report (one block, as in your lane's rules file)
Add to it: the lane letter, the files you changed (must be inside the task's list), `git status --short`, anything you could not check (visual), and Open questions. No narration.

## Token economy (owner rule, 23 Nov 2026; applies to Claude, Codex and Antigravity)
Spend as few tokens as possible without lowering quality. Tests first and verification are never traded away.
- Read only what the task needs: search first (grep or the editor's search), then open the lines that matter. Do not open a file twice, and do not re-read a file you just edited.
- Do not paste file contents, long diffs or full test output into your report or your thinking: give counts, names and the one line that shows a failure.
- Run only the tests, types and lint the task names, on the touched folders (never the full suites unless the packet says so).
- No narration, no plan restating, no summary of the packet back to the orchestrator. The report block is the whole reply.
- Keep new files and tests as small as the contract allows: no extra helpers, comments or cases the packet did not ask for.
- If something is unclear, stop and put it under Open questions instead of exploring widely.
