# Packet VIS-V1: white text on every green button, one shared "i", "Run in background" (Antigravity)
**The visual pass, Task 2 (lane V1).** The red tests are written and committed (`vis-rt-1`) and the three shared constants exist; you make the red tests pass and change nothing else. **Spec (the design):** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16), item **3 · D-1** (the "Sign-up screen after the change" mockup, all four button states), item **8 · D-7** (the "i" sizes mockup) and the **D-9** part of item 10 (the "Proposed" export dialog mockup). Plan: `Docs/superpowers/plans/2026-11-25-visual-pass-plan.md` (Task 2).

**Your clone:** `C:\Users\Dell\ag-vis1` (branch `ag/vis1-greens`, cut from `batch/vis` after `vis-rt-1` merged). Work only there. Never edit anything outside it. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, then this packet.

## The owner's decisions (25 Nov 2026) that bind this task
- **D-1 (QA-1 B):** every green-filled **button** has **white** text on the bright green `#22C55E` **as it is**. The fill, hover (`#16A34A`) and pressed (`#15803D`) greens do not change. White on `#22C55E` is 2.3 to 1: this is **known and accepted by the owner**; do not "fix" it, do not darken the green, do not add a contrast note to the UI. The disabled button keeps its grey label. Check marks and other non-button marks on green keep today's dark colour (`markOnGreen.test.tsx` pins that).
- **D-7 (QA-7 A):** every small "i" info icon uses one shared class, about 20px, 12px letter, a darker border, a clear filled hover, the 2px brand-green focus ring. The hide-values **eye** is a different icon: do not touch it.
- **D-9 (QA-9 A):** the export dialog button that reads `Keep working` now reads `Run in background`. The callback prop name (`onKeepWorking`) and what the button does do not change.
- **Copy never changes** except that one string. No emojis. No new colours: tokens only; hex stays only where today's token CSS already holds it.

## Exact edits, file by file (everything else in these files stays)
1. **`frontend/src/styles/auth-tokens.css`**, rule `.auth-btn` (about L207-221): `color: #111111;` becomes `color: #FFFFFF;`. The hover rule sets only the background, so the text stays white; the `:active` rule is already `#FFFFFF` (its comment about 5.02:1 stays true); `:disabled` and `.auth-btn.auth-btn-count:disabled` keep `#717171` on `#DFDFDF`.
2. **`frontend/src/features/export/export-tokens.css`**: `--export-btn-ink: #111111;` at L22, L50 and L75 (the light, system-dark and `data-theme` dark blocks) all become `#FFFFFF`. `ExportDialog.tsx` already reads the token for "Export PDF" (about L500) and "Done" (about L663): **do not edit those two buttons**. The outlined `Cancel` and `Run in background` buttons use the green **text** token on a light fill and stay exactly as they are.
3. **`frontend/src/features/import/checklist/checklist-tokens.css`**: `--ccp-btn-ink` (L24, L55, L86) and `--ccw-btn-ink` (L113) become `#FFFFFF`. Do not touch `--cc-btn-pressed-ink`, `--cc-disabled-ink` or any other token. This file is also edited later by another plan: change only these four values.
4. **`frontend/src/features/auth/onboarding.module.css`**, `.continueBtn` (about L376): `color: #000000;` becomes `color: #FFFFFF;`.
5. **`frontend/src/features/dashboard/XirrDisclaimerModal.module.css`**, `.gotIt` (about L71): `color: #000000;` becomes `color: #FFFFFF;` and the comment above it (about "only ~2.2:1 on the green accent") is replaced by: `/* White text on the green accent button: owner decision, 25 Nov 2026 (QA-1 B). */`.
6. **`frontend/src/components/info/InfoPopover.tsx`**: the default trigger `<button type="button" data-clickable="" className="inline-flex h-4 w-4 cursor-help ...">i</button>` (about L96-103) gets `className={INFO_GLYPH_CLASS}` (import from `./infoGlyph`). Keep `type`, `data-clickable`, the letter `i`.
7. **`frontend/src/features/mutual-funds/common/SectionCard.tsx`**, `InfoMark` (about L19-30): the span's `className` becomes `INFO_GLYPH_CLASS` (import `INFO_GLYPH_CLASS` from `@/components/info/infoGlyph`). Keep `role="img"`, `tabIndex`, `aria-label`, `title`, `data-tooltip`, `data-testid`, the letter `i`. **Add no file under `features/mutual-funds`.**
8. **`frontend/src/components/BenchmarkInfoNote.tsx`**: the "i" button's long `className` (about L65) becomes `INFO_GLYPH_CLASS` (import from `@/components/info/infoGlyph`). Keep its handlers, `aria-*` and the inner `<span aria-hidden="true">i</span>`.
9. **`frontend/src/features/export/ExportDialog.tsx`**: the text `Keep working` (about L588) becomes `Run in background`. Nothing else.
10. **`Docs/orchestration/2026-11-18-palette-reference-for-workers.md`**: the last line of "What this settles for Batch B" (about L54, "Text on a green button is dark: `#111111` (palette: primary text)...") is replaced by: `- Text on a green button is **white** `#FFFFFF` in every state except disabled (owner decision, 25 Nov 2026, QA-1 B; white on `#22C55E` is about 2.3 to 1 and the owner accepted it). This overrides the PDF's dark-text rule.`
**Do not touch:** `components/ui/button.tsx`, `components/Button.module.css` (already white), any chip or tick mark, `features/portfolio/sections/SummaryStrip.tsx` (its hand-rolled "i" spans belong to another plan), `HideValuesButton.tsx`, any `*.test.*` file, `backend/**`, `frontend/src/mobile/**`.

