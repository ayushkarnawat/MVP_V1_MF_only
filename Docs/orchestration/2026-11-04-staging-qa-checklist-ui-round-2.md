# Post-deploy staging QA checklist: UI round 2 and the six life goals (`ls-redesign.unifolio.in`)

Task 7.2 of the UI round 2 plan. **Printable and self-contained.** Run it in one sitting after the deploy guide (`2026-11-04-staging-deploy-guide-ui-round-2.md`) section 1 is finished and the executing Claude has posted its final report. It extends the plan's 17-row table into checks you can follow step by step. **DRAFT until the deploy is approved; nothing here runs before then.**

**Environment:** `https://ls-redesign.unifolio.in` (same API, database, worker and cron as `https://ls-staging.unifolio.in`). VM commands run in `/opt/unifolio-redesign/deploy/leapswitch` with `sudo`. Branch under test: `leapswitch-redesign` at the final merge commit (never `main`, never `feat/leapswitch-staging`).

**Date / tester / commit under test (`git log -1 --format=%h` on the VM):** ______ / ______ / ______

**Test data (never commit real statements):** synthetic statements in `Docs/CAS Files/synthetic/pdfs/realistic/` (password `MF@123`): `r1_first_jobber_riya_3yr.pdf` (Riya Sharma, one person), `r2_couple_rohan_priya_10yr.pdf` (Rohan and Priya Kulkarni, one family statement), `r3_family_minor_suresh_13yr.pdf` (Suresh, Lakshmi and Aarav Iyer). Plus the owner's own real statements for the rows that say "real". Use a **throwaway account** for the sign-up walk and delete it afterwards, and one **existing account** for the rows that need a user who already finished sign-up.

**What the deploy did to the data:** migration 0053 cleared **every user's saved goals**. Existing accounts show "Not answered" for goals until they pick again; that is expected, not a bug.

**How to fill it in:** write Pass, Fail or Skip and a short note, initials in the last column, and take a screenshot for every row marked (screenshot). "Look for" means the exact words are not fixed by the sources: judge by what is described. **Rule:** any failed row blocks sign-off until the owning stage fixes it; the stage that owns each group is in its heading.

**Before you start:** hard refresh (Ctrl+Shift+R) in a private window so no cached old front end runs. An old cached front end sends old goal codes and gets a 422: that is expected and is row F9.

---

## Group A: Deploy health (guide section 1)

| # | Step | How to check | Expected result | Pass / Fail / Notes | Initials |
|---|---|---|---|---|---|
| A1 | Migration applied, one head | `sudo docker compose run --rm -T backend alembic current` | `0053 (head)` | | |
| A2 | Branch and commit | `cd /opt/unifolio-redesign && git rev-parse --abbrev-ref HEAD && git log -1 --format=%h` | `leapswitch-redesign`; hash equals the deployed commit in guide step 5 | | |
| A3 | Containers healthy | `sudo docker compose ps` | postgres, backend, worker, caddy running, none restarting | | |
| A4 | Health URLs | `curl -s -o /dev/null -w "%{http_code}\n"` on `https://ls-staging-api.unifolio.in/health`, `https://ls-redesign.unifolio.in/`, `https://ls-staging.unifolio.in/` | `200` three times | | |
| A5 | Goals schema | guide step 15 (`\d users`, `pg_type`, the CHECK definition) | no `primary_goal` column; no `primarygoal` type; CHECK names the six codes and `1 AND 6` | | |
| A6 | Rollback is available | `sudo docker image ls \| grep -E "leapswitch-(backend\|worker)"`; guide steps 6 and 7 | `:previous` and `:latest` differ; a fresh dump from before the deploy is listed in object storage | | |
| A7 | No unexplained errors | `sudo docker compose logs --since 30m backend worker \| grep -i -E "error\|traceback\|exception" \| head -30` | nothing, or lines you can explain; **none** about `primary_goal`, `primarygoal` or a missing column | | |
| A8 | New bundle loads | private window, hard refresh on `https://ls-redesign.unifolio.in` | shell loads, no console errors on first paint | | |
| A9 | Main link unchanged | `https://ls-staging.unifolio.in` in a second profile: Dashboard, Analytics, History | behaves as before the deploy | | |

## Group B: Home (stage S1 and S2)

