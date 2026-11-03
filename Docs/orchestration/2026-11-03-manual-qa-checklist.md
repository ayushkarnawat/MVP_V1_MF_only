# Manual QA checklist: the 13 change requests release (staging, `https://ls-redesign.unifolio.in`)

For the person doing the testing (owner, manager or intern). Nothing here needs code knowledge. Do the sections in order. For every row write **Pass**, **Fail** or **N/A** and, for a Fail, the screen, what you did, what you saw, and a screenshot. Send the finished sheet back; do not fix anything yourself. This sheet is generated from the build notes in `Docs/orchestration/2026-10-31-staging-deploy-guide-change-requests.md` (ledger section 4.4). Expected wording is in quotes: it must match the screen.

**What you need before you start**
- A modern browser, plus a **private window** for the first look at each screen (so nothing is cached). Use a desktop and also a phone (or the browser's phone view) for sections 3 to 9.
- **Two real email inboxes you can open** (call them Inbox A and Inbox B), and two phone numbers (phone codes are NOT sent by SMS yet: in test mode the code shows on screen under the box, in a strip that says "Test mode: no SMS is sent yet. Your phone code is ...").
- A statement file (CAS PDF) for a family with at least three members, including one with a PAN. The test family on staging (`bed26e3e`) may already exist; ask the owner which account to use.
- The date and time you start each section.

**Rules of the day:** do not change anything outside this sheet; do not delete an account unless a row says so; tell the owner at once if a row says STOP.

---
## 1. First look (all screens load)
| # | Do this | Expected | Result |
|---|---|---|---|
| 1.1 | Open the site in a private window, hard refresh (Ctrl+Shift+R). | Sign-in page opens, no error banner. | |
| 1.2 | Sign in with a test phone number. The code appears under the box in the test-mode strip; type it. | You get in. No "Local Dev OTP" strip anywhere; the strip reads "Test mode: no SMS is sent yet. Your phone code is 482 913." (three digits, space, three digits). | |
| 1.3 | Click through Home, Mutual Funds (Overview, Allocation, Holdings, Overlap, Performance, Transactions, Other Analytics), an Individual Fund page, Profile, Family. | Every screen opens with no red error and no blank card. | |

## 2. Fund logos and headings (Run 7)
| # | Do this | Expected | Result |
|---|---|---|---|
| 2.1 | Look at: Allocation drill-downs and the By AMC card, Overlap (stat strip, heatmap headers, top pairs, pair detail, common holdings, impact), Holdings "All Stocks" fund rows and "Top holdings by fund" chips, Performance fund rows, Benchmark rows, Transactions ledger and the month drill, Home "Movers" and its pop-up, the SIP card, the Individual Fund overlap panels, Portfolio quick insights. | Wherever a fund or fund house is named, its logo (or a round tile with its first letter) sits beside the name, the same way on every screen. A tile with a letter is fine; a missing logo is not. | |
| 2.2 | Block the network for the logos (browser developer tools, Network, "Offline", reload; or ask the owner). | Logos turn into letter tiles; no broken-image icons. | |
| 2.3 | Open Mutual Funds, Other Analytics. | Each group has ONE heading, and its card has a DIFFERENT heading: group "Performance Ranking" with card "Rank in your fund's category"; group "Category Average Comparison" with card "Returns against the category average". No title is printed twice. | |
| 2.4 | Look at every main button (Add statement, Change Head of Family, Continue, Confirm...). | Brand green with white text. Report any green button with black text. | |

## 3. Market cap, asset class and fund managers (Run 1)
| # | Do this | Expected | Result |
|---|---|---|---|
| 3.1 | Allocation, Market cap. | The bars add up to 100%, with a note about unclassified holdings if any. | |
| 3.2 | Home and Mutual Funds, asset class. | Five slices: Equity, Debt, Gold, Real Estate ("Real Estate (REITs and InvITs)"), Others; and the note "Cash is included under Debt". | |
| 3.3 | Allocation, Fund manager card. | Opens on "Cards" (a Table view is also there); no donut or bar chart. A main manager is marked per fund; where the main manager was assumed, it says so. | |
| 3.4 | Overlap, By category tab. | The category tabs (Large, Mid, Small, Flexi Cap) show their own pairs; a category with fewer than two funds shows a plain message. The fourth reason sentence is present where a fund is left out. | |
| 3.5 | Look for Stock Concentration anywhere. | It is gone from every screen. | |

## 4. Other Analytics: valuation, ranking, category average (Run 2 and the 2 Nov answers)
| # | Do this | Expected | Result |
|---|---|---|---|
| 4.1 | Valuation by Fund. | Each fund has a P/E and P/B or a plain reason. **Never a bare dash**: where a value is missing the card says why, for example "Not enough data: P/E is available for 52% of this portfolio's shares, and we need at least 60%." (the rule is 60%). | |
| 4.2 | Portfolio-level P/E and P/B. | Shown when at least 60% of the portfolio's shares have a ratio; otherwise a reason sentence, not a dash. | |
| 4.3 | Performance Ranking. | Ranks show with ties handled; an index fund shows the index-fund note instead of a rank; a banner sentence explains ranks. | |
| 4.4 | Category Average Comparison. | A table of the fund against its category average with the sentence "Weighted by fund size." (and, if some funds have no size on record, "N funds have no size on record and are left out."). | |
| 4.5 | Look for Fund Quality Scores. | Hidden on every page. | |
| 4.6 | Open a page that was stored before the update (if one shows). | "Performance rankings are updating." until the recompute finishes; never a crash. | |

## 5. Benchmarks (Run 3 and the 2 Nov answers)
| # | Do this | Expected | Result |
|---|---|---|---|
| 5.1 | Individual Fund page and Performance, Benchmark screens for at least one fund of each type: a large cap, a mid cap, a small cap, an index fund, a gold fund, an arbitrage fund, an equity savings fund, a UTI fund and a Groww fund. | Each benchmark shows a source label in plain words: "From the fund's factsheet", "Closest index we hold", "Chosen by the fund's category", or "As printed in the fund house's factsheet". "No benchmark" appears only for a fund where nothing fair exists (some debt, other hybrid, overseas and fund-of-funds funds). | |
| 5.2 | Under each benchmark name. | A line "How this benchmark was chosen" with one plain sentence (for example "This is the index named in the fund's own factsheet."). | |
| 5.3 | Beside the benchmark name. | A small "i" icon. Hover with the mouse, tab to it with the keyboard, and tap it on the phone: a short note appears; Escape closes it. No icon when there is no note. | |
| 5.4 | The arbitrage fund. | Benchmark is the Nifty 50 Arbitrage index, labelled "Chosen by the fund's category". | |
| 5.5 | The equity savings fund. | NOT compared with the Nifty 500: shows "As printed in the fund house's factsheet" or "No benchmark". | |
| 5.6 | A gold or silver fund. | Printed returns only (no computed comparison). | |
| 5.7 | A fund whose factsheet names a factor or theme index (Quality, Value, Momentum, ESG, Pharma, Auto...). | "From the fund's factsheet" with a chart, once the daily benchmark job has loaded that index; if the chart is empty tell the owner the fund name (the index may not have loaded yet). | |

## 6. Transactions and Cash Flow: switches (Run 3)
| # | Do this | Expected | Result |
|---|---|---|---|
| 6.1 | Open Transactions and Cash Flow. | A "Switches: Included / Excluded" control, default Excluded. The tile is named "Net invested". | |
| 6.2 | Toggle it. | Cash flow numbers change; **Net invested does not change**. The print view stays excluded. | |

## 7. Family holdings (Run 4)
| # | Do this | Expected | Result |
|---|---|---|---|
| 7.1 | Holdings, family view. | A fund held by more than one member is one parent row with a split bar; the shares add up to 100.00%. | |
| 7.2 | Click the + beside a parent row (then repeat with the keyboard: Tab to it, Enter). | The member rows open under it: masked folio (last four characters only), units, NAV, XIRR or a dash. | |
| 7.3 | A fund held by one member only. | No + button and no bar. | |
| 7.4 | Switch to a single member. | Today's layout, unchanged. A family of more than four members shows dashes for member XIRR. | |
| 7.5 | Phone view. | Cards instead of a table, with the expansion inside the card. | |

## 8. Head of Family: the hand-over with two real inboxes (Runs 5 and 6)  **START HERE with the owner on the call**
Setup: sign in as the account holder (the current Head). On the **Family** page the member you will promote (call them "New Head") must have an email address in Inbox B, a phone number, a PAN and a label of spouse, parent, child or sibling. The account's own email must be Inbox A.
| # | Do this | Expected | Result |
|---|---|---|---|
| 8.1 | Sign in as the Head. Open Family. | A green "Change Head of Family" button is shown (to the Head only). Sign in as a non-Head member, if one exists: no button. | |
| 8.2 | Click it. | A dialog "Choose who will be Head of Family". Members that cannot be chosen are greyed with a plain reason (for example "Add their PAN in their profile first."; "Set how they are related to you first: spouse, parent, child or sibling."). A member labelled "other" is greyed with the label reason. | |
| 8.3 | Choose New Head, press Next. | An email with the subject "Confirm a change of Head of Family." arrives in Inbox A. Under the box a test strip may show the code. Enter it, press Continue. | |
| 8.4 | Step "Enter the four codes". | Four boxes: "Your email" (already Verified), "Your phone", "{New Head}'s email", "{New Head}'s phone". The remaining time counts down. The phone codes appear in test-mode strips under their boxes; the new head's email code arrives in Inbox B ("Confirm you are becoming Head of Family."). | |
| 8.5 | Enter a wrong code in one box. | The message "Wrong code..." (the server's words) appears under THAT box only. | |
| 8.6 | Press "Send again" on one box twice quickly. | The second press shows a wait message, no crash. | |
| 8.7 | Enter all four codes. | Each box turns "Verified"; "Next" is enabled only when all four are verified. | |
| 8.8 | Close the dialog (X) at this step. | A banner on the Family page: "A Head of Family change is waiting for codes. 9:30 left." with Cancel and Continue. Continue reopens the dialog at the code step. | |
| 8.9 | Press Next to the review step. | "{New Head} will sign in with {email} and {phone}." "{Old head} stays as a member and will no longer sign in." "You and everyone else on this account will be signed out." "All portfolio data stays exactly as it is." Plus the list of label changes, for example "{Name}: Head of Family becomes Child" and "{New Head}: Spouse becomes Head of Family"; a label that ends "Not set" says so; a member flagged for a check says "Please check this one after the change." | |
| 8.10 | Press "Confirm the change". | You are signed out and the sign-in page shows "The Head of Family has been changed. Sign in with the new Head's email or phone number." | |
| 8.11 | Check Inbox A (old head) and Inbox B (new head). | Both get the notice "The Head of Family on Unifolio has changed." **Only Inbox A** (the old head's addresses) also gets "Undo the Head of Family change." with a link. Inbox B has NO undo link. | |
| 8.12 | Sign in with Inbox B's email (or the new head's phone). | You get in; a screen "You are now the Head of Family" asks to agree to the Terms. Until you agree, the app screens do not load data (that is intended). After agreeing you see the same data, labels flipped. | |
| 8.13 | Try to sign in with the OLD head's email, phone and any Google account tied to it. | None works. | |
| 8.14 | Open Family as the new head. Try to change the Head of Family again straight away. | Refused: "The Head of Family was changed recently. You can change it again on {date}." (7 days). | |
| 8.15 | Try to remove the OLD head's member (Delete member). | Refused: "This person was part of a recent Head of Family change, so they cannot be removed yet. Try again in 7 days." (the screen may only show a generic "Could not delete this member"; note exactly what you saw). | |
| 8.16 | Try to schedule deletion of the account (Profile, delete account). | Refused with "The Head of Family was changed in the last 24 hours. You can delete this account after the undo window closes on ..." (or a generic "Could not schedule account deletion"; note what you saw). | |

## 9. Undo within 24 hours (Runs 5 and 6)
| # | Do this | Expected | Result |
|---|---|---|---|
| 9.1 | In Inbox A open the "Undo the Head of Family change." link **on a phone or in a new private window**. | The address starts `https://ls-redesign.unifolio.in/undo-head-change`. **If it opens the old sign-in screen instead, STOP and tell the owner (FRONTEND_BASE_URL is wrong).** The page says "The Head of Family on your Unifolio account was changed. If you did not agree to this, you can undo it now." and has a button; nothing has happened yet. The token has disappeared from the address bar. | |
| 9.2 | Refresh the page. | "This undo link is not valid. If you refreshed this page, open the link in your email again." (the link in the email still works). | |
| 9.3 | Open the link again from the email and press "Undo the change". | "The change has been undone. Sign in with your usual email or phone number." with a Sign in link. | |
| 9.4 | Sign in as the old head. | You are the Head again; a Terms screen asks you to agree (consent was reset); labels are back as they were; the new head's email or phone can no longer sign in. Both inboxes got "The Head of Family on Unifolio has been changed back." with no link. | |
| 9.5 | Press the undo link a second time. | "This undo link is not valid." (single use). | |
| 9.6 | (Needs the owner) After a second change, wait 24 hours or ask the owner to set the window to expired, then press the link. | "The 24-hour undo window has closed." | |
| 9.7 | Make a change, then (before undoing) take the OLD phone number or email into another account (owner sets this up) and press undo. | "The old phone or email has been taken since the change, so it cannot be undone." and nothing changed. | |

## 10. "This was not me": changing the account email or phone (the stolen-session safeguard)
| # | Do this | Expected | Result |
|---|---|---|---|
| 10.1 | Profile: change the account email to a new address you can open (Inbox C), verify the code sent to the NEW address. | The change works. The OLD email (Inbox A) receives "The sign-in email address on your Unifolio account was changed." naming the new address with letters hidden (for example "t***@example.com") and a link "This was not me, undo the change". Inbox C gets nothing about it. | |
| 10.2 | Open that link. | The address is `.../reverse-contact-change`. The page heading says "The sign-in email address on your account was changed" (for a phone change: "phone number"). Nothing has happened until you press the button "This was not me, undo the change". | |
| 10.3 | Press it. | "The change has been undone and everyone has been signed out. Sign in with your usual email or phone number." The old email works again; the new one does not. Any other signed-in browser is signed out. | |
| 10.4 | Change the phone number instead (verify the new number's code on screen). | The notice goes to the account's email (not to a phone). | |
| 10.5 | Right after any contact change, try Change Head of Family. | Refused: "The sign-in email or phone was changed recently, so the Head of Family cannot be changed until {date}. This protects your account." (this also applies after you reversed the change). | |
| 10.6 | Add an email to an account that had none. | No notice is sent (there is no old address), but the Head of Family lock still applies. | |
| 10.7 | After a reverse, press the same link again. | "This link is not valid." | |
| 10.8 | (Needs a Google account for the NEW address.) Change the account email to that Google address (Inbox C), then sign in with Google as that address in a private window, then press the "This was not me" link from Inbox A. | After the reverse, signing in with Google as that address no longer opens the account (the Google sign-in was removed with the change). The old email and phone still work. | |
| 10.9 | Change the account EMAIL to Inbox C, then change the PHONE. | Inbox A (the first, original email) receives the phone-change notice too, with its own working link. | |

## 11. Statement import and people (regression, takes 20 minutes)
| # | Do this | Expected | Result |
|---|---|---|---|
| 11.1 | Upload a CAS PDF for a new test account. | The import completes; people are detected; no "review screen" appears (it was removed); the first Self member becomes the account holder. | |
| 11.2 | On a new test account, finish onboarding, open Family. | The Change Head of Family button exists for the holder (it needs a PAN and a family member to be usable). | |

## 12. Sign-off
| Item | Who | Date | Result |
|---|---|---|---|
| All sections above done | | | |
| Failures listed (screen, steps, what you saw, screenshot) | | | |
| Anything odd that is not in this sheet | | | |

Report back to the owner. Do not retest after a fix until the owner says a fix has been deployed.
