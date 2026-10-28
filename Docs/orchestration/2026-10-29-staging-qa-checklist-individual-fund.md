# Post-deploy staging QA checklist: Individual Fund release (`ls-redesign.unifolio.in`)

**Printable and self-contained.** Run it in one sitting after the deploy guide (`2026-10-29-staging-deploy-guide-individual-fund.md`) section 1 is finished and the manager's Claude has posted its final report (the owner receives this file after the technical steps). Tick one row at a time. The owner or the manager does every account creation, sign-in and password entry; the orchestrator cannot reach the VM, so whoever runs a command pastes its output.

**Environment:** `https://ls-redesign.unifolio.in` (same API, database, worker and cron as `https://ls-staging.unifolio.in`). VM commands run in `/opt/unifolio-redesign/deploy/leapswitch` with `sudo`. Branch under test: `leapswitch-redesign` (never `main`, never `feat/leapswitch-staging`). Use a household with real statements and at least two overlapping funds (the owner names it). Synthetic statements: `Docs/CAS Files/synthetic/pdfs/realistic/`, password `MF@123`. Mockups: `Docs/Web app UI mockups MFs.pdf`.

**Date / tester / commit under test (`git log -1 --format=%h`):** ______ / ______ / ______

**Already answered by the 28 to 29 Oct automated run (do not repeat):** A1 to A4, A6, A7, B3, B4, B6 pass. **Still open (manual):** A5, A8, B5, C1 to C13, D1 to D21, E1 to E9, F1 to F4. Rows D7, D8, E8, B1, B2 and the new row D22 were rewritten for the later redeploy (`2026-10-29-staging-redeploy-guide-holdings-click-and-qa-fixes.md`).

**How to fill it in:** write Pass, Fail or Skip and a short note in the notes column; initials in the last column. "Expected: look for ..." means the exact text is not fixed by the sources; judge by what is described. **Rule:** any failed row blocks sign-off until it is fixed and re-run, or recorded as an owner-accepted Low with the owner's initials. Any failure in the fund page's money or percent numbers (Group C) blocks sign-off; C12 and F4 cannot be accepted as Low.

---

## Group A: Deploy health

| # | Step | How to check | Expected result | Pass / Fail / Notes | Initials |
|---|---|---|---|---|---|
| A1 | No migration; head still 0046 | `sudo docker compose run --rm -T backend alembic current` | `0046 (head)` | | |
| A2 | Branch deployed | `cd /opt/unifolio-redesign && git rev-parse --abbrev-ref HEAD && git log -1 --format=%h` | `leapswitch-redesign`; hash equals the deployed commit recorded in guide section 1, step 5 (includes IF-E) | | |
| A3 | Containers healthy | `sudo docker compose ps` | postgres, backend, worker, caddy running, none restarting | | |
| A4 | Health URLs | `curl -s -o /dev/null -w "%{http_code}\n"` on `https://ls-staging-api.unifolio.in/health`, `https://ls-redesign.unifolio.in/`, `https://ls-staging.unifolio.in/` | `200` three times | | |
| A5 | New bundle loaded | Private window, hard refresh on `https://ls-redesign.unifolio.in` | Shell loads; no console errors on first paint | | |
| A6 | Rollback images exist | `sudo docker image ls \| grep -E "leapswitch-(backend\|worker)"` | `:previous` and `:latest` for both; a fresh backup dump from before the deploy is listed in object storage (guide section 1, steps 6 and 7) | | |
| A7 | No unexplained errors | `sudo docker compose logs --since 15m backend worker \| grep -i -E "error\|traceback\|exception" \| head -30` | Nothing, or lines you can explain (paste them) | | |
| A8 | Old link unchanged | `https://ls-staging.unifolio.in` in a second profile: Dashboard, Analytics, History | Behaves as before | | |

## Group B: Timings and data checks (guide section 1, steps 13 to 19)

