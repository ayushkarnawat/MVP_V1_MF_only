# Packet C-9: the member list and the view after an import (Antigravity, lane G-a, after B-6 or in a free slot)
**Batch C, item 17d.** Plan: `Docs/superpowers/plans/2026-11-17-batch-c-holdings-hygiene-plan.md` (Task C-9). **Design source: `Docs/orchestration/2026-11-12-batch-c-planning-workbook.html`, section 5**: "Which view after an import: every case (Q12)" (the table of six cases), "The one exception: the wrong-person import", and the screens After the import. The workbook is the design; if it and the real code disagree, stop and say so. **This task changes behaviour, not looks: no copy, layout or colour changes anywhere.**

**Your clone:** `C:\Users\Ayush\ag-c9` (branch `ag/c9-import-landing`, cut from `batch/c-hygiene`). Work only there. Never edit `D:\Unifolio code`. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this packet.

## The behaviour (decided; the workbook's six cases)
When an import finishes, the Add data page, **before** it navigates back to Mutual Funds:
1. waits for the fresh household member list (a small request) so the drop-down already has any new member;
2. if the file was a **wrong-person import** (the user answered the "isn't in this statement" pop-up with "Import for these people") **and exactly one person was imported**: lands on **that person** (new or already in the family);
3. otherwise, if the user was **viewing one member** and the household **grew** (the fresh list is longer than the list before the import): lands on **Family Combined**;
4. otherwise the view **stays** exactly as it was (a member stays that member; Family Combined stays Family Combined; a one-person household stays);
5. if the refresh fails, the page navigates anyway and the view stays where it was;
6. a person id the fresh list does not contain is ignored (the normal rule applies).
The import note and the navigation state it travels in are unchanged.

## What to build (six small changes)
1. **`shell/nav/importDoneTarget.ts`**: add `export function isImportDoneState(state: unknown): boolean`: true when `state` is a non-null object that has the key `importNotice` (any value, `null` and `undefined` included); false for anything else (`{}`, `null`, `undefined`, strings, numbers, other keys). ImportWrapper already writes `{ importNotice, importNoticeUser }` into the history state when an import ends.
2. **`shell/scope/ScopeProvider.tsx`**:
   - `loadMembers` returns `Promise<ScopeMember[] | null>`: the list it applied, or `null` if the request failed, the provider went inactive, or a newer request replaced this one (the existing stale-answer check). `refreshMembers` returns that value (`scopeTypes.ts` already allows it; do not edit it).
   - Read the navigation `state` with `useLocation()`. In the pathname effect, when `isImportDoneState(state)` is true **skip the reset for that navigation** (do not call `shouldResetScope` for it, and do not queue it in `requests.current.moves`), but still update `previousPath`. Every other navigation behaves exactly as today. **Why:** `/import` has no sidebar row, so leaving it for Mutual Funds counts as a move between rows and today resets a household of two or more to Family Combined, which would undo cases 2 to 4.
3. **`features/import/importNotice.ts`**: add `export interface ImportOutcome { landOnPersonId?: string }` (type only).
4. **`features/import/useImportOrchestration.tsx`** and **`ImportFlow.tsx`**: `onDone` becomes `(notice, outcome?: ImportOutcome) => void`. Keep a ref `memberNotInFileAnswered`: set true when `handleHostAction` receives `{ kind: "acknowledge", code: "member_not_in_file" }`; set false in `upload()` and `cancelImport()` (a new file never inherits it). When the confirm result arrives: if the ref is true **and `result.people.length === 1`**, call `onDone(notice, { landOnPersonId: result.people[0].member_id })`; **in every other case call `onDone(notice)` with exactly one argument** (existing tests assert one-argument calls). The "already imported" branch stays `onDone({ text: "This statement was already imported" })`.
5. **`shell/wrappers/ImportWrapper.tsx`**: take `refreshMembers`, `setMember`, `setAggregate` from `useScope()`. Keep a ref to the latest `members` and `viewMode` (updated every render) and read it when `onDone` runs. New `onDone(notice, outcome)`: `const before = membersRef.current.length`; `const fresh = await Promise.resolve(refreshMembers()).catch(() => null)`; if `fresh` is an array: if `outcome?.landOnPersonId` is in `fresh` call `setMember(it)`; else if `before > 0 && fresh.length > before && viewModeRef.current === "member"` call `setAggregate()`; then `navigate(...)` **exactly as today** (same target, `replace: true`, same state object). Never throw; call it with `void`.
6. Nothing else. Do not edit `resetRule.ts`, `scopeTypes.ts`, any prompt component, `PromptHost.tsx`, or any phone file.

## Red tests (already written and committed; fixed, do not edit, weaken or delete)
**25 fail now.** Run these and confirm **25 failed** before you start:
`src/features/import/ImportFlow.landing.test.tsx` (2), `src/shell/wrappers/ImportWrapper.test.tsx` (9), `src/shell/scope/ScopeProvider.test.tsx` (5), `src/shell/nav/importDoneState.test.ts` (9 rows).
When done all pass, and so does everything else under `src/shell` and `src/features/import` (the existing one-argument `onDone` assertions in `ImportFlow.test.tsx` must still pass untouched).
`tsc` reports `isImportDoneState` missing until step 1; after your change it must be clean.

## Files you may change
`frontend/src/shell/nav/importDoneTarget.ts`, `frontend/src/shell/scope/ScopeProvider.tsx`, `frontend/src/shell/wrappers/ImportWrapper.tsx`, `frontend/src/features/import/useImportOrchestration.tsx`, `frontend/src/features/import/ImportFlow.tsx`, `frontend/src/features/import/importNotice.ts`. Anything else: stop and report.
## Do not touch
`backend/**`, `frontend/src/mobile/**`, every `*.test.*` file, `scopeTypes.ts`, `resetRule.ts`, `package.json`.
Anything that decides which person's data a screen shows after an import is decision territory: if a case is not covered above, stop and ask (two options and your recommendation), do not guess.

## Checks (PowerShell)
```
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-c9 test src/shell src/features/import
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-c9 types
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-c9 lint src/shell src/features/import
```

## Report (one block, nothing else)
Failing counts before (expect 25) and after; exact commands and results; `git status --short` (only files from the list, plus untracked docs); decisions the packet did not cover; Open questions. This task gets an adversarial review by the orchestrator (scope and navigation logic), so say plainly anything you were unsure about.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-c9-import-landing-packet.md (your task: C-9)
Work only in C:\Users\Ayush\ag-c9 on branch ag/c9-import-landing. Tests first: run the named test folders and confirm 25 fail before you change anything. Never run a git command that changes anything. Do not touch backend/** or any file outside the packet's Files list.
When done, reply with the report block from the packet, nothing else.
```
