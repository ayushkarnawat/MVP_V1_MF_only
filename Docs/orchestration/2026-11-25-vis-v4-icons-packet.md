# Packet VIS-V4: onboarding icons in the news-list tile style, in brand green (Antigravity)
**The visual pass, Task 5 (lane V4).** The red tests are written and committed (`vis-rt-1`) and the icon maps exist in `features/auth/onboardingIcons.ts`; you make the red tests pass and change nothing else. **Spec (the design):** `Docs/orchestration/2026-11-24-head-of-family-d11-plan.html` (page version 16), item **9 · D-8** (the "Today" and "After" mockups: tiles, green icons, no repeats). **The news-list pattern to copy:** `frontend/src/features/home/components/NewsCategoryIcon.tsx` (a `size-10` tile, `rounded-[10px]`, `bg-[var(--ui-card)]`, a 20px lucide icon). Plan: `Docs/superpowers/plans/2026-11-25-visual-pass-plan.md` (Task 5).

**Your clone:** `C:\Users\Dell\ag-vis4` (branch `ag/vis4-icons`, cut from `batch/vis` after `vis-rt-1` merged). Work only there. Never edit anything outside it. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, then this packet.

## The owner's decisions (25 Nov 2026) that bind this task
- **D-8 (QA-8 A):** on sign-up screen 4 and on the phone and older onboarding screens, option icons are line icons in a soft grey rounded-square **tile** (the news-list style), **in the brand green `#22C55E`** (use the token `--pos`, never hex), **no repeated icons** (`self_directed` is a `Compass`, `wealth_creation` a `TrendingUp`; the maps are in `onboardingIcons.ts`), and **no emojis anywhere** (owner rule). Wording does not change.
- Screen 4 must still fit one viewport at the five sizes of QA row M1-02 (no scrolling in either state; both notices and `Continue` visible). **You may not grow any row or chip**: if a tile does not fit, make the tile smaller, and say so in the report.

## What the code does today
- `features/auth/redesign/IconBadge.tsx`: a `rounded-full` mint circle (`--auth-badge` or `--auth-badge-strong` background, green-ink colour) sized by `var(--auth-badge-size)` (44, 38, 34px by breakpoint) with the glyph scaled to 46% and `stroke-[1.7]`. `data-testid="icon-badge"`, `aria-hidden`. Used by `OptionRow` for the four investor-type rows.
- `InvestorProfile.tsx` (about L44-58): local `INVESTOR_ICONS` (Sprout, `BarChart3`, Users, Briefcase) and `GOAL_ICONS` (`BarChart3` again, Umbrella, GraduationCap, Home, Sun, FileText at `size={20}`), passed as `icon={INVESTOR_ICONS[option.value]}` (about L150, to `OptionRow`) and `icon={GOAL_ICONS[option.value]}` (about L183, to `ChipCheckbox`).
- `ChipCheckbox.tsx`: the icon sits in a span `shrink-0 flex items-center text-[var(--auth-muted)] [&>svg]:h-5 [&>svg]:w-5` inside a chip of height `var(--auth-chip-h)` (48, 42, 34px by breakpoint).
- `features/auth/Q2Investing.tsx` (older flow): four options (`self_directed`, `advisor_assisted`, `mixed`, `beginner`), each with a hand-drawn inline 48x48 svg (`renderIllustration`) in a left tile `h-9 w-9 sm:h-10 sm:w-10 rounded-xl` with hard-coded hex (`bg-[#22C55E]/10`, `/20`, `text-[#22C55E]`, `bg-[#22C55E]/[0.08]`, `text-[#5C5C5C]`, `dark:text-[#A3A3A3]`).
- `features/auth/Q3Purpose.tsx` (older flow): its own `GOAL_ICONS` map (TrendingUp, Armchair, GraduationCap, House, Plane, Receipt) drawn as `<option.Icon className="h-5 w-5">` in the same `h-9 w-9 sm:h-10 sm:w-10 rounded-xl` tile with the same hex classes.
- `MobileOnboardingScreen.tsx` draws no option icons: **do not touch it**.