| # | Step | How to check | Expected result | Pass / Fail / Notes | Initials |
|---|---|---|---|---|---|
| B1 | T14 tiers 1 and 2 | Redeploy guide step 12 (`--scheme-filtered --schemes 4 --runs 3 --simulate-fresh-cache`) | Tier 1 under 300 ms; tier 2 first call per fund under 100 ms and steady calls under 50 ms (the script may still print 50 ms for the first call: judge by 100). 28 to 29 Oct: tier 1 312 to 322 ms; tier 2 first calls 77 to 97 ms, fund 2 call 2 at 95 ms, fund 4 call 5 at 83 ms: **owner-accepted Low** (limit then 50 ms; new limit set). Rerun values must meet the new limits. Paste the output | | |
| B2 | T14 tier 3 | Redeploy guide step 13 (`--scheme-filtered --schemes 4 --runs 3 --simulate-fresh-cache --include-score`; the flag `--simulate-fresh-cache` is required) | First open of a category under 5.5 s; second open under 300 ms. 28 to 29 Oct: fund 1 first open 5,108.9 ms (others 3.8 to 4.4 s) against the old 5 s limit: **owner-accepted Low**; second opens 3.2 to 4.8 ms. The run may write up to one `fund_scores` row per fund for today plus peer rows (expected). If it misses the new limit, BDF13 before touching the cache design | | |
| B3 | V5 benchmark history | V5 query, guide section 1, step 13 | Both `nifty_largemidcap_250` and `nifty_midcap_150` (`tri`) return a row spanning 3 years or more | | |
| B4 | V7 sector coverage | V7 query, guide section 1, step 13 | **Record the numbers, owner decides** (no numeric limit; not pass or fail by threshold). Owner decides whether D7 needs a follow-up | | |
| B5 | V6 deletion leaves nothing | Guide step 19: the manager deletes a throwaway user (not the main one); Claude then runs `select count(*) from analytics_sections where user_id = '<deleted user>'` | `0` | | |
| B6 | Analytics recompute after the deploy | Guide step 15: wall time recorded | Exit 0 and under 15 minutes (27 Oct: 485 s). Needed so C11 compares the freshly stored overlap section | | |

## Group C: Individual Fund page (open a fund from Planning "By family member" or any fund link)

Check each row in the family scope and, where it applies, with one member selected. **Any failure in the fund page's money or percent numbers blocks sign-off.**

| # | Step | How to check | Expected result | Pass / Fail / Notes | Initials |
|---|---|---|---|---|---|
| C1 | Overview loads on real data | Open a fund; read the header, tiles, chart | Name, plan, category and AMC in the header; summary tiles filled; performance chart draws the fund line and the category line on the fund's own dates; no console errors | | |
| C2 | Overview: unavailable reasons | Open a fund with no disclosure, if one exists in the household | Text such as "Holdings not available yet for this fund house." instead of a crash | | |
| C3 | Insights tab | Open Insights | Fact rows, strengths and considerations render; no blank cards | | |
| C4 | Insights: See Overlap link | On the overlap fact row, click "See Overlap" | Opens the Overlap tab of the same fund; the row's evidence does not also open. (The link is nested inside a button row: a known accessibility compromise from IF-D default 14, not a new bug) | | |
| C5 | Overlap tab, normal state | Open the Overlap tab | Donut, three-part distribution bar, common stocks table, sector grouping with in-place expansion, one "Quick insights" sentence and the "Top Funds with Overlap" list | | |
| C6 | Overlap tab, comparison state | Click (or Enter) a fund in "Top Funds with Overlap" | Same URL; both funds' headers (name and current value only), overlap donut, a "Back to <fund>'s overlap" control, six sub-tabs (Overview, Common Holdings, Unique Holdings, Sector Comparison, Market Cap Comparison, Performance Comparison) and a "Key takeaways" sentence | | |
| C7 | Comparison sub-tabs | Open each of the six sub-tabs | Each loads; Performance Comparison draws both lines; only the selected panel shows | | |
| C8 | Comparison Back | Click Back | Returns to the normal state without a reload; focus returns to the opened row | | |
| C9 | Overlap across scope switch | Switch the family member or open another fund while in comparison | Starts again from the normal state | | |
| C10 | Overlap unavailable states | A fund with no disclosure or a fund not held in the chosen view | "Holdings not available yet for this fund house." or "You don't hold this fund in this view."; the comparison keeps its Back control | | |
| C11 | **Overlap agreement (same pair)** | Pick the pair named in the Insights overlap fact (for example "Portfolio overlap with <fund> is 35%."). Note the figure. Open the Overlap tab, open that same pair in the comparison and note the overlap shown | **Expected: the figures agree.** Insights uses the stored analytics overlap; the Overlap tab computes live from the holdings. In the golden fixtures the Insights text said 35% while the Overlap routes said 18.0000 for the same pair (open backend question BA4). If the figures differ on real data, record both numbers, the pair and the date; the owner decides: fix (Backend) or accept with the reason written here. A difference is a Fail until decided | | |
| C12 | **Holdings lifetime XIRR (B12 of the earlier QA)** | On a real household compare the lifetime XIRR on the Holdings (holdings bundle) with the Mutual Funds `analyticsCombined` portfolio XIRR. NEEDS CHECK: exact screens and field names | Both agree to display precision (the front-end fixtures differed, 0.1612 vs 0.1069, fixture only). A real disagreement is a Fail: Backend (data) or Frontend (wrong field). Cannot be accepted as an owner-accepted Low | | |
| C13 | Fund page for a member scope | Select a family member, open a fund | Figures change to the member's holding; a fund the member does not hold shows the "not held" text, not a crash | | |

## Group D: Entry-point links (IF-E)

