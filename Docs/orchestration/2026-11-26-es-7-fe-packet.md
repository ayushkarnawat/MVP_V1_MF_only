# Packet ES-7-FE: honest progress in the export dialog (Antigravity)
**PDF export, patch 3 (safe part), plan `Docs/superpowers/plans/2026-11-25-export-speed-plan.md`, Task ES-7; decision QA-20 A.** The foundation and the red tests are written and committed (`es-7-rt`, commit `821cf01a` on `batch/es7`): `useExportJob` already computes the elapsed text, the finishing-stage line and the long note and passes them in `progress` (`elapsed?`, `stageLine?`, `longNote?`, all optional strings, see `exportTypes.ts`); **you only render them in the dialog's preparing view** and change nothing else. Read the three red tests in `frontend/src/features/export/ExportDialog.stages.test.tsx` (`shows_the_elapsed_time_while_preparing`, `shows_the_finishing_stage_line`, `shows_the_long_note_only_while_preparing`; the fourth, `buttons_and_their_callbacks_are_unchanged`, already passes and must keep passing). **Spec:** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16, item 10, the progress mockup).

**Your clone:** `C:\Users\Dell\ag-es7` (branch `ag/es7-progress`, cut from `batch/es7`). Work only there. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, then this packet.
**This machine blocks WSL and npm for you: run NO shell command at all and request no bypass.** Make the edit, re-read the file once, and report "checks not run (tools unavailable)": Claude runs every check.

## The one file you change
`frontend/src/features/export/ExportDialog.tsx`, **the preparing view only** (the block that starts `{stage === "preparing" && (`, about L509-L592). **Do not touch** any test, `useExportJob.ts`, `exportTypes.ts`, `api.ts`, `ExportHost.tsx`, `export-tokens.css` (use only the `--export-*` tokens the file already uses; no hex, no `rgb(`), `backend/**`, any other file. **No wording of your own**: every new string already arrives in `progress` (`elapsed`, `stageLine`, `longNote`). No emojis; no `Intl`, `toFixed`, `console`, `any`.

## The edit
1. **Elapsed time and stage line, in the header row.** In the preparing header (the row with the spinner tile, the title `Preparing your report` and the subtitle `progress.subtitle`), keep the title and subtitle exactly as they are. **Under the subtitle** (inside the same `<div>` that holds the title and subtitle) add one line, only when at least one of the two values exists: a flex row `mt-[2px] flex flex-wrap items-center gap-x-2 text-[12.5px] text-[var(--export-muted)]` containing, in this order: `{progress.stageLine ? <span data-testid="export-stage-line" className="font-semibold text-[var(--export-green-text)]">{progress.stageLine}</span> : null}` and `{progress.elapsed ? <span data-testid="export-elapsed" className="tabular-nums" aria-live="off">{progress.elapsed}</span> : null}` (no live region: the time ticks every second and must not be announced).
2. **The long note, under the built footer sentence.** Keep the built footer strip exactly as it is (the lock icon and `This can take about a minute. You can keep using Unifolio. Nothing is stored on our servers.`). **Directly below that strip** (before the buttons row) add, only when `progress.longNote` is truthy: `<p data-testid="export-long-note" className="border-t border-[var(--export-divider)] bg-[var(--export-strip-bg)] px-6 pb-3 text-[12px] text-[var(--export-muted)]">{progress.longNote}</p>` (a second quiet line of the same strip look; if the strip's own `mt-[14px]` spacing makes the two lines look detached, keep the note's top padding at 0 so it reads as the strip's second line).
3. **Nothing else changes:** the stage rows, the progress bar, the `Cancel` and `Run in background` buttons and their `data-clickable` and `data-effect="close"`, the `choose`, `ready` and `failed` views. The new elements render **only inside the `stage === "preparing"` block**, so they never appear in the other views. No animation.

## States (Claude checks with the tests; the owner sees them in the QA round)
| State | What shows |
|---|---|
| Preparing, just started | title, subtitle, and `0 s so far` (or the elapsed text) under the subtitle; no stage line, no long note (a small report) |
| Preparing, last stage | the green `Finishing the PDF` and the elapsed time on the same line |
| Preparing, a large report (20 or more sections) | the long note under the built footer sentence |
| Dialog closed and reopened while running | the elapsed time continues from the job's real age (the hook does this) |
| Ready, failed, choose | none of the three new elements |
| Dark mode | tokens only: nothing to do |

## Expected test results
Before: the three dialog tests red; after: they and every other test of `features/export` green, `export.guard.test.ts` green (no hex; every `<button` unchanged), `types` and `lint` clean.

## Report (one block, nothing else)
Files changed; one line per change; decisions the packet did not cover; anything you could not check; "checks not run (tools unavailable)".

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-26-es-7-fe-packet.md (your task: ES-7-FE)
Work only in C:\Users\Dell\ag-es7 on branch ag/es7-progress.
IMPORTANT: run NO shell commands at all: no wsl.exe, no npm or npx, no git, no tests, no type check, no lint, and never request a sandbox bypass. This machine blocks them and a blocked command stops your whole task. Claude runs all checks after you.
Do only this: read the packet, edit the ONE file it names with your file tools, re-read it once for syntax, imports and strings, then reply.
Do not touch backend/**, any *.test.* file, useExportJob.ts, exportTypes.ts, api.ts, ExportHost.tsx, export-tokens.css, or any file other than frontend/src/features/export/ExportDialog.tsx. Use no wording of your own. Reply with the report block from the packet, nothing else.
```