## Exact edits (everything else in these files stays)
1. **`IconBadge.tsx`:** keep the props (`icon`, `tone?`, `className?`: `tone` is still accepted but no longer changes the look), `aria-hidden="true"` and `data-testid="icon-badge"`, and the `style` width and height from `var(--auth-badge-size)`. Replace the classes with `flex shrink-0 items-center justify-center rounded-[10px] bg-[var(--ui-card)] text-[var(--pos)] [&>svg]:h-1/2 [&>svg]:w-1/2 ${className}` (remove `rounded-full`, `text-[var(--auth-green-ink)]`, `[&>svg]:stroke-[1.7]` and the background from the `style`: the glyph uses the library's normal 2px stroke). Update the comment to: "The soft grey tile with a green line icon beside an option (the news-list style). Decorative."
2. **`InvestorProfile.tsx`:** delete the local `INVESTOR_ICONS` and `GOAL_ICONS` objects and the unused lucide imports; `import { INVESTOR_TYPE_ICONS, GOAL_TILE_ICONS } from "../onboardingIcons"`; where an icon is passed, pass the element built from the map: for an investor row `const Icon = INVESTOR_TYPE_ICONS[option.value]; icon={<Icon aria-hidden="true" />}` (no `size`: the tile CSS sizes it), for a goal chip `const Icon = GOAL_TILE_ICONS[option.value]; icon={<Icon aria-hidden="true" />}`. Behaviour, copy and the rest are unchanged.
3. **`ChipCheckbox.tsx`:** the icon span becomes a tile: `shrink-0 flex items-center justify-center rounded-[10px] bg-[var(--ui-card)] text-[var(--pos)] size-[min(32px,calc(var(--auth-chip-h)-12px))] [&>svg]:h-[56%] [&>svg]:w-[56%]` (so the tile is 32px at the 48px chip, 30px at 42px, 22px at the 34px chip). The tile must **never make the chip taller**: if at some breakpoint it does, reduce the tile there (report which). The check box (`data-testid="chip-box"`) and its dark tick on green stay exactly as they are.
4. **`Q2Investing.tsx`:** delete the four `renderIllustration` svgs and the field; the left tile uses `INVESTOR_TYPE_ICONS[option.value]` with the new tile classes `h-9 w-9 sm:h-10 sm:w-10 rounded-[10px] flex items-center justify-center flex-shrink-0 bg-[var(--ui-card)] text-[var(--pos)] [&>svg]:h-1/2 [&>svg]:w-1/2` (the same tile whether selected or not; the selected **row** keeps its tint). **Replace every hex class in the file with a token**: `bg-[#22C55E]/[0.08]` (selected row) becomes `bg-[color-mix(in_srgb,var(--pos)_8%,transparent)]` (and the dark variant `dark:bg-[color-mix(in_srgb,var(--pos)_12%,transparent)]`); `text-[#22C55E]` becomes `text-[var(--pos)]`; `text-[#5C5C5C] dark:text-[#A3A3A3]` becomes `text-[var(--ui-text-muted)]`. The file must contain **no hex colour** afterwards (a test asserts it).
5. **`Q3Purpose.tsx`:** keep its own `GOAL_ICONS` map and its six lucide icons; apply the same tile classes to the left container, draw the icon as `<option.Icon aria-hidden="true" />` (no size class), and replace the same hex classes with the same tokens as in step 4.
**Do not touch:** `MobileOnboardingScreen.tsx`, `onboardingIcons.ts`, `OptionRow.tsx` (it just passes the icon to `IconBadge`), `auth-tokens.css` (the badge size tokens stay), any `*.test.*` file, `backend/**`, `frontend/src/mobile/**`, any other file.

## States (what must be true, light and dark; Claude screenshots these)
| Surface | What renders |
|---|---|
| Sign-up screen 4, investor rows (4) | a rounded-square soft grey tile (`--ui-card`) with a green line icon: Sprout, Compass, Users, Briefcase; the row, radio, titles and notices unchanged |
| Sign-up screen 4, goal chips (6) | the same tile inside each chip: TrendingUp, Umbrella, GraduationCap, Home, Sun, FileText; the chip height and the chip box unchanged |
| Selected option or chip | the tile does not change; selection is shown by the radio or the chip box as today |
| Dark mode | the tile uses the dark `--ui-card`; the icon stays brand green |
| The five sizes of row M1-02 | no scrolling in either state; both notices and `Continue` visible; the tile shrinks with the badge and chip tokens |
| Older `Q2Investing` (4 rows) and `Q3Purpose` (6 rows) | a 36 or 40px tile with a green line icon; no hex left in the file |
| Reduced motion, keyboard focus | unchanged |

## Checks (PowerShell)
```
wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash /mnt/c/Users/Dell/ag-vis4/Docs/orchestration/wave-fe-check.sh ag-vis4 test src/features/auth
wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash /mnt/c/Users/Dell/ag-vis4/Docs/orchestration/wave-fe-check.sh ag-vis4 types
wsl.exe -d Ubuntu -- env UNIFOLIO_WT_ROOT=/mnt/c/Users/Dell/lanes UNIFOLIO_AG_ROOT=/mnt/c/Users/Dell bash /mnt/c/Users/Dell/ag-vis4/Docs/orchestration/wave-fe-check.sh ag-vis4 lint src/features/auth
```
Other lanes' red tests (greens, search, Home) may still fail in a full run, and `authGreen.test.ts` may still fail until lane V1 merges: report them, do not fix them. If WSL is denied, run `npx vitest run src/features/auth`, `npx tsc -b`, `npx oxlint src/features/auth` in PowerShell inside the clone.

## Done means
The `InvestorProfile` tests (the three new and the three existing icon-badge tests), the new `Q2Investing.test.tsx`, `Q3Purpose.test.tsx` and the other `features/auth` tests are green (except the V1-owned `authGreen` rewrite); `types` and `lint` clean; `git status --short` shows only the five files above (plus untracked docs); no hex in `Q2Investing.tsx` or `Q3Purpose.tsx`; no emoji character anywhere.

## Report (one block, nothing else)
Failing counts before and after; the exact commands and results; `git status --short`; the tile size you used on the chips at each breakpoint and whether any chip or row grew; decisions the packet did not cover; anything you could not check (visual, the five sizes); Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-25-vis-v4-icons-packet.md (your task: VIS-V4)
Work only in C:\Users\Dell\ag-vis4 on branch ag/vis4-icons. Tests first: run the named test files and confirm the failing counts before you change anything. Never run a git command that changes anything. Do not touch backend/**, frontend/src/mobile/**, any *.test.* file, or any file outside the packet's list. Use no wording of your own. Reply with the report block from the packet, nothing else.
```
