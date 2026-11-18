# Packet C-2: remove the "Assumed main manager" sentence (Antigravity, lane G-d)
**Batch C, item 17b.** Plan: `Docs/superpowers/plans/2026-11-17-batch-c-holdings-hygiene-plan.md` (Task C-2). **Design source: `Docs/orchestration/2026-11-12-batch-c-planning-workbook.html`, 17b** (the sentence goes; nothing replaces it). The workbook is the design; if it and the real component disagree, stop and say so.

**Your clone:** `C:\Users\Ayush\ag-c2` (branch `ag/c2-assumed-line`, cut from `batch/c-hygiene` at `d5922ce2`). Work only there. Never edit `D:\Unifolio code`. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this packet. (No colours or measurements are involved: this task only deletes.)

## What you change (and what stays)
Delete from `frontend/src/features/mutual-funds/allocation/FundManagerCard.tsx`: the constant `ASSUMED` (line ~16), the function `marker()` (lines ~39 to 40) and both places that render it (`{marker(group)}` in the Cards view, ~line 73, and in the Table view row, ~line 95). The sentence `Assumed main manager: none was marked for at least one fund.` then appears nowhere.
**Stays exactly as it is** (a test covers each): the manager names, rows, amounts and percentages; the Cards and Table views and their toggle; the `main_source` field in the types and in the data (do not remove it from `types.ts` or the fixtures); the "updating" message shown when a group has `main_source == null`; the single-manager behaviour; expanded fund rows. Do not tidy anything else in the file. After the deletion nothing may be left unused (`oxlint` must stay clean for the folder).
Before you finish, search `frontend/src` and `backend` once for the text `Assumed main manager` and `none was marked` and list where each still appears (expected: only inside test files, as "not shown" assertions). Do not edit those other places; report them.

## Red tests (already written and committed; fixed, do not edit)
`frontend/src/features/mutual-funds/allocation/FundManagerCard.test.tsx`: "never shows the assumed sentence, even for an assumed group (Cards view)" and "(Table view)" are red now (2 failed); the rest of the file (17 tests) passes and must still pass. Before you start run the file and confirm **2 failed**.

## Files you may change
`frontend/src/features/mutual-funds/allocation/FundManagerCard.tsx` only. Anything else: stop and report.
## Do not touch
`backend/**`, `frontend/src/mobile/**`, the test file, `types.ts`, fixtures, `package.json`.

## Checks (PowerShell)
```
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-c2 test src/features/mutual-funds/allocation
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-c2 types
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-c2 lint src/features/mutual-funds/allocation
```

## Report (one block, nothing else)
Failing counts before (expect 2) and after; exact commands and results; `git status --short` (one file, plus untracked docs); where the sentence still appears in the repo (search result); Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-c2-assumed-line-packet.md (your task: C-2)
Work only in C:\Users\Ayush\ag-c2 on branch ag/c2-assumed-line. Tests first: run the named test folder and confirm 2 fail before you change anything. Never run a git command that changes anything. Do not touch backend/** or any file outside the packet's Files list.
When done, reply with the report block from the packet, nothing else.
```
