# QA Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo the workers are Gemini in Antigravity (front end, from packets) and the orchestrator (back end, git, screenshots, reviews); see Global Constraints.

**Goal:** Ship the ten polish and clarity changes that came out of the 5 Nov 2026 staging QA (UI round 2 sheet and change requests sheet), so every changed screen looks exactly like its mockup and every other screen stays as it is today.

**Architecture:** Two small back end changes (refusal bodies with an IST date, new email templates) land first and unblock the front end. Nine front end changes follow as three Gemini packets (`qa-fe-1` to `qa-fe-3`), each task test-first, each checked by screenshot against the mockup in the spec. A baseline before the work and a regression comparison after it prove nothing else moved. A combined staging guide and QA checklist are written last.

**Tech Stack:** FastAPI, SQLAlchemy, pytest (back end); React, Vite, Tailwind, Vitest (front end, desktop only); no new dependency.

**Spec:** `Docs/superpowers/specs/2026-11-06-qa-fixes-design.html` (the planning artifact, with every decision and confirmation recorded, the before and after mockups, the flows and the file map). Executors read it and this plan. Item ids A1 to C5 below are the spec's ids.

## Global Constraints

- **Branch:** all work is on `leapswitch-redesign`, through the local lane branch `qa-fixes-lane` in worktree `C:\Users\Dell\Desktop\MVP v1\wt\qa-fixes`. The orchestrator commits and pushes everything: `git fetch origin && git rebase origin/leapswitch-redesign && git push origin qa-fixes-lane:leapswitch-redesign`. Never force-push. Never push to `main`, `feat/leapswitch-staging` or `release/change-requests`. Commit prefix `qa:`. Co-author line as in the session reminder. Shared logs (`delegation-log.md`, `ui-run-log.md`): append only, keep both sides on a conflict.
- **Workers:** Gemini in Antigravity writes the front end from packets and never runs a git command that changes anything, never edits `backend/**`, cannot see the screen (the orchestrator takes every screenshot); rules in `Docs/orchestration/ui-common-rules-antigravity.md`. The back end tasks (1 and 2) are small and are written by the orchestrator, because Antigravity is front end only. Not Codex.
- **Desktop only:** nothing under `frontend/src/mobile/**` changes; `/mobile` paths, `isMobile` and `variant="legacy"` behave exactly as today.
- **No migration, no new dependency, no `package.json` or lockfile change.**
- **Head of Family rules unchanged:** eligibility, the four codes, the 7-day and 24-hour locks, the undo window and who receives the undo link are not touched; the server still decides everything.
- **Mockups are the acceptance picture.** Each front end task is accepted only when the orchestrator's screenshot (1440x810 and 1920x1080) matches the mockup in the spec. Everything not named in a task stays byte-identical: every packet carries an allowed-files list, and the orchestrator rejects a diff that touches anything else.
- **Copy:** use the spec's strings exactly; plain words; no em dashes; never guess a pronoun for a person (use the name or "they/them").
- **Times shown to users are India time:** dates as `12 Nov 2026`, date and time as `6 Nov 2026, 3:33 PM IST`.
- **Tests first:** every task writes the failing test, runs it red, then implements. Back end: `wsl.exe -d Ubuntu -- bash -lc 'cd "/mnt/c/Users/Dell/Desktop/MVP v1/wt/qa-fixes/backend" && /home/delladiti/cr-venv/bin/python -m pytest <paths> -q -p no:cacheprovider'`. Front end: through the WSL check script named in the Antigravity rules file (`test <paths under src/>`, `types`, `lint`, `build`).
- **Token rule for the UI:** mockup colours are approximations. Packets map each one to the app's real token (`--ui-*`, `--shell-*`, `--pos`, `--neg`, and `--auth-*` on sign-up and sign-in screens) and never hard-code a mockup hex, except the new `--auth-error*` tokens in Task 5.

## Review Focus

Failure modes the spec implies but no single task's happy path exercises, most likely first. Each has its test in the task named.

1. **Mobile regression through shared code** (logout, onboarding, import notice): a logout under `/mobile` must not touch the address; mobile onboarding must still complete as today. Tests in Tasks 6 and 7.
2. **Old import notices already in history state** (no `members` field) must still render as plain lines, never crash. Test in Task 3.
3. **Choose head dialog after the profile dialog**: the member was merged away or changed, a start code was already sent (rows stay disabled), the list reloads from the server. Tests in Task 8.
4. **Onboarding completion**: View details must not save it; the browser Back and the dialog's Back both return to All set; a double click on "Go to my dashboard" saves once; a reload on the details dialog resumes on All set. Tests in Task 7.
5. **Refusal body shapes**: the account deletion refusal was a bare string and becomes an object; the front end must read either, and a date at 18:30 UTC must show as the next India day. Tests in Tasks 1 and 11.
6. **Emails**: the undo link and button appear only in the undo email and only for the old head's own addresses; HTML is escaped; the plain-text part carries the same link. Tests in Task 2.

---

## File Structure

