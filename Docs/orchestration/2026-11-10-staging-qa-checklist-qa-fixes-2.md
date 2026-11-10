# Staging QA checklist: QA fixes round 2 (10 Nov 2026)

**Where:** `https://ls-redesign.unifolio.in/` (private window). **Who:** the tester. **Before:** the deploy guide is done and Claude has reported healthy. Tick every row; write what you see for any that fail and attach a screenshot. Row ids in brackets point to the 9 Nov report (A = the checklist of 6 Nov, F = finding in the report).

**Tester:** ____________   **Date:** ____________   **Browser:** ____________

## Setup you need
- A fresh account for rows C (Head of Family), with a second inbox for the new head's codes and a member who has an email and a phone.
- Synthetic statements: `r2_couple_rohan_priya_10yr.pdf` (password `MF@123`) for a first import with new funds, and the **same file again** after it, to get duplicates. A statement with a very long fund name (the r3 file has "ICICI Prudential Large Cap Fund (erstwhile Bluechip Fund) - Direct Plan - Growth Option").

## A. New funds pop-up (F1)
| # | Check | Expected | Result |
|---|---|---|---|
| A1 | Import a statement with new funds, click **View new funds** at full width (1920) | Every card sits **inside** the pop-up. No card, amount, date or arrow crosses the border. No sideways scroll | |
| A2 | Look at the fund with the longest name | The **whole name** shows, wrapped onto two lines. Nothing is cut off with "..." | |
| A3 | Open a fund row (the arrow) in the pop-up | Its transactions table opens inside the pop-up, still no sideways scroll | |
| A4 | Use a short browser window (about 600 px high) | The pop-up scrolls up and down, and the close cross stays reachable | |
| A5 | Esc, then click View new funds again | Closes with Esc, reopens as before | |
| A6 | Phone-width window, repeat A1 and A2 | Same: names wrap, nothing overflows | |

## B. Duplicates skipped on the Import complete card
| # | Check | Expected | Result |
|---|---|---|---|
| B1 | Import a statement where some lines were already saved (a statement that overlaps one imported before) | The summary line reads like **6 new funds · 448 transactions added · 12 duplicates skipped**. One line, no extra line, same card look | |
| B2 | Check the number against the person rows | The total equals the sum of the "N already saved" chips; the chips are still there | |
| B3 | A statement with exactly one duplicate | Reads **1 duplicate skipped** | |
| B4 | A first import with no duplicates | The summary line is as before, with nothing after "added" | |
| B5 | Open View new funds | **No** duplicates line in the pop-up | |
| B6 | Re-import the same statement | Still the single line **This statement was already imported** | |

## C. Enter key on the Head of Family codes (F4)
| # | Check | Expected | Result |
|---|---|---|---|
| C1 | Family, **Change Head of Family**, pick a member, Next. Type the six-digit code and press **Enter** | Goes to "Enter the four codes", the same as clicking Continue | |
| C2 | Type only three digits and press Enter | Nothing happens | |
| C3 | On the four-codes step, type a full code in one box and press Enter | That box verifies (shows **Verified**). The other boxes are untouched | |
| C4 | Type a wrong code and press Enter | The same red message under that box as with the Verify button | |
| C5 | Verify all four by Enter, then review and Confirm | Works as before | |
| C6 | Click Continue and Verify with the mouse | Still work | |

## R. Nothing else moved
| # | Screen | Result |
|---|---|---|
| R1 | Sign-in and sign-up code screens (type the code, press Enter) behave as before | |
| R2 | Import History, the Mutual Funds Overview and the Home donut look as before | |
| R3 | The Import complete card with warnings, the "Add data" flow and the New funds chips | |
| R4 | Mobile: Home, import and log-in behave as before | |

## Sign-off
All rows pass: ☐ yes  ☐ no (list the failed rows)     Owner: ____________   Date: ____________
