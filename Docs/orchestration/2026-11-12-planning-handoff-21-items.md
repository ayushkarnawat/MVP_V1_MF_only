# Planning handoff: the 21-item change list and its batches (12 Nov 2026)

**Status:** planning only. **Nothing is built, nothing is committed, no code, migration or config was changed.** This file lets a fresh session on another account resume exactly where this one stopped, as if the conversation had never paused.

**Where this session stopped:** the owner had just received the consolidated batch plan (section 5) and said she would tell the next session what to do for the **GA4 tracking plan** (item 1). So the next step is the GA4 tracking plan. See section 9 for what the new session should say first.

**Do not commit or push anything unless the owner says so.** She commits her own files.

---

## 0. Project and environment

- **Product:** Unifolio, a mutual fund portfolio tracking and wealth-management platform for India (MF-only MVP). Repo `ayushkarnawat/MVP_V1_MF_only`. Read `AGENTS.md` first (single source of truth), then `CLAUDE.md`. Do not duplicate their content.
- **Working directory:** `C:\Users\Dell\Desktop\MVP v1\wt\docs` (a git worktree of the main repo; do not `cd` to the original repo root). **Branch:** `leapswitch-redesign`. Main branch: `main`. Git user shown as "Claude Code".
- **Owner:** Aditi (works with a manager and with Ayush, `ayushkarnawat`, on the repo). The owner's pronouns are not stated: use they/them if you need a pronoun. Treat her email and personal details as private; do not put them in outside requests.
- **Untracked files at session start (leave alone):** `Docs/orchestration/2026-11-09-qa-report-assets/`, `Docs/orchestration/2026-11-09-staging-qa-report-qa-fixes.html`, `Docs/orchestration/Unifolio-staging-QA-report-9-Nov-2026.pdf`, `check_fund_managers_run.sh`.
- **Recent commits:** `07a3057c` qa fixes (new-funds pop-up wrapping, duplicates skipped on the import card, Enter on Head of Family codes; deploy guide and QA checklist); `21eb911c` Mira AI planning workbook; `4854a508` staging network runbook; `a630e1ca` explore feature decisions v2 HTML; `737c0f4f` feature exploration decisions and handoff docs.
- **Current project state (from CLAUDE.md, as of 4 Nov):** staging runs the release branch plus the auth visual fix; UI round 2 is merged into `leapswitch-redesign`; Alembic head 0053; **Priority 1** is the fund-manager factsheet access gap (10 fund houses need monthly hand import, 5 have no factsheet; deadline was 10 Nov 2026 06:00 IST). Deferred features live in `DEFERRED_FEATURES.md` (it should contain a GA4 / event tracking entry; check it).
- **Memory index (the old account's, summarised):** one entry, "UI round 2 branch model": publish to `ui-round-2`, merge `release/change-requests` via the frontend session, the worker clones from `ui-round-2-src`. It is background; not needed for planning.
- **Platform:** Windows 11, PowerShell primary, Git Bash available. Desktop app "Code tab" harness.

## 1. How to work with this owner (rules that apply)

- **Planning only, one step at a time.** She explicitly does not want everything planned and executed at once. She works in batches of related items. Do not start implementing or planning a batch until she says which one.
- `CLAUDE.md` says: invoke the **task-observer** skill at the start of a task session; when delegating implementation or research invoke **model-orchestration** (Claude orchestrates, Codex is the default worker, handoff doc and adversarial review gate required); ask before assuming on anything the docs mark as an open question; if a PRD, ADR or schema conflicts with what is planned, say so, do not resolve silently; explain non-obvious decisions as code comments only.
- Use the **superpowers:brainstorming** skill before creative or planning work, but she has repeatedly said "do not plan or brainstorm right now" until a batch is chosen.
- House style for plans: in-depth, options with pros and cons, "what it does / how we build it / before and after / cost and risk", real UI mockups (not wireframes), fact versus estimate labelled, made-up fund names in mockups, no advice wording ("best", "buy", "recommended"), Decimal never float. Artifacts and workbooks are built as files in `Docs/orchestration/`.
- She likes: concise summaries first, tables, a clear recommendation, and "give me the whole updated thing in one place".
- App-specific: the desktop app expects a task list (`update_plan`) and a closing `wrap_up` call on turns that change files or run commands; skip both for pure conversation.

## 2. The 21 items (what the owner asked for, in her words, condensed but complete)

Origin: a meeting with her manager and stakeholders produced a list of changes. She gave them one by one, then asked for a **batching strategy**, not a plan.

1. **Event tracking and Google Analytics, website and web app (top priority).** Use GA4 for event tracking. Needs to answer: where the user came from, where they are, where they click most, which section they spend most time on, which sections they skip, etc. Do it for both the **website (a separate repo)** and the **web app**. She wants to brainstorm and plan how to do this across two repos. It is also one of the items in `DEFERRED_FEATURES.md`.
2. **Wrong-person file warning on Add Data.** A user signs up, onboards, lands on the dashboard, clicks Add Data and uploads a file. Example from the screenshot: Prateek uploaded Lalchand's file. The existing pop-up says "PRATEEK BHUSHAN SANCHETI isn't in this statement. This statement doesn't show PRATEEK BHUSHAN SANCHETI's PAN (FS*******7M). It has Lalchand Sancheti." with two buttons, "Upload a different file" and "Import for these people". The user may not realise they picked the wrong file. Add a **highlighted note or warning** saying this file belongs to Lalchand, and the data will be imported for Lalchand (not for Prateek) if they continue; the choice is to import for these people or go back.
3. **Onboarding page "How do you usually invest?" (step 4 of 5) looks cluttered.** The left panel is fine; the right panel has four option cards plus a six-chip "What are you working towards? (Select all that apply)" grid with a "Select all" link, then Continue. Reduce the clutter **without changing any copy or the number of options**: improve spacing, grouping, placement and layout. She wants a **UI mockup**.
4. **Login OTP timer.** Existing behaviour: on the OTP screen, if the user goes back and enters the same email and presses Get OTP within a minute, they get a "Try again after N seconds" pop-up; the same happens with a different email. Wanted: (a) if the user comes back from the OTP screen and enters a **different email or phone number**, they get the OTP **immediately**, no wait; (b) if it is the **same** email or phone and they press Get OTP again within the minute, **do not show the "try again after N seconds" pop-up; show a countdown timer like the one on the OTP screen** instead. First **check whether this already happens**. Also write a **detailed cybersecurity explanation of why** (rate limiting, abuse, enumeration, cost) that she can send to stakeholders.
5. **"Request from CAMS" tutorial video.** The Add Data flow offers "Request from CAMS" or "Already have a file". The CAMS screen tells the user what to fill in. Add a **hyperlink that opens a pop-up on the same screen** (not a navigation) playing a tutorial video covering: go to the CAMS website, fill the details, download the file from your inbox, come back and upload. She wants it creative and unique, not a plain screen recording; AI-generated video is on the table. Needs planning.
6. **"All set" screen (end of onboarding).** The bottom-left spinner reads "preparing a dashboard", which is misleading. Change it: rotate for about 2 to 3 seconds (1 to 2 rounds), then turn into a **tick**, with a small size pop (grow a bit, then settle to the size of the other ticks), and change the text to something like "You can click Go to My Dashboard now to start your journey" (creative copy). The user should not keep waiting.
7. **Mutual Funds Overview page loads very slowly on some stakeholder laptops** (fine on hers and her manager's). Investigate why, and investigate loading times of **all other pages** for a portfolio of about **40 lakh**.
8. **XIRR formula** may not be correct. Verify the formula and what it displays.
9. **Category average comparison.** Show in detail how it is calculated, how to read the UI, and what the **three values** are and how to read them. On the website: an **"i" icon** (hover or click) giving a legend and an explanation of the calculation. For stakeholders: an **Excel sheet** with the detailed explanation for all categories, as much detail as possible.
10. **Performance ranking.** Check the ranks, e.g. "7 out of 33": the "out of" value (after the slash) may be wrong. They compared with **Advisorkhoj** and the values looked off. It is unknown who is right. Do a deep check, maybe scrape Advisorkhoj if possible, bring ours to top accuracy; if Advisorkhoj is wrong, produce **concrete evidence** for stakeholders.
11. **Date consistency across the app.** Different sections show different dates (not wrong, since they show when each data set was acquired, but it looks inconsistent). Brainstorm how to make it consistent, e.g. show only the month ("data acquired November 2026"). Check at least: overlap, PE/PB, category average, ranking, daily updates, NAV, XIRR (portfolio and benchmark), and anywhere else.
12. **Section index within tabs.** Overview, Allocation, Overlap and the other tabs each have several sections, so the page feels like a "scrolling black hole". Idea: when the user is on a tab, that tab **expands horizontally** to show its sections; clicking one jumps to it, while normal scrolling still works. Open to other ideas; needs brainstorming and planning.
13. **Home page graph benchmark line.** The UI redesign artifact and its planning included a **blue line on the home graph comparing the portfolio (green line) with a Nifty benchmark**, chosen from a drop-down. It is not on the home page now. Check the artifact and planning, find out why, and bring it back. New addition: each benchmark gets a **different line colour** (the artifact has only one blue line).
14. **Same graph on the Mutual Funds Overview.** Keep it on Home, and also add it to the MF Overview. Plan where it fits, with UI mockups.
15. **"What moved today" on Home.** There is a line "view by day's change" at the bottom. Make it clickable and open a **pop-up with everything that changed today** (the card shows only the top four).
16. **PE/PB valuation by fund.** Remove the per-value source pills (NSE, BSE, factsheet). Show **one "i" icon next to the fund name**; hover or click explains where the PE/PB came from (NSE, BSE, factsheet, harmonic mean or other).
17. **Assorted fixes (screenshots attached):**
    - a. **Duplicate categories in the allocation view.** The same category appears twice, e.g. "Equity Scheme - Flexi Cap Fund" 15.2% and "Equity Schemes - Flexi Cap Fund" 2.8% (donut total 44.97L); "Equity Scheme - Large Cap Fund" 8.6% and "Equity Schemes - Large Cap Fund" 2.5% (total 93.13L). The names differ only by "Scheme" versus "Schemes". The cause is **not yet investigated**; it is probably inconsistent category naming from different sources. Check and fix.
    - b. **Fund manager card.** Remove the line "Assumed main manager: none was marked for at least one fund." (seen for Chirag Setalvad / HDFC Mutual Fund and Tanvi Kacheria / Jio BlackRock). The behaviour (assume the first listed manager when the main one is not marked) stays; only the line goes.
    - c. **New member missing from the member drop-down until a hard refresh.** After Add Data imports a file that creates a new household member, the new member is not in the header drop-down until Ctrl+Shift+R. Likely a cache issue. Fix so the new member appears immediately. (Screenshot: banner "Import complete, 14 new funds, 58 transactions added", drop-down shows only Prateek; the holdings table later shows Lalchand after refresh.)
    - d. **Folio numbers.** The holdings table shows masked folios ("XXXX / 0"). Show the **full folio number**. (Privacy trade-off: the owner should confirm it is intended.)
18. **Head of Family emails.** Change the **email templates and copy** for the Head of Family emails. **She said she attached screenshots for this, but none of the seven images in the message showed the emails** (they were: the wrong-person pop-up, onboarding step 4, two allocation donuts, the manager line, the import banner with drop-down, and the holdings table). **Ask her to re-attach the email screenshots before planning item 18.**
19. **Common PDF export (added later).** One shared export button that produces a customised PDF with the **Unifolio cover page, template and the user's name**. The user chooses whether to export for the **whole family or one member**. Needs brainstorm and planning.
20. **Simplified Explore document (added later).** A separate, non-technical copy of the Explore feature document for a non-technical stakeholder, no technical content, no technical open questions, with UI mockups. Downloadable, not committed. **Done** (section 6).
21. **Search bars on every page (added later).** The search plan committed in `733fc8bf`: `Docs/orchestration/2026-11-09-search-bar-planning.html`. See section 4.

### Context notes she gave
- **C1 NAV backend bug:** **FIXED and deployed to staging on 16 Nov 2026** (commit `b231b6f4`; deploy record `2026-11-16-staging-deploy-record-nav-held-fund-fix.md`). The real cause was that `nav-daily` skipped held funds that had a price from the last 3 days, not only late fund houses. Held funds are now refreshed every day from AMFI's own dates (06:00 full, 10:30 and 14:00 held-only); category peers keep the 3-day rule; the stored analytics still rebuild once, at 06:30 (see Batch A, Q5). First unattended run: 17 Nov 06:00. Execution is unblocked; official numbers come from runs after that.
- **C2 Stopped SIP change:** later. Avoid designs that conflict with it.
- **C3 Fact sheet fixes (manual and automatic):** built by the manager; the research and planning is ours. Affects item 16 and some explainers.
- **C4 Unifolio Standard vs Pro:** the app is financially heavy, so a Standard (basics) and a Pro (professional) split is planned, with a choice during onboarding. Planning later. Treat as a design constraint now.

## 3. Screenshots described (the images are not in this file)

1. Dark/blurred add-data screen with the wrong-person pop-up (item 2). Text: "PRATEEK BHUSHAN SANCHETI isn't in this statement / This statement doesn't show PRATEEK BHUSHAN SANCHETI's PAN (FS*******7M). It has Lalchand Sancheti." Buttons: Upload a different file, Import for these people.
2. Onboarding "Step 4 of 5", "How do you usually invest?" with four option cards (I'm just getting started; I manage my own investments; I work with a financial professional; A mix of both), "What are you working towards? (Select all that apply)" with six chips (Build my wealth, Plan for retirement, Fund my children's education, Buy a home, Achieve financial freedom, Plan my taxes), "Select all", a green Continue button. Left panel: illustration, "Help us personalise your experience.", three benefit bullets.
3. Allocation donut (dark theme), total 44.97L, with "Equity Scheme - Flexi Cap Fund 15.2%" and "Equity Schemes - Flexi Cap Fund 2.8%" circled.
4. Fund manager cards with "Assumed main manager: none was marked for at least one fund." circled (Chirag Setalvad, HDFC; Tanvi Kacheria, Jio BlackRock).
5. Mutual Funds overview after import: "Import complete, 14 new funds, 58 transactions added", member drop-down showing only PRATEEK BHUSHAN SANCHETI; tiles total portfolio value 44,97,253, invested 40,10,602, XIRR 8.6%.
6. Holdings table, Family Combined, folios shown as "XXXX / 0" under member names (Prateek 75.14%, Lalchand 24.86% for one fund).
7. Allocation donut (light theme), total 93.13L, with "Equity Scheme - Large Cap Fund 8.6%" and "Equity Schemes - Large Cap Fund 2.5%" circled.

## 4. The search plan (item 21) in brief

Source: `Docs/orchestration/2026-11-09-search-bar-planning.html` (committed; planning only; 9 Nov). Read it before planning search.

- Every page gets its **own search bar**. Each bar **filters the page's own list** and **jumps** to anything in the family's portfolio. One shared component, same look and keys everywhere. Jump search is **not limited by the family/member selector** (a fund held only by Asha shows up while viewing Ravi, tagged "Held by Asha").
- **14 result types:** funds, fund houses, categories, fund managers, members, folios, SIPs, transactions, stocks, sectors, page sections, terms, actions, smart filters.
- **One small new backend endpoint** (a light household search index, no prices), built by Codex. Almost everything else is already loaded in the browser. NAV is not involved.
- **Build order (own release, own staging check, 21 tasks):** Step 1 foundation (shared box, index endpoint, fixed-items list, slots, tests; Overview switches to it); Step 2 Mutual Funds tabs (Transactions, Holdings, Performance, Overlap, Other Analytics, Allocation); Step 3 fund pages and the rest (fund page frame slot, holdings dialog search, compare list filter, Home, Portfolio, Planning, History, Import history); Step 4 the smart parts (sections, terms, actions, smart filters, fund managers and sectors, recent funds, Mira row).
- **Settled by the owner:** S-A page-wise bars replace the single global box (decision L39 superseded, hold L46 lifted); S-B filter and jump; S-C jump ignores the selector; S-D all 14 result types. 18 of 22 questions answered. Key answers: top-bar box stays as "Ask Mira" (Q1 C); every Portfolio-area page, Home and Planning get a bar (Q2 A); text lives in the address as `?q=` and `?f=` (Q6); about 12 draft term definitions (Q9); actions: Add investment, Import, Compare, Switch member, Dark mode, Ask Mira (Q10); matching: all words in any order plus fund-house aliases plus small spelling forgiveness, own code, no library (Q11); shortcut `/` and Ctrl/Cmd+K (Q12); recent funds and last 5 searches per user (Q13); Ask Mira always the last row (Q14); live filtering from the first letter (Q15); rollout Mutual Funds tabs first (Q18); Codex builds the endpoint (Q20); whole-release review gate G4 stays in (Q21); manager names: main manager only (Q22).
- **Still open:** Q4 (new light endpoint vs alternatives), Q7 (the stock table is capped at 100 rows, accept with a note), Q8 (which smart filters first; plan assumes three simple ones), Q19 (scope intent in the shell). The plan assumes its own recommendation for each.
- **Paperwork owed:** decisions L39 and L46 must be written into `decisions.md` once she approves.
- **Interactions:** Explore reuses this plan's shared component and matcher; the "page sections" result type needs the same section list as item 12's index; the header slot on the Mutual Funds frame is shared with item 12 and item 19's export button; search events are valuable GA4 data (after search exists); actions and sections should come from configuration so Standard/Pro can hide Pro ones.

## 5. THE CONSOLIDATED PLAN (the batch strategy)

**Principle: correctness before presentation.** Items 8, 9, 10, 11 explain numbers. If a number is wrong, anything written about it is redone, so investigations come first.

### Phase 0: planning (the NAV bug was fixed on 16 Nov; planning continues until every artifact is reviewed)

| Task | Status |
|---|---|
| Group the items into batches and order them | **Done** |
| Add PDF export (19), Explore doc (20), search plan (21) to the batches | **Done** |
| **J. Simplified Explore document (item 20)** | **Done.** The owner is sending it to the stakeholder. |
| **Tracking plan, item 1 (GA4)** | **Not started. This is the next task.** She will give instructions. |
| One plan per batch | Not started |
| Resolve search open questions Q4, Q7, Q8, Q19; write L39 and L46 into `decisions.md` | Not started |
| Review the 12 draft one-line term definitions for search | Not started |
| Collect her open decisions (section 7) | Not started |
| Video script and storyboard (item 5) | Not started |

The manager's NAV fix landed on 16 Nov (commit `b231b6f4`). Branch from `c4434e15` or later, to avoid backend conflicts.

### Phase 1 onward: execution batches

| Batch | Items | Needs NAV fix? | Depends on | Output |
|---|---|---|---|---|
| **A. Truth-finding** | 8 XIRR, 10 rank denominators (and Advisorkhoj), 9 (calculation check only), 7 load times at about 40L, 17a root cause | Yes (landed 16 Nov) | NAV fix (done) | Findings, stakeholder evidence pack, backend fixes if wrong |
| **B. Journey quick wins** | 2 wrong-person warning, 4 OTP timer (check what exists, plus the security write-up), 6 spinner to tick, 18 Head of Family emails, 3 onboarding layout | No | none (18 needs her email screenshots) | Small front-end changes and an auth change; item 4 gets the cybersecurity explanation |
| **C. Holdings hygiene** | 17a fix, 17b, 17c, 17d | Mostly no | 17a needs A's root cause | Small fixes |
| **D. Charts** | 13, 14, 15 | Yes (landed 16 Nov) | NAV fix (done) | One reusable chart component, plus the pop-up |
| **K. Search** | 21: steps 1 to 4 | No | Her answers on Q4, Q7, Q8, Q19; L39/L46 paperwork | Search bars on every page; own release, own staging check, own review gate |
| **E. Explainability and dates** | 11, 9 (legend, "i" icon, stakeholder Excel), 16 | After A | A, her date decision, C3 for 16's source labels | Copy, UI, the Excel |
| **F. Navigation** | 12 | Last UI batch | D, E; planned together with K's section list | Section index across tabs |
| **I. PDF export** | 19 | After E and F | A, E, F, C4 | A shared export feature |
| **G. Tracking** | 1 | Split in two | Foundation: none. Custom events: after D, E, F, K | GA4 across both repos |
| **H. Video** | 5 | Recording waits for a stable CAMS screen | Script now; the pop-up goes with B | Tutorial video and pop-up |
| **J. Explore document** | 20 | No | none | **Done** |
| **Later** | Explore build, stopped SIP (C2), Standard/Pro (C4), fact sheet fixes (C3) | No | Explore after Priority 1 and search step 1 | Planned separately |

### Suggested order
1. Phase 0: plans, open decisions, the search questions, the **tracking plan**, the video script.
2. **B and C**, and the **foundation part of G**, in parallel (none touch NAV, so they could start before the fix lands).
3. **A**: the NAV fix landed on 16 Nov, so it is unblocked; its official numbers come from runs after 17 Nov.
4. **D.**
5. **K steps 1 and 2** so page headers settle before F and later batches touch them.
6. **E**, once A is done and the date policy is decided.
7. **K steps 3 and 4**, planned together with **F**, sharing one section list.
8. **I** (PDF export), last of the UI work.
9. **G custom events**, then **H** recording.
10. **Explore**, whenever she decides, after Priority 1 and search step 1.

### Cross-cutting rules
- **Standard/Pro:** do not hardcode section lists in F, E, I, K; keep them as configuration so a tier can hide Pro sections. Include `user_tier` as an event property in tracking from the start. Item 3's onboarding layout can be built now; the tier choice would be added later as a new step.
- **Shared header slot:** search (K), the section index (F) and the PDF export button (I) all want the same slot on the Mutual Funds frame. Plan them together.
- **One section list** for item 12 and search's "page sections".
- **Explore** reuses search's shared component and matcher, so search step 1 comes first.
- **Search is larger than any single page release so far**; ship it as its own release.

## 6. What was produced in this session

- **`Docs/orchestration/2026-11-12-explore-feature-simple-for-stakeholders.html`** (untracked, not committed): the simplified, non-technical Explore overview. Seven sections (idea, what a user can do, screens with the original mockups, three journeys, build order, the care we take, decisions: 8 decided, 4 open). Built from `2026-11-09-explore-feature-decisions-v2.html` by a script that kept the styles and mockups, removed technical notes, and replaced sections with plain-language text. The original v2 file is untouched. Delivered to the owner as a download; she is sending it to the stakeholder.
- Related existing files: `Docs/orchestration/2026-11-09-explore-feature-decisions-v1.html`, `...-v2.html`, `2026-11-09-explore-handoff.md` (the earlier Explore handoff: Explore is about exploring the market, portfolio is a light lens; Q1, Q2, Q5, Q6, Q7, Q8, Q11, Q13 answered; Q3, Q4, Q9, Q10, Q12, Q14, Q15, Q16 open), `2026-11-09-search-bar-planning.html`.
- Nothing else was created or changed. No investigation of any item has been run yet.

## 7. Decisions the owner still has to make

| Decision | Item | Notes |
|---|---|---|
| Date policy | 11 | Month-only everywhere, or exact dates for some (e.g. NAV)? |
| Full folio numbers | 17c | Privacy trade-off; confirm it is intended. |
| Benchmark colours | 13 | One colour per benchmark; what happens when many are compared? |
| Advisorkhoj scraping | 10 | Check their terms of use first. |
| Video style | 5 | Pure AI-generated, or stylised motion graphics over a real screen capture (my lean)? CAMS is a third-party site, so AI footage may show wrong screens. |
| PDF generation approach | 19 | Server-side or client-side; decide when planned. |
| Search open questions | 21 | Q4, Q7, Q8, Q19 (plan assumes its own recommendations). |
| Re-attach email screenshots | 18 | Needed before planning the Head of Family emails. |
| Explore open questions | later | Q3 catalogue (rec: Direct Growth equity and hybrid first), Q4 scores and rankings (rec: score on fund pages, no default rankings; needs a legal view), Q10 first slice (rec: search plus fund page), Q12 overlap timing (rec: third release). |

## 8. Item 1 (GA4 tracking): context for the next task

The next task is the **GA4 tracking plan**. What is known:

- Goal: know **where users came from, where they are, where they click most, which sections hold their time, which they skip**, for the **website (separate repo)** and the **web app (this repo)**. GA4 is the intended tool; it appears in `DEFERRED_FEATURES.md`.
- **Two repos:** the website repo's name and location are **not known to this session**. Ask the owner. Cross-domain measurement (website to app, same user) is likely a key design question.
- Proposed split: **foundation now** (GA4 property, page views, traffic source and UTM capture, cookie consent, a shared event-naming plan across both repos) and **custom events later** (clicks, sections skipped, time per section), because custom events attach to UI elements that batches D, E, F and K will change.
- Add `user_tier` (Standard or Pro) as an event property from the start. Search events (query, result type clicked, zero-result searches) come after search exists. Section-level engagement depends on the section list defined for item 12.
- **Privacy and consent are real constraints:** the app already has append-only consent records (migrations 0021/0022) gating sign-up, upload, CAMS and reactivation, PAN is stored encrypted per household member, and India's DPDP rules apply. Do not send PAN, folio numbers, names, emails or amounts to GA4. Check how consent and analytics should interact, and whether a consent banner exists today.
- To find out first (read-only): the frontend stack (React 19, Vite, react-router 7), whether any analytics code or tag exists, how routes and sections are structured, the consent flow, and the website repo's setup (ask for its path).

## 9. What the new session should do first

1. Follow `AGENTS.md`, `CLAUDE.md` (invoke the task-observer skill), then read this file, then skim the search plan and `DEFERRED_FEATURES.md` (GA4 entry).
2. Reply to the owner in under 250 words: what the 21 items are, the batch plan and the current state (Phase 0, J done, tracking plan next), and the facts that matter for GA4 (two repos, foundation versus custom events, consent, `user_tier`, search and section dependencies).
3. Say you are ready for her GA4 tracking plan instructions, and that you would start with a read-only look at how analytics and consent exist today in the web app, plus the website repo's location (which you need from her).
4. Do not plan, build or commit anything else. Remind her only of the one open request that blocks a batch: the missing Head of Family email screenshots (item 18).
