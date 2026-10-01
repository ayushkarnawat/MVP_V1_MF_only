# Consent, Onboarding & Profile Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. If any task is delegated to Codex, the `model-orchestration` skill governs it (handoff doc + adversarial review gate).

**Goal:** Ship the seven changes decided on 1 Oct 2026:
- remove the privacy screen
- record consent (T&C, Privacy, PAN disclaimer) in a record that can't be edited
- "All of the above" on the goal question, plus a goals report script
- name and PAN always come from the CAS
- Profile restructure
- a plainer OTP email

**Architecture:** Most changes stay inside existing modules.
- **Consent:** a new append-only `consent_records` table, guarded by a DB trigger, with a small `app/services/legal/` package that serves the documents and records consent.
- **Sign-up consent:** captured on the pending-identity record at the first sign-up step. `complete_gated_signup` writes it in the same transaction that creates the user.
- **Upload consent:** written and committed before the PDF is parsed.
- **Members:** the unlock endpoint becomes unlock-only, taking a relationship plus a PAN only when the statement had none. A new `PATCH /household-members/{id}` edits relationship, phone and email.

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic (SQLite dev/tests, Postgres staging), React 19 + TypeScript + Tailwind 3.4 + Vitest.

**Spec:**
- `Docs/orchestration/2026-10-01-onboarding-consent-profile-changes-plan.md`. Every "decided" marker and its Decisions table are binding.
- Visual walkthrough: `Docs/orchestration/2026-10-01-consent-onboarding-profile-plan-map.html` (https://claude.ai/artifact/AM3NMK1nRgEnwKyrBQgtEL).

## Global Constraints

**Process**
- **Never commit.** The user commits manually. Each task ends at "tests green, stop", and there are no `git commit` steps.
- **Run only affected tests.** Never the full suites. Each task lists its exact test files. If a change reaches a module outside the list, grep `tests/` for that module and add the matching file. Narrow with `-k` / `-t` while iterating, then run each listed file once in full before calling the task done.
- Backend tests run from `backend/` with the system interpreter: `python3 -m pytest <files> -q`. `backend/.venv` is a Windows venv and doesn't run in WSL.
- Frontend tests run from `frontend/`: `npx vitest run <files>`. Typecheck once per frontend task: `npx tsc -b`.
- `backend/tests/functional_postgres` needs `TEST_DATABASE_URL`. Without it those tests skip, and the task report must say "skipped", never "passed".
- An `async def` route must never call blocking `db.commit()`. Use `await commit_off_loop(db)` (bb5225f).

**Migrations**
- `0021_member_contact_fields` (Task 5) and `0022_consent_records` (Task 7). The contract migration that drops `users.primary_goal`, reserved as "0021" in `DEFERRED_FEATURES.md`, becomes `0023`. Task 13 updates that note.

**UI copy**
- Curly apostrophe `’` in all UI copy.
- PANs are only ever shown masked (`BX******8L`). A raw PAN never reaches the browser or the logs.

**Consent**
- **Legal documents are placeholders.** Each file says it is being finalised. Version strings: `tos-placeholder-2026-10-01`, `privacy-placeholder-2026-10-01`, `pan-disclaimer-placeholder-2026-10-01`.
- **Consent rows are never updated or deleted by app code**, including account hard-delete (decision Q6). There is no retention job.
- **No "withdraw consent" UI** (Q11). The only `withdrawn` rows are the automatic ones written when account deletion is scheduled.
- **Raw IPs are never stored in `consent_records`.** Store only `ip_truncated` (IPv4 /24, IPv6 /48) plus `ip_hmac` (HMAC-SHA256 with `CONSENT_IP_HMAC_KEY`).

**Members**
- **Name and PAN come from the CAS** and are never user-editable. There are three exceptions:
  - the onboarding name, which stays provisional until the first CAS (QA)
  - a one-time name for `needs_name` people in the people popup (QB)
  - a typed PAN in the unlock popup, only for members with no PAN on their statement (QC)

## Review Focus

1. **A login-mode Google tap by someone with no account.** The backend answers 422 `consent_required`. The frontend must show the consent checkbox and retry with the same ID token, not show a dead-end error. Covered by a Task 10 test (`google new account asks for consent then retries`).
2. **A legal document version changing between page load and submit.** The server rejects the stale version with 422 `consent_required`. The frontend refetches the documents and asks again. Covered by a Task 8 test (`test_stale_version_is_rejected`) and a Task 10 test (`stale version refetches`).
3. **A user who goes Back from the investing question to the name question and changes their name.** The provisional self member is renamed, not duplicated, and Upload reuses it. Covered by a Task 2 backend test (`test_self_create_renames_provisional_self`) and a frontend test (`back to name renames`).
4. **A failed upload (wrong password) retried with the box still ticked.** The second attempt must still carry the disclaimer version, because the store is not consumed per call. Covered by a Task 11 test (`retry keeps disclaimer`).
5. **Account hard-delete for a user with consent rows.** The deletion must succeed, because the trigger doesn't fire (there's no FK and no update), and the rows must remain. Covered by a Task 9 test (`test_hard_delete_keeps_consent_rows`).

---

## File map

| File | Tasks | Responsibility |
|---|---|---|
| `backend/app/services/auth/email_templates.py` | 1 | plainer OTP email |
| `backend/app/services/dashboard/household_members.py` | 2, 5 | provisional self rename; response fields |
| `backend/app/services/auth/schemas.py`, `backend/app/api/auth.py` | 2, 8, 9 | `self_name`, consent fields on sign-up bodies, `consent_outdated` |
| `frontend/src/features/auth/{onboardingSteps.ts,OnboardingFlow.tsx,Q1Name.tsx,SoloCasUpload.tsx,types.ts,api.ts}` | 2, 3 | onboarding |
| `frontend/src/features/auth/Q3Purpose.tsx` | 3 | "Why choose? All of it." |
| `backend/scripts/report_onboarding_goals.py` (new) | 3 | goals report |
| `backend/app/services/dashboard/member_details.py` | 4 | unlock-only rules |
| `backend/app/services/import_/{confirm_people.py,service.py,schemas.py}` | 4 | name rules at import |
| `backend/alembic/versions/0021_member_contact_fields.py` (new), `backend/app/models/user.py` | 5 | member phone/email |
| `backend/app/api/dashboard.py`, `backend/app/services/dashboard/{schemas.py,member_update.py (new)}` | 5 | `PATCH /household-members/{id}` |
| `frontend/src/features/dashboard/members/*`, `frontend/src/features/import/{PeopleFoundDialog.tsx,prompts/NameMismatchDialog.tsx}` | 6 | name/PAN UI |
| `backend/app/services/legal/{__init__.py,registry.py,documents/*.md,consent.py}` (new), `backend/app/models/consent.py` (new), `backend/app/db/consent_trigger_sql.py` (new), `backend/alembic/versions/0022_consent_records.py` (new), `backend/app/api/legal.py` (new) | 7, 9 | consent core |
| `backend/app/services/auth/identity.py`, `backend/app/models/auth.py` | 8 | consent through the pending record |
| `backend/app/api/{imports.py,cas_imports.py}`, `backend/app/services/auth/account_deletion.py`, `backend/scripts/consent_trail.py` (new) | 9 | upload/CAMS/deletion consent |
| `frontend/src/features/legal/*` (new), `frontend/src/features/auth/{Landing.tsx,AuthEntryFlow.tsx}`, `frontend/src/features/profile/PendingDeletionScreen.tsx` | 10 | sign-up consent UI |
| `frontend/src/features/import/{UploadForm.tsx,api.ts,RequestCamsPath.tsx}`, `frontend/src/mobile/features/import/{MobileUploadForm.tsx,MobileRequestCamsView.tsx}`, `frontend/src/App.tsx` | 11 | disclaimer + re-consent gate |
| `frontend/src/features/profile/*` | 12 | Profile restructure |

Model choice (memory `feedback_token_budget_plan_execution`): Sonnet for Tasks 1–3, 5, 6 and 10–13. Opus for Tasks 4, 7, 8 and 9 (member rules and consent are the riskiest) and for the final whole-branch review. Every task keeps its review gate.

---

### Task 1: OTP email, no highlight and no logo (F)

**Files:**
- Modify: `backend/app/services/auth/email_templates.py`
- Test: `backend/tests/services/auth/test_email_templates.py`

**Interfaces:** `otp_email_html(otp: str, ttl_minutes: int) -> str` is unchanged.

- [ ] **Step 1: Replace the two logo tests and add the new assertions.** Delete `test_otp_email_html_logo_visibility_comes_only_from_the_stylesheet` and `test_otp_email_html_builds_logo_urls_from_frontend_base_url`, then add:

```python
def test_otp_email_html_has_no_logo():
    html = otp_email_html(otp="743820", ttl_minutes=5)
    assert "<img" not in html
    assert "unifolio-logo" not in html
    assert "logo-light" not in html and "logo-dark" not in html


def test_verification_code_is_green_text_without_a_highlight():
    html = otp_email_html(otp="743820", ttl_minutes=5)
    assert '<span class="code-pill">verification code</span>' in html
    pill_rule = html.split(".code-pill {")[1].split("}")[0]
    assert "color: #15803D" in pill_rule
    assert "background" not in pill_rule
    assert "padding" not in pill_rule
    # Dark mode keeps the lighter green text.
    assert ".code-pill {{" not in html  # sanity: no unescaped template braces
    assert "color: #4ADE80" in html


def test_body_has_no_inline_display_styles():
    html = otp_email_html(otp="743820", ttl_minutes=5)
    assert "display" not in html.split("<body>")[1]
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && python3 -m pytest tests/services/auth/test_email_templates.py -q`
Expected: FAIL on `<img` and `background`.

- [ ] **Step 3: Implement** in `email_templates.py`:
  - Delete the `logo_light` / `logo_dark` variables and the `settings` import (if `settings` becomes unused).
  - Delete both `<img class="logo-…">` tags, the `.logo-light` / `.logo-dark` rules, and their two `!important` lines inside the dark media query.
  - Change the pill rule to `.code-pill {{ color: #15803D; font-weight: 700; }}`. Keep `.code-pill {{ color: #4ADE80 !important; }}` in the dark block.
  - Update the module docstring line about the visual direction to say "no logo, accent text only (2026-10-01)".

- [ ] **Step 4: Run, expect PASS**

Run: `cd backend && python3 -m pytest tests/services/auth/test_email_templates.py -q`. Stop.

---

### Task 2: Remove the privacy screen, save the name at the name step, resume rule (A)

**Files:**
- Modify: `backend/app/services/dashboard/household_members.py:28-60` (`create_household_member`)
- Modify: `backend/app/services/auth/schemas.py` (`MeResponse`), `backend/app/api/auth.py` (`_me_response`, `get_me`, and every caller of `_me_response`)
- Modify: `frontend/src/features/auth/{onboardingSteps.ts,OnboardingFlow.tsx,SoloCasUpload.tsx,types.ts}`
- Delete: `frontend/src/features/auth/TrustPrimer.tsx`, `TrustPrimer.test.tsx`. Also delete `public/illustrations/mobile_privacy_screen.png` and `mobile_privacy_screen_dark.png`, plus the `"trust"` variant in `OnboardingIllustration.tsx`, but only after grepping that nothing else uses them.
- Test (backend): `tests/api/test_auth_routes.py`, `tests/api/test_member_details_routes.py` (the create-member tests live there), `tests/services/auth/test_schemas.py`
- Test (frontend): `features/auth/OnboardingFlow.test.tsx`, `onboardingHistory.test.ts`, `Q1Name.test.tsx`, `SoloCasUpload.test.tsx`, `OnboardingCardStack.test.tsx`, `MobileOnboardingScreen.test.tsx`, `features/auth/api.test.ts`

**Interfaces:**
- **Produces `MeResponse.self_name: str | None`.** It's the self member's `name`, or `null` when there is no self member. TS: `self_name: string | null` on `MeResponse`.
- **Produces a changed `POST /household-members` with `relationship: "self"`.** When a self member exists with `name_source == USER_ENTERED` and `pan_lookup_hash IS NULL` (provisional, before any CAS), the endpoint renames it and returns 200 with it. Otherwise it returns 409 as today.
- **Produces `resumeStep(me: MeResponse): OnboardingStep`** in `OnboardingFlow.tsx`, exported for tests.

- [ ] **Step 1: Write the failing backend tests.** These go in `tests/api/test_member_details_routes.py` and use its `_headers` / `_db` helpers.

```python
def test_self_create_renames_provisional_self(client):
    h = _headers(client, "+919100100001")
    first = client.post("/household-members", json={"name": "Ravi", "relationship": "self"}, headers=h)
    again = client.post("/household-members", json={"name": "Ravi Kumar", "relationship": "self"}, headers=h)
    assert first.status_code == 200 and again.status_code == 200
    assert again.json()["id"] == first.json()["id"]
    assert again.json()["name"] == "Ravi Kumar"


def test_self_create_is_409_once_self_has_a_cas_pan(client):
    h = _headers(client, "+919100100002")
    me = client.post("/household-members", json={"name": "Ravi", "relationship": "self"}, headers=h).json()
    db = _db()
    m = db.get(HouseholdMember, uuid.UUID(me["id"]))
    m.pan_encrypted, m.pan_lookup_hash = encrypt_pan(PAN), hash_pan(PAN)
    db.commit(); db.close()
    r = client.post("/household-members", json={"name": "Someone Else", "relationship": "self"}, headers=h)
    assert r.status_code == 409
```