| Area | Create | Modify |
|---|---|---|
| Back end time | `backend/app/core/time_format.py` | |
| Back end refusals | | `backend/app/services/auth/head_change.py`, `backend/app/services/import_/deletion.py`, `backend/app/api/dashboard.py`, `backend/app/api/auth.py` |
| Back end emails | | `backend/app/services/auth/email_templates.py`, `backend/app/services/auth/head_change.py` |
| Import notice | | `frontend/src/components/mf/PostImportNotice.tsx`, `frontend/src/features/import/importNotice.ts` |
| Donut | `frontend/src/features/home/useHeldActive.ts` and `components/AllocationLegendRow.tsx` | `frontend/src/features/home/components/AllocationDonut.tsx`, `frontend/src/features/home/sections/Allocation.tsx` |
| Auth errors | | `frontend/src/styles/auth-tokens.css`, `features/auth/redesign/InvestorProfile.tsx`, `AuthAlert.tsx`, `AuthField.tsx`, `SignupPhoneEntry.tsx` |
| Login landing | | `frontend/src/features/auth/AuthContext.tsx` |
| Back from details | `features/auth/redesign/ImportDetailsDialog.tsx`, `frontend/src/shell/nav/useBack.ts` | `features/auth/OnboardingFlow.tsx`, `features/auth/redesign/AllSet.tsx`, `features/profile/ImportHistorySection.tsx`, `features/profile-v2/pages/ImportHistoryPage.tsx` |
| Head of Family dialog | `features/profile-v2/lib/headEligibility.ts` | `features/profile-v2/components/ChangeHeadDialog.tsx`, `features/auth/session.ts`, `features/auth/AuthEntryFlow.tsx`, `features/auth/redesign/LoginEntry.tsx`, `AuthAlert.tsx` |
| Refusal notices | `frontend/src/features/auth/refusal.ts` | `features/profile-v2/components/DeleteMemberDialog.tsx`, `DeleteAccountDialog.tsx` |
| Docs | staging guide, QA checklist, packets `Docs/orchestration/qa-fe-1-packet.md` to `qa-fe-3-packet.md` | `backend.md`, `decisions.md`, `session.md`, `log.md`, `delegation-log.md` |

All front end paths above are relative to `frontend/src/` unless they start with `frontend/`.

---

### Task 0: Baseline and branch

**Files:**
- Create: `Docs/orchestration/qa-fixes-baseline.md`
- Create: baseline screenshots in the orchestrator's scratch folder (not committed)

- [ ] **Step 1:** In worktree `wt/qa-fixes` on `qa-fixes-lane` (cut from `origin/leapswitch-redesign` at `72badaef`), run `git status --short` and confirm it prints nothing.
- [ ] **Step 2:** Run the back end suites `tests/services/auth tests/api tests/services/import_` and the front end suites for the folders this plan touches (`components/mf`, `features/import`, `features/home`, `features/auth`, `features/profile`, `features/profile-v2`, `shell`); record pass, fail and skip counts in `qa-fixes-baseline.md`. Expected: the same counts as the last staging deploy record; any failure is named as pre-existing.
- [ ] **Step 3:** With the dev server and the fixtures page (`/dev/auth-screens` for sign-up and sign-in screens, fixture households for the app), take baseline screenshots at 1440x810 of the **changed** screens (import notice, Home donut, sign-up screen 4, All set, Import History, Choose head dialog, review step, sign-in page, both delete dialogs) and of **neighbouring unchanged** screens (Home, Mutual Funds Overview, Holdings, Profile Family, Profile Settings, sign-up screens 1 to 3, login). Name them `before-<screen>.png`.
- [ ] **Step 4:** Commit `qa: baseline for the QA fixes` with only `qa-fixes-baseline.md`, then publish with the routine in Global Constraints.

---

### Task 1: Back end, India time helper and refusal bodies (C4 back end)

**Files:**
- Create: `backend/app/core/time_format.py`
- Modify: `backend/app/services/auth/head_change.py` (add `member_head_change_lock_until` next to `member_in_recent_head_change`)
- Modify: `backend/app/services/import_/deletion.py:42-48` (`MemberRemovalBlockedError`) and `:226`
- Modify: `backend/app/api/dashboard.py:173-177`
- Modify: `backend/app/api/auth.py:655-668`
- Test: `backend/tests/core/test_time_format.py`, `backend/tests/services/auth/test_head_change_lock.py`, `backend/tests/api/test_refusal_bodies.py`

**Interfaces:**
- Produces: `format_ist_date(value: datetime) -> str` returns `"12 Nov 2026"` (no zero-padded day); `format_ist_datetime(value: datetime) -> str` returns `"6 Nov 2026, 3:33 PM IST"` (12-hour clock, no zero-padded hour); a naive datetime is read as UTC.
- Produces: `member_head_change_lock_until(db: DbSession, member_id: uuid.UUID) -> datetime | None`, the timezone-aware UTC moment the member may be removed (latest `completed_at + CHANGE_AGAIN_AFTER_DAYS` over their `completed` and `undone` requests), `None` when not locked; true exactly when `member_in_recent_head_change` is true.
- Produces: `MemberRemovalBlockedError(available_after: datetime)` with attributes `available_after` and `message`; message text `"This person was part of a recent Head of Family change, so they cannot be removed yet. You can remove them on {format_ist_date(available_after)}."`
- Produces: 409 bodies. Member removal: `{"code": "member_in_recent_head_change", "message": <above>, "available_after": <ISO 8601 UTC>}`. Account deletion: `{"code": "head_change_undo_window", "message": "The Head of Family was changed in the last 24 hours. You can delete this account after the undo window closes on {format_ist_datetime(window_closes)}.", "available_after": <ISO 8601 UTC>}`. Status stays 409.

