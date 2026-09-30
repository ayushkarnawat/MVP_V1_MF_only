# Staging QA Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. If any task is delegated to Codex, the `model-orchestration` skill governs it (handoff doc + adversarial review gate).

**Goal:** Fix the six issues found testing the auth redesign and CAS member detection on staging (30 Sep 2026), exactly as decided in the findings map.

**Architecture:** Mostly local fixes inside existing modules. Auth gets a `flow` field on both OTP-request routes. Onboarding goals move to a JSON list column using an expand/contract migration. The ribbon review gets an `embedded` grid mode and derived auto-confirm. The unlock endpoint gets a `use_detected_pan` option behind a new popup. People resolution gains two name-based lookups (one automatic, one asked through the existing same-person prompt). The merge rule is widened so the PAN-bearing duplicate can be merged. The parser starts carrying the statement period, and a data migration backfills it.

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic (SQLite dev/tests, Postgres staging), React 19 + TypeScript + Tailwind 3.4 + Vitest.

**Spec:** `Docs/orchestration/2026-09-30-staging-qa-findings-map.html` (published: https://claude.ai/artifact/WA2FefJtyn9eXD7WmMJsq9). Every "Decided 30 Sep" block in it is binding. Background specs: `Docs/orchestration/cas-member-detection-map.html` and `Docs/orchestration/unifolio-auth-flow-redesign-map.html`.

## Global Constraints

- **Never commit.** The user commits manually (memory `feedback_never_commit`). Each task ends at "tests green, stop"; there are no `git commit` steps.
- Backend tests run from `backend/` with the system interpreter: `python3 -m pytest …`. `backend/.venv` is a Windows venv and does not run in WSL.
- Frontend tests run from `frontend/`: `npx vitest run <path>`. Typecheck: `npx tsc -b`. Lint: `npm run lint`.
- The Postgres functional tests (`backend/tests/functional_postgres`) need `TEST_DATABASE_URL`. Without it they skip, and the task must say they were skipped. Never report them as passing.
- UI copy uses the curly apostrophe `’`, as in all existing member-detection copy (F17).
- PANs are only ever shown masked (`BN******8L`). A raw PAN never reaches the browser, logs or `raw_parser_output`.
- The typed PAN is never saved when it differs from the statement's PAN (decision I4, still in force).
- Spec numbering changes against the findings map, both deliberate: the statement-period backfill is its own migration `0020`, not part of `0019`, so each migration covers one issue. The later contract migration becomes `0021`, not `0020`.
- Sign-up 409s and login 404s use plain-string `detail`, like the existing auth errors. `isAccountExistsError` and the new `isNoAccountError` match on the text. The map mentioned structured codes (`phone_already_registered`, `account_not_found`); plain strings keep one error convention across `auth.py`.
- Cause C in the map listed two backend changes. Only (2), widening the merge rule, is built. (1), turning a detected-PAN collision at unlock into an L4, isn't needed: with (2), both unlock orders end in a working merge (see Task 10's order-A and order-B tests).

## Review Focus

1. **Existing staging accounts that already have duplicate Kavitas.** The merge must work in both orders: name-only first, then PAN-bearing; and PAN-bearing first, then name-only. Covered by Task 10's two ordered tests.
2. **A household with two members of the same exact name.** Nothing must attach by name, and nobody gets "the wrong Kavita". Covered by a Task 8 test (`two_exact_matches_stay_new`) and a Task 9 test (`two_name_only_matches_no_prompt`).
3. **A rolling deploy between migration `0019` and `0021`.** An old ECS task still reading `users.primary_goal` must get a valid value. Covered by Task 2's dual-write test.
4. **Resending the email code during a login.** The resend must also send `flow: "login"`, and an email sign-up resend must not. Covered by a Task 1 frontend test (`resend keeps the login flow`).
5. **A statement whose period casparser can't read (missing, or a different date format).** The import must still succeed, with null dates. Covered by a Task 4 test (`unreadable_period_gives_none`).

---

## File map

| File | Tasks | Responsibility |
|---|---|---|
| `backend/app/services/auth/schemas.py` | 1, 2 | `flow` on OTP request bodies; `primary_goals` on `UpdateMeBody` / `MeResponse` |
| `backend/app/api/auth.py` | 1, 2 | request-time checks, verify-time sign-up guard, `/me` goals |
| `backend/app/models/user.py` | 2 | `primary_goals` column |
| `backend/alembic/versions/0019_user_primary_goals.py` (new) | 2 | expand migration |
| `backend/alembic/versions/0020_import_statement_period_backfill.py` (new) | 4 | data backfill |
| `backend/app/services/import_/parser.py` | 4 | statement period on `ParseResult` |
| `backend/app/services/import_/confirm_people.py` | 4, 8, 9 | dates on `Import`; name-lookup re-check at Confirm; detected-PAN write |
| `backend/app/services/import_/people_resolution.py` | 8, 9 | name-based lookups |
| `backend/app/services/import_/service.py` | 8, 9 | preview tags; same-person `name_only` branch |
| `backend/app/services/import_/schemas.py` | 9 | `SamePersonPrompt.kind`, `member_fund_count` |
| `backend/app/services/dashboard/member_details.py` | 6, 10 | `use_detected_pan`; wider `can_merge` |
| `backend/app/services/dashboard/member_merge.py` | 10 | allow a same-PAN locked source; verify the target's PAN |
| `frontend/src/features/auth/{api.ts,AuthEntryFlow.tsx,PhoneEntry.tsx,EmailEntry.tsx,validation.ts}` | 1 | send `flow`; "Sign up instead" shortcut |
| `frontend/src/features/auth/{Q3Purpose.tsx,OnboardingFlow.tsx,types.ts}` | 3 | multi-select goals |
| `frontend/src/features/import/{ReviewTable.tsx,MemberRibbonReview.tsx}` | 5 | embedded grid, auto-confirm |
| `frontend/src/features/dashboard/members/{DetectedPanMismatchDialog.tsx (new),MemberDetailsDialog.tsx,memberDetailsForm.tsx,PossibleDuplicateDialog.tsx}` | 7, 10 | L3 popup; duplicate copy |
| `frontend/src/features/import/prompts/SamePersonDialog.tsx`, `features/import/types.ts` | 9 | name-only variant |
| `frontend/src/mobile/features/import/MobileImportHistory.tsx` | 4 | shared date format |
| Docs listed in Task 11 | 11 | record decisions |

Suggested batching (memory `feedback_token_budget_plan_execution`): Sonnet for Tasks 1–5, 7 and 11. Opus for Tasks 8–10 (people resolution and merge are the riskiest) and for the final whole-branch review. Every task keeps its review gate.

---

### Task 1: Sign-up and login checks at code-request time (issue 1)

**Files:**
- Modify: `backend/app/services/auth/schemas.py:35-37` (`OtpRequestBody`), `:107-116` (`EmailOtpRequestBody`)
- Modify: `backend/app/api/auth.py:99-124` (`request_email_otp`), `:205-240` (`request_otp`), `:294-299` (`verify_otp_route`)
- Modify: `frontend/src/features/auth/api.ts:32-66`, `AuthEntryFlow.tsx`, `validation.ts`, `PhoneEntry.tsx`, `EmailEntry.tsx`
- Test: `backend/tests/api/test_auth_routes.py`, `backend/tests/api/test_email_otp_routes.py`, `frontend/src/features/auth/api.test.ts`, `frontend/src/features/auth/AuthEntryFlow.test.tsx`

**Interfaces:**
- Produces: `OtpRequestBody.flow: Literal["signup","login"] | None`, `EmailOtpRequestBody.flow: Literal["login"] | None`; `requestOtp(phone, pendingToken?, flow?)`, `requestEmailOtp(email, pendingToken?, flow?)`; `isNoAccountError(message)`.
- Error strings (exact): `"An account with this phone number already exists."` (409), `"No account found for that phone number — sign up instead."` (404), `"No account found for that email — sign up instead."` (404).

- [ ] **Step 1: Write the failing backend tests** (append to `backend/tests/api/test_auth_routes.py`)

```python
from app.models.auth import OtpRequest


def _register_phone(client, phone):
    # Flow-omitted legacy verify: creates the account directly (auth.py legacy branch).
    otp = client.post("/auth/otp/request", json={"phone_number": phone}).json()["otp"]
    assert client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp}).status_code == 200


def _otp_rows(phone):
    from app.db.session import get_db
    from app.main import app
    db = next(app.dependency_overrides[get_db]())
    return db.query(OtpRequest).filter(OtpRequest.phone_number == phone).count()


def test_signup_request_with_a_registered_phone_is_409_and_sends_nothing(client):
    _register_phone(client, "+919811100001")
    before = _otp_rows("+919811100001")
    r = client.post("/auth/otp/request", json={"phone_number": "+919811100001", "flow": "signup"})
    assert r.status_code == 409
    assert r.json()["detail"] == "An account with this phone number already exists."
    assert _otp_rows("+919811100001") == before


def test_signup_verify_with_a_registered_phone_is_409_not_a_login(client):
    # The number gets registered between request and verify (another tab):
    # the request passes, but verify must refuse instead of logging in.
    from datetime import datetime, timezone
    from app.db.session import get_db
    from app.main import app
    from app.models.enums import AuthIdentityProvider
    from app.models.user import User
    from app.services.auth.identity import record_identity

    otp = client.post("/auth/otp/request", json={"phone_number": "+919811100002", "flow": "signup"}).json()["otp"]
    db = next(app.dependency_overrides[get_db]())
    now = datetime.now(timezone.utc)
    user = User(phone_number="+919811100002", created_at=now)
    db.add(user)
    db.flush()
    record_identity(db, user.id, AuthIdentityProvider.PHONE_OTP, "+919811100002", None, now)
    db.commit()
    r = client.post("/auth/otp/verify", json={"phone_number": "+919811100002", "otp": otp, "flow": "signup"})
    assert r.status_code == 409
    assert "session_token" not in r.json()


def test_login_request_with_an_unknown_phone_is_404_and_sends_nothing(client):
    r = client.post("/auth/otp/request", json={"phone_number": "+919811100004", "flow": "login"})
    assert r.status_code == 404
    assert r.json()["detail"] == "No account found for that phone number — sign up instead."
    assert _otp_rows("+919811100004") == 0


def test_login_request_with_a_registered_phone_still_sends(client):
    _register_phone(client, "+919811100005")
    r = client.post("/auth/otp/request", json={"phone_number": "+919811100005", "flow": "login"})
    assert r.status_code == 200


def test_request_without_flow_keeps_legacy_behaviour(client):
    r = client.post("/auth/otp/request", json={"phone_number": "+919811100006"})
    assert r.status_code == 200
```

Append to `backend/tests/api/test_email_otp_routes.py`:

```python
def test_email_login_request_with_an_unknown_email_is_404(client):
    r = client.post("/auth/email-otp/request", json={"email": "nobody@example.com", "flow": "login"})
    assert r.status_code == 404
    assert r.json()["detail"] == "No account found for that email — sign up instead."


def test_email_request_without_flow_is_unchanged(client):
    r = client.post("/auth/email-otp/request", json={"email": "nobody2@example.com"})
    assert r.status_code == 200
```

- [ ] **Step 2: Run to confirm they fail**

Run: `cd backend && python3 -m pytest tests/api/test_auth_routes.py tests/api/test_email_otp_routes.py -q -k "signup_request or signup_verify or login_request or without_flow or email_login_request"`
Expected: the 409/404 tests FAIL (status 200). The two "without flow" tests PASS.

- [ ] **Step 3: Implement the backend**

`schemas.py`:

```python
class OtpRequestBody(BaseModel):
    phone_number: str
    pending_token: str | None = None
    # Staging-QA fix 1 (2026-09-30): with no pending_token, "signup" rejects a
    # registered number and "login" an unknown one BEFORE a code is sent.
    # Omitted = legacy behaviour (internal test callers).
    flow: Literal["signup", "login"] | None = None
```

In `EmailOtpRequestBody`, add after `pending_token`:

```python
    # Staging-QA fix 1: only "login" exists here -- email sign-up starts at
    # /auth/signup/email, and the phone-first email step carries pending_token.
    flow: Literal["login"] | None = None
```

`auth.py` `request_otp`: change the `if body.pending_token:` block's end so a new `elif` follows it, before the `try: create_otp_request`:

