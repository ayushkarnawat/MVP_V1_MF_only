# Handoff: f5-rail-red-tests (Batch F stage 2, task F-5: red tests for the section rail, front end, Codex)
**Status:** READY TO RELAY (written 2026-11-20). **Approved:** the owner approved the release program and Batch F's plan; M3 start confirmed 20 Nov. The rail itself is built later (F-6 logic, F-7 look); **this task writes only its tests, now, so the logic and the look can be built against them.**
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-f-section-index-plan.md` (Tasks F-5 to F-8; "Global Constraints" and "Review Focus"). **Spec:** `Docs/orchestration/2026-11-13-batch-f-planning-workbook.html` (sections 3b, 4, 5). **The audit that fixes the facts:** `Docs/orchestration/2026-11-20-section-audit.md` (read it fully first). The spec is the design; if it and the code disagree, stop and say so.
**Worker:** Codex writes tests and type-only declarations. **It cannot run the front-end checks (its sandbox is refused WSL): it writes the tests, runs nothing and reports BLOCKED on running; Claude runs them (lane `fn`) and confirms each is red for the stated reason.**
**Work in:** `D:\unifolio-f-nav` (worktree, branch `batch/f-nav`, cut from `leapswitch-redesign`; an Antigravity worker is editing the page files in a separate clone at the same time, so **you touch only new test files under `features/mutual-funds/frame/`**). Never in `D:\Unifolio code`.
Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), then this file.

## The interfaces the tests are written against (decided here; do not invent others)
```ts
// frontend/src/lib/pageSections.ts (being built now by the F-3 lane; its shape is fixed)
export type MfTabId = "overview" | "performance" | "allocation" | "holdings" | "transactions" | "overlap" | "analytics";
export interface PageSection { id: string; title: string; anchor: string; tier: "standard" | "pro" }   // anchor === id === the DOM id
export const MIN_SECTIONS_FOR_INDEX = 3;
export function sectionsForTab(tab: MfTabId): PageSection[];
// features/mutual-funds/frame/ (built later, by F-6 and F-7; the tests import these paths; they do not exist yet, so the tests are red)
useSectionSpy.ts   export function useSectionSpy(scrollRoot: RefObject<HTMLElement | null>, sections: PageSection[]): { activeId: string | null }
useSectionJump.ts  export function useSectionJump(scrollRoot: RefObject<HTMLElement | null>, sections: PageSection[]): { jumpTo: (id: string) => void }
useRenderedSections.ts  export function useRenderedSections(scrollRoot: RefObject<HTMLElement | null>, sections: PageSection[]): PageSection[]   // the sections whose anchor id exists in the page area NOW (re-evaluated when the DOM changes)
SectionRail.tsx    export function SectionRail(props: { sections: PageSection[]; activeId: string | null; onJump: (id: string) => void }): JSX.Element | null
MutualFundsFrame   `useMfFrame()` gains `scrollRoot: RefObject<HTMLElement | null>` (the page area, `<main>`, found with `.closest("main")` from a frame wrapper); the frame mounts `SectionRail` when `useRenderedSections(...).length >= MIN_SECTIONS_FOR_INDEX`
```
**Facts from the audit that the tests must respect:** the page area `<main className="min-h-0 flex-1 overflow-y-auto p-6">` (in `shell/layout/AppLayout.tsx`) scrolls, **not the window**; `pageArea` is a local ref there (not exposed), so the tests give the hooks their own scroll container element; sections get their id on their own root (`scroll-mt-6`); **the rail must key off rendered sections** (Overview 8 in the full case with fewer in member mode; Overlap has 0 sections with fewer than two funds); Overlap card titles carry a literal "1." to "4." which the list omits.

## Tests (new files only; invented data; red for the stated reason: the modules do not exist)
Create `features/mutual-funds/frame/{useSectionSpy.test.tsx,useSectionJump.test.tsx,useRenderedSections.test.tsx,SectionRail.test.tsx,MutualFundsFrame.rail.test.tsx}` (use `fireEvent` and Testing Library; `user-event` is not installed; jsdom has no layout, so mock `getBoundingClientRect`, `scrollTo`/`scrollIntoView`, `IntersectionObserver` and `ResizeObserver` the way existing tests in this repo do: look at the jsdom shims in the test setup). The test names are the plan's (F-5), plus the added ones:
- Spy: `spy marks the section nearest the top as the page area scrolls (a simulated scroll inside the container, not window)`; `a section that grows after first paint keeps its place and a jump re-measures`; `the last section becomes active on a short page even if it cannot reach the top`; `two sections of similar height at the bottom of a short page`.
- Jump: `jump scrolls so the heading lands near the top, moves focus to the heading, writes the hash with replace`; `refresh on #allocation-market-cap returns to it`; `an unknown hash does nothing and does not crash`; `Back is not flooded by repeated jumps within a tab`; `reduced motion gives an instant jump`; `jump to a section whose content is still a skeleton then grows ends near the top after it settles`.
- Rendered sections: `a section missing from the DOM is not in the rendered list`; `the list updates when a section appears later (a lazy graph)`; `an empty tab gives an empty list`; `a failed section still appears (it keeps its anchor)`.
- Rail: `shows on tabs with three or more rendered sections and not on holdings or transactions`; `it is a labelled navigation region, items are links, aria-current marks the active one`; `closed: a slim strip of ticks; hover, focus or click opens the list of names`; `Pin keeps it open`; `Escape closes the open rail and returns focus`; `below 1100 px it renders the corner pill "On this page"`; `reduced motion: no animation`; `where backdrop-filter is unsupported a near-solid fallback class is used` (assert the class or the `@supports` hook the stylesheet exposes: choose a stable `data-` hook and write it in the test); `the tab bar does not stick` (the frame's tab row has no sticky class); `an empty tab shows no rail`; `a section that is empty or failed still appears in the index`; `a family-selector change that reloads data keeps the list and the highlight`.
- Keyboard: `Tab into the rail, Enter jumps and moves focus to the heading, Escape closes and returns focus`.
- Frame: `the frame exposes scrollRoot through useMfFrame` and `the frame mounts the rail only when three or more sections are rendered`.
Where a rule cannot be tested without layout (for example the stylesheet's blur), write the test against a documented `data-` hook and say so in the report. Do not write `it.todo` for anything the plan lists; list any rule you could not turn into a test under Open questions.

## Run these only (Claude runs them; Codex cannot)
`wave-fe-check.sh fn test src/features/mutual-funds/frame` (lane `fn` is added by Claude). Codex: write the tests, run nothing, report BLOCKED on running.

## Files you may touch
New test files under `frontend/src/features/mutual-funds/frame/` only (the five above). **Do not touch** any component, hook, existing test, `pageSections.ts`, `guards.test.ts`, `components/search/**`, backend, config.

## Constraints
Invented data only. No network. No new dependency. Git read-only. No deletion flags or recursive deletes. Tests are not scanned by the Mutual Funds guard (it scans source files only), but keep to the repo's test style (no `any`, no hard-coded colours).

## Report format
One fenced block `CODEX REPORT: f5-rail-red-tests`: status; baseline HEAD; drift; the list of tests per file with why each is red; rules you could not turn into a test; files created; `git status --short`; Deviations; Open questions.

## Paste-ready prompt
```
Front-end test writer for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-20-section-audit.md
4. Docs/orchestration/2026-11-20-f5-rail-red-tests-handoff.md (your task: F-5, owner-approved)
Work only in D:\unifolio-f-nav on branch batch/f-nav. Git is read-only. No deletion flags or recursive deletes. Write only the five new test files the handoff names, exactly against the interfaces it fixes; touch nothing else. You cannot run the front-end checks: do not try, report BLOCKED on running.
Reply with the CODEX REPORT block from the handoff, nothing else.
```
