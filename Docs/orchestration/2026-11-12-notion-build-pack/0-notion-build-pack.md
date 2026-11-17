# Notion build pack: Unifolio 22-item change plan (12 Nov 2026)

**Purpose:** give this file to the manager's Claude (connected to Notion through MCP) so it can build the planning page. Everything needed is in this file: the instructions, the page layout, the database definitions and every row. The same data is also in five CSV files in the same folder, as a fallback.

---

## 1. Prompt for the manager's Claude (copy this)

```text
You are going to build a planning page in our Notion workspace from the attached file "Notion build pack: Unifolio 22-item change plan". Read the whole file first. Act as a careful project coordinator. Do not invent data, do not change the wording of rows, do not delete or edit any existing Notion pages.

1. Ask me which Notion workspace location (parent page or teamspace) to use if you cannot tell. Then create ONE page called "Unifolio: 22-item change plan" there.
2. Put the overview block from section 3 of the file at the top of the page (callout, how to read it, status key, stage list).
3. Create five inline databases inside that page, exactly as defined in section 4: Batches, Items, Tasks, Blockers and Decisions. Use the property names, types and select options given. Create the relations (Tasks to Batches, Tasks to Items, Items to Batches, Blockers to Batches). If a relation cannot be created, store the value in a text column and tell me.
4. Fill every row from section 5. Create rows in small groups (about 20 at a time) and check that each group saved. Do not skip rows.
5. Create these views: Tasks as a Board grouped by Status; Tasks as a Table grouped by Batch; Tasks filtered to Owner contains "Manager" (name it "Waiting on manager"); Items as a Table sorted by No; Blockers as a Table grouped by Group; Batches as a Table sorted by Stage.
6. When finished, check the row counts against section 6 and tell me the counts, any rows that failed, and anything you changed or could not do. Do not claim success until the counts match.

If anything is unclear, ask me before guessing.
```

## 2. If the Notion connection struggles

Import the five CSV files with Notion's own CSV import (Settings, Import, CSV), one database per file, then add the relations by hand. File names: `1-batches.csv`, `2-items.csv`, `3-tasks.csv`, `4-blockers.csv`, `5-decisions.csv`. They are UTF-8 with a header row.

## 3. Page overview block (put at the top of the page)

> **Unifolio: 22-item change plan.** Planning only: nothing is built. This page tracks every change from the stakeholder meeting, how the changes are grouped into batches, the order we will do them in, what each batch contains, what is waiting on whom, and the decisions still open. Last updated 12 Nov 2026.

**How to read it.** Start with **Batches** (the groups of work and their order), open **Tasks** for the detail, check **Blockers** to see what is waiting on the manager, and **Decisions** for what Aditi still has to decide. **Items** is the original list of 22 requests.

**Rule.** Correctness before presentation: investigations that check whether our numbers are right come first, because explanations and labels are written on top of those numbers.

**Status key.** Done, In progress, Next up, Not started, Waiting on manager, Blocked (needs screenshots).

**Pending from the manager (the three that matter now):** (1) finish the remaining items in the search plan, (2) review the search plan and return it to Aditi, (3) the Mira AI technical discussion. Earlier dependencies: the NAV backend bug fix and the fact sheet fixes.

**Stages (the order of work).**

| Stage | Name |
|---|---|
| 0 | Planning now (while the NAV bug is fixed) |
| 1 | Quick wins and groundwork |
| 2 | Truth-finding (after the NAV fix) |
| 3 | Charts |
| 4 | Search foundation and Mutual Funds tabs |
| 5 | Explainability and dates |
| 6 | Search rest and navigation |
| 7 | PDF export |
| 8 | Tracking events and video recording |
| 9 | Later |

Stage 0 and Stage 1 can run while the NAV bug is being fixed. Stages 2 and 3 need the NAV fix. Search (batch K) is split: steps 1 and 2 in stage 4, steps 3 and 4 in stage 6, planned together with navigation (F).

**Cross-cutting rules.**
- Standard versus Pro: do not hardcode section lists; keep them as configuration. Add a `user_tier` property to tracking events from the start.
- Search (K), the section index (F) and the PDF export button (I) share the same page header slot. Plan them together.
- One list of sections per tab, shared by the section index and by search's 'page sections'.
- Explore reuses search's shared component, so search step 1 comes first.
- Search is bigger than any single page release so far. It ships as its own release with its own staging check.

## 4. Database definitions

