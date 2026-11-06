# Packet QA-FE-1 for Gemini (Antigravity): the import notice card (A1) and the smooth Home donut (A2)

**Status:** READY FOR GEMINI. The red tests are committed (they fail today for the reasons listed in each task). Your job is to make them green by changing **only** the files each task lists, so the two screens look exactly like the mockups below and **every other screen stays exactly as it is today**.
**Rules file (read first; this packet adds to it and wins where they differ):** `Docs/orchestration/ui-common-rules-antigravity.md`.
**Spec (the decisions and both mockups):** `Docs/superpowers/specs/2026-11-06-qa-fixes-design.html`, sections A1 and A2. **Plan:** `Docs/superpowers/plans/2026-11-06-qa-fixes-implementation.md`, Tasks 3 and 4.
You cannot see the screen. The orchestrator takes screenshots of your result next to the mockups and sends back exact differences. Do not improvise a look: where this packet gives a class, a size or a token, use it. Where it says nothing, keep what the file does today.

## Where to work
- Work only in the worker clone the orchestrator names in your prompt (`qa-fe-work`, a git worktree). Never the orchestrator's worktrees.
- You never run a git command that changes anything. Read-only `status`, `diff`, `log` are fine.
- Checks (WSL; the script mirrors the clone to WSL's own disk and runs the tool):
```
wsl.exe -d Ubuntu -- env CR6_SRC="/mnt/c/Users/Dell/Desktop/MVP v1/wt/qa-fe/frontend" CR6_DST=/home/delladiti/qa-fe-worker bash "/mnt/c/Users/Dell/Desktop/MVP v1/wt/qa-fe/Docs/orchestration/cr-r6-fe-check.sh" test src/components/mf src/features/import src/features/home
wsl.exe -d Ubuntu -- env CR6_SRC="/mnt/c/Users/Dell/Desktop/MVP v1/wt/qa-fe/frontend" CR6_DST=/home/delladiti/qa-fe-worker bash "/mnt/c/Users/Dell/Desktop/MVP v1/wt/qa-fe/Docs/orchestration/cr-r6-fe-check.sh" types
wsl.exe -d Ubuntu -- env CR6_SRC="/mnt/c/Users/Dell/Desktop/MVP v1/wt/qa-fe/frontend" CR6_DST=/home/delladiti/qa-fe-worker bash "/mnt/c/Users/Dell/Desktop/MVP v1/wt/qa-fe/Docs/orchestration/cr-r6-fe-check.sh" lint
```
(`/home/delladiti/qa-fe-worker` already has `node_modules`. If the script says it is missing, stop and say so.)
- **Before you start** these are red: 13 tests in `PostImportNotice.card.test.tsx`; 3 tests in `importNotice.test.ts` and `importNotice.structured.test.ts`; `useHeldActive.test.ts` and `AllocationDonut.smooth.test.tsx` (they fail to load: the modules do not exist yet); 1 test in `AllocationDonut.test.tsx` and 2 in `Allocation.test.tsx` (the changed ones). Everything else in `src/components/mf src/features/import src/features/home` passes. Keep all of it green.

## Hard rules for this packet
1. **The red test files are fixed.** Do not edit, weaken or delete a test. If a test seems wrong, say which one and why under Open questions, and make the rest pass.
2. **Only the files listed in each task may change.** Anything else (even a "harmless" tidy) is rejected: the orchestrator diffs your clone against an allowed-files list. If a task seems to need another file, STOP and list it under Open questions.
3. **Unchanged UI stays byte-identical.** Do not touch: `components/mf/NewFundsList.tsx`, `features/mutual-funds/**`, `features/dashboard/DashboardView.tsx`, `mobile/**`, the other `components/AllocationDonut.tsx` (the one in `src/components/`, used by Analytics: **not** the Home one), `features/analytics/**`.
4. No new dependency, no `package.json`/lockfile change, no `any`, no `console.`, no em dashes in user-visible text, no new user-visible words beyond the ones written here. A `.tsx` file that exports a component must not also export a constant or hook.
5. Colours only through the app tokens named here (`--ui-*`, `--pos`, `--pos-text`, `--pos-bg`). **No hex colours** in these two components. Icons: `lucide-react` only.
6. Desktop and mobile both render these components today; keep one layout that works from 320 px up (the notice wraps, never overflows horizontally).

---

## T1. The import notice card (A1)

**Files you may change:** `frontend/src/components/mf/PostImportNotice.tsx`, `frontend/src/features/import/importNotice.ts`.
**Tests that must go green:** `src/components/mf/PostImportNotice.card.test.tsx`, `src/features/import/importNotice.test.ts`, `src/features/import/importNotice.structured.test.ts`. **Must stay green:** `src/components/mf/PostImportNotice.test.tsx` (the existing 11 tests), everything under `src/features/import` and `src/features/mutual-funds`.

### What it looks like today (the "before")
A bordered box of bare lines: "Import complete · 46 new funds, 1783 transactions added", one line per person ("AYUSH KARNAWAT: 1099 added"), a "New funds: ..." line, then "View new fundsDismiss" run together as plain text. It is wrong and must change.

### The mockup (the "after"). Real HTML from the approved spec, dark theme shown; use the app's tokens, see the token map
```html
<div style="border:1px solid var(--m-line);background:var(--m-card);border-radius:14px;padding:14px">
  <div class="flex between" style="margin-bottom:6px">
    <div class="flex"><svg class="ico" viewBox="0 0 20 20" ...circle r=9 + check path, stroke #34D17F 1.6/1.8...></svg><b style="font-size:14.5px">Import complete</b></div>
    <span class="muted" aria-hidden="true" style="font-size:16px">✕</span>
  </div>
  <p class="muted" style="margin-bottom:10px"><b style="color:var(--m-text)">6 new funds</b> · 448 transactions added</p>
  <div class="flex between" style="padding:6px 0;border-top:1px solid var(--m-line)"><span>Suresh Raman Iyer</span><span class="chip">289 added</span></div>
  <div class="flex between" style="padding:6px 0;border-top:1px solid var(--m-line)"><span>Lakshmi Suresh Iyer</span><span class="chip">159 added</span></div>
  <div style="padding:8px 0 10px;border-top:1px solid var(--m-line)">
    <div class="muted sm" style="margin-bottom:5px">New funds</div>
    <span class="chip mute">HDFC Children's Fund</span> <span class="chip mute">HDFC Flexi Cap Fund</span> <span class="chip mute">UTI Nifty 50 Index Fund</span> <span class="muted sm">+3 more</span>
  </div>
  <span class="btn o">View new funds</span>
</div>
```
Mockup metrics: card radius 14, padding 14, 1 px border; title 14.5 px bold; header row has 6 px below it; summary 13 px muted, the count part bold in the text colour, 10 px below it; each person row 6 px top and bottom padding with a 1 px top border; chip = pill, 11.5 px, 600; "New funds" label 11.5 px muted, 5 px above the chips; fund chips are pills with a 1 px border, transparent fill, muted text, 11.5 px 600; "+N more" 11.5 px muted; the action is one green-outline pill (12.5 px, 600, padding 7 px 14 px).

### Token map (mockup colour to app token; the app is light by default and dark in dark mode)
| Mockup | Use |
|---|---|
| `--m-card` | `bg-[var(--ui-elevated)]` |
| `--m-line` (borders, row dividers) | `border-[var(--ui-divider)]` |
| `--m-text` | `text-[var(--ui-text)]` |
| `--m-muted` | `text-[var(--ui-text-muted)]` |
| green check icon `#34D17F` | `text-[var(--pos)]` (lucide `CircleCheck`, `h-[18px] w-[18px] shrink-0`, `aria-hidden`) |
| count chip fill / text / border | `bg-[var(--pos-bg)]` / `text-[var(--pos-text)]` / `border-[var(--pos)]/35` |
| green-outline button | border `border-[var(--pos)]`, text `text-[var(--pos-text)]`, hover `hover:bg-[var(--pos-bg)]` |
| close "✕" | lucide `X`, `h-4 w-4`, colour `text-[var(--ui-text-muted)]`, hover `hover:bg-[var(--ui-row-hover)] hover:text-[var(--ui-text)]` |

### Interfaces (T1)
`ImportNotice` (in `features/import/importNotice.ts`) and `PostImportNoticeContent` (in `PostImportNotice.tsx`; keep them structurally identical, as today) gain **optional** fields; the existing ones stay:
```ts
members?: { name: string; added: number; skipped: number }[];   // one per person, only when the statement had more than one person
warnings?: string[];                                            // only when there are warnings
counts?: { newFunds: number; added: number; skipped: number };  // only when the import produced new funds
```
`buildImportNotice(result)` keeps producing today's `text`, `details` and `newFunds` **unchanged** (the mobile app and the older views read them) and adds the three fields under the "only when" rules above (omit the key entirely otherwise; the tests use `toEqual` and `not.toHaveProperty`).

### The component (exact structure and classes)
Replace the markup of `PostImportNotice` (keep the hooks, the "shown only to the user it was written for" rule, the Dialog with `NewFundsList`, and the dismiss behaviour exactly as they are). Test ids are part of the contract.
```tsx
<div data-testid="import-notice-card" role="status"
     className="mb-4 rounded-[14px] border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-3.5 text-sm text-[var(--ui-text)]">
  {/* header */}
  <div className="flex items-start justify-between gap-3">
    <div className="flex min-w-0 items-center gap-2">
      <CircleCheck className="h-[18px] w-[18px] shrink-0 text-[var(--pos)]" aria-hidden="true" />
      <p data-testid="import-notice-title" className="text-[14.5px] font-bold leading-snug">{title}</p>
    </div>
    <button type="button" aria-label="Dismiss import notice" onClick={...same handler as today...}
            className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-md text-[var(--ui-text-muted)] hover:bg-[var(--ui-row-hover)] hover:text-[var(--ui-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]">
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  </div>
  {/* body, in this order; each part only when it applies */}
</div>
```
- `title` = `"Import complete"` when `notice.counts` exists, otherwise `notice.text` (so a plain notice such as "This statement was already imported" and an older notice already in the history state read exactly as before, inside the card). The close button has **no visible text** (icon only) and keeps `aria-label="Dismiss import notice"`.
- **Summary** (only with `counts`): `<p data-testid="import-notice-summary" className="mt-1.5 text-[13px] text-[var(--ui-text-muted)]"><b className="font-semibold text-[var(--ui-text)]">{N new fund(s)}</b> · {M transaction(s) added}</p>`. Singular for 1 ("1 new fund · 1 transaction added"). The text content must be exactly `6 new funds · 448 transactions added`.
- **Person rows** (only with `members`, wrapper `<div data-testid="import-notice-members" className="mt-2.5">`): one `<div data-testid="import-notice-member" className="flex items-center justify-between gap-3 border-t border-[var(--ui-divider)] py-1.5">` each: left `<span className="min-w-0 truncate text-[13px]">{name}</span>` (the name exactly as given; never change its case); right `<span className="flex shrink-0 items-center gap-2">` holding, only when `skipped > 0`, `<span className="text-[11.5px] text-[var(--ui-text-muted)]">{skipped} already saved</span>`, then `<span className="rounded-full border border-[var(--pos)]/35 bg-[var(--pos-bg)] px-2 py-0.5 text-[11.5px] font-semibold text-[var(--pos-text)]">{added} added</span>`.
- **Detail lines** (only when the notice has neither `counts` nor `members`, i.e. an older notice or a plain single-person one): each `details` entry as `<p className="mt-1 text-[13px] text-[var(--ui-text-muted)]">`. When `members` or `counts` exist, `details` are **not** shown (the rows and chips replace them).
- **Warnings** (only with `warnings`): each as `<p className="border-t border-[var(--ui-divider)] py-1.5 text-[12.5px] text-[var(--ui-text-muted)]">`, after the person rows and before the chips.
- **Fund chips** (only when `newFunds` has entries): `<div data-testid="import-notice-fund-chips" className="border-t border-[var(--ui-divider)] pb-2.5 pt-2">` containing a label `<span className="mb-1.5 block text-[11.5px] text-[var(--ui-text-muted)]">New funds</span>` (a `span`, not a `p`), then `<div className="flex flex-wrap items-center gap-1.5">` with **at most 3** chips `<span data-testid="import-notice-fund-chip" title={fullName} className="max-w-[220px] truncate rounded-full border border-[var(--ui-divider)] px-2.5 py-0.5 text-[11.5px] font-semibold text-[var(--ui-text-muted)]">{scheme_name}</span>` and, when there are more than 3, `<span className="text-[11.5px] text-[var(--ui-text-muted)]">+{n} more</span>` (n = total minus 3).
- **Action** (only when `newFunds` has entries): `<button type="button" onClick={() => setListOpen(true)} className="rounded-full border border-[var(--pos)] px-3.5 py-[7px] text-[12.5px] font-semibold text-[var(--pos-text)] hover:bg-[var(--pos-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] cursor-pointer">View new funds</button>`. It is a **separate element** from the close button (they used to run together as "View new fundsDismiss"). The Dialog stays exactly as today.
- The notice **never dismisses by itself** (no timer).
- A text-only notice (`{ text }` only) must render exactly one `<p>` (the title): a test counts them.

### Do not change
The shown-only-to-this-user logic, the `useLocation`/`useNavigate` dismiss that clears the state and keeps the address, the Dialog and `NewFundsList`, every existing string. Do not add animation.

### Steps
1. Read `PostImportNotice.tsx`, `importNotice.ts` and the two test files named above. 2. Run the three red test files; confirm each fails for the stated reason (no such test ids / fields). 3. Implement. 4. Run `src/components/mf src/features/import src/features/mutual-funds` (the Overview page mounts the notice). 5. Types and lint.

---

## T2. The smooth Home donut (A2)

**Files you may change:** `frontend/src/features/home/components/AllocationDonut.tsx`, `frontend/src/features/home/sections/Allocation.tsx`. **New files:** `frontend/src/features/home/useHeldActive.ts`, `frontend/src/features/home/components/AllocationLegendRow.tsx`.
**Tests that must go green:** `src/features/home/useHeldActive.test.ts`, `src/features/home/components/AllocationDonut.smooth.test.tsx`, the edited tests in `AllocationDonut.test.tsx` and `Allocation.test.tsx`. **Must stay green:** everything under `src/features/home` and `src/features/analytics` (it uses a different donut).

### What is wrong today (so you do not reintroduce it)
(1) Dimming sets an inline `opacity: 0.38` with no transition, so it snaps. (2) Leaving a slice clears the highlight at once and the next slice sets it again, so for a moment nothing is dimmed and the donut flashes. (3) The hover state lives in the whole section, so each change redraws the section, legend and cards. (4) The ring is 22 units wide, so the pointer drops out at its edges.

### The behaviour to build (the "after")
160 ms ease on opacity and stroke width; the highlight is **held** while the pointer moves from one slice to the next and is cleared only 90 ms after it leaves the donut and the legend; the active slice grows 3 units (22 to 25); a wider invisible ring so the edges do not drop the hover; only the parts that changed redraw; no motion for reduced motion. Keyboard focus, Enter, Space, `aria-pressed`, the pop-up and focus return are **unchanged**.

### Interfaces (T2)
```ts
// features/home/useHeldActive.ts  (hook only, .ts)
export function useHeldActive(clearDelayMs = 90): {
  active: string | null;
  enter: (key: string) => void;   // cancels a pending clear, sets the key
  leave: () => void;              // clears after clearDelayMs unless enter runs first
  clearNow: () => void;           // clears at once, cancels a pending clear
};
```
`enter`, `leave`, `clearNow` must keep the same identity on every render (`useCallback`/refs). Keep the timer in a ref; clear it on unmount (the test checks no timer is left).

`AllocationDonut` (props unchanged) becomes `export const AllocationDonut = memo(function AllocationDonut(...) { ... })` (test: `$$typeof === Symbol.for("react.memo")`).

`AllocationLegendRow` (new file, a memoised component, one legend row):
```ts
export const AllocationLegendRow = memo(function AllocationLegendRow(props: {
  row: LiveClassRow;                 // same row type the legend map uses today (see ReturnType<typeof liveRows>[number])
  isActive: boolean;
  onOpen: (key: string) => void;
  onEnter: (key: string) => void;
  onLeave: () => void;
}) { ... });
```
It renders exactly the markup the legend `map` renders today for a **live** row (same `data-testid="legend-<key>"`, `data-color`, `data-active`, same classes, role button / tabIndex / keyboard handlers for a clickable row, the colour square, label, percent and chevron). Only the hover wiring changes: `onMouseEnter`/`onFocus` call `onEnter(row.key)`, `onMouseLeave`/`onBlur` call `onLeave()`. The "coming soon" rows stay as they are in `Allocation.tsx`.

### `AllocationDonut.tsx` (exact changes)
- Visible slice `<circle>`: replace the inline `style.opacity` with a class. Use `cn` from `@/lib/utils`: `cn("transition-[opacity,stroke-width] duration-150 ease-out motion-reduce:transition-none", dimmed && "opacity-[0.38]")` where `dimmed` is the existing `activeKey !== null && activeKey !== row.key`. Keep `data-dim`. Keep `style={{ cursor: "pointer" }}` for the interactive case; the non-interactive case has **no** inline style opacity.
- `strokeWidth={isActive ? 25 : 22}` where `isActive = activeKey === row.key`.
- Add the hit rings **before** the visible circles in the DOM (so the visible slices stay on top and keep focus, click and keyboard exactly as today). Only when `onSliceClick` is given: for each non-zero row render `<circle data-testid={`hit-${row.key}`} aria-hidden="true" r="58" cx="80" cy="80" fill="none" stroke="transparent" strokeWidth="28" strokeDasharray={same} strokeDashoffset={same} transform="rotate(-90 80 80)" pointerEvents="stroke" style={{ cursor: "pointer" }} onMouseEnter={() => onActiveChange?.(row.key)} onMouseLeave={() => onActiveChange?.(null)} onClick={() => onSliceClick(row.key)} />`. No role, no tabindex, not focusable.
- The visible circle keeps its own mouse and focus handlers (the existing tests call them directly).
- Palette rule: no hex colours (a test scans the markup). `transparent` is fine.

### `Allocation.tsx` (exact changes)
- Replace `const [active, setActive] = useState(...)` with `const { active, enter, leave } = useHeldActive();` and `const setActive = useCallback((key: string | null) => (key === null ? leave() : enter(key)), [enter, leave]);`. These must stay **above** the early `return`s (hooks).
- Make the things the memoised children receive **stable**: move `openClass` above the early returns as `useCallback` (it uses `openerRef`, `setSelected`, `onClassClick`); compute `live` and `donutRows` with `useMemo` above the early returns, guarded for `data == null` (return `[]`). The early-return branches keep their markup exactly as today.
- Pass `onActiveChange={setActive}` to the donut; render each **live** legend row as `<AllocationLegendRow key={row.key} row={row} isActive={active === row.key} onOpen={openClass} onEnter={enter} onLeave={leave} />`. Everything else in the file is unchanged (header, approximate badge, coming-soon rows, class dialog, family cards).

### Do not change
`src/components/AllocationDonut.tsx` (the other donut), the donut's centre texts, geometry (r 58, viewBox 160), colours, the legend's looks (the row markup is moved, not restyled), the pop-up, `FamilyCards`, anything in `features/analytics`.

### Steps
1. Read the two files, the two edited tests and the three new test files. 2. Run them; confirm each fails for the stated reason (missing module / inline opacity / no hit ring). 3. Implement. 4. Run all of `src/features/home` and `src/features/analytics`. 5. Types and lint.

---

## Report (one block, nothing else)
Failing counts before and after, with the exact commands; `git status --short` (must list only the files named above); every file edited outside the lists and why (there should be none); decisions this packet did not cover; what you could not check (you cannot see the screen: say so); Open questions.

## What the orchestrator checks after you (for your information)
Screenshots at 1440x810 and 1920x1080 of the notice (46-fund import with two people; a single-person import; "already imported") and of the Home donut hover next to the mockups; the unchanged neighbouring screens against the baseline; the diff against the allowed-files list; a scoped review of the donut focus behaviour.