| # | Step | How to check | Expected result | Pass / Fail / Notes | Initials |
|---|---|---|---|---|---|
| B1 | Greeting follows the member | family view, then switch to a member in the header dropdown | family view greets the head by first name; a member view greets that member's first name | | |
| B2 | Donut hover (screenshot) | hover a slice | the other slices dim; no layout jump | | |
| B3 | Donut pop-up | click a slice with funds | pop-up shows the class, its value and share, and its funds (name, value, share of class), largest first | | |
| B4 | Keyboard | Tab to the donut, Enter or Space on a slice, Esc | the pop-up opens and closes; focus returns to the slice | | |
| B5 | Partial coverage | pick a class where only some funds have disclosures (the pop-up funds do not add up to the class value) | a separate "Not attributed" line shows the remainder (class value minus the funds); it is never shown as a fund; at full coverage no such line | | |
| B6 | Classes without funds | click Real Estate, Others or a "Coming soon" class | no crash; no fund list (or an empty state); "Coming soon" classes are not clickable | | |
| B7 | Old stored data | an account whose stored analytics predate the `funds` field (an older household) | donut renders as before; pop-up shows no funds, no error | | |

## Group C: Adding data and new funds (stage S1, S2)

| # | Step | How to check | Expected result | Pass / Fail / Notes | Initials |
|---|---|---|---|---|---|
| C1 | Add data asks which member | family view: Add data and Add Investment | a pop-up asks which member, nobody pre-selected, Continue disabled until one is chosen | | |
| C2 | Member view skips it | member view: Add data | no pop-up; the header dropdown is still there | | |
| C3 | New funds after an in-app upload (screenshot) | existing account: Add data and upload `r3_family_minor_suresh_13yr.pdf`, confirm | the notice shows counts and a collapsible "New funds" section: each fund with its invested amount, latest transaction date and its transactions (newest first, at most 20, then a way to see all in Import History) | | |
| C4 | Invested amount | pick a fund in that list that has a redemption | the invested amount counts purchases, SIPs and switch-ins only (redemptions are not subtracted) | | |
| C5 | Sign-up upload shows no list | throwaway account: sign-up upload of `r1_first_jobber_riya_3yr.pdf` | no "New funds" section on the result | | |
| C6 | Import History | Profile, Import History | the in-app import (C3) shows its new funds; the sign-up import (C5) shows none | | |
| C7 | Sign-up upload confirmed late | start the sign-up upload but do not confirm; in a second tab finish onboarding; then confirm in the first tab | confirm shows no new funds; Import History still shows none for it (it counts as a sign-up import) | | |
| C8 | Same statement again | upload `r3` a second time as the existing account | nothing new: no "New funds" section (all rows are duplicates) | | |
| C9 | real | an existing member's own newer statement with at least one fund they never held | exactly that fund is listed as new | | |

## Group D: Name mismatch and add as family member (stage S3)

| # | Step | How to check | Expected result | Pass / Fail / Notes | Initials |
|---|---|---|---|---|---|
| D1 | The pop-up (screenshot) | new throwaway account signed up as "Riya Sharma": upload `r2_couple_rohan_priya_10yr.pdf` | a pop-up titled "This is Riya Sharma's account" (look for) says whose account it is and offers **Add {name} as a family member** and **Upload a different file**; no "Yes, that's me" button | | |
| D2 | Add as family member | choose Add as a family member | the import continues; **Riya is unchanged** (same name, no PAN, no funds); Rohan and Priya are added as new members with their funds; **no "Complete profile" dialog appears** (removed 4 Nov after QA): after "2 members detected" and the importing dialog the user goes straight to the next screen (All set in onboarding, Mutual Funds inside the app). Rohan and Priya show an "N% complete" nudge on their own member view and on their Profile > Family cards | | |
| D3 | Upload a different file | repeat D1 and choose the other button | the session is discarded; nothing is imported; the upload screen returns | | |
| D4 | The head's own file later | then upload `r1_first_jobber_riya_3yr.pdf` | it matches Riya (the account holder) by name; her PAN is stored on her; Rohan's and Priya's PANs stay on them; no "taken" PAN pop-up | | |
| D5 | Variant typo | new throwaway signed up as "Riya Anil Sharmma": upload `r1` | no mismatch pop-up; Riya's name is updated to the statement's name with a name notice (a typed name is provisional) | | |
| D6 | Large typo | new throwaway signed up as "Kavya Desai": upload `r1` | the mismatch pop-up appears again (known limit, accepted) | | |
| D7 | PAN already belongs to the account holder (needs a prepared file) | two open uploads in two tabs: tab 1 the account holder's own file, not confirmed; tab 2 a file with a **different name and the same PAN**; choose Add as a family member | a pop-up with the message "...PAN already assigned to the account holder. Finish or discard the other upload before trying again."; the account holder is not renamed. If the second file does not exist, mark **Skip** (covered by the automated tests) | | |
| D8 | Permanent version of D7 | after the first upload is confirmed (the account holder holds the PAN), try the second file | message "This statement includes a PAN that already belongs to the account holder. Upload a different file."; buttons leave the flow | | |

