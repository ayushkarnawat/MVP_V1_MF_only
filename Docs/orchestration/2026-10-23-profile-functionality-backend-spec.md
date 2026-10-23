# Profile: functionality and backend spec (draft v1)

**Status:** draft for owner review, 2026-10-23. Planning only; nothing is built. Document 1 of the Profile documents phase.
**Scope:** desktop web, mutual funds only. Mobile untouched. Existing screens untouched (`ProfileView` and its siblings are not edited, L5).
**Inputs:** the planning workbook `2026-10-23-profile-planning-decisions-v1.html` (decisions L1 to L37, cited as L-numbers; cards cited as A1, F7 and so on), the PDF `Web app UI mockups MFs.pdf` page 31 (page 30 is a title slide), shell contract v1.2, and the code as read on 23 Oct 2026.
**Reuse-first rule:** every screen below is built from existing calls. The only backend change is one additive field, `created_at`, on `GET /auth/me`; there is no new endpoint, table or migration.

## 1. Page contract

Profile is **not scoped** (route scope `none`): it shows the signed-in account and its household, whatever the top-bar selector says. Member banners do not appear on Profile (contract section 7, as today).

`/profile` redirects to `/profile/personal` (L13). Each left-list item opens its own page, one at a time (L1). The left list, in order (L36):

| # | Item | Route | Page content |
|---|---|---|---|
| 1 | Personal Information | `/profile/personal` | section 2 |
| 2 | Family Members | `/profile/family` | section 3 |
| 3 | Connected Accounts | `/profile/connected-accounts` | Coming soon (section 5) |
| 4 | Settings | `/profile/settings` | section 4 |
| 5 | Subscription & Billing | `/profile/subscription` | section 5 |
| 6 | Tax Information | `/profile/tax` | Coming soon (section 5) |
| 7 | Data & Privacy | `/profile/data-privacy` | section 7 |
| footer | Logout | none (dialog) | existing `LogoutConfirmDialog` |

Settings children (L32): `/profile/settings/notifications`, `/profile/settings/preferences`, `/profile/settings/security` (Coming soon) and `/profile/settings/import-history` (real). Hidden extras: `/profile/legacy` (the old `ProfileView`, kept reachable, A3 B; not in any menu) and `/profile/import-health` (existing dev screen, unchanged).

## 2. Personal Information (`/profile/personal`)

Two blocks, as on page 31.