```python
    elif body.flow is not None:
        existing = find_or_backfill_phone_identity(db, body.phone_number)
        if body.flow == "signup" and existing is not None:
            raise HTTPException(status_code=409, detail="An account with this phone number already exists.")
        if body.flow == "login" and existing is None:
            raise HTTPException(
                status_code=404, detail="No account found for that phone number — sign up instead."
            )
```

`auth.py` `request_email_otp`: after the `if body.pending_token:` block add:

```python
    elif body.flow == "login" and find_identity_by_subject(db, AuthIdentityProvider.EMAIL_OTP, body.email) is None:
        raise HTTPException(status_code=404, detail="No account found for that email — sign up instead.")
```

`auth.py` `verify_otp_route`, replace lines 297-299:

```python
    existing = find_or_backfill_phone_identity(db, body.phone_number)
    if existing is not None:
        if body.flow == "signup":
            # Belt-and-braces for request_otp's own check: the number was
            # registered between request and verify. Never log in on sign-up.
            raise HTTPException(status_code=409, detail="An account with this phone number already exists.")
        return _session_response(existing.user_id, AuthIdentityProvider.PHONE_OTP, db)
```

- [ ] **Step 4: Run backend tests**

Run: `cd backend && python3 -m pytest tests/api/test_auth_routes.py tests/api/test_email_otp_routes.py -q`
Expected: all PASS, including every pre-existing test.

- [ ] **Step 5: Write the failing frontend tests**

`frontend/src/features/auth/api.test.ts`: add, following the file's existing `fetch` mock style:

```ts
it("requestOtp sends flow when given", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "OTP sent.", otp: "1" })));
  vi.stubGlobal("fetch", fetchMock);
  await requestOtp("+919800000000", undefined, "signup");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ phone_number: "+919800000000", flow: "signup" });
});

it("requestEmailOtp sends flow when given", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "OTP sent.", otp: "1" })));
  vi.stubGlobal("fetch", fetchMock);
  await requestEmailOtp("a@b.com", undefined, "login");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: "a@b.com", flow: "login" });
});
```

`frontend/src/features/auth/AuthEntryFlow.test.tsx`: add, using the file's existing `vi.mock("./api")` setup and landing helpers:

```ts
it("sign-up sends flow=signup and a 409 offers Log in instead", async () => {
  vi.mocked(api.requestOtp).mockRejectedValue(new ApiError(409, "An account with this phone number already exists."));
  renderFlow({ initialMode: "signup" });
  submitLandingPhone("9811100001");
  await screen.findByText("An account with this phone number already exists.");
  expect(api.requestOtp).toHaveBeenCalledWith("+91 9811100001", undefined, "signup");
  expect(screen.getByRole("button", { name: /log in instead/i })).toBeInTheDocument();
});

it("login with an unknown number offers Sign up instead", async () => {
  vi.mocked(api.requestOtp).mockRejectedValue(new ApiError(404, "No account found for that phone number — sign up instead."));
  renderFlow({ initialMode: "login", initialStep: "phone" });
  submitPhoneEntry("9811100004");
  await screen.findByText(/No account found for that phone number/);
  expect(api.requestOtp).toHaveBeenCalledWith("+91 9811100004", undefined, "login");
  fireEvent.click(screen.getByRole("button", { name: /sign up instead/i }));
  expect(await screen.findByText("Create your account")).toBeInTheDocument();
});

it("resend keeps the login flow for an email login", async () => {
  vi.mocked(api.requestEmailOtp).mockResolvedValue({ message: "OTP sent.", otp: "123456" });
  renderFlow({ initialMode: "login", initialStep: "email" });
  submitEmailEntry("a@b.com");
  fireEvent.click(await screen.findByRole("button", { name: /resend/i }));
  expect(vi.mocked(api.requestEmailOtp).mock.calls.at(-1)).toEqual(["a@b.com", undefined, "login"]);
});
```

If `renderFlow` / `submitLandingPhone` / `submitPhoneEntry` / `submitEmailEntry` don't already exist in the test file under those names, add them at the top of the file. Each renders `<AuthEntryFlow {...props} />` inside the file's existing providers, types into the named input and clicks its submit button. The phone format passed to `requestOtp` must match what `normalizePhone` (validation.ts) produces today; check an existing assertion in the file and copy its format.

- [ ] **Step 6: Run to confirm they fail**

Run: `cd frontend && npx vitest run src/features/auth/api.test.ts src/features/auth/AuthEntryFlow.test.tsx`
Expected: the new tests FAIL (wrong call arguments; no "Sign up instead" button).

- [ ] **Step 7: Implement the frontend**

`api.ts`:

```ts
export async function requestOtp(
  phoneNumber: string,
  pendingToken?: string,
  flow?: "signup" | "login",
): Promise<OtpRequestResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Id": getOrCreateDeviceId() },
    body: JSON.stringify({
      phone_number: phoneNumber,
      ...(pendingToken ? { pending_token: pendingToken } : {}),
      ...(flow ? { flow } : {}),
    }),
  });
  await throwIfError(response);
  return (await response.json()) as OtpRequestResponse;
}

export async function requestEmailOtp(email: string, pendingToken?: string, flow?: "login"): Promise<OtpRequestResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/email-otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Id": getOrCreateDeviceId() },
    body: JSON.stringify({
      email,
      ...(pendingToken ? { pending_token: pendingToken } : {}),
      ...(flow ? { flow } : {}),
    }),
  });
  await throwIfError(response);
  return (await response.json()) as OtpRequestResponse;
}
```

`validation.ts`, next to `isAccountExistsError`:

```ts
/** True for the login-time "no account found … sign up instead" errors (phone and email). */
export function isNoAccountError(message: string | null): boolean {
  return !!message && /no account found/i.test(message);
}
```

`AuthEntryFlow.tsx`:
- `handlePhoneSubmit`: `const result = await requestOtp(phone, phoneGateToken ?? undefined, phoneGateToken ? undefined : authMode);`
- `handleEmailLoginRequest`: `const result = await requestEmailOtp(email, undefined, "login");`
- `handleEmailOtpResend`: pass `emailOtpFlow === "login" ? "login" : undefined` as the third argument.
- Add, next to `handleGoToLogin`:

```tsx
  // "Sign up instead" shortcut from a login-time "no account found" error.
  const handleGoToSignup = () => {
    setAuthMode("signup");
    setEmailOtpToken(null);
    setEmailOtpEmail("");
    goToStep("landing");
  };
```

- Pass `onGoToSignup={phoneGateToken ? undefined : handleGoToSignup}` to `<PhoneEntry>`. Pass `onGoToSignup={handleGoToSignup}` to the login-context `<EmailEntry>`.

`PhoneEntry.tsx`: add `onGoToSignup?: () => void;` to the props interface (with a doc comment matching `onGoToLogin`'s) and destructure it. Directly after the existing `onGoToLogin && isAccountExistsError(error)` block add:

```tsx
          {onGoToSignup && isNoAccountError(error) && (
            <button
              type="button"
              onClick={onGoToSignup}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl bg-[#22C55E]/10 border border-[#22C55E]/30 text-xs font-bold text-[#22C55E] hover:bg-[#22C55E]/15 transition-colors cursor-pointer animate-in fade-in duration-150"
            >
              Sign up instead
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
```

`EmailEntry.tsx`: add the same `onGoToSignup?: () => void` prop. Directly below the element that renders the `error` prop's alert, insert the same JSX block as above (import `ArrowRight` from `lucide-react` and `isNoAccountError` from `./validation` if they aren't imported yet).

- [ ] **Step 8: Run the frontend checks**

Run: `cd frontend && npx vitest run src/features/auth && npx tsc -b`
Expected: all PASS, no type errors. Stop here; the user commits.

---

### Task 2: `users.primary_goals`, expand phase (issue 2, backend)

**Files:**
- Create: `backend/alembic/versions/0019_user_primary_goals.py`
- Modify: `backend/app/models/user.py:32`
- Modify: `backend/app/services/auth/schemas.py:147-163` (`UpdateMeBody`, `MeResponse`)
- Modify: `backend/app/api/auth.py:390-405` (`_me_response`), `:531-548` (`update_me`)
- Test: `backend/tests/test_migrations.py`, `backend/tests/api/test_auth_routes.py`, `backend/tests/functional_postgres/test_member_detection_postgres.py` (append)

**Interfaces:**
- Produces: `User.primary_goals: list[str] | None` (enum values as strings); `UpdateMeBody.primary_goals: list[PrimaryGoal] | None`; `MeResponse.primary_goals: list[PrimaryGoal] | None`. `MeResponse.primary_goal` is **removed** from the response. The frontend (Task 3) reads only `primary_goals`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_migrations.py`:

```python
def test_0019_backfills_primary_goals_and_keeps_old_column(tmp_path, monkeypatch):
    import json
    import sqlite3

    db_path = tmp_path / "goals.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    assert _alembic("upgrade", "0018").returncode == 0
    conn = sqlite3.connect(db_path)
    conn.executemany(
        "INSERT INTO users (id, phone_number, created_at, primary_goal) VALUES (?, ?, '2026-09-01 10:00:00.000000', ?)",
        [("u1", "+919800000191", "family_management"), ("u2", "+919800000192", None)],
    )
    conn.commit(); conn.close()

    up = _alembic("upgrade", "0019")
    assert up.returncode == 0, up.stderr
    conn = sqlite3.connect(db_path)
    rows = dict(conn.execute("SELECT id, primary_goals FROM users"))
    old = dict(conn.execute("SELECT id, primary_goal FROM users"))
    conn.close()
    assert json.loads(rows["u1"]) == ["family_management"]
    assert rows["u2"] is None
    assert old["u1"] == "family_management"  # contract phase (0021) drops it, not 0019

    down = _alembic("downgrade", "0018")
    assert down.returncode == 0, down.stderr
```

`backend/tests/api/test_auth_routes.py`:

```python
def test_patch_me_saves_goal_list_and_dual_writes_first_item(client):
    headers = _headers(client, "+919811100010")  # use the file's existing auth-header helper name
    r = client.patch("/auth/me", json={"primary_goals": ["family_management", "consolidated_view"]}, headers=headers)
    assert r.status_code == 200
    assert r.json()["primary_goals"] == ["family_management", "consolidated_view"]
    from app.db.session import get_db
    from app.main import app
    from app.models.user import User
    db = next(app.dependency_overrides[get_db]())
    user = db.query(User).filter_by(phone_number="+919811100010").one()
    assert user.primary_goal.value == "family_management"  # old tasks during a rolling deploy read this


def test_patch_me_dedupes_goals_and_rejects_bad_values(client):
    headers = _headers(client, "+919811100011")
    ok = client.patch("/auth/me", json={"primary_goals": ["family_management", "family_management"]}, headers=headers)
    assert ok.json()["primary_goals"] == ["family_management"]
    assert client.patch("/auth/me", json={"primary_goals": ["foo"]}, headers=headers).status_code == 422
    assert client.patch("/auth/me", json={"primary_goals": []}, headers=headers).status_code == 422
