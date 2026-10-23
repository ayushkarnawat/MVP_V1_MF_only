# Profile: section-wise design system, utilities and mockup notes (draft v1)

**Status:** draft, 2026-10-23. Planning only. Document 3. Colours and fonts follow `Docs/Unifolio Colour Palette.pdf` as already adopted for Home and the shell (`2026-10-23-home-design-system.md` section 1 and `2026-10-23-shell-design-system.md`); this document adds only what Profile needs. Light and dark only. The mockup below is a structural wireframe; pixel mockups come after you approve this document.

## 1. Tokens

Reuse the Home/shell scoped tokens (decision M12 A there: new names for Home and the shell, `tokens.css` values untouched). Profile adds **no new colour tokens**. Used here:
- Surfaces: base, card, elevated; divider and input borders.
- Text: primary, body, secondary, muted.
- Brand green: selected tint behind the active list item and the Active badge; primary button; 2 px focus ring on every control. Green is used sparingly (one or two elements per screen).
- Semantic: negative text and border only for the Delete account block and error messages; warning tint for the pending-claim note; neutral tint for the "Coming soon" tag.
- Fonts: DM Sans for headings, Manrope for body (as in the palette).

## 2. Existing components reused (unchanged)

`ui/card`, `ui/badge`, `ui/button`, `ui/dialog`, `ui/tooltip`, `ui/skeleton`, `ui/table`, `Modal`, `EmptyState`, `ThemeToggle` (not used on Profile), shell `PageLayout`, `PageState`, `AppLink`; and from the Profile feature: `CompleteProfileDialog`, `DeletePortfolioDialog`, `ImportHistorySection`, `TermsSection`, `LogoutConfirmDialog`.

## 3. New pieces (build detail in the reuse-vs-new doc)

| Piece | Purpose |
|---|---|
| `ProfileFrame` | title, subtitle, left list, content slot |
| `ProfileNav` | the seven items + Logout; active state from the URL |
| `InitialsAvatar` | circle with initials, size variants (header 56 px, strip 40 px, table 28 px); colour chosen from a small fixed set by a hash of the member id, so a person keeps the same colour |
| `HeaderCard`, `PersonalInfoCard` | Personal Information page blocks |
| `PanField` | masked PAN, no icon, no toggle (L49) |
| `FamilyStrip` | avatars with "Admin" / "Member" labels, Manage Members, Add statement tile |
| `MemberCard` | today's member card (avatar, name, pill, PAN, relationship, phone, email, actions) in the page-31 style; reuses the existing `ProfileNudge` chip unchanged |
| `DeleteMemberDialog` | confirmation for removing a member and their funds (not shown for the Admin) |
| `AddStatementDialog` | "Add statement for whom?": a list of household members, then opens the import flow |
| `FinancialDetailsCard`, `GoalsDialog`, `InvestorTypeDialog` | onboarding data display and edit |
| `ContactChangeDialog`, `DeleteAccountDialog` | repeat the behaviour of the dialogs inside `ProfileView` |
| `SettingsRows` | four rows with icon, title, description, arrow |
| `ComingSoonPage` | icon, heading, one line; optional "Back to Settings" link |
| `ComingSoonBlock` | the same inside a card (financial details) |
| `SubscriptionCard` | plan, Active badge, one line |
| `ConsentList` | read-only consents |
| `StoredDataNote` | the "What we store" text |

## 4. Section notes

1. **Left list:** 40 px rows, 20 px Lucide icon, label in Medium weight; active row uses the selected tint (#E9F9EF light) with primary text; hover uses the card tint. Candidate icons: `UserRound`, `Users`, `Link2`, `Settings`, `CreditCard`, `FileText`, `ShieldCheck`, `LogOut` (all exist in lucide-react 0.475.0; to confirm names in the build).
2. **Header card:** avatar 56 px; name in H2; email and phone in secondary text; Edit Profile as a secondary button; the three facts as caption label above value.
3. **PAN field:** always masked, tabular figures, no icon. No Show or Hide control (L49).
4. **Family strip:** avatars 40 px; the self member's label "Admin" in the brand green text, others "Member" in secondary; the Add statement tile has a dashed border and a file-upload icon.
5. **Member cards:** today's card fields in the page-31 style; Admin / Member pill in the card header ("Admin" brand tint, "Member" informational tint); the completion chip is the existing `ProfileNudge`; Delete member and Delete all funds are red text buttons at the right of the action row. No table and no row menu (L47).
6. **Coming soon:** neutral-tint tag "Coming soon", heading, one line of body text, generous whitespace; no illustration in v1.
7. **Subscription card:** plan name in H3, Active badge in brand tint, one line of body text.
8. **Data & Privacy:** card per block; Delete account block keeps today's danger style (negative border and tint).

## 5. Utilities

- `profileNav.ts`: the item list (id, label, icon, route, children) as one constant, used by the nav, the tests and the section map.
- `formatDate.ts` reuse (the existing helper in `ImportHistorySection`, or one small shared function if importing from that file is awkward; no edit of the old file).
- `accessLevel(member)`: pure function, "Admin" for `relationship === "self"`, else "Member".
- `accountType(members)`: pure, "Individual" when one member, else "Family".
- `initialsOf(name)`: first letters of the first and last word, uppercase.

## 6. Wireframe: Personal Information page

```
Profile
Manage your account, family members, preferences and data.
[Personal Info*]  +--------------------------------------------------+
[Family Members]  | (SS)  Siddharth Surve                [Edit Profile]|
[Connected Acc. ] |       siddharth@example.in                          |
[Settings      ]  |       +91 98765 43210                               |
[Subscription  ]  | PAN AB******4F (lock)   Account type Family         |
[Tax Info      ]  |                          Member since Oct 2025      |
[Data & Privacy]  +--------------------------------------------------+
                  | Personal Information   | Financial details        |
[Logout]          | Full name  Siddharth.. | [Coming soon] Financial  |
                  | PAN        AB****4F    |  details are coming.     |
                  | Email      s@...  Change|                         |
                  | Mobile     +91..  Change|                         |
                  +----------------------------------------------------+
```

## 7. Added utilities (23 Oct, later)

- `goalChips(codes)`: array of codes or null to chips, onboarding order, one "All of it" chip when all four are stored, titles from the onboarding screens, unknown codes humanised and flagged, null or empty gives none.
- `investorLabel(code)`: onboarding title, null gives null, unknown code humanised.
- `GOAL_OPTIONS` and `INVESTOR_OPTIONS`: the codes with their onboarding titles and subtitles, one constant used by the card, both dialogs and the tests. To avoid a second copy of the titles, import them from the onboarding files if they can be exported without editing those files; otherwise copy them and add a test that fails if the code lists differ.
