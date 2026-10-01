# Plan: Consent, onboarding, members popup, Profile restructure, and OTP email

*2026-10-01. This is a plan only. Nothing has been built yet. **All decisions answered 2026-10-01 (see the end).** Each section shows what exists today (with file references), what changes, and the decisions that need your input first. Open questions are marked **Q1…Qn** and collected at the end.*

---

## 0. Summary

| # | Change | Size | Backend? | Migration? |
|---|---|---|---|---|
| A | Remove the privacy screen from onboarding, save the name at the name step, and resume users at their first missing answer | S | Small (`/me` gains `self_name`) | No |
| B | Add T&C and Privacy Policy links to sign-up, add a PAN disclaimer to upload, and **record consent** | **L** | Yes | **Yes, new `consent_records` table** |
| C | Add "all of the above" to the goal question, plus a query script for goals | S | Script only | No |
| D | Remove name editing from the "N people found" popup (now part of H) | XS | See H | No |
| E | Restructure Account/Profile into 5 sections | M–L | Yes (`PATCH` member endpoint) | Yes (2 nullable columns on `household_members`) |
| F | Simplify the OTP email (no green highlight, no logo) | XS | Yes (template) | No |
| H | **App-wide: name and PAN always from the CAS, never editable** (added 2026-10-01) | M | Yes (enforced on the server) | No |

Suggested build order: **F → A → C → H (includes D) → B → E**. The quick wins go first. H goes before E because E's member form depends on it. B is the riskiest, so it gets the full review gate. All decisions are answered, so nothing is blocked.

---

## A. Remove the privacy screen from onboarding

**Today.** `TrustPrimer` (`frontend/src/features/auth/TrustPrimer.tsx`) is the step `"trust_primer"` in `onboardingSteps.ts`. It sits after `q1_name → q2_investing → q3_purpose` and before `cas_upload`. It is wired in `OnboardingFlow.tsx:144-160`. The progress bar counts 5 steps.

> Naming note: your "Question 2 (What brings you to Unifolio)" is `Q3Purpose.tsx` in code. In code, Q1 is the name step and Q2 is investing experience. I'll use the code names below to avoid confusion.

**Changes**
1. Remove `"trust_primer"` from `ONBOARDING_STEPS` and from `getStepIndex`. `cas_upload` becomes index 3, and `totalSteps` goes from 5 to 4 everywhere it's passed.
2. `OnboardingFlow.tsx`: delete the `trust_primer` branch so that `q3_purpose` continues straight to `cas_upload`. Back from `cas_upload` returns to `q3_purpose`.
3. **Resume edge case (important; revised 2026-10-01 from your direction).** Users who stopped on the privacy screen have `users.onboarding_step = "trust_primer"` saved in the DB. Today, `resumeStep()` sends any unknown step back to `q1_name`. **Your rule:** if their answers were saved, send them straight to Upload. If not, send them to the first question whose answer is missing, in the order name → investing → "What brings you".

   **Two things found in the code that this depends on:**
   - **The name is never saved at the name step.** `OnboardingFlow.tsx` keeps it only in browser state (`answers.name`). It first reaches the server at Upload, when `SoloCasUpload.tsx:41` creates the "self" member (falling back to `"Me"`). `MeResponse` has no name field. So applied as-is, the rule would send **every** privacy-screen user back to the name question. It's also an existing bug: anyone who resumes at investing, "What brings you" or Upload loses the name they typed and ends up named "Me".
   - **Investing and "What brings you" can both be skipped.** A skip leaves `investor_type` / `primary_goals` NULL, exactly like an answer that was never given (or whose save failed; `updateMe` is fire-and-forget, `void updateMe(...)`).

   **Plan:**
   - **Save the name when it's entered.** On submit, the name step creates the self member with `createHouseholdMember(name, "self")`, the same call Upload makes today. It's stored with `name_source = user_entered`, which fits QA (a temporary name the CAS later replaces). `SoloCasUpload` already reuses an existing self member, so Upload doesn't create a duplicate. `GET /me` gains a `self_name` field (from the self member, or null) so resume can check it. This also fixes the "Me" bug.
   - **Resume, only for `onboarding_step = "trust_primer"`:**
     1. no self member / name → `q1_name`
     2. else `investor_type` is NULL → `q2_investing`
     3. else `primary_goals` is NULL → `q3_purpose`
     4. else → `cas_upload`
   - **The name check runs on every resume**, not just this one. The name step has no Skip, so a missing name always means it was never saved. Any user found past the name step without a name goes back to it.
   - **The investing/goal checks run only for the old `trust_primer` value, as a one-off.** Every user who reaches that point re-answers at most once, then carries a normal step value. Applying them to every resume would re-ask someone who deliberately skipped, every time they return. **QF** below asks whether that's acceptable.
   - The resume screens should also show saved answers already selected. Today they open blank because `answers` starts from `INITIAL_ANSWERS`, not from `/me`. This is a small fix in the same place.
   - No DB backfill is needed. The rule lives in `resumeStep()` with a comment explaining it, plus tests for each branch.

   **QF (decided: accept it).** A privacy-screen user who **deliberately skipped** investing or "What brings you" will be asked that question again once, because a skip can't be told apart from an answer that wasn't saved. **Recommended: accept it.** It's a one-time re-ask for a small number of users, and they can skip again. The alternative is to start recording skips (e.g. a `skipped_questions` list), which adds a field for a one-off case.