## Group E: Fund page, Mutual Funds and Portfolio screens (stage S1 and S4)

| # | Step | How to check | Expected result | Pass / Fail / Notes | Initials |
|---|---|---|---|---|---|
| E1 | Category label | Mutual Funds fund list | only the category (for example "Flexi Cap Fund"), no `Equity Scheme -` prefix | | |
| E2 | Overlap compare | Portfolio, Overlap, the pairs table | column **Overlap comparison** with a **View more** link in place of Combined Weight; View more opens the two-fund comparison at `/portfolio/mutual-funds/overlap/compare/...`; Back returns to the overlap page; the individual fund's own Top Funds with Overlap list still works | | |
| E3 | Returns toggle labels | a fund page | `Model Portfolio Returns` and `Actual XIRR`, each with an info icon that opens on hover, on focus and on tap | | |
| E4 | Toggle position and Actual XIRR graph (screenshot) | choose Actual XIRR on a held fund | the toggle sits in the performance card above the period buttons and drives both graph and table; grouped bars, one pair per period (1Y, 3Y, 5Y, since first investment), your holding and the benchmark with the same cash flows | | |
| E5 | Bars equal the table | compare every bar value with its table cell | identical | | |
| E6 | Not-held, no-benchmark, loading, error states | a fund not held; a fund with no benchmark; throttle the network; block the request | each shows its designed state, no blank chart | | |
| E7 | Inception unchanged | switch back to Model Portfolio Returns | same as before this release (compare with the S4 screenshot) | | |
| E8 | Benchmark naming | the Benchmark row and chart legends | the index name is shown (from `benchmark_label`); the "how it was chosen" line and its info icon from the earlier release still work | | |

## Group F: The six life goals (stage S5)

