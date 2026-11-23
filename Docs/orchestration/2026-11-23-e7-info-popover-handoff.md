# Handoff: E-7 the shared "i" popover and the InfoMark rebuild (Batch E, Codex)
**Status:** READY TO RELAY (written 2026-11-23). **Approved:** the owner approved `@radix-ui/react-popover` on 23 Nov; it is already added to `frontend/package.json` and the lock file on `batch/e-dates` (`fb6bdca9`): **you do not touch `package.json` or the lock file.**
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-e-dates-plan.md` (Task E-7). **Spec:** `Docs/orchestration/2026-11-13-batch-e-planning-workbook.html` (the shared "i").
**Worker:** Codex. **It cannot run the front-end checks (no WSL): write tests first and the code, do not try to run vitest, report BLOCKED on running.** Claude runs `wave-fe-check.sh ed test ...` and reads the result; Claude also checks that each new test fails first for the stated reason (so write the tests before the code and keep them in separate, clearly named files).
**Work in:** `C:\Users\Dell\lanes\unifolio-e-dates` (worktree, branch `batch/e-dates`). Git is read-only. Never in the main checkout. Note: another worker may be editing other files of this branch's clones; you touch only the files below.
Read first: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins), then this file; then open `frontend/src/features/mutual-funds/common/SectionCard.tsx` (the current `InfoMark`), `frontend/src/features/mutual-funds/common/common.test.tsx`, and one Radix wrapper for style (`frontend/src/components/ui/`, the tooltip or dialog).

## What to build
1. **`frontend/src/components/info/InfoPopover.tsx`** (new): `InfoPopover({ label, title, children, side, trigger }: InfoPopoverProps)` built on `@radix-ui/react-popover`. `label` is the accessible name of the trigger; `title?: string` is an optional bold heading in the panel; `children` the content; `side?: "top" | "bottom" | "left" | "right"` (default `"bottom"`); `trigger?: ReactElement` lets a caller supply the trigger element (used by `InfoMark`; default is a small circled "i" button with `data-clickable=""`). Behaviour: **opens on hover after a short pause (about 250 ms) and on focus; click or Enter or Space pins it open; Escape and an outside click close it and focus returns to the trigger; moving the pointer away closes it unless pinned; the panel's width is capped (max 20rem) and its content scrolls (max height 60 vh); placement flips at screen edges (Radix collision handling, `collisionPadding` 8)**. Panel look (tokens only, no hex, light and dark): `bg-[var(--ui-elevated)] text-[var(--ui-text)] border border-[var(--ui-divider)] rounded-xl shadow-lg px-4 py-3 text-xs leading-relaxed`; title `text-[var(--ui-text)] text-xs font-semibold mb-1`; keyboard focus ring on the trigger 2 px `var(--pos)`. Respect `prefers-reduced-motion` (no open animation).
2. **`InfoMark` in `features/mutual-funds/common/SectionCard.tsx`** keeps its name and signature (`{ text: string; testId?: string }`) and is rebuilt on `InfoPopover` with `text` as the content. **Existing assertions must keep passing unchanged** (about 15 test files read it): the trigger element stays `role="img"` with `aria-label={text}`, `tabIndex={0}`, `data-testid={testId}` and the attribute `data-tooltip={text}`, and keeps its circled-"i" classes; you add `aria-haspopup="dialog"`, `aria-expanded` and the click, Enter, Space and hover behaviour. Remove the native `title` attribute only if no existing test reads it (search first; if one does, keep it and say so). Do **not** change `SectionCard` itself or any other file that uses `InfoMark`.
3. **Do not** touch the date strip, the P/E and P/B table, or any card.

## Tests first (new files only; names fixed)
`frontend/src/components/info/InfoPopover.test.tsx`: `opens on hover after a short pause and on focus` (fake timers); `click or Enter pins it open and a later hover-out keeps it open`; `Escape and outside click close it and focus returns to the trigger`; `content scrolls and width is capped` (assert the capped width and max-height classes); `side prop sets the placement attribute`; `a custom trigger is used when given`; `the title renders when given`; `no hex colours in the markup`.
`frontend/src/features/mutual-funds/common/infoMark.popover.test.tsx`: `InfoMark with a text prop still shows that text as its name and gains click behaviour` (click opens a dialog containing the text); `InfoMark keeps data-tooltip, role img, tabIndex 0 and the test id`; `keyboard: Tab focuses it, Enter pins it, Escape closes and returns focus`.
Existing `common.test.tsx` and every existing InfoMark assertion pass unchanged. In jsdom use `ResizeObserver`/`matchMedia` stubs the way other Radix tests in the repo do (look at an existing test that opens a tooltip or dialog).

## Files
**You may create or edit:** `frontend/src/components/info/InfoPopover.tsx`, `InfoPopover.test.tsx`, `frontend/src/features/mutual-funds/common/SectionCard.tsx` (`InfoMark` only), `frontend/src/features/mutual-funds/common/infoMark.popover.test.tsx`. **Do not touch:** `package.json`, the lock file, any other component or test, `guards.test.ts` (Claude bumps the Mutual Funds file count if one is added there: you add none to `features/mutual-funds` except the test), `components/` importing `features/*` (not allowed: `InfoPopover` lives in `components/` and imports nothing from `features`), `frontend/src/mobile/**`, `backend/**`.
Rules: no `any`, `parseFloat`, `toFixed`, `Intl.`, `console.`, no hex; every `<button` gets `data-clickable=""`; plain words.

## Report (one block, `CODEX REPORT: e7-info-popover`)
Status (DONE, PARTIAL or BLOCKED on running); baseline HEAD; files created or edited; per test file the names and expected red reasons; whether you removed the `title` attribute and why; `git status --short`; decisions the handoff did not cover; open questions.

## Paste-ready prompt
```
Front-end worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-23-e7-info-popover-handoff.md (your task: E-7)
Work only in C:\Users\Dell\lanes\unifolio-e-dates on branch batch/e-dates. Git is read-only. No deletion flags or recursive deletes. Write the two new test files first, then InfoPopover.tsx and the InfoMark rebuild, touching only the files the handoff names. Do not touch package.json or the lock file (the dependency is already there). You cannot run the front-end checks: do not try, report BLOCKED on running.
Reply with the CODEX REPORT block from the handoff, nothing else.
```