```

`backend/tests/functional_postgres/test_member_detection_postgres.py`, append (reusing the file's `postgres_url` fixture and `_alembic`):

```python
def test_0019_primary_goals_check_constraint_on_postgres(postgres_url, monkeypatch):
    from sqlalchemy import create_engine, text
    from sqlalchemy.exc import IntegrityError

    monkeypatch.setenv("DATABASE_URL", postgres_url)
    _alembic("downgrade", "base")
    assert _alembic("upgrade", "head").returncode == 0
    engine = create_engine(postgres_url)
    try:
        with engine.begin() as conn:
            conn.execute(text("INSERT INTO users (id, phone_number, created_at, primary_goals) VALUES "
                              "(gen_random_uuid(), '+919800001901', now(), '[\"family_management\"]'::jsonb)"))
        for bad in ('["foo"]', '[]', '"family_management"'):
            with pytest.raises(IntegrityError):
                with engine.begin() as conn:
                    conn.execute(text("INSERT INTO users (id, phone_number, created_at, primary_goals) VALUES "
                                      f"(gen_random_uuid(), '+9198000019{len(bad):02d}', now(), '{bad}'::jsonb)"))
    finally:
        engine.dispose()
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd backend && python3 -m pytest tests/test_migrations.py -k 0019 tests/api/test_auth_routes.py -k "goal" -q`
Expected: FAIL (no revision 0019; unknown field `primary_goals`).

- [ ] **Step 3: Write migration 0019**

```python
"""users.primary_goals (expand phase): multi-select onboarding goal

Revision ID: 0019
Revises: 0018
Create Date: 2026-09-30

Staging-QA fix 2. JSONB on Postgres with a containment CHECK (the enum type
used to reject unknown values; this keeps that guarantee), plain JSON on
SQLite (validated by the API). users.primary_goal is deliberately kept: a
rolling ECS deploy runs old tasks that still read it. Revision 0021 drops it
in a later release. The downgrade loses nothing because the old column is
still there.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None

_ALLOWED = '["consolidated_view","understand_holdings","family_management","performance_comparison"]'


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"
    op.add_column(
        "users",
        sa.Column("primary_goals", postgresql.JSONB() if is_pg else sa.JSON(), nullable=True),
    )
    if is_pg:
        op.execute("UPDATE users SET primary_goals = jsonb_build_array(primary_goal::text) WHERE primary_goal IS NOT NULL")
        op.create_check_constraint(
            "ck_users_primary_goals_allowed",
            "users",
            "primary_goals IS NULL OR (jsonb_typeof(primary_goals) = 'array'"
            " AND jsonb_array_length(primary_goals) BETWEEN 1 AND 4"
            f" AND primary_goals <@ '{_ALLOWED}'::jsonb)",
        )
    else:
        op.execute("UPDATE users SET primary_goals = json_array(primary_goal) WHERE primary_goal IS NOT NULL")


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.drop_constraint("ck_users_primary_goals_allowed", "users", type_="check")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("primary_goals")
```

- [ ] **Step 4: Model, schemas, routes**

`models/user.py`: add the import `from sqlalchemy import JSON` and `from sqlalchemy.dialects.postgresql import JSONB`. Under `primary_goal`:

```python
    # Staging-QA fix 2 (2026-09-30), expand phase: the list is the source of
    # truth; primary_goal is dual-written (first item) until migration 0021
    # drops it. Always ASSIGN a new list -- in-place .append() isn't tracked.
    primary_goals: Mapped[list[str] | None] = mapped_column(JSON().with_variant(JSONB(), "postgresql"))
```

`schemas.py`, `UpdateMeBody`: replace `primary_goal` with:

```python
    primary_goals: list[PrimaryGoal] | None = None

    @field_validator("primary_goals")
    @classmethod
    def _dedupe_goals(cls, value: list[PrimaryGoal] | None) -> list[PrimaryGoal] | None:
        if value is None:
            return None
        unique = list(dict.fromkeys(value))
        if not 1 <= len(unique) <= 4:
            raise ValueError("Pick between 1 and 4 goals.")
        return unique
```

In `MeResponse`, replace `primary_goal: PrimaryGoal | None` with `primary_goals: list[PrimaryGoal] | None`.

`auth.py` `_me_response`: `primary_goals=user.primary_goals,` replacing `primary_goal=…`. In `update_me`:

```python
    if body.primary_goals is not None:
        goals = [g.value for g in body.primary_goals]
        user.primary_goals = goals
        user.primary_goal = PrimaryGoal(goals[0])  # dual write until 0021
```

(add `PrimaryGoal` to the `app.models.enums` import in `auth.py`).

- [ ] **Step 5: Run tests**

Run: `cd backend && python3 -m pytest tests/test_migrations.py tests/api/test_auth_routes.py -q && python3 -m pytest tests/functional_postgres -q -k 0019`
Expected: SQLite tests PASS. The Postgres test PASSES if `TEST_DATABASE_URL` is set; otherwise it SKIPS, and the task report must say "skipped". Then run the whole suite once: `python3 -m pytest -q -p no:cacheprovider`. Fix any test that asserted `primary_goal` in a `/me` response by switching it to `primary_goals`. Stop.

---

### Task 3: Multi-select goal screen (issue 2, frontend)

**Files:**
- Modify: `frontend/src/features/auth/types.ts:21-47`
- Modify: `frontend/src/features/auth/Q3Purpose.tsx` (props, option rendering, footer)
- Modify: `frontend/src/features/auth/OnboardingFlow.tsx:15-25, 110-140`
- Modify: test fixtures that build a `MeResponse`: `App.test.tsx`, `api.test.ts`, `AuthEntryFlow.test.tsx`, `OnboardingFlow.test.tsx`, `AuthContext.test.tsx` (rename `primary_goal: null` to `primary_goals: null`)
- Test: `frontend/src/features/auth/OnboardingFlow.test.tsx`

**Interfaces:**
- Consumes: Task 2's `primary_goals` on `PATCH /auth/me` and `GET /auth/me`.
- Produces: `Q3PurposeProps { selectedValues: PrimaryGoal[]; onContinue: (values: PrimaryGoal[]) => void; onBack; onSkip; isMobile?; currentStepIndex?; totalSteps? }`.

- [ ] **Step 1: Write the failing test** (in `OnboardingFlow.test.tsx`, replacing the existing single-select `primary_goal: "consolidated_view"` assertion at line ~113)

```ts
it("Q3 lets the user pick several goals and saves them on Continue", async () => {
  renderAtStep("q3_purpose"); // the file's existing helper that mounts OnboardingFlow at a step
  const cont = screen.getByRole("button", { name: "Continue" });
  expect(cont).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /Consolidated portfolio view/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Family wealth tracking/ }));
  expect(screen.getByRole("checkbox", { name: /Family wealth tracking/ })).toHaveAttribute("aria-checked", "true");
  expect(api.updateMe).not.toHaveBeenCalledWith(expect.objectContaining({ primary_goals: expect.anything() }));
  fireEvent.click(cont);
  await waitFor(() =>
    expect(api.updateMe).toHaveBeenCalledWith({ primary_goals: ["consolidated_view", "family_management"] }),
  );
});

it("Q3 toggling an option twice unselects it", () => {
  renderAtStep("q3_purpose");
  const opt = screen.getByRole("checkbox", { name: /Compare distributor fees/ });
  fireEvent.click(opt);
  fireEvent.click(opt);
  expect(opt).toHaveAttribute("aria-checked", "false");
  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
});
```

If the file has no `renderAtStep` helper, add one. It mocks `useAuth` so that `me.onboarding_step` is the given step, then renders `<OnboardingFlow />`, the same way the file's existing tests do.

- [ ] **Step 2: Run to confirm failure**

Run: `cd frontend && npx vitest run src/features/auth/OnboardingFlow.test.tsx`
Expected: FAIL (no checkbox role, no Continue button).

- [ ] **Step 3: Implement**

`types.ts`: `MeResponse.primary_goals: PrimaryGoal[] | null;` (remove `primary_goal`), `UpdateMeBody.primary_goals?: PrimaryGoal[];` (remove `primary_goal`).

`Q3Purpose.tsx`:
- Props: replace `selectedValue` and `onSelect` with `selectedValues: PrimaryGoal[]` and `onContinue: (values: PrimaryGoal[]) => void`.
- Local state: `const [picked, setPicked] = useState<PrimaryGoal[]>(selectedValues);` and
  `const toggle = (v: PrimaryGoal) => setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));`
- In the option `motion.button`: `const isSelected = picked.includes(option.value);`, `role="checkbox"`, `aria-checked={isSelected}`, `onClick={() => toggle(option.value)}`. Replace the right-hand `ChevronRight` circle with a check indicator: `{isSelected ? <Check className="h-4 w-4" /> : null}` inside the same circle `div` (import `Check` from `lucide-react`; drop `ChevronRight` if unused).
- Wrap the options container in `role="group" aria-label="What brings you to Unifolio?"`.
- Both subtexts become: `Pick all that apply, and we'll tailor your dashboard around them`.
- Mobile: pass `ctaLabel="Continue"`, `onCtaClick={() => onContinue(picked)}` and `ctaDisabled={picked.length === 0}` to `MobileOnboardingScreen`.
- Desktop footer: between Back and Skip, add:

```tsx
        <button
          type="button"
          disabled={picked.length === 0}
          onClick={() => onContinue(picked)}
          className="inline-flex items-center justify-center px-5 rounded-xl text-xs font-semibold text-white bg-[#22C55E] disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px] cursor-pointer"
        >
          Continue
        </button>
```

(If `Q1Name.tsx` has a desktop Continue button with its own class set, use that exact class string instead, so the two steps match.)

`OnboardingFlow.tsx`: `OnboardingAnswers.primaryGoals: PrimaryGoal[]`, initial `[]`. Both `<Q3Purpose>` usages:

```tsx
          selectedValues={answers.primaryGoals}
          onContinue={(primaryGoals) => {
            void updateMe({ primary_goals: primaryGoals });
            setAnswers((a) => ({ ...a, primaryGoals }));
            advance("trust_primer");
          }}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd frontend && npx vitest run src/features/auth src/App.test.tsx && npx tsc -b`
Expected: PASS. Stop.

---

### Task 4: Statement period on imports (issue 6)

**Files:**
- Modify: `backend/app/services/import_/parser.py:116-120` (new helper), `:163-173` (`ParseResult`), `:295-305` (construction)
- Modify: `backend/app/services/import_/confirm_people.py:248-253` (`Import(...)`)
- Create: `backend/alembic/versions/0020_import_statement_period_backfill.py`
- Modify: `frontend/src/features/profile/ImportHistorySection.tsx:20` (export `formatDate`), `frontend/src/mobile/features/import/MobileImportHistory.tsx:198-201`
- Test: `backend/tests/services/import_/test_parser.py`, `backend/tests/services/import_/test_confirm_people.py`, `backend/tests/test_migrations.py`

**Interfaces:**
- Produces: `parse_statement_date(value: object) -> date | None`; `ParseResult.statement_from: date | None = None`, `ParseResult.statement_to: date | None = None`.

- [ ] **Step 1: Write the failing tests**

`test_parser.py`:

```python
from datetime import date
from pathlib import Path

from app.services.import_.parser import parse_cas_pdf_bytes, parse_statement_date

FIXTURES = Path(__file__).resolve().parents[4] / "Docs/orchestration/qa-fixtures/synthetic-cas"


def test_parse_statement_date_formats():
    assert parse_statement_date("01-Apr-2025") == date(2025, 4, 1)
    assert parse_statement_date("2025-04-01") == date(2025, 4, 1)
    assert parse_statement_date(date(2025, 4, 1)) == date(2025, 4, 1)


def test_unreadable_period_gives_none():
    for bad in (None, "", "April 2025", "31-Foo-2025", 12):
        assert parse_statement_date(bad) is None


def test_fixture_statement_period_is_parsed():
    result = parse_cas_pdf_bytes((FIXTURES / "family_cas_1.pdf").read_bytes(), "MF@123")
    assert (result.statement_from, result.statement_to) == (date(2025, 4, 1), date(2025, 9, 30))
```

`test_confirm_people.py`: in the file's existing confirm-happy-path test setup, build the `ParseResult` with `statement_from=date(2025, 4, 1), statement_to=date(2025, 9, 30)`, then add:

```python
    imports = db_session.query(Import).all()
    assert imports and all(
        (i.statement_from_date, i.statement_to_date) == (date(2025, 4, 1), date(2025, 9, 30)) for i in imports
    )
```

`test_migrations.py`:

```python
def test_0020_backfills_statement_period_from_raw_parser_output(tmp_path, monkeypatch):
    import sqlite3

    db_path = tmp_path / "period.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    assert _alembic("upgrade", "0019").returncode == 0
    conn = sqlite3.connect(db_path)
    conn.execute("INSERT INTO users (id, phone_number, created_at) VALUES ('u1', '+919800002001', '2026-09-01 10:00:00.000000')")
    conn.execute(
        "INSERT INTO household_members (id, user_id, name, relationship, created_at, details_completed_at, origin, name_source)"
        " VALUES ('m1', 'u1', 'A', 'self', '2026-09-01 10:00:00.000000', '2026-09-01 10:00:00.000000', 'onboarding', 'user_entered')"
    )
    rows = [
        ("i1", '{"statement_period": {"from_": "01-Apr-2025", "to": "30-Sep-2025"}}'),
        ("i2", '{"statement_period": {"from": "01-Oct-2025", "to": "31-Dec-2025"}}'),
        ("i3", '{"folios": []}'),
        ("i4", "not json"),
    ]
    for iid, raw in rows:
        conn.execute(
            "INSERT INTO imports (id, household_member_id, status, uploaded_at, raw_parser_output)"
            " VALUES (?, 'm1', 'import_successful', '2026-09-01 10:00:00.000000', ?)", (iid, raw),
        )
    conn.commit(); conn.close()

    up = _alembic("upgrade", "0020")
    assert up.returncode == 0, up.stderr
    conn = sqlite3.connect(db_path)
    got = {r[0]: r[1:] for r in conn.execute("SELECT id, statement_from_date, statement_to_date FROM imports")}
    conn.close()
    assert got["i1"] == ("2025-04-01", "2025-09-30")
    assert got["i2"] == ("2025-10-01", "2025-12-31")
    assert got["i3"] == (None, None)
    assert got["i4"] == (None, None)
```

(If `imports` or `household_members` has other NOT NULL columns without defaults at 0019, add them to the INSERTs. Check `PRAGMA table_info` in a first run.)

- [ ] **Step 2: Run to confirm failure**

Run: `cd backend && python3 -m pytest tests/services/import_/test_parser.py tests/services/import_/test_confirm_people.py tests/test_migrations.py -k "statement or period or 0020" -q`
Expected: FAIL (import error for `parse_statement_date`; no revision 0020).

- [ ] **Step 3: Implement the parser and confirm**

`parser.py`, below `_parse_date`:

```python
def parse_statement_date(value: object) -> date | None:
    """casparser's statement_period dates ("01-Apr-2025"), ISO strings, or
    dates. Anything else is None: a missing or unreadable period must never
    fail an import (staging-QA fix 6)."""
    if isinstance(value, date):
        return value
    if not isinstance(value, str) or not value.strip():
        return None
    for fmt in ("%d-%b-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value.strip()[:11], fmt).date()
        except ValueError:
            continue
    return None
```

(add `from datetime import datetime` alongside the existing `date` import).

`ParseResult`: add `statement_from: date | None = None` and `statement_to: date | None = None` after `unassigned_folio_keys`. In `_normalize_cas_data`'s `return ParseResult(`:

```python
        statement_from=parse_statement_date(getattr(data.statement_period, "from_", None)),
        statement_to=parse_statement_date(getattr(data.statement_period, "to", None)),
```

`confirm_people.py` `Import(...)` at line 248: add `statement_from_date=parse_result.statement_from, statement_to_date=parse_result.statement_to,`.

- [ ] **Step 4: Write migration 0020**

```python
"""imports statement period backfill (data only)