| # | Step | How to check | Expected result | Pass / Fail / Notes | Initials |
|---|---|---|---|---|---|
| F1 | Existing accounts after the migration | sign in with an account that had goals before | Profile shows goals as "Not answered" with an Add control; nothing crashes; Home loads | | |
| F2 | Six goals in Profile | Profile, Financial details, goals dialog | six options (Build my wealth, Plan for retirement, Fund my children's education, Buy a home, Achieve financial freedom, Plan my taxes) and Select all; save one, save several, save all six | | |
| F3 | Saved goals show | reopen Profile | the chosen goals show as chips | | |
| F4 | Empty selection | try to save with nothing selected | blocked on screen (no request, or a clear error) | | |
| F5 | In sign-up | row G7 | the same six goals with Select all and Clear all | | |
| F6 | Mobile goals screen (under 768 px) | the mobile sign-up goals step | the same six goals, works, Skip still there | | |
| F7 | Saved-code safety | (Claude, API) `PATCH /auth/me` with one old code, an empty list, seven codes, `null` | old code 422, empty 422 "Pick between 1 and 6 goals.", seven 422, `null` leaves goals unchanged | | |
| F8 | Report script (Claude, VM) | `python3 -m scripts.report_onboarding_goals` in the backend container | prints the counts with a `picked all` figure, no error | | |
| F9 | Old cached front end | a tab left open since before the deploy, save goals without refreshing | a clear error, not a blank page; a hard refresh fixes it | | |

## Group G: Sign-up (stage S6, throwaway account)

| # | Step | How to check | Expected result | Pass / Fail / Notes | Initials |
|---|---|---|---|---|---|
| G1 | Account creation (screenshot) | sign up with a phone number and its code | the split-card layout (form block centred, left panel, floating sketches); the code step has the resend countdown | | |
| G2 | Name and email | enter the name as on the PAN card and an email, then its code | the account is created; no duplicate-member error | | |
| G3 | Screen 4 required (screenshot) | on "Help us personalise your experience": nothing selected; press Continue | nothing is pre-selected, **no Skip**; both errors show and focus goes to the first; answering one only shows only the missing error | | |
| G4 | Select all | goals heading | **Select all** selects all six and becomes **Clear all**; Clear all clears them | | |
| G5 | Continue | answer both | one save; the next screen is Connect accounts (step 5 of 5) | | |
| G6 | Connect accounts | the screen | "What would you like to connect first?"; only **Mutual funds** can be selected; Stocks and ETFs, PMS and AIFs, Real estate, Gold and Bank accounts show "Coming soon" and ignore clicks and keys; no skip | | |
| G7 | Import | Continue, upload `r1_first_jobber_riya_3yr.pdf`, confirm | today's import screens (no step bar); the import completes | | |
| G8 | All set (screenshot) | after the import | "You're all set!" with its status rows and an "Accounts being imported" card listing only real rows (Mutual funds, imported via CAS statement); no timed redirect | | |
| G9 | Finish | press "Go to my dashboard" once | Home opens; onboarding is complete; a second click does not send a second request | | |
| G10 | View details | repeat G8 and press "View details" | Import History opens (completion is written first) | | |
| G11 | Reload and resume | reload on each screen: name step, screen 4, Connect accounts, mid-import, All set | each resumes on the right screen with answers kept; **after a confirmed import with onboarding not complete, a reload lands on All set** | | |
| G12 | Back keeps answers | from Connect accounts press Back | screen 4 with the answers still selected | | |
| G13 | Email change on Back | go Back to the name and email screen, change the email | a new code goes to the **new** address; the new email is stored only after the code is verified; a taken address is refused; resend respects the 60 second wait | | |
| G14 | No "changed" email during sign-up | check the old address's inbox for G13 | **no** "your email was changed" notice arrives (the change is recorded but not emailed before sign-up completes) | | |
| G15 | Old email after verify | try to sign in with the old email | it no longer signs in | | |

## Group H: Login (stage S6)

| # | Step | How to check | Expected result | Pass / Fail / Notes | Initials |
|---|---|---|---|---|---|
| H1 | Email login | sign in with an existing email | code step shows the masked identity; Edit returns with the value kept; resend countdown; signs in | | |
| H2 | Mobile login | sign in with a mobile number | same behaviour | | |
| H3 | No Google button | the sign-in screens | no Google button | | |
| H4 | Wrong code and expired code | enter a wrong code, wait for expiry | clear errors; no crash | | |

## Group I: Mobile, motion and accessibility

| # | Step | How to check | Expected result | Pass / Fail / Notes | Initials |
|---|---|---|---|---|---|
| I1 | Mobile | a browser under 768 px (or a phone) | the older mobile screens render and work, including the goals step with six goals | | |
| I2 | Reduced motion | OS "reduce motion" on | the sketches stop floating | | |
| I3 | Keyboard walk | sign-up from first screen to All set with only the keyboard | every control reachable; visible focus; errors announced; screen 4 option groups are one Tab stop each (arrow keys move inside) | | |
| I4 | Tablet width | about 800 to 1024 px | layout holds, no overlap or clipped text | | |

## Group J: Regression of the earlier release (smoke; the intern's full checklist stays separate)

| # | Step | How to check | Expected result | Pass / Fail / Notes | Initials |
|---|---|---|---|---|---|
| J1 | Notice after sign-up is complete | an existing account: Profile, change the email, verify the new one | the **old** address now receives the "changed" notice with the undo link (the sign-up exception must not leak to finished accounts) | | |
| J2 | Head of Family | Family page for an account with a head | loads; the Change head dialog opens; no console errors | | |
| J3 | Fund logos and card headings | Mutual Funds, Fund page | logos present, one heading per card, green primary buttons | | |
| J4 | Valuation reasons | a fund with too little data | a plain "not enough data" reason, not a bare dash | | |

## Group K: Rollback readiness

| # | Step | How to check | Expected result | Pass / Fail / Notes | Initials |
|---|---|---|---|---|---|
| K1 | Guide section 3 read through | the owner reads the rollback section | the order is clear: migration down first (while the new image still has `0053`), then the image, then the front end; a full restore needs the owner's explicit word | | |
| K2 | Variant flip (test build only, not on staging) | in a local build flip the `variant` in `App.tsx` | the old sign-up screens return | | |

---

## Sign-off
- [ ] Every row above is Pass or an explained Skip (D7 may be Skip if the prepared file does not exist; C9 and the other "real" rows need the owner's own statements).
- [ ] The owner has checked the saved queries outside the repo (guide step 19).
- [ ] Any Fail is written up with its row number and goes back to the owning stage; the row is re-run after the fix.
- Result: PASS / FAIL.   Signed: ______   Date: ______

**Who records:** Claude fills in the results table from the owner's words and screenshots; the owner decides pass or fail.