| Database | Property | Type | Options or notes |
|---|---|---|---|
| Batches | Batch code | Title | e.g. A, B, K |
| Batches | Name | Text |  |
| Batches | Items | Text | Item numbers covered |
| Batches | Stage | Select | 0 to 9, see section 3 |
| Batches | Needs NAV fix | Text |  |
| Batches | Goal | Text |  |
| Batches | Depends on | Text |  |
| Batches | Output | Text |  |
| Batches | Status | Select | Done, In progress, Next up, Not started, Waiting on manager, Blocked |
| Items | Item | Title | Item title; put the number in the No property |
| Items | No | Number | 1 to 22 |
| Items | Batch | Relation to Batches (or text) | Batch code(s) |
| Items | Priority | Select | P0 (top priority), P1, P2, P3 |
| Items | Status | Select | same as Batches plus 'Blocked (needs screenshots)' |
| Items | NAV gated | Text | Yes / No / After A |
| Items | Summary | Text |  |
| Tasks | Task | Title |  |
| Tasks | Task ID | Text | e.g. A-1 |
| Tasks | Batch | Relation to Batches | by Batch code |
| Tasks | Item | Text or relation to Items | item number(s) |
| Tasks | Detail | Text |  |
| Tasks | Lane | Select | Planning, Research, Design, Frontend, Backend, Frontend and backend, Docs, Content, Review |
| Tasks | Owner | Select (multi) | Aditi, Claude, Manager, Codex |
| Tasks | Status | Select | Done, In progress, Next up, Not started, Waiting on manager, Blocked (needs screenshots) |
| Tasks | Depends on | Text | Task IDs or batch codes |
| Tasks | Size | Select | S, M, L |
| Tasks | Deliverable | Text |  |
| Blockers | Blocker | Title |  |
| Blockers | ID | Text | BL-1 ... |
| Blockers | Owner | Select | Manager, Aditi, Manager + Aditi, Aditi + external |
| Blockers | Group | Select | PENDING ON MANAGER (1 of 3), (2 of 3), (3 of 3), Earlier dependency, Aditi's side, Later |
| Blockers | Blocks | Text | Tasks or batches blocked |
| Blockers | Status | Select | Waiting, In progress, Open |
| Blockers | Notes | Text |  |
| Decisions | Decision | Title |  |
| Decisions | ID | Text | DEC-1 ... |
| Decisions | Item | Text |  |
| Decisions | Owner | Select | Aditi, Manager |
| Decisions | Options | Text |  |
| Decisions | Suggestion | Text |  |
| Decisions | Status | Select | Open, Open (later), Waiting on manager, Decided |

Note: Decision IDs use the prefix DEC- so they do not clash with the task IDs of batch D (D-1 to D-5).

## 5. The data

### 5.1 Batches

| Batch code | Name | Items | Stage | Needs NAV fix | Goal | Depends on | Output | Status |
|---|---|---|---|---|---|---|---|---|
| P0 | Phase 0: planning and housekeeping | all | 0 | No | Group the items, collect decisions, write one plan per batch, produce stakeholder documents. | none | Plans, decisions list, stakeholder documents | In progress |
| B | Journey quick wins | 2, 3, 4, 6, 18 | 1 | No | Small, visible fixes in the sign-up, onboarding, login and upload flow. | none (item 18 needs Head of Family email screenshots) | Front-end changes, one auth change, OTP security write-up | Not started |
| C | Holdings data hygiene | 17a, 17b, 17c, 17d | 1 | No (17a needs batch A root cause) | Fix data-display bugs in holdings and allocation. | 17a fix needs A8; 17c needs a decision | Small fixes | Not started |
| L | Portfolio disclosures AMC audit (NEW) | 22 | 1 | No | Do for the portfolio disclosures job what was done for fact sheets: check every AMC and find which are automatic, blocked, hand-import or missing. | none (read-only first) | Per-AMC status table, alerting gap list, long-term fix options | Not started |
| G | Tracking (GA4) for website and web app | 1 | 0-8 | Foundation: No | Event tracking and Google Analytics across the website (separate repo) and the web app. | Custom events wait for D, E, F, K | Tracking plan, GA4 foundation, custom events, GA4 reports | Next up |
| A | Truth-finding | 7, 8, 9 (check), 10, 17a (root cause) | 2 | YES | Find out whether our numbers are right: XIRR, ranks, category average, load times, duplicate categories. | NAV fix (manager) | Findings, stakeholder evidence pack, backend fixes | Waiting on manager |
| D | Charts | 13, 14, 15 | 3 | YES | Benchmark line on Home graph, same graph on MF Overview, 'day's change' pop-up. | NAV fix (manager) | Reusable chart component and pop-up | Waiting on manager |
| K | Search bars on every page | 21 | 4 and 6 | No | Page-wise search bars (the search plan). Own release, own staging check, own review gate. | Manager finishes and returns the search plan; Aditi approves | Search on every page | Waiting on manager |
| E | Explainability and dates | 9, 11, 16 | 5 | After A | Make numbers readable and dates consistent: legends, 'i' icons, date policy, stakeholder Excel. | A, date decision, fact sheet fixes (for 16 labels) | Copy, UI, Excel | Not started |
| F | Navigation (section index) | 12 | 6 | No | Stop the scrolling black hole: an index of sections inside each tab. | D, E; planned together with K's section list | Section index across tabs | Not started |
| I | PDF export | 19 | 7 | After A | One shared export button for a branded PDF, family or single member. | A, E, F, Standard/Pro plan | Shared export feature | Not started |
| H | CAMS tutorial video and pop-up | 5 | 8 | No | Creative tutorial video opened from a link on the CAMS screen. | Stable CAMS screen before recording | Video and pop-up | Not started |
| J | Simplified Explore document | 20 | 0 | No | Non-technical Explore overview for the stakeholder. | none | Downloadable HTML | Done |
| X | Later and separate tracks | Explore build, stopped SIP, Standard/Pro, fact sheet fixes, Mira AI | 9 | No | Planned separately. | See blockers | n/a | Not started |