4. Delete `TrustPrimer.tsx`, its test, the `"trust"` illustration variant, and `public/illustrations/mobile_privacy_screen*.png`, but only if nothing else uses them. I'll grep before deleting.
5. The trust messages on that screen ("read-only", "CAS kept encrypted 30 days", "PAN encrypted") don't disappear. They move into the PAN disclaimer on the upload page (B2).

**Q1: resolved (2026-10-01).** The whole screen goes, including the "Account Aggregator framework" line. That line is **not** carried into the PAN disclaimer either, because the code uses CAS PDF upload, not AA.

---

## B. Legal links at sign-up, PAN disclaimer at upload, and a reliable consent record

### B1. T&C and Privacy Policy links on sign-up

**Today.** Sign-up starts in `Landing.tsx` / `AuthEntryFlow.tsx`, which offers three ways in: phone (inline on Landing), email (`EmailEntry.tsx`), and Google (`GoogleButton.tsx`). Accounts are created in **two places** on the backend:
- `backend/app/api/auth.py:338` (phone OTP verify)
- `backend/app/services/auth/identity.py:388` (email-OTP or Google, after the phone gate)

**UI change**
- In sign-up mode only, add a line under the CTA on Landing: **"☐ I agree to the [Terms & Conditions] and [Privacy Policy]"**. The two links open a modal that shows the document.
- The modal shows **placeholder content** for now: a heading, a "This document is being finalised" note, and lorem-style sections. When your lawyers sign off, only the content and its version change. No code change is needed (see B4).
- Login mode shows no checkbox. Existing users already have their own consent record (or get a re-consent prompt, see B6).

**Q2 (decided: unticked checkbox). Checkbox, or "By continuing you agree"?**
- **Recommended: an unticked checkbox** that must be ticked before Continue and Google become active. India's DPDP Act requires consent that is "free, specific, informed, unconditional and unambiguous with a **clear affirmative action**". A ticked box is the stronger evidence if this is ever challenged.
- Alternative: a passive "By continuing, you agree to…" line. It adds less friction but is weaker as proof. Your lawyer should confirm which one they want.

### B2. PAN disclaimer on the upload page

**Upload surfaces that need it (all three):**
- Onboarding upload: `features/auth/SoloCasUpload.tsx`
- Desktop import: `features/import/UploadForm.tsx`
- Mobile import: `mobile/features/import/MobileUploadForm.tsx`

**UI.** Add a short disclaimer block above the upload button with a required checkbox. Draft text, which the lawyer should review:
> ☐ I confirm I'm authorised to share this statement, including the PAN and holdings of any family members in it. Unifolio stores PANs encrypted and never shows them in full, keeps the CAS file encrypted for 30 days for dispute resolution and then deletes it, and only reads your data. It can never buy, sell or move anything.

The "authorised to share family members' data" part matters. A family CAS contains other people's PANs, and today nothing records that the uploader had the right to share them.

**Q3 (decided: every upload).** Should the disclaimer be ticked on **every upload** (recommended: each import gets its own record tied to the PANs it brought in), or **once per account**?

**Q4 (decided: yes).** Does the "Request CAS from CAMS" path (`RequestCamsPath.tsx`) also need the disclaimer? It processes the same PAN data, only by email instead of upload. I recommend yes.

### B3. How consent is stored (the reliable record)

**First, the option that adds no new table.** We could add columns to `users`: `terms_accepted_at`, `terms_version`, `privacy_accepted_at`, `privacy_version`, `pan_disclaimer_accepted_at`. **I recommend against it** for three reasons:
1. Each new document version **overwrites** the previous acceptance. Proving what someone agreed to in March becomes impossible once v2 ships in June.
2. The PAN disclaimer is accepted per upload (if Q3 = every upload), and one column can't hold many events.
3. Proof needs context for each event: IP address, user agent, device, and which screen it happened on. Putting all of that on `users`, three times over, is a poor fit.

None of the existing tables fits either. `otp_requests` holds IP and user agent but is purged after 30 days. `member_history` is about household members.

**Recommended: a new append-only table, `consent_records` (migration 0021).**

*Revised 2026-10-01 after the external review. Of its four points, three are adopted and one (user ID) was already covered. The changes are marked ★, and the reasoning is below the table.*