And in `tests/api/test_auth_routes.py`:

```python
def test_get_me_reports_self_name(client):
    headers = _goal_headers(client, "+919100100003")
    assert client.get("/auth/me", headers=headers).json()["self_name"] is None
    client.post("/household-members", json={"name": "Asha Rao", "relationship": "self"}, headers=headers)
    assert client.get("/auth/me", headers=headers).json()["self_name"] == "Asha Rao"
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd backend && python3 -m pytest tests/api/test_member_details_routes.py tests/api/test_auth_routes.py -q -k "self_create or self_name"`

- [ ] **Step 3: Implement the backend**

`household_members.py`, inside the `relationship == Relationship.SELF` branch:

```python
        if existing_self is not None:
            # 2026-10-01 (decision QA): the onboarding name is provisional
            # until the first CAS gives the real one. Going Back to the name
            # step and changing it renames the same row instead of failing.
            if existing_self.name_source == MemberNameSource.USER_ENTERED and existing_self.pan_lookup_hash is None:
                existing_self.name = name
                existing_self.name_updated_at = datetime.now(timezone.utc)
                db.commit()
                return existing_self
            raise DuplicateSelfMemberError("This user already has a 'self' household member.")
```

`schemas.py`: add `self_name: str | None = None` to `MeResponse`. In `auth.py`, change `_me_response(user)` to `_me_response(user, db)`. It looks up `db.query(HouseholdMember).filter_by(user_id=user.id, relationship=Relationship.SELF).first()` and sets `self_name=m.name if m else None`. Add `db: DbSession = Depends(get_db)` to `get_me`, and pass `db` at every other `_me_response` call site (update_me, contact-change verify, account-deletion, reactivate).

- [ ] **Step 4: Run the backend tests**

Run: `cd backend && python3 -m pytest tests/api/test_member_details_routes.py tests/api/test_auth_routes.py tests/services/auth/test_schemas.py -q`. Expected: PASS.

- [ ] **Step 5: Write the failing frontend tests** in `OnboardingFlow.test.tsx`. Follow the file's existing render/mock pattern for `getMe`, `updateMe` and `createHouseholdMember`.

```tsx
import { resumeStep } from "./OnboardingFlow";

const baseMe = { user_id: "u", phone_number: "+91", email: null, onboarding_completed: false,
  investor_type: null, primary_goals: null, pending_deletion: false, deletion_scheduled_at: null, self_name: null };

describe("resumeStep", () => {
  it("trust_primer with nothing saved goes to the name step", () => {
    expect(resumeStep({ ...baseMe, onboarding_step: "trust_primer" })).toBe("q1_name");
  });
  it("trust_primer with only a name goes to investing", () => {
    expect(resumeStep({ ...baseMe, onboarding_step: "trust_primer", self_name: "Asha" })).toBe("q2_investing");
  });
  it("trust_primer with name and investing goes to the goal question", () => {
    expect(resumeStep({ ...baseMe, onboarding_step: "trust_primer", self_name: "Asha", investor_type: "self_directed" })).toBe("q3_purpose");
  });
  it("trust_primer with everything saved goes to upload", () => {
    expect(resumeStep({ ...baseMe, onboarding_step: "trust_primer", self_name: "Asha", investor_type: "self_directed", primary_goals: ["family_management"] })).toBe("cas_upload");
  });
  it("any step past the name without a saved name goes back to the name step", () => {
    expect(resumeStep({ ...baseMe, onboarding_step: "cas_upload" })).toBe("q1_name");
    expect(resumeStep({ ...baseMe, onboarding_step: "q3_purpose" })).toBe("q1_name");
  });
  it("a normal step with a saved name is kept, even if a skipped answer is null", () => {
    expect(resumeStep({ ...baseMe, onboarding_step: "cas_upload", self_name: "Asha" })).toBe("cas_upload");
  });
  it("no step starts at the name step", () => {
    expect(resumeStep({ ...baseMe, onboarding_step: null })).toBe("q1_name");
  });
});
```

Add these flow tests:
- **"name step saves the self member"**: submitting Q1 calls `createHouseholdMember("Asha Rao", "self")` before moving on.
- **"back to name renames"**: Q1 → Q2 → Back → change the name → submit calls `createHouseholdMember` again with the new name.
- **"what brings you continues to upload"**: Continue on Q3 lands on the upload step, and no privacy screen text ("not your files") is rendered.
- **"resumed questions show the saved answers"**: with `me.investor_type = "self_directed"` resumed at `q2_investing`, that option is selected.

In `SoloCasUpload.test.tsx`, update expectations so that an existing self member is reused (no create call), which the component already does.

- [ ] **Step 6: Run, expect FAIL**

Run: `cd frontend && npx vitest run src/features/auth/OnboardingFlow.test.tsx`

- [ ] **Step 7: Implement the frontend**

`onboardingSteps.ts`:

```ts
export const ONBOARDING_STEPS = ["landing", "phone", "otp", "q1_name", "q2_investing", "q3_purpose", "cas_upload", "done"] as const;
// getStepIndex: q1_name 0, q2_investing 1, q3_purpose 2, cas_upload 3; default 0.
```

Everywhere `totalSteps={5}` or `totalSteps = 5` appears in onboarding components, change it to 4. Grep `totalSteps` under `src/features/auth`.

`OnboardingFlow.tsx`:

```ts
// 2026-10-01: the privacy screen ("trust_primer") is gone. Users who stopped
// on it resume at their first unsaved answer (name -> investing -> goals),
// else Upload. The name check runs for every resume: the name step has no
// Skip, so a missing name always means it was never saved. The investing and
// goal checks run only for the old trust_primer value, because a skipped
// question also saves null and would otherwise be re-asked on every return
// (decision QF accepts one re-ask for those users).
export function resumeStep(me: MeResponse | null | undefined): OnboardingStep {
  const step = me?.onboarding_step;
  if (step === "trust_primer") {
    if (!me?.self_name) return "q1_name";
    if (!me.investor_type) return "q2_investing";
    if (!me.primary_goals || me.primary_goals.length === 0) return "q3_purpose";
    return "cas_upload";
  }
  if (!isOnboardingStep(step) || step === "done") return "q1_name";
  const pastName = step === "q2_investing" || step === "q3_purpose" || step === "cas_upload";
  if (pastName && !me?.self_name) return "q1_name";
  return step;
}
```

Then:
- Initialise history with `initHistory(resumeStep(me))`.
- Initialise `answers` from `me`: `{ name: me?.self_name ?? "", investorType: me?.investor_type ?? null, primaryGoals: me?.primary_goals ?? [] }`, using the `OnboardingAnswers` field names already in the file.
- In the Q1 submit handlers (desktop and mobile), `await createHouseholdMember(name.trim(), "self")` before `go("q2_investing")`. On error, show the existing name-step error state. Q1Name's `onSubmit` may need to become async-aware: keep the button disabled while saving.
- Change the Q3 `onSkip={() => skip("trust_primer")}` handlers and Continue to target `"cas_upload"`.
- Delete the `trust_primer` branch and the `TrustPrimer` import.

`types.ts`: add `self_name: string | null` to `MeResponse`. `SoloCasUpload.tsx`: no logic change (it reuses an existing self). Update its comment to say the self member is normally created at the name step now.

Delete `TrustPrimer.tsx`, `TrustPrimer.test.tsx`, and the unused privacy illustrations (grep first).

- [ ] **Step 8: Run the frontend tests and typecheck**

Run: `cd frontend && npx vitest run src/features/auth/OnboardingFlow.test.tsx src/features/auth/onboardingHistory.test.ts src/features/auth/Q1Name.test.tsx src/features/auth/SoloCasUpload.test.tsx src/features/auth/OnboardingCardStack.test.tsx src/features/auth/MobileOnboardingScreen.test.tsx src/features/auth/api.test.ts && npx tsc -b`. Expected: PASS. Stop.

---

### Task 3: "Why choose? All of it." and the goals report (C)

**Files:**
- Modify: `frontend/src/features/auth/Q3Purpose.tsx`
- Create: `frontend/src/features/auth/Q3Purpose.test.tsx`
- Create: `backend/scripts/report_onboarding_goals.py`, `backend/tests/scripts/test_report_onboarding_goals.py`

**Interfaces:**
- **Produces `ALL_GOALS: PrimaryGoal[]`**, exported from `Q3Purpose.tsx`. It lists the four values in display order.
- **Produces `goal_report(db: Session, date_from: date | None, date_to: date | None) -> dict`**, which returns `{"total_users": int, "skipped": int, "all_four": int, "per_goal": {goal: {"count": int, "pct": float}}}`. `pct` is a percentage of the users who answered, to one decimal place.
- **Produces `goal_rows(db, date_from, date_to) -> list[tuple[str, str, str]]`**, returning `(user_id, created_at ISO, "goal1|goal2")` for the CSV export.

- [ ] **Step 1: Write the failing frontend tests** (`Q3Purpose.test.tsx`)

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { Q3Purpose } from "./Q3Purpose";

const setup = (selected: string[] = []) => {
  const onContinue = vi.fn();
  render(<Q3Purpose selectedValues={selected as never} onBack={vi.fn()} onSkip={vi.fn()} onContinue={onContinue} />);
  return { onContinue };
};
const all = () => screen.getByRole("checkbox", { name: /why choose\? all of it\./i });

it("all of it ticks every goal", () => {
  const { onContinue } = setup();
  fireEvent.click(all());
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  expect(onContinue).toHaveBeenCalledWith(["consolidated_view", "understand_holdings", "family_management", "performance_comparison"]);
});

it("unticking one goal unticks all of it", () => {
  setup();
  fireEvent.click(all());
  fireEvent.click(screen.getByRole("checkbox", { name: /family wealth tracking/i }));
  expect(all()).toHaveAttribute("aria-checked", "false");
});

it("ticking all four by hand lights up all of it", () => {
  setup();
  for (const n of [/consolidated portfolio view/i, /understand true performance/i, /family wealth tracking/i, /compare distributor fees/i])
    fireEvent.click(screen.getByRole("checkbox", { name: n }));
  expect(all()).toHaveAttribute("aria-checked", "true");
});

it("tapping all of it again clears everything", () => {
  setup();
  fireEvent.click(all());
  fireEvent.click(all());
  expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
});
```

- [ ] **Step 2: Run, expect FAIL**: `cd frontend && npx vitest run src/features/auth/Q3Purpose.test.tsx`

- [ ] **Step 3: Implement** in `Q3Purpose.tsx`:
  - Export `const ALL_GOALS = OPTIONS.map((o) => o.value);`.
  - Derive `const allPicked = ALL_GOALS.every((g) => picked.includes(g));` and add `const toggleAll = () => setPicked(allPicked ? [] : [...ALL_GOALS]);`.
  - Render a fifth `motion.button` after the four, with `role="checkbox"`, `aria-checked={allPicked}` and `onClick={toggleAll}`.
  - Its title is `Why choose? All of it.` and its subtitle is `The full picture, the true returns, the whole family, the fine print.`
  - Separate it with a top border (`border-t border-[var(--color-border)]/60 mt-1 pt-1`) and reuse the same row classes and selected styling. For the icon, use a `Check` inside the same 9×9 rounded tile.
  - It's purely a UI shortcut and saves the four values. Add a one-line comment saying so (decision Q7).

- [ ] **Step 4: Write the failing script test** (`tests/scripts/test_report_onboarding_goals.py`, using the `db_session` fixture)

```python
from datetime import date, datetime, timezone

from app.models.user import User
from scripts.report_onboarding_goals import goal_report, goal_rows


def _user(db, phone, goals, created="2026-10-01"):
    u = User(phone_number=phone, created_at=datetime.fromisoformat(created).replace(tzinfo=timezone.utc), primary_goals=goals)
    db.add(u); db.commit(); return u


ALL = ["consolidated_view", "understand_holdings", "family_management", "performance_comparison"]


def test_report_counts(db_session):
    _user(db_session, "+911", ALL)
    _user(db_session, "+912", ["family_management"])
    _user(db_session, "+913", None)
    r = goal_report(db_session, None, None)
    assert r["total_users"] == 3 and r["skipped"] == 1 and r["all_four"] == 1
    assert r["per_goal"]["family_management"] == {"count": 2, "pct": 100.0}
    assert r["per_goal"]["consolidated_view"] == {"count": 1, "pct": 50.0}


def test_date_filter_and_rows(db_session):
    _user(db_session, "+914", ["family_management"], created="2026-09-01")
    _user(db_session, "+915", ["consolidated_view"], created="2026-10-02")
    r = goal_report(db_session, date(2026, 10, 1), None)
    assert r["total_users"] == 1
    rows = goal_rows(db_session, None, None)
    assert {row[2] for row in rows} == {"family_management", "consolidated_view"}
```

(Check `tests/scripts/` for how existing script tests import `scripts.*`, e.g. `test_background_jobs.py`, and match it.)

- [ ] **Step 5: Implement `backend/scripts/report_onboarding_goals.py`**

```python
"""Read-only report on the onboarding "What brings you to Unifolio?" answers.

Run when needed (2026-10-01 plan, section C2):
    python3 -m scripts.report_onboarding_goals [--from 2026-10-01] [--to 2026-10-31] [--csv out.csv]
Filtering happens in Python, not JSON SQL, so it runs unchanged on SQLite and Postgres.
"All four" is how "Why choose? All of it." shows up: the UI saves all four goals.
"""
from __future__ import annotations

import argparse
import csv
import sys
from datetime import date, datetime, time, timezone

from sqlalchemy.orm import Session