Revision ID: 0020
Revises: 0019
Create Date: 2026-09-30

Staging-QA fix 6: no import path ever wrote imports.statement_from_date /
statement_to_date. Every confirmed import kept casparser's statement_period
inside raw_parser_output (_person_raw_output preserves top-level keys), so
the dates are recovered from there. Pydantic dumps the key as "from_"; "from"
is accepted too. Unreadable rows stay NULL. No schema change, so the
downgrade is a no-op.
"""
import json
from datetime import datetime

from alembic import op
import sqlalchemy as sa

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def _date(value):
    if not isinstance(value, str):
        return None
    for fmt in ("%d-%b-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value.strip()[:11], fmt).date()
        except ValueError:
            continue
    return None


def upgrade() -> None:
    bind = op.get_bind()
    imports = sa.table(
        "imports",
        sa.column("id", sa.Uuid() if bind.dialect.name == "postgresql" else sa.String()),
        sa.column("raw_parser_output", sa.Text()),
        sa.column("statement_from_date", sa.Date()),
        sa.column("statement_to_date", sa.Date()),
    )
    rows = bind.execute(
        sa.select(imports.c.id, imports.c.raw_parser_output).where(imports.c.statement_from_date.is_(None))
    ).all()
    for row_id, raw in rows:
        try:
            data = raw if isinstance(raw, dict) else json.loads(raw or "")
        except (TypeError, ValueError):
            continue
        period = data.get("statement_period") if isinstance(data, dict) else None
        if not isinstance(period, dict):
            continue
        start, end = _date(period.get("from_", period.get("from"))), _date(period.get("to"))
        if start and end:
            bind.execute(
                imports.update().where(imports.c.id == row_id)
                .values(statement_from_date=start, statement_to_date=end)
            )


def downgrade() -> None:
    pass
```

Before running, check how `raw_parser_output` is typed in `backend/app/models/imports.py` (JSON or Text). If it's JSON on Postgres, the `isinstance(raw, dict)` branch handles it. Keep `sa.Text()` in the lightweight table definition only if the column really is text; otherwise use `sa.JSON()`.

- [ ] **Step 5: Frontend mobile date format**

`ImportHistorySection.tsx:20`: change `const formatDate` to `export const formatDate`. In `MobileImportHistory.tsx`, import it from `@/features/profile/ImportHistorySection` and set:

```tsx
          const dateRange =
            item.statement_from_date && item.statement_to_date
              ? `${formatDate(item.statement_from_date)} – ${formatDate(item.statement_to_date)}`
              : `Uploaded ${new Date(item.uploaded_at).toLocaleDateString()}`;
```

- [ ] **Step 6: Run everything for this task**

Run: `cd backend && python3 -m pytest tests/services/import_ tests/test_migrations.py tests/api/test_imports_routes.py -q` then `cd frontend && npx vitest run src/features/profile src/mobile/features/import && npx tsc -b`
Expected: PASS. Stop.

---

### Task 5: Ribbon grid layout and auto-confirm (issue 3, frontend only)

**Files:**
- Modify: `frontend/src/features/import/ReviewTable.tsx` (props; `:209-220` container; `:404` grid; `:423-437` top bar; AMFI placeholder in grid and list views)
- Modify: `frontend/src/features/import/MemberRibbonReview.tsx:49, 97, 129, 136-215`
- Test: `frontend/src/features/import/MemberRibbonReview.test.tsx`, `frontend/src/features/import/ReviewTable.test.tsx`

**Interfaces:**
- Produces: `ReviewTableProps.embedded?: boolean`.
- Rule (decided 30 Sep): `autoConfirmed = count === 0`, whatever the "matched by name" / "assigned by you" funds. The closed header always shows the name-match count.

- [ ] **Step 1: Update and add tests** in `MemberRibbonReview.test.tsx`

The fixture's Aditi has 0 unresolved, so she is now auto-confirmed. Change the first test:

```ts
  it("auto-confirms a member with nothing to resolve; others still need review", () => {
    renderRibbons();
    expect(screen.getByRole("button", { name: /Aditi Sharma \(Me\).*Confirmed · 1 fund/ })).toBeInTheDocument();
    expect(ribbon("Ramesh Sharma", 2)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm imports" })).toBeDisabled();
  });

  it("a member whose only issue was resolved confirms itself, including a matched-by-name fund", async () => {
    renderRibbons();
    fireEvent.click(ribbon("Ramesh Sharma", 2));
    await pickDirect(0);
    await pickDirect(1);
    expect(await screen.findByRole("button", { name: /Ramesh Sharma.*Confirmed · 2 funds · 1 matched by name/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm imports" })).toBeEnabled();
  });

  it("Confirm imports sends every member's confirmations without opening clean ribbons", () => {
    const p = familyPreview({
      schemes: [scheme("m1", { person_key: "me" }), scheme("r1", { person_key: "ramesh" })],
      people: [
        person("me", "Aditi Sharma", { is_me: true, status: "me" }),
        person("ramesh", "Ramesh Sharma", { unresolved_count: 0 }),
      ],
    });
    const { onConfirmImports } = renderRibbons({ preview: p, people: p.people });
    fireEvent.click(screen.getByRole("button", { name: "Confirm imports" }));
    expect(onConfirmImports).toHaveBeenCalledTimes(1);
    expect(onConfirmImports.mock.calls[0][0].map((x: { person_key: string }) => x.person_key)).toEqual(["me", "ramesh"]);
  });
```

Any other existing test that opens Aditi's ribbon by the old label `Click to review Aditi Sharma’s holdings (0 unresolved holdings)` must now find it by `/Aditi Sharma \(Me\)/`. Update those `ribbon("Aditi Sharma", 0)` calls. Any test that asserted "Confirm imports stays disabled until Aditi is confirmed" now contradicts the decision: delete it, and say so in the task report.

`ReviewTable.test.tsx`:

```ts
it("embedded mode caps the grid at 3 columns and drops the page padding", () => {
  const { container } = render(<ReviewTable preview={preview()} schemes={[scheme("a")]} confirming={false} onConfirm={() => {}} hideConfirm hideHeader embedded />);
  const grid = container.querySelector(".grid.grid-cols-1");
  expect(grid?.className).toContain("lg:grid-cols-3");
  expect(grid?.className).not.toContain("xl:grid-cols-4");
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd frontend && npx vitest run src/features/import/MemberRibbonReview.test.tsx src/features/import/ReviewTable.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement ReviewTable**

- Props: add `embedded?: boolean;` with the doc comment `/** Inside a member ribbon: the window-width breakpoints are wrong there, so cap columns and drop page padding. */`, and destructure `embedded = false`.
- Root container class (line ~216): replace `"… px-1.5 sm:px-6 lg:px-8 …"` so that when `embedded` it uses `px-0`. Build it with `cn(base, embedded ? "px-0 pb-4" : "px-1.5 sm:px-6 lg:px-8 pb-28 sm:pb-24", …)`, moving the `pb-*` classes out of the base string.
- Grid (line 404): `className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5", embedded ? "lg:grid-cols-3" : "md:grid-cols-3 xl:grid-cols-4 lg:gap-6")}`.
- Top bar (line 423): `className="flex flex-wrap items-center justify-between gap-2"`. On the folio chip `span` add `whitespace-nowrap min-w-0 max-w-full truncate` and `title={\`Folio: ${scheme.folio}\`}`.
- AMFI input placeholder (grid and list views): `"6-digit AMFI code"`.

- [ ] **Step 4: Implement MemberRibbonReview**

- Line 129 container: `max-w-6xl` instead of `max-w-4xl`.
- Pass `embedded` to `<ReviewTable>`.
- Inside the `shown.map`:

```tsx
          const count = unresolved[key] ?? schemes.filter(startsUnresolved).length;
          // Decided 30 Sep (staging QA 3b): nothing to resolve = confirmed, even
          // with funds matched by name. The header keeps the name-match count
          // visible, since nobody has to open this ribbon any more.
          const autoConfirmed = count === 0;
          const isReviewed = reviewed.has(key) || autoConfirmed;
          const byName = matched.length > 0 ? ` · ${matched.length} matched by name` : "";
```

- Header second line:

```tsx
                    {isReviewed
                      ? `Confirmed · ${fundCount(schemes.length)}${byName}`
                      : `Click to review ${name}’s holdings (${count} unresolved holdings)`}
```

- Header first line: keep the `CheckCircle2` icon, and replace the `✓ ${label}` text with `label` followed by `<span className="ml-2 inline-flex rounded-full bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--color-positive)]">Confirmed</span>` when `isReviewed`.
- Inside the panel: when `isReviewed`, render the Confirm button as a disabled "Confirmed" button (`disabled`, label `Confirmed`) so the state reads as done. Otherwise keep today's button.
- `allReviewed` stays `shown.every((p) => reviewed.has(p.person_key) || currentCount(p) === 0)`, where `currentCount(p)` repeats the `count` expression. Hoist the expression into `const countFor = (key: string, schemes: SchemeMatchPreview[]) => unresolved[key] ?? schemes.filter(startsUnresolved).length;` and use it in both places.

- [ ] **Step 5: Run and check at phone width**

Run: `cd frontend && npx vitest run src/features/import src/mobile/features/import && npx tsc -b`
Expected: PASS. Then run the app (`npm run dev`, a mock preview if needed). Look at the review screen at 1280px and 400px widths and confirm that no chip overflows its card. Report what you saw; `session.md` item 3 (mobile ribbon QA) stays open unless it was actually checked on a phone width. Stop.

---

### Task 6: `use_detected_pan` on the unlock endpoint (issue 4, backend)

**Files:**
- Modify: `backend/app/services/dashboard/member_details.py:128-133` (`MemberDetailsRequest`), `:166-200` (`complete_member_details` head)
- Test: `backend/tests/api/test_member_details_routes.py`

**Interfaces:**
- Produces: `MemberDetailsRequest { name?: str; relationship: Relationship; relationship_other_label?: str; pan?: str; use_detected_pan: bool = False }`. Exactly one of `pan` / `use_detected_pan` is required. Otherwise the response is `422 {code: "invalid_member_details"}` (raised as `InvalidMemberDetailsError`, the existing 422 class).
- The 409 `detected_pan_mismatch` body is unchanged: `details.detected_pan_masked`.

- [ ] **Step 1: Write the failing tests** (in `test_member_details_routes.py`, using its `_headers`, `_add_locked`, `_db` and `PAN` helpers)

```python
def test_use_detected_pan_unlocks_with_the_statement_pan(client):
    h = _headers(client, "+919811200001")
    m = _add_locked(client, h)  # locked, detected PAN = PAN
    r = client.post(f"/household-members/{m.id}/details", json={"relationship": "parent", "use_detected_pan": True}, headers=h)
    assert r.status_code == 200, r.json()
    assert r.json()["lock_reason"] is None
    db = _db()
    got = db.get(HouseholdMember, m.id)
    assert got.pan_lookup_hash == hash_pan(PAN)
    assert got.pan_source == MemberPanSource.CAS and got.pan_verified_at is not None


def test_use_detected_pan_rejected_for_a_name_only_member(client):
    h = _headers(client, "+919811200002")
    m = _add_locked(client, h, detected=None)
    r = client.post(f"/household-members/{m.id}/details", json={"relationship": "parent", "use_detected_pan": True}, headers=h)
    assert r.status_code == 422


def test_pan_and_use_detected_pan_together_is_422(client):
    h = _headers(client, "+919811200003")
    m = _add_locked(client, h)
    r = client.post(f"/household-members/{m.id}/details",
                    json={"relationship": "parent", "pan": PAN, "use_detected_pan": True}, headers=h)
    assert r.status_code == 422


def test_neither_pan_nor_flag_is_422(client):
    h = _headers(client, "+919811200004")
    m = _add_locked(client, h)
    assert client.post(f"/household-members/{m.id}/details", json={"relationship": "parent"}, headers=h).status_code == 422


def test_use_detected_pan_still_raises_l4_when_pan_is_on_another_member(client):
    h = _headers(client, "+919811200005")
    m = _add_locked(client, h)
    # Another member of the same user already holds PAN permanently.
    db = _db()
    other = HouseholdMember(user_id=m.user_id, name="Dad", relationship=Relationship.PARENT,
                            created_at=datetime.now(timezone.utc), details_completed_at=datetime.now(timezone.utc),
                            origin=MemberOrigin.MANUAL, name_source=MemberNameSource.USER_ENTERED,
                            pan_encrypted=encrypt_pan(PAN), pan_lookup_hash=hash_pan(PAN))
    db.add(other); db.commit()
    r = client.post(f"/household-members/{m.id}/details", json={"relationship": "parent", "use_detected_pan": True}, headers=h)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "pan_belongs_to_other_member"
```

(Adjust `_add_locked`'s return value and its `detected` keyword to whatever the file's helper actually returns and accepts. It already takes `detected=PAN`. Import `MemberPanSource`, `MemberOrigin`, `MemberNameSource` and `encrypt_pan` where the file doesn't yet.)

- [ ] **Step 2: Run to confirm failure**

Run: `cd backend && python3 -m pytest tests/api/test_member_details_routes.py -q -k "detected_pan or neither or together"`
Expected: FAIL (422 from Pydantic on the missing `pan`, or 200 where 422 is expected).

- [ ] **Step 3: Implement**

```python
class MemberDetailsRequest(BaseModel):
    name: str | None = None
    relationship: Relationship
    relationship_other_label: str | None = None
    pan: str | None = None
    # Staging-QA fix 4 (2026-09-30): "The one on the statement" in the L3
    # popup. The browser only ever sees the masked detected PAN, so the server
    # uses its own stored copy.
    use_detected_pan: bool = False
```

In `complete_member_details`, replace `pan = normalise_pan_input(body.pan)` and the format check with:

```python
    if (body.pan is None) == (not body.use_detected_pan):
        raise InvalidMemberDetailsError("Enter a PAN, or use the one on the statement.")
    if body.use_detected_pan:
        if not locked or member.detected_pan_encrypted is None or is_name_only(member):
            raise InvalidMemberDetailsError("There’s no statement PAN to use for this person.")
        pan = decrypt_pan(member.detected_pan_encrypted)
    else:
        pan = normalise_pan_input(body.pan)
        if not _PAN_RE.match(pan):
            raise InvalidPanFormatError()
```

Move the existing `locked = member.is_locked` line above this block so `locked` is defined before the snippet uses it. The rest of the function stays as it is: `pan_hash`, the detected-mismatch check (it can't fire for the flag path, because the hashes are equal), `_holder`, L4/L5 and the writes. `matches_detected` is computed as today, so `pan_source` becomes `CAS` and `pan_verified_at` is set.

- [ ] **Step 4: Run tests**

Run: `cd backend && python3 -m pytest tests/api/test_member_details_routes.py tests/services/dashboard -q`
Expected: PASS. Stop.

---

### Task 7: L3 popup (issue 4, frontend)

**Files:**
- Create: `frontend/src/features/dashboard/members/DetectedPanMismatchDialog.tsx`
- Modify: `frontend/src/features/auth/types.ts:63-68` (`MemberDetailsBody`)
- Modify: `frontend/src/features/dashboard/members/memberDetailsForm.tsx:32-36, 70-100, 225-249`
- Modify: `frontend/src/features/dashboard/members/MemberDetailsDialog.tsx`
- Modify: `frontend/src/features/dashboard/MainDashboardFlow.tsx:164-175, 280-292`
- Modify: `frontend/src/mobile/features/members/LockedMember.tsx`, `frontend/src/mobile/features/dashboard/MobileDashboardView.tsx:224-235`
- Test: `frontend/src/features/dashboard/members/members.test.tsx`

**Interfaces:**
- Consumes: Task 6's `use_detected_pan`.
- Produces: `SubmitOutcome` gains `{ kind: "detectedMismatch"; enteredPanMasked: string; statementPanMasked: string }`. `MemberDetailsDialogProps.onUploadDifferent?: () => void`. `LockedMemberDialogsProps.onUploadDifferent?: () => void`.

- [ ] **Step 1: Write the failing tests** (in `members.test.tsx`, following its `completeMemberDetails` mocking)

```ts
it("a mismatched PAN opens the popup with both PANs masked", async () => {
  vi.mocked(api.completeMemberDetails).mockRejectedValueOnce(
    new ApiError(409, { code: "detected_pan_mismatch", message: "x", details: { detected_pan_masked: "BN******8L" } }),
  );
  renderUnlock(); // the file's existing helper rendering MemberDetailsDialog for "Rohan Shanbhag"
  fillAndContinue({ relationship: "parent", pan: "LCWPK3816R" });
  expect(await screen.findByText("This PAN doesn’t match your statement")).toBeInTheDocument();
  expect(screen.getByText(/You entered LC\*\*\*\*\*\*6R for Rohan Shanbhag\. The statement you uploaded shows BN\*\*\*\*\*\*8L\./)).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument(); // no inline error any more
});

it("'The one on the statement' resubmits with use_detected_pan", async () => {
  vi.mocked(api.completeMemberDetails)
    .mockRejectedValueOnce(new ApiError(409, { code: "detected_pan_mismatch", message: "x", details: { detected_pan_masked: "BN******8L" } }))
    .mockResolvedValueOnce(unlockedMember("Rohan Shanbhag"));
  const { onUnlocked } = renderUnlock();
  fillAndContinue({ relationship: "parent", pan: "LCWPK3816R" });
  fireEvent.click(await screen.findByRole("button", { name: "The one on the statement (BN******8L)" }));
  await waitFor(() => expect(onUnlocked).toHaveBeenCalled());
  expect(vi.mocked(api.completeMemberDetails).mock.calls[1][1]).toEqual(
    expect.objectContaining({ relationship: "parent", use_detected_pan: true }),
  );
  expect(vi.mocked(api.completeMemberDetails).mock.calls[1][1]).not.toHaveProperty("pan");
});

it("'The one I entered' saves nothing and asks for a different statement", async () => {
  vi.mocked(api.completeMemberDetails).mockRejectedValueOnce(
    new ApiError(409, { code: "detected_pan_mismatch", message: "x", details: { detected_pan_masked: "BN******8L" } }),
  );
  const { onUploadDifferent } = renderUnlock();
  fillAndContinue({ relationship: "parent", pan: "LCWPK3816R" });
  fireEvent.click(await screen.findByRole("button", { name: /The one I entered \(LC\*\*\*\*\*\*6R\)/ }));
  expect(onUploadDifferent).toHaveBeenCalledTimes(1);
  expect(api.completeMemberDetails).toHaveBeenCalledTimes(1);
});

it("closing the popup returns to the form with the PAN still typed", async () => {
  vi.mocked(api.completeMemberDetails).mockRejectedValueOnce(
    new ApiError(409, { code: "detected_pan_mismatch", message: "x", details: { detected_pan_masked: "BN******8L" } }),
  );
  renderUnlock();
  fillAndContinue({ relationship: "parent", pan: "LCWPK3816R" });
  fireEvent.click(await screen.findByRole("button", { name: /close/i }));
  expect(screen.getByDisplayValue("LCWPK3816R")).toBeInTheDocument();
});
```

Add `renderUnlock` (returning `{ onUnlocked, onUploadDifferent }` spies), `fillAndContinue` and `unlockedMember` helpers if the file lacks them. The close button's accessible name comes from `PromptDialog`; check it in `features/import/prompts/PromptDialog.tsx`.

- [ ] **Step 2: Run to confirm failure**

Run: `cd frontend && npx vitest run src/features/dashboard/members/members.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`types.ts`: `MemberDetailsBody.pan?: string; use_detected_pan?: boolean;`.

`DetectedPanMismatchDialog.tsx`:

```tsx
import { PromptDialog } from "../../import/prompts/PromptDialog";
import { PRIMARY_BTN, SECONDARY_BTN } from "../../import/prompts/copy";

export interface DetectedPanMismatchDialogProps {
  isOpen: boolean;
  memberName: string;
  enteredPanMasked: string;
  statementPanMasked: string;
  submitting?: boolean;
  /** "The one I entered": nothing is saved; the caller opens the upload form. */
  onKeepEntered: () => void;
  /** "The one on the statement": resubmit with use_detected_pan. */
  onUseStatement: () => void;
  /** × : back to the details form, values kept. */
  onClose: () => void;
}

// L3 as a popup (staging-QA decision 4, 2026-09-30), modelled on U4's
// PanMismatchDialog so the two read as one pattern.
export function DetectedPanMismatchDialog({
  isOpen, memberName, enteredPanMasked, statementPanMasked, submitting, onKeepEntered, onUseStatement, onClose,
}: DetectedPanMismatchDialogProps) {
  return (
    <PromptDialog
      isOpen={isOpen}
      title="This PAN doesn’t match your statement"
      body={`You entered ${enteredPanMasked} for ${memberName}. The statement you uploaded shows ${statementPanMasked}. Which one is correct?`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onKeepEntered} className={SECONDARY_BTN}>
            {`The one I entered (${enteredPanMasked})`}
            <span className="block text-xs font-normal">Upload a different statement</span>
          </button>
          <button type="button" onClick={onUseStatement} disabled={submitting} className={PRIMARY_BTN}>
            {`The one on the statement (${statementPanMasked})`}
          </button>
        </>
      }
    />
  );
}
```

`memberDetailsForm.tsx`:
- Add a mask helper: `export const maskPan = (pan: string) => (pan.length === 10 ? \`${pan.slice(0, 2)}******${pan.slice(8)}\` : pan);` (same shape as the backend's `mask_pan`: first 2 and last 2 characters).
- `SubmitOutcome`: add `| { kind: "detectedMismatch"; enteredPanMasked: string; statementPanMasked: string }`.
- `submitDetails(member, values, mode, opts?: { useDetectedPan?: boolean })`. The body becomes `{ name, relationship, relationship_other_label, ...(opts?.useDetectedPan ? { use_detected_pan: true } : { pan: normalisePan(values.pan) }) }`.
- `case "detected_pan_mismatch":` returns `{ kind: "detectedMismatch", enteredPanMasked: maskPan(normalisePan(values.pan)), statementPanMasked: String(d.detected_pan_masked ?? "") }`.
- `useDetailsForm.submit(opts?: { useDetectedPan?: boolean })`: skip only the PAN part of `validateValues` when `opts?.useDetectedPan`. To do that, add a `skipPan` parameter to `validateValues(values, memberName, skipPan = false)` that bypasses the two PAN checks. Pass `opts` through to `submitDetails`.

`MemberDetailsDialog.tsx`:
- `Stage` adds `"mismatch"`. Add state `const [mismatch, setMismatch] = useState<{ entered: string; statement: string } | null>(null);`.
- Factor the outcome handling into `const handleOutcome = (outcome: SubmitOutcome | null) => { … }`. It keeps the existing branches and adds `else if (outcome.kind === "detectedMismatch") { setMismatch({ entered: outcome.enteredPanMasked, statement: outcome.statementPanMasked }); setStage("mismatch"); }`. `onContinue = async () => handleOutcome(await form.submit());`.
- Prop `onUploadDifferent?: () => void`.
- Render:

```tsx
      {mismatch && (
        <DetectedPanMismatchDialog
          isOpen={stage === "mismatch"}
          memberName={member.name}
          enteredPanMasked={mismatch.entered}
          statementPanMasked={mismatch.statement}
          submitting={form.submitting}
          onClose={() => setStage("form")}
          onKeepEntered={() => (onUploadDifferent ?? onCancel)()}
          onUseStatement={async () => {
            setStage("form");
            handleOutcome(await form.submit({ useDetectedPan: true }));
          }}
        />
      )}
```

`MainDashboardFlow.tsx`:
- Dashboard dialog (line 164): `onUploadDifferent={() => { setDetailsForId(null); handleAddDataTrigger(); }}`. `handleAddDataTrigger()` with no id opens the normal upload for the current selection, which is never a locked member (M9 blocks uploads *for* a locked member).
- U6 in-import dialog (line 280): `onUploadDifferent={() => setIsAddingData(false)}`. It's already inside an upload; leaving it returns the user to the dashboard, where they start a new upload. This matches Cancel in that context.

`LockedMember.tsx`: add the `onUploadDifferent?: () => void` prop and pass it to `<MemberDetailsDialog>`. `MobileDashboardView.tsx`: pass `onUploadDifferent={() => { setLockedPickId(null); onNavigateImport?.(); }}`. `MobileHoldingsView.tsx` has no import navigation, so it passes nothing and the popup falls back to closing.

- [ ] **Step 4: Run tests and typecheck**

Run: `cd frontend && npx vitest run src/features/dashboard src/mobile && npx tsc -b`
Expected: PASS. Stop.

---

### Task 8: Name-only person attaches to the existing member (issue 5, cause A)

**Files:**
- Modify: `backend/app/services/import_/people_resolution.py` (new helper; `PersonPlan`; `plan_people:111-143`)
- Modify: `backend/app/services/import_/service.py:630-645` (`_preview_response`: tags)
- Modify: `backend/app/services/import_/confirm_people.py:362-398` (`_fund_owners` movability), `:401-433` (`_resolve_member` re-check)
- Test: `backend/tests/services/import_/test_people_resolution.py`, `backend/tests/services/import_/test_confirm_people.py`

**Interfaces:**
- Produces: `find_member_by_exact_name(members: list[HouseholdMember], name: str) -> HouseholdMember | None` (exactly one exact `compare_names` match, else None). `PersonPlan.matched_by_name: bool = False` (new last field with a default, so existing positional constructors keep working).

- [ ] **Step 1: Write the failing tests** (`test_people_resolution.py`, using its `_user`, `_member` and `_person` helpers)

```python
def test_plan_name_only_person_attaches_to_exact_name_member(db_session):
    user = _user(db_session)
    _member(db_session, user, "Aditi Shanbhag")
    kavita = _member(db_session, user, "Kavita Shanbhag", relationship=None,
                     details_completed_at=None, lock_reason=MemberLockReason.DETAILS_NEEDED)
    plans = plan_people(db_session, user.id, [_person("p3", "Kavita Shanbhag")], None)
    assert (plans[0].status, plans[0].member_id, plans[0].matched_by_name) == ("locked_member", kavita.id, True)


def test_plan_name_only_person_variant_name_stays_new(db_session):
    user = _user(db_session)
    _member(db_session, user, "Kavita Shanbhag", relationship=Relationship.PARENT)
    plans = plan_people(db_session, user.id, [_person("p3", "K Shanbhag")], None)
    assert (plans[0].status, plans[0].member_id) == ("new", None)


def test_two_exact_matches_stay_new(db_session):
    user = _user(db_session)
    _member(db_session, user, "Kavita Shanbhag", relationship=Relationship.PARENT)
    _member(db_session, user, "Kavita Shanbhag", relationship=Relationship.SIBLING)
    plans = plan_people(db_session, user.id, [_person("p3", "Kavita Shanbhag")], None)
    assert (plans[0].status, plans[0].member_id) == ("new", None)


def test_placeholder_name_never_attaches(db_session):
    user = _user(db_session)
    _member(db_session, user, "Person 3", relationship=Relationship.PARENT)
    plans = plan_people(db_session, user.id, [_person("p3", "Person 3", needs_name=True)], None)
    assert plans[0].status == "new"
```

(`_member`'s `**kw` passes `details_completed_at`/`lock_reason` straight to `HouseholdMember`. If `is_locked` is derived from `details_completed_at is None`, the Kavita member above is locked.)

`test_confirm_people.py`: add the full 4-upload replay as a route test, `test_kavita_is_never_duplicated_across_family_uploads`. Put it in `backend/tests/api/test_imports_people_routes.py` so it can use `client`. It uses the real fixture PDFs through `/imports/parse` with only `MfApiClient._get_json` patched, exactly like the scratch reproduction. Its body is the scratch repro test (`$SCRATCHPAD/repro/test_kavita.py`, reproduced here so the task doesn't depend on the scratchpad):

```python
FIX = Path(__file__).resolve().parents[3] / "Docs/orchestration/qa-fixtures/synthetic-cas"


def _parse_real(client, h, member_id, fname, tmp_path):
    from app.services.import_.enrich import mfapi_client

    async def fake(_self, url):
        if url.endswith("/latest"):
            return {"meta": {"scheme_category": "Equity Scheme - Flexi Cap Fund"}}
        return []

    with (
        patch("app.services.import_.enrich.MfApiClient._get_json", new=fake),
        patch.object(mfapi_client, "cache_dir", tmp_path),
        patch.object(mfapi_client, "_schemes", None),
    ):
        return client.post(
            "/imports/parse",
            files={"file": (fname, (FIX / fname).read_bytes(), "application/pdf")},
            data={"password": "MF@123", "household_member_id": member_id},
            headers=h,
        )


def _answer_same_person(client, h, prev, same=True):
    for sp in prev.get("same_person_prompts", []):
        prev = client.post(f"/imports/sessions/{prev['session_id']}/resolve-same-person",
                           json={"person_key": sp["person_key"], "member_id": sp["member_id"], "same": same},
                           headers=h).json()
    return prev


def _confirm_all(client, h, prev):
    confs = []
    for s in prev["schemes"]:
        c = {"temp_id": s["temp_id"]}
        if s["match_status"] != "confirmed":
            c["amfi_code"] = "125497"
        if s["plan_type"] == "unclassified":
            c["plan_type"] = "direct"
        confs.append(c)
    people = [
        {"person_key": p["person_key"],
         "scheme_confirmations": [c for c in confs if any(s["temp_id"] == c["temp_id"] and s["person_key"] == p["person_key"] for s in prev["schemes"])],
         **({"include": True} if p["status"] == "other_account" else {})}
        for p in prev["people"]
    ]
    moved = {s["temp_id"]: prev["people"][0]["person_key"] for s in prev["schemes"] if s["person_key"] is None}
    r = client.post("/imports/confirm", json={"session_id": prev["session_id"], "people": people, "moved_funds": moved}, headers=h)
    assert r.status_code == 200, r.json()


def _kavitas(user_id):
    db = _test_db()
    return db.query(HouseholdMember).filter_by(user_id=user_id, name="Kavita Shanbhag").count()


def test_kavita_is_never_duplicated_across_family_uploads(client, tmp_path):
    h, me_id = _authed_headers_and_member(client, "+919811300001", name="Aditi Shanbhag")
    uid = _user_id(me_id)
    first = _parse_real(client, h, me_id, "family_cas_1.pdf", tmp_path)
    assert first.status_code == 200, first.json()
    _confirm_all(client, h, first.json())
    assert _kavitas(uid) == 1
    db = _test_db()
    rohan = db.query(HouseholdMember).filter_by(user_id=uid, name="Rohan Shanbhag").one()
    assert client.post(f"/household-members/{rohan.id}/details",
                       json={"relationship": "parent", "pan": "BNZPS5678L"}, headers=h).status_code == 200
    for fname in ("family_cas_2.pdf", "family_cas_1.pdf", "family_cas_2.pdf"):
        r = _parse_real(client, h, str(rohan.id), fname, tmp_path)
        assert r.status_code == 200, r.json()
        _confirm_all(client, h, _answer_same_person(client, h, r.json()))
        assert _kavitas(uid) == 1, fname
```

(Add the imports `from pathlib import Path` and `from unittest.mock import patch` to the file.) This test fails until Task 9 lands too. Mark it `@pytest.mark.xfail(reason="needs Task 9 (cause B)", strict=True)` in this task, and Task 9 removes the marker.

Also in `test_confirm_people.py`:

```python
def test_confirm_reclassifies_name_only_person_by_exact_name(db_session):
    """A same-named member created after this review was built (another tab's
    confirm) is attached at Confirm, not duplicated."""
    import uuid
    from datetime import datetime, timezone
    from app.models.enums import MemberLockReason, MemberNameSource, MemberOrigin
    from app.models.user import HouseholdMember, User
    from app.services.import_.confirm_people import _resolve_member
    from app.services.import_.people import ParsedPerson
    from app.services.import_.people_resolution import PersonPlan
    from app.services.import_.schemas import PersonConfirmation

    now = datetime.now(timezone.utc)
    user = User(id=uuid.uuid4(), phone_number="+919811100099", created_at=now)
    db_session.add(user)
    db_session.flush()
    person = ParsedPerson(key="p3", pan=None, pan_masked=None, name="Kavita Shanbhag", name_source="holder_line",
                          needs_name=False, folio_keys=[("Tata Mutual Fund", "12705694/27")], matched_by_name=[])
    plan = PersonPlan("p3", "new", None, "Kavita Shanbhag", "none", None, None)
    kavita = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name="Kavita Shanbhag", relationship=None,
                             created_at=now, origin=MemberOrigin.CAS_DETECTED, name_source=MemberNameSource.CAS,
                             details_completed_at=None, lock_reason=MemberLockReason.DETAILS_NEEDED)
    db_session.add(kavita)
    db_session.commit()
    work = _resolve_member(db_session, user.id, person, plan, PersonConfirmation(person_key="p3"), [])
    assert work.member_id == kavita.id
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd backend && python3 -m pytest tests/services/import_/test_people_resolution.py tests/services/import_/test_confirm_people.py tests/api/test_imports_people_routes.py -q -k "name_only or exact_name or two_exact or placeholder or kavita or reclassifies"`
Expected: the new people-resolution tests FAIL. The Kavita test XFAILs.

- [ ] **Step 3: Implement**

`people_resolution.py`:

```python
@dataclass
class PersonPlan:
    person_key: str
    status: PersonStatus
    member_id: uuid.UUID | None
    name: str
    name_update: NameUpdate
    current_name: str | None
    same_person_member_id: uuid.UUID | None
    # Staging-QA fix 5A: attached by exact name, not PAN. Every fund of this
    # person is shown "matched by name" and can be moved (FR-4).
    matched_by_name: bool = False


def find_member_by_exact_name(members: list[HouseholdMember], name: str) -> HouseholdMember | None:
    """Exactly one member whose name is an exact compare_names match, else
    None. Two same-named members never attach: guessing wrong is worse than
    a duplicate the user can merge."""
    hits = [m for m in members if compare_names(name, m.name).result == "exact"]
    return hits[0] if len(hits) == 1 else None
```

In `plan_people`, directly after the `if member is not None: … continue` block for PAN matches, add:

```python
        if not p.pan and not p.needs_name:
            named = find_member_by_exact_name(members, p.name)
            if named is not None:
                plans.append(PersonPlan(
                    p.key, "locked_member" if named.is_locked else "existing_member", named.id,
                    p.name, plan_name_update(named.name, p.name), named.name, None, matched_by_name=True,
                ))
                continue
```

`service.py` `_preview_response`, the `matched_by_name_temp_ids=` argument becomes:

```python
            matched_by_name_temp_ids=[
                temp_id(s) for s in schemes
                if plan.matched_by_name or (s.amc, folio_key(s.folio)) in by_name
            ],
```

`confirm_people._fund_owners`: it needs the plans. Change the `movable` expression to:

```python
        plans_by_key = {pl.person_key: pl for pl in session["people_plan"]}
        movable = scheme.person_key is None or (
            (scheme.amc, folio_key(scheme.folio)) in set(persons[scheme.person_key].matched_by_name)
            or plans_by_key[scheme.person_key].matched_by_name
        )
```

(compute `plans_by_key` once, above the loop).

`confirm_people._resolve_member`: after the `if person.pan:` block inside `if member_id is None:`, add:

```python
        if member_id is None and not person.pan and not person.needs_name:
            members = db.query(HouseholdMember).filter(HouseholdMember.user_id == user_id).all()
            named = find_member_by_exact_name(members, person.name)
            if named is not None:
                member_id, lock_reason = named.id, None
```

(import `find_member_by_exact_name` from `people_resolution`).

- [ ] **Step 4: Run the import suites**

Run: `cd backend && python3 -m pytest tests/services/import_ tests/api/test_imports_people_routes.py tests/api/test_imports_routes.py -q`
Expected: PASS (the Kavita replay XFAILs). An existing test that asserted a no-PAN person is always `new` while an exact-name member exists now contradicts the decision: update it and list it in the task report. Stop.

---

### Task 9: PAN person matching a name-only member is asked (issue 5, cause B)

**Files:**
- Modify: `backend/app/services/import_/people_resolution.py` (`plan_people` U13 block, `:125-143`)
- Modify: `backend/app/services/import_/schemas.py:65-70` (`SamePersonPrompt`)
- Modify: `backend/app/services/import_/service.py` (`_preview_response:647-656`, `_advance:593-606`, `resolve_same_person:801-829`, session init `:280`)
- Modify: `backend/app/services/import_/confirm_people.py:246-262` (detected-PAN write)
- Modify: `frontend/src/features/import/types.ts` (`SamePersonPrompt`), `frontend/src/features/import/prompts/SamePersonDialog.tsx`, `frontend/src/features/import/prompts/PromptHost.tsx:100-115`
- Test: `backend/tests/services/import_/test_people_resolution.py`, `backend/tests/api/test_imports_people_routes.py`, `frontend/src/features/import/prompts/*.test.tsx` (the file that covers `SamePersonDialog`, or a new `SamePersonDialog.test.tsx`)

**Interfaces:**
- Consumes: Task 8's `PersonPlan.matched_by_name` default.
- Produces: `find_name_only_member(members, name) -> HouseholdMember | None` (exactly one member with `detected_pan_hash IS NULL AND pan_lookup_hash IS NULL` and an exact or variant name). `SamePersonPrompt.kind: Literal["typed_pan", "name_only"] = "typed_pan"`, `SamePersonPrompt.member_fund_count: int = 0`. `entered_pan_masked` is `""` for `name_only`. Session key `session["same_person_linked"]: dict[str, uuid.UUID]`.

- [ ] **Step 1: Write the failing tests**

`test_people_resolution.py`:

```python
def test_plan_pan_person_flags_name_only_member_as_possible_same(db_session):
    user = _user(db_session)
    kavita = _member(db_session, user, "Kavita Shanbhag", relationship=None,
                     details_completed_at=None, lock_reason=MemberLockReason.DETAILS_NEEDED)
    plans = plan_people(db_session, user.id, [_person("p3", "Kavita Shanbhag", "BNZPK4321M")], None)
    assert (plans[0].status, plans[0].member_id, plans[0].same_person_member_id) == ("new", None, kavita.id)


def test_two_name_only_matches_no_prompt(db_session):
    user = _user(db_session)
    for rel in (Relationship.PARENT, Relationship.SIBLING):
        _member(db_session, user, "Kavita Shanbhag", relationship=rel)
    plans = plan_people(db_session, user.id, [_person("p3", "Kavita Shanbhag", "BNZPK4321M")], None)
    assert plans[0].same_person_member_id is None
```

`test_imports_people_routes.py`: remove the `xfail` marker from `test_kavita_is_never_duplicated_across_family_uploads`, and add:

```python
def test_name_only_same_person_prompt_and_yes_links_detected_pan(client, tmp_path):
    h, me_id = _authed_headers_and_member(client, "+919811300002", name="Aditi Shanbhag")
    uid = _user_id(me_id)
    _confirm_all(client, h, _parse_real(client, h, me_id, "family_cas_1.pdf", tmp_path).json())
    prev = _parse_real(client, h, me_id, "family_cas_2.pdf", tmp_path).json()
    [sp] = [p for p in prev["same_person_prompts"] if p["kind"] == "name_only"]
    assert sp["member_name"] == "Kavita Shanbhag" and sp["entered_pan_masked"] == "" and sp["member_fund_count"] == 1
    prev = _answer_same_person(client, h, prev, same=True)
    _confirm_all(client, h, prev)
    db = _test_db()
    [k] = db.query(HouseholdMember).filter_by(user_id=uid, name="Kavita Shanbhag").all()
    assert k.detected_pan_hash == hash_pan("BNZPK4321M") and k.is_locked


def test_name_only_same_person_no_creates_a_new_member(client, tmp_path):
    h, me_id = _authed_headers_and_member(client, "+919811300003", name="Aditi Shanbhag")
    uid = _user_id(me_id)
    _confirm_all(client, h, _parse_real(client, h, me_id, "family_cas_1.pdf", tmp_path).json())
    prev = _answer_same_person(client, h, _parse_real(client, h, me_id, "family_cas_2.pdf", tmp_path).json(), same=False)
    _confirm_all(client, h, prev)
    db = _test_db()
    assert db.query(HouseholdMember).filter_by(user_id=uid, name="Kavita Shanbhag").count() == 2
```

Frontend (`SamePersonDialog.test.tsx`, new):

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SamePersonDialog } from "./SamePersonDialog";

describe("SamePersonDialog name_only", () => {
  it("asks whether the statement's person is the member you already have", () => {
    render(
      <SamePersonDialog isOpen kind="name_only" memberName="Kavita Shanbhag" memberFundCount={1}
        enteredPanMasked="" statementPanMasked="BN******1M" statementName="Kavita Shanbhag"
        onYes={vi.fn()} onNo={vi.fn()} />,
    );
    expect(screen.getByText("Is this the Kavita Shanbhag you already have?")).toBeInTheDocument();
    expect(screen.getByText(/This statement shows Kavita Shanbhag with PAN BN\*\*\*\*\*\*1M\. Your family list already has Kavita Shanbhag · PAN not on statement · 1 fund\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yes, same person" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No, add as a new person" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd backend && python3 -m pytest tests/services/import_/test_people_resolution.py tests/api/test_imports_people_routes.py -q -k "name_only or kavita or two_name_only"` and `cd frontend && npx vitest run src/features/import/prompts`
Expected: FAIL.

- [ ] **Step 3: Backend implementation**

`people_resolution.py`:

```python
def find_name_only_member(members: list[HouseholdMember], name: str) -> HouseholdMember | None:
    """Exactly one member with no PAN of any kind (never on a statement, never
    typed) whose name is an exact or variant match. Such a member is what a
    PAN-less statement created; a later statement with a PAN may be them."""
    hits = [
        m for m in members
        if m.detected_pan_hash is None and m.pan_lookup_hash is None
        and compare_names(name, m.name).result in ("exact", "variant")
    ]
    return hits[0] if len(hits) == 1 else None
```

In `plan_people`'s `same` block, after the existing U13 `next(...)`:

```python
            if same is None:
                named = find_name_only_member(members, p.name)
                same = named.id if named is not None else None
```

`schemas.py` `SamePersonPrompt`: add `kind: Literal["typed_pan", "name_only"] = "typed_pan"` and `member_fund_count: int = 0` (import `Literal` if needed).

`service.py`:
- Session init (line ~280): add `same_person_linked={},` next to `same_person_declined=set(),`.
- `_preview_response`, the `same_prompts.append(...)`:

```python
            name_only = member.detected_pan_hash is None and member.pan_lookup_hash is None
            same_prompts.append(SamePersonPrompt(
                person_key=person.key, member_id=str(member.id), member_name=member.name,
                entered_pan_masked="" if name_only else (_masked_member_pan(member) or ""),
                statement_pan_masked=person.pan_masked or "",
                kind="name_only" if name_only else "typed_pan",
                member_fund_count=db.query(Folio).filter(Folio.household_member_id == member.id).count(),
            ))
```

  Also skip the prompt for keys in `session["same_person_linked"]`: `if plan.same_person_member_id and person.key not in declined and person.key not in session["same_person_linked"]:` (import `Folio` from `app.models.folio`).
- `_advance`, after the `target_key` override loop and before `session["me_key"] = me_key`:

```python
    for i, plan in enumerate(plans):
        linked = session["same_person_linked"].get(plan.person_key)
        member = db.get(HouseholdMember, linked) if linked else None
        if member is not None and plan.member_id is None:
            # Staging-QA fix 5B: "Yes, same person" for a name-only member.
            person = _person(session, plan.person_key)
            plans[i] = PersonPlan(
                plan.person_key, "locked_member" if member.is_locked else "existing_member", member.id,
                person.name, plan_name_update(member.name, person.name), member.name, None,
            )
```

- `resolve_same_person`, replacing the tail after `member = db.get(...)`:

```python
    member = db.get(HouseholdMember, plan.same_person_member_id)
    if member.detected_pan_hash is None and member.pan_lookup_hash is None:
        person = _person(session, person_key)
        if member.is_locked:
            # Written as the detected PAN at Confirm (confirm_people).
            session["same_person_linked"][person_key] = member.id
        else:
            try:
                claim_pan_for_member(db, member, person.pan, pending=True)
            except PanConflictError:
                db.commit()
                raise
            _record_claim(session, member.id, person.pan)
        return _finish(db, session_id)
    try:
        _switch_or_u12(db, session, member, _person(session, person_key))
    except (ImportPromptError, PanConflictError):
        db.commit()
        raise
    return _finish(db, session_id)
```

  Update the docstring: `"""U13 (typed PAN): same=True switches the member to the statement PAN (U4, U12 on conflict). Name-only member (staging-QA 5B): same=True links the person to them; a locked one gets the PAN as its detected PAN at Confirm, an unlocked one gets a pending claim. same=False leaves them a new person."""`

`confirm_people._confirm_claimed`, inside the loop directly after `member, created = _member_for(db, work, user_id, now)`:

```python
        if (
            not created and work.person is not None and work.person.pan
            and member.is_locked and member.detected_pan_hash is None and member.pan_lookup_hash is None
        ):
            # Staging-QA fix 5B: a name-only locked member the user said is this
            # statement's person. From now on uploads match them by PAN.
            member.detected_pan_encrypted = encrypt_pan(work.person.pan)
            member.detected_pan_hash = hash_pan(work.person.pan)
```

(`encrypt_pan`/`hash_pan` are already imported in `confirm_people.py`; check, and import from `app.services.import_.crypto` if not).

- [ ] **Step 4: Frontend implementation**

`features/import/types.ts` `SamePersonPrompt`: add `kind?: "typed_pan" | "name_only"; member_fund_count?: number;`.

`SamePersonDialog.tsx`: add props `kind?: "typed_pan" | "name_only"` and `memberFundCount?: number`. At the top of the component:

```tsx
  if (kind === "name_only") {
    const funds = `${memberFundCount ?? 0} fund${memberFundCount === 1 ? "" : "s"}`;
    return (
      <PromptDialog
        isOpen={isOpen}
        title={`Is this the ${memberName} you already have?`}
        body={`This statement shows ${statementName ?? memberName} with PAN ${statement}. Your family list already has ${memberName} · PAN not on statement · ${funds}.`}
        onClose={onNo}
        footer={
          <>
            <button type="button" onClick={onNo} className={SECONDARY_BTN}>No, add as a new person</button>
            <button type="button" onClick={onYes} className={PRIMARY_BTN}>Yes, same person</button>
          </>
        }
      />
    );
  }
```

(`statement` is computed before this block, so move `const statement = panOrPlaceholder(statementPanMasked);` above it).

`PromptHost.tsx` (the `<SamePersonDialog>` at ~line 104): pass `kind={activeSame.kind}` and `memberFundCount={activeSame.member_fund_count}`. For `statementName`: add `statement_name: str` to the backend `SamePersonPrompt` (set to `person.name` in `_preview_response`) and pass `statementName={activeSame.statement_name}` here, since the prompt carries no other statement name. Add `statement_name?: string` to the TS type.

- [ ] **Step 5: Run everything for 5A + 5B**

Run: `cd backend && python3 -m pytest tests/services/import_ tests/api/test_imports_people_routes.py tests/api/test_imports_routes.py -q` and `cd frontend && npx vitest run src/features/import && npx tsc -b`
Expected: PASS, including `test_kavita_is_never_duplicated_across_family_uploads` with its xfail removed. Stop.

---

### Task 10: Merge the PAN-bearing duplicate (issue 5, cause C)

**Files:**
- Modify: `backend/app/services/dashboard/member_details.py:192-200` (`can_merge`)
- Modify: `backend/app/services/dashboard/member_merge.py:52-58` (allowed sources), before `db.commit()` (verify the target)
- Modify: `frontend/src/features/dashboard/members/PossibleDuplicateDialog.tsx`, `MemberDetailsDialog.tsx` (pass extra copy fields), `memberDetailsForm.tsx` (`DuplicateInfo`)
- Test: `backend/tests/api/test_member_details_routes.py`, `backend/tests/api/test_member_merge_route.py`, `frontend/src/features/dashboard/members/members.test.tsx`

**Interfaces:**
- Produces: merge allowed when the source is locked, is not self, and (is name-only **or** `source.detected_pan_hash == target.pan_lookup_hash`). The 409 `pan_belongs_to_other_member` details gain `source_pan_label: str` (`"PAN not on statement"` or the masked detected PAN) and `other_pan_masked: str | None`.

- [ ] **Step 1: Write the failing tests** (`test_member_details_routes.py`)

```python
def _kavita_pair(client, h):
    """#1 name-only locked, #2 locked with detected PAN, same user, same name."""
    me = client.post("/household-members", json={"name": "Aditi Shanbhag", "relationship": "self"}, headers=h).json()
    db = _db()
    uid = db.get(HouseholdMember, uuid.UUID(me["id"])).user_id
    now = datetime.now(timezone.utc)
    common = dict(user_id=uid, name="Kavita Shanbhag", relationship=None, created_at=now,
                  origin=MemberOrigin.CAS_DETECTED, name_source=MemberNameSource.CAS,
                  details_completed_at=None, lock_reason=MemberLockReason.DETAILS_NEEDED)
    one = HouseholdMember(**common)
    two = HouseholdMember(**common, detected_pan_encrypted=encrypt_pan("BNZPK4321M"), detected_pan_hash=hash_pan("BNZPK4321M"))
    db.add_all([one, two]); db.commit()
    return one.id, two.id


