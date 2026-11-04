# Handoff: ui-s6 skip the "your email was changed" notice before sign-up is complete (backend, small)

**Status:** OPEN. **Worker:** the backend lane (Codex, or the Claude worker in WSL while Codex usage is out). **Rules:** `Docs/orchestration/ui-common-rules-codex.md` and `Docs/orchestration/ui-worker-claude-wsl.md`. **Plan:** the Open question Q71 and S6 Task 6.11 in `Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md`. Branch `ui-round-2` (see `2026-11-03-ui-round-2-branch-and-worktrees.md`).
Never touch `frontend/**`. Tests first. No migration.

## The owner's decision (3 Nov 2026, answering Q71)
Approved: **one small backend flag** that skips the notice. During sign-up the person changes their email on Back; the old address was typed minutes ago, so mailing it a "your email was changed" notice with an undo link is noise, and a typo address would receive mail from us. This is the only backend change S6 needs. Do exactly this and nothing more.

## What to build
File: `backend/app/api/auth.py`, the contact-change verify route (the block that ends with `send_contact_change_notice(...)`, around line 820).
- **Skip only the email.** Send the notice only when `user.onboarding_completed_at is not None`. Everything else stays exactly as today: the identity update, `record_contact_change(...)` (so the 7-day Head of Family cooling-off and the event row still exist), the commit and the `_me_response`. A person who has not finished sign-up has no Head of Family change to protect, and keeping the event keeps the security behaviour identical.
- **Do not** change `send_contact_change_notice`, `contact_changed_email`, the reverse route or any schema. No new field, no new setting. The rule is "account complete" = `onboarding_completed_at` is set (the same test `_me_response` uses for `onboarding_completed`).
- Add a short code comment saying why (the owner's Q71 decision) and that the event is still recorded.

## Tests (tests first, `backend/tests/api/test_contact_change_reverse.py`)
- `test_an_email_change_before_sign_up_is_complete_sends_no_notice`: a user with `onboarding_completed_at = None` changes their email; the response is 200, the new email is stored, **the mailbox is empty**, and a `ContactChangeEvent` row exists.
- `test_a_phone_change_before_sign_up_is_complete_sends_no_notice` (same for the phone channel).
- `test_an_email_change_after_sign_up_is_complete_still_sends_the_notice_to_the_old_address` (the existing behaviour, with a completed user).
- **The existing tests in `test_contact_change_reverse.py` and `test_contact_change_routes.py` that expect the notice** build their user with the `_household` helper. If that helper does not set `onboarding_completed_at`, those tests will now see no email. Fix them by marking the user as having completed onboarding in the helper or in each test (set `onboarding_completed_at` to a datetime). Do not weaken any assertion.
- Run `cd backend && pytest tests/api/test_contact_change_reverse.py tests/api/test_contact_change_routes.py tests/api/test_head_change_routes.py tests/api/test_email_otp_routes.py` and then `tests/api`.

## Contract for the frontend
No response change. `POST /auth/contact-change/verify` still returns the same `_me_response`. The frontend (S6 task 6.11) simply relies on no email going out during sign-up.

## Done when
The three new tests pass, the existing contact-change tests pass with the onboarding fix, and `git diff --stat` shows `backend/app/api/auth.py` plus test files only.