| Column | Type | Why |
|---|---|---|
| `id` | uuid PK | |
| `user_id` ★ | uuid, **indexed, NOT a foreign key**, never changes | Ties the consent to the account's internal ID, never to a PAN, phone or email. It's deliberately not an FK (see "user ID" below). |
| `action` ★ | enum `given` / `withdrawn` | Withdrawing consent appends a new row. Nothing is ever edited or deleted. |
| `purpose_code` ★ | enum, see "Purpose mapping" below | Ties the consent to a specific stated purpose. |
| `document_type` | enum `terms_of_service` / `privacy_policy` / `pan_disclaimer` | (previously `consent_type`) |
| `document_version` | string, e.g. `tos-2026-10-15` | which version was agreed to |
| `document_sha256` | char(64) | hash of the **exact text served**, which proves the content and not just a label |
| `recorded_at` | timestamptz, **server clock** | the client clock is not trusted |
| `surface` | string: `signup_phone` / `signup_email` / `signup_google` / `onboarding_upload` / `import_upload` / `mobile_upload` / `cams_request` / `reconsent` / `account_deletion` / `reactivate` | where it happened |
| `ip_truncated` ★ | string: IPv4 /24 (`203.0.113.0`), IPv6 /48 | a coarse location for evidence, without the full IP address |
| `ip_hmac` ★ | char(64): HMAC-SHA256(full IP, separate secret key) | Can confirm a specific IP if it's ever presented in a dispute. The raw IP can't be recovered from it. |
| `user_agent`, `device_id` | same shapes as `otp_requests` (0017) | evidence; `device_id` is already a random ID, not personal data |
| `import_id` / `upload_group_id` | nullable uuid (not FKs, for the same reason as `user_id`) | PAN disclaimer only: ties consent to the PANs that upload processed |

**The reviewer's four points**

- **User ID (already covered, one fix).** `user_id` was in the first draft, but as an FK with `ON DELETE SET NULL`. That contradicts the append-only trigger: when the account is hard-deleted, Postgres would try to **update** the consent row to NULL, and the trigger would block the account deletion. So `user_id` becomes a plain indexed uuid with no FK. It never changes, and once the account is deleted it no longer points to anyone. That also lets me drop `subject_phone_hash`. A phone hash is a personal identifier, and the reviewer's own principle (don't keep identifiers you don't need) argues against keeping it. Whether the rows are kept at all after deletion is still Q6.
- **IP address (adopted).** Store only the truncated IP plus the keyed hash, never the raw IP. The secret key is separate from the PAN-hash key and lives in Secrets Manager in the same way. One note: `otp_requests` already stores the **raw** IP (migration 0017, purged at 30 days), and the privacy-policy draft discloses this. Leaving that table as it is falls outside this change. Flagging it in case you want it brought into line later.
- **Action (adopted).** "Current consent" = the latest row for each (user, purpose). Withdrawals are written in these cases:
  - **Scheduling account deletion** writes `withdrawn` for every purpose (`surface = account_deletion`).
  - **Reactivating within the 5-day grace period** writes `given` again (`surface = reactivate`). The reactivate screen shows the same unticked checkbox, so this is a clear affirmative action too.
  - **Q11: deferred (2026-10-01).** No user-facing "withdraw consent" control is built for now. You'll discuss it with the lawyer first. The `action` column and the automatic rows on deletion and reactivation above are still built, because they cost nothing extra and keep the record complete. If you'd rather defer those too, say so.
- **Purpose mapping (adopted, adapted).** The reviewer's examples (`CREDIT_CHECK`) don't apply here. Proposed purposes, defined in the legal registry next to each document version:

  | Document | `purpose_code` | Covers |
  |---|---|---|
  | Terms & Conditions | `service_agreement` | using Unifolio under the terms |
  | Privacy Policy | `account_and_authentication` | phone/email for login, OTP, and account contact |
  | Privacy Policy | `portfolio_tracking_analytics` | processing holdings and transactions to show dashboards and analytics |
  | PAN disclaimer | `cas_pan_processing` | reading PANs from the CAS, assigning funds to family members, preventing the same PAN on two accounts (the PAN lookup hash), and keeping the CAS file 30 days for disputes |

  A document that covers several purposes writes **one row per purpose**, all from the same tick. If a new document version adds or changes a purpose, the version bumps, the old consent no longer counts for that purpose, and B6 re-consent kicks in. **The lawyer should confirm the final purpose list.** It must match the itemised purposes in the privacy policy.

**What makes it hard to tamper with**
- **Append-only, enforced in the database, not only in code.** On Postgres, a trigger rejects `UPDATE` and `DELETE` on `consent_records`. We already use a DB trigger pattern in `app/db/member_trigger_sql`. A newer version adds a new row and never edits an old one.
- **The server stamps everything.** The client sends only `{consent_type, document_version}`. The server checks that the version is the **current** one (it rejects stale or unknown versions), looks up the hash itself, and sets the time, IP and user agent itself.
- **Same transaction as the action.** The consent row is written in the **same DB transaction** that creates the user (both creation points) or starts the import. If the consent write fails, the account or import isn't created, and the reverse also holds. That leaves no window where an account exists without consent.
- **Enforced on the server.** Account creation without valid T&C and Privacy consent returns `422 consent_required`. So does an upload or CAMS request without the PAN disclaimer. Removing the checkbox in the browser therefore doesn't get anyone past the check.
- **Login paths ignore the consent fields.** The frontend can't always tell sign-up from login (an existing phone typed in sign-up mode becomes a login), so it sends the consent fields whenever the box was ticked. The server records them only when it actually creates an account.