from app.models.enums import PrimaryGoal
from app.models.user import User

GOALS = [g.value for g in PrimaryGoal]


def _users(db: Session, date_from: date | None, date_to: date | None) -> list[User]:
    q = db.query(User)
    if date_from:
        q = q.filter(User.created_at >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to:
        q = q.filter(User.created_at <= datetime.combine(date_to, time.max, tzinfo=timezone.utc))
    return q.all()


def goal_report(db: Session, date_from: date | None, date_to: date | None) -> dict:
    users = _users(db, date_from, date_to)
    answered = [u for u in users if u.primary_goals]
    per_goal = {}
    for g in GOALS:
        n = sum(1 for u in answered if g in u.primary_goals)
        per_goal[g] = {"count": n, "pct": round(100 * n / len(answered), 1) if answered else 0.0}
    return {
        "total_users": len(users),
        "skipped": len(users) - len(answered),
        "all_four": sum(1 for u in answered if set(GOALS) <= set(u.primary_goals)),
        "per_goal": per_goal,
    }


def goal_rows(db: Session, date_from: date | None, date_to: date | None) -> list[tuple[str, str, str]]:
    return [(str(u.id), u.created_at.isoformat(), "|".join(u.primary_goals or []))
            for u in _users(db, date_from, date_to)]


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--from", dest="date_from", type=date.fromisoformat)
    p.add_argument("--to", dest="date_to", type=date.fromisoformat)
    p.add_argument("--csv", dest="csv_path")
    a = p.parse_args(argv)
    from app.db.session import SessionLocal
    db = SessionLocal()
    try:
        r = goal_report(db, a.date_from, a.date_to)
        print(f"Users: {r['total_users']}  skipped: {r['skipped']}  all four: {r['all_four']}")
        for g, v in r["per_goal"].items():
            print(f"  {g:<24} {v['count']:>6}  {v['pct']:>5}%")
        if a.csv_path:
            with open(a.csv_path, "w", newline="") as f:
                w = csv.writer(f); w.writerow(["user_id", "created_at", "goals"]); w.writerows(goal_rows(db, a.date_from, a.date_to))
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

(Use whatever session factory name `app/db/session.py` actually exports. Grep `SessionLocal\|sessionmaker` there.)

- [ ] **Step 6: Run**: `cd backend && python3 -m pytest tests/scripts/test_report_onboarding_goals.py -q` and `cd frontend && npx vitest run src/features/auth/Q3Purpose.test.tsx src/features/auth/OnboardingFlow.test.tsx && npx tsc -b`. PASS. Stop.

---

### Task 4: Name and PAN come from the CAS, backend (H)

**Files:**
- Modify: `backend/app/services/dashboard/member_details.py` (`MemberDetailsRequest`, `complete_member_details`, delete `DetectedPanMismatchError` / `InvalidPanChoiceError` if unused)
- Modify: `backend/app/api/dashboard.py:116-134` (error mapping)
- Modify: `backend/app/services/import_/confirm_people.py:537-560` (`_apply_name_choice`)
- Modify: `backend/app/services/import_/service.py:764-787` (`resolve_name`), `backend/app/services/import_/schemas.py:108` (`ResolveNameRequest`)
- Modify: `backend/app/services/import_/name_match.py` (new `NameNotEditableError`)
- Test: `tests/api/test_member_details_routes.py`, `tests/services/dashboard/test_member_details.py`, `tests/api/test_imports_people_routes.py`, `tests/services/import_/test_confirm_people.py`, `tests/services/import_/test_people_resolution.py`, `tests/services/import_/test_name_match.py`, `tests/services/import_/test_pan_claims.py`, `tests/api/test_imports_routes.py`, `tests/functional_postgres/test_member_detection_postgres.py`

**Interfaces:**
- **Produces `MemberDetailsRequest`:** `{ relationship: Relationship; relationship_other_label?: str; pan?: str; name?: str (always rejected); use_detected_pan?: bool (accepted and ignored, for old clients during a rollout) }`.
- **Produces `FieldNotEditableError(MemberDetailsError)`:** `status_code = 422`, `code = "field_not_editable"`.
- **Produces `NameNotEditableError(InvalidPersonNameError)`** in `name_match.py`, with `code = "name_not_editable"`. The existing `except (ConfirmInvalidError, InvalidPersonNameError)` in `imports.py` already maps it to 422.
- `POST /household-members/{id}/details` is **unlock-only**. On an unlocked member it returns 422 `field_not_editable` with the message "Edit this person from Profile → Family Members."; relationship edits move to Task 5's `PATCH`.
- **Unlock rules:**
  - **Statement PAN** (`detected_pan_hash` set and `pan_source != USER_ENTERED`): the PAN is always the decrypted detected PAN, and a body `pan` returns 422 `field_not_editable`.
  - **No statement PAN** (`is_name_only(member)`): body `pan` is required, and the existing format, holder and L4/L5 logic runs unchanged.
  - **Name:** never changes. A body `name` returns 422 `field_not_editable`.
- **`ResolveNameRequest.name` becomes `str | None = None`.** `resolve_name` always renames self to `current.details["statement_name"]` and ignores the body.
- **`_apply_name_choice`:**
  - `conf.name` is honoured only when `person.needs_name`. A differing `conf.name` for a CAS-named person raises `NameNotEditableError`; the same name re-sent is fine.
  - A member whose `name_source == USER_ENTERED` and whose person has a readable name gets renamed to the CAS name (`NameChangeReason.USER_CORRECTED_TO_CAS`, `MemberNameSource.CAS`) whenever the names differ (QB/QE).

- [ ] **Step 1: Write the failing tests** (`test_member_details_routes.py`, existing helpers)

```python
def test_unlock_with_statement_pan_needs_only_relationship(client):
    h = _headers(client, "+919100200001")
    _, mid = _add_locked(client, h)
    r = client.post(f"/household-members/{mid}/details", json={"relationship": "parent"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["pan_masked"] == "BX******8L" and r.json()["details_required"] is False
    db = _db(); m = db.get(HouseholdMember, uuid.UUID(mid))
    assert m.pan_lookup_hash == hash_pan(PAN) and m.pan_source == MemberPanSource.CAS and m.pan_verified_at is not None


def test_unlock_rejects_a_typed_pan_when_the_statement_has_one(client):
    h = _headers(client, "+919100200002")
    _, mid = _add_locked(client, h)
    r = client.post(f"/household-members/{mid}/details", json={"relationship": "parent", "pan": PAN}, headers=h)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "field_not_editable"


def test_unlock_without_statement_pan_requires_a_typed_pan(client):
    h = _headers(client, "+919100200003")
    _, mid = _add_locked(client, h, detected=None)
    assert client.post(f"/household-members/{mid}/details", json={"relationship": "parent"}, headers=h).status_code == 422
    r = client.post(f"/household-members/{mid}/details", json={"relationship": "parent", "pan": "abcde1234f"}, headers=h)
    assert r.status_code == 200 and r.json()["pan_masked"] == "AB******4F"
    db = _db(); m = db.get(HouseholdMember, uuid.UUID(mid))
    assert m.pan_source == MemberPanSource.USER_ENTERED


def test_unlock_rejects_a_name(client):
    h = _headers(client, "+919100200004")
    _, mid = _add_locked(client, h)
    r = client.post(f"/household-members/{mid}/details", json={"relationship": "parent", "name": "New Name"}, headers=h)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "field_not_editable"


def test_details_on_an_unlocked_member_is_422(client):
    h = _headers(client, "+919100200005")
    _, mid = _add_locked(client, h)
    client.post(f"/household-members/{mid}/details", json={"relationship": "parent"}, headers=h)
    r = client.post(f"/household-members/{mid}/details", json={"relationship": "sibling"}, headers=h)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "field_not_editable"
```

In `test_imports_people_routes.py` (or `test_confirm_people.py`, whichever has the confirm-people fixtures), add:
- **`test_renaming_a_cas_named_person_is_422`**: confirm with `people=[{person_key, name: "Different"}]` for a named person, and expect 422 `name_not_editable`.
- **`test_needs_name_person_can_be_named_once`**: the existing U9 behaviour still works.
- **`test_user_entered_name_is_replaced_by_the_statement_name`**: a member with `name_source=USER_ENTERED` matched by PAN, confirmed again with a statement name, ends with the CAS name and `name_source=CAS`.

In `test_imports_routes.py`: **`test_resolve_name_uses_the_statement_name`**, where posting `{}` or `{"name": "anything"}` to resolve-name renames self to the statement's name.

- [ ] **Step 2: Run, expect FAIL**: `cd backend && python3 -m pytest tests/api/test_member_details_routes.py tests/api/test_imports_people_routes.py tests/api/test_imports_routes.py -q -k "unlock or details_on or renaming or needs_name or user_entered or resolve_name"`

- [ ] **Step 3: Implement**

`member_details.py`:

```python
class FieldNotEditableError(MemberDetailsError):
    status_code = 422
    code = "field_not_editable"


class MemberDetailsRequest(BaseModel):
    relationship: Relationship
    relationship_other_label: str | None = None
    pan: str | None = None
    # 2026-10-01 rule: name and PAN come from the CAS. Kept as fields only so a
    # caller sending them gets a clear 422 instead of being silently ignored.
    name: str | None = None
    # Old clients (pre-2026-10-01) may still send this during a rollout; the
    # statement PAN is now always used, so it is accepted and ignored.
    use_detected_pan: bool = False
```

Rewrite the head of `complete_member_details` (everything before `now = …`) as:

```python
    member = db.query(HouseholdMember).filter_by(id=member_id, user_id=user_id).first()
    if member is None:
        raise MemberNotFoundError()
    if member.relationship == Relationship.SELF:
        raise InvalidMemberDetailsError("Your own details are edited from your profile.")
    if not member.is_locked:
        raise FieldNotEditableError("Edit this person from Profile → Family Members.")
    if body.name is not None:
        raise FieldNotEditableError("Names come from your statement and can’t be changed.")
    label = _validate_relationship(body)
    locked = True
    name_only = is_name_only(member)
    if not name_only:
        # Statement PAN: always the one the CAS showed (decision QD).
        if body.pan is not None:
            raise FieldNotEditableError("This PAN comes from your statement and can’t be changed.")
        pan = decrypt_pan(member.detected_pan_encrypted)
    else:
        # No PAN on the statement: the only place a PAN is typed (decision QC).
        if body.pan is None:
            raise InvalidMemberDetailsError(f"Enter {member.name}’s PAN.")
        pan = normalise_pan_input(body.pan)
        if not _PAN_RE.match(pan):
            raise InvalidPanFormatError()
```

Below that:
- Delete the `DetectedPanMismatchError` check. It's unreachable now: a statement PAN is used as-is.
- Delete the `new_name` rename block in the writes.
- Keep the holder/L4/L5/writes code otherwise unchanged. `matches_detected` is still true for the statement-PAN path.
- Delete the `DetectedPanMismatchError` and `InvalidPanChoiceError` classes and their imports in `dashboard.py` if nothing else references them (grep first).
- `dashboard.py`'s generic `except MemberDetailsError` mapping already returns `{code, message}`. Check that `FieldNotEditableError` passes through it.

`name_match.py`:

```python
class NameNotEditableError(InvalidPersonNameError):
    code = "name_not_editable"
```

`confirm_people.py`, `_apply_name_choice`:

```python
    if conf.name is not None:
        clean = validate_person_name(conf.name)
        if _is_edit(clean, plan.name):
            # 2026-10-01 rule: only a person the statement couldn't name (U9)
            # gets a typed name; everyone else keeps the CAS name.
            if not person.needs_name:
                raise NameNotEditableError("Names come from your statement and can’t be changed.")
            _rename(db, member, clean, NameChangeReason.USER_EDIT, MemberNameSource.USER_ENTERED, import_rec, now)
            return
    if person.needs_name:
        return
    if member.name_source == MemberNameSource.USER_ENTERED and _is_edit(person.name, member.name):
        # QB/QE: a typed name is provisional; the first statement that has a
        # readable name for this person replaces it.
        _rename(db, member, person.name, NameChangeReason.USER_CORRECTED_TO_CAS, MemberNameSource.CAS, import_rec, now)
        return
```

(The existing `kind` logic follows unchanged.)

`service.py` `resolve_name`: change the signature to `resolve_name(db, session_id, user_id, name: str | None = None)`. Replace `clean = validate_person_name(name)` and the mismatch check with `clean = validate_person_name(current.details["statement_name"])`, plus a comment saying U2 is now "Is that you? Yes" and the statement name is always used. `schemas.py`: `name: str | None = None`. `imports.py`: pass `body.name` through unchanged.

- [ ] **Step 4: Fix existing tests that encode the old rules.** This is a mapping, not new behaviour:
  - Tests sending `pan` to unlock a member that has a statement PAN: drop `pan` from the body, keep the assertions.
  - Tests of L3 `detected_pan_mismatch`, or the `use_detected_pan` exclusivity tests (`test_pan_and_use_detected_pan_together_is_422`, `test_neither_pan_nor_flag_is_422`, `test_use_detected_pan_rejected_for_a_name_only_member`): delete them. The behaviour they pinned no longer exists.
  - Tests editing an unlocked member (L9) through `/details`: change them to expect 422 `field_not_editable`. Task 5 adds the PATCH equivalents.
  - Tests renaming via `/details` or via confirm-people for a CAS-named person: expect 422.

- [ ] **Step 5: Run**: `cd backend && python3 -m pytest tests/api/test_member_details_routes.py tests/services/dashboard/test_member_details.py tests/api/test_imports_people_routes.py tests/services/import_/test_confirm_people.py tests/services/import_/test_people_resolution.py tests/services/import_/test_name_match.py tests/services/import_/test_pan_claims.py tests/api/test_imports_routes.py tests/functional_postgres/test_member_detection_postgres.py -q`. Expected: PASS, with the Postgres tests reported as skipped if there's no `TEST_DATABASE_URL`. Stop.

---

### Task 5: Member phone/email and `PATCH /household-members/{id}` (E backend)

**Files:**
- Create: `backend/alembic/versions/0021_member_contact_fields.py`
- Modify: `backend/app/models/user.py` (`HouseholdMember`)
- Create: `backend/app/services/dashboard/member_update.py`
- Modify: `backend/app/services/dashboard/{schemas.py,household_members.py}`, `backend/app/api/dashboard.py`
- Test: `tests/api/test_dashboard_routes.py`, `tests/test_migrations.py`

**Interfaces:**
- **New columns** `household_members.phone_number String NULL` and `household_members.email String NULL`.
- **`HouseholdMemberResponse` gains:**
  - `phone_number: str | None`, `email: str | None`
  - `pan_on_statement: bool`, true when the member is locked with a statement PAN (`detected_pan_hash is not None and pan_source != USER_ENTERED`). The unlock popup shows a PAN field only when it's false.
  - `name_from_statement: bool` (`name_source == CAS`)
- **`PATCH /household-members/{id}`** with body `MemberUpdateRequest { relationship?: Relationship; relationship_other_label?: str | None; phone_number?: str | None; email?: str | None; name?: str; pan?: str }`. Returns `HouseholdMemberResponse`.
  - `name` or `pan` present → 422 `field_not_editable`.
  - Self member: `relationship` → 422. Phone/email on self → 422 `field_not_editable` with "Change your phone or email from Account Info."
  - Locked member → 403 (same as the other write side doors; reuse `require_unlocked_member`).
  - Phone validated with the existing Indian-phone normaliser used by auth (grep `normalize_phone\|validate_indian_phone` in `app/`). Email validated with Pydantic `EmailStr` or the auth schema's email validator. Empty string → stored as NULL. Neither is unique (decision Q8: contact details only, no OTP).
  - `relationship: "self"` → 422.

- [ ] **Step 1: Write the failing tests** (`tests/api/test_dashboard_routes.py`; reuse its auth helper or copy `_headers` from `test_member_details_routes.py`)

```python
def _family(client, h):
    return client.post("/household-members", json={"name": "Meera Rao", "relationship": "parent"}, headers=h).json()


def test_patch_member_updates_relationship_phone_email(client):
    h = _headers(client, "+919100300001")
    client.post("/household-members", json={"name": "Asha Rao", "relationship": "self"}, headers=h)
    m = _family(client, h)
    r = client.patch(f"/household-members/{m['id']}", json={"relationship": "sibling", "phone_number": "9876543210", "email": "meera@example.com"}, headers=h)
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["relationship"] == "sibling" and b["phone_number"] == "+919876543210" and b["email"] == "meera@example.com"


def test_patch_member_rejects_name_and_pan(client):
    h = _headers(client, "+919100300002")
    m = _family(client, h)
    for body in ({"name": "X"}, {"pan": "ABCDE1234F"}):
        r = client.patch(f"/household-members/{m['id']}", json=body, headers=h)
        assert r.status_code == 422 and r.json()["detail"]["code"] == "field_not_editable"


def test_patch_self_rejects_relationship_and_contact(client):
    h = _headers(client, "+919100300003")
    me = client.post("/household-members", json={"name": "Asha Rao", "relationship": "self"}, headers=h).json()
    assert client.patch(f"/household-members/{me['id']}", json={"relationship": "parent"}, headers=h).status_code == 422
    assert client.patch(f"/household-members/{me['id']}", json={"phone_number": "9876543210"}, headers=h).status_code == 422


def test_patch_member_clears_email_with_empty_string(client):
    h = _headers(client, "+919100300004")
    m = _family(client, h)
    client.patch(f"/household-members/{m['id']}", json={"email": "a@b.co"}, headers=h)
    assert client.patch(f"/household-members/{m['id']}", json={"email": ""}, headers=h).json()["email"] is None


def test_patch_member_bad_phone_is_422(client):
    h = _headers(client, "+919100300005")
    m = _family(client, h)
    assert client.patch(f"/household-members/{m['id']}", json={"phone_number": "12"}, headers=h).status_code == 422


def test_patch_other_users_member_is_404(client):
    a = _headers(client, "+919100300006"); b = _headers(client, "+919100300007")
    m = _family(client, a)
    assert client.patch(f"/household-members/{m['id']}", json={"relationship": "sibling"}, headers=b).status_code == 404


def test_member_response_has_statement_flags(client):
    h = _headers(client, "+919100300008")
    m = _family(client, h)
    assert m["pan_on_statement"] is False and m["name_from_statement"] is False
    assert m["phone_number"] is None and m["email"] is None
```

In `tests/test_migrations.py`, follow its existing per-revision pattern to assert that `0021` adds both nullable columns and that downgrade removes them.

- [ ] **Step 2: Run, expect FAIL**: `cd backend && python3 -m pytest tests/api/test_dashboard_routes.py -q -k "patch or statement_flags"`

- [ ] **Step 3: Implement**
  - **Migration `0021_member_contact_fields.py`:** `revision = "0021"`, `down_revision = "0020"`. Use `op.add_column("household_members", sa.Column("phone_number", sa.String(), nullable=True))` and the same for `email`. Downgrade uses `batch_alter_table` to drop both (SQLite).
  - **Model:** add `phone_number: Mapped[str | None] = mapped_column(String)` and `email: Mapped[str | None] = mapped_column(String)` with a comment saying these are contact details only, unverified (Q8).
  - **`member_update.py`:** a `MemberUpdateRequest` Pydantic model, and `update_member(db, user_id, member_id, body) -> HouseholdMember`. It raises `FieldNotEditableError` (import it from `member_details.py`), `InvalidMemberDetailsError` and `MemberNotFoundError` from there, so the route maps errors the same way. Use `body.model_fields_set` to tell "absent" from "set to null". Commit once.
  - **`dashboard.py`:** add `@router.patch("/household-members/{member_id}", response_model=HouseholdMemberResponse)` as a plain `def`. Call `require_unlocked_member(db, user.id, member_id)` first, then `update_member`, with the same `except MemberDetailsError` mapping as `submit_member_details`.
  - **`member_to_response`:** fill the four new fields.

- [ ] **Step 4: Run**: `cd backend && python3 -m pytest tests/api/test_dashboard_routes.py tests/api/test_member_details_routes.py tests/test_migrations.py -q -k "not slow"`. If `test_migrations.py` has a whole-chain upgrade test, it must pass with 0021. Expected: PASS. Stop.

---

### Task 6: Name/PAN UI, unlock popup, edit dialog, people popup, name-mismatch prompt (H frontend)

**Files:**
- Modify: `frontend/src/features/dashboard/members/{memberDetailsForm.tsx,MemberDetailsDialog.tsx,EditMemberDialog.tsx}`. Delete `DetectedPanMismatchDialog.tsx` once it's unreferenced.
- Modify: `frontend/src/features/auth/{types.ts,api.ts}` (`HouseholdMember` fields, `MemberDetailsBody`, new `updateMember`)
- Modify: `frontend/src/features/import/PeopleFoundDialog.tsx`, `frontend/src/features/import/prompts/NameMismatchDialog.tsx`, `frontend/src/mobile/features/members/LockedMember.tsx` (if it renders the same form)
- Test: `features/dashboard/members/members.test.tsx`, `features/import/PeopleFoundDialog.test.tsx`, `features/import/prompts/prompts.test.tsx`, `features/dashboard/MainDashboardFlow.test.tsx`

**Interfaces:**
- **Consumes:** Task 4's `/details` rules and Task 5's `PATCH` and response fields.
- **Produces `updateMember(memberId: string, body: MemberUpdateBody): Promise<HouseholdMember>`**, where `MemberUpdateBody = { relationship?: Exclude<Relationship,"self">; relationship_other_label?: string | null; phone_number?: string | null; email?: string | null }`.
- **`HouseholdMember` TS gains** `phone_number: string | null; email: string | null; pan_on_statement: boolean; name_from_statement: boolean`.
- **`MemberDetailsBody` becomes** `{ relationship; relationship_other_label?: string | null; pan?: string }`.

- [ ] **Step 1: Write the failing tests**

In `members.test.tsx`, following its render and `completeMemberDetails` mock pattern:
- **"unlock with a statement PAN shows name and PAN read-only and a relationship dropdown only"**: no textbox named Name or PAN. Text shows the member name and `BX******8L`. Submitting with "Parent" calls `completeMemberDetails(id, { relationship: "parent", relationship_other_label: null })` with no `pan` key.
- **"unlock without a statement PAN shows a PAN field"**: with `pan_on_statement: false` and `pan_masked: null`, a PAN textbox is present. An empty PAN shows "Enter Meera Rao’s PAN." Valid input sends `pan: "ABCDE1234F"`.
- **"edit dialog changes relationship, phone and email through updateMember"**: there's no Name/PAN input, and `updateMember` is called with the three fields.
- **"field_not_editable shows the server message"**.

In `PeopleFoundDialog.test.tsx`:
- **"named people have no edit pencil"**: `queryByRole("button", {name: /edit name/i})` is null.
- **"a person with no readable name still gets the name box"**: this is the existing U9 test, kept.

In `prompts.test.tsx`:
- **"name mismatch asks is that you, with no text box"**: there's no textbox. The title is `This statement is in Ramesh Sharma’s name`, the body is `Is that you?`, and clicking `Yes, that’s me` calls `onUseName("Ramesh Sharma")`. `Upload a different file` is unchanged.

- [ ] **Step 2: Run, expect FAIL**: `cd frontend && npx vitest run src/features/dashboard/members/members.test.tsx src/features/import/PeopleFoundDialog.test.tsx src/features/import/prompts/prompts.test.tsx`

- [ ] **Step 3: Implement**

`memberDetailsForm.tsx`:
- `DetailsValues` becomes `{ relationship; label; pan }` (drop `name`).
- `validateValues(values, member)`: relationship rules, plus a PAN check only when `!member.pan_on_statement`.
- `submitDetails` sends `{ relationship, relationship_other_label, ...(member.pan_on_statement ? {} : { pan }) }`.
- Remove the `detectedMismatch` outcome and the `useDetectedPan` option.
- Map `field_not_editable` to `{kind:"error", message: p.message}`.
- `DetailsFormDialog`:
  - renders a read-only summary block first: `Name` → `member.name`, with a small "from your statement" caption; `PAN` → `member.pan_masked ?? "Not on your statement"`
  - then the Relationship select (plus the Other label input)
  - then the PAN input **only when** `showPanInput` is true
  - takes a new prop `member: HouseholdMember` and drops `panPlaceholder`

`MemberDetailsDialog.tsx`: remove the L3 stage and the `DetectedPanMismatchDialog` import. Keep the duplicate and other-account stages.

`EditMemberDialog.tsx`: a small form with Relationship (select + Other label), Phone (`type="tel"`) and Email (`type="email"`), prefilled from the member, plus the read-only Name/PAN summary. Save calls `updateMember` and maps 422 `{message}` inline. Rule L9's copy for PAN errors goes away.

`api.ts`: add `updateMember` (`PATCH /household-members/{id}`, JSON, `authHeaders()`, `throwIfError`, then `invalidateApiCache()` like the other member writes).

`PeopleFoundDialog.tsx`: delete the `editing` state, the pencil button and the `Pencil` import. `showInput = p.needs_name`. In `handleContinue`, only `needs_name` people's typed names go out: `if (p.needs_name && typed) outNames[p.person_key] = typed;`.

`NameMismatchDialog.tsx`: drop the input and the local state. The title is `` `This statement is in ${statementName}’s name` ``. The body is `` `You entered ${enteredName}. Is that you?` ``. The primary button `Yes, that’s me` calls `onUseName(statementName)`. Keep the props interface unchanged so `PromptHost` needs no change.

If `mobile/features/members/LockedMember.tsx` renders its own name/PAN inputs, apply the same rules there and add it to this task's test run via its nearest test file. If it reuses `DetailsFormDialog`, there's nothing to do.

- [ ] **Step 4: Run**: `cd frontend && npx vitest run src/features/dashboard/members/members.test.tsx src/features/import/PeopleFoundDialog.test.tsx src/features/import/prompts/prompts.test.tsx src/features/dashboard/MainDashboardFlow.test.tsx && npx tsc -b`. PASS. Stop.

---

### Task 7: Consent core: documents, table, trigger, recorder (B1)

**Files:**
- Create: `backend/app/services/legal/__init__.py`, `registry.py`, `consent.py`, `documents/terms_of_service.md`, `documents/privacy_policy.md`, `documents/pan_disclaimer.md`
- Create: `backend/app/models/consent.py`. Register it in `backend/app/models/__init__.py` like the others.
- Create: `backend/app/db/consent_trigger_sql.py`, `backend/alembic/versions/0022_consent_records.py`
- Create: `backend/app/api/legal.py`. Include its router in `backend/app/main.py` the same way the others are.
- Modify: `backend/app/config.py` (`consent_ip_hmac_key: str = ""`), `backend/tests/conftest.py` (autouse test key, like `_default_test_pan_keys`)
- Test: create `backend/tests/services/legal/__init__.py`, `test_registry.py`, `test_consent.py`, `backend/tests/api/test_legal_routes.py`, `backend/tests/functional_postgres/test_consent_trigger_postgres.py`. Also run `tests/test_migrations.py`.

**Interfaces (later tasks depend on these exact names):**

```python
# app/models/enums.py (add)
class ConsentDocumentType(str, enum.Enum):
    TERMS_OF_SERVICE = "terms_of_service"
    PRIVACY_POLICY = "privacy_policy"
    PAN_DISCLAIMER = "pan_disclaimer"

class ConsentAction(str, enum.Enum):
    GIVEN = "given"
    WITHDRAWN = "withdrawn"

class ConsentPurpose(str, enum.Enum):
    SERVICE_AGREEMENT = "service_agreement"
    ACCOUNT_AND_AUTHENTICATION = "account_and_authentication"
    PORTFOLIO_TRACKING_ANALYTICS = "portfolio_tracking_analytics"
    CAS_PAN_PROCESSING = "cas_pan_processing"

# app/services/legal/registry.py
@dataclass(frozen=True)
class LegalDocument:
    document_type: ConsentDocumentType
    version: str
    title: str
    purposes: tuple[ConsentPurpose, ...]
    content: str        # markdown text served to users
    sha256: str         # hex digest of content.encode("utf-8")

def current_documents() -> dict[ConsentDocumentType, LegalDocument]: ...
def current_document(t: ConsentDocumentType) -> LegalDocument: ...

# app/services/legal/consent.py
class AcceptedDocument(BaseModel):
    document_type: ConsentDocumentType
    document_version: str

class ConsentRequiredError(Exception):
    code = "consent_required"
    def __init__(self, missing: list[str]): ...   # .missing, .message

@dataclass(frozen=True)
class ConsentEvidence:
    ip_truncated: str | None
    ip_hmac: str | None
    user_agent: str | None
    device_id: str | None

def evidence_from_request(request: Request) -> ConsentEvidence: ...
def truncate_ip(ip: str | None) -> str | None: ...
def ip_hmac(ip: str | None) -> str | None: ...
def validate_accepted(accepted: list[AcceptedDocument] | None,
                      required: tuple[ConsentDocumentType, ...]) -> list[LegalDocument]:
    """Every required type present at its CURRENT version; else ConsentRequiredError(missing types)."""
def record_consent(db: Session, *, user_id: uuid.UUID, documents: list[LegalDocument],
                   action: ConsentAction, surface: str, evidence: ConsentEvidence,
                   recorded_at: datetime | None = None,
                   related_import_id: uuid.UUID | None = None,
                   related_file_sha256: str | None = None) -> list[ConsentRecord]:
    """Adds one row per (document, purpose). Never commits."""
def latest_state(db: Session, user_id: uuid.UUID) -> dict[ConsentPurpose, ConsentRecord]: ...
def outdated_documents(db: Session, user_id: uuid.UUID,
                       types: tuple[ConsentDocumentType, ...]) -> list[ConsentDocumentType]:
    """Types whose latest GIVEN row (per purpose) isn't the current version, or has none."""

SIGNUP_DOCUMENTS = (ConsentDocumentType.TERMS_OF_SERVICE, ConsentDocumentType.PRIVACY_POLICY)
UPLOAD_DOCUMENTS = (ConsentDocumentType.PAN_DISCLAIMER,)
```

**Routes**
- `GET /legal/documents` is public. It returns `[{document_type, version, title, sha256, content, purposes: [..]}]`.

**Table `consent_records`** (no FKs on purpose):

| Column | Definition |
|---|---|
| `id` | Uuid PK |
| `user_id` | Uuid NOT NULL, indexed |
| `action` | enum NOT NULL |
| `purpose_code` | enum NOT NULL |
| `document_type` | enum NOT NULL |
| `document_version` | String NOT NULL |
| `document_sha256` | String(64) NOT NULL |
| `recorded_at` | timestamptz NOT NULL |
| `surface` | String NOT NULL |
| `ip_truncated` | String NULL |
| `ip_hmac` | String(64) NULL |
| `user_agent` | Text NULL |
| `device_id` | String NULL |
| `related_import_id` | Uuid NULL |
| `related_file_sha256` | String(64) NULL |

Index `(user_id, purpose_code, recorded_at)`.

- [ ] **Step 1: Write the documents and the registry.** Each `documents/*.md` has a `# <Title>` line, then this placeholder body (for the disclaimer, the draft text from the spec's B2 follows the note):

```markdown
> This document is being finalised with our lawyers. The final text will replace this placeholder, and you’ll be asked to agree to it again.
```

`pan_disclaimer.md` keeps the draft wording verbatim as its body: "I confirm I’m authorised to share this statement, including the PAN and holdings of any family members in it. Unifolio stores PANs encrypted and never shows them in full, keeps the CAS file encrypted for 30 days for dispute resolution, and only reads your data. It can never buy, sell or move anything."

`registry.py` reads the files at import time with `Path(__file__).parent / "documents"`, computes `hashlib.sha256(content.encode()).hexdigest()`, and maps:
- `terms_of_service`: `tos-placeholder-2026-10-01`, "Terms & Conditions", `(SERVICE_AGREEMENT,)`
- `privacy_policy`: `privacy-placeholder-2026-10-01`, "Privacy Policy", `(ACCOUNT_AND_AUTHENTICATION, PORTFOLIO_TRACKING_ANALYTICS)`
- `pan_disclaimer`: `pan-disclaimer-placeholder-2026-10-01`, "PAN disclaimer", `(CAS_PAN_PROCESSING,)`

Add a comment saying that swapping in lawyer-approved text means replacing the file and bumping the version string, nothing else.

- [ ] **Step 2: Write the failing tests**

`tests/services/legal/test_registry.py`:

```python
import hashlib
from app.models.enums import ConsentDocumentType as T, ConsentPurpose as P
from app.services.legal.registry import current_document, current_documents


def test_three_documents_with_hashes_of_their_content():
    docs = current_documents()
    assert set(docs) == {T.TERMS_OF_SERVICE, T.PRIVACY_POLICY, T.PAN_DISCLAIMER}
    for d in docs.values():
        assert d.sha256 == hashlib.sha256(d.content.encode("utf-8")).hexdigest()
        assert d.version and d.content.strip()


def test_privacy_covers_two_purposes():
    assert current_document(T.PRIVACY_POLICY).purposes == (P.ACCOUNT_AND_AUTHENTICATION, P.PORTFOLIO_TRACKING_ANALYTICS)
```

`tests/services/legal/test_consent.py` (uses `db_session`):

```python
import uuid
import pytest
from sqlalchemy import text
from sqlalchemy.exc import DatabaseError

from app.models.consent import ConsentRecord
from app.models.enums import ConsentAction as A, ConsentDocumentType as T, ConsentPurpose as P
from app.services.legal.consent import (
    AcceptedDocument, ConsentEvidence, ConsentRequiredError, SIGNUP_DOCUMENTS,
    ip_hmac, outdated_documents, record_consent, truncate_ip, validate_accepted,
)
from app.services.legal.registry import current_document

EV = ConsentEvidence(ip_truncated="203.0.113.0", ip_hmac="x" * 64, user_agent="ua", device_id="dev")


def _accepted(*types):
    return [AcceptedDocument(document_type=t, document_version=current_document(t).version) for t in types]


def test_truncate_ip():
    assert truncate_ip("203.0.113.77") == "203.0.113.0"
    assert truncate_ip("2001:db8:abcd:12:1:2:3:4") == "2001:db8:abcd::"
    assert truncate_ip(None) is None and truncate_ip("not-an-ip") is None


def test_ip_hmac_is_keyed_and_stable():
    assert ip_hmac("203.0.113.77") == ip_hmac("203.0.113.77")
    assert ip_hmac("203.0.113.77") != ip_hmac("203.0.113.78")
    assert "203.0.113.77" not in ip_hmac("203.0.113.77")


def test_validate_accepted_requires_current_versions():
    docs = validate_accepted(_accepted(*SIGNUP_DOCUMENTS), SIGNUP_DOCUMENTS)
    assert [d.document_type for d in docs] == list(SIGNUP_DOCUMENTS)
    with pytest.raises(ConsentRequiredError) as e:
        validate_accepted(_accepted(T.TERMS_OF_SERVICE), SIGNUP_DOCUMENTS)
    assert e.value.missing == ["privacy_policy"]
    stale = [AcceptedDocument(document_type=T.TERMS_OF_SERVICE, document_version="old"), *_accepted(T.PRIVACY_POLICY)]
    with pytest.raises(ConsentRequiredError):
        validate_accepted(stale, SIGNUP_DOCUMENTS)
    with pytest.raises(ConsentRequiredError):
        validate_accepted(None, SIGNUP_DOCUMENTS)


def test_record_consent_writes_one_row_per_purpose(db_session):
    uid = uuid.uuid4()
    rows = record_consent(db_session, user_id=uid, documents=validate_accepted(_accepted(*SIGNUP_DOCUMENTS), SIGNUP_DOCUMENTS),
                          action=A.GIVEN, surface="signup_phone", evidence=EV)
    db_session.commit()
    assert sorted(r.purpose_code.value for r in rows) == ["account_and_authentication", "portfolio_tracking_analytics", "service_agreement"]
    assert all(r.document_sha256 == current_document(r.document_type).sha256 for r in rows)
    assert outdated_documents(db_session, uid, SIGNUP_DOCUMENTS) == []


def test_outdated_when_missing_or_withdrawn(db_session):
    uid = uuid.uuid4()
    assert outdated_documents(db_session, uid, SIGNUP_DOCUMENTS) == list(SIGNUP_DOCUMENTS)
    docs = validate_accepted(_accepted(*SIGNUP_DOCUMENTS), SIGNUP_DOCUMENTS)
    record_consent(db_session, user_id=uid, documents=docs, action=A.GIVEN, surface="signup_phone", evidence=EV)
    db_session.commit()
    record_consent(db_session, user_id=uid, documents=docs, action=A.WITHDRAWN, surface="account_deletion", evidence=EV)
    db_session.commit()
    assert outdated_documents(db_session, uid, SIGNUP_DOCUMENTS) == list(SIGNUP_DOCUMENTS)


def test_rows_cannot_be_updated_or_deleted(db_session):
    uid = uuid.uuid4()
    record_consent(db_session, user_id=uid, documents=[current_document(T.PAN_DISCLAIMER)], action=A.GIVEN,
                   surface="import_upload", evidence=EV)
    db_session.commit()
    with pytest.raises(DatabaseError):
        db_session.execute(text("UPDATE consent_records SET surface = 'x'")); db_session.commit()
    db_session.rollback()
    with pytest.raises(DatabaseError):
        db_session.execute(text("DELETE FROM consent_records")); db_session.commit()
    db_session.rollback()
    assert db_session.query(ConsentRecord).count() == 1
```

`tests/api/test_legal_routes.py`:

```python
def test_legal_documents_are_public_and_complete(client):
    r = client.get("/legal/documents")
    assert r.status_code == 200
    body = {d["document_type"]: d for d in r.json()}
    assert set(body) == {"terms_of_service", "privacy_policy", "pan_disclaimer"}
    assert body["privacy_policy"]["purposes"] == ["account_and_authentication", "portfolio_tracking_analytics"]
    assert len(body["terms_of_service"]["sha256"]) == 64
```

`tests/functional_postgres/test_consent_trigger_postgres.py`: mirror `test_member_detection_postgres.py`'s setup (skip without `TEST_DATABASE_URL`). Insert one row through `record_consent`, then assert that raw `UPDATE` and `DELETE` raise with `consent_records_append_only` in the message.

- [ ] **Step 3: Run, expect FAIL**: `cd backend && python3 -m pytest tests/services/legal tests/api/test_legal_routes.py -q`

- [ ] **Step 4: Implement**
  - **Enums:** add them to `app/models/enums.py`.
  - **`app/db/consent_trigger_sql.py`:** follow `member_trigger_sql.py` exactly (re-runnable Postgres strings, no `%`).

```python
SQLITE_APPEND_ONLY_UPDATE = """
CREATE TRIGGER IF NOT EXISTS trg_consent_no_update BEFORE UPDATE ON consent_records
BEGIN SELECT RAISE(ABORT, 'consent_records_append_only'); END
"""
SQLITE_APPEND_ONLY_DELETE = """
CREATE TRIGGER IF NOT EXISTS trg_consent_no_delete BEFORE DELETE ON consent_records
BEGIN SELECT RAISE(ABORT, 'consent_records_append_only'); END
"""
POSTGRES_APPEND_ONLY_FN = """
CREATE OR REPLACE FUNCTION consent_records_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'consent_records_append_only';
END;
$$ LANGUAGE plpgsql
"""
POSTGRES_APPEND_ONLY_TRIGGER = """
DROP TRIGGER IF EXISTS trg_consent_append_only ON consent_records;
CREATE TRIGGER trg_consent_append_only BEFORE UPDATE OR DELETE ON consent_records
FOR EACH ROW EXECUTE FUNCTION consent_records_append_only()
"""
```

  - **`app/models/consent.py`:** `ConsentRecord(Base)` with the columns above, using `enum_column(...)` for the enums. Wire `event.listen(ConsentRecord.__table__, "after_create", DDL(...).execute_if(dialect=...))` for both dialects, the same way `user.py` wires the member trigger. The docstring explains the deliberate lack of FKs: hard-delete of a user must not try to UPDATE these rows, and per decision Q6 they are kept indefinitely for now.
  - **Migration `0022_consent_records.py`:** `down_revision = "0021"`. `create_table`, the index, and the triggers with frozen copies of the SQL strings (don't import the module, same rule as 0018). Downgrade drops the triggers, the function (Postgres) and the table.
  - **`config.py`:** `consent_ip_hmac_key: str = ""`. `ip_hmac` uses `decode_key(settings.consent_ip_hmac_key, "CONSENT_IP_HMAC_KEY")` from `app.services.import_.crypto`, then `hmac.new(key, ip.encode(), sha256).hexdigest()`.
  - **`conftest.py`:** an autouse fixture setting a fixed base64 32-byte test key, different from the two PAN keys.
  - **Startup check:** if `app/main.py` has a startup fail-fast check for the PAN keys, add `CONSENT_IP_HMAC_KEY` to it in the same way.
  - **`truncate_ip`:** `ipaddress.ip_network(f"{ip}/24" if v4 else f"{ip}/48", strict=False).network_address`, returning `str`. Invalid input returns `None`.
  - **`evidence_from_request`:** use `capture_request_metadata(request)` from `app.services.auth.device_info` for the IP, user agent and device ID, then truncate and hash the IP. Never store the raw IP.
  - **`latest_state` / `outdated_documents`:** query rows for the user ordered by `recorded_at`. For each required type, the type is outdated if any of its purposes has no row, if the latest row for a purpose is `WITHDRAWN`, or if that row's version isn't the current version.
  - **`app/api/legal.py`:** `router = APIRouter(prefix="/legal", tags=["legal"])` with `GET /documents`. Include it in `main.py`.

- [ ] **Step 5: Run**: `cd backend && python3 -m pytest tests/services/legal tests/api/test_legal_routes.py tests/test_migrations.py tests/functional_postgres/test_consent_trigger_postgres.py -q`. PASS (Postgres skipped without `TEST_DATABASE_URL`, and reported as such). Stop.

---

### Task 8: Consent at sign-up (B2)

**Files:**
- Modify: `backend/app/models/auth.py` (`PendingIdentityVerification.consent_snapshot` JSON NULL), plus the column in migration `0022` (amend Task 7's migration: add the column to `pending_identity_verifications` in the same revision)
- Modify: `backend/app/services/auth/identity.py` (`create_pending_verification`, `complete_gated_signup`, `resolve_new_verified_identity`)
- Modify: `backend/app/services/auth/schemas.py` (`SignupEmailBody`, `OtpVerifyBody`, `GoogleAuthBody` gain `accepted_documents: list[AcceptedDocument] | None = None`), `backend/app/api/auth.py`
- Modify: `backend/app/config.py` (`legacy_unflowed_phone_signup: bool = False`), `backend/tests/conftest.py` (autouse sets it `True`)
- Test: `tests/api/test_auth_routes.py`, `tests/api/test_email_otp_routes.py`, `tests/services/auth/test_identity.py`, `tests/models/test_auth_identity_models.py`

**Interfaces:**
- **Consumes:** Task 7's `AcceptedDocument`, `validate_accepted`, `SIGNUP_DOCUMENTS`, `evidence_from_request`, `record_consent`, `ConsentRequiredError`, `ConsentAction`.
- **Pending record:** `consent_snapshot` holds `{"documents": [{"document_type", "document_version"}], "captured_at": iso, "surface": str, "evidence": {ip_truncated, ip_hmac, user_agent, device_id}}`.
- **`create_pending_verification(..., consent_snapshot: dict | None = None)`.**
- **`complete_gated_signup`:** when the pending record is a fresh sign-up (`matched_user_id IS NULL`), it **requires** `pending.consent_snapshot`. It re-validates the versions as current via `validate_accepted`, then calls `record_consent(db, user_id=user.id, documents=…, action=GIVEN, surface=snapshot["surface"], evidence=ConsentEvidence(**snapshot["evidence"]), recorded_at=datetime.fromisoformat(snapshot["captured_at"]))` before its single `db.commit()`. A missing snapshot raises `ConsentRequiredError(["terms_of_service","privacy_policy"])`.
- **Fresh sign-up starting points** must call `validate_accepted(body.accepted_documents, SIGNUP_DOCUMENTS)` and store the snapshot. On failure they return **422** `{"code": "consent_required", "message": "Agree to the Terms & Conditions and Privacy Policy to create your account.", "missing": [...]}`:
  - `POST /auth/signup/email` (surface `signup_email`)
  - `POST /auth/otp/verify` with `flow == "signup"` and no account (surface `signup_phone`)
  - `POST /auth/oauth/google` when `resolution.kind == "phone_required"` (surface `signup_google`)
- **Logins and links** (existing identity, `link_required`, `attach_pending_identity`) ignore `accepted_documents`.
- **The legacy flow-omitted branch of `/auth/otp/verify`** returns 400 `{"code": "flow_required"}` unless `settings.legacy_unflowed_phone_signup` is true. It's off in every deployed environment and on in tests via conftest, because ~16 test files use it to mint sessions.
- **Request metadata:** `signup_email`, `verify_otp_route` and `google_oauth_route` gain a `request: Request` parameter for `evidence_from_request`.

- [ ] **Step 1: Write the failing tests** (`tests/api/test_auth_routes.py`; add a module helper)

```python
from app.services.legal.registry import current_document
from app.models.enums import ConsentDocumentType as T
from app.models.consent import ConsentRecord


def _consent():
    return [{"document_type": t.value, "document_version": current_document(t).version}
            for t in (T.TERMS_OF_SERVICE, T.PRIVACY_POLICY)]


def _phone_first_signup(client, phone, email, consent=True):
    otp = client.post("/auth/otp/request", json={"phone_number": phone, "flow": "signup"}).json()["otp"]
    body = {"phone_number": phone, "otp": otp, "flow": "signup", **({"accepted_documents": _consent()} if consent else {})}
    return client.post("/auth/otp/verify", json=body, headers={"X-Device-Id": "dev-1", "User-Agent": "pytest-UA"})


def test_phone_signup_without_consent_is_422(client):
    r = _phone_first_signup(client, "+919100400001", "a@example.com", consent=False)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "consent_required"


def test_stale_version_is_rejected(client):
    otp = client.post("/auth/otp/request", json={"phone_number": "+919100400002", "flow": "signup"}).json()["otp"]
    bad = [{"document_type": "terms_of_service", "document_version": "old"}, _consent()[1]]
    r = client.post("/auth/otp/verify", json={"phone_number": "+919100400002", "otp": otp, "flow": "signup", "accepted_documents": bad})
    assert r.status_code == 422 and r.json()["detail"]["missing"] == ["terms_of_service"]


def test_phone_first_signup_writes_consent_rows_with_the_account(client):
    phone, email = "+919100400003", "c3@example.com"
    token = _phone_first_signup(client, phone, email).json()["email_required"]["token"]
    eotp = client.post("/auth/email-otp/request", json={"email": email, "pending_token": token}).json()["otp"]
    s = client.post("/auth/email-otp/verify", json={"email": email, "otp": eotp, "pending_token": token}).json()
    db = _db(client)
    rows = db.query(ConsentRecord).filter(ConsentRecord.user_id == uuid.UUID(s["user_id"])).all()
    assert sorted(r.purpose_code.value for r in rows) == ["account_and_authentication", "portfolio_tracking_analytics", "service_agreement"]
    assert {r.surface for r in rows} == {"signup_phone"}
    assert all(r.device_id == "dev-1" and r.user_agent == "pytest-UA" for r in rows)
    assert all(r.ip_truncated is None or r.ip_truncated.endswith(".0") for r in rows)


def test_login_ignores_consent_fields(client):
    phone = "+919100400004"
    _register_phone(client, phone)  # existing helper
    otp = client.post("/auth/otp/request", json={"phone_number": phone, "flow": "login"}).json()["otp"]
    r = client.post("/auth/otp/verify", json={"phone_number": phone, "otp": otp, "flow": "login"})
    assert r.status_code == 200 and r.json()["session_token"]


def test_google_new_account_without_consent_is_422(client, monkeypatch):
    _mock_google_claims(monkeypatch, sub="g-new-1", email="g1@example.com")
    r = client.post("/auth/oauth/google", json={"id_token": "t"})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "consent_required"


def test_google_new_account_with_consent_reaches_phone_gate_and_records_on_completion(client, monkeypatch):
    _mock_google_claims(monkeypatch, sub="g-new-2", email="g2@example.com")
    r = client.post("/auth/oauth/google", json={"id_token": "t", "accepted_documents": _consent()})
    token = r.json()["phone_required"]["token"]
    otp = client.post("/auth/otp/request", json={"phone_number": "+919100400005", "pending_token": token}).json()["otp"]
    s = client.post("/auth/otp/verify", json={"phone_number": "+919100400005", "otp": otp, "pending_token": token}).json()
    db = _db(client)
    assert {r.surface for r in db.query(ConsentRecord).filter(ConsentRecord.user_id == uuid.UUID(s["user_id"]))} == {"signup_google"}


def test_existing_google_login_needs_no_consent(client, monkeypatch):
    # use the file's existing "already linked" setup (test_google_login_for_already_linked_account) and assert 200 without accepted_documents
    ...


def test_legacy_unflowed_signup_is_refused_when_disabled(client, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "legacy_unflowed_phone_signup", False)
    otp = client.post("/auth/otp/request", json={"phone_number": "+919100400006"}).json()["otp"]
    r = client.post("/auth/otp/verify", json={"phone_number": "+919100400006", "otp": otp})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "flow_required"
```

For `test_existing_google_login_needs_no_consent`, write the body by copying the setup lines of `test_google_login_for_already_linked_account` in the same file, so the test is complete. `...` isn't allowed in the final code. Adapt `_mock_google_claims` / `_register_phone` calls to their real signatures in the file.

In `tests/api/test_email_otp_routes.py`: **`test_email_signup_without_consent_is_422`**, and **`test_email_signup_records_consent_on_completion`**, which goes through the email → phone gate path and asserts `surface == "signup_email"`.

In `tests/services/auth/test_identity.py`: **`test_complete_gated_signup_requires_a_consent_snapshot`**, where a pending record with `consent_snapshot=None` raises `ConsentRequiredError` and creates no user. Also fix existing direct `create_pending_verification(...)` + `complete_gated_signup(...)` unit tests by passing a valid snapshot through a small helper in that test file.

- [ ] **Step 2: Run, expect FAIL**: `cd backend && python3 -m pytest tests/api/test_auth_routes.py tests/api/test_email_otp_routes.py tests/services/auth/test_identity.py -q -k "consent or legacy or stale or google_new"`

- [ ] **Step 3: Implement**
  - **Model:** add `consent_snapshot: Mapped[dict | None] = mapped_column(JSON(none_as_null=True).with_variant(JSONB(none_as_null=True), "postgresql"))`, and add the column to the `0022` migration.
  - **A helper in `consent.py`:** `snapshot_for_signup(accepted, surface, evidence) -> dict`. It validates with `validate_accepted(accepted, SIGNUP_DOCUMENTS)` and returns the dict shape above, with `captured_at` set to `datetime.now(timezone.utc).isoformat()`.
  - **A helper in `auth.py`:** `_consent_http(exc: ConsentRequiredError) -> HTTPException(422, {"code": exc.code, "message": exc.message, "missing": exc.missing})`.
  - **Sign-up entry points:**
    - `signup_email`: build the snapshot before `create_pending_verification`, and pass `consent_snapshot=`.
    - `verify_otp_route` `flow == "signup"` branch: the same, before `create_pending_verification`.
    - `google_oauth_route`: `resolve_new_verified_identity` mints the pending token, so add a `consent_snapshot` parameter to it (default `None`) and pass it through to the `phone_required` branch's `create_pending_verification`. In the route, build the snapshot only when `existing is None` and **before** calling `resolve_new_verified_identity`. If the caller sent no `accepted_documents`, call `resolve_new_verified_identity` first. When the result is `phone_required` without a snapshot, raise `_consent_http`, and delete the pending row it created (look it up by hashing the token with the module's `_hash_pending_token`, or add a `discard_pending_verification(db, raw_token)` helper to identity.py) so no orphan is left.
  - **`complete_gated_signup`:** after the matched-user check, `if pending.consent_snapshot is None: raise ConsentRequiredError(["terms_of_service", "privacy_policy"])`. After `db.flush()` of the user, call `record_consent(...)` before the commit. Also re-validate the versions. If they've gone stale, raise `ConsentRequiredError` so the user re-agrees, and add a comment saying this is extremely rare (a 15-minute pending TTL spanning a document deploy).
  - **Route handling:** `email-otp/verify` and `otp/verify` (the phone-gate branch) must catch `ConsentRequiredError` from `complete_gated_signup` and return `_consent_http`.
  - **Legacy branch:** at the start of the legacy block, `if not settings.legacy_unflowed_phone_signup: raise HTTPException(400, {"code": "flow_required", "message": "Update the app and try again."})`. Comment: a deployed client always sends `flow`, and the bypass exists only so test fixtures can mint sessions.
  - **`conftest.py`:** an autouse `monkeypatch.setattr(settings, "legacy_unflowed_phone_signup", True)`.

- [ ] **Step 4: Run**: `cd backend && python3 -m pytest tests/api/test_auth_routes.py tests/api/test_email_otp_routes.py tests/services/auth/test_identity.py tests/models/test_auth_identity_models.py tests/test_migrations.py -q`. PASS. Stop.

---

### Task 9: Consent at upload and CAMS, deletion/reactivation rows, re-consent API, trail script (B3)

**Files:**
- Modify: `backend/app/api/imports.py` (`parse_import`), `backend/app/api/cas_imports.py` (`request_cams_statement`, `CAMSInitiateRequest`)
- Modify: `backend/app/services/auth/account_deletion.py`, `backend/app/api/auth.py` (account-deletion, reactivate, `MeResponse.consent_outdated`)
- Modify: `backend/app/api/legal.py` (`POST /legal/consents`)
- Create: `backend/scripts/consent_trail.py`, `backend/tests/scripts/test_consent_trail.py`
- Test: `tests/api/test_imports_routes.py`, `tests/api/test_cams_request_routes.py`, `tests/api/test_cas_imports_routes.py`, `tests/api/test_account_deletion_routes.py`, `tests/services/auth/test_account_deletion.py`, `tests/functional_postgres/test_cascade_deletes.py`, `tests/api/test_legal_routes.py`, `tests/api/test_auth_routes.py`, `tests/api/import_helpers.py` (helper update)

**Interfaces:**
- **`POST /imports/parse`** gains the form field `pan_disclaimer_version: str = Form(None)`.
  - Missing or not current → 422 `consent_required` (message: "Tick the box to confirm you’re authorised to share this statement.").
  - Otherwise, right after the ownership and file-format checks and **before** `parse_cas_pdf_bytes`, it calls `record_consent(... documents=[pan doc], action=GIVEN, surface=request.headers.get("x-upload-surface") or "import_upload", related_file_sha256=sha256(pdf_bytes))` and then `await commit_off_loop(db)`.
  - Allowed surfaces: `onboarding_upload`, `import_upload`, `mobile_upload`. Anything else falls back to `import_upload`.
- **`CAMSInitiateRequest`** gains `pan_disclaimer_version: str | None = None`, with the same validation. The consent row is written with `surface="cams_request"` and `related_import_id=import_rec.id`, committed with the import. (`record_consent` runs after `initiate_cams_request`, so the import ID is known; if `initiate_cams_request` already committed, commit again.)
- **`schedule_account_deletion(..., evidence: ConsentEvidence | None = None)`** writes `WITHDRAWN` rows for every document type's purposes (surface `account_deletion`) before its commit.
- **`POST /auth/reactivate`** gains body `ReactivateBody { accepted_documents: list[AcceptedDocument] }` and requires `SIGNUP_DOCUMENTS` to be current. It writes `GIVEN` rows (surface `reactivate`) and returns 422 `consent_required` otherwise.
- **`MeResponse.consent_outdated: list[str]`** is `outdated_documents(db, user.id, SIGNUP_DOCUMENTS)`, as values. It's empty for a user with current consent. **Users created before this feature are outdated** (they have no rows), which is intended: re-consent.
- **`POST /legal/consents`** is authenticated (`get_active_user`). The body is `{ accepted_documents: [...] }`. It validates against **the outdated set** (each listed doc must be current), writes `GIVEN` rows with surface `reconsent`, commits, and returns `{ "consent_outdated": [...] }` (expected to be empty).
- **`scripts/consent_trail.py --user <uuid> | --phone <+91…>`** prints one line per row, ordered by time: `recorded_at action document_type document_version purpose surface ip_truncated device_id`. It exposes `trail_rows(db, user_id) -> list[ConsentRecord]`. `--phone` resolves through `users`, so it only works while the account exists; the docstring says so.
- **`hard_delete_expired_accounts`** is unchanged: no FK, rows are kept (Q6).

- [ ] **Step 1: Write the failing tests**

`tests/api/import_helpers.py`: wherever it posts to `/imports/parse`, add `"pan_disclaimer_version": current_document(ConsentDocumentType.PAN_DISCLAIMER).version` to the form data. This keeps every existing parse test green without editing each one.

`tests/api/test_imports_routes.py`:

```python
def test_parse_without_disclaimer_is_422_and_records_nothing(client):
    # use the file's helper to get headers + member id and a fixture PDF; post without pan_disclaimer_version
    ...
```

Write it fully by copying the file's existing parse-test setup (`headers`, member creation, fixture PDF path). Assert 422 `consent_required`, and assert that `ConsentRecord` has no rows for that user. Also add:
- **`test_parse_records_the_disclaimer_before_parsing`**: post with the version and a **wrong password**, so the parse fails with 422 from the parser. Assert one `pan_disclaimer` / `cas_pan_processing` row exists with `related_file_sha256 == sha256(pdf_bytes)`. Consent precedes processing, so it stays even when parsing fails.
- **`test_parse_upload_surface_header`**: `X-Upload-Surface: onboarding_upload` is stored, and `X-Upload-Surface: weird` is stored as `import_upload`.

`tests/api/test_cams_request_routes.py`: **`test_cams_request_needs_disclaimer`** (422 without it), and **`test_cams_request_records_disclaimer_with_import_id`**.

`tests/services/auth/test_account_deletion.py`:

```python
def test_schedule_deletion_writes_withdrawn_rows(db_session):
    # create a user via the file's existing helper, call schedule_account_deletion, then:
    rows = db_session.query(ConsentRecord).filter_by(user_id=user.id).all()
    assert {r.action for r in rows} == {ConsentAction.WITHDRAWN}
    assert {r.purpose_code.value for r in rows} == {"service_agreement", "account_and_authentication", "portfolio_tracking_analytics", "cas_pan_processing"}


def test_hard_delete_keeps_consent_rows(db_session):
    # user with one GIVEN row (record_consent + commit), schedule deletion, then hard_delete_expired_accounts(db_session, now=<after grace>)
    assert db_session.query(User).filter_by(id=uid).first() is None
    assert db_session.query(ConsentRecord).filter_by(user_id=uid).count() >= 1
```

(Write both bodies fully using that file's existing user-creation helper and `DELETION_GRACE_PERIOD`.)

`tests/api/test_account_deletion_routes.py`:
- **`test_reactivate_requires_consent`**: 422 without a body.
- **`test_reactivate_with_consent_writes_given_rows`**: `surface == "reactivate"`. Update the existing reactivate tests to send `{"accepted_documents": _consent()}`.

`tests/api/test_auth_routes.py`: **`test_me_reports_outdated_consent_for_a_legacy_user`**. A user minted by the legacy fixture path (no rows) has `consent_outdated == ["terms_of_service", "privacy_policy"]`. After `POST /legal/consents` with `_consent()`, it's `[]`.

`tests/api/test_legal_routes.py`: **`test_reconsent_requires_auth_and_current_versions`** (401 without a token, 422 with a stale version).

`tests/scripts/test_consent_trail.py`: insert two rows for a user via `record_consent`, and assert that `trail_rows` returns them oldest first.

- [ ] **Step 2: Run, expect FAIL**: `cd backend && python3 -m pytest tests/api/test_imports_routes.py tests/api/test_cams_request_routes.py tests/services/auth/test_account_deletion.py tests/api/test_account_deletion_routes.py tests/api/test_legal_routes.py tests/scripts/test_consent_trail.py -q -k "disclaimer or consent or surface or reactivate or withdrawn or hard_delete or trail"`

- [ ] **Step 3: Implement**
  - In `parse_import`, add `request: Request` to the parameters, plus the new form field.
  - In `account_deletion.py`, the withdrawn rows use `current_documents().values()`. A user may never have consented (legacy), and withdrawal rows are still written. That's harmless and keeps the record uniform; say so in a comment.
  - The `/auth/account-deletion` route passes `evidence_from_request(request)`.
  - The `/auth/reactivate` route validates, records and then calls `reactivate_account`, all committed together. Change `reactivate_account(db, user)` to accept `commit: bool = True`, or record the rows before calling it so its commit covers them.
  - `_me_response` (already given `db` in Task 2) sets `consent_outdated=[t.value for t in outdated_documents(db, user.id, SIGNUP_DOCUMENTS)]`.

- [ ] **Step 4: Run**: `cd backend && python3 -m pytest tests/api/test_imports_routes.py tests/api/test_cas_imports_routes.py tests/api/test_cams_request_routes.py tests/services/auth/test_account_deletion.py tests/api/test_account_deletion_routes.py tests/functional_postgres/test_cascade_deletes.py tests/api/test_legal_routes.py tests/api/test_auth_routes.py tests/scripts/test_consent_trail.py -q`. PASS. Stop.

---

### Task 10: Sign-up consent UI, legal modal, reactivate consent (B4 frontend)

**Files:**
- Create: `frontend/src/features/legal/{api.ts,types.ts,useLegalDocuments.ts,LegalDocumentModal.tsx,ConsentCheckbox.tsx,legal.test.tsx}`
- Modify: `frontend/src/features/auth/{api.ts,Landing.tsx,AuthEntryFlow.tsx}`, `frontend/src/features/profile/PendingDeletionScreen.tsx`, `frontend/src/features/auth/AuthContext.tsx` (the `reactivateAccount` signature)
- Test: `features/legal/legal.test.tsx` (new), `features/auth/AuthEntryFlow.test.tsx`, `features/auth/GoogleButton.test.tsx`, `features/auth/api.test.ts`, `features/profile/PendingDeletionScreen.test.tsx`, `mobile/features/landing/MobileLandingPage.test.tsx`, `App.test.tsx`

**Interfaces:**

```ts
// features/legal/types.ts
export type LegalDocumentType = "terms_of_service" | "privacy_policy" | "pan_disclaimer";
export interface LegalDocument { document_type: LegalDocumentType; version: string; title: string; sha256: string; content: string; purposes: string[] }
export interface AcceptedDocument { document_type: LegalDocumentType; document_version: string }
// features/legal/api.ts
export async function getLegalDocuments(): Promise<LegalDocument[]>   // GET /legal/documents, cached in-module for the page session; refetch(force) clears the cache
export async function submitReconsent(accepted: AcceptedDocument[]): Promise<{ consent_outdated: string[] }>
export function acceptedFor(docs: LegalDocument[], types: LegalDocumentType[]): AcceptedDocument[]
export function isConsentRequired(err: unknown): boolean            // ApiError 422 with payload.code === "consent_required"
// features/legal/useLegalDocuments.ts
export function useLegalDocuments(): { docs: LegalDocument[] | null; error: boolean; refetch: () => Promise<void> }
// ConsentCheckbox
export function ConsentCheckbox(props: { checked: boolean; onChange: (v: boolean) => void; docs: LegalDocument[] | null; types: LegalDocumentType[]; label?: "signup" | "reactivate" }): JSX.Element
// LegalDocumentModal
export function LegalDocumentModal(props: { doc: LegalDocument | null; onClose: () => void }): JSX.Element | null
```

**Changes to auth `api.ts`:**
- `signupEmail(email, accepted?: AcceptedDocument[])`, `verifyOtp(…, flow?, accepted?)` and `verifyGoogleCredential(idToken, pendingToken?, accepted?)` send `accepted_documents` when given.
- All three also send the `X-Device-Id` header.
- `reactivateAccount(accepted: AcceptedDocument[])`.

- [ ] **Step 1: Write the failing tests**

`legal.test.tsx`:
- **ConsentCheckbox:** renders "I agree to the Terms & Conditions and Privacy Policy". The two links are `button`s that open `LegalDocumentModal` with the doc's title and content. Toggling calls `onChange`.
- **LegalDocumentModal:** renders markdown content as plain paragraphs (split on blank lines; no markdown library). It closes on Escape and on the close button.

`AuthEntryFlow.test.tsx` (mock `getLegalDocuments` to return the three placeholder docs):
- **"sign-up Get OTP is disabled until the box is ticked"**.
- **"phone sign-up verify sends accepted documents"**: after ticking, entering a phone and verifying the OTP, `verifyOtp` is called with `accepted` equal to the terms and privacy entries at their versions.
- **"google new account asks for consent then retries"**: in login mode, `verifyGoogleCredential` rejects once with `ApiError(422, {code:"consent_required"})`. The consent box appears with the copy "Create your Unifolio account". Ticking it and pressing Continue calls `verifyGoogleCredential(sameToken, undefined, accepted)`.
- **"stale version refetches"**: a 422 `consent_required` on verify calls `refetch`, unticks the box and shows "Our terms were just updated. Please review and tick the box again."
- **"login mode shows no consent checkbox"**.

`PendingDeletionScreen.test.tsx`: Reactivate is disabled until the box is ticked, then calls `reactivateAccount(accepted)`.

- [ ] **Step 2: Run, expect FAIL**: `cd frontend && npx vitest run src/features/legal/legal.test.tsx src/features/auth/AuthEntryFlow.test.tsx src/features/profile/PendingDeletionScreen.test.tsx`

- [ ] **Step 3: Implement**
  - **`ConsentCheckbox`:**
    - a native `<input type="checkbox" id="consent-signup">` with a `<label htmlFor>`
    - the link buttons are `type="button"` with `onClick` calling `e.preventDefault()` (so the label doesn't toggle) and opening the modal
    - the box is disabled while `docs === null`, and a `docs` load error shows "Couldn’t load our terms. Check your connection and try again." with a retry button
    - styled with the Landing tokens: text `#5C5C5C` / `#A3A3A3`, accent `#22C55E`, 13px
  - **`LegalDocumentModal`:** reuse `PromptDialog` from `features/import/prompts/PromptDialog` (title = `doc.title`, body = content paragraphs, footer = a Close button), with `max-h` scroll on the body.
  - **`Landing.tsx`:** new props `consentChecked`, `onConsentChange`, `legalDocs`. In signup mode, render `ConsentCheckbox` between the phone field and Get OTP, and add `|| !consentChecked` to Get OTP's `disabled`. Login mode is unchanged, apart from the Google consent step below.
  - **`AuthEntryFlow.tsx`:**
    - `const { docs, refetch } = useLegalDocuments();` plus `const [consent, setConsent] = useState(false)`, and `accepted = docs ? acceptedFor(docs, ["terms_of_service","privacy_policy"]) : undefined`.
    - Pass `accepted` to `verifyOtp` when `authMode === "signup"` and no `phoneGateToken`, and to `signupEmail`.
    - Add a `const [googleConsentToken, setGoogleConsentToken] = useState<string | null>(null)`.
    - In `handleGoogleCredential(idToken, acceptedOverride?)`: on `isConsentRequired(err)`, if no override was sent, set `googleConsentToken = idToken` and clear the error. Otherwise call `await refetch()`, `setConsent(false)`, and set the stale-terms error.
    - When `googleConsentToken` is set, render a small panel in place of Landing: heading "Create your Unifolio account", body "It looks like you’re new here.", the `ConsentCheckbox`, a Continue button (disabled until ticked) that calls `handleGoogleCredential(googleConsentToken, accepted)`, and a Back link that clears it.
    - On a phone-verify `consent_required` error, do the same refetch, untick and error.
  - **`PendingDeletionScreen.tsx` + `AuthContext.reactivateAccount(accepted)`:** a checkbox (label "I agree to the Terms & Conditions and Privacy Policy"), with Reactivate disabled until it's ticked.

- [ ] **Step 4: Run**: `cd frontend && npx vitest run src/features/legal/legal.test.tsx src/features/auth/AuthEntryFlow.test.tsx src/features/auth/GoogleButton.test.tsx src/features/auth/api.test.ts src/features/profile/PendingDeletionScreen.test.tsx src/mobile/features/landing/MobileLandingPage.test.tsx src/App.test.tsx && npx tsc -b`. PASS. Stop.

---

### Task 11: PAN disclaimer on upload and CAMS, re-consent gate (B5 frontend)

**Files:**
- Create: `frontend/src/features/legal/{panDisclaimerStore.ts,PanDisclaimer.tsx,ReconsentGate.tsx}`
- Modify: `frontend/src/features/import/{api.ts,UploadForm.tsx,RequestCamsPath.tsx}`, `frontend/src/mobile/features/import/{MobileUploadForm.tsx,MobileRequestCamsView.tsx}`, `frontend/src/features/auth/SoloCasUpload.tsx`, `frontend/src/App.tsx`, `frontend/src/features/auth/types.ts` (`consent_outdated: string[]`)
- Test: `features/import/UploadForm.test.tsx`, `features/import/RequestCamsPath.test.tsx`, `features/import/api.test.ts`, `mobile/features/import/MobileImportView.test.tsx`, `features/auth/SoloCasUpload.test.tsx`, `features/legal/legal.test.tsx`, `App.test.tsx`

**Interfaces:**

```ts
// panDisclaimerStore.ts. Module-level on purpose: the upload passes through
// five layers (form → container → orchestration → useImportFlow → parseImport);
// threading a version through all of them for one form field is more churn
// than a tiny store. The server is the real gate (422 without it).
export type UploadSurface = "onboarding_upload" | "import_upload" | "mobile_upload";
export function setPanDisclaimer(version: string | null, surface?: UploadSurface): void
export function currentPanDisclaimer(): { version: string; surface: UploadSurface } | null
// PanDisclaimer.tsx: checkbox + the disclaimer text from GET /legal/documents (pan_disclaimer content, minus the title line)
export function PanDisclaimer(props: { checked: boolean; onChange: (v: boolean) => void; surface: UploadSurface }): JSX.Element
// ReconsentGate.tsx: wraps authenticated, onboarded content
export function ReconsentGate(props: { children: React.ReactNode }): JSX.Element
```

- **`parseImport`** appends `pan_disclaimer_version` when the store has one, and sends the header `X-Upload-Surface`.
- **`requestCamsStatement(memberId, panDisclaimerVersion: string)`** is passed explicitly, since that path is one layer.
- **`PanDisclaimer`** calls `setPanDisclaimer(version, surface)` when ticked and `setPanDisclaimer(null)` when unticked and on unmount. **It doesn't clear after a submit**, so a retry keeps it.
- **`ReconsentGate`:**
  - when `me.consent_outdated.length > 0`, renders a blocking `PromptDialog` with no close action: title "We’ve updated our Terms", body "Please review and agree to continue using Unifolio.", a `ConsentCheckbox`, and an Agree button (disabled until ticked)
  - Agree calls `submitReconsent(acceptedFor(docs, outdatedTypes))`, then refreshes `me` through `AuthContext` (use its existing refresh function; grep `refresh` / `reloadMe` in `AuthContext.tsx`)
  - otherwise it renders its children

- [ ] **Step 1: Write the failing tests**

`UploadForm.test.tsx`:
- **"upload is disabled until the disclaimer is ticked"**.
- **"ticking sets the store, unticking clears it"**.

`api.test.ts`:
- **"parseImport sends the disclaimer version and surface"**: set the store, then assert that the `FormData` contains `pan_disclaimer_version` and the header `X-Upload-Surface`.
- **"retry keeps disclaimer"**: two consecutive `parseImport` calls both carry it.

`RequestCamsPath.test.tsx`: **"request is disabled until ticked and sends the version"**.

`MobileImportView.test.tsx`: **"mobile upload shows the disclaimer with mobile_upload surface"**.

`SoloCasUpload.test.tsx`: **"onboarding upload uses onboarding_upload"**. `ImportFlow`'s `UploadForm` gets a `surface` prop; `SoloCasUpload` → `ImportFlow` → `UploadForm` passes `surface="onboarding_upload"`.

`App.test.tsx`: **"outdated consent blocks the dashboard until agreed"**.

- [ ] **Step 2: Run, expect FAIL**: `cd frontend && npx vitest run src/features/import/UploadForm.test.tsx src/features/import/api.test.ts src/features/import/RequestCamsPath.test.tsx`

- [ ] **Step 3: Implement**
  - **`UploadForm` and `MobileUploadForm`:** render `<PanDisclaimer surface=…>` above the submit button, and add `|| !disclaimerChecked` to the submit's `disabled`. `UploadForm` gets an optional `surface?: UploadSurface` prop (default `"import_upload"`), which `ImportFlow` / `TwoPathImportContainer` pass through where `SoloCasUpload` renders it. Only add the prop plumbing on the onboarding path.
  - **`RequestCamsPath` and `MobileRequestCamsView`:** a checkbox and disclaimer above the request button, passing the version from `useLegalDocuments()`.
  - **`App.tsx`:** wrap the onboarded, authenticated dashboard branches (desktop and mobile) in `<ReconsentGate>`. Don't wrap onboarding, because brand-new users have just consented.

- [ ] **Step 4: Run**: `cd frontend && npx vitest run src/features/import/UploadForm.test.tsx src/features/import/RequestCamsPath.test.tsx src/features/import/api.test.ts src/mobile/features/import/MobileImportView.test.tsx src/features/auth/SoloCasUpload.test.tsx src/features/legal/legal.test.tsx src/App.test.tsx && npx tsc -b`. PASS. Stop.

---

### Task 12: Profile restructure (E frontend)

**Files:**
- Modify: `frontend/src/features/profile/{ProfileView.tsx,HouseholdMembersSection.tsx,ImportHistorySection.tsx}`
- Create: `frontend/src/features/profile/{TermsSection.tsx,FamilyMemberCard.tsx}`
- Modify: `backend/app/api/legal.py` (add `GET /legal/consents/me` → the latest `GIVEN` row per document type: `[{document_type, document_version, recorded_at}]`), `backend/tests/api/test_legal_routes.py`
- Test: `features/profile/ProfileView.test.tsx`, `HouseholdMembersSection.test.tsx`, `ImportHistorySection.test.tsx`, `PendingDeletionScreen.test.tsx`, `backend/tests/api/test_legal_routes.py`

**Interfaces:**
- **Consumes:** `updateMember` (Task 6), `HouseholdMember` contact fields (Task 5), `getLegalDocuments` / `LegalDocumentModal` (Task 10).
- **Produces `getMyConsents(): Promise<{document_type: LegalDocumentType; document_version: string; recorded_at: string}[]>`** in `features/legal/api.ts`.
- **`ProfileView`** gains section state: `"account" | "family" | "imports" | "terms"`, defaulting to `"account"`. The URL hash is optional; don't add it.

**Layout:**
- **Desktop** (`md:` and up): a two-column grid. The left column is a `nav` (aria-label "Profile sections") with buttons Account Info, Family Members, Import History and Terms of Service, then Logout separated by a top border at the bottom. The active button has `aria-current="page"`. The right column shows only the active section.
- **Below `md`:** the nav becomes a horizontal scrolling row of the same buttons, with Logout last.

**Sections:**
- **Account Info:** the existing name / email (Change) / phone (Change) rows, the theme toggle, then a "Delete account" block that moves the Danger Zone content here unchanged (same `setDeletionStep("survey")` flow and the same red styling).
- **Family Members:** `HouseholdMembersSection` renders one `FamilyMemberCard` per member:
  - Name and PAN read-only (PAN shows `pan_masked ?? "Not on your statement"`), with the caption "from your statement" when `name_from_statement`
  - Relationship / Phone / Email shown with an Edit button that opens `EditMemberDialog` (from Task 6)
  - the self card shows the account phone/email (passed in from `ProfileView` props) read-only, with "Change in Account Info"
  - locked members show "Complete details", which opens the existing `MemberDetailsDialog`
  - the existing "Delete all funds" button stays on each card
- **Import History:** remove `· N transactions` on group rows and `N txns` on member rows. **Keep** the delete-confirmation sentence.
- **Terms of Service:** a list of the three documents. Each shows its title, the "View" button (modal), and "You agreed to version X on D MMM YYYY" from `getMyConsents()`, or "Not agreed yet" (the PAN disclaimer before any upload).

- [ ] **Step 1: Write the failing tests**

`ProfileView.test.tsx`:
- **"shows the five sections and Account Info by default"**.
- **"delete account lives in Account Info"**: the Delete Account button is visible in the default section, and there's no "Danger Zone" heading.
- **"switching to Terms of Service lists the three documents with agreement dates"** (mock `getLegalDocuments` / `getMyConsents`).
- **"logout calls logout"**.

`HouseholdMembersSection.test.tsx`:
- **"member card shows name and PAN read-only and edits relationship/phone/email"**.
- **"self card shows account contact read-only"**.

`ImportHistorySection.test.tsx`:
- **"rows don’t show transaction counts"**: `queryByText(/txns|transactions/)` is null in the list.
- **"delete confirmation still mentions transactions"**.

Backend `test_legal_routes.py`: **`test_my_consents_returns_latest_given_per_document`**.

- [ ] **Step 2: Run, expect FAIL**: `cd frontend && npx vitest run src/features/profile` and `cd backend && python3 -m pytest tests/api/test_legal_routes.py -q -k my_consents`

- [ ] **Step 3: Implement** as specified, reusing the existing classes from `ProfileView` (`rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs sm:p-6`). Use semantic headings: an `h2` per section.

- [ ] **Step 4: Run**: `cd frontend && npx vitest run src/features/profile/ProfileView.test.tsx src/features/profile/HouseholdMembersSection.test.tsx src/features/profile/ImportHistorySection.test.tsx src/features/profile/PendingDeletionScreen.test.tsx && npx tsc -b` and `cd backend && python3 -m pytest tests/api/test_legal_routes.py -q`. PASS. Stop.

---

### Task 13: Docs

**Files:** `database.md`, `backend.md`, `decisions.md`, `DEFERRED_FEATURES.md`, `log.md`, `session.md`, `Docs/superpowers/specs/2026-09-29-cas-member-detection*` (or wherever rules L1/L2/L9/U9 live; grep `L9`), the relevant PRD under `Docs/PRDs/` (grep "privacy screen" / "trust primer"), `Docs/email-otp-postmark-technical-documentation.md` if it mentions the logo.

- [ ] **Step 1: Record what was built.**
  - **`database.md`:** migrations 0021 and 0022, the consent table, the append-only triggers, and the pending `consent_snapshot` column.
  - **`backend.md`:** the new and changed endpoints (`/legal/*`, `PATCH /household-members/{id}`, `/details` unlock-only, `consent_required` / `flow_required` / `field_not_editable` / `name_not_editable` codes, `/me.self_name` / `consent_outdated`, `X-Upload-Surface`) and the new setting `CONSENT_IP_HMAC_KEY`, which **must be added to staging Secrets Manager and the ECS task definition before deploy**.
  - **`decisions.md`:** the Q1–QF decisions with the date.
  - **`DEFERRED_FEATURES.md`:**
    - rename the "Migration 0021 — drop `users.primary_goal`" item to **0023**
    - add "Consent retention job (awaiting lawyer, Q6)"
    - add "Withdraw-consent control (awaiting lawyer, Q11)"
    - add "Replace placeholder legal texts (awaiting lawyer)"
  - **Member-detection spec:** mark L1/L2 (typed PAN at unlock), L3 (detected mismatch), L9 (edit name/PAN) and the popup rename as **superseded 2026-10-01**, without deleting them.
  - **`log.md`:** append a dated entry.
  - **`session.md`:** overwrite "Latest".
- [ ] **Step 2:** Run nothing. Stop.

---

## Final review

After Task 13, one whole-branch review (Opus). It runs every test file listed in Tasks 1–12 once, and no others.
