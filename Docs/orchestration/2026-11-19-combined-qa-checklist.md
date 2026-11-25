# Combined QA checklist (the one QA round, after M4; M1 to M4 sections all written, 24 Nov 2026)

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
Part 2 of Batch D (benchmark checklist and legend, the day's-change pop-up, the Overview graph) is in the next table (M2-15 to M2-28). The chart end-date rule needed no change (guard tests only).

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

### M2 part 2: charts and the day's-change pop-up (Batch D, second part)
| # | Step | Expected | Result |
|---|---|---|---|
| M2-15 | Home graph: open the benchmark control | A checklist (not a drop-down); at most **3** boxes can be ticked, a fourth shows "Choose up to 3"; the last ticked box cannot be unticked; the recommended one says "(recommended)"; the choice survives a reload and is the same on the Mutual Funds Overview | |
| M2-16 | Home graph with 1 benchmark chosen | Reads exactly as before the release (the line, "Nifty 500 +12.3%" under the value, the notes), plus one legend chip | |
| M2-17 | Home graph with 2 and 3 benchmarks | One line per benchmark in its own colour (Nifty 50 blue, Nifty 500 violet, LargeMidcap 250 amber, Midcap 150 indigo, Smallcap 250 teal); an end label names each line and the labels do not overlap; hovering names the benchmarks; teal against green and indigo against violet are told apart by their labels | |
| M2-18 | Legend chips | Clicking a chip hides or shows that line and its end label; nothing is remembered after a reload | |
| M2-19 | A period that starts before a benchmark's history | That line starts where its data begins, with the note "<name> history starts on <date>."; it is never dropped | |
| M2-20 | Mutual Funds Overview | The same graph sits directly under the summary strip and above the SIP timeline; the strip and table appear first, the graph loads after; switching Family and a member changes the graph; a graph error leaves the page working; amounts show like the rest of the Overview | |
| M2-21 | Home, "What moved today" card | Unchanged; "View all by day's change" is now a live link (green, with the arrow) | |
| M2-22 | The pop-up: Fund view | Opens at once with the card's net change and totals and a "Loading every fund" placeholder; then gainers (largest first), losers, a collapsed "No change" group; the footer says the rows add up | |
| M2-23 | The pop-up: Category and Sector views | Category rows open to their funds; the sector view shows "Estimated" and the estimate footer; a view you already opened does not fetch again | |
| M2-24 | A fund whose price is late, and a fund priced only from a statement | The late fund is under "Waiting for today's price" with the clock mark and the Partial badge, never as zero; a statement-only fund is in its own block "Priced from your statement only" and is not named in Partial | |
| M2-25 | Open the pop-up on a weekend, a holiday or a morning before prices publish | It lists the last trading day's rows and the net change equals the card's, with the line "Latest prices are from <weekday date>" | |
| M2-26 | The pop-up with the network off, then on | Keeps the summary, says it could not load, "Try again" repeats the fetch | |
| M2-27 | The pop-up with values hidden | Rupee amounts become dots; percentages stay | |
| M2-28 | Pop-up keyboard and focus | Escape, the cross, "Close" and a click outside close it; focus stays inside while open and returns to the link; light and dark; at 1280x600, 1440x810 and 1536x730 | |

Known open owner decisions from this release: whether Sectoral and Thematic funds should rank in one pool (AMFI's October report counts them as two categories; `2026-11-20-rk5-cross-checks-part-2.md`); keep or remove `home-tokens.css` and the four undefined Home variables (`decisions.md`, 20 Nov).

## M3 (deployed 23 Nov 2026 from `2026-11-23-staging-deploy-guide-m3.md`, tag `m3-rc` = `9f776a34`, Alembic 0054): search (Batch K), dates (Batch E), the section index (Batch F)
| # | Step | Expected | Result |
|---|---|---|---|
| M3-1 | Top bar on every page | Ask Mira is a wide soft-green pill at the left; the family selector, + Add data, a divider and the theme toggle are at the right; the old "Search investments" input is gone | |
| M3-2 | Search box on Mutual Funds Overview: press Ctrl+S (Cmd+S on Mac) | The box opens; typing a fund house, a category, a manager, a member, a SIP or a page word shows a dropdown with chips and groups; recent funds and recent searches appear when the box is empty | |
| M3-3 | Pick a result that lives on another tab or section | You land on it with the place highlighted; if the jump needs another family member, the selector switches and an **Undo** notice appears; Undo restores the previous selection | |
| M3-4 | Press Enter with a word in the box, on each tab: Overview, Transactions, Holdings, Performance, Overlap, Other Analytics | The list you are looking at filters (Overview funds and SIPs; Transactions ledger, a type word such as "SIP" drives the type toggle; Holdings all-stocks table; Performance fund versus benchmark; Overlap pairs and common stocks; Other Analytics per-fund lists); clearing the box restores the list | |
| M3-5 | A fund name with a number ("Nifty 500", "Nifty 50") | Should find the fund (the number must not be read as an amount or a year). `decisions.md` 23 Nov records this as a finding: note whether it was fixed or still loses the word | |
| M3-6 | Home, History, Portfolio, Planning and a fund page | Jump-only search (no list filtering); Planning's three views have the box | |
| M3-7 | The all-holdings pop-up, the compare list on a fund page, Import history | Each has its own search field ("Search imports" on Import history) | |
| M3-8 | Sign out and sign in as another user | The search box shows no recents from the previous user | |
| M3-9 | "On this page" rail on Overview, Performance, Allocation, Overlap, Other Analytics | A frosted rail at the right edge lists the sections; clicking jumps; the highlight follows the scroll; Pin keeps it open; below 1100 px it is a corner pill | |
| M3-10 | Dates | Prices read "Prices as on 12 Nov 2026"; monthly data reads as a month ("Holdings as on September 2026", "Fees as on March 2026"); the market-cap list reads "Market-cap list effective 1 Jul 2026" | |
| M3-11 | Allocation and Other Analytics | A date strip sits under the tabs; an amber "N funds have older holdings" marker appears when some funds are behind; no strip appears on other tabs | |
| M3-12 | Every small "i" (hover, focus, click) | The same pop-up opens; click pins it; Escape closes it; light and dark | |
| M3-13 | Other Analytics, Valuation by Fund | No source pills, no footnote, no "As on" column; one "i" per fund | |
| M3-14 | The day's-change pop-up note | Reads "Prices as on <weekday date>" | |
| M3-15 | The old link `ls-staging.unifolio.in` | Still works; two sentences read with a month ("holdings as on September 2026", the printed-benchmark note shows "September 2026", not an ISO date) | |
| M3-16 | `GET /household/search-index` without a token | `401` (new route live and protected) | |

Known open items from this release (`decisions.md`): the Overview sold list, the Transactions period panel, the Holdings fund chip, the Performance month table, Allocation's "open this slice", picking a Planning scenario from search; the search endpoint was tested on SQLite, not yet against real Postgres data.

## M4 (frozen 24 Nov 2026, tag `m4-rc` = `355cc8a1f117210f3ec2a73a06e0ee33dac54951`, Alembic 0054; guide `2026-11-24-staging-deploy-guide-m4.md`): the PDF report (Batch I) and the floating CAMS checklist (Batch H part 2)
**The pipeline had never run end to end outside tests before the deploy: every row below is a first real check.** The manager's Claude runs step 9 of the guide (including the owner's first real export); this section is the full pass.
| # | Step | Expected | Result |
|---|---|---|---|
| M4-1 | Mutual Funds pages: the **Export PDF** button in the top bar | Visible (disabled with "Add data first" tooltip when there are no funds); opens the dialog | |
| M4-2 | Dialog choices | "Who it is for": the family or one member; "What to include": Full report, This tab, Custom (a section tree you can expand); Cover page, "Data dates on every page", "Show folio numbers" switches; "Choose at least one section" when none is ticked | |
| M4-3 | Export a Full report for the family (invented household) | A progress state, then "Your report is ready" and the file saves by itself; "Download again" saves a second copy from the browser | |
| M4-4 | Open the PDF | Cover (Prepared for, scope line, data dates), a contents page **with page numbers that match the real pages**, a heading page per tab, every section drawn for paper, a running header and footer ("Generated ... Prices as on ...", page X of Y), a notes page last | |
| M4-5 | Look for a PAN-like string and the folio numbers | No PAN anywhere; folios print in full, masked or not at all as the dialog option says | |
| M4-6 | Export one member, then "This tab" from the Allocation tab, then a Custom pick of two sections with the cover off | Each PDF matches its choice; with the cover off there is no cover and no contents | |
| M4-7 | Click Export twice in a row | The second is refused with a calm "wait" message (one report at a time, 15-second cool-down), not an error page | |
| M4-8 | A large household (the biggest synthetic statements) | Finishes; time and page count are noted; if it fails, the dialog offers "Try again", "Export fewer sections" and "Print it from your browser instead" | |
| M4-9 | A page that cannot be drawn | The report still prints; that section shows "failed to load" in place | |
| M4-10 | Open the Overlap and Other Analytics sections in a real PDF | Drawn with real data (these were not drawn with real data before the deploy: the heatmap prints as the screen's bands) | |
| M4-11 | Memory and temporary files, as read by the manager's Claude after the exports | No `500` in the log; `/tmp/unifolio-export/jobs` is empty after downloads; backend memory stays within limits | |
| M4-12 | Import, upload from CAMS | The green button opens the **floating checklist**; its first step's "Open the CAMS form" button opens CAMS; it stays on top; ticks survive a reload; light and dark | |
| M4-13 | The checklist in Chrome and in Edge; then in a browser without the floating window (Firefox, Safari) | Chrome and Edge: the floating window; Firefox and Safari: the same checklist as an in-page panel | |
| M4-14 | The checklist's closed card and banners | Closing the window leaves the closed card; no extra card around the banner | |
| M4-15 | `POST /export/report` without a token | `401` (live and protected) | |
| M4-16 | The old analytics "Download PDF" | Still works as before (left in place on purpose) | |

Known open items from this release (`decisions.md`, 24 Nov): the new wording list in each Codex report, for the owner's review (for example "Showing 15 of N fund pairs.", "<scope name>, <n> sections", "Member report · N funds · N folios"); the real recording of the CAMS walk-through video (H-5); the accepted security follow-ups (an old-file sweep at start-up, WebSocket filter, a pass tied to its job, one status code for every refusal, the Chromium sandbox); the heatmap stays as screen bands.

## XR (XIRR leads, Returns on the flip side; guide `2026-11-24-staging-deploy-guide-xirr-returns.md`, tag `xr-rc`, Alembic 0054): the two tiles, the Mutual Funds list, the Unrealised label

Run after step 8 of the guide (the stored results must be rebuilt first). Use invented households only. A young portfolio is one whose first purchase is under a year old; a mature one has several purchases and a first purchase over a year old.

| # | Check | Expected | Result |
|---|---|---|---|
| XR-01 | All Investments (Portfolio) page, young household: look at the XIRR tile | Title **XIRR**; the figure is the yearly rate (large for a young portfolio); caption `Annualised since your first investment`; amber chip `held under 1 yr`; the Lifetime / Current switch is on its own line, no overlap with the caption | |
| XR-02 | Press **Show Returns** on that tile, then **Show XIRR**, then reload the page | Title **Returns**; the plain gain (for example 6.5%); caption `Since purchase, not annualised`; **no chip**; the tile does **not** change height on either flip; after the reload it opens on XIRR again | |
| XR-03 | Mature household (several purchases, over a year) | XIRR tile with **no chip**; Returns still one press away | |
| XR-04 | A fund bought once, over a year ago, inside a mature household (Mutual Funds list) | That fund's XIRR cell shows a neutral chip `one transaction`; its neighbours show none; the household tile shows none | |
| XR-05 | Mutual Funds Overview: the same tile; switch Lifetime / Current; flip, then switch | Same behaviour as the Portfolio tile; the flipped face stays when you switch the view; each view shows its own figures and chip | |
| XR-06 | Mutual Funds list (single member, then family with a member expanded) | Columns after Gain/Loss: **Returns**, then **XIRR**; hover each header for its tooltip; the old `since purchase` line under XIRR is gone; sort by Returns and by XIRR both ways; family parents and members each show their own figures and chip | |
| XR-07 | Unrealised Gain card on both pages | The small percentage reads `+x% return on invested` with an "i"; the tooltip reads `Unrealised gain as a share of what you currently have invested. Not annualised.` | |
| XR-08 | Dark mode, then a 1280x600 window | Tiles, chips and the list read well; no horizontal scroll that was not there before | |
| XR-09 | Export the PDF report (Overview page) | The holdings table has Returns and XIRR columns and the chips; no numbers touch each other; fund names take at most three lines | |
| XR-10 | A household whose flows cannot give a yearly rate (synthetic) | Dash in both faces and both columns; **no** Show Returns button; no chip | |
| XR-11 | Performance page, fund page, Allocation fund-manager card, the phone layout | Unchanged; their XIRR agrees with the tile and the list | |
| XR-12 | Immediately after the deploy, a mature fund in the list | Returns shows a number, not a dash (the stored results were rebuilt) | |

## QA-round patches (built 25 Nov 2026; ONE combined deploy of patches 1 to 3 after everything is built; rows are added as each part lands)
All visual checks are the owner's, in this round (decision 25 Nov 2026): look at light and dark mode and at widths 1,440, 1,280, 1,100 and 1,024. Copy never changed except the named new strings.

### Visual pass (Plan 3: greens, the "i", search and benchmark hints, icon tiles)
| ID | Where and how | What you should see | Result |
|---|---|---|---|
| VP-01 | Every green button on the sign-up and log-in screens, export dialog, the CAMS checklist, the XIRR disclaimer dialog, onboarding Continue and Got it | Text is **white** on the green in every state except disabled (hover, pressed, focus ring still work); no dark text left on any green button | |
| VP-02 | The "i" next to labels (Overview cards, ValuationByFund, date strip, SIP timeline, Performance page, benchmark note, summary strips) | The "i" is clearly bigger and easier to see; hover inverts it; a keyboard focus ring shows; **no row grows taller and no label wraps** because of it | |
| VP-03 | Search box, empty, with no recent searches | One quiet hint line (the built wording) shows under the box; it disappears when you type; it is not selectable as a result | |
| VP-04 | Search results: hover or arrow onto a member row and a fund row that already says "Switches to ..." | The hover hint is **not** repeated (the tag is enough); other rows still show their hint | |
| VP-05 | Wealth graph benchmark checklist: open it, then tick a 4th benchmark | "Choose up to 3" shows as soon as the panel opens; a 4th tick turns it into the warning; the panel does not jump in height | |
| VP-06 | Home, Movers header | Underlined link look with the correct offset and a visible focus ring | |
| VP-07 | Onboarding questions 2 and 3 (investor type, goals) and the "All of it" row | Each option has a soft grey tile with a green line icon (same look in both questions); chips and rows are not taller than before at the five onboarding viewport sizes; selected rows still show the green wash | |
| VP-08 | Dark mode for VP-01 to VP-07 | Everything above reads well; no light patches | |

### D-12: the category average uses the rank's funds
| ID | Where and how | What you should see | Result |
|---|---|---|---|
| D12-01 | Performance page at 1 year, a fund with a rank | "Rank N of M" and "Category average covers M funds" show the **same M** | |
| D12-02 | The same at 3 years and 5 years | Same M for rank and average in every period; 3Y and 5Y numbers did not change from before the deploy | |
| D12-03 | The 1-year category average value, before and after (the number gate sheet) | The 1-year average moved only as the approved before and after sheet says; a fund under 3 years still reads "Not enough history" for its own rank | |
| D12-04 | A small category (few funds at 3 years) | The "thin category" note still follows the 3-year count | |

### Head of Family, part A: a statement no longer blocks the change
| ID | Where and how | What you should see | Result |
|---|---|---|---|
| HA-01 | Start a Head of Family change while a family member has a statement open (uploaded, not confirmed) | The change is **not** blocked; the old line "Finish or cancel the statement you are importing first." is gone | |
| HA-02 | Complete the change (all four codes) in that situation | You are signed out; on the sign-in screen the "Head of Family changed" notice has **one extra quiet line** (file icon) saying the unconfirmed statement was removed; with no open statement there is no extra line | |
| HA-03 | Confirm a statement and, at the same moment, press Confirm the change (two windows) | If the statement is being saved, a calm indigo notice (clock icon) says "A statement is being saved. Try again in a minute." with a **disabled grey button counting down from 1:00**, then a green **Try again**; no red error; nothing lost and the codes still valid | |
| HA-04 | Press Try again after the countdown | The change completes (or shows the notice again with a fresh 1:00 if a save is still running) | |
| HA-05 | Dark mode for HA-03 and HA-02 | Notice colours flip; text keeps contrast; the tile stays a soft grey | |
| HA-06 | Staging check by Claude (not the owner): the Postgres race tests (`test_head_change_races.py`) run on the staging database | All pass; the swap never waits and the confirm is never the one aborted | |
| HA-07 | The wording (**confirmed by the owner, 26 Nov 2026**, so this row only checks it reads as written) | "Nothing is lost, and your codes are still valid." and "A statement you had uploaded but not yet confirmed was removed. Upload the file again when you are ready." | |

### PDF export timing log (patch 1) and speed (patch 3)
| ID | Where and how | What you should see | Result |
|---|---|---|---|
| ES-01 | Run one full export on staging, then read the backend log | One extra `export timing:` line beside `export finished:` with stage durations and the contents outcome; no names, ids or amounts; the PDF is as before | |

### Patch 2: Head of Family B, C, D and D-2 (a waiting CAMS request, the checklist, the real link)
| ID | Where and how | What you should see | Result |
|---|---|---|---|
| HB-01 | Request from CAMS (desktop), then close the checklist or reload the page, then open Add data again | A card "CAMS request waiting" with the time left, **Upload the file** and **Cancel request**, above the "Waiting for CAMS email" block; it shows after the reload with no checklist notes | |
| HB-02 | Press **Cancel request** on the card (also right after a reload) | The request is cancelled, the choice screen comes back, the card is gone; no error text | |
| HB-03 | Open Add data for the same member in a second browser or a private window | The same waiting card shows there | |
| HB-04 | Import a statement for that member (upload a file in the waiting view) | The waiting card is gone afterwards; **another member's** waiting request is untouched | |
| HB-05 | With a waiting request: tick checklist items, press I have the file, Close this checklist, close the floating window, switch tabs and come back, open Import History and press Back | **The screen never changes** because of any of these; Back from Import History shows the waiting card again | |
| HB-06 | Request page (desktop): the "A small checklist will float over the CAMS page to guide you." row | A row with an icon, that sentence, a **Continue without it** button, and "You can close it any time." under it; pressing the button shows "Checklist off for this request. CAMS will open on its own." with **Turn it back on**, which restores the row; neither button starts a request; **on a phone the row is not shown** | |
| HB-07 | The checklist strip: floating window open; window closed; page reloaded; a browser that cannot float (in-page panel) | A progress bar with "N of 5 done" and the step name; when closed: **Reopen checklist** and **Reset checklist**; Reset only resets the checklist and does **not** cancel the request; panel mode shows the strip with Reset | |
| HB-08 | **D-2, in Chrome and in Edge:** press **Request Statement on CAMS** once | CAMS opens in a new tab **by itself** and the floating checklist opens from the same click; there is **no** "Open the CAMS form" button anywhere; if you block the floating window in site settings, CAMS still opens and the checklist shows in the page | |
| HB-09 | Head of Family change dialog while a member has a waiting request | One quiet line "A CAMS request for <name> is still waiting. It does not stop this change." with an info icon and **no button**; the member is still selectable and the change works | |
| HB-10 | (Claude, deploy guide step 9b) the one-off clean-up of stuck requests | The dry run prints four counts and writes nothing; after the owner's yes, `--apply` closes only requests past 48 hours or superseded by a later import | |
| HB-11 | The wording (**confirmed by the owner, 26 Nov 2026**, so this row only checks it reads as written) | "for <name>", "We will use the file as soon as you upload it.", "Expires in N h", "Show checklist", "Upload the file", "Checklist off for this request.", "CAMS will open on its own.", "Turn it back on" | |

### Patch 3, the safe part (PDF export)
| ID | Where and how | What you should see | Result |
|---|---|---|---|
| ES-02 | Export a full report (all 24 sections) and watch the dialog; close it and reopen it while it runs | The elapsed time counts up ("N min N s so far"), "Finishing the PDF" shows at the last stage, the "can take a few minutes" note shows for a large report, and the time keeps counting after you reopen the dialog | |
| ES-03 | Open a **new** export next to an **old** one (the staging look-gate baseline, if kept) | The pages look the same; **only the contents page now has page numbers** (the owner decision QA-19 A) | |
| ES-04 | (Claude, after the first export) the backend log and the container memory | The `export timing:` line shows the stages; memory at idle is about 800 MB lower (the old Download PDF route no longer launches a browser at start-up) | |
| ES-05 | The old analytics page's Download PDF button | It still returns a PDF (it launches its browser on first use) | |

## Cross-batch regression list (kept from the program plan, section 10)
Sign-up, sign-in and OTP with a real inbox and a real phone; import and the new member (the drop-down, the landing, the wrong-person case, the tutorial link); the numbers (XIRR tile and column, a rank and its total, the category average, the same household before and after); folios (eye and Copy); charts; search; navigation and dates; PDF; browser and size (Chrome and Edge at three laptop sizes, light and dark).