**Carrying consent through multi-step sign-up.** Email sign-up and Google sign-up both go through the phone gate before the account exists (`identity.py:388`). Consent is ticked on step 1 and the account is created on the last step. The consent payload is carried in the existing pending-identity state (the same mechanism that already carries the verified email across the phone gate), not re-asked, and written when the user row is created. I'll confirm the exact carrier during implementation.

### B4. Where the documents live (placeholder now, real text later)

- `backend/app/legal/` holds one file per document plus a small registry: `{type, version, file}`. At startup the server computes each SHA-256.
- New public endpoint `GET /legal/documents` returns the current `{type, version, sha256, content}`. The sign-up and Terms of Service modals render from it, so the text a user sees is exactly the text whose hash is stored.
- **Placeholders now:** version `placeholder-2026-10-01`. When the lawyer-approved text arrives, you hand me the files, I drop them in, bump the version, and that's the whole change.
- The current drafts (`Docs/orchestration/terms-and-conditions-draft.md`, `privacy-policy-draft.md`, `legal-scripts-review-notes.md`) are untracked and stay as review drafts. They are **not** served until approved.

### B5. Pulling the evidence

`backend/scripts/consent_trail.py --user <id|phone>` is read-only. It prints every consent row for that user, with document version, hash, time, IP and surface. That is the output you'd hand to a lawyer or auditor.

### B6. Re-consent when documents change

Everyone who signs up on staging before the real documents land will have agreed to **placeholder** text. So the first real-document deploy needs this:
- `GET /me` returns `consent_outdated: ["terms_of_service", …]` when the user's latest accepted version isn't the current one.
- The frontend shows a blocking "We've updated our Terms" modal (tick + Accept), which writes rows with `surface = reconsent`.

**Q5 (decided: yes, build it now).** Should re-consent be built **now, alongside B**? I recommend yes. Otherwise the placeholder-to-real swap ships without a way to re-collect consent.

### B7. Account deletion and consent records

Today `hard_delete_expired_accounts()` (`services/auth/account_deletion.py:55-136`) deletes every row tied to the user. Consent records are evidence you may need **after** someone leaves (for example, a dispute about data processed while they were a user). DPDP's erasure duty, however, pushes toward deleting.

**Q6: decided for now (2026-10-01): never delete.** Consent rows are **not deleted at all** for now: not by account hard-delete and not by any retention job. You'll settle the retention period with the lawyer and tell me.
- `hard_delete_expired_accounts()` leaves `consent_records` untouched. Because `user_id` isn't an FK, deleting the user row doesn't affect them.
- The rows hold no PAN, phone, email or full IP, only the account's internal ID, which points to nothing once the account is gone.
- **No retention or purge job is built.** When the lawyer gives a period, it's a small addition: a scheduled job plus a narrowly scoped trigger bypass for that job only.

---

## C. Goal question: "all of the above" and a query

### C1. The new option

**Today.** `Q3Purpose.tsx` has 4 options and is multi-select. The answer is stored in `users.primary_goals` (JSON list) with a DB check constraint (`ck_users_primary_goals_allowed`: values from the 4 allowed, length 1–4). `primary_goal` is still dual-written until migration 0021 (`DEFERRED_FEATURES.md:120`).

**Recommended: "all of the above" is a UI shortcut, not a fifth stored value.**
- Tapping it ticks all 4. Unticking any one also unticks it. Ticking all 4 by hand lights it up.
- It's saved as the 4 values, so there's **no migration and no change to the check constraint or the dual-write**. "All of the above" in reports simply means "all 4 selected".
- It's styled like the other rows but visually set apart (a divider above it, with an accent check).

Adding a fifth stored value instead (e.g. `everything`) would mean changing the check constraint and the deprecated `primarygoal` enum, and every reader would need to special-case it. That only makes sense if you need to tell "tapped the shortcut" apart from "picked all 4 by hand". **Q7 (decided: no distinction needed).** The wording is **"Why choose? All of it."**

**Wording options (pick one or suggest your own):**
1. **"Why choose? All of it."** with the subtitle *"The full picture, the true returns, the whole family, the fine print."* (recommended)
2. **"The complete edit"** with *"Everything above. We're flattered."*
3. **"All of the above, naturally"** with *"Because a portfolio deserves the full treatment."*

### C2. The goals query (run when needed)

