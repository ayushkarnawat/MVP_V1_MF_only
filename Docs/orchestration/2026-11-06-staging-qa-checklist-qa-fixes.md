# Staging QA checklist: the QA fixes (6 Nov 2026)

**Where:** `https://ls-redesign.unifolio.in/` (private window). **Who:** the tester. **Before:** the deploy guide is done and Claude has reported healthy. Tick every row; write what you see for any that fail and attach a screenshot. Row ids in brackets point to the earlier QA sheets (U = UI round 2 sheet, CR = change requests sheet). Section R repeats screens that must **not** have changed.

**Tester:** ____________   **Date:** ____________   **Browser:** ____________

## Setup you need
- A **fresh account** for the Head of Family rows (D). The earlier test household is locked for 7 days after its head change. A second inbox you can open for the head change emails (two addresses: the old head's and the new head's).
- A synthetic statement with two people, for example `r2_couple_rohan_priya_10yr.pdf` (password `MF@123`).

## A. Import and Home
| # | Check | Expected | Result |
|---|---|---|---|
| A1.1 (U C1, C3) | Import a statement with two people and new funds, in the app (Add data) | A card titled **Import complete** with a green tick and a cross at the right; a line like **6 new funds · 448 transactions added**; one row per person with a green count chip; a **New funds** label with at most three fund chips and **+N more**; one green outline button **View new funds**. No bare text lines, no "View new fundsDismiss" | |
| A1.2 | Click **View new funds** | The existing list opens in a pop-up; Esc closes it and leaves the card | |
| A1.3 | Import a statement that carries many skipped lines | At most **two** note lines, then **+N more notes** | |
| A1.4 | Re-import the same statement | A card with **This statement was already imported** (one line, same card look) | |
| A1.5 | Click the cross, reload the page | The card is gone and stays gone | |
| A1.6 | Leave the card alone for a minute | It does not disappear by itself | |
| A2.1 (U B2 to B6) | Home, move the pointer slowly then quickly across the donut slices | The highlight fades in about a fifth of a second, **holds** while you move to the next slice (no flash of the whole donut), the active slice is slightly thicker, and it clears shortly after you leave the donut and the legend | |
| A2.2 | Move over a legend row | The same highlight | |
| A2.3 | Click a slice, press Enter and Space on a focused slice, Tab through | The class pop-up opens as before; focus rings are as before | |

## B. Sign-up and sign-in
| # | Check | Expected | Result |
|---|---|---|---|
| B1.1 (U G3) | Sign-up screen 4: press Continue with nothing chosen | Both messages are readable red-on-pink boxes with an icon; every answer of the empty group has a red outline; focus is on the first | |
| B1.2 | Choose an answer, then a goal | That group's outline and message go away | |
| B1.3 (U H4) | Enter a wrong code and an expired code on the log-in code screen | The error shows in the same readable red box | |
| B1.4 | Repeat B1.1 with the computer set to **dark mode** | Looks identical (the card is always light) | |
| B2.1 (U H1, H2) | Log out from **Profile, Family**, log in again | You land on **Home**, not on the Profile page | |
| B2.2 | While signed out, open a pasted link such as `/portfolio/mutual-funds/holdings`, then log in | You land on **that page** | |
| B2.3 | Let a session expire (or delete the session and reload on a deep page), log in | You return to the page you were on | |
| B3.1 (U G9, G10) | Sign up to the **All set** screen, press **View details** | A dialog **Import details** opens over All set, listing the statement with its dates and "N transactions · Imported", read-only; the page behind is still All set | |
| B3.2 | Press **← Back**, then View details again and press the browser's Back, then again and press Esc | Each time it closes and you are on **All set** | |
| B3.3 (U G11) | Open View details, reload the browser | You are on All set (not on the dashboard) | |
| B3.4 | Press **Go to my dashboard** | You reach Home; onboarding is complete | |
| B3.5 | Profile, Settings, **Import History**, press **← Back** | Back to Settings | |
| B3.6 | Mutual Funds, a new-funds notice, **View new funds**, **View all in Import History**, then **← Back** | Back to Mutual Funds | |

## D. Head of Family (use the fresh account)
| # | Check | Expected | Result |
|---|---|---|---|
| D1.1 (CR 8.2, 8.3) | Family, **Change Head of Family**, with a member who has no email or phone | The member is a clickable row with a green **Add details** chip and "Needs an email address and a phone number." (not greyed) | |
| D1.2 | Click the row | The Complete profile dialog opens (the list is hidden, never two dialogs); fill relationship, phone, email, Save, Done | The list comes back and the member is **selected**; Next is enabled | |
| D1.3 | Open Add details again and press **Exit** without saving | The list comes back, the member still shows what is missing | |
| D1.4 | A member whose PAN is registered on another account, or a statement being imported | Stays greyed with its reason (not clickable) | |
| D1.5 | Try an email already used by another account | The same warnings as in Profile | |
| D2.1 (CR 8.9) | Go through the codes to the review step | A headline **{name} becomes Head of Family** with a time-left chip; a **Signs in from now with** block showing the new head's email and phone; a **What changes** list with `Head of Family → Spouse` style rows; a calm **You will be signed out.** notice naming the old head; the line "All portfolio data stays exactly as it is." Confirm is disabled until the summary has loaded | |
| D3.1 (CR 8.10, 8.13) | Confirm the change | You are signed out and the sign-in page shows a card **Head of Family changed** with the new head's email and phone **masked** (for example `pr••••••@…`) and "{old head} can no longer sign in." | |
| D3.2 | Reload the sign-in page | The card is gone (it is not stored) | |
| D4.1 (CR 8.15) | Signed in as the new head, Family, **Delete member** on the old head | The dialog reads **{name} can't be removed yet** with the server's sentence and a **date in India time** (7 days after the change), and one **OK**; no delete button | |
| D4.2 (CR 8.16) | Profile, Data and Privacy, **Delete Account**, choose a reason, Continue, Confirm deletion, within 24 hours of the change | **You can't delete this account yet** with the date and time **in IST** and one **OK** | |
| D4.3 | Delete a member who is not part of a recent change | Works as before | |
| D5.1 (CR 8.11, 9.1 to 9.5) | Open the three emails in a real inbox (Gmail if you can) | **New head:** "You are now Head of Family." no link. **Old head, notice:** "The Head of Family on your account has changed." plus a sentence naming the **second email**; no link. **Old head, "Undo the Head of Family change."**: a green **Undo the Head of Family change** button, "Valid until {date, time} IST", and the plain link under "Button not working?" | |
| D5.2 | Press the undo button within 24 hours | The undo works as in section 9 of the earlier sheet; a third "changed back" email arrives | |
| D5.3 | Check the dark-mode look of the emails | Readable; the button is still green with dark text | |

## R. Nothing else moved (compare with how it looked before)
| # | Screen | Result |
|---|---|---|
| R1 | Home (chart, cards, donut at rest), Mutual Funds Overview, Holdings, Allocation | |
| R2 | Profile: Personal, Family cards, Settings, Data and Privacy | |
| R3 | Sign-up screens 1 to 3 and 5, log-in screen | |
| R4 | The Import options screen and the upload dialogs | |
| R5 | Mobile (a phone-width window or a phone): sign-up, log-in, logout and the Home screen behave as before | |

## Sign-off
All rows pass: ☐ yes  ☐ no (list the failed rows)     Owner: ____________   Date: ____________
