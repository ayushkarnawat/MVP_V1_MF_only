# Batch B: Journey Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read `Docs/orchestration/wave-common-rules.md` first; it wins where it differs.

**Goal:** Ship five sign-up, login, import and email changes (wrong-person warning, OTP countdown with a per-IP limit, spinner to tick, onboarding layout with the green switch, four Head of Family emails), all in milestone M1.

**Architecture:** Backend adds a structured 429 reply (`retry_after_seconds`) beside the existing sentence, plus one per-IP guard that runs before any code or "No account found" answer, stored in one new table (the only migration of the program, 0054). Frontend changes stay in `features/auth/redesign/` and `features/import/prompts/`. Emails get one new layout function, four builders and a preview script; the shared email header stays untouched.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, pytest; React, TypeScript, Vitest, Tailwind tokens in `frontend/src/styles/auth-tokens.css`.

**Spec:** `Docs/orchestration/2026-11-12-batch-b-planning-workbook.html` (28 questions, all answered; sections 2 to 7b). Program rules: `Docs/orchestration/2026-11-17-program-execution-and-deployment-plan.html`.

## How this plan is used (read first)

- **Packets are not written here.** The orchestrator (Claude) writes each Antigravity packet and each Codex handoff **in detail at the moment its task starts**, from this plan, the workbook's drawings and the repo as it is that day. This plan lists what a packet must contain, not the packet.
- **Wave-start check (run before task B-1):** confirm each file named below still exists and looks as described; confirm `backend/alembic/versions` head is `0053_primary_goals_life_goals.py`; confirm `get_client_ip` in `backend/app/services/auth/device_info.py` still takes the last forwarded address; confirm `ls-staging` still shares the API (README in `deploy/leapswitch`). Report drift before building.
- **Branch:** `batch/b-journey`, cut from `leapswitch-redesign` at wave 1 start. Merge `leapswitch-redesign` into it before the final merge.
- **Builders:** Codex = backend and all red tests, one task at a time. Antigravity = screens, lanes G-a/G-b/G-c, only after the red tests exist. Claude = orchestration, assets, reviews, every commit.

## Global Constraints

- Old staging link stays untouched: every backend change is additive. The existing sentence in the 429 body (`detail`) stays readable by old clients.
- Per-identifier rules do not change: 60 s resend wait, 5 min code life, 5 wrong tries (`RESEND_THROTTLE_SECONDS`, `OTP_TTL_MINUTES`, `MAX_ATTEMPTS` in `otp.py`).
- Guard limits (decided, Q24 A): **10 different addresses per client address in 10 minutes** for code requests, **30** for address checks, in 10 minutes. Counts different addresses, never one person retrying.
- No raw IP, email or phone stored or logged by the guard: keyed hashes only (HMAC-SHA256), rows deleted after 24 h.
- Phone screens (`frontend/src/mobile/**`) unchanged (Q9). Desktop split screens only.
- Green switch: actions use `#22C55E` through tokens; text on green is dark (Q5, Q25: all ten auth screens through `auth-tokens.css`).
- Emails: names escaped, no token or personal data in image addresses, undo token stays after `#`, dark mode by styles only, shared `_email_header()` untouched (a test pins its hash).
- No analytics events (GA4 paused); no speed work (A4 paused); "Your dashboard is ready" copy must not promise speed.
- User-visible text: plain words, no em dashes, "their" not a guessed pronoun. Typo "autonated" is corrected to "automated".

## Review Focus

- Forged `X-Forwarded-For` (first-entry spoof) must not dodge or frame an address; the last entry is trusted.
- Identifier variants (`A@x.com`, ` a@x.com `, phone formats) count as one address in the guard.
- Order of checks: a probe for an unknown email must be counted **before** the 404, so bulk checking is limited.
- Guard table unreadable: the request goes through, a log line is written, and the on/off setting turns the guard off.
- Hostile member name (`<script>`, `"><img`) in all four emails; link box text equals the real link; changed-back email carries no token.
- Editing the email or phone field never bypasses a server 429; the button is disabled while a request runs.
- All set: timer cleared on unmount, no redirect by itself, reduced motion shows no pop.
- Onboarding fits one window at 1280x600, 1440x810, 1536x730, 1366x650, 1920x1080 without scrolling.

## File Structure

