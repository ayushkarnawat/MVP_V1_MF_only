# Handoff: b1-structured-429 (Batch B, tasks B-1 and B-3)
**Status:** OPEN (written 2026-11-17, not yet relayed to Codex)
**Parent plan:** `Docs/superpowers/plans/2026-11-17-batch-b-journey-plan.md` (Task B-1, Task B-3)
**Worker:** Codex, backend only. **Reviewer and committer:** Claude (orchestrator).
**Work in:** `D:\unifolio-b-journey` (git worktree, branch `batch/b-journey`, base `08619380`). Never in `D:\Unifolio code`.

Read first, in order: `Docs/orchestration/ui-common-rules-codex.md`, then `Docs/orchestration/wave-common-rules.md` (it wins where they differ), then this file. All three are inside your worktree (paths relative to `D:\unifolio-b-journey`).

## Task
Make every "please wait" answer to a code request carry the seconds left, in a machine-readable form, **without changing the sentence old clients read**.

New body on HTTP 429 for four routes (`signup_email`, `request_email_otp`, `request_otp`, `request_contact_change`, all in `backend/app/api/auth.py`):

```json
{"detail": "Please wait 42s before requesting another code.", "code": "otp_throttled", "retry_after_seconds": 42}
```

- `detail` stays the **same string** it is today (old staging link, phone screens and every existing test read it).
- `code` and `retry_after_seconds` are new **top-level** keys beside `detail`. `retry_after_seconds` is an `int`, at least 1 and at most 60.
- B-3 is a test only: an unregistered login address answers 404 every time and never carries a wait.

## Facts already checked against the repo (2026-11-17, base `08619380`)
- `backend/app/services/auth/otp.py`: constants `OTP_TTL_MINUTES = 5`, `MAX_ATTEMPTS = 5`, `RESEND_THROTTLE_SECONDS = 60` (lines 30 to 32; **do not change them**). The raise is at lines 145 to 148 inside `create_otp_request`: `OtpRequestThrottledError(f"Please wait {int(RESEND_THROTTLE_SECONDS - seconds_since)}s before requesting another code.")`. The class is at line 246, a bare `Exception` subclass with a docstring; it is also listed in `__all__` (line 40).
- The four `except OtpRequestThrottledError as exc: raise HTTPException(status_code=429, detail=str(exc)) from exc` sites in `backend/app/api/auth.py`: `signup_email` (def line 160, except line ~183), `request_email_otp` (196, ~224), `request_otp` (314, ~374), `request_contact_change` (728, ~739).
- `backend/app/services/auth/head_change.py` also catches the error (lines 201, 372, 643, 714) and uses `str(exc)`; the Head of Family routes answer through `_head_change_http` with a **nested** body `{"detail": {"code": "otp_throttled", "message": ...}}`. **Leave all of that alone.** `str(exc)` must still equal the sentence, so call `super().__init__(message)` in the new constructor.
- Existing tests that must keep passing unchanged: `tests/services/auth/test_otp.py` lines 237 to 266, 474 to 490, 648 to 666 (they use `pytest.raises(otp_module.OtpRequestThrottledError, match="wait")`); `tests/api/test_auth_routes.py::test_otp_request_returns_429_when_throttled` (line 26); `tests/api/test_email_otp_routes.py` lines 278 to 290 (`test_signup_email_resend_returns_429_not_500`).
- Baseline (run in this worktree with the project venv, 2026-11-17): `pytest tests/api/test_auth_routes.py tests/api/test_email_otp_routes.py tests/services/auth/test_otp.py -k "throttle or 429"` gives **8 passed**.

## Plan correction you must follow (a conflict between the plan text and the code)
The plan says to raise `HTTPException` through a helper `_throttled_http(exc) -> HTTPException` "that returns the structured body". That cannot work: a FastAPI `HTTPException` only produces `{"detail": ...}`, and `backend/app/main.py` has no exception handler. Also, the front end's `parseErrorDetail` (`frontend/src/lib/apiClient.ts:88`) turns a string `detail` into a plain string payload, so top-level keys are only read if the front end looks for them (that is B-4's job, not yours).
**Do this instead:** one helper in `auth.py`, `_throttled_response(exc: OtpRequestThrottledError) -> JSONResponse`, status 429, content exactly the three keys above; the four sites `return _throttled_response(exc)` from the `except` block. Do not add a global handler, do not touch `main.py`, do not add a `Retry-After` header (it would need a CORS-expose change; out of scope). Confirm that returning a `JSONResponse` from a route that declares a `response_model` is passed through unchanged, and that the CORS middleware still adds its headers (the comment at `test_email_otp_routes.py:288` shows this was once a real bug).

