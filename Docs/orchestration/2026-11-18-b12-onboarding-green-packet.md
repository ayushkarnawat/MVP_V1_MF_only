# Packet B-12: the onboarding layout (option A) and the green switch (Antigravity, lane G-b, third of three; starts after B-10 is merged into `batch/b-journey`)
**Batch B, items 3 and Q5.** Plan: `Docs/superpowers/plans/2026-11-17-batch-b-journey-plan.md` (Task B-12). **Design source: `Docs/orchestration/2026-11-12-batch-b-planning-workbook.html`, section 5** ("Chosen: option A with the subtitle line and the option subtexts removed" at 1280×600, 1440×810 and 1536×730; "Today" is drawn for comparison). Colours: **`Docs/Unifolio Colour Palette.pdf` through `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`** (the palette wins over any colour drawn in the workbook). The workbook is the design: a deviation is a defect; if it and the real component disagree, stop and say so.

**Your clone:** `C:\Users\Ayush\ag-b12` (branch `ag/b12-onboarding`, cut from `batch/b-journey` after B-10 is merged; the orchestrator creates it and tells you the commit). Work only there. Never edit `D:\Unifolio code`. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, then this packet.
You are the last of three tasks in lane G-b and own `styles/auth-tokens.css` while you work.

## Part 1: the onboarding screen ("How do you usually invest?")
Same words, same four options, same six goals, same save and validation. Changes, all from the workbook's option A:
1. **Remove** the line `This helps us tailor your experience and insights.` under the heading, and the **small text under each of the four options** (the four `subtitle` strings). `finishCopy.ts`'s `INVESTOR_PROFILE_OPTIONS` loses its `subtitle` field (checked: only `InvestorProfile.tsx` reads it; the Profile screen and the phone screens use `profile-v2/lib/onboardingOptions.ts`). Search `frontend/src` once more before deleting and say what you found.
2. **The four options become one grouped list.** The `radiogroup` element is the group: classes `auth-option-group flex flex-col overflow-hidden`, and `data-invalid="true"` on it when the "choose how you usually invest" error is showing (not on each row). Each row (`OptionRow`) is a flat list row: classes `auth-option flex w-full items-center gap-3 px-[18px] text-left min-h-[var(--auth-option-h)]` plus `border-b` on every row except the last (a new optional `divider` prop, passed by `InvestorProfile` for index 0 to 2). **Not** `auth-choice`, **not** `rounded-2xl`. The row keeps its icon badge, its radio indicator (`data-testid="option-radio"`, with the inner dot when selected), its title (`span.font-semibold`, 15px) and nothing else: one text line. Drop `OptionRow`'s `subtitle` and `invalid` props. Keep the roving tab stop, arrow keys, `role="radio"`, `aria-checked` exactly.
3. **The goals block:** the heading row stays a flex, `whitespace-nowrap` row with `What are you working towards?` (the `h2`, no hint inside it) on the left and the `Select all` / `Clear all` button on the right. Directly under it, its **own muted line**: `<p className="text-[12.5px] leading-[1.2] text-[var(--auth-muted)]">(Select all that apply)</p>`. Then the chips group as **two columns**: `grid grid-cols-2 gap-[calc(var(--auth-gap-sm)+3px)]` (was `grid-cols-3`).
4. **A little more air:** the page stack `gap-[calc(var(--auth-gap)+6px)]` (was `gap-[var(--auth-gap)]`); each of the two sections `gap-[calc(var(--auth-gap-sm)+3px)]` (was `gap-[var(--auth-gap-sm)]`).
5. Nothing else in `InvestorProfile.tsx` changes (focus handling on Continue, the saving state, the error text).

