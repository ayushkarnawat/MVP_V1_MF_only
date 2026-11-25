# Packet VIS-V3: the Home graph control hint and the "View all" link (Antigravity)
**The visual pass, Task 4 (lane V3).** The red tests are written and committed (`vis-rt-1`); you make the red tests pass and change nothing else. **Spec (the design):** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16), items **6 · D-5** (the before and after benchmark mockups) and **7 · D-6** (the before and after link mockups). Plan: `Docs/superpowers/plans/2026-11-25-visual-pass-plan.md` (Task 4).

**Your clone:** `C:\Users\Dell\ag-vis3` (branch `ag/vis3-home`, cut from `batch/vis` after `vis-rt-1` merged). Work only there. Never edit anything outside it. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, then this packet.

## The owner's decisions (25 Nov 2026) that bind this task
- **D-5 (QA-5 A):** the benchmark panel says **`Choose up to 3`** from the moment it opens (the number is `max`, which is 3 today), as a muted line. When a fourth tick is attempted, the **same element** turns to the warning look it has today (a warm tint, medium weight). The wording is exactly `Choose up to ${max}`: it already exists in the code.
- **D-6:** "View all by day's change" gets an underline **at rest** (offset 2px). Colour, weight, size, the arrow and the `Coming soon` twin stay as they are. No wording change.
- No other copy changes. No emojis. Tokens only; no hex.

## What the code does today
`BenchmarkChecklist.tsx` (props `options`, `values`, `onChange`, `disabled?`, `max = MAX_BENCHMARKS`): the panel (`role="group"`, `aria-label="Benchmarks"`, id from `useId()`, about L134-139) lists the options as `<label>` rows; a fourth box is greyed (`isOverLimit`) with no reason; the text `Choose up to ${max}` exists only inside `{showLimitMessage && (<p role="status" ...>)}` after the list (about L191), where `showLimitMessage = attemptedOverLimit && values.length >= max` (L31). `Movers.tsx` footer (about L374-399): when `loadAll` is set it renders a `<button>` with `font-semibold text-[var(--pos-text)] ... hover:underline` and the arrow; otherwise a disabled `<span>` with `title="Coming soon"`.

## Exact edits (two files; everything else stays)
**1. `frontend/src/components/wealth-graph/BenchmarkChecklist.tsx`**
- Add `const hintId = useId();` beside `panelId`.
- On the panel `<div id={panelId} role="group" aria-label="Benchmarks" ...>` add `aria-describedby={hintId}`.
- **As the first child of the panel** (before the `flex flex-col gap-0.5` list) render exactly one element:
  ```tsx
  <p
    id={hintId}
    data-testid="benchmark-limit-hint"
    role={showLimitMessage ? "status" : undefined}
    aria-live={showLimitMessage ? "polite" : undefined}
    className={`mb-1 rounded-md px-2 py-1 text-xs ${showLimitMessage ? "bg-[var(--warn-bg)] font-medium text-[var(--warn-text)]" : "text-[var(--ui-text-muted)]"}`}
  >
    {`Choose up to ${max}`}
  </p>
  ```
- **Delete** the old conditional `{showLimitMessage && (<p role="status" ...>{`Choose up to ${max}`}</p>)}` after the list: the text must appear **once**, in this one element.
- Everything else (the trigger, the options, the `accent-[var(--pos)]` boxes, `handleToggleOption`, keyboard handling, `attemptedOverLimit`) is unchanged.
**2. `frontend/src/features/home/sections/Movers.tsx`** (the live button only, about L376-387): in its `className` add `underline underline-offset-2` and remove `hover:underline` (it is redundant now). Keep `font-semibold text-[var(--pos-text)]`, `inline-flex ... gap-1`, the focus ring classes and the `ArrowRight`. Do **not** touch the disabled twin.
**Do not touch:** any `*.test.*` file, `WealthGraph.tsx`, `DayChangeDialog`, any other file, `backend/**`, `frontend/src/mobile/**`.

## States (what must be true, light and dark; Claude screenshots these)
| State | What renders |
|---|---|
| Panel just opened, 1 to 2 boxes ticked | the muted line `Choose up to 3` at the top; all boxes enabled except as today |
| 3 ticked (limit reached), nothing attempted | the same muted line; the unticked boxes greyed as today |
| A fourth tick attempted | the **same** line in the warm warning look (`role="status"`, announced once) |
| Panel closed and reopened | the warning resets to the muted look (existing behaviour) |
| Keyboard (Tab, Space) | unchanged; the line is not focusable; the group is described by it (`aria-describedby`) |
| Dark mode | `--ui-text-muted` and the `--warn-*` tokens flip with the theme |
| Movers footer, link live | underlined green text with the arrow; hover, focus ring as today |
| Movers footer, link disabled | the grey `Coming soon` twin, **not** underlined, not interactive |
| Narrow window | the footer wraps as it does today |
No layout jump: the hint line adds one line of height to the panel when it opens (it is part of the panel, not an overlay); the panel stays `min-w-[240px]`.

## Checks (PowerShell)
```
wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash /mnt/c/Users/Dell/ag-vis3/Docs/orchestration/wave-fe-check.sh ag-vis3 test src/components/wealth-graph src/features/home
wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash /mnt/c/Users/Dell/ag-vis3/Docs/orchestration/wave-fe-check.sh ag-vis3 types
wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash /mnt/c/Users/Dell/ag-vis3/Docs/orchestration/wave-fe-check.sh ag-vis3 lint src/components/wealth-graph src/features/home
```
`features/home/guards.test.ts` must still pass. Other lanes' red tests may still fail in a full run: report them, do not fix them. If WSL is denied, run `npx vitest run <paths>`, `npx tsc -b`, `npx oxlint <paths>` in PowerShell inside the clone.

## Done means
Every test in `src/components/wealth-graph` and `src/features/home` is green (the three hint tests, the three link tests, and the existing benchmark tests included); `types` and `lint` clean; `git status --short` shows only the two files (plus untracked docs); the text `Choose up to` appears once in `BenchmarkChecklist.tsx`.

## Report (one block, nothing else)
Failing counts before and after; the exact commands and results; `git status --short`; decisions the packet did not cover; anything you could not check (visual); Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-25-vis-v3-home-packet.md (your task: VIS-V3)
Work only in C:\Users\Dell\ag-vis3 on branch ag/vis3-home. Tests first: run the named test files and confirm the failing counts before you change anything. Never run a git command that changes anything. Do not touch backend/**, frontend/src/mobile/**, any *.test.* file, or any file outside the packet's list. Use no wording of your own: the one string already exists in the code. Reply with the report block from the packet, nothing else.
```
