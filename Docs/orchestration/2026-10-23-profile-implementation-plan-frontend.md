# Profile: frontend implementation plan (draft v1)

> **For the implementing agent:** do not start until the owner says go **and** the shell PR has landed (E2 A); `frontend/src/shell/` does not exist on this branch yet. Test-first, one test file at a time (`npx vitest run <path>` from `frontend/`), no live network, no edits to anything under `frontend/src/features/profile/`, `features/dashboard/` or the mobile tree. The `superpowers:writing-plans` skill is not installed in the session that wrote this; the format is by hand in the same style. Commit nothing unless told.

**Goal:** the redesigned Profile: seven pages plus Settings children, in `frontend/src/features/profile-v2/`, wired by 12 new thin route files plus a changed `profile.route.tsx`.
**Inputs:** spec (`2026-10-23-profile-functionality-backend-spec.md`), layout, design system, reuse-vs-new, TDD and architecture docs of the same date, and the shell contract (`ShellRoute` type).
**Depends on:** shell (`PageLayout`, `AppLink`, `paths`, `useScope` not needed, `renderInShell`); backend plan task 1 (for `created_at`; use mocks until merged).

## Task 0: confirm the shell API (no code)

- [ ] Read `frontend/src/shell/index.ts`, `registry/types.ts` and one existing route file (for example the Profile wrapper `profile.route.tsx`). Write down the real names of `ShellRoute` fields, `PageLayout` props, and how `useAuth()` exposes `logout`, `requestAccountDeletion`, `requestContactChange`, `verifyContactChange`. Where they differ from the docs, follow the code and note it for the owner.
- [ ] Confirm the lucide icon names in the design doc exist (`UserRound`, `Users`, `Link2`, `Settings`, `CreditCard`, `FileText`, `ShieldCheck`, `LogOut`).
- [ ] Open `CompleteProfileDialog`, `DeletePortfolioDialog`, `ImportHistorySection`, `TermsSection`, `LogoutConfirmDialog` and note their exact props (do not edit them).

## Task 1: pure helpers

**Files:** `profile-v2/lib/accessLevel.ts`, `accountType.ts`, `initialsOf.ts` and `profile-v2/profileNav.ts`, with tests beside them.
- [ ] Tests first: `accessLevel({relationship:"self"})` is `"Admin"`, any other relationship `"Member"`; `accountType` of one member is `"Individual"`, two or more `"Family"`, zero `"Individual"`; `initialsOf("Siddharth Surve")` is `"SS"`, one word gives one letter, empty gives `"?"`; `profileNav` has seven items in order (Personal Information, Family Members, Connected Accounts, Settings, Subscription & Billing, Tax Information, Data & Privacy), Settings has four children, every item has a route path.
- [ ] Implement; run those four test files.

## Task 2: (dropped) PAN reveal

Not needed: the PAN is always masked (L49). The number is kept so other references still match.

## Task 3: `ProfileFrame` and `ProfileNav`

**Files:** `ProfileFrame.tsx`, `ProfileNav.tsx`, test.
- [ ] Tests first (`renderInShell`): the title "Profile" renders; seven links; the link matching the URL has `aria-current="page"`; on `/profile/settings/security` the Settings link is current; Logout opens `LogoutConfirmDialog` and calls `logout` only on confirm.
- [ ] Implement with `PageLayout` and `AppLink`; nav items come from `profileNav.ts`.

## Task 4: Personal Information page

**Files:** `InitialsAvatar.tsx`, `PanField.tsx`, `HeaderCard.tsx`, `PersonalInfoCard.tsx`, `ComingSoonBlock.tsx`, `ContactChangeDialog.tsx`, `pages/PersonalInfoPage.tsx`, tests.
- [ ] `PanField` tests: always masked; no button; "Not added" when none; the other-account tag.
- [ ] `ContactChangeDialog` tests (port the scenarios from `ProfileView.test.tsx`: request code then verify; error messages; a late response after close is ignored). Copy behaviour and wording from `ProfileView.tsx` lines 74 to 149 and the contact Modal; do not import from it.
- [ ] `PersonalInfoPage` tests: name, email, phone from the auth context; account type derived; "Financial details are coming." shown; Edit Profile opens `CompleteProfileDialog` for the self member; no date-of-birth, address or photo control exists; "Member since" shows the formatted `created_at`.
- [ ] Implement bottom-up; run each test file as it turns green.

## Task 5: Family page (amended L45, L47)