| File | Responsibility |
|---|---|
| `backend/app/services/auth/otp.py` | Throttle error carries seconds left (`OtpRequestThrottledError.retry_after_seconds`). |
| `backend/app/services/auth/request_guard.py` (new) | Per-IP guard: hashing, counting, recording, cleanup. |
| `backend/app/models/auth.py` | New `AuthRequestGuard` model. |
| `backend/alembic/versions/0054_auth_request_guard.py` (new) | Table, index, downgrade. |
| `backend/app/api/auth.py` | 429 body shape; guard call before the 404/409 answers on the code-request routes. |
| `backend/app/config.py` | `auth_guard_secret`, `auth_guard_enabled`, the three limits. |
| `backend/app/scripts/clean_auth_guard.py` (new) + `deploy/leapswitch/crontab.leapswitch` | Daily cleanup job. |
| `backend/app/services/auth/email_templates.py` | New layout function and four builders. |
| `backend/scripts/preview_emails.py` (new) | Writes sample HTML (light, dark, desktop, phone). |
| `frontend/public/email/` (new) | Logo, illustrations, icons as PNG (Claude crops them). |
| `frontend/src/features/auth/api.ts`, `validation.ts` | Read `retry_after_seconds`. |
| `frontend/src/features/auth/redesign/useResendCountdown.ts`, `LoginEntry.tsx` | Countdown button, red line, reset on edit. |
| `frontend/src/features/auth/redesign/AllSet.tsx`, `StatusRow.tsx`, `finishCopy.ts` | Timer, tick pop, new copy. |
| `frontend/src/features/auth/redesign/InvestorProfile.tsx`, `OptionRow.tsx`, `ChipCheckbox.tsx`, `finishCopy.ts` | Layout, removed subtext. |
| `frontend/src/styles/auth-tokens.css` | Green tokens, tick keyframe (one owner at a time). |
| `frontend/src/features/import/prompts/MemberNotInFileDialog.tsx` | Warning block as children of `PromptDialog`. |

**Lanes (Antigravity):** G-a import pop-up (B-6); G-b auth screens in order B-8 (countdown) then B-10 (tick) then B-12 (onboarding + green); G-c none (emails are Python, see B-14). G-a and G-b touch disjoint files and can run together. `auth-tokens.css` has one owner at a time: B-10 then B-12.

## Task list

| Task | What | Builder | Size | Lane / order |
|---|---|---|---|---|
| B-1 | Structured 429 reply | Codex | S | first |
| B-2 | Per-IP guard, table, migration, cleanup job | Codex | M | after B-1 |
| B-3 | Unregistered address never shows a wait (test only) | Codex | S | with B-1 |
| B-4 | Frontend contract: read seconds, countdown hook, red tests for B-8 | Codex | S | after B-1 |
| B-5 | Red tests for the warning (B-6) | Codex | S | any time |
| B-6 | Wrong-person warning block | Antigravity | S | G-a |
| B-7 | Red tests for tick (B-10) and onboarding fit (B-12) | Codex | S | any time |
| B-8 | Countdown button and red line on the login entry screen | Antigravity | M | G-b 1st |
| B-9 | Email: layout function, four builders, preview script, tests | Codex | L | own lane |
| B-10 | Spinner to tick, new copy | Antigravity | S | G-b 2nd |
| B-11 | Email assets (crops) | Claude | S | before B-9 visual check |
| B-12 | Onboarding layout and green switch | Antigravity | M | G-b 3rd |
| B-13 | Whole-batch review, M1 notes for the deploy guide | Claude | M | last |

Item numbers in the workbook map as: item 2 = B-5/B-6, item 4 = B-1 to B-4/B-8, item 6 = B-7/B-10, item 3 = B-7/B-12, item 18 = B-9/B-11.

---

### Task B-1: Structured 429 reply (SB1)

**Files:**
- Modify: `backend/app/services/auth/otp.py` (`OtpRequestThrottledError`, the raise at line ~146)
- Modify: `backend/app/api/auth.py` (the four `except OtpRequestThrottledError` sites: `signup_email`, `request_email_otp`, `request_otp`, `request_contact_change`)
- Test: `backend/tests/services/auth/test_otp.py`, `backend/tests/api/test_auth_routes.py`, `backend/tests/api/test_email_otp_routes.py`