`backend/scripts/report_onboarding_goals.py` is read-only and works on both Postgres (staging/prod) and SQLite (dev). It reports:
- the count and % of users per goal
- the count of users who picked **all four** ("all of the above")
- the count of users who skipped the question (`primary_goals IS NULL`)
- an optional `--from/--to` date filter on `created_at`, and `--csv` for a per-user export of `user_id, created_at, goals`

It follows the existing `backend/scripts/` pattern and runs against staging the same way the other scripts do. It doesn't need an API endpoint, since it's used occasionally and should stay out of the app.

---

## D. Remove name editing from the "N people found" popup

**Today.** `PeopleFoundDialog.tsx` shows a pencil button (lines ~108-116) that turns a person's name into an input.

**Change.** Remove the pencil and the `editing` state for **named** people. Names display read-only.

This is now one part of the app-wide rule in **section H** (names and PANs always come from the CAS). The edge case of people with no readable name on the statement (`needs_name`, rule U9) is decided there as **QB**.

The backend change is covered in H: `confirm_people.py` stops accepting renames for anyone the CAS has named.

---

## E. Account/Profile restructure

**Today** (`features/profile/ProfileView.tsx`, desktop only; mobile has no profile page): Account Info (name, email, phone, theme), Family members (name plus "Delete all funds"), Import History, a Logout button, and a separate Danger Zone with Delete Account.

**New layout.** A left-hand section menu on desktop (stacked sections on narrow screens):

| Section | Contents |
|---|---|
| **Account Info** | The account holder's name, email (Change), phone (Change), appearance toggle, and **Delete Account** moved here (still red-styled, still the 5-day grace flow with the survey) |
| **Family Members** | One editable card per member, see E2 |
| **Import History** | As today, without the transaction counts (E3) |
| **Terms of Service** | Terms & Conditions, Privacy Policy and PAN disclaimer, each opening the same modal as sign-up (from `GET /legal/documents`), plus "You accepted v__ on __" from `consent_records` |
| **Logout** | A menu item at the bottom |

### E2. Family Members: what "editable" means

The fields you listed: phone, email, relationship, PAN, plus name.

*Revised 2026-10-01: your rule is that everything is editable except name and PAN, which always come from the CAS (section H).*

| Field | In schema today? | Plan |
|---|---|---|
| Name | yes (`name`, `name_source`) | **read-only**, shown "as on your statement" |
| PAN | yes (encrypted, unique hash, `pan_source`, `pan_verified_at`) | **read-only**, always masked |
| Relationship | yes (+ `relationship_other_label`) | editable, the same picker as unlock |
| **Phone** | **no** | editable, needs a new column |
| **Email** | **no** | editable, needs a new column |

**Phone and email per member.** The option that adds no new table: add **two nullable columns to `household_members`** (`phone_number`, `email`). That's the same migration as B3 or the next one. No new table is needed. **Q8 (decided: yes, contact info only).** Are these just contact details for your records (no verification, no OTP)? I assume yes. If they're meant for something later (alerts, inviting the member), tell me now, because that changes validation and uniqueness.

**The "self" member.** Their phone and email *are* the account's. On the self card I'd show the account phone and email as read-only, with "change in Account Info", to avoid two sources of truth. **Q9 (decided: yes).**

**New endpoint.** `PATCH /household-members/{id}` accepts **only** `relationship`, `relationship_other_label`, `phone_number` and `email`. If the body contains `name` or `pan`, the server rejects it with `422 field_not_editable`, so the rule holds even if someone calls the API directly. The existing `POST …/details` remains the **unlock** flow for detected locked members, and locked members show "Complete details" here, reusing that flow (changed by section H).

**Q10: resolved (2026-10-01).** PAN is never editable, verified or not. See section H.

The existing "Delete all funds" action stays on each member card.

### E3. Import History: remove transaction counts

In `ImportHistorySection.tsx`, remove the `· N transactions` on group rows (line ~105) and `N txns` on member rows (line ~127). The delete-confirmation text ("This removes N transactions…", line ~167) is not a list display. I'll **keep** it, because it tells the user what's about to be deleted, unless you want it gone too. No backend change is needed (the field can stay in the API).

---

## F. OTP email template

**Today** (`backend/app/services/auth/email_templates.py`): "verification code" uses `.code-pill`, a green background plus green text. There are light and dark logo `<img>` tags at the top.

**Changes**
- `.code-pill`: drop `background`, `padding` and `border-radius`, and keep `color: #15803D` (light) / `#4ADE80` (dark) and `font-weight: 700`.
- Remove both logo `<img>` tags, the `.logo-light` / `.logo-dark` CSS, and the now-unused `logo_light` / `logo_dark` variables.
- Update the template tests, and the email-OTP technical doc if it mentions the logo.

The `/brand/unifolio-logo-*.png` files stay, since the frontend may use them.

---

## H. App-wide rule: name and PAN always come from the CAS

*Added 2026-10-01 from your direction: "the user can edit anything except pan and name, both will be according to the cas (this applies for all detected names and pan numbers throughout the application/account)".*