def test_order_a_name_only_first_then_pan_bearing_can_merge(client):
    h = _headers(client, "+919811400001")
    one, two = _kavita_pair(client, h)
    assert client.post(f"/household-members/{one}/details", json={"relationship": "parent", "pan": "BNZPK4321M"}, headers=h).status_code == 200
    r = client.post(f"/household-members/{two}/details", json={"relationship": "parent", "pan": "BNZPK4321M"}, headers=h)
    assert r.status_code == 409
    d = r.json()["detail"]["details"]
    assert d["can_merge"] is True and d["other_member_id"] == str(one) and d["source_pan_label"] == "BN******1M"
    m = client.post(f"/household-members/{two}/merge-into/{one}", headers=h)
    assert m.status_code == 200
    got = _db().get(HouseholdMember, one)
    assert got.pan_source == MemberPanSource.CAS and got.pan_verified_at is not None  # statement confirmed the typed PAN


def test_order_b_pan_bearing_first_then_name_only_can_merge(client):
    h = _headers(client, "+919811400002")
    one, two = _kavita_pair(client, h)
    assert client.post(f"/household-members/{two}/details", json={"relationship": "parent", "pan": "BNZPK4321M"}, headers=h).status_code == 200
    r = client.post(f"/household-members/{one}/details", json={"relationship": "parent", "pan": "BNZPK4321M"}, headers=h)
    d = r.json()["detail"]["details"]
    assert d["can_merge"] is True and d["source_pan_label"] == "PAN not on statement"
    assert client.post(f"/household-members/{one}/merge-into/{two}", headers=h).status_code == 200