**Files:** `FamilyStrip.tsx`, `FamilyTable.tsx`, `FamilyRowMenu.tsx`, `AddMemberDialog.tsx`, `pages/FamilyPage.tsx`, tests.
- [ ] Tests first (see the TDD doc, `FamilyPage.test.tsx`): strip labels and the Add statement tile; whom dialog then navigation to `/import?member=<id>`; no members goes straight to import; member cards with masked PAN and Show, relationship, phone, email, Admin or Member pill; the completion chip text and its disappearance at 100% (reuse `ProfileNudge` unchanged, variant compact); Edit profile opens `CompleteProfileDialog`; Delete all funds opens `DeletePortfolioDialog`; no Add Member button; empty state.
- [ ] Implement `FamilyStrip`, `MemberCard`, `AddStatementDialog`; data from `getHouseholdMembers`. Do not build `AddMemberDialog`.

## Task 6: Settings, Coming soon, Subscription

**Files:** `SettingsRows.tsx`, `pages/SettingsPage.tsx`, `pages/ComingSoonPage.tsx` (copy table from spec section 5), `pages/ImportHistoryPage.tsx`, `SubscriptionCard.tsx`, `pages/SubscriptionPage.tsx`, tests.
- [ ] Tests first: Settings shows four rows with the right links; dev link only when `useDevToolsEnabled()` is true; each Coming soon page shows its line and has no control except a back link; Import History page mounts `ImportHistorySection` with `loadImportHistory`, `deleteImport`, `loadMembers` and has a "Settings" back link; Subscription shows "Early access" and Active, and no price, date or billing link.
- [ ] Implement.

## Task 7: Data & Privacy

**Files:** `ConsentList.tsx`, `StoredDataNote.tsx`, `DeleteAccountDialog.tsx`, `pages/DataPrivacyPage.tsx`, tests.
- [ ] Tests first: terms list renders (mock `useLegalDocuments`); consents list from `getMyConsents`, empty state "No consents recorded."; stored-data text present; delete flow: Continue disabled until a reason is chosen, confirm calls `requestAccountDeletion(reason, feedback)`, failure shows the existing message; one block failing does not hide the others.
- [ ] Implement `DeleteAccountDialog` from `ProfileView.tsx` lines 105 to 116 and the deletion Modal (wording unchanged).

## Task 8: route files and registry

**Files:** 12 new files and one changed file in `frontend/src/shell/routes/` (list in the architecture doc section 2), `profile-v2/routes.test.tsx`.
- [ ] Test first: `/profile` redirects to `/profile/personal`; each path renders its page; `/profile/legacy` renders the old `ProfileView` wrapper; `/profile/import-health` still renders; the registry contract test passes (unique ids and paths).
- [ ] Implement: change `profile.route.tsx` to a redirect; add the new files; move the old wrapper to `profile-legacy.route.tsx` with the same props it passes today. **Do not edit the shell's shared files.**

## Task 4b: Financial Details from onboarding (L43, L44)

**Files:** `lib/goalChips.ts`, `lib/investorLabel.ts`, `lib/onboardingOptions.ts`, `components/FinancialDetailsCard.tsx`, `GoalsDialog.tsx`, `InvestorTypeDialog.tsx`, tests.
- [ ] Tests first: `goalChips` and `investorLabel` cases (TDD doc), `GoalsDialog` and `InvestorTypeDialog` cases, and the card with null, two, four and unknown values. Add a test that the code lists in `onboardingOptions.ts` match the `PrimaryGoal` and `InvestorType` unions in `features/auth/types.ts`.
- [ ] Implement; saves use the existing `PATCH /auth/me` helper (find it in `features/auth/api.ts`; add a thin wrapper in `profile-v2/api.ts` if none exists). Block saving an empty goals selection (spec verification item 7).
- [ ] The Personal Information card shows email and mobile only; name and PAN stay in the header.

## Task 9: manual check on staging data (not automated)

- [ ] All seven pages in light and dark; that no full PAN appears in any network response; add a member; change an email; delete an import; delete-account dialog up to the confirm step only.
- [ ] Report to the owner what was and was not checked.

## Task 10: retire the old Profile (L42; needs the owner's explicit go)

**Do not start until the owner has accepted the new Profile on staging and says go.**
- [ ] Search for importers of each candidate: `ProfileView.tsx`, `ProfileView.test.tsx`, `HouseholdMembersSection.tsx` and its test, `FamilyMemberCard.tsx`, and the `profile-legacy` route file (see the reuse-vs-new doc, "Retirement of the old Profile"). Note any importer that is not on the list and ask before touching it.
- [ ] Delete the candidates that have no remaining importer; remove the `/profile/legacy` route from the registry and from the contract proposal; keep every reused component.
- [ ] Run the shell registry test and the new Profile test files, plus the test files of anything that imported a deleted file. Report what was and was not run.

## Done when

Every new test file passes; the shell registry test passes; the old Profile screen and its tests are unchanged and still reachable at `/profile/legacy`; no file under `features/profile/` or `features/dashboard/` was edited (until task 10, which only deletes); no mobile file was touched.
