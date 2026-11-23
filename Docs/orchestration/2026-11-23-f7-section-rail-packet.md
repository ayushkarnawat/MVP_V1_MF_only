# Packet: F-7 the section rail component (Batch F, Antigravity)
**Status:** READY TO RELAY (written 2026-11-23). **Approved:** the owner chose the frosted-glass side rail (workbook Q1 C, 17 Nov); the section list and anchors are merged (`batch/f-nav`), the hooks are merged (F-6, `1325af9b`).
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-f-section-index-plan.md` (Task F-7). **Design:** `Docs/orchestration/2026-11-13-batch-f-planning-workbook.html` (section 3b, placement 1, with the 17 Nov refinements: moved inwards, more translucent and glassier, a soft sheen, a green glow on the current section). The workbook gives pictures; **this packet fixes the numbers**. **The test file `frame/SectionRail.test.tsx` is fixed: you do not edit, weaken or delete it.** Read it first: it states the styling hooks.
**Worker:** Antigravity (Gemini). Frontend only. **Your clone:** `C:\Users\Dell\ag-f7` (branch `ag/ag-f7`, cut from `batch/f-nav`). Work only there. Never run a git command that changes anything. Never touch `backend/**`.
Read first: `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, then this file, then the fixed test.
**Checks:** `wsl.exe -d Ubuntu -- env UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash "/mnt/c/Users/Dell/ag-f7/Docs/orchestration/wave-fe-check.sh" ag-f7 test src/features/mutual-funds/frame/SectionRail.test.tsx` (also `types`, and `lint src/features/mutual-funds/frame`).

## What to build (new files in `frontend/src/features/mutual-funds/frame/`)
`SectionRail.tsx` and its stylesheet `SectionRail.module.css` (CSS module, as `components/ThemeToggle.module.css` does). Interface (fixed): `SectionRail({ sections, activeId, onJump }: { sections: PageSection[]; activeId: string | null; onJump: (id: string) => void })` with `PageSection` from `../../../lib/pageSections`. Internal state: open (hover, focus-within or click), pinned. **The behaviour is whatever `SectionRail.test.tsx` asserts** (10 tests: shows on three or more sections; a labelled `navigation` named "On this page"; items are real links with `aria-current` on the active one; closed ticks, hover/focus/click open; the Pin button ("Pin", then "Unpin") keeps it open; Escape closes and returns focus; below 1100 px the corner pill; reduced motion hook; the unsupported-blur fallback hook; nothing drawn for an empty list; Overlap titles carry no card numbers). Styling hooks the test fixes: `nav[data-state="closed"|"open"]`, one `[data-section-tick]` per item, `nav[data-layout="rail"|"pill"]`, `nav[data-motion="reduced"]`, `nav[data-backdrop="fallback"]` (set when `CSS.supports("backdrop-filter","blur(1px)")` is false). A link click calls `onJump(section.id)` and prevents the default navigation (the jump hook scrolls and writes the hash). Buttons carry `data-clickable=""` (the folder's guard test requires it). Anchors for the links: `href="#<anchor>"`.

## The look (tokens only; light and dark; every state)
Use only the app tokens (`--ui-*`, `--pos`, `--pos-text`, `--pos-bg`) and `color-mix`; **no hex and no `rgb()` literals**. Fonts: body font (`font-body`), titles 13 px medium.
**Rail (wide layout, 1100 px and up):** `position: fixed`, right inset 16 px from the window edge, vertically centred (`top: 50%`, `translateY(-50%)`), `z-index: 30` (under dialogs).
- Closed: 44 px wide, padding 12 px 8 px, radius 16 px; a vertical stack of ticks, gap 10 px; each tick 3 px high, 14 px wide, radius 2 px, colour `color-mix(in srgb, var(--ui-text-muted) 55%, transparent)`; the **active tick is longer (26 px) and `var(--pos)`** with a soft green glow `box-shadow: 0 0 10px color-mix(in srgb, var(--pos) 55%, transparent)`.
- Surface (closed and open): background `color-mix(in srgb, var(--ui-elevated) 55%, transparent)`, `backdrop-filter: blur(14px) saturate(1.2)`, border 1 px `color-mix(in srgb, var(--ui-divider) 70%, transparent)`, a soft sheen layered on top: `linear-gradient(135deg, color-mix(in srgb, var(--ui-text) 7%, transparent), transparent 55%)`, shadow `0 8px 24px color-mix(in srgb, var(--ui-text) 10%, transparent)`.
- Open: a 240 px wide panel overlaying the content (no layout shift), padding 8 px; a header row with the label "On this page" (11 px, uppercase letter-spacing 0.04em, `--ui-text-muted`) and the Pin button at the right (11 px, a small outlined button, `Pin` / `Unpin`); then the list, one link per section, 36 px high, 13 px, radius 10 px, `--ui-text`; hover `color-mix(in srgb, var(--ui-text) 6%, transparent)`; **the active link** has `--pos-bg` background, `--pos-text` text, a 2 px left bar `var(--pos)` and the same soft glow; focus-visible: 2 px outline `var(--pos)` with 2 px offset on every link and the Pin button.
- Open and close: 160 ms ease on opacity, width and transform. **Reduced motion** (`nav[data-motion="reduced"]` and `@media (prefers-reduced-motion: reduce)`): no transition and no animation at all.
- **Blur fallback:** `@supports not (backdrop-filter: blur(1px))` and `nav[data-backdrop="fallback"]`: the surface becomes near-solid, `color-mix(in srgb, var(--ui-elevated) 96%, transparent)`, no blur.
**Pill (`nav[data-layout="pill"]`, below 1100 px):** a `position: fixed` button at the bottom right (right 16 px, bottom 16 px, z-index 30), 40 px high, radius 20 px, label "On this page" (13 px medium) with a small chevron icon, same glass surface; `aria-expanded` on the button; clicking opens the same list as a panel above the pill (240 px wide, same row styling, with the Pin button), Escape and an outside click close it and return focus to the pill.
Dark mode needs no extra rules if you use only tokens; check that every colour above is a token or a `color-mix` of tokens. You cannot see the screen: say so in the report; Claude renders the rail at 1280x600, 1440x810, 1536x730 and 1100 px, light and dark, with and without blur, next to the drawing, and sends exact differences.

## Tests first, then build
Run `SectionRail.test.tsx` first and show it fail (missing module); then build until it passes. Run the whole `src/features/mutual-funds/frame` folder, `types`, `lint` afterwards. (`MutualFundsFrame.rail.test.tsx` stays partly red: Claude mounts the rail in the frame. Do not touch the frame.)

## Files
**Create only:** `SectionRail.tsx` and `SectionRail.module.css`. **Do not touch:** any test file, `MutualFundsFrame.tsx`, the three hooks, `lib/pageSections.ts`, any page or card, `guards.test.ts` (Claude bumps the source-file count by one after the merge), `frontend/src/mobile/**`, `backend/**`, `package.json`, lockfiles. If something outside this list needs an edit, stop and report it.
Rules: no `any`, `parseFloat`, `toFixed`, `Intl.`, `console.`, no hex; features may not import other features; a lucide icon is fine (already installed); plain words; no em dashes.

## Report (one block)
Lane `ag-f7`; failing counts before and after with the exact commands; `git status --short`; decisions the packet did not cover; anything not checked (visual); open questions. No narration.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-23-f7-section-rail-packet.md (your task: F-7)
Work only in C:\Users\Dell\ag-f7 on branch ag/ag-f7. The test file SectionRail.test.tsx is fixed: run it first (show it fail), then create only SectionRail.tsx and SectionRail.module.css so it passes, with the look the packet fixes. Never run a git command that changes anything. Reply with the report block from the packet, nothing else.
```