- [ ] **Step 1: Write the failing tests.** `test_format_ist_datetime_converts_utc_to_india_time` (`2026-11-06 10:03 UTC` gives `"6 Nov 2026, 3:33 PM IST"`); `test_format_ist_date_rolls_to_the_next_india_day` (`2026-11-11 19:00 UTC` gives `"12 Nov 2026"`); `test_a_naive_datetime_is_read_as_utc`; `test_member_head_change_lock_until_is_completed_at_plus_seven_days`; `test_member_head_change_lock_until_is_none_when_the_change_is_older_than_seven_days`; `test_lock_until_is_set_exactly_when_member_in_recent_head_change_is_true`; `test_member_removal_refusal_carries_code_message_and_date`; `test_account_deletion_refusal_carries_code_message_and_date`; `test_account_deletion_still_succeeds_when_no_window_is_open`; `test_member_removal_still_works_for_a_member_outside_a_recent_change`.
- [ ] **Step 2:** Run the three test files; expected: FAIL (module and function not defined, old string bodies).
- [ ] **Step 3:** Implement `time_format.py` with `zoneinfo.ZoneInfo("Asia/Kolkata")` (already used in `api/home.py`), `member_head_change_lock_until` reusing `_completed_at(item)`, the error class and the two route bodies above. One line: build `available_after` from the helper and format the message with `format_ist_*`.
- [ ] **Step 4:** Run the three files plus `tests/api/test_head_change_routes.py` and `tests/services/auth`; expected: PASS, no other test changes.
- [ ] **Step 5:** Commit `qa: refusal bodies carry a code, a message and an India-time date (C4 back end)`; publish.

---

### Task 2: Back end, new email templates (C5)

**Files:**
- Modify: `backend/app/services/auth/email_templates.py` (add a `.cta` button style to `_email_header`, extend `_notice_email_html`, replace `head_changed_email`, rework `head_change_undo_email`)
- Modify: `backend/app/services/auth/head_change.py:897-985` (`_send_completion_notices` passes the right template and the expiry)
- Test: `backend/tests/services/auth/test_email_templates.py`, `backend/tests/services/auth/test_head_change_flow.py`

**Interfaces:**
- Consumes: `format_ist_datetime` from Task 1.
- Produces: `head_changed_for_new_head_email(*, new_head_name: str, old_head_name: str) -> tuple[str, str, str]`; `head_changed_for_old_head_email(*, new_head_name: str, old_head_name: str) -> tuple[str, str, str]`; `head_change_undo_email(*, undo_url: str, valid_until: datetime) -> tuple[str, str, str]`; each returns `(subject, plain_text, html)`. `head_changed_email` is removed (its only caller is `_send_completion_notices`). Subjects are unchanged: `"The Head of Family on Unifolio has changed."` for both notices, `"Undo the Head of Family change."` for the undo email.
- Copy, exact. New head: headline `You are now Head of Family.`, body `Sign in with this email or your phone number. All portfolio data is unchanged. If this was not you, contact support@unifolio.in.` Old head notice: headline `The Head of Family on your account has changed.`, body `{new_head_name} is now Head of Family and signs in with their own email and phone. You ({old_head_name}) remain a member and can no longer sign in with this email. All portfolio data is unchanged.` then `Did not agree to this? A second email, "Undo the Head of Family change.", has the link to undo it. If this was not you, contact support@unifolio.in.` Undo email: headline `Undo the Head of Family change`, body `Use this button to restore the previous sign-in.`, button text `Undo the Head of Family change`, small line `Valid until {format_ist_datetime(valid_until)}. It stops working if the old phone or email is taken meanwhile.`, fallback line `Button not working? Copy this link: {undo_url}`.
- Unchanged: three deliveries in the same order to the same recipients, the token, the link address and the failure recording.

- [ ] **Step 1: Write the failing tests.** `test_new_head_email_is_worded_for_the_new_head_and_has_no_link`; `test_old_head_notice_is_worded_for_the_old_head_and_names_the_second_email`; `test_old_head_notice_has_no_link_or_button`; `test_undo_email_has_one_button_and_the_plain_link_and_the_ist_expiry`; `test_undo_email_html_escapes_names_and_the_plain_text_part_carries_the_url`; `test_notice_subjects_are_unchanged`; in the flow test `test_completion_sends_three_emails_and_the_link_goes_only_to_the_old_head_addresses`; `test_a_failed_undo_send_is_still_recorded_and_does_not_fail_the_change`.
- [ ] **Step 2:** Run both files; expected: FAIL (new functions not defined).
- [ ] **Step 3:** Implement the three template functions. The button is one `<a class="cta" href="...">` using the email's existing brand green (`#22C55E`) with a dark-mode override beside the other `!important` rules; no other email's HTML changes (`test_existing_signin_email_html_is_unchanged_by_default` must still pass). Update `_send_completion_notices` to call the new functions and pass `request.undo_expires_at` as `valid_until`.
- [ ] **Step 4:** Run `tests/services/auth` and `tests/api/test_head_change_routes.py`; expected: PASS. Remove or update only the old tests that named `head_changed_email`.
- [ ] **Step 5:** Commit `qa: new head of family email templates with an undo button (C5)`; publish.

