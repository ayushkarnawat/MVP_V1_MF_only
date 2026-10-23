# PRD: Profile (redesigned), MF-only, desktop (draft v1)

**Status:** draft, 2026-10-23. A new document: no existing PRD was edited. Whether PRD-01 to PRD-04 or the App Flow doc need a version note is for the owner to decide (section 9). Follows the style of `2026-10-23-home-prd.md`.

## 1. Problem and goal

Today's Profile is four tabs (Account Info, Family Members, Import History, Terms). The redesign (PDF page 31) turns it into a sectioned page the way the rest of the new app is organised. Goal: the account holder can see who they are in Unifolio, manage the people in their household, reach their import history and their privacy controls, and see where future settings will live, without adding data or features the product cannot yet support.

## 2. Users

The signed-in account holder (the "Primary User"). Household members are people the account tracks; they have no logins and no roles.

## 3. Scope

**In:** seven sections and a Logout, each its own page (L1, L36): Personal Information, Family Members, Connected Accounts (Coming soon), Settings (Notifications, Preferences, Security as Coming soon; Import History live), Subscription & Billing ("Early access"), Tax Information (Coming soon), Data & Privacy.
**Out (deferred):** Connected Accounts as a real feature (kept in `DEFERRED_FEATURES.md`), financial details (L31), date of birth, address, photo, notification, preference and security settings, billing, tax data, data export, consent withdrawal.
Mobile is untouched. Existing screens are untouched.

## 4. Requirements

| ID | Requirement | Source |
|---|---|---|
| FR-1 | `/profile` opens Personal Information; each list item opens its own page; the active item follows the URL | L1, L13 |
| FR-2 | The header card (initials avatar, name, email, phone, PAN, account type, member since) appears on Personal Information only | L14, L19 |
| FR-3 | PAN is always shown masked (first two and last two characters); there is no Show or Hide and no way to see the full PAN on Profile | L49 |
| FR-4 | Account type is derived: Individual for one member, Family for more | L19 |
| FR-5 | Edit Profile and each row's Edit use the existing member edit; email and mobile use the existing one-time-code change | L21 |
| FR-6 | Financial Details shows the investor type and goals the user gave in onboarding (goals stored as a JSON array, shown as titled chips; null shows Not answered; unknown codes kept); both can be edited with the existing account call; occupation, industry, income, net worth, risk and experience rows show Coming soon; nothing new is collected | L31, L43, L44 |
| FR-7 | Family Account strip with Primary User / Member labels, Manage Members, and an Add statement tile that asks who the statement is for and then opens the upload options | L23, L45 |
| FR-8 | Member cards as today: name, masked PAN, relationship, phone, email, Admin or Member label, profile-completion chip (percentage and what is missing), Edit profile, Delete all funds (merge only inside Edit's duplicate prompt). No Add Member button | L6, L47, Q1 |
| FR-9 | Settings lists Notifications, Preferences, Security (Coming soon pages) and Import History (the existing list with delete) | L25, L32 |
| FR-10 | Connected Accounts and Tax Information are Coming soon pages | L9, L33 |
| FR-11 | Subscription & Billing shows "Early access", Active, one line; no price, date or history | L4, L27 |
| FR-12 | Data & Privacy: legal documents, your consents (read-only), what we store, Delete account | L10, L28 |
| FR-13 | Logout in the list footer with the existing confirmation | L8 |
| FR-14 | The old Profile stays reachable at a hidden path; the dev Import Health route keeps working | A3 B |
| FR-15 | No View as Family button | A4 B |

## 5. Non-functional

- Desktop only; light and dark.
- Loading, empty and error states per page (layout doc); one block failing never hides the others.
- No new table, job or migration; one new endpoint.

## 6. Success measures and tracking

No tracking is added (the Home tracking plan is separate and deferred). Qualitative: the owner's acceptance on staging.

## 7. Risks

Settings holds Import History next to placeholders (R9); two small duplicated dialogs; the shell must land first; the contract needs the proposed route change.

## 8. Rollout

One change after the shell lands (E2 A). No feature flag; the old Profile remains reachable at `/profile/legacy` until the final task deletes it, once you accept the new one (L42). Lawyer review of the "What we store" text and of showing full PAN before launch.

## 9. Conflicts with existing documents (for the owner; none resolved silently)

1. **Shell contract v1.2, O10 and URL map:** says Profile sections come later and reserves nine paths; this PRD needs them now and changes three of them (Settings children, plus import-history and legacy). Proposal only.
2. **ADR-004 (reopened 18 Sep 2026):** consistent: PAN stays masked in every response and on screen; no new endpoint (L49 reversed the earlier reveal-on-click idea).
3. **Original data-minimisation decision (`decisions.md`):** respected: DOB, address and financial fields are not collected.
4. **PRD-02/PRD-03 and App-Flow docs** may describe the old Profile tabs; not read in full for this draft, to be checked before any edit.
5. **PDF versus this PRD:** differences from page 31 are the ones in the workbook's conflicts table (X1 to X11) and L-decisions.