def test_locked_member_with_a_different_detected_pan_still_cannot_merge(client):
    h = _headers(client, "+919811400003")
    one, two = _kavita_pair(client, h)
    assert client.post(f"/household-members/{one}/details", json={"relationship": "parent", "pan": "BNZPK4321M"}, headers=h).status_code == 200
    db = _db()
    three = HouseholdMember(user_id=db.get(HouseholdMember, one).user_id, name="Kavita S", relationship=None,
                            created_at=datetime.now(timezone.utc), origin=MemberOrigin.CAS_DETECTED,
                            name_source=MemberNameSource.CAS, details_completed_at=None,
                            lock_reason=MemberLockReason.DETAILS_NEEDED,
                            detected_pan_encrypted=encrypt_pan("ZZZZZ9999Z"), detected_pan_hash=hash_pan("ZZZZZ9999Z"))
    db.add(three); db.commit()
    assert client.post(f"/household-members/{three.id}/merge-into/{one}", headers=h).status_code == 409
```

Frontend (`members.test.tsx`):

```ts
it("duplicate popup tells two same-named people apart", async () => {
  vi.mocked(api.completeMemberDetails).mockRejectedValueOnce(new ApiError(409, {
    code: "pan_belongs_to_other_member", message: "x",
    details: { other_member_id: "k1", other_member_name: "Kavita Shanbhag", can_merge: true,
               source_fund_count: 1, source_pan_label: "BN******1M", other_pan_masked: "BN******1M" },
  }));
  renderUnlock({ name: "Kavita Shanbhag" });
  fillAndContinue({ relationship: "parent", pan: "BNZPK4321M" });
  expect(await screen.findByText(/Kavita Shanbhag \(BN\*\*\*\*\*\*1M, 1 fund\) and Kavita Shanbhag \(already on your dashboard\) may be the same person/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Merge them" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd backend && python3 -m pytest tests/api/test_member_details_routes.py tests/api/test_member_merge_route.py -q -k "order_ or different_detected"` and `cd frontend && npx vitest run src/features/dashboard/members`
Expected: FAIL (`can_merge` false; merge 409).

- [ ] **Step 3: Backend implementation**

`member_details.py`:

```python
    if holder is not None and holder.user_id == user_id:
        # Staging-QA fix 5C: a locked duplicate whose statement PAN is exactly
        # the holder's PAN is provably the same person, so it can merge too
        # (before, only a name-only source could, which stranded it).
        same_pan = member.detected_pan_hash is not None and member.detected_pan_hash == holder.pan_lookup_hash
        can_merge = locked and (name_only or same_pan)
        fund_count = db.query(Folio).filter(Folio.household_member_id == member.id).count()
        raise PanOnOtherMemberError(
            holder.id, holder.name, can_merge,
            source_member_name=member.name, source_fund_count=fund_count,
            source_pan_label=(
                mask_pan(decrypt_pan(member.detected_pan_encrypted))
                if member.detected_pan_encrypted else "PAN not on statement"
            ),
        )
```

`PanOnOtherMemberError.__init__`: add `source_pan_label: str = "PAN not on statement"` and put it into `details` as `"source_pan_label"`.

`member_merge.py`:

```python
    same_pan = source.detected_pan_hash is not None and source.detected_pan_hash == target.pan_lookup_hash
    if (
        source.id == target.id
        or not source.is_locked
        or not (is_name_only(source) or same_pan)
        or source.relationship == Relationship.SELF
    ):
        raise MergeNotAllowedError()
```

and just before `db.commit()`:

```python
    if same_pan and target.pan_source == MemberPanSource.USER_ENTERED:
        # The merged statement shows the PAN the user typed: it's verified now.
        target.pan_source = MemberPanSource.CAS
        target.pan_verified_at = datetime.now(timezone.utc)
```

(import `MemberPanSource`).

- [ ] **Step 4: Frontend implementation**

`memberDetailsForm.tsx` `DuplicateInfo`: add `sourcePanLabel: string`. In the `pan_belongs_to_other_member` case, set `sourcePanLabel: String(d.source_pan_label ?? "PAN not on statement")`.

`PossibleDuplicateDialog.tsx`: add the prop `sourcePanLabel: string`. When `memberName === otherMemberName`, use this body and button label:

```tsx
  const same = memberName === otherMemberName;
  const funds = `${fundCount} fund${fundCount === 1 ? "" : "s"}`;
  const body = same
    ? `${memberName} (${sourcePanLabel}, ${funds}) and ${otherMemberName} (already on your dashboard) may be the same person. Merging moves the ${funds} into the one on your dashboard and removes the duplicate.`
    : `${memberName} and ${otherMemberName} may be the same person. Merging moves ${memberName}’s ${funds} into ${otherMemberName} and removes ${memberName} from your family list.`;
  const mergeLabel = same ? "Merge them" : `Merge into ${otherMemberName}`;
```

Use `body` and `mergeLabel` in the JSX. `MemberDetailsDialog.tsx`: pass `sourcePanLabel={duplicate.sourcePanLabel}`.

- [ ] **Step 5: Run tests**

Run: `cd backend && python3 -m pytest tests/api/test_member_details_routes.py tests/api/test_member_merge_route.py tests/services/dashboard -q` and `cd frontend && npx vitest run src/features/dashboard && npx tsc -b`
Expected: PASS. Stop.

---

### Task 11: Docs, full runs, staging checklist

**Files:**
- Modify: `decisions.md`, `backend.md`, `database.md`, `DEFERRED_FEATURES.md` (the 0021 contract step), `session.md` (overwrite "Latest"; close item 9), `log.md` (append)
- Modify: `Docs/PRDs/PRD-05-Auth-Flow-Redesign.md` (sign-up known-number rule; login request-time check), `Docs/PRDs/PRD-02-Signup-Onboarding.md` (Q3 multi-select), `Docs/PRDs/Database-Schema-Unifolio.md` → v1.7 (`primary_goals`, CHECK, statement dates populated), `Docs/PRDs/PRD-01-*` and `Docs/orchestration/cas-member-detection-map.html` (L3 popup + I4/M10 reword; FR-4 auto-confirm amendment; name-only matching rules 5A/5B; merge rule 5C)

- [ ] **Step 1:** Write each doc change with the decision date 30 Sep 2026 and a link to the findings map. In `decisions.md`, record the six decisions plus the two numbering and wording deviations listed in Global Constraints. In `DEFERRED_FEATURES.md`, add: "Migration 0021: drop `users.primary_goal` and `DROP TYPE primarygoal`, and remove the dual write in `auth.py update_me`. Ship one release after 0019 is live on every ECS task."
- [ ] **Step 2:** Run the full suites and record the counts:
  - `cd backend && python3 -m pytest -q -p no:cacheprovider`
  - `cd backend && python3 -m pytest tests/functional_postgres -q` (skips without `TEST_DATABASE_URL`; say so)
  - `cd frontend && npm test && npx tsc -b && npm run lint`
- [ ] **Step 3:** Add a "Staging retest" section to `session.md` that walks through each of the user's six original reports:
  1. Sign up with a registered number shows "already exists" with Log in instead, and no code is sent. Log in with an unknown number shows "No account found" with Sign up instead.
  2. Q3 accepts several goals, and Continue saves them.
  3. A clean member's ribbon shows Confirmed without being opened, and the grid shows 3 unclipped cards.
  4. A wrong PAN at unlock opens the popup; both options work.
  5. Replaying the 4-upload Kavita sequence leaves one Kavita. The existing staging duplicates can now be merged.
  6. Import history shows periods, including for old imports after 0020.
- [ ] **Step 4:** Stop. The user reviews and commits.

---

### Task 12 (later release, do NOT run with this batch): contract migration 0021

Only after 0019 has been on every ECS task for at least one full deploy cycle:
- Create `0021_drop_users_primary_goal.py`. Upgrade: `batch_alter_table("users").drop_column("primary_goal")`, then `DROP TYPE IF EXISTS primarygoal` on Postgres. Downgrade: recreate the enum type and the nullable column, then `UPDATE users SET primary_goal = (primary_goals->>0)::primarygoal` on Postgres, or `json_extract(primary_goals, '$[0]')` on SQLite. This downgrade keeps one goal per user.
- Remove `primary_goal` from `models/user.py`, and remove the dual write from `auth.py update_me`.
- Test: a round trip in `test_migrations.py` asserting the column is gone at head and restored (first item) on downgrade.
