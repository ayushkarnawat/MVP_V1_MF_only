# Batch F: Section Index (the Frosted Glass Side Rail) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read `Docs/orchestration/wave-common-rules.md` first; it wins where it differs.

**Goal:** Give the seven Mutual Funds tabs one shared section list with stable anchors (wave 3, built beside search), then the visible index (wave 4, after E): a frosted glass side rail on tabs with three or more sections, with scroll-spy, jump, address and keyboard behaviour. Ships in M3.

**Architecture:** One configuration per tab (`{ id, title, anchor, tier }`) in a generic module under `frontend/src/lib/` (so search's `components/search/` and the PDF export can read it; features may not import other features and `components/` may not import features). Every section element gets its anchor from the list. The rail is one new component driven by the list, watching the page area (`<main>` in `AppLayout.tsx`, which scrolls, not the window). No backend, no database, no migration.

**Tech Stack:** React, TypeScript, Vitest, Tailwind tokens.

**Spec:** `Docs/orchestration/2026-11-13-batch-f-planning-workbook.html` (Q1 C: frosted glass side rail; Q2 A: the seven Mutual Funds tabs only; Q3 C: only the index sticks, the tab row scrolls away as today; sections 3b, 4, 5). Program rules: `2026-11-17-program-execution-and-deployment-plan.html`.

## How this plan is used (read first)

- **Packets and handoffs are not written here.** The orchestrator writes the Antigravity packet for the rail (measurements, closed and open states, light and dark, the 1100 px pill, the no-blur fallback) and each Codex handoff in detail when the task starts.
- **Two stages, two waves.** Stage 1 (wave 3, with K): F-2 to F-4 only, the list, the guard test and the anchors; they edit data and one small attribute per section, and K reads the list. Stage 2 (wave 4, after K and E are merged): the visible rail F-5 to F-9, because `MutualFundsFrame.tsx` order is K, then E, then F's rail (program section 5).
- **Shared interface (program section 4):** F defines the section list; K ("page sections" results), E (strip entries may reuse ids) and I (export checklist) read it. Nothing else may hard-code a section list. Agree the module path with K's plan before building (K's plan names `lib/pageSections.ts`).
- **Wave-start check:** confirm `TAB_DEFS` and `useMfFrame` in `features/mutual-funds/frame/MutualFundsFrame.tsx`; `SectionCard` (heading id from `useId()`, `features/mutual-funds/common/SectionCard.tsx`); `AppLayout.tsx` `<main className="min-h-0 flex-1 overflow-y-auto p-6">` (page area ref `pageArea`); `features/mutual-funds/guards.test.ts` (counts files and requires `data-clickable` on buttons: new files under `features/mutual-funds/**` must satisfy it, or live outside it); the section counts per tab in the workbook table (Overview 7, 8 with D's graph; Performance 3; Allocation 4; Holdings 2; Transactions 2; Overlap 4; Other Analytics 4 groups). Report drift. Because D adds a graph to the Overview before F's anchors, re-read the Overview's sections at wave start.
- **Branch:** `batch/f-nav` from `leapswitch-redesign` (stage 1 at wave 3 start; stage 2 rebased after K and E merge). Ships in M3.
- **Builders:** Codex = list, anchors, scroll-spy, jump, address, keyboard, all tests, one task at a time. Antigravity = the rail's look only (lane G-a, files `features/mutual-funds/frame/SectionRail.tsx` and its stylesheet), after the red tests exist.

## Global Constraints

- Only the seven Mutual Funds tabs. The fund page (`FundPageFrame.tsx`), the compare-two-funds page and the phone are untouched; the component is reusable later.
- The rail shows on tabs with **3 or more** sections (a constant `MIN_SECTIONS_FOR_INDEX = 3`); Holdings and Transactions show none; an empty tab (no funds yet) shows none.
- Only the rail stays in view while scrolling; the tab row does **not** stick. Closed: a slim strip of ticks (about 44 to 48 px, set slightly in from the right edge of the page area), current section longer and green; opens on hover, focus or click into the section names (overlay, blur behind), a Pin button keeps it open. Below about 1100 px it becomes a corner pill "On this page". Where blur is unsupported, a near-solid fallback. Reduced motion: no animation, instant jump.
- Jump: smooth scroll (instant under reduced motion) so the heading lands near the top with a small constant `scroll-margin-top`; focus moves to the section heading; the hash (e.g. `#allocation-market-cap`) is written with `replace` for repeated jumps within a tab so Back is not flooded; opening a tab with no hash starts at the top; a refresh on a hash returns to it.
- Scroll-spy watches the page area (`<main>`), not the window, uses each section's own position (not fixed heights), and copes with sections that grow after first paint (D's lazy graph is a named test case).
- Other Analytics lists its 4 groups, not 6 cards; Overlap's "1." to "4." numbering is left out of the rail; a section that is empty or failed still appears in the index; the Summary strip and Sold funds count as sections only if the audit (F-2) and the user say so.
- Accessibility: the rail is a labelled navigation region; each item is a real link; `aria-current` on the active one; Tab, Enter and Escape behave as on any link.
- No analytics events (GA4 paused); use the stable section ids only. No new dependency. No backend. Phone unchanged.