**Interfaces:**
- Produces: `OtpRequestThrottledError(message: str, retry_after_seconds: int)` with attribute `retry_after_seconds: int`.
- Produces: 429 body `{"detail": "<same sentence as today>", "code": "otp_throttled", "retry_after_seconds": <int>}` on those routes. (The Head of Family routes already use `otp_throttled`; keep the same `code` value.)

- [ ] **Step 1: Write failing tests.** `test_throttle_error_carries_seconds_left` (request twice inside 60 s: `exc.retry_after_seconds` is between 1 and 60 and the message still reads `Please wait Ns before requesting another code.`); `test_request_email_otp_429_has_structured_body` (status 429, `body["code"] == "otp_throttled"`, `body["retry_after_seconds"]` int, `body["detail"]` unchanged); the same for `/otp/request` and `/signup/email`.
- [ ] **Step 2: Run** `cd backend && pytest tests/services/auth/test_otp.py tests/api/test_email_otp_routes.py -k "throttle or 429" -v`. Expected: FAIL (no attribute / key missing).
- [ ] **Step 3: Implement.** Add the attribute and pass `int(RESEND_THROTTLE_SECONDS - seconds_since)` (minimum 1). In `auth.py` raise `HTTPException(status_code=429, detail=...)` through one helper `_throttled_http(exc) -> HTTPException` that returns the structured body, so the four sites share it. Keep `detail` the old sentence for old clients and the phone screens.
- [ ] **Step 4: Update** existing tests that assert the plain sentence only so they still pass; add one that an old-style reader of `detail` still sees the sentence.
- [ ] **Step 5: Run** the three files. Expected: PASS. Report which tests were red first.

### Task B-2: Per-IP guard (SB2 to SB7)

**Files:**
- Create: `backend/app/services/auth/request_guard.py`, `backend/alembic/versions/0054_auth_request_guard.py`, `backend/app/scripts/clean_auth_guard.py`
- Modify: `backend/app/models/auth.py` (add `AuthRequestGuard`), `backend/app/config.py`, `backend/app/api/auth.py`, `deploy/leapswitch/crontab.leapswitch`
- Test: `backend/tests/services/auth/test_request_guard.py` (new), `backend/tests/api/test_auth_routes.py`

**Interfaces:**
- Consumes: `get_client_ip(request) -> str | None` (`device_info.py`); B-1's `_throttled_http`.
- Produces: `check_and_record(db, *, client_ip: str | None, identifier: str, route: str, kind: Literal["code", "check"], now: datetime) -> None` raising `RequestGuardLimited(retry_after_seconds: int)`; `record_outcome(db, row_id, outcome: str) -> None`; `purge_older_than(db, hours: int = 24) -> int`.
- Table `auth_request_guard`: `id` Uuid pk, `ip_hash` String(64), `identifier_hash` String(64), `route` String, `outcome` String (`code_sent|unknown_account|account_exists|held`), `created_at` DateTime(tz); index `(ip_hash, created_at)`.
- Settings: `auth_guard_enabled: bool = True`, `auth_guard_secret: str = ""` (refuse to start the guard with an empty secret in production; log and skip in development), `auth_guard_code_limit = 10`, `auth_guard_check_limit = 30`, `auth_guard_window_minutes = 10`.

- [ ] **Step 1: Write failing tests** (all named): `test_hashes_are_keyed_and_stable`; `test_ipv6_uses_first_64_bits`; `test_identifier_variants_count_once` (`A@x.com`, ` a@x.com`); `test_eleventh_different_address_is_limited_with_seconds_left`; `test_same_address_retried_is_never_limited_by_guard`; `test_unknown_email_probe_is_counted_before_404` (31st check returns 429 not 404); `test_forged_forwarded_header_uses_last_entry`; `test_table_unreadable_lets_request_through_and_logs` (patch the query to raise); `test_disabled_setting_skips_guard`; `test_log_line_has_short_prefix_only` (no email, phone, raw IP in `caplog`); `test_purge_deletes_rows_older_than_24h`; migration test on SQLite and Postgres (upgrade then downgrade).
- [ ] **Step 2: Run** `cd backend && pytest tests/services/auth/test_request_guard.py -v`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the model, migration (number: the next free one at build time; today 0054, **re-check the head**), `request_guard.py` and the call in the three code-request routes **before** the unknown-account 404 and the existing-account 409. Count distinct `identifier_hash` per `ip_hash` inside the window. Concurrency may let one extra through; do not lock.
- [ ] **Step 4: Implement** `clean_auth_guard.py` (callable as `python -m app.scripts.clean_auth_guard`) and one crontab line next to the account-deletion job; note the AWS schedule in the M1 deploy guide (guide is written at M1, not now).
- [ ] **Step 5: Run** the new tests and `tests/api/test_auth_routes.py`, `tests/api/test_email_otp_routes.py`. Expected: PASS. Also run `pytest tests/functional_postgres -k otp` if present.