---

### Task 3: Import notice card (A1) · Gemini packet `qa-fe-1`

**Files:**
- Modify: `frontend/src/components/mf/PostImportNotice.tsx`, `frontend/src/features/import/importNotice.ts`
- Test: `frontend/src/components/mf/PostImportNotice.test.tsx`, `frontend/src/features/import/importNotice.test.ts`
- Packet: `Docs/orchestration/qa-fe-1-packet.md`

**Interfaces:**
- Produces: `ImportNotice` gains optional `members?: { name: string; added: number; skipped: number }[]` and `warnings?: string[]`; `details` is still produced so an older notice object keeps working. `buildImportNotice(result)` fills `members` for a multi-person import.
- Component contract (test ids): `import-notice-card` (keeps `role="status"`), `import-notice-title` ("Import complete"), `import-notice-summary`, `import-notice-members`, `import-notice-fund-chips`; two separate buttons, `View new funds` (only with new funds) and an icon button with `aria-label="Dismiss import notice"`.
- UI contract (full detail goes in the packet): card radius 14 px, padding 14 px, 1 px `--ui-divider` border on `--ui-card`; header row with an 18 px circle-check in the positive colour, title 14.5 px / 700, close icon at the right; summary line 13 px with the count bold; one row per person with a 6 px vertical rhythm, a 1 px top border and a count chip (11.5 px / 600, pill); a "New funds" label (11.5 px muted) over at most 3 name chips and a muted `+N more`; the action is the shared outline button (pill, 12.5 px / 600). The plain notice (no new funds) uses the same card without the chips and the button. Never auto-dismisses.

- [ ] **Step 1: Orchestrator writes the packet** from this task and the spec's A1 mockup: the mockup HTML verbatim, a measurement table, the token map, the DOM with the test ids, the red tests as code, the allowed-files list (the four files above), the do-not-touch list (`NewFundsList.tsx`, the Overview page, everything under `mobile/`), and the screenshot acceptance.
- [ ] **Step 2: Write the failing tests** (orchestrator commits them red before the packet goes out, with a reference solution proven green, as in UI round 2): `shows_title_summary_and_one_row_per_person`; `shows_at_most_three_fund_chips_and_a_plus_n_more`; `view_new_funds_and_dismiss_are_two_separate_buttons`; `an_older_notice_without_members_still_renders_its_detail_lines`; `the_plain_notice_has_no_chips_and_no_view_new_funds_button`; `it_does_not_dismiss_by_itself`; keep every existing behaviour test (other user, null state, dismiss clears state and keeps the address, list pop-up and Esc).
- [ ] **Step 3:** Hand the packet to Gemini; review the diff against the allowed-files list.
- [ ] **Step 4:** Run the touched suites, `types`, `lint`, `build`; expected: PASS.
- [ ] **Step 5:** Screenshot the notice with the 6-new-funds fixture at 1440x810 and 1920x1080 next to the A1 mockup; compare spacing, type sizes, chip shape and button; fix until they match.
- [ ] **Step 6:** Commit `qa: import notice as a structured card (A1)`; publish.

---

### Task 4: Home donut hover (A2) · packet `qa-fe-1`

**Files:**
- Create: `frontend/src/features/home/useHeldActive.ts` and `components/AllocationLegendRow.tsx`
- Modify: `frontend/src/features/home/components/AllocationDonut.tsx`, `frontend/src/features/home/sections/Allocation.tsx:40,176-209`
- Test: `frontend/src/features/home/lib/useHeldActive.test.ts`, `frontend/src/features/home/components/AllocationDonut.test.tsx`

**Interfaces:**
- Produces: `useHeldActive(clearDelayMs?: number): { active: string | null; enter: (key: string) => void; leave: () => void; clearNow: () => void }`; `leave` clears after `clearDelayMs` (default 90) unless `enter` runs first; `clearNow` is for blur.
- `AllocationDonut` keeps its props and its `data-dim` attribute; dimming moves from an inline opacity to a class with `transition-[opacity,stroke-width] duration-150 ease-out motion-reduce:transition-none` and 38% opacity; the active slice has `strokeWidth` 25 against 22; each slice gets a transparent hit circle of stroke width 28 that carries the mouse handlers; the donut and each legend row are wrapped in `React.memo`.

- [ ] **Step 1: Packet** section in `qa-fe-1-packet.md` with the live demo's behaviour as the reference (hold across slices, 150 ms fade, 3 px grow) and the exact class names.
- [ ] **Step 2: Write the failing tests:** `hook_holds_the_highlight_when_moving_between_slices` (fake timers: leave then enter within 90 ms keeps the new key); `hook_clears_after_the_delay_when_the_pointer_leaves`; `clearNow_clears_immediately`; `donut_dims_through_a_class_not_an_inline_style`; `active_slice_is_three_px_wider`; `keyboard_focus_still_sets_and_blur_clears_the_highlight`; `enter_and_space_still_open_the_class_pop_up`; `legend_rows_use_the_same_held_state`; `reduced_motion_class_is_present`.
- [ ] **Step 3:** Hand to Gemini; review against the allowed-files list.
- [ ] **Step 4:** Run `features/home`, `types`, `lint`, `build`; expected: PASS.
- [ ] **Step 5:** Screen-record or step-screenshot the hover across all slices and compare with the demo on the spec page; confirm the pop-up, keyboard and focus rings are unchanged.
- [ ] **Step 6:** Commit `qa: smooth Home donut hover with a held highlight (A2)`; publish.