## States (what must be true, light and dark; Claude screenshots these)
| Surface | Default | Hover | Pressed | Disabled | Dark |
|---|---|---|---|---|---|
| Auth button (sign-up, log-in, onboarding screens) | white on `#22C55E` | white on `#16A34A` | white on `#15803D` | grey label `#717171` on `#DFDFDF` | same (the green does not change) |
| Export dialog primary (`Export PDF`, `Done`) | white on the export green | as today | as today | as today | white |
| Checklist primary (`Open the CAMS form`, window and panel) and `Reopen checklist` | white | as today | as today | as today | white |
| Onboarding `Continue` (older flow), XIRR disclaimer `Got it` | white on the accent | as today | as today | as today | white |
| The shared `Button` (about 68 uses) | already white: **unchanged** | | | | |
| "i" glyph | 20px circle, 12px letter, `--ui-text-muted` border, `--ui-text` letter | filled `--ui-text` with `--ui-elevated` letter | n/a | n/a | tokens flip with the theme |
| "i" focus | 2px brand-green outline (`--ui-focus`) | | | | |
| "i" popover | opens on hover or focus after a short pause, click pins, Escape closes: **unchanged** | | | | |

**Layout care for the "i" (it grows from 16 to 20px):** it sits next to labels in the valuation card (`ValuationByFund`, one per fund row), the date strip, the Overview cards, the SIP timeline, the Performance page, the benchmark note and the summary strips. In each, **no row may grow taller, no label may wrap**; if one does, report the file and the screen and propose the smallest fix; do not restyle the row yourself.

## Checks (PowerShell)
```
wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash /mnt/c/Users/Dell/ag-vis1/Docs/orchestration/wave-fe-check.sh ag-vis1 test src/styles/greenButtonText.guard.test.ts src/features/auth/redesign/authGreen.test.ts src/features/auth/redesign/markOnGreen.test.tsx src/components/info/InfoPopover.test.tsx src/components/ui/button.test.tsx src/features/export/ExportDialog.stages.test.tsx src/features/export/ExportHost.test.tsx src/features/mutual-funds/common src/features/mutual-funds/guards.test.ts src/components/BenchmarkInfoNote.test.tsx
wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash /mnt/c/Users/Dell/ag-vis1/Docs/orchestration/wave-fe-check.sh ag-vis1 types
wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash /mnt/c/Users/Dell/ag-vis1/Docs/orchestration/wave-fe-check.sh ag-vis1 lint src/components src/features/export src/features/auth src/features/mutual-funds/common
```
`features/mutual-funds/guards.test.ts` must still pass (it asserts exactly 70 files in that folder; you add none). Other lanes' red tests (search, Home, onboarding) may still fail in a full run: report them, do not fix them. If WSL is denied on your machine, run `npx vitest run <paths>`, `npx tsc -b`, `npx oxlint <paths>` in PowerShell inside the clone.

## Done means
Every test named in the Checks above is green; `types` and `lint` are clean for these paths; `git status --short` shows only the files listed above (plus untracked docs); no string changed except `Run in background`; no hex was added anywhere.

## Report (one block, nothing else)
Failing counts before (the guard file, the `authGreen` rewrite, the `InfoPopover` glyph test, the two export tests) and after; the exact commands and results; `git status --short`; decisions the packet did not cover; any row or label that grew or wrapped because of the larger "i" (file, screen); anything you could not check (visual); Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-25-vis-v1-greens-packet.md (your task: VIS-V1)
Work only in C:\Users\Dell\ag-vis1 on branch ag/vis1-greens. Tests first: run the named test files and confirm the failing counts before you change anything. Never run a git command that changes anything. Do not touch backend/**, frontend/src/mobile/**, any *.test.* file, or any file outside the packet's list. Use no wording of your own: the only new string is Run in background. Reply with the report block from the packet, nothing else.
```