### Task B-3: Unregistered address never shows a wait (SB8)

**Files:** Test only: `backend/tests/api/test_email_otp_routes.py`.

- [ ] **Step 1:** Add `test_unregistered_login_email_returns_404_never_429` (two requests in a row for an unknown email: both 404, no `retry_after_seconds` key).
- [ ] **Step 2: Run** it. Expected: PASS immediately (documents behaviour; no code change). If it fails, stop and report.

### Task B-4: Frontend contract for the countdown

**Files:**
- Modify: `frontend/src/features/auth/api.ts`, `frontend/src/features/auth/validation.ts`, `frontend/src/features/auth/redesign/useResendCountdown.ts`
- Test: `frontend/src/features/auth/validation.test.ts` (existing or new next to the file), `frontend/src/features/auth/redesign/useResendCountdown.test.ts` (new), `frontend/src/features/auth/redesign/LoginEntry.test.tsx` (red tests for B-8)

**Interfaces:**
- Produces: `retryAfterSeconds(err: unknown): number | null` in `validation.ts` (reads `ApiError.payload.retry_after_seconds` when `status === 429`).
- Produces: `useResendCountdown(start?: number)` keeps its return `{ seconds, active, restart }`; add `restart(next?: number)` that sets the seconds to `next` when given.
- Produces (red tests, fixed for B-8): in `LoginEntry.test.tsx`: `shows a disabled countdown button and the one red line after a 429` ("For your security, a new code can be requested once a minute."); `button is live again when the typed email differs from the throttled one`; `button is live again when the typed phone differs`; `an unregistered address shows the no-account error and no countdown`; `editing the field never skips a later server 429`; `the button is disabled while a request runs`; `generic per-IP message with seconds left`.

- [ ] **Step 1: Write the failing tests** above.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/features/auth/validation.test.ts src/features/auth/redesign/useResendCountdown.test.ts src/features/auth/redesign/LoginEntry.test.tsx`. Expected: FAIL; the `LoginEntry` tests stay red until B-8.
- [ ] **Step 3: Implement** `retryAfterSeconds` and the hook change only (not the screen).
- [ ] **Step 4: Run** the first two files. Expected: PASS. Commit the red `LoginEntry` tests with a note of how many fail.

### Task B-5: Red tests for the warning

**Files:** Test: `frontend/src/features/import/prompts/MemberNotInFileDialog.test.tsx` (existing; keep the title and body assertions, which read single text).

- [ ] **Step 1:** Add `shows an amber warning with one bold line naming who the funds are imported for (one person)`, `... (several people)`, `... (no names: warning still shows the fixed line only)`, `the warning is its own element, not part of the body text`, `muted line says a new family member is created if needed`, `closing, Esc and outside click still call onUploadDifferent`. Names come only from `people`; no masked PAN of other people.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/features/import/prompts/MemberNotInFileDialog.test.tsx`. Expected: new tests FAIL.

### Task B-6: Wrong-person warning block (Antigravity, lane G-a)

**Files:** Modify `frontend/src/features/import/prompts/MemberNotInFileDialog.tsx`; test file from B-5 (fixed).

**Interfaces:** Consumes `PromptDialog`'s `children` slot (between body and footer); `joinNames` from `./copy`. Produces nothing new; props unchanged.

- [ ] **Step 1: Packet.** The orchestrator writes the packet at this point: workbook section 2 mockups (laptop and phone), the amber token (see `ReviewExpiryBanner.tsx` for the existing amber tint), bold line `The funds will be imported for {names}.` and muted line `A new family member is created if needed.` (final strings: orchestrator confirms against the workbook), spacing between title, body, warning and buttons, dark mode.
- [ ] **Step 2: Build** the block as its own element inside `children`. One change serves web and the phone import view (the same component).
- [ ] **Step 3: Run** the B-5 test file, then `npx tsc -b` and `npx oxlint src/features/import`. Expected: PASS.
- [ ] **Step 4:** Orchestrator screenshots at 1280x720 and the phone width next to the workbook drawing; differences go back.

