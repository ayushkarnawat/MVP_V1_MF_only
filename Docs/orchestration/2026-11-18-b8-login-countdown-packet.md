# Packet B-8: Get OTP counts down while the same address is held (Antigravity, lane G-b, first of three)
**Batch B, item 4.** Plan: `Docs/superpowers/plans/2026-11-17-batch-b-journey-plan.md` (Task B-8). **Design source: `Docs/orchestration/2026-11-12-batch-b-planning-workbook.html`, section 3**, the laptop frames "Proposed: button counts down, one red line says why" and "After editing the email: the button is live again, no line" at 1280×600, 1440×810 and 1536×730. The workbook is the design: a deviation is a defect; if the workbook and the real component disagree, stop and say so.

**Your clone:** `C:\Users\Ayush\ag-b8` (branch `ag/b8-countdown`, cut from `batch/b-journey` at `6c2f7c42`). Work only there. Never edit `D:\Unifolio code`. Never run a git command that changes anything.
**Read first, in order:** `Docs/orchestration/ui-common-rules-antigravity.md`, `Docs/orchestration/wave-common-rules.md` (wins where they differ), `Docs/orchestration/2026-11-18-palette-reference-for-workers.md`, then this packet.
You are the first of three tasks in lane G-b, which owns the auth screens and `styles/auth-tokens.css` one task at a time (B-8, then B-10, then B-12). Nothing else touches those files while you work.

## What exists already (do not rebuild; all committed on your branch)
- `features/auth/api.ts`: on a 429 whose body carries `retry_after_seconds` and `code`, the thrown `ApiError` keeps the plain sentence as `payload` and carries `retryAfterSeconds` and `code` as properties.
- `features/auth/validation.ts`: `retryAfterSeconds(err): number | null` and `isSameAddressThrottle(err): boolean` (true for code `otp_throttled`, false for the per-network limit code `request_limited`).
- `features/auth/redesign/useResendCountdown.ts`: `useResendCountdown(start)` returns `{ seconds, active, restart }` and `restart(next?)` starts from `next`; `formatMmSs(seconds)` gives `00:42`.
- `features/auth/redesign/loginThrottle.ts`: the type `LoginThrottle { channel: "email" | "phone"; value: string; seconds: number; stamp: number }`. **Do not edit it.**
- The server side (B-1) is being built separately; you build only the screen and the flow wiring.

## Behaviour to build
**LoginEntry** (`features/auth/redesign/LoginEntry.tsx`) gets one new optional prop `throttle?: LoginThrottle | null`.
- The countdown is **active** when all hold: `throttle` is set; its `channel` equals the current tab; the typed value is the held one; the countdown has seconds left. "Is the held one": email compared after `trim()` and lower-casing; phone compared after `validateIndianPhone(value).normalized` (so `98765 43210` equals `+919876543210`); an invalid phone is never equal.
- Countdown runs from `throttle.seconds` and **restarts whenever `throttle.stamp` changes** (the same address held again restarts from the new seconds). Use `useResendCountdown` and `restart(throttle.seconds)`. Timers are cleared when the screen closes (the hook already does it).
- While active: the button is **disabled** with the label `Get OTP again in 00:42` (mm:ss, via `formatMmSs`), no trailing arrow (`arrow={false}`); the form sends nothing (button click **and** Enter/submit); one red line sits directly under the button (below).
- Not active (the typed value differs, the other tab, the countdown reached 0, or no throttle): the screen is exactly today's: `Get OTP` live, no red line. Typing the held value back makes it active again with the remaining seconds.
- While a request runs (`submitting`) the button is disabled and reads `Sending...` as today, with or without a throttle.
- The existing `error` alert keeps working unchanged (no-account error with its Sign up action, the per-network sentence, any other).
**The red line:** text exactly `For your security, a new code can be requested once a minute.`; element `<p>` with `id` (use `useId`), classes `mt-1.5 text-[13px] text-[var(--auth-error)] whitespace-nowrap` (workbook: 13px, 6px above, one line, no box); **not** an alert panel and not `role="alert"`. The button gets `aria-describedby` pointing at that id while the line shows. Button and line sit in one wrapper `<div>` so the line follows the button directly.
**Countdown button look** (workbook `.o-go.dis`, with palette colours): grey pill, same height and width as the live button. Add one class pair in `styles/auth-tokens.css`, `.auth-btn.auth-btn-count:disabled` { background: `#DFDFDF` (palette: primary button disabled); color: `#717171` (palette: secondary text); opacity: 1; box-shadow: none; cursor: not-allowed }. The workbook drew `#E5E7EC` and `#6B7280`; the palette values replace them. The palette's disabled-text colour `#C4C4C4` is not used here because it would be unreadable on `#DFDFDF` (a countdown people must read): report this in Open questions. Auth screens are light only. Do not change any other rule in that file.

