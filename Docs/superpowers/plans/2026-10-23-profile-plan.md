# Profile (redesigned) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans, applied through the Claude–Codex method in "Execution method" below. Steps use checkbox (`- [ ]`) syntax. **Planning only until the owner says "go".** Regenerated 2026-10-23 with `superpowers:writing-plans` from the previous draft of this file and the Profile docs. Depends on the shell (PRs 1 and 2, `2026-10-23-shell-pr1-router-registry-sidebar.md` and `2026-10-23-shell-pr2-scope-wrappers-switch.md`) being merged or stacked: `frontend/src/shell/` does not exist on `feat/leapswitch-staging` today, and this plan adds route files to the shell registry and uses `PageLayout`, `AppLink`, `paths`, `renderInShell`.

**Goal:** Replace the Profile screen with seven pages in the page-31 style (Personal Information, Family Members, Connected Accounts, Settings with four rows, Subscription & Billing, Tax Information, Data & Privacy), shown one at a time under `/profile/...`, keeping the old Profile at a hidden path until the owner accepts the new one, then deleting it. Mutual funds only, desktop only.

**Architecture:** New folder `frontend/src/features/profile-v2/` (pages, components, lib). Twelve new thin route files in `frontend/src/shell/routes/` plus a changed `profile.route.tsx`. Existing parts are reused unchanged (`CompleteProfileDialog`, `DeletePortfolioDialog`, `ImportHistorySection`, `TermsSection`, `LogoutConfirmDialog`, `ProfileNudge`). One backend change: `created_at` on `GET /auth/me`. No table, migration, job or new endpoint.

**Tech Stack:** React 19, Vite 8, Tailwind 3.4, `lucide-react` 0.475.0, react-router 7 (from the shell PR), Vitest + Testing Library; FastAPI, pytest. No new dependency.

**Spec** (all in `Docs/orchestration/`): `2026-10-23-profile-functionality-backend-spec.md` (the master; sections 2 to 7 and 13 to 14 are the latest answers), `2026-10-22-nav-shell-contract-v1.md` (v1.4, the route table), `-profile-layout.md`, `-profile-design-system.md`, `-profile-reuse-vs-new.md`, `-profile-tdd.md`, `-profile-architecture.md`, `-profile-prd.md`, `-profile-flows.md`, `-profile-backend-decisions-proposal.md`; workbook `2026-10-23-profile-planning-decisions-v1.html` (decisions L1 to L62); visual reference `2026-10-23-profile-design-mockups.html`.

**Doc drift the builders must not follow.** Where the older Profile docs disagree with the spec's later answers (L45 to L50, L52, L56, G1), the spec wins: `-profile-tdd.md` row `FamilyPage` still says "masked PAN with Show" (there is no Show, L49); `-profile-layout.md` section 3/5 still mention an Add Member button and a row menu (neither exists, L47); `-profile-architecture.md` section 3 still lists `FamilyTable`, `FamilyRowMenu`, `AddMemberDialog` (not built; the files are `FamilyStrip`, `MemberCard`, `AddStatementDialog`). These were corrected on 23 Oct before this plan was committed; T9 re-checks the docs for any remaining drift.

## Global Constraints

- Test-driven: failing test first, in every task.
- Existing screens are not changed until T10. **Not edited:** `ProfileView`, `HouseholdMembersSection`, `FamilyMemberCard`, `CompleteProfileDialog`, `DeletePortfolioDialog`, `ImportHistorySection`, `TermsSection`, `ProfileNudge`, `LogoutConfirmDialog`, `features/auth/*`, `features/import/*`, `mobile/**`, `tokens.css`, `main.tsx`, `App.tsx`. **Allowed edits to existing files:** `shell/routes/profile.route.tsx` (becomes a redirect); the shell registry test's expected-path list if hard-coded (add only the new paths); `backend/app/services/auth/schemas.py`, `backend/app/api/auth.py`; the one additive line `created_at: string` in `frontend/src/features/auth/types.ts` plus fixtures that build a full `MeResponse` (T1).
- Tokens: the Home/shell scoped palette tokens; no new colour token; light and dark only.
- This work shows no money values.
- Run only affected tests: `cd frontend && npx vitest run <files> 2>&1 | tail -20`; `npx tsc -b`; `npx oxlint <paths>`; backend `cd backend && pytest <file> -q`. No full suite except the final gate. No live network (fake the API calls).
- Mobile branch, auth gates, legal pages unchanged.
- **Never push. Stage explicit paths only. Commit nothing until the owner asks** (repo rule). In this plan "commit" means "Claude stages and proposes the message".
- PAN is only ever read as `pan_masked`. Never log, store or render anything else.
- Money, dates: dates render `DD Mon YYYY` (`Intl.DateTimeFormat("en-GB")`, as in `ImportHistorySection`); "Member since" renders `Mon YYYY`.