### Task B-7: Red tests for the tick and the onboarding fit

**Files:** Test: `frontend/src/features/auth/redesign/AllSet.test.tsx`, `StatusRow` test (new `StatusRow.test.tsx`), `InvestorProfile.test.tsx`, `AuthSplitCard.layout.test.tsx` (existing layout checks to change).

- [ ] **Step 1: Write failing tests:** `third row is active at 0s, done after 2500ms` (fake timers; the old "done, done, active" expectation becomes time-aware); `paragraph and right heading change after the tick`; `row 3 reads "Your dashboard is ready"`; `nothing redirects by itself` (must still pass); `timer is cleared on unmount`; `a row that just turned done has the pop class, and none under reduced motion`; `screen reader hears a polite status change`. Onboarding: `the four option rows have no subtext and the line "This helps us tailor your experience and insights." is gone`; `roles, names and option order unchanged; title keeps span.font-semibold`; `fits one window at five sizes` (1280x600, 1366x650, 1440x810, 1536x730, 1920x1080, using the existing layout-test technique in `AuthSplitCard.layout.test.tsx`); update the two layout checks (three columns, no-wrap heading row) to the chosen layout; `goal labels unchanged`.
- [ ] **Step 2: Run** the four files. Expected: new tests FAIL.

### Task B-8: Countdown button and red line (Antigravity, lane G-b)

**Files:** Modify `frontend/src/features/auth/redesign/LoginEntry.tsx`, `AuthEntryFlow.tsx` (only to pass the seconds). Test: B-4's red tests (fixed).

- [ ] **Step 1: Packet** (orchestrator, at start): workbook section 3 laptop drawings at 1280x600, 1440x810, 1536x730; the red line is the app error red, one line, no box; states: live, counting, editing-resets, per-IP wait message, unregistered error.
- [ ] **Step 2: Build** using `retryAfterSeconds` and the hook; reset the countdown when the typed value differs from the throttled one; button disabled while a request runs; phone screens untouched.
- [ ] **Step 3: Run** the B-4 `LoginEntry` tests, `tsc -b`, `oxlint src/features/auth`. Expected: PASS.

### Task B-9: Head of Family emails (Codex)

**Files:**
- Modify: `backend/app/services/auth/email_templates.py` (`head_changed_for_new_head_email`, `head_changed_for_old_head_email`, `head_change_undo_email`, `head_change_reversed_email`; add `_branded_layout(...)`)
- Create: `backend/scripts/preview_emails.py`
- Test: `backend/tests/services/auth/test_email_templates.py`; the OTP email test that pins `_email_header()` must keep passing.

**Interfaces:** Builders keep their current signatures and return `tuple[str, str, str]` (subject, html, text); `head_change_undo_email(*, undo_url: str, valid_until: datetime)`. New: `_branded_layout(*, title: str, body_html: str, button: tuple[str, str] | None, link_box: str | None, dark: bool = True) -> str` (tables, inline styles, 600 px fluid, `color-scheme` meta and a dark-scheme `<style>` block). Image URLs are `{FRONTEND_BASE_URL}/email/<name>.png` (Q15).

