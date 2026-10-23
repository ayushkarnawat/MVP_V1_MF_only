# Profile: backend implementation plan (draft v2)

> **For the implementing agent:** do not start until the owner says go. Test-first (red, green, refactor), run only the test files named here, no live network. Commit nothing unless told.

**Goal (v2, 23 Oct, L49):** one small additive change: `created_at` on `GET /auth/me`. The PAN reveal endpoint from draft v1 is dropped because the PAN is always shown masked. No schema change, no migration, no new job.
**Inputs:** the functionality spec sections 2 and 9, the TDD doc section 1, the backend decisions proposal (PD5, PD6).

## Task 1: `created_at` on `/auth/me` (Q2)

**Files:** modify `backend/app/services/auth/schemas.py` (`MeResponse`, around line 192) and `backend/app/api/auth.py` (`_me_response`, around line 509); test in the existing file that exercises `GET /auth/me` (find it with `grep -rn '"/auth/me"' backend/tests`), or a new `backend/tests/api/test_auth_me_created_at.py`.

- [ ] **Step 1: failing test.** Sign in with the OTP helper used in `test_member_profile_routes.py`, call `GET /auth/me`, assert `response.json()["created_at"]` is present, parses with `datetime.fromisoformat`, and equals the user's `created_at` read from the database.
- [ ] **Step 2: run it, see it fail** (`KeyError: 'created_at'`).
- [ ] **Step 3: implement.** Add `created_at: datetime` to `MeResponse`; pass `created_at=user.created_at` in `_me_response`.
- [ ] **Step 4: run the new test and the existing `/auth/me` tests.** Other endpoints return `MeResponse` too (`/account-deletion`, `/reactivate`, contact-change verify, `PATCH /me`), so run those test files as well.
- [ ] **Step 5:** stop; do not commit unless told.

## Task 2: verify two things (no code unless something is found)

- [ ] What `PATCH /auth/me` does with an empty `primary_goals` list. The code treats `[]` as provided and then reads `goals[0]`, which would raise. The frontend blocks an empty selection, so this is not blocking; if you want the server to guard it too, add a failing test first, then a small guard.
- [ ] That the existing import route accepts `?member=<id>` (the Add statement tile relies on it).

## Done when

The `/auth/me` tests pass; no migration was added; no list response contains anything but the masked PAN.