---

### Task 5: Sign-up and sign-in error styling (B1) · packet `qa-fe-2`

**Files:**
- Modify: `frontend/src/styles/auth-tokens.css`, `features/auth/redesign/InvestorProfile.tsx:154,184`, `AuthAlert.tsx`, `AuthField.tsx`, `SignupPhoneEntry.tsx`
- Test: `features/auth/redesign/InvestorProfile.test.tsx`, `AuthAlert.test.tsx`, `AuthField.test.tsx`, `SignupPhoneEntry.test.tsx`

**Interfaces:**
- Produces tokens in `auth-tokens.css`: `--auth-error: #B42318`, `--auth-error-bg: #FEF3F2`, `--auth-error-line: #FDA29B` (never overridden by the dark theme).
- `AuthAlert` gains an optional `title?: string` (used in Task 10) and its error tone reads the three tokens; an inline error component `AuthInlineError({ children })` renders an icon, the text at 13.5 px / 600 in `--auth-error` on `--auth-error-bg` with a `--auth-error-line` border, radius 10 px, and keeps `role="alert"`.
- `InvestorProfile` outlines the failing option group and the failing goal group with `--auth-error-line`; focus still moves to the first error.

- [ ] **Step 1: Packet** section in `qa-fe-2-packet.md` from the spec's B1 mockup.
- [ ] **Step 2: Write the failing tests:** `both_errors_render_as_alerts_with_an_icon`; `only_the_failing_group_is_outlined`; `focus_goes_to_the_first_error`; `answering_clears_that_error_and_its_outline`; `alert_error_tone_uses_the_auth_error_tokens`; `field_error_uses_the_auth_error_tokens`; `no_auth_redesign_component_reads_neg_text_for_errors` (a source scan of the four files); `info_tone_is_unchanged`.
- [ ] **Step 3:** Hand to Gemini; review.
- [ ] **Step 4:** Run `features/auth`, `types`, `lint`, `build`; expected: PASS.
- [ ] **Step 5:** Screenshot sign-up screen 4 with both errors in light and in dark OS mode at 1440x810 next to the B1 mockup; the error must read clearly in both.
- [ ] **Step 6:** Commit `qa: theme-proof error styling on the sign-up screens (B1)`; publish.

---

### Task 6: Login lands on Home after a manual logout (B2) · packet `qa-fe-2`

**Files:**
- Modify: `frontend/src/features/auth/AuthContext.tsx:78-82`
- Test: `frontend/src/features/auth/AuthContext.test.tsx`

**Interfaces:**
- `logout(): void` keeps its signature. Its two callers are the Profile Logout button and the end of a Head of Family change, both manual. After clearing the session it resets the address to `/` with `history.replaceState` **unless** the path starts with `/mobile`. Session expiry and a missing token take other paths (`resume()`), which do not call `logout`, so a deep link or expired session keeps its address and login returns to that page.

- [ ] **Step 1: Packet** section (short; no pixels, behaviour only) with the before and after flow from the spec.
- [ ] **Step 2: Write the failing tests:** `manual_logout_from_profile_family_resets_the_address_to_root`; `logout_under_a_mobile_path_does_not_touch_the_address`; `an_expired_token_on_load_keeps_the_address`; `a_deep_link_opened_while_signed_out_is_still_open_after_login`; `after_logout_and_login_the_app_shows_home`; `the_public_undo_and_reverse_pages_are_not_affected`.
- [ ] **Step 3:** Hand to Gemini; review.
- [ ] **Step 4:** Run `features/auth`, `shell`, `types`, `lint`; expected: PASS.
- [ ] **Step 5:** Walk it in the browser: log out from Profile, Family, log in again, confirm Home; open `/profile/family` signed out, log in, confirm Profile, Family.
- [ ] **Step 6:** Commit `qa: land on Home after a manual logout (B2)`; publish.

---

### Task 7: Back from View details and Import History (B3) · packet `qa-fe-2`

**Files:**
- Create: `frontend/src/features/auth/redesign/ImportDetailsDialog.tsx`, `frontend/src/shell/nav/useBack.ts`
- Modify: `features/auth/OnboardingFlow.tsx:164-173`, `features/auth/redesign/AllSet.tsx:16,74`, `features/profile-v2/pages/ImportHistoryPage.tsx`
- Test: `features/auth/redesign/AllSet.test.tsx`, `features/auth/redesign/ImportDetailsDialog.test.tsx`, `features/auth/OnboardingFlow.test.tsx`, `shell/nav/useBack.test.ts`, `features/profile-v2/pages/ImportHistoryPage.test.tsx`

**Interfaces:**
- `AllSet` props become `{ onFinish: () => void | Promise<void>; onViewDetails: () => void }` ("Go to my dashboard" calls `onFinish`; "View details" calls `onViewDetails`; `onFinish` no longer takes a target).
- `OnboardingFlow.finish(): Promise<void>` pushes `/home` then saves `onboarding_completed: true` (put back on failure) and is the only place completion is saved. It holds `detailsOpen`; opening pushes one history entry (`state.onboardingDetails = true`) and a `popstate` listener closes the dialog; the dialog's Back button calls `history.back()`.
- `ImportDetailsDialog({ open: boolean; onClose: () => void })` shows the existing `ImportHistorySection` read-only (no delete controls) in the light prompt dialog style used by the other sign-up pop-ups, titled "Import details", with a "← Back" button.
- `useBack(fallback: string): () => void` goes back one entry when the router history index is above 0, otherwise navigates to `fallback`. `ImportHistoryPage` replaces its fixed "← Settings" link with "← Back" using `useBack(paths.profileSettings())`.

