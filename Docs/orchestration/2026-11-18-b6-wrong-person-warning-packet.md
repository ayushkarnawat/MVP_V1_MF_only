# Packet B-6: the wrong-person warning block (Antigravity, lane G-a)
**Batch B, item 2.** Plan: `Docs/superpowers/plans/2026-11-17-batch-b-journey-plan.md` (Task B-6). **Design source: `Docs/orchestration/2026-11-12-batch-b-planning-workbook.html`, section 2** (the drawings "Laptop (1280×720)" and "Phone", the "Proposed (cleaner)" frames). The workbook is the design: a deviation is a defect; if something here and the real component disagree, stop and say so.

**Your clone:** `C:\Users\Ayush\ag-b6` (branch `ag/b6-warning`, cut from `batch/b-journey` at `6c2f7c42`). Work only there. Never edit `D:\Unifolio code`. Never run a git command that changes anything (no add, commit, checkout, stash, reset, merge, push).
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, then this packet.

## What you build
When the file does not contain the person who was picked, the pop-up "X isn’t in this statement" gets an **amber warning block** between the body text and the buttons. One bold line says who the funds will be imported for; one muted line says a new family member is created if needed. The dialog gets more breathing room. Nothing else changes: title, body text, the two buttons, their labels and what they do, closing with ×, Escape and an outside click (each still discards the file) stay exactly as today. One change serves the laptop pop-up and the phone import (the same component).

## Exact strings (from the workbook drawing; do not reword)
- Bold line: `These funds will be imported for {names}.` where `{names}` is `joinNames(people)` (from `./copy`: "A", "A and B", "A, B and C").
- Bold line when `people` is empty (the one string the workbook does not draw; the orchestrator's choice): `These funds will be imported for the people in this statement.`
- Muted line: `A new family member is created if they are not already in your family.`
- Names come **only** from `people`. Never the selected member's name and never a PAN.

## Structure and measurements (workbook CSS `.dwarn2` and `.dlg.roomy`, with palette colours)
```
<div data-testid="import-for-warning" role="note"  ← the block
   class: flex items-start gap-2.5 (10px) · rounded-xl (12px) · py-2.5 px-3.5 (10px 14px) · text-[13.5px]
          bg-[var(--warn-bg)]  border border-[#FCE0B0]
  <span aria-hidden="true">!</span>     ← icon: 20px × 20px circle (h-5 w-5 rounded-full), mt-px (1px),
                                          bg-[var(--warn)], white "!" 12px bold, centered (flex items-center justify-center), shrink-0
  <div>
     <p class="font-semibold text-[var(--ui-text)]">bold line</p>          ← display block; semibold (600)
     <p class="mt-0.5 text-[12.5px] text-[#4B4B4B]">muted line</p>         ← 12.5px, 2px above
  </div>
</div>
```
- The block is passed as **children** of `PromptDialog` (it already renders children between the body and the footer). It is its own element: it must not be inside the body text node (the existing test reads the body as one exact text).
- **Spacing:** the pop-up's parts are 20px apart instead of 16px, for this dialog only. Add one optional prop to `PromptDialog`: `roomy?: boolean` (default false) that adds the class `gap-5` to `DialogContent` (its default `gap-4` is merged away by the existing `cn()`); pass `roomy` from `MemberNotInFileDialog`. Every other dialog must keep `gap-4` (a test checks `SessionExpiredDialog`).
- Width, padding (24px), radius and buttons stay as the shared dialog has them (448 px / `sm:max-w-md`, matches the drawing).

## Colours: the palette PDF wins (see the palette reference)
| Part | Value | Why |
|---|---|---|
| Block background | `var(--warn-bg)` | = palette Warning tint `#FEF3E2` (dark mode follows the token) |
| Block border | `#FCE0B0` | palette Warning border; no token exists, this hex is given here |
| Icon circle | `var(--warn)` | = palette Warning `#D97706` |
| Bold line | `var(--ui-text)` | = `#111111` |
| Muted line | `#4B4B4B` | palette "body text (non-primary)"; no token, hex given here |
The workbook drew the icon `#F59E0B` and the muted line `#6B5B3E`: those are not palette colours, so the palette values above replace them (report this in Open questions so the owner knows). Use no other hex. Dark mode: the tokens switch by themselves; the border hex stays light (the palette gives no dark border): check and say in the report how it looks only if you can; you cannot see the screen, so say so.

## Red tests (already written and committed; fixed, do not edit, weaken or delete)
`frontend/src/features/import/prompts/prompts.test.tsx`, the blocks "U5 MemberNotInFileDialog warning (Batch B, item 2)" (10 tests; 9 are red now) and "other prompts keep their spacing". Before you start run it and confirm **9 failed**. When done: all pass, and the rest of that file still passes (40 tests).

## Files you may change
`frontend/src/features/import/prompts/MemberNotInFileDialog.tsx`, `frontend/src/features/import/prompts/PromptDialog.tsx` (only the optional `roomy` prop). Anything else: stop and report.
## Do not touch
`backend/**`, `frontend/src/mobile/**`, the test file above, `components/ui/dialog.tsx`, any other prompt dialog, `copy.ts`, `package.json`.

## Checks (run from PowerShell; WSL does the work on a fast mirror of your clone)
```
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-b6 test src/features/import/prompts/prompts.test.tsx
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-b6 test src/features/import
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-b6 types
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-b6 lint src/features/import
```
(`types` is the whole project; it must end with no errors in files you touched. If it shows errors only in `LoginEntry.test.tsx` about a missing `throttle` prop, those belong to another lane and are expected.)

## Report (one block, nothing else)
Failing counts before (expect 9) and after; the exact commands and results; `git status --short` (only the two files, plus untracked docs); every decision the packet did not cover; anything you could not check (visual; dark mode); Open questions. The orchestrator screenshots your result next to the workbook drawing at 1280×720 and 390 px and sends exact differences; fix only those.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-18-b6-wrong-person-warning-packet.md (your task: B-6)
Work only in C:\Users\Ayush\ag-b6 on branch ag/b6-warning. Tests first: run the named test file and confirm 9 fail before you change anything. Never run a git command that changes anything. Do not touch backend/** or any file outside the packet's Files list.
When done, reply with the report block from the packet, nothing else.
```