**AuthEntryFlow** (`features/auth/AuthEntryFlow.tsx`, the **split login only**; the legacy screens and every phone screen stay as they are):
- New state `loginThrottle: LoginThrottle | null` (start null) and a counter for `stamp`.
- In `handleEmailLoginRequest` and in `handlePhoneSubmit` (only when `authMode === "login"`), in the `catch`: if `isSameAddressThrottle(err)`, call `setLoginThrottle({ channel, value: <the email or phone just sent>, seconds: retryAfterSeconds(err)!, stamp: next })` and **do not** set `error` (no red box). Otherwise behave as today (`setError(errorMessage(...))`), so the per-network limit, the no-account error and an old-style 429 (sentence only) show in the red box exactly as now.
- Clear `loginThrottle` when a request succeeds. Pass `throttle={loginThrottle}` to the split `LoginEntry` only.

## Red tests (already written and committed; fixed, do not edit, weaken or delete)
- `frontend/src/features/auth/redesign/LoginEntry.test.tsx`, block "LoginEntry: countdown while the same address is held (Batch B, item 4)" (16 tests, 8 red now).
- `frontend/src/features/auth/AuthEntryFlow.split.test.tsx`, block "AuthEntryFlow, split variant, login: a held code (Batch B, item 4)" (7 tests, 4 red now).
Before you start run both files and confirm **12 failed**. When done: all pass, plus every other test in those two files, plus `validation.test.ts`, `api.test.ts`, `redesign/useResendCountdown.test.ts`, `AuthEntryFlow.test.tsx`, `redesign/AuthSplitCard.layout.test.tsx` and the guard tests that read `auth-tokens.css` (search `frontend/src` for tests that import it or read its text).
`tsc` shows errors about a missing `throttle` prop in `LoginEntry.test.tsx` until you add it; after your change it must be clean.

## Files you may change
`frontend/src/features/auth/redesign/LoginEntry.tsx`, `frontend/src/features/auth/AuthEntryFlow.tsx`, `frontend/src/styles/auth-tokens.css` (only the one class pair above). Anything else: stop and report.
## Do not touch
`backend/**`, `frontend/src/mobile/**`, any `*.test.*` file, `loginThrottle.ts`, `api.ts`, `validation.ts`, `useResendCountdown.ts`, `package.json`.

## Checks (PowerShell)
```
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-b8 test src/features/auth/redesign/LoginEntry.test.tsx src/features/auth/AuthEntryFlow.split.test.tsx
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-b8 test src/features/auth
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-b8 types
wsl.exe -d Ubuntu -- bash "/mnt/d/Unifolio code/Docs/orchestration/wave-fe-check.sh" ag-b8 lint src/features/auth src/styles
```

## Report (one block, nothing else)
Failing counts before (expect 12) and after; the exact commands and results; `git status --short` (only the three files, plus untracked docs); decisions the packet did not cover; anything you could not check (visual); Open questions. The orchestrator screenshots at the three window sizes next to the workbook frames and sends exact differences; fix only those.

## Paste-ready prompt
```
You are the frontend worker for Unifolio (Antigravity). Read, in order:
1. Docs/orchestration/ui-common-rules-antigravity.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-18-palette-reference-for-workers.md
4. Docs/orchestration/2026-11-18-b8-login-countdown-packet.md (your task: B-8)
Work only in C:\Users\Ayush\ag-b8 on branch ag/b8-countdown. Tests first: run the two named test files and confirm 12 fail before you change anything. Never run a git command that changes anything. Do not touch backend/** or any file outside the packet's Files list.
When done, reply with the report block from the packet, nothing else.
```