- [ ] **Step 1: Packet** section from the spec's B3 mockup and flows, with the exact dialog structure and the history-entry mechanics.
- [ ] **Step 2: Write the failing tests:** `view_details_does_not_save_onboarding_complete`; `view_details_opens_the_dialog_and_back_button_closes_it_to_all_set`; `browser_back_closes_the_dialog_to_all_set`; `go_to_my_dashboard_saves_completion_once_even_on_a_double_click`; `a_failed_save_puts_the_address_back`; `a_reload_on_the_details_dialog_resumes_on_all_set`; `the_dialog_is_read_only_and_has_no_delete_control`; `mobile_onboarding_still_completes_as_before`; `useBack_goes_back_when_there_is_history_and_falls_back_to_settings_otherwise`; `import_history_page_back_returns_to_the_previous_screen`; `profile_import_history_section_keeps_its_delete_controls`.
- [ ] **Step 3:** Hand to Gemini; review.
- [ ] **Step 4:** Run `features/auth`, `features/profile`, `features/profile-v2`, `shell`, `types`, `lint`, `build`; expected: PASS.
- [ ] **Step 5:** Walk it: sign up through All set, View details, Back (button and browser), Go to my dashboard; then Profile, Settings, Import History, Back; then Mutual Funds, new-funds list, View all, Back. Screenshot the dialog over All set at 1440x810 next to the B3 mockup.
- [ ] **Step 6:** Commit `qa: Back returns to All set during sign-up and to the previous screen in the account (B3)`; publish.

---

### Task 8: Fix a member's missing details from the Choose head dialog (C1) · packet `qa-fe-3`

**Files:**
- Create: `frontend/src/features/profile-v2/lib/headEligibility.ts`
- Modify: `features/profile-v2/components/ChangeHeadDialog.tsx` (step 1 rows around `:520-600`, `loadEligibility` `:178`)
- Test: `features/profile-v2/lib/headEligibility.test.ts`, `features/profile-v2/components/ChangeHeadDialog.test.tsx`

**Interfaces:**
- Produces: `FIXABLE_REASONS: ReadonlySet<string>` (`no_email`, `no_phone`, `no_pan`, `label_missing`, `same_email_as_head`, `same_phone_as_head`, `email_in_use`, `phone_in_use`); `isFixable(reasons: readonly string[]): boolean` (true only when there is at least one reason and every reason is fixable); `fixableHint(reasons: readonly string[]): string` (for example `"Needs an email address and a phone number."`).
- `loadEligibility()` returns `Promise<MemberEligibilityItem[]>`. New state `detailsFor: string | null`. When set, the component returns `<CompleteProfileDialog member={...} onSaved onMerged onClose />` (from `features/dashboard/members/CompleteProfileDialog.tsx`) **instead of** its own `Modal`, keeping all its state; it is never rendered stacked. On `onClose` or `onMerged` it reloads eligibility and, if the member is now eligible, selects them (`setSelectedMemberId`).

- [ ] **Step 1: Packet** section in `qa-fe-3-packet.md` from the spec's C1 mockup: the row markup, the "Add details" chip, the hint copy per reason, and the flow.
- [ ] **Step 2: Write the failing tests:** `each_reason_is_classed_fixable_or_not`; `a_row_with_a_fixable_and_a_non_fixable_reason_is_not_fixable`; `a_fixable_row_is_clickable_and_shows_an_add_details_chip`; `a_non_fixable_row_stays_disabled_with_its_reason`; `clicking_a_fixable_row_hides_the_head_dialog_and_opens_the_profile_dialog`; `closing_the_profile_dialog_reloads_the_list_and_selects_an_eligible_member`; `a_member_still_ineligible_after_saving_shows_the_remaining_reason`; `a_member_merged_away_disappears_from_the_list`; `rows_stay_disabled_once_the_start_code_is_sent`; keep every existing dialog test.
- [ ] **Step 3:** Hand to Gemini; review (this is the security-sensitive screen: confirm no eligibility rule moved into the client).
- [ ] **Step 4:** Run `features/profile-v2`, `features/dashboard/members`, `types`, `lint`, `build`; expected: PASS.
- [ ] **Step 5:** Screenshot the list with "Add details" chips at 1440x810 next to the C1 mockup, then walk: click, save, return, member selected, Next enabled.
- [ ] **Step 6:** Scoped review of the diff for identity and eligibility handling; record it in `delegation-log.md`.
- [ ] **Step 7:** Commit `qa: fix a member's missing details from the Choose head dialog (C1)`; publish.

---

### Task 9: Review step redesign (C2) · packet `qa-fe-3`

**Files:**
- Modify: `features/profile-v2/components/ChangeHeadDialog.tsx` (step 3 markup, `:760-830`)
- Test: `features/profile-v2/components/ChangeHeadDialog.test.tsx`