### 5.2 Items (the original requests)

| No | Item | Batch | Priority | Status | NAV gated | Summary |
|---|---|---|---|---|---|---|
| 1 | Event tracking and Google Analytics (website and web app) | G | P0 (top priority) | Next up | No (foundation) | Use GA4 to learn where users come from, where they are, where they click, time per section, sections skipped. Website is a separate repo. |
| 2 | Wrong-person warning on Add Data | B | P2 | Not started | No | When the uploaded file does not contain the selected person, highlight that data will be imported for the other person (e.g. Lalchand, not Prateek). |
| 3 | Onboarding 'How do you usually invest?' layout | B | P2 | Not started | No | Declutter the right panel with spacing, grouping and layout only. No copy change, same options. Needs a UI mockup. |
| 4 | Login OTP timer | B | P1 | Not started | No | Different email or phone gets an immediate OTP. Same one within a minute shows a countdown timer instead of 'try after N seconds'. Check what exists first. Write the cybersecurity rationale for stakeholders. |
| 5 | CAMS tutorial video and pop-up | H | P2 | Not started | No | Hyperlink on the 'Request from CAMS' screen opens a pop-up with a creative tutorial video: CAMS site, fill details, download from inbox, upload in the app. |
| 6 | 'All set' screen: spinner to tick | B | P3 | Not started | No | Spinner rotates 2 to 3 seconds, becomes a tick with a small size pop, text changes to invite the user to go to the dashboard. |
| 7 | Slow Mutual Funds Overview load, and all other page load times | A | P1 | Waiting on manager | Yes | Investigate why Overview is very slow on some laptops. Audit load times of all pages for a portfolio of about 40 lakh. |
| 8 | XIRR formula check | A | P1 | Waiting on manager | Yes | Verify the XIRR formula and what it shows. |
| 9 | Category average comparison: explain and document | A, E | P1 | Waiting on manager | Yes | Explain calculation and the three values, legend and 'i' icon in the app, detailed Excel for stakeholders. Check calculation correctness first. |
| 10 | Performance ranking check ('7 of 33') | A | P1 | Waiting on manager | Yes | Check the 'out of' values against Advisorkhoj. Bring ours to top accuracy, or produce concrete evidence if Advisorkhoj is wrong. |
| 11 | Date consistency across the app | E | P1 | Not started | After A | Make dates consistent, for example show only the month. Covers overlap, PE/PB, category average, ranking, daily updates, NAV, XIRR (portfolio and benchmark) and others. |
| 12 | Section index within tabs | F | P2 | Not started | No | Horizontal expansion of the tab into its sections with jump links, or a better idea. Brainstorm and plan. |
| 13 | Benchmark line on Home graph | D | P1 | Waiting on manager | Yes | Bring back the Nifty comparison line from the UI redesign planning. Dropdown to choose a benchmark; each benchmark gets its own line colour. |
| 14 | Same graph on Mutual Funds Overview | D | P2 | Waiting on manager | Yes | Copy the Home graph to the MF Overview. Plan placement and mockups. |
| 15 | 'What moved today' pop-up | D | P2 | Waiting on manager | Yes | 'View by day's change' becomes clickable and opens a pop-up with everything that changed today, not just the top four. |
| 16 | PE/PB valuation: one 'i' icon instead of pills | E | P2 | Not started | No | Remove NSE/BSE/factsheet pills; one 'i' icon next to the fund name explains the source and method. |
| 17 | Assorted fixes (17a to 17d) | C | P1 | Not started | 17a root cause after A | 17a duplicate categories (Scheme vs Schemes), 17b remove 'Assumed main manager' line, 17c full folio numbers, 17d new member missing in the dropdown until hard refresh. |
| 18 | Head of Family email templates and copy | B | P2 | Blocked (needs screenshots) | No | Change the email templates and copy. The screenshots were not received; Aditi must re-attach them. |
| 19 | Common PDF export | I | P2 | Not started | After A | Shared export button, branded cover page, user's name, family or single-member selector. |
| 20 | Simplified Explore document | J | P2 | Done | No | Non-technical copy of the Explore decisions document, with mockups. Delivered; Aditi is sending it to the stakeholder. |
| 21 | Search bars on every page (the search plan) | K | P1 | Waiting on manager | No | Page-wise search bars, 21 tasks in 4 steps. Needs the manager to finish and return the plan. |
| 22 | Portfolio disclosures AMC audit (NEW) | L | P1 | Not started | No | Same per-AMC checks done earlier for fact sheets, now for the portfolio disclosures job. |