## Locked decisions (frozen; full list in the workbook)

1. **Routes (L1, L13, L36, contract v1.4):** `/profile` redirects to `/profile/personal`; pages `personal`, `family`, `connected-accounts` (Coming soon), `settings` (+ `notifications`, `preferences`, `security` Coming soon, `import-history` real), `subscription`, `tax` (Coming soon), `data-privacy`; hidden `/profile/legacy` (old `ProfileView`); `/profile/import-health` unchanged. All `layout: "app"`, `scope: "none"`, `section: null` (only `profile` is a footer item). Left list: seven items, Logout in the footer (existing confirmation).
2. **Personal Information (L14, L18, L19, L43, L44, L46, L49, L52, L56, L57):** header card only on this page: initials avatar, name (`self_name`, falling back to email then phone), email, phone, masked PAN with no Show or Hide, derived account type (one member Individual, two or more Family), member since from `created_at`, Edit Profile = existing `CompleteProfileDialog` on the self member. Personal Information card: email and mobile only, each with the one-time-code change (new `ContactChangeDialog`, behaviour copied from `ProfileView`). Financial Details: investor type and goals from `/auth/me`, edited with the existing `updateMe`; six other rows greyed "Coming soon", no lock icons. Goals: known codes in onboarding order with onboarding titles; null or empty gives "Not answered" with an Add control; unknown codes kept, humanised, dashed chip; all four known codes give one "All of it" chip. An empty goals selection cannot be saved (dialog blocks it, no server change).
3. **Family Members (L6, L23, L38, L45, L47, L50, L51, L54, L62):** strip with Admin / Member labels, Manage Members (scrolls to the list), last tile **Add statement** (asks "for whom", then `openImport(memberId)`; with no members `openImport()`). Member card = today's card restyled: name (caption "from your statement"), Admin / Member pill, masked PAN ("On another Unifolio account" caption on conflict, "Not on your statement" when none), relationship, phone, email ("Not added"), `ProfileNudge` chip below 100% or an Edit profile button at 100%, "Change in Account Info" on self only, then **Delete member** (never on the Admin's card; confirmation; `deleteMemberPortfolio(id, true)`) above **Delete all funds** (existing `DeletePortfolioDialog`). No Add Member anywhere (deferred, `DEFERRED_FEATURES.md`; Q5 closed). Merge only inside Edit's duplicate prompt.
4. **Settings (L25, L32, L37, L53):** four rows (Notifications, Preferences, Security: Coming soon; Import History: existing `ImportHistorySection` unchanged); dev-only "Import health (staging)" link at the foot when `useDevToolsEnabled()`.
5. **Coming soon (L26, L55, L60):** one `ComingSoonPage`; copy from spec section 5; Connected Accounts also lists the six planned account types in muted rows (G5).
6. **Subscription (L4, L27):** "Current plan: Early access", Active badge, one line; no price, date or history.
7. **Data & Privacy (L10, L28):** terms (`TermsSection`), your consents (`getMyConsents`), what we store (fixed text; the lawyer reviews it), Delete account (new `DeleteAccountDialog`, same `requestAccountDeletion`).
8. **Backend (L39, L49, L58):** only `created_at` on `/auth/me`. No PAN endpoint. Delete member for a member with no statements already works (`delete_member_portfolio`; `test_deletion.py`).
9. **Retirement (L42):** T10 deletes the old Profile after acceptance and the owner's explicit go.

## Review Focus

Failure modes the spec implies but a straight reading of the task tests would miss. Each has its test in the named task.

