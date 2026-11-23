# Handoff: F-6 section tracking and jump logic (Batch F, Codex, hooks only)
**Status:** READY TO RELAY (written 2026-11-23). **Approved:** the owner approved Batch F and M3; F-5's red tests are merged and committed (`batch/f-nav` at `df31c9bf`).
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-f-section-index-plan.md` (Task F-6; amendments at its end). **Spec:** `Docs/orchestration/2026-11-13-batch-f-planning-workbook.html`. **The tests are the contract:** the five F-5 files in `frontend/src/features/mutual-funds/frame/` are fixed; you do not edit, weaken or delete them.
**Worker:** Codex. **Codex cannot run the front-end checks (no WSL). Write the code, do not try to run vitest, report BLOCKED on running.** Claude runs `wave-fe-check.sh fn test src/features/mutual-funds/frame` and reads the result.
**Work in:** `C:\Users\Dell\lanes\unifolio-f-nav` (worktree, branch `batch/f-nav`). Never in the main checkout. Git is read-only.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins), `Docs/orchestration/2026-11-20-section-audit.md`, then this file.

## What to build (new files in `frontend/src/features/mutual-funds/frame/`)
1. `useRenderedSections.ts`: `useRenderedSections(scrollRoot: RefObject<HTMLElement | null>, sections: PageSection[]): PageSection[]` returns the entries of `sections` whose anchor element (`document.getElementById(section.anchor)` that is **inside** `scrollRoot.current`) exists now, in the list's order; re-computes when anchors are added or removed (a `MutationObserver` on the root, childList and subtree). A section that is empty or failed still has its anchor, so it stays. An anchor outside the root is ignored.
2. `useSectionSpy.ts`: `useSectionSpy(scrollRoot, sections): { activeId: string | null }`: the active section is the one nearest the top of the scroll root (scrolling happens inside the root, not the window); the last section becomes active when the page is too short to bring it to the top; a section that grows after first paint keeps its place (use a `ResizeObserver` on the root's content and re-measure; a jump re-measures too).
3. `useSectionJump.ts`: `useSectionJump(scrollRoot, sections): { jumpTo: (id: string) => void }`: scrolls so the heading lands near the top (smooth, or instant when `prefers-reduced-motion`), moves focus to the section's heading (give it `tabIndex={-1}` if it has none), writes the hash with `history.replaceState` (**never `pushState`**; the history length must not grow), re-measures after the layout settles. On mount, a known hash (`#allocation-market-cap`) scrolls to it; an unknown hash does nothing.
4. In `MutualFundsFrame.tsx`: **only** add `scrollRoot: RefObject<HTMLElement | null>` to the context value of `useMfFrame()` (the `main` that scrolls: find it with a ref and `closest("main")` from the frame's own wrapper element, because `AppLayout.tsx`'s `pageArea` ref is local to the layout; do not edit `AppLayout.tsx`). **Do not mount a rail here and do not remove the tab bar's sticky class yet**: the rail component (`SectionRail`) is built by another worker next; Claude wires it in. `MutualFundsFrame.rail.test.tsx` will therefore still be partly red after your change: that is expected; list which of its tests pass and which wait for the rail.

## Tests first, and the checks
The five test files already exist. Read them all first; build exactly against their expectations. Note which tests each of your three hooks should turn green: `useSectionSpy.test.tsx` (4), `useSectionJump.test.tsx` (6), `useRenderedSections.test.tsx` (4), the `scrollRoot` test in `MutualFundsFrame.rail.test.tsx`. `SectionRail.test.tsx` stays red (no component yet).
Try no front-end command. Report BLOCKED on running, with the reason (no WSL).

## Files
**You may create or edit:** the three hook files above and `MutualFundsFrame.tsx` (the context value only). **Do not touch:** any test file, `SectionRail.tsx` (not yours), `AppLayout.tsx`, `lib/pageSections.ts`, any page or card file, `guards.test.ts` (Claude bumps the source-file count: three new files means 57 + 3 = 60; **tell me if you add any other file**), `frontend/src/mobile/**`, `backend/**`, `package.json`.
**Rules for the code:** no `any`, no `parseFloat`/`toFixed`/`Intl.`/`console.`, no hex colours, no `window.history.pushState`, features may not import other features; `data-clickable` rule applies to any `<button` (you add none).

## Report (one block, `CODEX REPORT: f6-spy-jump-hooks`)
Status (DONE, PARTIAL or BLOCKED on running); baseline HEAD; files created or edited (exact list); for each hook the test names you built it to satisfy; which tests of the five files you expect green now and which wait for the rail; anything in the tests you think is wrong (do not change them); `git status --short`; decisions the handoff did not cover; open questions.

## Paste-ready prompt
```
Front-end logic worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-20-section-audit.md
4. Docs/orchestration/2026-11-23-f6-spy-jump-hooks-handoff.md (your task: F-6)
Work only in C:\Users\Dell\lanes\unifolio-f-nav on branch batch/f-nav. Git is read-only. No deletion flags or recursive deletes. The five F-5 test files are fixed: read them first and build exactly against them. Create only the three hook files and make the one context change in MutualFundsFrame.tsx that the handoff names. You cannot run the front-end checks: do not try, report BLOCKED on running.
Reply with the CODEX REPORT block from the handoff, nothing else.
```
