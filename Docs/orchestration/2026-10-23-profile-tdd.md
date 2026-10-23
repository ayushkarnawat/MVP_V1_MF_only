# Profile: test design (TDD, draft v1)

**Status:** draft, 2026-10-23. Planning only. Document 5. Red, then green, then refactor; run only the test files a change touches; no live network (use the existing offline fixtures: `backend/tests/offline_http.py`, vitest mocks).

## 1. Backend

One change only: `GET /auth/me` returns `created_at`. Extend the existing `/auth/me` test with one assertion that `created_at` is present and is an ISO date; the other `/auth/me` assertions must still pass (affected file only). There is no PAN endpoint (L49), so no new route or service tests. No migration test.

## 2. Frontend (vitest, `renderInShell` where routing matters)

New test files beside the new components in `frontend/src/features/profile-v2/`:

| File | Cases |
|---|---|
| `profileNav.test.ts` | seven items in order; every item has a route in the registry; Settings has four children |
| `accessLevel.test.ts` / `accountType.test.ts` | self is Admin, others Member; one member Individual, two or more Family |
| `PanField.test.tsx` | always masked; no button of any kind (nothing to click); "Not added" when none; the other-account tag |
| `ProfileFrame.test.tsx` | title and nav render; active item follows the URL; Settings active on a child page; Logout opens the confirmation and calls `logout` on confirm |
| `PersonalInfoPage.test.tsx` | name, email, phone in the header; the Personal Information card has email and mobile only (no name or PAN row); account type derived; Edit Profile opens `CompleteProfileDialog`; no DOB, address or photo control; Member since shows the formatted `created_at`; Financial Details shows investor type and goals; the Coming soon rows are present and inert |
| `goalChips.test.ts` | null and empty give no chips; known codes in onboarding order whatever the stored order; an unknown code is kept, humanised and flagged; all four codes give a single "All of it" chip; duplicates collapse; `investorLabel` for each code, null and an unknown code |
| `GoalsDialog.test.tsx` | opens with the stored selection; toggling; All of it selects the four codes and toggles back; Save sends `primary_goals` through `PATCH /auth/me` and refreshes; Save is blocked for an empty selection; the investor type dialog likewise |
| `ContactChangeDialog.test.tsx` | request code, then verify; error messages; a closed dialog ignores a late response (the stale-token case from `ProfileView.test.tsx`) |
| `FamilyPage.test.tsx` | strip labels and the Add statement tile; the tile opens the whom dialog and picking a person navigates to `/import?member=<id>`; with no members the tile goes straight to import; member cards show the masked PAN (no Show or Hide), relationship, phone, email and the Admin or Member pill; the completion chip shows below 100% with the right text (60% complete · Finish profile, 80% complete · Add email) and becomes Edit profile at 100%; Edit opens `CompleteProfileDialog`; Delete all funds opens `DeletePortfolioDialog`; Delete member appears above Delete all funds on every card except the Admin's and opens the confirmation, which calls the delete-portfolio request with `remove_member=true`; there is no Add Member button; empty-list state |
| `SettingsPage.test.tsx` | four rows with correct links; dev link only when dev tools are enabled |
| `ComingSoonPage.test.tsx` | each page's line and no interactive control other than the back link |
| `SubscriptionPage.test.tsx` | "Early access", Active badge; no price, date or billing link |
| `DataPrivacyPage.test.tsx` | terms list renders; consents list and its empty state; stored-data text; delete flow: reason required, confirm calls `requestAccountDeletion`, failure message; one block failing does not hide the rest |
| `ImportHistoryPage.test.tsx` | mounts the old section with the same props; back link to Settings |

## 3. Shell contract test

The shell's registry test already fails on duplicate ids or paths and missing files. Profile adds its 12 route files and relies on that test; no new test is needed there beyond confirming the `profile` route redirects to `/profile/personal` and `profile-legacy` renders the old screen (one test in `profile-v2/routes.test.tsx`).

## 4. Not tested here

Existing files `ProfileView.test.tsx`, `HouseholdMembersSection.test.tsx`, `ImportHistorySection.test.tsx` are not changed and need not be re-run unless an old file is edited (none is).

## 5. Checks that are not unit tests

- One manual pass in the browser on staging data: all seven pages in light and dark, add a member, change an email, delete an import.
- Network tab check that no full PAN appears in any response.

## 6. Retirement task (L42)

Before deleting, grep for importers of each file; after deleting, run the shell registry test and the tests of the files that import the deleted ones. The old `ProfileView.test.tsx` and `HouseholdMembersSection.test.tsx` are deleted with their files; nothing else loses coverage because the new pages have their own tests.
