# Combined QA checklist (the one QA round, after M4)

**Living document.** Started 19 Nov 2026 when M1 went to staging. Each milestone adds its section when it is frozen (the deploy guide's "facts for the checklist"), so by the end of M4 this is the one list for the single QA round the program plan calls for (`2026-11-17-program-execution-and-deployment-plan.html`, section 10). Milestones get only a quick verify when they deploy; everything below is checked **once, together, after M4**, then each defect becomes a failing test first, then a fix, then a patch deploy.

**Where:** `https://ls-redesign.unifolio.in/` (and `https://ls-staging.unifolio.in/` for the old-link items), in a private window. **Data:** invented households only (the synthetic statements in `Docs/CAS Files/synthetic/pdfs/`, password `MF@123`); no real folio, PAN, name, email or phone is ever typed in. **Sizes:** 1280x600, 1366x650, 1440x810, 1536x730, 1920x1080, Chrome and Edge, light and dark (Firefox and Safari for the tutorial fallback in M4). **Phone** screens are out of scope for the redesign. **Record:** Pass / Fail / Note per row; a failing row goes to the defect list with the size, browser and a screenshot.

Note on the guard (M1): the per-network limit counts the network you test from. After a limit test wait 10 minutes (or use another network) before the next real sign-in.

---
## M1 (deployed 19 Nov 2026, tag `m1-rc`, Alembic 0054): sign-up and sign-in (Batch B), holdings hygiene (Batch C)

### Step 9 of the M1 guide (the owner's private-window checks, still open)
| # | Check | Expected | Result |
|---|---|---|---|
| M1-01 | Open the sign-up screen and the log-in screen at the five sizes | Both open; **no scrolling** at any size; the login screen has **no "OR" separator** (Google is off) | |
| M1-02 | Onboarding "How do you usually invest?" at the five sizes: first with nothing chosen, then press Continue with both questions empty | Fits with **no scrolling** in both states (the messages tighten the spacing); the two notices and Continue are all visible; labels read `I’m just getting started` and `Fund my children’s education` (curly apostrophes) | |
| M1-03 | Mutual Funds holdings: expand a fund held by two members in Family Combined | The **full folio number** shows; the eye icon hides **all** folio numbers (holdings, fund page rows, ledger row detail, opening-balance dialog, the import "unidentified funds" dialog); hidden form is `XXXX` + last four + sub-folio; Copy is dimmed with the tip "Show the number to copy it" while hidden; the choice survives a reload; default is shown | |
| M1-04 | Analytics: the category donut for a household with funds from houses that spell a category differently | One slice per category (no two labels differing only by "Scheme"/"Schemes"; Sectoral and Thematic are one slice); the slices add to 100% and match the header | |
| M1-05 | **Old link**: `https://ls-staging.unifolio.in/`, sign in with a test account and a real code | Works; nothing on the old page looks different; a rate-limit message (if triggered) still reads as a sentence | |

### Sign-up, sign-in and codes (Batch B)
| # | Check | Expected | Result |
|---|---|---|---|
| M1-06 | Log in with an email, then press Get OTP again at once for the same address | The button turns into a disabled countdown ("Get OTP again in 00:NN"), counting down each second, with one red line under it ("For your security, a new code can be requested once a minute."); at 00:00 it is live again; typing a different address makes it live at once | |
| M1-07 | Same on the Mobile number tab | Same behaviour; `98765 43210` and `+91 98765 43210` count as the same number | |
| M1-08 | On a code screen, press Resend while the server holds the code | The wait shown is the server's, not a fresh minute; with the network switched off a failed send adds **no** cooldown; the latest message is the one visible | |
| M1-09 | Leave the tab in the background for a minute during a countdown, then return | The countdown shows the real time left (catches up at once) | |
| M1-10 | Screen reader (NVDA or VoiceOver) on the login hold | One polite announcement ("Get OTP is unavailable for N seconds. For your security, …") when the hold starts and "You can request a new code now." when it ends; not read every second | |
| M1-11 | Per-network limit: from one network ask for sign-up or login codes for 11 different test mailboxes you control inside 10 minutes | The 11th shows "Too many attempts from this network. Try again in N minutes." (singular "minute" when 1); the same address is never limited by it; wait 10 minutes after | |
| M1-12 | Keyboard: Tab through log-in, sign-up, onboarding, All set | A deep-green focus ring is visible on every control; the pressed button label is white on the deep green; the chip check marks are dark on the green | |
| M1-13 | Sign-up details screen with empty fields and a server error; the All set retry message (stop the network, press Go to my dashboard) | Both fit **without scrolling** at the five sizes | |
| M1-14 | Import a statement for a member whose PAN is not in the file | An amber warning block with two lines names who the funds are imported for; "Import for these people" imports for them; readable in **dark mode** (both lines, border) | |
| M1-15 | After a real import, watch the All set screen | The third row ticks at about 2.5 s (with a small pop); the left paragraph and the right heading change about half a second later; "Go to my dashboard" works at any moment; with reduced motion there is no pop | |
| M1-16 | Same email in two spellings (`A@Example.com`, a trailing space) and a phone in two spellings | They are the same account; two addresses in one email field are refused | |

### The four Head of Family emails (real inboxes, Batch B)
| # | Check | Expected | Result |
|---|---|---|---|
| M1-17 | Run a Head of Family change between two test members whose inboxes you control; open the emails in **Gmail web, Gmail app, Apple Mail and Outlook if available** | Branded layout with logo, tag, two-colour headline, round picture, blocks and footer; light and dark; phone width; pictures load; names correct and never markup; "their", never a guessed pronoun; **DM Sans / Manrope load in Apple Mail and iOS Mail**, other programs use their normal fonts | |
| M1-18 | Email 2 (undo): the date line and the link | Reads like "10 November 2026, 5:07 PM IST"; the button and the copy-and-paste box carry the **same full link**; the link works once and only for the previous head | |
| M1-19 | Email 4 (changed back) | The wording the owner approved on 19 Nov "for now" reads right; **a designer's pass on the pictures and this email is still open** | |

### Holdings hygiene (Batch C)
| # | Check | Expected | Result |
|---|---|---|---|
| M1-20 | Fund Manager Allocation, Cards and Table | The "Assumed main manager" sentence appears nowhere; values and order unchanged | |
| M1-21 | Import that adds a member while viewing one person | The drop-down lists the new member without a reload and the page lands on **Family Combined**; an import that adds nobody stays on the person; a wrong-person import (new or existing person) lands on **that person**, also when started from Family Combined | |
| M1-22 | Ledger row detail | The Folio line shows (stored results were rebuilt at deploy) | |

### Looked at and decided later (from the reviews; not defects until the owner says)
- The eye button is 22 px (the workbook's size; the web guideline minimum is 24 px) and has no tooltip; the hidden Copy tip is a `title` only (a keyboard user does not see it); in dark mode the eye's hover background equals the surface.
- The phone dashboard always opens on the first member (it has no Family Combined landing after an import): a phone design difference, not a break.
- The developer-only `ImportHealth` page prints folios without the eye (not a user screen).
- A folio with a slash early in the text hides less than a folio with a trailing sub-folio; a folio of four characters or fewer shows in full (both as the workbook specifies).
- The undo email's picture and the round shapes are placeholders until the owner's own pictures replace them (same file names).

---
## M2 part 1 (deployed 20 Nov 2026 from `2026-11-20-staging-deploy-guide-m2.md`, tag `m2-rc`, Alembic 0054): the numbers (Batch A), shared Home graph, movers backend, tutorial pop-up
Part 2 of Batch D (benchmark checklist and legend, the day's-change pop-up, the Overview graph, the chart end-date rule) is added to this list when it ships.

| # | Step | Expected | Result |
|---|---|---|---|
| M2-01 | Analytics, Category Ranking and Performance Ranking for a household with Growth funds | Every held Direct Growth fund shows "rank of N"; the N is the same in the ranking and in the category average card for the same category and plan | |
| M2-02 | Large & Mid Cap (Direct) and Corporate Bond (Direct) | "out of" 33 and 21 (they were 32 and 20) | |
| M2-03 | A held IDCW or Bonus plan whose fund has a Growth plan | The row says it is ranked as the Growth plan (RK-8 label); a held fund with **no** Growth series reads that it has no Growth option and is not ranked (not "Not enough history") | |
| M2-04 | Category average: Sectoral/Thematic (Direct), Liquid (Direct) | About 0.27 (1Y) and 13.80 (3Y) for Sectoral/Thematic; about 2.13 (1Y) and 4.28 (3Y) for Liquid (the before and after table in the M2 guide); fund counts equal the rank's counts | |
| M2-05 | Home tile and Mutual Funds holdings column for the same household | The two XIRR figures agree and both show the as-on date; the same household's figure does not jump between a weekday and the weekend | |
| M2-06 | A fund held under a year | Shows the return since purchase labelled "not annualised", not a three-digit percentage; the holdings table's column says the same | |
| M2-07 | A fund whose flows net to zero on one day (invented test data) | A dash, not 0% | |
| M2-08 | The fund score and the fund page peer list and charts for a Growth fund | A score is shown; peers are Growth funds of the same plan only (no IDCW or index series in the lists) | |
| M2-09 | Home: the wealth graph at all period buttons, custom dates, the benchmark drop-down, hide values, light and dark | **Looks and behaves exactly as before the release** (D-3 moved the graph without changing it); each benchmark line and its text is visible in its own colour: Nifty 50 blue, Nifty 500 violet, LargeMidcap 250 amber, Midcap 150 indigo, Smallcap 250 teal | |
| M2-10 | Both import screens (Request from CAMS, and the waiting screen): the "Watch how it works, 53 seconds" link | The pop-up opens, the video plays muted, the four chapter chips jump to 4, 13, 37 and 41 s, "Watch again" and "Request Statement on CAMS" appear at the end (dark label on the bright green); Escape, the cross and an outside click close it; focus is trapped and returns to the link; phone width and dark mode readable; with the system's reduced-motion setting the video does not start by itself | |
| M2-11 | Tutorial wording against the CAMS screen | The tutorial says "from ten years ago to today" and "With zero balance folios"; the live CAMS form's wording may differ: **owner to check and tell the designer** | |
| M2-12 | The CAMS name and page and a promotional banner photo appear in the video | **Manager's sign-off needed** (not legal advice): keep, blur or reshoot | |
| M2-13 | The next morning's 14:10 digest mail | Lists a `PEER_HISTORY failed=<n> of <m>` line from the 06:00 run, with a small n | |
| M2-14 | Old link `https://ls-staging.unifolio.in/` | Works; shows the same new numbers; nothing else different | |

Known open owner decisions from this release: whether Sectoral and Thematic funds should rank in one pool (AMFI's October report counts them as two categories; `2026-11-20-rk5-cross-checks-part-2.md`); keep or remove `home-tokens.css` and the four undefined Home variables (`decisions.md`, 20 Nov).

## M3 (search and navigation): to be added when M3 is frozen
Known so far: the search box on every page; scope switching and Undo; logout clears the search; the section index on each tab and the strip; no new dates where none existed (Batches K, F, E).

## M4 (final): to be added when M4 is frozen
Known so far: a full PDF report for a large household, the disclaimer line, memory within limits during an export, a failed export offering the browser fallback (Batch I); the CAMS tutorial video and the floating checklist (Batch H); Firefox and Safari for the tutorial fallback.

## Cross-batch regression list (kept from the program plan, section 10)
Sign-up, sign-in and OTP with a real inbox and a real phone; import and the new member (the drop-down, the landing, the wrong-person case, the tutorial link); the numbers (XIRR tile and column, a rank and its total, the category average, the same household before and after); folios (eye and Copy); charts; search; navigation and dates; PDF; browser and size (Chrome and Edge at three laptop sizes, light and dark).