## Part 2: the green switch for all ten auth screens (only through `styles/auth-tokens.css`; palette values only)
- Tokens: `--auth-green: #22C55E`; `--auth-green-ink: #15803D`; `--auth-step-on: #22C55E`; `--auth-sel-bg: #E9F9EF`; `--auth-sel-border: #22C55E`; `--auth-btn-shadow: 0 10px 22px -10px rgba(34, 197, 94, 0.55)`; add `--auth-option-h: min(calc(var(--auth-row-h) - 6px), 48px);` and `--auth-option-divider: #ECECEC;` in the same `:root` block as `--auth-row-h` (so the media-query overrides of `--auth-row-h` still apply to it).
- Replace every other old green so **none of these remains anywhere in the file** (a test greps for them): `#09B158`, `#067A3D`, `#07B659`, `#40CD7B`, `#F4FCF6`, `rgba(9, 177, 88, …)` (becomes `rgba(34, 197, 94, …)` with the same alpha; three places plus the button shadow).
- **`.auth-btn`** (the primary pill): `color: #111111` (dark text on the green, palette primary text; the arrow follows `currentColor`); `.auth-btn:hover:not(:disabled)` `background: #16A34A` (replace the brightness filter); `.auth-btn:active:not(:disabled)` `background: #15803D` (keep the small scale); `.auth-btn:disabled` `background: #DFDFDF; color: #717171; opacity: 1; box-shadow: none; cursor: not-allowed` (palette: primary button disabled, with the readable secondary-text colour, not the palette's `#C4C4C4`, which would be unreadable); keep the existing focus ring (`outline: 2px solid var(--auth-green)`). Keep B-8's `.auth-btn.auth-btn-count:disabled` as it is. `.auth-btn-quiet` and everything not green is untouched.
- **New rules** for the grouped list (add next to `.auth-choice`, leave `.auth-choice` itself as is except its green values; chips and the Connect screen still use it):
```css
.auth-option-group { border: 1px solid #DFDFDF; border-radius: 16px; overflow: hidden; background: #FFFFFF; }
.auth-option-group[data-invalid="true"] { border-color: var(--auth-error-line); }
.auth-option { background: #FFFFFF; border-color: var(--auth-option-divider); transition: background-color 150ms ease; }
.auth-option[aria-checked="true"] { background: var(--auth-sel-bg); }
.auth-option:focus-visible { outline: 2px solid var(--auth-green); outline-offset: -2px; }
```
- Do not change any non-green colour, any spacing token other than the two above, or any other screen's component. The screens that read these tokens (login, sign-up, code screens, All set, Connect, Details) change colour only.

## Red tests (already written and committed; fixed, do not edit, weaken or delete)
**19 fail now** for this task (the 3 tick tests in `authMotion.test.ts` belong to B-10, already green by the time you start). Run these and confirm: `src/features/auth/redesign/InvestorProfile.test.tsx` (11 red), `src/features/auth/redesign/authGreen.test.ts` (7 red), `src/features/auth/redesign/authMotion.test.ts` (1 red: the green hex). When done all pass, and so do `authGuards.test.ts`, `authErrors.test.tsx` and everything under `src/features/auth` and `src/features/profile-v2` (which reads the shared goal labels).
Note: the five-window-size fit (1280×600, 1366×650, 1440×810, 1536×730, 1920×1080, no scrolling) cannot be tested in jsdom. The orchestrator measures it in a browser and sends back exact differences; build to the workbook's numbers (rows at most 48 px, the spacing above) and do not add scrolling or shrink anything not named here.

## Files you may change
`frontend/src/features/auth/redesign/InvestorProfile.tsx`, `OptionRow.tsx`, `finishCopy.ts` (only the four `subtitle` fields), `frontend/src/styles/auth-tokens.css`. `ChipCheckbox.tsx` only if a test needs it (none should). Anything else: stop and report.
## Do not touch
`backend/**`, `frontend/src/mobile/**`, every `*.test.*` file, `features/profile-v2/**`, `loginThrottle.ts`, `AllSet.tsx`, `StatusRow.tsx`, `LoginEntry.tsx`, `package.json`.

## Checks (PowerShell)
```
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-b12 test src/features/auth src/features/profile-v2
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-b12 types
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-b12 lint src/features/auth src/styles
```

## Report (one block, nothing else)
Failing counts before (expect 19 in the three files) and after; exact commands and results; `git status --short`; the search result for readers of the removed subtitle; decisions the packet did not cover; anything you could not check (visual; the five-size fit); Open questions.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-18-b12-onboarding-green-packet.md (your task: B-12)
Work only in C:\Users\Ayush\ag-b12 on branch ag/b12-onboarding. Tests first: run the three named test files and confirm 19 fail before you change anything. Never run a git command that changes anything. Do not touch backend/** or any file outside the packet's Files list.
When done, reply with the report block from the packet, nothing else.
```