## Interfaces
- Produces: `OtpRequestThrottledError(message: str, retry_after_seconds: int)` with the attribute `retry_after_seconds: int`; `super().__init__(message)` so `str(exc)` is the sentence. In `otp.py` pass `max(1, int(RESEND_THROTTLE_SECONDS - seconds_since))` as the seconds. **Leave the sentence's own `int(...)` expression as it is** (additive-only rule; if it can print "0s" at a boundary, say so under Open questions, do not fix it).
- Produces: the 429 body above on the four routes. Nothing else in any response changes.

## Tests first (name them exactly; report which were RED first)
1. `tests/services/auth/test_otp.py::test_throttle_error_carries_seconds_left` (request twice inside 60 s with the existing time-patching style: `exc.retry_after_seconds` between 1 and 60, `str(exc)` still `Please wait Ns before requesting another code.`).
2. `tests/api/test_email_otp_routes.py::test_request_email_otp_429_has_structured_body` (status 429, keys exactly `detail`, `code`, `retry_after_seconds`; `code == "otp_throttled"`; seconds an int in 1..60; `detail` equal to the old sentence pattern).
3. The same shape for `/auth/otp/request` (`tests/api/test_auth_routes.py`) and for `/auth/signup/email` and the contact-change request route (check the real paths in `auth.py`; add each to the file where its sibling tests live).
4. `test_old_clients_still_read_a_plain_string_detail` (the body's `detail` is a `str`, not an object).
5. B-3, test only: `tests/api/test_email_otp_routes.py::test_unregistered_login_email_returns_404_never_429` (two requests in a row for an unknown login email: both 404, neither body has `retry_after_seconds`). Expected to pass at once; **if it fails, stop and report, do not change code.**
6. Run 1 to 4 and see them fail for the stated reason (missing attribute or missing keys) **before** you implement.

## Run these only
```
cd backend
pytest tests/services/auth/test_otp.py tests/api/test_email_otp_routes.py tests/api/test_auth_routes.py -v
pytest tests/api/test_head_change_routes.py -k "429 or throttl" -v
```
(Use the project venv `D:\Unifolio code\backend\.venv-win\Scripts\python.exe -m pytest` if `pytest` is not on your path; it imports `app` from the worktree, checked.) No full suite.

## Files you may touch
`backend/app/services/auth/otp.py`, `backend/app/api/auth.py`, `backend/tests/services/auth/test_otp.py`, `backend/tests/api/test_auth_routes.py`, `backend/tests/api/test_email_otp_routes.py`. Anything else goes in the report under Deviations with its reason.

## Do not touch
`frontend/**`; `backend/app/main.py`; `backend/app/services/auth/head_change.py` and the Head of Family routes; `RESEND_THROTTLE_SECONDS`, `OTP_TTL_MINUTES`, `MAX_ATTEMPTS`; `get_client_ip` and `device_info.py` (B-2 owns that); any migration (B-2 owns 0054); `auth-tokens.css`; `email_templates.py`.

## Constraints (not restated in full)
`AGENTS.md` non-negotiables; additive-only backend (old staging link shares this API); no real data; never log an email, phone, code or IP; git is read-only for you (Claude commits).

## Approaches considered and rejected
- `HTTPException(detail={...})` with a dict: would make `detail` an object and break every old reader of the sentence (phone screens, old link).
- A global exception handler in `main.py`: wider blast radius than four routes need.
- A `Retry-After` header only: needs a CORS expose-headers change and still no body field for the tests B-4 fixes.

## Open questions (flag, do not guess)
- Does any other route outside the four raise or map this error to a 429 (grep `OtpRequestThrottledError` and `status_code=429`)? List any you find; do not edit them.
- Does the 0-second boundary print "Please wait 0s"? Report only.

## Report format
One fenced block `CODEX REPORT: b1-structured-429`: status (DONE, PARTIAL, BLOCKED); baseline HEAD; exact commands with pass and fail counts; which tests were RED first and why; `git status --short`; one real example 429 payload from a test; Deviations; Open questions.

## Paste-ready prompt
```
Backend worker for Unifolio (Codex). Read, in order:
1. Docs/orchestration/ui-common-rules-codex.md
2. Docs/orchestration/wave-common-rules.md (wins where they differ)
3. Docs/orchestration/2026-11-17-b1-structured-429-handoff.md (your task: B-1 and B-3)
Work only in D:\unifolio-b-journey on branch batch/b-journey. Tests first. Git is read-only. Do not touch frontend/**.
Run tests with: cd backend; "D:\Unifolio code\backend\.venv-win\Scripts\python.exe" -m pytest <files>   (if the sandbox cannot run it, reply BLOCKED with the exact error, do not change any config)
Reply with the CODEX REPORT block from the handoff, nothing else.
```