**Header card** (L14: shown only on this page):
- Initials avatar (no camera badge, L19). Initials from `self_name`.
- Name: `GET /auth/me` -> `self_name` (falls back to the account's email or phone when null).
- Email and phone: `GET /auth/me` -> `email`, `phone_number`.
- **PAN:** the self member's `pan_masked` from `GET /household-members`, always shown masked (first two and last two characters). There is no Show or Hide and no way to see the full PAN on this screen (L49).
- **Account type:** derived, not stored (L19): "Individual" when the household has one member, "Family" when it has more.
- **Member since:** `created_at`, added as one additive field to `GET /auth/me` (Q2, decided 23 Oct).
- **Edit Profile** button: opens the existing `CompleteProfileDialog` for the self member (B7 A). No new edit rules.
- No date of birth, address or photo (L18, L19).

**Personal Information card** (L46): Email and Mobile only; name and PAN are in the header card and are not repeated. Each has the existing "Change" flow (request a one-time code, then verify) through a new `ContactChangeDialog` that repeats the behaviour of the dialog inside `ProfileView` (that dialog is not reusable without editing `ProfileView`).

**Financial Details card** (L43, L44; amends L31): shows what onboarding already stored, from `GET /auth/me`:
- **Investor type:** `investor_type` (`self_directed`, `advisor_assisted`, `mixed`, `beginner`) shown with the onboarding title ("Mostly on my own", "Through an advisor or distributor", "A mix of both", "Just getting started"); `null` shows "Not answered".
- **Goals:** `primary_goals`, stored as a JSON array of codes. Display rules (pure function `goalChips`): `null` or empty shows "Not answered" with an Add control; each known code (`consolidated_view`, `understand_holdings`, `family_management`, `performance_comparison`) becomes a chip with its onboarding title ("Consolidated portfolio view", "Understand true performance", "Family wealth tracking", "Compare distributor fees"), in the onboarding order, not the stored order; a code this screen does not know (a newer option) is kept and shown humanised in a dashed chip, never dropped; when all four are stored (onboarding's "All of it" shortcut saves the four real codes, no fifth) all four chips show. The legacy single `primary_goal` column is ignored (it is dual-written and will be dropped).
- **Edit:** a Goals dialog (four checkboxes plus "Why choose? All of it.") and an Investor type dialog, saved with the existing `PATCH /auth/me` (`primary_goals`, `investor_type`), the same call onboarding uses. No new backend. A save with an empty goals list is not allowed by the existing call's behaviour (an empty list is a no-op or error: to verify, item 7 below).
- **Coming soon rows** (ghost, locked): occupation, industry, annual income range, net worth range, risk profile, investment experience.

| Field | Source | Editable |
|---|---|---|
| Name | `/auth/me` `self_name` | through Edit Profile (`PUT /household-members/{id}/profile`); locked when it came from a statement (existing rule) |
| Email, Mobile | `/auth/me` | existing OTP change flow |
| PAN | `/household-members` `pan_masked`; full on request | as today: only when `pan_editable` is true, inside Edit Profile |

## 3. Family Members (`/profile/family`)

- **Family Account strip** (L14, L23, L45): avatars with initials, name, and the label "Primary User" for the self member and "Member" for the others; a **Manage Members** button (scrolls to the member list); and an **Add statement** tile (replaces the Add Member tile). The tile opens a small "Add statement for whom?" dialog listing the household members; picking one opens the existing import flow for that person (`/import?member=<id>`, the shell's focus layout, where the upload options are). With no members yet the tile goes straight to the import flow. The strip's look follows page 31.
- **Member list** (L47, replaces the PDF table and the earlier menu): today's member cards, restyled. Each card: avatar, name (caption "from your statement" when the name came from a CAS), the Admin or Member pill (L6), PAN (always masked; caption "On another Unifolio account" when the PAN is held elsewhere; "Not on your statement" when none), relationship ("Me", Spouse, Father, ...), phone, email ("Not added" when empty), then actions: "Change in Account Info" (self only, goes to Personal Information), the **profile-completion chip** (below 100%: progress ring and "60% complete · Finish profile", or "Add email" when exactly one field is missing; the existing `ProfileNudge` component, unchanged; at 100% it is an "Edit profile" button), and "Delete all funds". No date-of-birth. No actions menu and no standalone Merge (merge stays inside Edit's duplicate prompt).
  - **Access Level** is a display label (L6): "Admin" when `relationship` is `self`, "Member" otherwise. No stored role, no editing.
  - **Edit profile** opens the existing `CompleteProfileDialog`; **Delete all funds** opens the existing `DeletePortfolioDialog` (with its option to remove the member). Merge only inside Edit's duplicate prompt (Q1).
  - **No Add Member button** (L45, L47): the green button and the dialog are dropped, so `AddMemberDialog` is not built. People enter the household through statements (CAS detection) and onboarding. How to add a person who is in no statement yet is open question Q5.
- Data: `GET /household-members` (existing; it already refreshes PAN conflicts and returns `profile_completion`, `missing_fields`, `phone_number`, `email`, `name_from_statement`, `pan_conflict`). Import history count per member is not needed.

## 4. Settings (`/profile/settings`)

A page of four rows (page 31's Account Settings card, extended by L32), each with an icon, a title, a one-line description and an arrow:
1. Notifications -> `/profile/settings/notifications` (Coming soon).
2. Preferences -> `/profile/settings/preferences` (Coming soon).
3. Security -> `/profile/settings/security` (Coming soon).
4. Import History -> `/profile/settings/import-history`: the existing `ImportHistorySection` unchanged, fed by `loadImportHistory`, `deleteImport`, `loadMembers` (existing calls). Deleting an import refreshes the family list on next visit.
A dev-only link "Import health (staging)" sits at the bottom, shown only when `useDevToolsEnabled()` is true, as today (L37).

## 5. Coming soon pages and the Subscription card

One shared `ComingSoonPage` (L26): a heading, a short line on what will live here, no controls. Draft copy (for your approval; none of it promises a date):

| Page | Draft line |
|---|---|
| Connected Accounts | "Connected accounts are coming. Today you add mutual fund data by importing a statement." |
| Notifications | "Notification settings are coming. Today Unifolio only emails you the code you sign in with." |
| Preferences | "Display and other preferences are coming. You can switch between light and dark mode from the top bar." |
| Security | "Security settings are coming. You sign in with a one-time code or your Google account, so there is no password to manage." |
| Tax Information | "Tax information is coming." |
| Financial Details (block on Personal Information) | "Financial details are coming." |

**Subscription & Billing** (`/profile/subscription`, L4, L27): one card with the Active badge, "Current plan: Early access", and one line: "You are using Unifolio during early access." No price, renewal date, amount or billing history.

## 6. PAN: always masked (L49)

The full PAN is never shown on Profile. Every list response already returns only `pan_masked` (first two and last two characters), so Profile needs no new endpoint, no decrypt path and no client-side handling of a full PAN. This supersedes L34, L40 and L41 and makes the F7 answer moot. It also removes the conflict with ADR-004 (PAN stored encrypted, API returns masked only): nothing here contradicts it.

States of the PAN field: masked value; "Not added" when none; a "Held by another account" tag when the PAN belongs to another Unifolio account (masked as today).

## 7. Data & Privacy (`/profile/data-privacy`)

Four blocks (L10, L28); no export and no consent withdrawal (waiting on the lawyer):
1. **Terms and policies:** the existing `TermsSection` unchanged (Terms of Service, Privacy Policy, PAN disclaimer, with the viewer popup).
2. **Your consents:** a read-only list from `GET /legal/consents/me` (existing; frontend `getMyConsents` exists): document name, version, date agreed. Empty state: "No consents recorded."
3. **What we store:** fixed text, to be checked against the ADRs before launch: your PAN is stored encrypted; the statement file you upload is kept for 30 days; your imported portfolio data is kept until you delete it or delete your account; deleting your account removes your data after a 30-day grace period.
4. **Delete account:** the two-step flow (choose a reason, optional note, confirm) through a new `DeleteAccountDialog` that repeats the behaviour inside `ProfileView` and calls the same `requestAccountDeletion` from `useAuth()`. Wording unchanged: "permanently deleted in 30 days; you can cancel anytime before then".

## 8. Shared rules

- **States:** each page has loading (skeleton), error (with Retry) and, where relevant, empty states; see the layout doc.
- **Date format:** `DD Mon YYYY` (existing `Intl.DateTimeFormat("en-GB")` pattern in `ImportHistorySection`).
- **No analytics tracking** is added (the Home tracking plan is separate and deferred).
- **Mobile:** the mobile tree keeps the old `ProfileView`; nothing here touches it.

## 9. Endpoints used

| Endpoint | Status | Used by |
|---|---|---|
| `GET /auth/me` | existing (+ `created_at`, Q2) | header card, personal card |
| `POST /auth/contact-change/request`, `/verify` | existing | `ContactChangeDialog` |
| `POST /auth/account-deletion` | existing | `DeleteAccountDialog` |
| `GET /household-members` | existing | family, header, account type |
| `POST /household-members` | existing | not used on Profile (L47) |
| `PATCH /auth/me` | existing | Goals and Investor type dialogs (L43) |
| `/import?member=<id>` (shell route) | existing flow | Add statement tile |
| `PUT /household-members/{id}/profile` | existing | Edit (`CompleteProfileDialog`) |
| `POST /household-members/{id}/merge-into/{target}` | existing | only through Edit's duplicate prompt (Q1) |
| `DELETE /household-members/{id}/portfolio` | existing | Delete all funds |
| import history, delete import | existing (frontend `loadImportHistory`, `deleteImport`) | Settings > Import History |
| `GET /legal/documents`, `GET /legal/consents/me` | existing | Data & Privacy |

## 10. Tables

None new, none changed. (L31 removed the only option that needed columns.)

## 11. Verification items before the plans are locked

1. (Withdrawn with L49: there is no PAN endpoint.)
2. (Withdrawn with L49.)
3. Whether `CompleteProfileDialog` accepts the self member without `onChangeInAccountInfo` (it is optional per its props) and what it does for a statement-locked name.
4. Behaviour of `ImportHistorySection` when mounted standalone outside `ProfileView` (it takes its own loaders; no parent state was seen).
5. `useAuth()` exposes `requestAccountDeletion`, `requestContactChange`, `verifyContactChange`, `logout` (the shell wrapper passes them to `ProfileView` today).
6. (Withdrawn with L49.)
7. What `PATCH /auth/me` does with an empty `primary_goals` list (the code treats `[]` as provided and then reads `goals[0]`, which would fail): the Goals dialog must not allow saving an empty selection, or the call needs a guard (a backend fix, to confirm).
8. That the existing import flow accepts `?member=<id>` and shows its upload options first (contract section 5 says it does).

## 12. Questions raised by this spec, answered 23 Oct

- **Q1 Merge action: Edit and Delete only.** No standalone Merge item; merge stays inside Edit's possible-duplicate prompt. This amends L22.
- **Q2 Member since: add `created_at` to `/auth/me`.**
- **Q3 and Q4: moot (L49).** The PAN is never revealed, so pending claims, visibility and the log line no longer matter.

## 13. Changes of 23 Oct, later (owner instructions)

- **A3 amended (L42):** a final plan step deletes the old Profile once the new one is built and accepted (see the frontend plan, task 10).
- **L43 to L47:** onboarding data in Financial Details, display rules for the JSON array of goals, the Add statement tile, the Personal Information card without name and PAN, today's member cards with the completion chip.
- **Q5 (open):** with no Add Member button, how does someone add a person who is not in any statement? The existing import flow may already have a member chooser (contract section 5: "or the chooser when absent, as today"); to verify. Options when answered: (a) rely on that chooser; (b) keep an "add a person" link inside the whom dialog; (c) leave members to CAS detection only.
- **Saved card answers versus chat:** the card answers pasted on 23 Oct show B1 C, C1 A, C2 B and C4 A, which differ from the later instructions above (B1 now onboarding data, C1 and C2 now Add statement and no Add Member, C4 moot). The later chat instructions are applied; the cards in the workbook keep their saved state.