### 5.3 Tasks

| Task ID | Batch | Item | Task | Detail | Lane | Owner | Status | Depends on | Size | Deliverable |
|---|---|---|---|---|---|---|---|---|---|---|
| P0-1 | P0 | all | Group the items into batches and order them | Group by dependency: correctness first, then UI, then explanation, then navigation. | Planning | Aditi + Claude | Done |  | S | Batch strategy |
| P0-2 | P0 | 19, 20, 21 | Add PDF export, Explore document and search plan to the batches |  | Planning | Aditi + Claude | Done | P0-1 | S | Updated batch table |
| P0-3 | P0 | 20 | Build the simplified Explore document | See batch J. | Docs | Aditi + Claude | Done |  | M | Downloadable HTML |
| P0-4 | P0 | all | Write the planning handoff for the next account | Full context file and resume prompt. | Docs | Aditi + Claude | Done | P0-2 | S | Handoff .md |
| P0-5 | P0 | all | Write one plan per batch | One short planning document per batch, written only when Aditi picks that batch. | Planning | Aditi + Claude | Not started |  | L | Batch plans |
| P0-6 | P0 | all | Collect Aditi's open decisions | See the Decisions database. | Planning | Aditi | Not started |  | S | Decided list |
| P0-7 | P0 | all | Build this Notion page from this pack | Manager's Claude creates the page from this file. | Docs | Manager | In progress |  | M | Notion page |
| G-1 | G | 1 | Draft the GA4 tracking plan (NEXT) | Aditi gives instructions. Plan covers both repos, foundation versus custom events, consent, privacy, user_tier. | Planning | Aditi + Claude | Next up |  | M | Tracking plan document |
| G-2 | G | 1 | Locate the website repo and audit its analytics and consent state (read-only) | Needs the repo location from Aditi. Check existing tags, cookie banner, hosting. | Research | Aditi + Claude | Not started | G-1 | S | Website audit note |
| G-3 | G | 1 | Audit analytics and consent in the web app (read-only) | Is there any analytics code? How do the existing append-only consent records (migrations 0021/0022) and sign-up consent interact with analytics? Is there a cookie banner? | Research | Aditi + Claude | Not started | G-1 | S | Web app audit note |
| G-4 | G | 1 | Design cross-domain measurement and the event naming scheme | One GA4 property or two? Link website to app sessions. Shared event names, parameters and user_tier property. Privacy rule: no PAN, folio, name, email or amounts in any event. | Planning | Aditi + Claude | Not started | G-2, G-3 | M | Event schema |
| G-5 | G | 1 | Build the foundation | GA4 property, page views, traffic source and UTM capture, consent handling, in both repos. | Frontend | Aditi + Claude (worker TBD) | Not started | G-4 | M | Foundation live on staging |
| G-6 | G | 1 | Custom events: clicks, scroll and section views, time per section, skipped sections | Attach to UI elements. Wait until batches D, E, F and K settle so the elements do not change again. | Frontend | Aditi + Claude | Not started | D, E, F, K, G-5 | L | Custom events |
| G-7 | G | 1, 21 | Search events | Query, result type clicked, zero-result searches. After search exists. | Frontend | Aditi + Claude | Not started | K step 4, G-6 | S | Search events |
| G-8 | G | 1 | GA4 reports that answer the five questions | Where from, where now, where they click, time per section, skipped sections. | Research | Aditi + Claude | Not started | G-6 | M | GA4 explorations or dashboard |
| B-1 | B | 2 | Design the wrong-person warning copy and look | Highlighted note in the pop-up: this file is for [name]; data will be imported for [name], not [selected person]. Keep both buttons. Mockup. | Frontend | Aditi + Claude | Not started |  | S | Copy and mockup |
| B-2 | B | 2 | Build and test the warning | Show the other person's name from the file. Test with a mismatch, and with several people in one file. | Frontend | Aditi + Claude | Not started | B-1 | S | Change on staging |
| B-3 | B | 4 | Check what the OTP resend behaviour is today (read-only) | Frontend countdown and the backend limit for email and phone. Does a different identifier already get an OTP immediately? Report. | Research | Aditi + Claude | Not started |  | S | Behaviour report |
| B-4 | B | 4 | Design the new behaviour | Different identifier: immediate OTP. Same identifier within the minute: countdown timer like on the OTP screen, no 'try after N seconds' pop-up. Keep a server-side limit. | Planning | Aditi + Claude | Not started | B-3 | S | Design note |
| B-5 | B | 4 | Build and test the OTP change | Frontend timer plus backend per-identifier rules. Confirm abuse protections still hold. | Frontend | Aditi + Claude | Not started | B-4 | M | Change on staging |
| B-6 | B | 4 | Write the cybersecurity explanation for stakeholders | Why cooldowns exist: abuse and cost of SMS and email, enumeration, brute force. Why a different identifier can be immediate only if other limits still apply. Must describe what the code really does after B-3. | Docs | Aditi + Claude | Not started | B-3 | M | Stakeholder document |
| B-7 | B | 6 | 'All set' tick animation | Design timing (2 to 3 seconds), tick pop (grow a little, settle to the other ticks' size), new creative text; build; respect reduced-motion setting. | Frontend | Aditi + Claude | Not started |  | S | Change on staging |
| B-8 | B | 3 | Onboarding step 4 layout mockups | 2 or 3 options for the right panel. No copy change, same options and chips. Improve spacing, grouping and placement. | Design | Aditi + Claude | Not started |  | M | UI mockups |
| B-9 | B | 3 | Build the chosen onboarding layout | Leave room for a future Standard or Pro step. | Frontend | Aditi + Claude | Not started | B-8 | M | Change on staging |
| B-10 | B | 18 | Get the Head of Family email screenshots | Aditi re-attaches them; they were not received. | Planning | Aditi | Blocked (needs screenshots) |  | S | Screenshots |
| B-11 | B | 18 | Review current templates and rewrite copy |  | Docs | Aditi + Claude | Not started | B-10 | S | New copy |
| B-12 | B | 18 | Update templates and test rendering |  | Backend | Aditi + Claude | Not started | B-11 | S | Templates updated |
| C-1 | C | 17a | Normalise duplicate category names | Merge 'Equity Scheme - Flexi Cap Fund' and 'Equity Schemes - Flexi Cap Fund' (also Large Cap and any other). Fix at the source or in the allocation display. | Backend | Aditi + Claude | Not started | A-8 | M | Fix and test |
| C-2 | C | 17b | Remove the 'Assumed main manager' line | Keep the assumption logic, remove only the line. | Frontend | Aditi + Claude | Not started |  | S | Change on staging |
| C-3 | C | 17c | Show full folio numbers | Confirm the decision first. Find every place that masks folios. | Frontend | Aditi + Claude | Not started | Decision: full folio | S | Change on staging |
| C-4 | C | 17d | New household member appears in the dropdown without a hard refresh | Find the cached member list and refresh it after an import that creates a member. | Frontend | Aditi + Claude | Not started |  | M | Fix and test |
| L-1 | L | 22 | Read the current portfolio disclosures job and the earlier AMC investigations | Job: refresh_portfolio_disclosures_daily and its per-AMC resolvers. Earlier notes under Docs/analytics/investigations (spike consolidated, reconciliation passes, sub-project 2 capture log). Also the factsheet audit (a04 documents) as the model for this one. | Research | Aditi + Claude | Not started |  | M | Summary of what exists |
| L-2 | L | 22 | List every AMC and how its disclosure is obtained today | Automatic, manual, blocked, none. One row per AMC. | Research | Aditi + Claude | Not started | L-1 | M | AMC list |
| L-3 | L | 22 | Run the real resolver code per AMC from the Indian-IP staging host (read-only) | A plain request is not enough: the earlier factsheet lesson was to re-run the real resolver. Record HTTP result, what was found, month of latest disclosure. | Research | Aditi + Claude | Not started | L-2 | L | Per-AMC test results |
| L-4 | L | 22 | Classify each AMC | Works automatically / blocked (403, 406 etc.) / needs a hand import / no disclosure published. | Research | Aditi + Claude | Not started | L-3 | M | Classification table |
| L-5 | L | 22 | Check freshness and completeness | Latest disclosure month versus the month that should be available; funds covered versus live funds. | Research | Aditi + Claude | Not started | L-3 | M | Freshness table |
| L-6 | L | 22 | Check alerting | Does anything warn when a month is skipped? Same gap as the factsheet job. | Research | Aditi + Claude | Not started | L-1 | S | Alerting gap note |
| L-7 | L | 22 | Write the AMC status document | Same format as the fact sheet access gaps document. | Docs | Aditi + Claude | Not started | L-4, L-5, L-6 | M | HTML document |
| L-8 | L | 22 | Options for the long-term fix and decisions | Ask AMCs, hand import process, license vendor data. Aditi and manager decide. Coordinate with the manager's fact sheet work. | Planning | Aditi + Manager | Not started | L-7 | M | Decision note |
| A-1 | A | 8 | Audit the XIRR formula | Read the implementation; compare with a reference (spreadsheet XIRR) on synthetic and the 40 lakh test portfolio; check cash-flow signs, dates, opening balance, lifetime versus current, benchmark XIRR. | Research | Aditi + Claude | Waiting on manager | NAV fix | M | Audit note and test cases |
| A-2 | A | 10 | Audit how the 'out of n' rank denominator is computed | Peer pool, plan, category, minimum history, eligibility. Compare with Advisorkhoj for a sample of funds across categories. | Research | Aditi + Claude | Waiting on manager | NAV fix | M | Comparison table |
| A-3 | A | 10 | Advisorkhoj terms of use and data collection | Aditi checks the terms. If scraping is not allowed, compare manually for about 30 funds. | Research | Aditi + Claude | Waiting on manager | Decision: Advisorkhoj | M | Sample data |
| A-4 | A | 10 | Stakeholder evidence pack for rankings | If ours is right: concrete evidence (definitions, peer lists, screenshots). If wrong: fix list. | Docs | Aditi + Claude | Waiting on manager | A-2, A-3 | M | Evidence document |
| A-5 | A | 9 | Check the category average calculation (correctness only) | Recompute the three values independently. | Research | Aditi + Claude | Waiting on manager | NAV fix | M | Check note |
| A-6 | A | 7 | Investigate slow Mutual Funds Overview on some laptops | Profile with throttled CPU on a 40 lakh portfolio; network waterfall, payload sizes, render cost. | Research | Aditi + Claude | Waiting on manager | NAV fix | M | Findings |
| A-7 | A | 7 | Measure load time of every other page on a 40 lakh portfolio | Table per page. | Research | Aditi + Claude | Waiting on manager | A-6 | M | Load-time table |
| A-8 | A | 17a | Find the root cause of the duplicate categories | Trace the 'Scheme' versus 'Schemes' names to their source; list all affected categories. | Research | Aditi + Claude | Waiting on manager | NAV fix | S | Root cause note |
| A-9 | A | 7, 8, 9, 10 | Consolidate findings and scope the backend fixes |  | Planning | Aditi + Claude | Waiting on manager | A-1 to A-8 | M | Fix list |
| D-1 | D | 13 | Find out why the benchmark line is missing on Home | Read the UI redesign artifact and its planning; compare with the current Home code. | Research | Aditi + Claude | Waiting on manager | NAV fix | S | Report |
| D-2 | D | 13 | Benchmark colours and legend | Decide colours per benchmark and what happens with many; mockups. | Design | Aditi + Claude | Waiting on manager | Decision: colours | S | Mockups |
| D-3 | D | 13 | Build the benchmark overlay with dropdown on Home |  | Frontend | Aditi + Claude | Waiting on manager | D-1, D-2, NAV fix | L | Change on staging |
| D-4 | D | 14 | Plan and build the same graph on MF Overview | Placement and mockups first; reuse the component. | Frontend | Aditi + Claude | Waiting on manager | D-3 | M | Change on staging |
| D-5 | D | 15 | 'View by day's change' pop-up | Design (all movers, sorting, empty state), then build. | Frontend | Aditi + Claude | Waiting on manager | NAV fix | M | Change on staging |
| K-1 | K | 21 | Manager finishes the remaining items in the search plan (PENDING ON MANAGER) | Open questions Q4, Q7, Q8, Q19 and anything else outstanding. | Planning | Manager | Waiting on manager |  | M | Updated search plan |
| K-2 | K | 21 | Manager reviews the search plan and gives it back to Aditi (PENDING ON MANAGER) |  | Planning | Manager | Waiting on manager | K-1 | S | Reviewed plan |
| K-3 | K | 21 | Aditi approves and decisions L39 and L46 are written into decisions.md |  | Docs | Aditi + Claude | Not started | K-2 | S | decisions.md updated |
| K-4 | K | 21 | Review the 12 draft one-line term definitions |  | Content | Aditi | Not started | K-2 | S | Approved terms |
| K-5 | K | 21 | Step 1: foundation | Shared search box, household index endpoint, fixed-items list, slots, tests. Overview switches to it. | Frontend and backend | Aditi + Claude (Codex for the endpoint) | Not started | K-3 | M | Step 1 on staging |
| K-6 | K | 21 | Step 2: Mutual Funds tabs | Transactions, Holdings, Performance, Overlap, Other Analytics, Allocation. | Frontend | Aditi + Claude | Not started | K-5 | M | Step 2 on staging |
| K-7 | K | 21 | Step 3: fund pages and the rest | Fund page slot, holdings dialog search, compare list filter, Home, Portfolio, Planning, History, Import history. | Frontend | Aditi + Claude | Not started | K-6, F-1 | M | Step 3 on staging |
| K-8 | K | 21 | Step 4: the smart parts | Sections, terms, actions, smart filters, managers and sectors, recent funds, Mira row. Sections use the shared section list from F-1. | Frontend | Aditi + Claude | Not started | K-7, F-1 | L | Step 4 on staging |
| K-9 | K | 21 | Whole-release review (gate G4) and staging check |  | Review | Aditi + Claude | Not started | K-8 | M | Review report |
| E-1 | E | 11 | Decide the date policy | Month only everywhere, or exact dates for some such as NAV? | Planning | Aditi | Not started |  | S | Decision |
| E-2 | E | 11 | Inventory every date shown in the app | Overlap, PE/PB, category average, ranking, daily updates, NAV, XIRR (portfolio and benchmark), others. | Research | Aditi + Claude | Not started | A | M | Date inventory |
| E-3 | E | 11 | Implement consistent date labels |  | Frontend | Aditi + Claude | Not started | E-1, E-2 | M | Change on staging |
| E-4 | E | 9 | Design the 'how to read' legend and 'i' icon for category average | What the three values mean, how to read them, how they are calculated. | Design | Aditi + Claude | Not started | A-5 | M | Mockups and copy |
| E-5 | E | 9 | Build the legend and 'i' icon |  | Frontend | Aditi + Claude | Not started | E-4 | M | Change on staging |
| E-6 | E | 9 | Stakeholder Excel: detailed explanation for every category | As much detail as possible. | Docs | Aditi + Claude | Not started | A-5 | L | Excel file |
| E-7 | E | 16 | Replace PE/PB pills with one 'i' icon | Content: source (NSE, BSE, factsheet), method (harmonic mean or other). Source labels depend on the manager's fact sheet fixes. | Frontend | Aditi + Claude | Not started | X-4 | M | Change on staging |
| F-1 | F | 12, 21 | Define one list of sections per tab (shared with search) | One registry used by the tab index and by search's 'page sections'; must be configuration so Standard or Pro can hide sections. | Planning | Aditi + Claude | Not started |  | S | Section registry |
| F-2 | F | 12 | Brainstorm options with mockups | Horizontal expansion as Aditi suggested, plus alternatives such as a sticky index or a side rail. | Design | Aditi + Claude | Not started | F-1 | M | Mockups |
| F-3 | F | 12 | Build the chosen section index | Shares the page header slot with search and the PDF export button. | Frontend | Aditi + Claude | Not started | F-2, D, E, K-6 | L | Change on staging |
| I-1 | I | 19 | Brainstorm the export | Which sections go in, family versus one member, cover page content, server-side or client-side generation. | Planning | Aditi + Claude | Not started |  | M | Plan |
| I-2 | I | 19 | Design the Unifolio cover page and template |  | Design | Aditi + Claude | Not started | I-1 | M | Template mockup |
| I-3 | I | 19 | Build the export button and the selector in the shared header slot |  | Frontend | Aditi + Claude | Not started | I-2, F-3 | M | Change on staging |
| I-4 | I | 19 | Build the PDF generation |  | Backend or Frontend | Aditi + Claude | Not started | I-1, A | L | Working export |
| I-5 | I | 19 | QA: numbers in the PDF match the screen |  | Review | Aditi + Claude | Not started | I-4 | M | QA report |
| H-1 | H | 5 | Decide the video style | Pure AI-generated, or stylised motion graphics over a real screen capture. CAMS is a third-party site, so AI footage may show wrong screens. | Planning | Aditi | Not started |  | S | Decision |
| H-2 | H | 5 | Write the script and storyboard | CAMS site, fill details, download from inbox, return, upload. | Content | Aditi + Claude | Not started | H-1 | M | Script and storyboard |
| H-3 | H | 5 | Add the hyperlink and pop-up on the 'Request from CAMS' screen | Opens a pop-up on the same screen. | Frontend | Aditi + Claude | Not started |  | S | Change on staging |
| H-4 | H | 5 | Produce the video | Only after the CAMS screen is stable. | Content | Aditi | Not started | H-2 | L | Video |
| H-5 | H | 5 | Re-check the video whenever the CAMS flow changes |  | Content | Aditi | Not started | H-4 | S | Check |
| J-1 | J | 20 | Simplified Explore document | Delivered as a download. Aditi is sending it to the stakeholder. | Docs | Aditi + Claude | Done |  | M | HTML document |
| X-1 | X | Explore | Explore build | After Priority 1 and search step 1. Open questions: catalogue, scores and rankings (needs legal view), first slice, overlap timing. | Planning | Aditi + Claude | Not started | K-5 | L | Plans per phase |
| X-2 | X | C2 | Stopped SIP change | Later. Avoid designs that conflict with it. | Planning | Aditi + Manager | Not started |  | M | Plan |
| X-3 | X | C4 | Unifolio Standard versus Pro | Planning later. Do not hardcode section lists; add user_tier to tracking. | Planning | Aditi + Manager | Not started |  | L | Plan |
| X-4 | X | C3 | Fact sheet fixes (manual and automatic) | Built by the manager. We do research and planning. | Backend | Manager | Waiting on manager |  | L | Fixes |
| X-5 | X | Mira AI | Mira AI technical discussion (PENDING ON MANAGER) | Technical discussion between Aditi and the manager. See the Mira AI planning workbook (commit 21eb911c). Also decides the 'Ask Mira' row in search. | Planning | Manager + Aditi | Waiting on manager |  | M | Discussion notes |

### 5.4 Blockers

| ID | Blocker | Owner | Group | Blocks | Status | Notes |
|---|---|---|---|---|---|---|
| BL-1 | Remaining search plan items to be solved | Manager | PENDING ON MANAGER (1 of 3) | K, G-7 | Waiting | Open questions Q4, Q7, Q8, Q19 and others in the search plan. |
| BL-2 | Review of the search plan returned to Aditi | Manager | PENDING ON MANAGER (2 of 3) | K | Waiting | After BL-1. |
| BL-3 | Mira AI technical discussion | Manager + Aditi | PENDING ON MANAGER (3 of 3) | X-5, K-8 (Ask Mira row) | Waiting | Technical discussion still to be held. |
| BL-4 | NAV backend bug fix | Manager | Earlier dependency | A, D, E, I | In progress | Execution of NAV-dependent batches waits for this. Branch from the code after the fix. |
| BL-5 | Fact sheet fixes (manual and automatic) | Manager | Earlier dependency | E-7, L-8 | Waiting | We research and plan; the manager builds. |
| BL-6 | Head of Family email screenshots | Aditi | Aditi's side | B-10, B-11, B-12 | Open | Not received in the original message. |
| BL-7 | Aditi's decisions (see Decisions) | Aditi | Aditi's side | several | Open | Date policy, folio numbers, colours, Advisorkhoj, video, PDF approach. |
| BL-8 | Legal view on scores and rankings for Explore | Aditi + external | Later | X-1 | Open | Needs a qualified person. |

### 5.5 Decisions

| ID | Decision | Item | Owner | Options | Suggestion | Status |
|---|---|---|---|---|---|---|
| DEC-1 | Date policy | 11 | Aditi | Month only everywhere, or exact dates for some (NAV) | Decide after the date inventory | Open |
| DEC-2 | Show full folio numbers | 17c | Aditi | Full / still masked | Privacy trade-off; confirm it is intended | Open |
| DEC-3 | Benchmark line colours | 13 | Aditi | One colour per benchmark; handling of many | One colour each with a legend, limit simultaneous lines | Open |
| DEC-4 | Advisorkhoj scraping | 10 | Aditi | Scrape if the terms allow / manual sample of about 30 funds | Check terms first | Open |
| DEC-5 | CAMS video style | 5 | Aditi | Pure AI-generated / stylised motion graphics over a real screen capture | Stylised over real capture | Open |
| DEC-6 | PDF generation approach | 19 | Aditi | Server-side / client-side | Decide when planned | Open |
| DEC-7 | Search open questions Q4, Q7, Q8, Q19 | 21 | Manager | See the search plan | Plan's own recommendations | Waiting on manager |
| DEC-8 | Explore catalogue | Explore | Aditi | Direct Growth equity and hybrid first / both plans / all | Direct Growth equity and hybrid first | Open (later) |
| DEC-9 | Scores and rankings on funds not owned | Explore | Aditi | Facts only / score on fund page, no default ranking / ranks everywhere | Score on fund page, no default ranking, after legal view | Open (later) |
| DEC-10 | Explore first release | Explore | Aditi | Search plus fund page / category pages / filter | Search plus fund page | Open (later) |
| DEC-11 | When 'fit with my portfolio' ships | Explore | Aditi | Third release / first / never | Third release | Open (later) |

## 6. Row counts to check at the end

| Database | Rows expected |
|---|---|
| Batches | 14 |
| Items | 22 |
| Tasks | 88 |
| Blockers | 8 |
| Decisions | 11 |

Of the 88 tasks, 5 are already Done.

## 7. Background (for the person reading, not for the database)

- Item 22 (portfolio disclosures AMC audit) is new: the same per-AMC checks that were done for the fact sheets, now for the portfolio disclosures job (`refresh_portfolio_disclosures_daily` and its per-AMC resolvers). Related notes live under `Docs/analytics/investigations/` (AMC disclosure spike and reconciliation passes) and the fact sheet access gaps document under `Docs/orchestration/`. It is read-only first; fixes come after the status table.
- Items 1 to 21 come from a stakeholder meeting. Item 18's screenshots were not received.
- The search plan is `Docs/orchestration/2026-11-09-search-bar-planning.html`. The Explore documents are `2026-11-09-explore-feature-decisions-v2.html` and the simplified `2026-11-12-explore-feature-simple-for-stakeholders.html`.
- Full planning context for any new session: `2026-11-12-planning-handoff-21-items.md`.
