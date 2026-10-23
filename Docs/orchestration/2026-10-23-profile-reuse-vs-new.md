# Profile: reuse versus new, and how each new piece is built (draft v1)

**Status:** draft, 2026-10-23. Planning only. Document 4. Companion to documents 1 and 3.

## Backend

| Need | Reuse | New | How the new piece is built |
|---|---|---|---|
| Account facts (name, email, phone) | `GET /auth/me` | `created_at` on `MeResponse` (Q2) | one additive field in `services/auth/schemas.py`, filled from `User.created_at` in the route; existing tests must still pass (extra field) |
| Household members | `GET/POST /household-members`, `PUT .../profile`, merge, delete portfolio | none | as is |
| Contact change | `/auth/contact-change/request`, `/verify` | none | as is |
| Account deletion | `/auth/account-deletion`, `/reactivate` | none | as is |
| Consent list | `GET /legal/consents/me`, `GET /legal/documents` | none | as is |
| Import history | existing calls behind `loadImportHistory`, `deleteImport` | none | as is |
| Tables, migrations, jobs | all existing | **none** | no schema change |

## Frontend

All new code goes in a new folder `frontend/src/features/profile-v2/` (the old `features/profile/` is not edited, L5).

| Need | Reuse | New | How built |
|---|---|---|---|
| Routing | shell registry, `PageLayout`, `AppLink`, `paths` | 12 route files in `shell/routes/` (list in the architecture doc) | each a lazy `page` import of one component; `profile.route.tsx` becomes a redirect to `/profile/personal`; the old wrapper moves to `profile-legacy.route.tsx` |
| Frame and nav | `PageLayout` | `ProfileFrame`, `ProfileNav`, `profileNav.ts` | frame renders the title and the nav from the constant; each page component wraps its content in the frame |
| Personal Information | `/auth/me` through `useAuth()` (now also `investor_type`, `primary_goals`), `CompleteProfileDialog`, `PATCH /auth/me` | `HeaderCard`, `PersonalInfoCard` (email and mobile), `FinancialDetailsCard`, `GoalsDialog`, `InvestorTypeDialog`, `goalChips()`, `PanField`, `InitialsAvatar`, `ComingSoonBlock` | plain components; data from `useAuth()` and one `loadMembers` call; no new global state |
| Contact change | `requestContactChange`, `verifyContactChange` from `useAuth()` | `ContactChangeDialog` | copy the states and wording from `ProfileView` (token guarding stale requests included); built on `Modal`; tested separately |
| Family | `HouseholdMember` type, `CompleteProfileDialog` (which carries merge), `DeletePortfolioDialog`, `ProfileNudge` (the completion chip, unchanged) | `FamilyStrip`, `MemberCard`, `AddStatementDialog`, `accessLevel()`, `accountType()` | `MemberCard` repeats the field layout of today's `FamilyMemberCard` in the new style; `HouseholdMembersSection` and `FamilyMemberCard` are **not** reused because they cannot be restyled without editing them (they are deleted at retirement); no Add Member dialog (L47) |
| Settings | `ImportHistorySection`, `useDevToolsEnabled` | `SettingsRows`, `ComingSoonPage` | static rows; Import History page mounts the old section with the same props `ProfileView` gives it |
| Subscription | none | `SubscriptionCard` | static |
| Data & Privacy | `TermsSection`, `getMyConsents`, `LogoutConfirmDialog` | `ConsentList`, `StoredDataNote`, `DeleteAccountDialog` | `DeleteAccountDialog` repeats the survey and confirm steps from `ProfileView` and calls `requestAccountDeletion` |
| Tokens and fonts | Home/shell scoped tokens | none | none |
| Test helper | `renderInShell` | none | none |

## Duplication to accept (and why)

`ContactChangeDialog` and `DeleteAccountDialog` repeat logic that lives inline in `ProfileView`, because extracting it would edit `ProfileView`, which L5 forbids. Both are small. When the legacy screen is retired, nothing else needs changing. Risk: a future fix lands in only one copy; the legacy path is hidden and temporary (A3 B), which limits this.

## Not reused on purpose

`ProfileView` itself (kept at `/profile/legacy`), `HouseholdMembersSection` and `FamilyMemberCard` (old look), the mobile profile (untouched).

## Dependencies

New npm: none. New Python: none. react-router arrives with the shell PR, which this work waits for (E2 A).

## Retirement of the old Profile (L42)

After the new Profile is built and you accept it, a last task deletes the old one. Candidates, each to be confirmed by a search for other importers before deleting: `features/profile/ProfileView.tsx` and `ProfileView.test.tsx`; `HouseholdMembersSection.tsx` and its test; `FamilyMemberCard.tsx`; the `profile-legacy` route file; the old import in `MainDashboardFlow.tsx` (or the shell's wrapper) if it still exists by then. **Kept because the new Profile reuses them:** `CompleteProfileDialog`, `DeletePortfolioDialog`, `ImportHistorySection`, `DeleteImportDialog`, `TermsSection`, `LogoutConfirmDialog`, `historyGroups.ts`, `ProfileNudge`, `PendingDeletionScreen`. The mobile tree does not import `ProfileView` (checked on 23 Oct: only `MainDashboardFlow.tsx` and its own test do). This is the one place the plan edits or deletes existing code, so it needs your explicit go at that time.