A link must be a real link with the keyboard working (Tab to it, Enter opens the fund page `/portfolio/mutual-funds/funds/<schemeId>`), and **must never sit inside a button**. Click each place with a real household.

| # | Step | How to check | Expected result | Pass / Fail / Notes | Initials |
|---|---|---|---|---|---|
| D1 | Home: Movers, Fund grouping, a row of one fund | Home, Movers, group by Fund | Name is a link to the fund page; the row has a separate open button ("Show the funds in <name>"); the name link works by mouse and by keyboard (Tab, Enter); a click on the row or Enter on that button opens the popup exactly once; focus returns to that button on close | | |
| D2 | Home: Movers popup | Open the popup of a Movers row | Funds listed as links | | |
| D3 | Home: Movers, Sector or Category grouping, or a row of several funds | Switch grouping | **Deliberately not linked**: plain text, the row stays a button | | |
| D4 | Home: news "Why this?" popup | Open it on a news item | Fund names are links (they used to be greyed) | | |
| D5 | Home: Worth a look | Weak-fund and underperforming cards: "Review this fund" | Link to that fund's page. Cost and concentration cards **deliberately stay greyed** | | |
| D6 | Home: greeting top-mover link | Click it | **Deliberately unchanged** (C149): switches Movers to Fund grouping and opens that fund's popup, not the page | | |
| D7 | Mutual Funds: Overview holdings table | Click a holdings row, and separately a fund name; then Tab to the name link and press Enter | Opens that fund's Individual Fund page directly (`/portfolio/mutual-funds/funds/<schemeId>`), no pop-up; one navigation only, no double open; the name is a real link and is not inside a button; a click on the row elsewhere also works. Combined family view: the combined fund page opens; a member view: the member carries over to the fund page | | |
| D8 | Fund Details pop-up | Mutual Funds Overview: click holdings rows. Then open the legacy Dashboard (`https://ls-staging.unifolio.in`) and open its fund pop-up | The pop-up no longer exists on the Mutual Funds Overview page and there is no "Open fund page" link there. It remains only in the legacy Dashboard, which still opens it | | |
| D22 | Back button after a fund-name click | Mutual Funds Overview: click a fund name, then use the browser Back button | The Individual Fund page opens, and Back returns to Overview with the holdings table intact (same scope, no reload loop or blank table) | | |
| D9 | Mutual Funds: AMC allocation drill popup, SIP timeline (Next chip, day popup, recent and upcoming lists) | Open each | Fund names are links | | |
| D10 | Mutual Funds: Allocation cards | Asset class drill, Category and AMC, Fund Manager table and donut drill, Market Cap stocks | Fund names are links; manager and slice rows (buttons) are not touched | | |
| D11 | Mutual Funds: Holdings tab | Open a stock to see the funds behind it | Fund names are links; stock rows stay buttons | | |
| D12 | Mutual Funds: Overlap tab | Funds behind a common stock; the pair detail title | Names are links (both funds in the pair title) | | |
| D13 | Mutual Funds: Overlap heatmap headers and cells, top pairs, impact donut, stat strip | Click them | **Deliberately not linked** (initials chips, buttons, tooltips; planned follow-up IF-E2). Not a bug | | |
| D14 | Mutual Funds: Performance | Month popup and the fund XIRR table | Names are links. Benchmark fund rows **deliberately not linked** (name inside a toggle) | | |
| D15 | Mutual Funds: Other tab (fund ranking, category ranking, scorer cards, TER ladder) | Click names | **Deliberately not linked** now (planned follow-up IF-E2). Not a bug | | |
| D16 | Mutual Funds: Transactions ledger | Click a fund name in a row | **Deliberately not linked yet** (planned follow-up IF-E2; the name sits inside the expand button). BE1 is deployed, so the data is there but names stay plain text. Not a bug | | |
| D17 | Portfolio: Quick Insights | The "largest holding" line | Only the bold fund name is a link | | |
| D18 | Planning: By family member | Fund names | Still links (already linked in IF-B) | | |
| D19 | Legacy Dashboard, Analytics, History, mobile screens | Look at fund names | Untouched, not linked | | |
| D20 | No link inside a button | Devtools, Elements: select any linked name above and inspect its ancestors | No `button` or `role="button"` ancestor | | |
| D21 | Ledger `scheme_id` in the API (BE1) | Mutual Funds, Transactions; browser Devtools, Network tab, open the response of the analytics payload that carries the ledger entries | Ledger entries carry a `scheme_id` for new payloads. A payload computed before this deploy has none until the next recompute, so names stay plain text: expected, not a bug. Note which case you saw | | |

## Group E: Layout, theme and keyboard