- [ ] **Step 1: Write failing tests:** `test_names_are_escaped_in_all_four` (hostile names); `test_undo_link_box_text_equals_real_link_and_token_stays_after_hash`; `test_changed_back_email_has_no_token_or_link`; `test_image_urls_have_no_token_or_personal_data`; `test_every_image_has_alt_text`; `test_dark_mode_block_has_no_script`; `test_copy_uses_their_not_a_guessed_pronoun` (replaces the old pronoun test, Q17); `test_shared_header_unchanged` (hash).
- [ ] **Step 2: Run** `cd backend && pytest tests/services/auth/test_email_templates.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** the layout and the four builders from the workbook section 6 designs (orchestrator writes the detailed handoff with the exact copy and measurements at this point; the fourth email, "changed back", is a draft that the user reviews). Write `preview_emails.py` that writes light and dark, 600 px and 375 px HTML files to a folder given on the command line (never into the repo).
- [ ] **Step 4: Run** the test file. Expected: PASS. The two-inbox check (Gmail web and app, Apple Mail, Outlook if available) is part of the single QA round after M4, not here.

### Task B-10: Spinner to tick, new copy (Antigravity, lane G-b)

**Files:** Modify `frontend/src/features/auth/redesign/AllSet.tsx`, `StatusRow.tsx`, `finishCopy.ts`, `frontend/src/styles/auth-tokens.css` (one keyframe plus a `prefers-reduced-motion` rule; the guard test checks that block). Test: B-7's tests (fixed).

- [ ] **Step 1: Packet** (orchestrator): workbook section 4 three moments at three window sizes; 2.5 s timer; tick grows about 25 percent then settles to the size of the others; new copy ("Your dashboard is ready" / "Go to my dashboard to start your journey.", paragraph and right heading follow). Ask the user in the packet whether the grey card "While we fetch your data..." and "Accounts being imported" should change; default: unchanged.
- [ ] **Step 2: Build.** Timer cleared on unmount; button never held back; polite announcement.
- [ ] **Step 3: Run** B-7's `AllSet`, `StatusRow` tests, `tsc -b`, `oxlint`. Expected: PASS.

### Task B-11: Email assets (Claude)

- [ ] **Step 1:** Copy the six reference pictures into the repo for the packet (folder named in the packet), crop logo, illustrations and icons from the largest desktop picture as PNGs into `frontend/public/email/`, with a light circle behind each illustration for dark mode. No real people or data in any picture.
- [ ] **Step 2:** List each file with its size and source crop in the B-9 handoff. Check that no filename or path carries personal data.

### Task B-12: Onboarding layout and green switch (Antigravity, lane G-b, after B-10)

**Files:** Modify `frontend/src/features/auth/redesign/InvestorProfile.tsx`, `OptionRow.tsx`, `ChipCheckbox.tsx`, `finishCopy.ts` (remove the four `subtitle`s from this screen only after checking that Profile and the phone screens do not read `INVESTOR_PROFILE_OPTIONS.subtitle`), `frontend/src/styles/auth-tokens.css` (green tokens for all ten auth screens). Test: B-7's tests (fixed).

- [ ] **Step 1: Packet** (orchestrator): workbook section 5 chosen layout (option A: rows no taller than 48 px, extra space between title, list, goals and button, wider padding in rows), the five window sizes, token values (`#22C55E` actions, `#15803D` deeper green, dark text on green; the user should confirm the deeper green against the palette PDF), the test hooks that must stay.
- [ ] **Step 2: Build.** Save on Continue and validation do not change; goal labels shared with Profile unchanged.
- [ ] **Step 3: Run** `InvestorProfile.test.tsx`, `AuthSplitCard.layout.test.tsx`, the auth guard tests that read `auth-tokens.css`, `tsc -b`, `oxlint src/features/auth src/styles`. Expected: PASS. Orchestrator screenshots at the five sizes.

### Task B-13: Whole-batch review and M1 notes (Claude)

- [ ] **Step 1:** A fresh adversarial reviewer reads the whole batch diff against the Review Focus list and the security register F (workbook 7b part F). Findings are never applied automatically.
- [ ] **Step 2:** Merge `leapswitch-redesign` into `batch/b-journey`; rerun the batch's affected tests; merge in.
- [ ] **Step 3:** Hand the M1 deploy guide its facts (it is written at M1): migration 0054 and its downgrade; new setting `AUTH_GUARD_SECRET` on the staging server and AWS; the cleanup job line; the new `frontend/public/email/` files; the guard on/off switch; what the old link sees (the 429 body gains keys, `detail` unchanged). Mark the security explanation (workbook section 7) ready for counsel review.

## Self-Review notes

- Spec coverage: items 2, 4, 6, 3 and 18 each have a red-test task and a build task; SB1 to SB9 and SF1 to SF6 map to B-1 to B-12; stakeholder note (B-6 in the workbook) is already drafted and is not code.
- Conflict flagged, not resolved silently: the workbook (Q20) gave the email HTML to Antigravity, but the program rules and `wave-common-rules.md` forbid Antigravity from `backend/**`, and the emails are Python in `backend/**`. This plan gives the emails to Codex (B-9) with Claude's assets (B-11). If the user wants Gemini to produce static HTML first, it goes in a non-backend folder as a reference only.
- Packets and handoffs: not written here, by instruction; the orchestrator writes each in detail when its task starts.
