# Profile: desktop layout and states (draft v1)

**Status:** draft, 2026-10-23. Planning only. Document 2. Desktop web only; mobile is out of scope and untouched.

## 1. Page frame

Inside the shell's `AppLayout` (sidebar and top bar from the shell; Profile adds nothing to either). The page area follows the shell: `max-w-7xl`, padding as today. Profile's own frame, `ProfileFrame`, draws:

```
+------------------------------------------------------------------+
| Profile                                                          |
| Manage your account, family members, preferences and data.       |
+----------------+-------------------------------------------------+
| Personal Info *|  <section content, one section at a time>       |
| Family Members |                                                 |
| Connected Acc. |                                                 |
| Settings       |                                                 |
| Subscription   |                                                 |
| Tax Info       |                                                 |
| Data & Privacy |                                                 |
|                |                                                 |
| Logout         |                                                 |
+----------------+-------------------------------------------------+
```

- Title "Profile"; subtitle adapted from page 31 (the mockup line mentions "connected accounts"; the plain version above avoids promising it).
- **Left list:** fixed width about 220 px, seven items with a Lucide icon each, the active one highlighted with the selected tint, a divider, then Logout at the foot (L8, opens the existing confirmation). Links are real router links; the active item follows the URL (Settings stays active on its child pages).
- **Content column:** takes the rest; scrolls with the page (the left list is sticky at the top of the page area).
- No "View as Family" button (A4 B).

## 2. Section layouts

| Page | Layout |
|---|---|
| Personal Information | Header card full width (avatar left; name, email, phone; Edit Profile right; below, a row of three facts: PAN (masked), Account type, Member since). Under it, two cards that sit side by side when wide and stack when narrow: Personal Information (email, mobile) and Financial Details (investor type and goals from onboarding, then Coming soon rows). |
| Family Members | Family Account strip full width (avatars in a row, Manage Members at its right, Add statement tile at the end). Under it a list of member cards, one per person (today's layout, restyled), each with the completion chip. |
| Connected Accounts | Coming soon card, centred in the content column. |
| Settings | One card with four rows (icon, title, description, arrow), dev link at the foot. |
| Settings child (3) | Back link "Settings", then a Coming soon card. |
| Settings > Import History | Back link "Settings", then the existing `ImportHistorySection`. |
| Subscription & Billing | One card (plan, status badge, one line). |
| Tax Information | Coming soon card. |
| Data & Privacy | Four stacked cards: Terms and policies, Your consents, What we store, Delete account (danger styling as today). |

Cards use the card surface from the palette; no card inside a card except the table rows.

## 3. State matrix

| Page | Loading | Empty | Error | Partial |
|---|---|---|---|---|
| Personal Information | skeleton header and card | n/a (an account always exists) | message with Retry; if only the member list fails, the card still shows name, email and phone from `/auth/me`, and PAN reads "Not available" | member list loads but PAN missing: PAN shows "Not added" |
| Family Members | skeleton strip and 3 rows | the account always has the self member after onboarding; if the list is empty: "No family members yet" with the Add Member button | message with Retry | a row without a PAN: "Not added" |
| Settings | none (static) | n/a | n/a | n/a |
| Import History | the section's own loading text | its own empty state | its own error | n/a |
| Subscription, Coming soon pages | none (static) | n/a | n/a | n/a |
| Data & Privacy | per block: terms skeleton, consents skeleton | consents: "No consents recorded." | per block Retry | one block failing does not hide the others |

PAN states: masked (always); "Not added" when none; a "Held by another account" tag when it belongs to another account. There is no Show or Hide (L49).

## 4. Scope behaviour

None. Profile ignores the top-bar family/member selector (route scope `none`). The selector stays visible and unchanged.

## 5. Interactions

- Left list link: navigates, no page reload; browser Back returns to the previous Profile page.
- Edit Profile / row Edit: opens `CompleteProfileDialog`; on save, the member list reloads.
- Email or Mobile "Change": `ContactChangeDialog` (email or phone, then a one-time code); on success `/auth/me` reloads.
- Add Member / Manage Members: tile and button open the add dialog / scroll to the table.
- Row menu: opens a small menu (keyboard accessible): Edit, Delete all funds.
- Logout: confirmation dialog, then `logout()`.
- Delete account: two-step dialog; on success the existing pending-deletion screen takes over (the shell gate), as today.

## 6. Links

All in-app links use the shell `paths` builders and `AppLink`. Placeholder destinations do not exist here: every list item is a real page (Coming soon pages are pages), so no disabled links.

## 7. Widths

Content column minimum about 640 px; the family table scrolls horizontally inside its own container below that. Below 768 px the shell hands over to the mobile tree, so no narrower layout is designed.

## 8. Update of 23 Oct, later

Narrow widths: the two cards on Personal Information stack below about 760 px of content width and the fields never split into columns inside a card. The Add statement flow replaces the Profile frame with the shell's focus layout (Back link, no sidebar) while the import runs; Back returns to Family Members.