**Interfaces:**
- No data change. Test ids: `head-review-title` (`{new head} becomes Head of Family`), `head-review-signin` (the new head's email and phone), `head-review-changes` (one row per label change, `Head of Family → Spouse` style), `head-review-signout` (callout `You will be signed out.` with the old head named), plus the reassurance line `All portfolio data stays exactly as it is.` The countdown chip stays; Confirm stays disabled until the preview has loaded; the "Please check this one after the change." and removed-note lines are kept.

- [ ] **Step 1: Packet** section from the spec's C2 mockup.
- [ ] **Step 2: Write the failing tests:** `review_shows_the_new_head_email_and_phone`; `review_lists_each_label_change_before_and_after`; `review_keeps_the_check_this_one_and_removed_note_lines`; `review_shows_the_signed_out_callout_naming_the_old_head`; `confirm_stays_disabled_until_the_preview_loads`; `the_countdown_chip_is_still_shown`.
- [ ] **Step 3:** Hand to Gemini; review.
- [ ] **Step 4:** Run the dialog suite, `types`, `lint`, `build`; expected: PASS.
- [ ] **Step 5:** Screenshot the review step at 1440x810 next to the C2 mockup (use the dialog's fixture preview).
- [ ] **Step 6:** Commit `qa: structured review step for a head change (C2)`; publish.

---

### Task 10: Sign-in card after a head change (C3) · packet `qa-fe-3`

**Files:**
- Modify: `features/auth/session.ts`, `features/auth/AuthEntryFlow.tsx:70-123,493`, `features/auth/redesign/LoginEntry.tsx:25,90`, `features/auth/redesign/AuthAlert.tsx` (title support from Task 5), `features/profile-v2/components/ChangeHeadDialog.tsx` (`finishSignedOut`)
- Test: `features/auth/session.test.ts`, `features/auth/redesign/LoginEntry.test.tsx`, dialog suite

**Interfaces:**
- Consumes: `maskEmail(email)`, `maskPhone(phone)` from `features/auth/validation.ts`; `AuthAlert`'s `title` prop from Task 5.
- Produces: `interface SignInNotice { title: string; body: string }` in `session.ts`; `setSignInNotice(notice: SignInNotice | null): void`; `getSignInNotice(): SignInNotice | null`; `LoginEntry`'s `notice?: string | SignInNotice | null` (a string still renders as before). `finishSignedOut` builds `{ title: "Head of Family changed", body: "Sign in with {maskEmail(new head email)} or {maskPhone(new head phone)}. {old head name} can no longer sign in." }`. The notice lives in memory only.

- [ ] **Step 1: Packet** section from the spec's C3 mockup.
- [ ] **Step 2: Write the failing tests:** `finishSignedOut_stores_a_structured_notice_with_masked_contact`; `the_notice_is_in_memory_only_and_cleared_by_the_next_login`; `login_entry_renders_the_card_with_title_and_body`; `login_entry_still_renders_a_plain_string_notice`; `the_notice_never_shows_the_unmasked_email_or_phone`.
- [ ] **Step 3:** Hand to Gemini; review.
- [ ] **Step 4:** Run `features/auth`, `features/profile-v2`, `types`, `lint`, `build`; expected: PASS.
- [ ] **Step 5:** Screenshot the sign-in page with the card at 1440x810 next to the C3 mockup.
- [ ] **Step 6:** Commit `qa: info card on the sign-in page after a head change (C3)`; publish.

---

### Task 11: Show the real refusal reason (C4 front end) · packet `qa-fe-3`

**Files:**
- Create: `frontend/src/features/auth/refusal.ts`
- Modify: `features/profile-v2/components/DeleteMemberDialog.tsx:34-36`, `DeleteAccountDialog.tsx:40-42`
- Test: `features/auth/refusal.test.ts`, `DeleteMemberDialog.test.tsx`, `DeleteAccountDialog.test.tsx`

**Interfaces:**
- Consumes: the 409 bodies from Task 1 (`ApiError.payload` is an object `{code, message, available_after}`, or a plain string from an older server).
- Produces: `readRefusal(err: unknown): { code: string | null; message: string } | null`, non-null only for an `ApiError` with status 409 and a readable message. Titles: `member_in_recent_head_change` gives `"{name} can't be removed yet"`; `head_change_undo_window` gives `"You can't delete this account yet"`. A refusal shows as the info tone (calm box) with the server's message, the destructive button gone or disabled, and one `OK`; any other failure keeps today's generic message and buttons.

- [ ] **Step 1: Packet** section from the spec's C4 mockups (both dialogs).
- [ ] **Step 2: Write the failing tests:** `readRefusal_reads_an_object_payload_and_a_string_payload`; `readRefusal_is_null_for_non_409_and_for_network_errors`; `a_member_refusal_shows_the_server_message_as_an_info_notice_with_one_ok`; `the_delete_member_button_is_not_offered_after_a_refusal`; `an_account_deletion_refusal_shows_the_server_message_and_one_ok`; `a_generic_failure_keeps_the_old_message_and_buttons`; `a_successful_delete_still_calls_onDeleted`.
- [ ] **Step 3:** Hand to Gemini; review.
- [ ] **Step 4:** Run `features/profile-v2`, `features/auth`, `types`, `lint`, `build`; expected: PASS.
- [ ] **Step 5:** Screenshot both refusal dialogs at 1440x810 next to the C4 mockups.
- [ ] **Step 6:** Commit `qa: show the real reason and date when a delete is refused (C4 front end)`; publish.

---

### Task 12: Integration and regression proof

**Files:**
- Create: `Docs/orchestration/qa-fixes-gate.md`

- [ ] **Step 1:** Rebase on `origin/leapswitch-redesign`; run the full back end suite (with Postgres for `functional_postgres`) and the full front end suite, `types`, `lint`, `build`; compare with `qa-fixes-baseline.md`; expected: only the new tests are added, no new failure.
- [ ] **Step 2:** Re-take every Task 0 screenshot as `after-<screen>.png`; for each **unchanged neighbouring** screen compare before and after pixel by pixel; expected: no difference. Any difference blocks the gate and is traced to its task.
- [ ] **Step 3:** For each **changed** screen, lay the final screenshot beside its mockup in `qa-fixes-gate.md` (screen, state, matches, differences) at 1440x810 and 1920x1080; the owner signs the table.
- [ ] **Step 4:** Confirm by `git diff --stat origin/leapswitch-redesign` that no file under `frontend/src/mobile/`, no migration, no `package.json` and no lockfile changed.
- [ ] **Step 5:** Commit `qa: gate evidence for the QA fixes`; publish.

---

### Task 13: Combined staging guide and QA checklist

**Files:**
- Create: `Docs/orchestration/2026-11-0X-staging-deploy-guide-qa-fixes.md`, `Docs/orchestration/2026-11-0X-staging-qa-checklist-qa-fixes.md` (dates set when written)
- Modify: `backend.md`, `decisions.md`, `session.md`, `log.md`, `delegation-log.md`

- [ ] **Step 1:** Write the deploy guide in the format of `2026-11-04-staging-deploy-guide-ui-round-2.md`: pre-checks, pull `leapswitch-redesign` on the VM, **backend rebuild and restart only (no migration, no stop-migrate-start)**, front end build with `deploy-redesign.sh`, health URLs, rollback to the previous commit and the previous backend image (confirm `leapswitch-backend:previous` is the real previous image first, it was stale after the last deploy), and the STOP rules.
- [ ] **Step 2:** Write the QA checklist: one row group per change using each spec item's "Re-check in QA" line, plus the new rows named there (dismiss then reload; deep link while signed out; expired session; Back from Settings and from the new-funds list; click a greyed member, a PAN used elsewhere, an email in use, Exit without saving; refusal dialogs state the date; emails look right in Gmail), plus a regression group for the unchanged neighbouring screens from Task 0. The head change and undo rows (8.x, 9.x) are re-run on a fresh account, because the current ones are locked.
- [ ] **Step 3:** Update the docs list above (decisions D1 to D14 and R1 to R5 from the spec, the new response bodies, the new templates).
- [ ] **Step 4:** Commit `qa: staging guide and QA checklist for the QA fixes`; publish. Nothing is deployed until the owner's go.

---

## Self-review (run against the spec)

- **Coverage:** A1 to Task 3, A2 to Task 4, B1 to Task 5, B2 to Task 6, B3 to Task 7, C1 to Task 8, C2 to Task 9, C3 to Task 10, C4 to Tasks 1 and 11, C5 to Task 2. Desktop only, no migration, IST, unchanged-UI proof, branch and combined guide and checklist are in the Global Constraints and Tasks 0, 12 and 13. Decisions Q1 to Q14 and R1 to R5 are each used.
- **Names and types:** `format_ist_date` and `format_ist_datetime` (Task 1) are consumed in Task 2; `AuthAlert`'s `title` (Task 5) is consumed in Task 10; `SignInNotice` is the only new type shared between `session.ts`, `AuthEntryFlow` and `LoginEntry`; `useHeldActive` and `useBack` are each defined once and used where stated.
- **Order:** Tasks 1 and 2 first (the front end reads the new bodies); Task 5 before Task 10 (shared `AuthAlert.tsx`); Tasks 8, 9, 10, 11 run in that order in one worker session because they all edit `ChangeHeadDialog.tsx` or its neighbours.
- **Proportion:** each task names files, interfaces, tests and the check; pixel-level specs live in the packets, which are written from these tasks and the spec.

---

## Amendments made while writing the packets (6 Nov)

- **B3:** the import details dialog is its own small read-only list (built on `PromptDialog`), not `ImportHistorySection`: that section is themed for the signed-in app and carries delete controls. So `ImportHistorySection.tsx` is **not** changed and the `readOnly` prop is dropped. `useBack` lives in `shell/nav/useBack.ts`.
- **A2:** the hook lives in `features/home/useHeldActive.ts`; the legend row becomes `components/AllocationLegendRow.tsx`.
- **C1:** `ChangeHeadDialog` gets an optional `onMembersChanged` prop that `FamilyPage` passes, so the Family list stays fresh while the dialog is open. A shared `InfoNotice` (neutral, because the app has no blue info token) serves C2 and C4.
- **Order:** the three packets run in one worker clone, one after the other (QA-FE-1, then 2, then 3), because they share `AuthAlert.tsx` and `ChangeHeadDialog.tsx`. Only green work is merged into `leapswitch-redesign`; red tests and packets live on `qa-fixes-src`.