## Review Focus

- Jump to a section whose content is still loading (skeleton) then grows: the heading ends up near the top after loading settles (re-measure).
- Hash for a section that does not exist (stale link) or a tab with no sections: no crash, page stays at the top.
- Two sections of similar height at the bottom of a short page: the last one can become active even if it cannot reach the top.
- A new card is added to a page and not to the list: the guard test fails; a card marked intentionally excluded passes.
- The rail with a family selector change that reloads data: the list and highlight survive.
- Keyboard only: Tab into the rail, Enter jumps and moves focus to the heading, Escape closes the open rail and returns focus.
- 1280x600 short window: the closed strip does not cover a heading's text or a button's hit area (it overlays the cards' right edge by design; check clicks still reach the card edge controls).
- Dark mode and the no-blur fallback.

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/lib/pageSections.ts` (new) | `PageSection`, `SECTION_LISTS` (one list per Mutual Funds tab), `sectionsForTab`, `MIN_SECTIONS_FOR_INDEX`. |
| `frontend/src/lib/pageSections.test.ts` (new) | Shape and uniqueness tests. |
| `frontend/src/features/mutual-funds/common/SectionCard.tsx` | Gains `anchor?: string` (sets the stable id, keeps `aria-labelledby`). |
| `frontend/src/features/mutual-funds/common/SectionAnchor.tsx` (new) | Small wrapper for non-card sections (Overview strip and holdings table, Cash Flow strip). |
| every tab page under `features/mutual-funds/{overview,performance,allocation,holdings,transactions,overlap,other}/` | One small edit each: pass the anchor. |
| `frontend/src/features/mutual-funds/frame/sectionGuard.test.tsx` (new) | Every id in a list exists on its page; every card appears in the list or is marked excluded. |
| `frontend/src/features/mutual-funds/frame/SectionRail.tsx` (new) | The rail (closed strip, open list, Pin, corner pill, fallback). |
| `frontend/src/features/mutual-funds/frame/useSectionSpy.ts` (new) | Scroll-spy on the page area. |
| `frontend/src/features/mutual-funds/frame/useSectionJump.ts` (new) | Jump, focus, hash. |
| `frontend/src/features/mutual-funds/frame/MutualFundsFrame.tsx` | Renders the rail; the tab bar does not stick. |

## Task list

| Task | What | Builder | Size | Wave |
|---|---|---|---|---|
| F-1 | Wave-start check; handoffs and the rail packet | Claude | M | 3 |
| F-2 | Section audit: every section on the seven tabs with id, card or not, can-be-empty | Claude | M | 3 (read-only) |
| F-3 | The shared list and its tests | Codex | S | 3 |
| F-4 | Anchors on every tab page; wrapper for non-card sections; the guard test | Codex | L | 3 |
| F-5 | Red tests for spy, jump, address, rule and rail behaviour | Codex | M | 4 |
| F-6 | Scroll-spy and jump logic | Codex | M | 4 |
| F-7 | The rail look | Antigravity (G-a) | L | 4 |
| F-8 | Keyboard, screen reader, 3-section rule, empty and error cases | Codex | S | 4 |
| F-9 | Screens vs mockups, dark mode, three sizes incl. short window | Claude | M | 4 |
| F-10 | Whole-batch review, M3 notes | Claude | M | 4 |

---

### Task F-2: Section audit (Claude, read-only)

- [ ] **Step 1:** For each of the seven tabs list every section in render order with its title (quoted from code), a proposed stable id (`<tab>-<slug>`, lower-case, hyphens), whether it is a `SectionCard`, and whether it can be empty or fail. Settle with the user: do the Overview Summary strip and Sold funds count as sections; Other Analytics lists 4 groups. Deliver `Docs/orchestration/2026-11-xx-section-audit.md`. Re-read the Overview first, since D adds a graph there.

### Task F-3: The shared list

**Files:** Create `frontend/src/lib/pageSections.ts`, `pageSections.test.ts`.

**Interfaces:**
- Produces `type MfTabId = "overview" | "performance" | "allocation" | "holdings" | "transactions" | "overlap" | "analytics"`.
- Produces `interface PageSection { id: string; title: string; anchor: string; tier: "standard" | "pro" }` (tier unused today; all `"standard"`).
- Produces `SECTION_LISTS: Record<MfTabId, PageSection[]>`, `sectionsForTab(tab: MfTabId): PageSection[]`, `MIN_SECTIONS_FOR_INDEX = 3`, `indexVisible(tab: MfTabId): boolean`.

- [ ] **Step 1: Write failing tests:** `every tab has a list`; `ids and anchors are unique across all tabs`; `anchors are lower-case slugs prefixed by their tab id`; `counts match the audit (Overview 7 or 8, Performance 3, Allocation 4, Holdings 2, Transactions 2, Overlap 4, Analytics 4)`; `indexVisible is false for Holdings and Transactions and true for the others`; `Overlap titles carry no leading number`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/lib/pageSections.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the lists from the audit (titles quoted from code). **Step 4: Run** it. Expected: PASS.

### Task F-4: Anchors and the guard test

**Files:** Modify `SectionCard.tsx`; create `SectionAnchor.tsx`, `frame/sectionGuard.test.tsx`; modify the seven tab page files listed in File Structure and their tests only where an id assertion is added.

**Interfaces:** `SectionCard({ ..., anchor?: string })` renders `<section id={anchor} className="scroll-mt-4" aria-labelledby={headingId}>` (the heading id stays `useId()`); `SectionAnchor({ anchor, children }: { anchor: string; children: ReactNode })`.

- [ ] **Step 1: Write failing tests:** per tab `<tab> page renders every section id from the list` (render each page with the fixtures in `features/mutual-funds/fixtures`); `a card on the page that is neither in the list nor marked excluded fails` (write the check as `sectionGuard.test.tsx`); `SectionCard without anchor is unchanged`; the existing `SectionCard` tests pass unchanged.
- [ ] **Step 2: Run** `npx vitest run src/features/mutual-funds/frame/sectionGuard.test.tsx src/features/mutual-funds/common`. Expected: FAIL.
- [ ] **Step 3: Implement** the anchor attribute and wrappers; one small edit per page. Do not restyle anything.
- [ ] **Step 4: Run** the guard test, the touched pages' tests, `npx tsc -b`, `npx oxlint src/features/mutual-funds src/lib`. Expected: PASS. Also `guards.test.ts` stays green.

### Task F-5: Red tests for the rail (stage 2)

**Files:** Test: `frontend/src/features/mutual-funds/frame/useSectionSpy.test.tsx`, `useSectionJump.test.tsx`, `SectionRail.test.tsx`, `MutualFundsFrame.test.tsx`.

- [ ] **Step 1: Write failing tests:** `spy marks the section nearest the top as the page area scrolls (simulated scroll inside main, not window)`; `a section that grows after first paint keeps its place and a jump re-measures`; `last section becomes active on a short page`; `jump scrolls so the heading lands near the top, moves focus to the heading, writes the hash with replace`; `refresh on #allocation-market-cap returns to it`; `unknown hash does nothing`; `Back is not flooded by repeated jumps within a tab`; `reduced motion gives an instant jump and no rail animation`; `rail shows on Overview, Performance, Allocation, Overlap, Analytics and not on Holdings, Transactions`; `rail is a labelled navigation region, items are links, aria-current on the active one`; `Escape closes the open rail and returns focus`; `Pin keeps it open`; `below 1100 px it renders the corner pill`; `the tab bar does not stick`; `empty tab shows no rail`; `a failed section still appears in the list`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/features/mutual-funds/frame`. Expected: FAIL.

### Task F-6: Spy and jump logic

**Files:** Create `useSectionSpy.ts`, `useSectionJump.ts`; modify `MutualFundsFrame.tsx` only to mount the rail (rail look is F-7).

**Interfaces:** `useSectionSpy(scrollRoot: RefObject<HTMLElement>, sections: PageSection[]): { activeId: string | null }`; `useSectionJump(scrollRoot, sections): { jumpTo: (id: string) => void }` (smooth or instant per `prefers-reduced-motion`; focuses the heading; `history.replaceState` for the hash; re-measures after layout settles using a `ResizeObserver` on the root's content).

- [ ] **Step 1:** F-5's tests drive it. **Step 2: Implement** both hooks using the page area ref the shell already creates (`pageArea` in `AppLayout.tsx`; expose it through the existing frame context rather than a global). **Step 3: Run** the hooks' tests. Expected: PASS.

### Task F-7: The rail (Antigravity, lane G-a)

**Files:** Create `frontend/src/features/mutual-funds/frame/SectionRail.tsx` and its stylesheet only. Tests: F-5's `SectionRail.test.tsx` (fixed).

**Interfaces:** `SectionRail({ sections, activeId, onJump }: { sections: PageSection[]; activeId: string | null; onJump: (id: string) => void })` plus internal open/pinned state.

- [ ] **Step 1: Packet** (orchestrator, at start): workbook section 3b placement 1 mockup and its 17 Nov refinements (moved inwards, more translucent, soft sheen, green glow on the current item), closed strip 44 to 48 px with ticks, open list width and typography, Pin button, corner pill below 1100 px, the blur and its near-solid fallback (`@supports not (backdrop-filter: blur(1px))`), light and dark, hover, focus, active, pinned states, reduced motion; the app tokens only; "Do not touch": `MutualFundsFrame.tsx` logic, the hooks, tests.
- [ ] **Step 2: Build** to the packet. **Step 3: Run** `SectionRail.test.tsx`, `npx tsc -b`, `npx oxlint src/features/mutual-funds/frame`. Expected: PASS. Orchestrator screenshots at 1280x600, 1440x810, 1536x730, 1100 px wide, light and dark, with and without blur.

### Task F-8: Keyboard, screen reader, empty and error cases

- [ ] **Step 1:** F-5's accessibility and empty/error tests; **Step 2: Implement** what is missing (labels, `aria-current`, focus return); **Step 3: Run** `src/features/mutual-funds/frame`. Expected: PASS.

### Task F-9 / F-10 (Claude)

- [ ] **Step 1 (F-9):** Every tab against the mockups at three sizes including a short window, dark mode, keyboard only, reduced motion; with D's graph and E's strip in place; send exact differences back.
- [ ] **Step 2 (F-10):** A fresh adversarial reviewer reads the diff against Review Focus; merge `leapswitch-redesign` into `batch/f-nav`, rerun affected tests, merge in. Give the M3 deploy guide (written at M3): frontend only; no backend change; the draft staging check (workbook section 9).

## Self-Review notes

- Spec coverage: item 12 (all); Q1 C, Q2 A, Q3 C in Global Constraints; the shared list with K, E, I (section 5 of the workbook).
- The list module sits in `frontend/src/lib/` so K and I can read it without importing a feature.
- Packets and handoffs: not written here, by instruction.