- Deleting a non-self member while the top-bar selector holds that member: the shell scope must not point at a deleted id. (T5, test: after delete, the list reloads and the shell's selected member falls back to the household; confirm the real reset mechanism in P0.)
- Saving goals from the dialog when the stored list contains a code this build does not know: the code must survive the save, not be dropped. (T4)
- A household with no self member yet, or a member list that fails while `/auth/me` succeeds: header still shows name, email, phone; PAN reads "Not available"; account type is hidden, not guessed. (T4)
- A member with a null or very long name, email or phone: card does not break layout and shows "Not added" where empty. (T5)
- Deep link and refresh on a child page (`/profile/settings/security`, `/profile/family`): the frame and the active nav item are correct without prior navigation, and an unknown `/profile/xyz` falls to the shell's not-found, not a blank page. (T3)

Also checked at the gate: nothing on the "not edited" list changed; no full PAN anywhere; new dialogs match old behaviour (stale-request guard, two-step deletion, same error wording); route files match contract v1.4 exactly.

## Phases and order

| Phase | Covers | Ships |
|---|---|---|
| T1 | backend `created_at` on `/auth/me` | tested, additive |
| T2 | pure helpers (`goalChips`, labels, nav constant) | tested logic |
| T3 | `ProfileFrame`, `ProfileNav`, `ComingSoonPage`, 12 route files, redirect, legacy route | tested frame, **new routes live** |
| T4 to T7 | the four page groups | tested pages |
| T8 | route tests, boundary check, manual check | verified |
| T9 | docs, doc-drift fixes, log | closed |
| T10 | retire the old Profile (owner's explicit go) | old code deleted |
| F | final gate | reviewed |

T1 and T2 are independent; T3 needs T2 and the shell; T4 to T7 are independent of each other and need T3; T8 needs T4 to T7; T9 after T8; T10 last and only on the owner's word.

## Execution method (Claude–Codex, `model-orchestration` skill)

**Roles.** Claude is the orchestrator: P0 pre-flight, handoff docs, delegation log, independent verification, the review gate, **all git staging**. Codex (`codex:codex-rescue`, `run_in_background: true`) is the default implementer; it edits and self-checks by inspection, and never touches git (its sandbox cannot write `.git`; the probe below reconfirms this each session). Claude runs every test, `tsc` and `oxlint` because Codex's sandbox does not reliably reach `node_modules`. A genuine Claude subagent is the fallback only under the three conditions in `delegation-rules.md`. **Opus review on the risky runs: R4 (Family: delete paths and the import hand-off), R6 (Data & Privacy: the copied delete-account flow) and the final gate (R10).** The owner pre-approved this on 23 Oct 2026 ("opus for the risky parts"), so Claude does not ask again for these three; each is logged in `delegation-log.md` with that reason. Any other Opus use still needs the three triggers in `escalation-triggers.md` and a fresh ask. The Codex adversarial gate still runs on every run first.

**Runs are the dispatch unit:**

| Run | Tasks | Notes |
|---|---|---|
| R1 | T1 | Codex (small). In parallel with R2: different folders |
| R2 | T2, T3 | Codex; route files and `ProfileNav` are mechanical. Needs P0 names |
| R3 | T4 | Codex; Claude diffs `ContactChangeDialog` behaviour against `ProfileView.tsx` |
| R4 | T5 | Codex implements; Codex adversarial gate, then **Opus review** (pre-approved): delete paths, the selected-member reset, the import hand-off |
| R5 | T6 | Codex |
| R6 | T7 | Codex implements; Codex adversarial gate, then **Opus review** (pre-approved): the copied irreversible delete-account flow against `ProfileView.tsx` |
| R7 | T8 | Claude (manual check on a synthetic household is Claude-led) |
| R8 | T9 | Claude |
| R9 | T10 | Claude (deletions; owner's go required) |
| R10 | F | Claude; whole-branch Codex adversarial review, then **Opus review** (pre-approved) |

R3 to R6 touch separate folders and no shared file, so they may be dispatched as parallel Codex calls in one block if Claude judges the context cost acceptable; otherwise sequentially. Two writers never touch the same file.

**Per-run procedure (no exceptions):**
1. Claude pre-flight: read the run's files, confirm paths, write `Docs/orchestration/profile-r<N>-<slug>-handoff.md` from `handoff-doc-template.md` (Status OPEN; Task; Constraints by reference to this plan's Global Constraints and Locked decisions; Approaches considered and rejected; Open questions). Append one line to `Docs/orchestration/delegation-log.md`.
2. First dispatch of the session only: the three-step probe (write a file, `git add`, `git commit`) from `delegation-rules.md`. Expect the git steps to fail; Claude stages. Do not copy `node_modules` anywhere before the probe passes.
3. Dispatch Codex with the `gpt-5-4-prompting` shape, referencing the handoff doc by path. Wait for the task notification; never poll.
4. Claude verifies independently: `git status`, `git diff --stat`, then the run's affected tests. Intermediate runs: touched files only. The run expected to reach DONE, and any run touching shared code (`features/auth/types.ts`, shell tests): add `tsc` and a broader folder run. If a notification is missing or contradicts the diff, verify by diff and tests, not by the report.
5. Mandatory review gate: `/codex:adversarial-review` dispatched through `codex:codex-rescue` (`run_in_background: true`, `description` set, **never `isolation: "worktree"`**). **Tell the owner up front the result needs a manual relay** (`/codex:status <id>`, `/codex:result <id>`; Claude cannot call them). Sanity-check any verdict against the cited lines. Fixes per "Review-loop fix authorship": Claude fixes directly only when small, files already loaded, and a round-trip would cost more; otherwise a new handoff. A scoped re-review follows a narrow fix. Never auto-apply a finding. Apply the stopping heuristic: low-severity, correctness-safe leftovers needing a bigger primitive are proposed as documented limitations.
6. Claude stages explicit paths; commits only if the owner has asked; sets the handoff to DONE only after the gate; logs the status change.

## P0: Pre-flight (Claude, after "go")

- [ ] Shell PRs 1 and 2 merged or stacked; create `feat/profile` from them. Baseline: `cd frontend && npx tsc -b`; `npx vitest run src/shell`; `cd backend && pytest tests/api/test_member_profile_routes.py -q` all pass. If `frontend/src/shell/` is still absent, stop and tell the owner.
- [ ] Read `frontend/src/shell/registry/types.ts`, the shell's `profile.route.tsx`, `PageLayout`, `AppLink`, `paths`, `useImport`/`openImport`, `renderInShell`, and `useAuth()`. Write down the real field and method names (the plan's `ShellRoute` fields are from contract v1.2/v1.4; the code wins; tell the owner of any difference).
- [ ] Find how the shell's registry test enumerates the contract's URL map (`grep -rn "profile-import-health" frontend/src/shell`); decide whether T3 must edit a hard-coded list.
- [ ] Confirm lucide 0.475.0 exports: `UserRound`, `Users`, `Link2`, `Settings`, `CreditCard`, `FileText`, `ShieldCheck`, `LogOut`, `Bell`, `SlidersHorizontal`, `Lock`, `History`, `FileUp`, `UserMinus`, `Clock`, `Pencil`, `Plus`, `ChevronRight`.
- [ ] Confirm the auth context's refresh-`me` method name, and how the shell resets a selected member that no longer exists (Review Focus item 1).
- [ ] Verification items 3, 4, 8 of the spec section 11: `CompleteProfileDialog` on the self member without `onChangeInAccountInfo`; `ImportHistorySection` standalone; `/import?member=<id>`.

## T1: `created_at` on `/auth/me` (R1)

**Files:** Modify `backend/app/services/auth/schemas.py` (`MeResponse`), `backend/app/api/auth.py` (`_me_response`), `frontend/src/features/auth/types.ts` (`MeResponse`, currently lines 21 to 37). Test: the existing `/auth/me` test file (`grep -rn '"/auth/me"' backend/tests`) or new `backend/tests/api/test_auth_me_created_at.py`.

**Interfaces:**
- Produces: `MeResponse.created_at: datetime` (backend), `created_at: string` (frontend type, ISO 8601). Consumed by `HeaderCard` (T4) through `memberSince()` (T2).

- [ ] **Step 1: failing test** `test_me_includes_created_at`: sign in with the OTP helper used in `test_member_profile_routes.py`, `GET /auth/me`, assert `created_at` is present, parses with `datetime.fromisoformat`, and equals the user's `created_at` from the database. Run: expected `KeyError: 'created_at'`.
- [ ] **Step 2:** add the field and pass `created_at=user.created_at` in `_me_response`.
- [ ] **Step 3:** run the new test plus the test files of every route returning `MeResponse` (account deletion, reactivate, contact-change verify, `PATCH /me`); all pass.
- [ ] **Step 4:** add the frontend type line; fix test fixtures that build a full `MeResponse` (`npx tsc -b` clean).

## T2: Pure helpers (R2)

**Files:** Create `frontend/src/features/profile-v2/lib/{accessLevel,accountType,initialsOf,memberSince,onboardingOptions,goalChips,investorLabel}.ts`, `profileNav.ts`, each with a `.test.ts` beside it.

**Interfaces:**
- Produces:
  - `GOAL_OPTIONS: ReadonlyArray<{ value: PrimaryGoal; title: string; subtitle: string }>` and `INVESTOR_OPTIONS: ReadonlyArray<{ value: InvestorType; title: string; subtitle: string }>`, values and titles copied from `Q3Purpose.tsx` / `Q2Investing.tsx` (onboarding order).
  - `goalChips(codes: readonly string[] | null | undefined): GoalChip[]` with `GoalChip = { label: string; unknown: boolean }`.
  - `mergeGoals(current: readonly string[] | null | undefined, selectedKnown: readonly PrimaryGoal[]): string[]` returns the selection plus any stored unknown codes (used by `GoalsDialog` so unknown codes survive a save).
  - `investorLabel(code: string | null | undefined): string | null`; `accessLevel(relationship: string): "Admin" | "Member"`; `accountType(memberCount: number): "Individual" | "Family"`; `initialsOf(name: string | null | undefined): string`; `memberSince(iso: string | null | undefined): string | null`.
  - `PROFILE_NAV: ReadonlyArray<{ id; label; path; icon; children?: ... }>` seven items in contract order, Settings with four children, every path as in contract v1.4.

- [ ] **Step 1: failing tests** (spec values): `goalChips(null)` and `([])` give `[]`; `["family_management","consolidated_view"]` gives the two titles in onboarding order; all four give exactly one `{label:"All of it"}`; all four plus `"retirement_planning"` give "All of it" and one `unknown: true` chip "Retirement planning"; duplicates collapse. `mergeGoals(["x_y","consolidated_view"], ["family_management"])` equals `["family_management","x_y"]`. `investorLabel("mixed")` is "A mix of both", `null` gives `null`, `"x_y"` gives "X y". `accessLevel("self")` "Admin", anything else "Member". `accountType(1)` and `(0)` "Individual", `(2)` "Family". `initialsOf("Siddharth Surve")` "SS", `"Aditi"` "A", `""` and `null` "?". `memberSince("2025-10-14T09:30:00+05:30")` "Oct 2025"; an invalid string gives `null`. `PROFILE_NAV` order, paths and child count. A test that the four `GOAL_OPTIONS` values equal the `PrimaryGoal` union written out in the test (no `any` casts).
- [ ] **Step 2:** implement. **Step 3:** `npx vitest run src/features/profile-v2/lib`; PASS; `npx tsc -b`.

## T3: Frame, nav, Coming soon, route files (R2)

**Files:** Create `profile-v2/ProfileFrame.tsx`, `profile-v2/ProfileNav.tsx`, `profile-v2/pages/ComingSoonPage.tsx`, `profile-v2/routes.test.tsx` (+ tests beside the others); create route files in `shell/routes/`: `profile-{personal,family,connected-accounts,settings,subscription,tax,data-privacy,legacy}.route.tsx` and `profile-settings-{notifications,preferences,security,import-history}.route.tsx`; modify `shell/routes/profile.route.tsx` (redirect). The old wrapper PR 2 created for `profile` becomes the component `profile-legacy` mounts (not edited).

**Interfaces:**
- Consumes: `PROFILE_NAV` (T2); `LogoutConfirmDialog` (existing); `PageLayout`, `AppLink`, `paths` (shell).
- Produces: `ProfileFrame({ children }): JSX.Element`; `ProfileNav(): JSX.Element`; `ComingSoonPage({ variant: ComingSoonVariant }): JSX.Element` with `ComingSoonVariant = "connected-accounts" | "notifications" | "preferences" | "security" | "tax" | "financial-details"`; default-exported page components `PersonalInfoPage`, `FamilyPage`, `SettingsPage`, `ImportHistoryPage`, `SubscriptionPage`, `DataPrivacyPage` (created here as one-line `return null` placeholders, replaced in T4 to T7). Each route file follows the pattern of `profile-family.route.tsx`: `{ id, path, label, icon, section: null, order: 0, layout: "app", scope: "none", status: "live", title, page: () => import(...) }`, field names as confirmed in P0.

- [ ] **Step 1: failing tests.** `ProfileNav`: seven links in order with contract paths; the matching link has `aria-current="page"`; on `/profile/settings/security` Settings is current; Logout opens `LogoutConfirmDialog` and calls `logout` only on confirm. `ProfileFrame`: title "Profile", subtitle, nav and children inside `PageLayout`. `ComingSoonPage`: each variant renders its spec-section-5 line and a "Coming soon" tag, no control but an optional back link; the `connected-accounts` variant lists six planned account types in muted rows. `routes.test.tsx`: `/profile` redirects to `/profile/personal`; each path renders its page (placeholders mocked with `vi.mock` until their task); `/profile/legacy` renders the old wrapper; `/profile/import-health` still renders; **deep link and refresh**: rendering directly at `/profile/settings/security` and `/profile/family` shows the correct frame and current item with no prior navigation; an unknown `/profile/xyz` is not a blank page; the shell registry contract test passes with the new files.
- [ ] **Step 2:** implement. **Step 3:** `npx vitest run src/features/profile-v2 src/shell`; PASS; `npx tsc -b`; `npx oxlint src/features/profile-v2 src/shell/routes`.

## T4: Personal Information (R3)

**Files:** Create `profile-v2/pages/PersonalInfoPage.tsx` (replace placeholder), `components/{InitialsAvatar,HeaderCard,PersonalInfoCard,FinancialDetailsCard,GoalsDialog,InvestorTypeDialog,ContactChangeDialog,PanField}.tsx` and tests beside each.

**Interfaces:**
- Consumes: `useAuth()` (`me`, `requestContactChange`, `verifyContactChange`, refresh-`me` method per P0); `updateMe(body: UpdateMeBody): Promise<MeResponse>`; `listHouseholdMembers(): Promise<HouseholdMember[]>`; `CompleteProfileDialog` props (`member`, `accountPhone`, `accountEmail`, `onSaved`, `onMerged`, `onClose`, optional `onChangeInAccountInfo`); T2 helpers.
- Produces: `PanField({ panMasked: string | null; conflict?: boolean }): JSX.Element` (reused by T5); `ContactChangeDialog({ channel: "email" | "phone"; onClose(): void; onChanged(): void }): JSX.Element`.

- [ ] **Step 1: failing tests** (fake `useAuth`, `listHouseholdMembers`, `updateMe`). Header: name, email, phone, `PanField` masked ("Not added" when null, "On another Unifolio account" on conflict), **no element named Show or Hide**, derived account type, "Member since Oct 2025" (hidden when `created_at` is missing). No DOB, address or photo control. Member list failing while `/auth/me` succeeds: header still renders, PAN reads "Not available", account type hidden. Edit Profile opens `CompleteProfileDialog` for the self member. Personal Information card has exactly email and mobile rows (assert no "Full name", no "PAN number"). `ContactChangeDialog`: request code, verify, the error messages, and a late response after close is ignored (port the scenarios from `ProfileView.test.tsx`; behaviour and wording from `ProfileView.tsx` lines 74 to 149 and its contact Modal, not imported). `FinancialDetailsCard`: investor type and goals from `me`, null shows "Not answered", unknown-code chip is dashed, all four show one "All of it", six Coming soon rows with no lock icon. `GoalsDialog`: opens with stored known codes; toggling; "Why choose? All of it." toggles all four; Save calls `updateMe({ primary_goals: mergeGoals(...) })` then refreshes `me`; **a stored unknown code is still in the saved array**; Save disabled for an empty selection. `InvestorTypeDialog`: radio choice saves `updateMe({ investor_type })`.
- [ ] **Step 2:** implement (visual reference: the mockups; tokens only). **Step 3:** run the new test files; PASS; `npx tsc -b`; `npx oxlint src/features/profile-v2`.

## T5: Family Members (R4)

**Files:** Create `profile-v2/pages/FamilyPage.tsx` (replace placeholder), `components/{FamilyStrip,MemberCard,AddStatementDialog,DeleteMemberDialog}.tsx` and tests.

**Interfaces:**
- Consumes: `listHouseholdMembers`, `deleteMemberPortfolio(memberId: string, removeMember: boolean)`, `useImport().openImport(memberId?: string)` (shell; confirm in P0), `ProfileNudge` (compact), `CompleteProfileDialog`, `DeletePortfolioDialog`, `RELATIONSHIP_OPTIONS`, `PanField` (T4), `accessLevel`.
- Produces: `DeleteMemberDialog({ member: HouseholdMember; onClose(): void; onDeleted(): void }): JSX.Element`, never rendered for `relationship === "self"`.

- [ ] **Step 1: failing tests.** Strip: Admin for self, Member for others; Manage Members calls `scrollIntoView` on the list; clicking a strip avatar highlights that card. Add statement: opens the whom dialog listing members; picking one calls `openImport(member.id)`; with no members the tile calls `openImport()`. Cards: name (+ "from your statement" when `name_from_statement`), pill, masked PAN, relationship ("Me" for self), phone, email, "Not added" for empty fields, a null name, and a 120-character name does not overflow the card (truncates). Completion chip: `ProfileNudge` below 100% with the right text, replaced by an Edit profile button at 100%. Edit opens `CompleteProfileDialog`. "Change in Account Info" (self only) navigates to `/profile/personal`. **Delete member** absent on the self card, present above "Delete all funds" on others; confirming calls `deleteMemberPortfolio(id, true)` and reloads the list; **after deleting, the shell's selected member is not the deleted id** (mechanism per P0); a failure shows a message and keeps the card. Delete all funds opens `DeletePortfolioDialog` and calls `deleteMemberPortfolio(id, removeMember)`. No Add Member button. Empty-list state; error state with Retry.
- [ ] **Step 2:** implement; reuse `ProfileNudge` from `features/dashboard/members/ProfileNudge` unchanged. **Step 3:** run the new test files; PASS; `tsc`; `oxlint`.

## T6: Settings, Import History page, Subscription (R5)

**Files:** Create `pages/{SettingsPage,ImportHistoryPage,SubscriptionPage}.tsx` (replace placeholders), `components/{SettingsRows,SubscriptionCard}.tsx` and tests. The three Settings Coming soon children use `ComingSoonPage` from T3.

**Interfaces:**
- Consumes: `ImportHistorySection` with `loadImportHistory={getHouseholdImportHistory}`, `deleteImport={deleteHouseholdImport}`, `loadMembers={listHouseholdMembers}`; `useDevToolsEnabled()`.

- [ ] **Step 1: failing tests.** Four rows with links `/profile/settings/{notifications,preferences,security,import-history}`; the Import health link appears only when `useDevToolsEnabled()` is true and goes to `/profile/import-health`. `ImportHistoryPage` mounts the section with those props and shows a "Settings" back link. Subscription: "Early access", Active badge, one line, and no price, date or billing link.
- [ ] **Step 2:** implement. **Step 3:** run the new test files; PASS; `tsc`; `oxlint`.

## T7: Data & Privacy (R6)

**Files:** Create `pages/DataPrivacyPage.tsx` (replace placeholder), `components/{ConsentList,StoredDataNote,DeleteAccountDialog}.tsx` and tests.

**Interfaces:**
- Consumes: `TermsSection`, `getMyConsents(): Promise<MyConsent[]>`, `useAuth().requestAccountDeletion(reason: AccountDeletionReason, feedback?: string)`.
- Produces: `DeleteAccountDialog({ onClose(): void }): JSX.Element`.

- [ ] **Step 1: failing tests.** Terms block renders (`useLegalDocuments` mocked). Consents list shows document name, version, date; empty state "No consents recorded."; a failing `getMyConsents` shows a block-level Retry and the other blocks still render. Stored-data text present (draft from spec section 7). Delete account: Continue disabled until a reason is chosen; optional note; Confirm calls `requestAccountDeletion(reason, feedback)`; a failure shows "Could not schedule account deletion. Please try again."; wording "permanently deleted in 30 days; you can cancel anytime before then" (behaviour from `ProfileView.tsx` lines 105 to 116 and its deletion Modal).
- [ ] **Step 2:** implement. **Step 3:** run the new test files; PASS; `tsc`; `oxlint`.

## T8: Route tests, boundary and manual check (R7, Claude)

- [ ] Extend `profile-v2/routes.test.tsx` now that no page is a placeholder. Add a boundary test: no file under `profile-v2` imports from `features/profile/ProfileView`, `HouseholdMembersSection` or `FamilyMemberCard`. Add a PAN test: with fixtures whose `pan_masked` is masked, no rendered text matches a 10-character PAN pattern. Grep `profile-v2` for `pan:`, `pan_encrypted`, `decrypt`: none.
- [ ] Manual check, one pass on the dev server, light and dark, synthetic household from `Docs/CAS Files/synthetic/pdfs/realistic/` (password `MF@123`): all seven pages and four Settings children; deep link and refresh on `/profile/family`; masked PAN everywhere and no full PAN in any network response; edit goals and investor type and see them persist; Add statement for a member opens import for that person and Back returns to Family; Delete member on a throwaway non-self member, and the self card has no such button; contact-change dialog up to the code step only; delete-account dialog up to the confirm step only (**do not confirm**); Import History opens and deletes nothing except throwaway data; dev link only with dev tools on; `ProfileNudge` warning colours in dark mode.
- [ ] Record results in the handoff; one fix pass for anything visibly broken.

## T9: Docs and log (R8, Claude)

- [ ] Update the contract change log (v1.4 shipped), `delegation-log.md`, `session.md` top section, `log.md` (append-only). Fix the doc drift listed at the top (TDD, layout, architecture). **Do not** append to `decisions.md` without the owner's go (proposal: `2026-10-23-profile-backend-decisions-proposal.md`). `DEFERRED_FEATURES.md` entries stay as they are.

## T10: Retire the old Profile (R9; the owner's explicit go required)

- [ ] Do not start until the owner has accepted the new Profile on staging and says go.
- [ ] `grep -rn` for importers of each candidate: `features/profile/ProfileView.tsx` and `.test.tsx`, `HouseholdMembersSection.tsx` and `.test.tsx`, `FamilyMemberCard.tsx`, the `profile-legacy` route file and the old wrapper, and `MainDashboardFlow.tsx`'s import if still present. An importer not on this list: stop and ask.
- [ ] Delete candidates with no remaining importer; remove `/profile/legacy` from the registry test's paths; ask before editing the contract. Keep every reused component, `PendingDeletionScreen`, `DeleteImportDialog`, `historyGroups.ts`.
- [ ] `npx vitest run src/shell src/features/profile-v2 src/features/profile`; `npx tsc -b`; report what was and was not run.

## F: Final gate (R10)

- [ ] `cd frontend && npx vitest run src/features/profile-v2 src/shell src/features/profile src/features/auth`; one independent full `npx vitest run` (auth types and shell tests were touched); `npx tsc -b`; `npm run build`; `npx oxlint src`. Backend: the `/auth/me` and household-route test files pass.
- [ ] `git diff --stat <base>...HEAD` shows only allowed files plus the new ones.
- [ ] Whole-branch `/codex:adversarial-review` through `codex:codex-rescue` (manual relay told up front); fix per "Review-loop fix authorship". Then a whole-branch **Opus review** (pre-approved by the owner, 23 Oct 2026); fix per the same rule.
- [ ] The owner's staging acceptance is not part of the build; it precedes T10.

## Open items for the owner

- Lawyer review of the "What we store" text and the Coming soon wording before launch (consent withdrawal, grievance contact, data export stay deferred).
- Manual Add Member, remaining Financial Details fields, Connected Accounts: deferred, `DEFERRED_FEATURES.md`.
- Default taken: unknown stored goal codes are preserved on save (`mergeGoals`). Say if you prefer they be dropped.
- Decided 23 Oct 2026: Opus review on R4, R6 and the final gate, pre-approved. Other runs use the Codex adversarial gate only.
