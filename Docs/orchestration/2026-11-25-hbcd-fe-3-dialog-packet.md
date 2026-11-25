# Packet HBCD-FE-3: the quiet line in the Head of Family dialog (Antigravity)
**Head of Family Part C, mockup 4; plan `Docs/superpowers/plans/2026-11-25-hof-bcd-adddata-plan.md`, Task 8.** The red test is written and committed (`hbcd-rt-1`, `da9f970f` on `batch/hbcd-rt`): `ChangeHeadDialog.test.tsx` > `shows_one_quiet_line_when_a_request_waits_and_blocks_nothing` and its neighbour `shows_no_line_when_nothing_waits`. The back end already sends `waiting_cams_request: boolean` on each member of the eligibility list (committed on `batch/hbcd-be`), and the type already carries it as an optional field (`features/auth/types.ts`). **Owner decision Q4 B:** when a member has a waiting CAMS request, the dialog shows **one quiet line, no button**, and nothing is blocked. **Spec:** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16), Part C and mockup 4.

**Your clone:** `C:\Users\Dell\ag-hbcd3` (branch `ag/hbcd3-dialog`, cut from `batch/hbcd-rt`). Work only there. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, then this packet.
**This machine blocks WSL and npm for you: run NO shell command at all and request no bypass.** Make the edit, re-read the file once, and report "checks not run (tools unavailable)": Claude runs every check.

## The one file you change
`frontend/src/features/profile-v2/components/ChangeHeadDialog.tsx`. **Do not touch** any test, `pendingCopy.ts`, `InfoNotice.tsx`, `headEligibility.ts`, `features/auth/types.ts`, `backend/**`, `frontend/src/mobile/**`, any other file. **No wording of your own**: the sentence is `HEAD_CHANGE_WAITING_LINE(name)` from the copy file (`A CAMS request for ${name} is still waiting. It does not stop this change.`). No emojis; no hex colours.

## The edit
1. Add the import `import { HEAD_CHANGE_WAITING_LINE } from "@/features/import/pendingCopy";` next to the other `@/features/...` imports (the dialog already imports from `auth` and `dashboard`; this is the single source of the sentence the test also uses; if a repository guard test objects to this import, report it, do not work around it).
2. In step 1 (the member list, the `<fieldset>` that ends at the `</fieldset>` before the `startCodeSent` block, about L596-L683), **directly after the `</fieldset>`** and inside the same `loadingEligibility ? ... : (...)` branch (so it never shows while loading), render **one quiet line per member whose eligibility entry has `waiting_cams_request === true`**: reuse the existing `InfoNotice` component already imported in this file (`<InfoNotice testId="head-change-waiting-line">{HEAD_CHANGE_WAITING_LINE(name)}</InfoNotice>`, with `key={item.member_id}`), where `name` is the same `cleanName(member?.name) || "Family member"` that the member rows use. Wrap the notices in one `<div className="space-y-2">` and render the wrapper only when at least one member has the flag. The branch currently returns a `<fieldset>` alone, so turn it into a fragment `<>...</>` holding the fieldset and the wrapper.
3. **Nothing else changes**: the line has no button, no link, does not change any row's `disabled`, `checked`, selectability or the Next/Continue behaviour, and is not shown for a member without the flag. The eligibility reasons logic is untouched.

## States (Claude checks with the test and screenshots in the owner's QA round)
| State | What shows |
|---|---|
| A member has a waiting CAMS request | one muted box under the member list: a small info icon and `A CAMS request for <name> is still waiting. It does not stop this change.`; the member's row is still selectable; Next works |
| Two members have one | two boxes, one per member, each naming its member |
| No member has one, or the flag is absent (an older server) | nothing extra |
| Loading the list | nothing extra |
| Dark mode | `InfoNotice` is token-styled: nothing to do |

## Expected test results
Before your edit: `shows_one_quiet_line_when_a_request_waits_and_blocks_nothing` red; after: it, `shows_no_line_when_nothing_waits` and every other test of `ChangeHeadDialog*.test.tsx` green; `types` and `lint` clean.

## Report (one block, nothing else)
Files changed; one line on the edit; decisions the packet did not cover; anything you could not check; "checks not run (tools unavailable)".

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-25-hbcd-fe-3-dialog-packet.md (your task: HBCD-FE-3)
Work only in C:\Users\Dell\ag-hbcd3 on branch ag/hbcd3-dialog.
IMPORTANT: run NO shell commands at all: no wsl.exe, no npm or npx, no git, no tests, no type check, no lint, and never request a sandbox bypass. This machine blocks them and a blocked command stops your whole task. Claude runs all checks after you.
Do only this: read the packet, edit the ONE file it names with your file tools, re-read it once for syntax, imports and strings, then reply.
Do not touch backend/**, frontend/src/mobile/**, any *.test.* file, or any file other than frontend/src/features/profile-v2/components/ChangeHeadDialog.tsx. Use no wording of your own. Reply with the report block from the packet, nothing else.
```