### H1. Every place a name or PAN can be entered or edited today

| # | Where | What it does today | Change under the rule |
|---|---|---|---|
| 1 | **Onboarding Q1** (`Q1Name.tsx`) | User types their name before any CAS, and it becomes the "self" member's name (`SoloCasUpload.tsx:41`) | see **QA** |
| 2 | **"This statement is in a different name"** (`prompts/NameMismatchDialog.tsx`, `POST /imports/sessions/{id}/resolve-name`) | Shows a **text input** ("Your name as per PAN"), prefilled with the CAS name but editable | Remove the input. It becomes "This statement is in **X**'s name. Is that you?" with **[Yes, that's me]**, which sets the name from the CAS, and **[Upload a different file]**. The endpoint ignores any typed name and uses the statement's. |
| 3 | **"N people found" popup** (`PeopleFoundDialog.tsx` → `confirm_people.py:549` `USER_EDIT` rename) | Pencil to rename any person | Pencil removed (section D). The server stops accepting renames for CAS-named people. |
| 4 | **Unlock a detected member** (`MemberDetailsDialog` / `memberDetailsForm.tsx`, `POST …/details`) | Form has name and PAN fields. Name is editable, and PAN is either typed (checked against the detected PAN) or "the one on the statement" (`use_detected_pan`) | **Relationship dropdown only** (QD). Name and PAN shown read-only from the CAS. **Exception (QC):** a member whose statement has no PAN also gets a PAN field. |
| 5 | **Edit member, dashboard** (`EditMemberDialog.tsx`, rule L9) | Edits name, PAN and relationship of an unlocked member | Relationship only (plus phone/email from E2). It becomes the same form as Profile → Family Members. |
| 6 | **Profile → Family Members** (new, E2) | — | Name and PAN read-only from the start |

The **backend enforces this too**, not just the UI:
- `MemberDetailsRequest` (`services/dashboard/member_details.py:137`) stops accepting `name`. `pan` is accepted **only** when the member has no detected PAN (QC). For any member with a detected PAN, the server uses its stored copy and rejects a typed `pan` with `422 field_not_editable`. `use_detected_pan` becomes the default behaviour, and the flag is removed.
- The `USER_EDIT` rename branch in `member_details.py:252` and `confirm_people.py:549` goes, except for the QB case.
- The new `PATCH` rejects `name` and `pan` (E2).

Renames that come from the CAS itself are kept as they are today: a newer statement spelling a name slightly differently (`CAS_VARIANT`, shown by `NameVariantNotice`) still updates the name, because it is still the CAS.

### H2. Edge cases (all decided 2026-10-01)

**QA (decided: a).** Onboarding Q1 "What's your name?". No CAS exists yet at this step, so the name can only be typed. Options:
- (a) **Recommended.** Keep Q1 as a provisional name used to greet the user. On their first CAS import, the self member's name is **replaced with the CAS name** after the "Is that you?" confirmation in H1 row 2. Until then it's the only name we have.
- (b) Remove Q1 entirely and call the user "there" until the CAS arrives. One step less, but a colder start.

**QB (decided: a). People with no readable name on the statement** (`needs_name`, rule U9: no PAN and no name on some folios). The CAS gives us nothing to use. Options:
- (a) **Recommended.** Allow a **one-time** name entry in the popup (as today), stored with `name_source = user_entered`. It's **replaced automatically** the first time a later statement has a readable name for them. After that it's locked like everyone else.
- (b) No input. Show a generated label such as "Unnamed investor 1 (Axis Bluechip)". This follows the rule strictly, but the label is ugly and permanent until a better CAS shows up.

**QC (decided, with an exception). People with no PAN on the statement** ("PAN not on statement" already exists as a label).
- Everywhere else in the app, their PAN stays empty ("Not on your statement"). No edit field.
- **The one exception is the unlock popup.** For these members only, it shows a PAN field next to the relationship dropdown. The typed PAN goes through the existing checks unchanged: format, `pan_belongs_to_other_member`, cross-account block, and the possible-duplicate flow. It's stored with `pan_source = user_entered`.
- **Once saved, it's read-only** like every other PAN. If a later CAS carries a PAN for this person, the CAS value takes over through the existing import PAN-mismatch flow (`PanMismatchDialog`, which only offers "use the statement's"). It's never silently kept as typed.

**QD (decided: drop typed PAN, relationship dropdown only). Unlock flow, typing the PAN. This reverses an earlier decision.** The CAS member-detection spec and the 2026-09-30 QA fix (commit `1cf9f35`, "improve unlock PAN verification") built unlocking so that the user can **type the PAN** and have it checked against the detected one. There's also a "the one on the statement" shortcut. Under the new rule, the **stored** PAN is always the CAS one either way. Options:
- (a) **Recommended.** Drop typed PAN entry. Unlocking becomes "Confirm details": the PAN is shown masked from the statement, plus a relationship picker. The `detected_pan_mismatch` / `DetectedPanMismatchDialog` paths become unreachable and get removed.
- (b) Keep the typed PAN purely as a **check** ("type the PAN to confirm this is your family member"). It's never stored as typed, and on a match the CAS PAN is used. This keeps the friction the earlier spec deliberately added.

**Decided 2026-10-01:** option (a). The unlock popup becomes the **relationship dropdown only** (plus "Other" label), with name and masked PAN shown read-only from the statement. The exception is the QC case (no PAN on the statement), which adds the PAN field. `DetectedPanMismatchDialog` and the server's `detected_pan_mismatch` branch become unreachable and are removed. A typed PAN can now only exist where there's no detected PAN to mismatch against. The member-detection spec's L1/L2 rules get marked as superseded.

**QE (decided: no migration). Data that already exists.** Some staging members today have `name_source = user_entered` or `pan_source = user_entered` (typed before this rule). Options:
- **Recommended: no migration.** They display read-only immediately, and their next CAS import overwrites them with the CAS values. A typed PAN that differs from the CAS goes through the existing PAN-conflict checks, not a silent overwrite.

### H3. Docs this touches

The CAS member-detection spec (rules L1/L2/L9/U9), `decisions.md` (new rule: name and PAN come from the CAS only), and the members PRD. I'll mark the superseded rules rather than delete them, so the history stays readable.

---

## G. How it will be built and checked

- **Delegation** (per CLAUDE.md, model-orchestration skill): A, C, F, and the E layout / Import History / Terms of Service section are boilerplate, suited to Codex or Sonnet with a handoff doc. **B (consent), H (name/PAN rule, including the QC/QD unlock changes) and E2 (member editing)** are high-risk. I design the interfaces and migration myself, and all three go through the adversarial review gate.
- **Tests:**
  - **A:** the name is saved at the name step (and Upload reuses that member, no duplicate). Resume from `trust_primer` hits each branch (no name → name; no investing → investing; no goals → goal question; all saved → Upload). Resuming anywhere past the name step with no name goes back to it. Saved answers come back pre-selected.
  - **B:** the checkbox gates sign-up (phone, email, Google) and upload (all 3 screens + CAMS). The server rejects missing or stale consent on every account-creation and upload path. The append-only trigger rejects UPDATE/DELETE on Postgres. When either write fails, both roll back. One row is written per purpose. IP is stored only shortened plus the keyed hash. Account hard-delete leaves consent rows untouched (Q6). Deletion and reactivation write `withdrawn` / `given`. Re-consent appears when the version bumps.
  - **C:** the "all of the above" toggle logic, and the goals script on both SQLite and Postgres.
  - **H:** name and PAN edits are rejected (422) by `PATCH`, `…/details`, `resolve-name` and confirm-people, except the QB one-time name. Unlock with a statement PAN takes relationship only. Unlock without a statement PAN accepts a typed PAN through the existing format, duplicate and cross-account checks, after which the PAN is read-only. A later CAS PAN takes over a typed one. CAS spelling variants still update the name.
  - **E:** `PATCH` updates relationship, phone and email. The self card shows the account phone/email read-only. Transaction counts are gone from the Import History list but kept in the delete confirmation.
  - **F:** the email template snapshot has no highlight background and no logo.
- **Test scope: affected tests only (your direction, 2026-10-01).** The full frontend and backend suites are **not** run. Each step runs only the test files for the code it touches, plus any new test files it adds. The implementer and the reviewer both use this list. If a change turns out to touch code outside it, the matching test file is added to that step's run (found with a grep for the changed module), never the whole suite.

  | Step | Backend (`pytest <files>` from `backend/`) | Frontend (`npx vitest run <files>` from `frontend/`) |
  |---|---|---|
  | **F** | `tests/services/auth/test_email_templates.py` | — |
  | **A** | `tests/api/test_auth_routes.py` (`/me` + `self_name`), `tests/services/auth/test_schemas.py` | `features/auth/OnboardingFlow.test.tsx`, `onboardingHistory.test.ts`, `Q1Name.test.tsx`, `SoloCasUpload.test.tsx`, `OnboardingCardStack.test.tsx`, `MobileOnboardingScreen.test.tsx`, `features/auth/api.test.ts` (`TrustPrimer.test.tsx` is deleted) |
  | **C** | `tests/api/test_auth_routes.py` (`primary_goals`), new `tests/scripts/test_report_onboarding_goals.py` | `features/auth/OnboardingFlow.test.tsx`, new `Q3Purpose.test.tsx` |
  | **H** | `tests/api/test_member_details_routes.py`, `tests/services/dashboard/test_member_details.py`, `tests/api/test_imports_people_routes.py`, `tests/services/import_/test_confirm_people.py`, `test_people_resolution.py`, `test_name_match.py`, `test_pan_claims.py`, `tests/api/test_imports_routes.py` (resolve-name), `tests/functional_postgres/test_member_detection_postgres.py` | `features/dashboard/members/members.test.tsx`, `features/import/PeopleFoundDialog.test.tsx`, `features/import/prompts/prompts.test.tsx`, `features/dashboard/MainDashboardFlow.test.tsx` |
  | **B** | `tests/api/test_auth_routes.py` (phone OTP + Google sign-up), `tests/api/test_email_otp_routes.py`, `tests/services/auth/test_identity.py`, `tests/api/test_imports_routes.py` + `test_cas_imports_routes.py` + `test_cams_request_routes.py` (upload/CAMS consent), `tests/api/test_account_deletion_routes.py` + `tests/services/auth/test_account_deletion.py` (consent rows survive, withdrawn/given rows), `tests/test_migrations.py` (new migration only), `tests/functional_postgres/test_cascade_deletes.py`, new `tests/services/legal/` + `tests/api/test_legal_routes.py` + a new Postgres trigger test under `functional_postgres/` | `features/auth/AuthEntryFlow.test.tsx`, `GoogleButton.test.tsx`, `mobile/features/landing/MobileLandingPage.test.tsx`, `features/import/UploadForm.test.tsx`, `SoloCasUpload.test.tsx`, `RequestCamsPath.test.tsx`, `mobile/features/import/MobileImportView.test.tsx`, `features/auth/api.test.ts`, `features/import/api.test.ts`, new legal-modal and re-consent tests |
  | **E** | `tests/api/test_dashboard_routes.py` (new `PATCH` member), `tests/test_migrations.py` (member columns only) | `features/profile/ProfileView.test.tsx`, `HouseholdMembersSection.test.tsx`, `ImportHistorySection.test.tsx`, `PendingDeletionScreen.test.tsx` |

  Within a file, a step may narrow further with `-k` / `-t` while iterating, but the file as a whole is run once before the step is called done. `functional_postgres` tests need the local Postgres container, and they are run only for H and B, where DB constraints and triggers are what's being tested. Type-checking (`tsc --noEmit`) still runs once per frontend step, because it's fast and catches breakage in files no test covers.

- **Migration 0021 numbering clash:** `DEFERRED_FEATURES.md` already reserves "0021" for dropping `users.primary_goal`. Whichever ships first takes 0021 and the other takes the next number. I'll update the deferred note.
- **Docs to update after the build:** `database.md` (consent table, member columns), `backend.md` (new endpoints, `/me.self_name`), `decisions.md` (consent design, "name and PAN come from the CAS" rule, Q6 never-delete for now), the CAS member-detection spec (mark L1/L2/L9/U9 superseded), the relevant PRDs, `DEFERRED_FEATURES.md` (consent retention job and withdraw-consent control, both awaiting the lawyer), `session.md`, and `log.md`.
- **No commits.** You commit manually.

---

## Decisions (all answered 2026-10-01)

| # | Question | Decision |
|---|---|---|
| Q1 | Drop the privacy screen and the "Account Aggregator" line? | **Yes, the whole screen goes** |
| Q2 | Checkbox or "By continuing you agree"? | **Unticked checkbox** (lawyer can still confirm) |
| Q3 | PAN disclaimer every upload or once? | **Every upload** |
| Q4 | Disclaimer on the CAMS-request path too? | **Yes** |
| Q5 | Build re-consent now? | **Yes** |
| Q6 | Keep consent records after account deletion? | **Never delete, for now.** Retention to be set with the lawyer. No purge job built. |
| Q7 | Store "all of the above" as its own value? | **No**, UI shortcut = all 4 |
| Q7b | Wording for "all of the above" | **"Why choose? All of it."** |
| Q8 | Member phone/email: contact info only, unverified? | **Yes** |
| Q9 | Self member shows account phone/email read-only? | **Yes** |
| Q10 | Can PAN be edited? | **Never, and name neither (H)**, except the QC case at unlock |
| Q11 | "Withdraw consent" control? | **Not now.** To be discussed with the lawyer. |
| QA | Onboarding name: provisional, replaced by the CAS name? | **Yes** |
| QB | Unnamed people: one-time name, replaced by the CAS later? | **Yes** |
| QC | No PAN on the statement? | **Stays empty, except a PAN field in the unlock popup for these members only** |
| QD | Unlock flow PAN typing? | **Dropped. Relationship dropdown only.** |
| QE | Existing typed names/PANs: no migration? | **Yes** |
| QF | Privacy-screen users who skipped get re-asked once? | **Yes, accepted** |
| — | Keep the transaction count in the delete-import confirmation (E3)? | **Yes** |

**Interpretation to confirm:** your answer "Q3: do not delete at all for now, we'll discuss with our lawyer" was recorded against **Q6** (consent records after account deletion), since Q3 is about how often the PAN disclaimer is shown. Q3 takes the recommendation (every upload). Tell me if you meant otherwise.

**Still waiting on the lawyer (not blocking the build):** final T&C and Privacy text, the PAN disclaimer wording, the purpose list, the consent retention period (Q6), and the withdraw-consent design (Q11).