| # | Step | How to check | Expected result | Pass / Fail / Notes | Initials |
|---|---|---|---|---|---|
| E1 | **AMC Allocation card, light** | Mutual Funds, Overview, AMC Allocation card at **1024, 1280 and 1366** px wide | Card fits, nothing clipped or overlapping; donut, legend and drill work (C178 fix). Record one result per width | | |
| E2 | **AMC Allocation card, dark** | Same three widths in dark mode | Same; text readable | | |
| E3 | Fund page, light | Overview, Insights and Overlap at 1280 and 1024 wide | Compare with the mockups; list every difference (layout, colours, spacing); no clipped text; tab strip scrolls rather than overflowing | | |
| E4 | Fund page, dark | Same pages in dark mode | Same; charts readable; the comparison's "isolate" slices are drawn in the divider colour (the mockup uses 25% opacity: a known difference) | | |
| E5 | Keyboard: tabs | Tab to the fund page tab strip; open each tab | Overview, Overlap and Insights are all links; focus ring visible | | |
| E6 | Keyboard: Overlap list | Focus "Top Funds with Overlap"; ArrowUp, ArrowDown, Home, End, Enter, Space | Moves without wrapping; Enter and Space open the comparison; heading takes focus | | |
| E7 | Keyboard: comparison sub-tabs | Arrows, Home, End | Arrows wrap; Home and End jump; the selected panel is shown | | |
| E8 | Keyboard: entry-point links | Tab through a Movers row, a SIP timeline entry and an Overview holdings row | Each link is reachable and opens the page on Enter; no double open | | |
| E9 | Screen reader spot check (optional) | Listbox, tabs, the nested "See Overlap" link | Announced as list, tabs and link. The "See Overlap" link sits inside a button-role row (accepted compromise in IF-D); note anything confusing | | |

## Group F: Regression and rollback

| # | Step | How to check | Expected result | Pass / Fail / Notes | Initials |
|---|---|---|---|---|---|
| F1 | Home, Portfolio, Mutual Funds tabs | Open Home, Portfolio and each Mutual Funds tab | Numbers present, no console errors | | |
| F2 | Planning | Open a scenario, switch member | Results load | | |
| F3 | Sign-in on both links | Sign in and out on `ls-redesign.unifolio.in` and `ls-staging.unifolio.in` | Works on both; no CORS errors | | |
| F4 | Security spot check | Two accounts: in account 2 open a fund-page URL for a scheme id held only by account 1 | Account 2 sees no account-1 data (an error, empty or "not held" state) | | |
| F5 | Rollback commands read | Read guide section 3 | The person running knows the commands | | |
| F6 | Known issues read | Read the list below | Nobody reports these as new bugs | | |

### Known issues (do not report as new bugs)

| Id | What | Status |
|---|---|---|
| L12 | Flaky `DashboardView` XIRR popup test | CI only; passes on rerun; open |
| L13 | A fund redeemed on the latest price date still counts in that day's change on Home | Owner decides at Home parity |
| L20 | News tagger fires a sector on "X stocks of Y" phrases | Open |
| L21 | `PLAIN_WORD_SYMBOLS` (news tagger) is a hand-picked list | Open; not a defect unless a new plain-word ticker mis-tags |
| L22 | Individual Fund backend asks BA1 to BA6 (for example AUM, expense ratio and AMC logo in the comparison header; 3Y and 5Y CAGR and the second fund's expense ratio in Performance Comparison) | Elements hidden until answered; not built |
| Unlinked | Ledger (Transactions) names, the Other-tab names and the Overlap heatmap and top pairs are not links yet (planned follow-up IF-E2; the ledger now carries `scheme_id` after BE1); other deliberate gaps are in rows D3, D5 to D7, D13 to D16 | Known |

---

## Go / no-go sign-off

**Rule:** any failed row blocks sign-off until it is fixed and re-run, or recorded below as an owner-accepted Low. Group A rows, F4 and C12 (a wrong money figure) cannot be accepted as Low, and any failure in the fund page's money or percent numbers blocks sign-off.

| Group | Rows | Passed | Failed | Owner-accepted Low (row ids) |
|---|---|---|---|---|
| A Deploy health | A1 to A8 | | | |
| B Timings and data | B1 to B6 | | | |
| C Individual Fund page | C1 to C13 | | | |
| D Entry-point links | D1 to D22 | | | |
| E Layout, theme, keyboard | E1 to E9 | | | |
| F Regression and rollback | F1 to F6 | | | |

**Timings recorded (B1, B2; 28 to 29 Oct misses are owner-accepted Lows, rerun under the new limits):** ________________________

**Overlap agreement (C11), figures and decision:** ________________________

**Decision for the next stage (the owner names it):**  GO  /  NO-GO  (circle one)

Reason / conditions: ______________________________________________

Owner: ______________  Date: ____________  Signature or initials: ________

Manager: ______________  Date: ____________  Signature or initials: ________
