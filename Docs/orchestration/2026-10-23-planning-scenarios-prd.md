# PRD: Planning, market scenarios (draft v1)

**Status:** draft, 2026-10-23, for owner review. A new document. **No existing PRD is edited.** PRD-04 (`Docs/PRD-04-MF-Analytics-Dashboard.md` and its copy under `Docs/PRDs/`) defines the scenario simulator and its rule FR-UX-7 (exact dates on every screen); this PRD restructures where and how that feature appears. A version note on PRD-04 (both copies) is proposed in section 9 and waits for your word.

## 1. Problem and goal

Scenarios exist but sit behind a flat tab with no room for the planning features that will follow. The redesigned app puts them under **Planning**. Goal: a user opens Planning, sees what is available, and can see in under a minute how their current funds would have behaved in a past market event, without a number being mistaken for a forecast.

## 2. Users

A family tracking mutual funds through CAS statements (the account owner and any household members). Desktop web only.

## 3. Scope

In: the Planning landing, Plan your future as Coming soon, the scenario list in the existing structure with page-29 cards, and the scenario detail (four tiles, benchmark bars, impact by asset class, Mira placeholder, by-member list with estimate and frozen labels, phase and freeze variants, index-only view for pre-2006 events), a member dropdown, and the additive backend fields. Out: retirement and goal planning (page 28), custom scenarios, line chart, lowest-value and recovery-time tiles, benchmark switch, date-range picker, Mira insights, mobile, search, event tracking.

## 4. Functional requirements

| ID | Requirement |
|---|---|
| FR-PL-1 | Planning is one route, `/planning`, with a landing of two cards; choosing a card replaces the landing and offers a Back link (L1, L13). |
| FR-PL-2 | Plan your future shows a Coming soon view and collects nothing (L2, L32). |
| FR-PL-3 | Explore market scenarios lists curated scenarios, a More / Hide toggle and the category pills, with page-29 cards (type icon, name, exact dates, description, Nifty 50 stat in red or green, badges) (L3, L8, L17, L18). |
| FR-PL-4 | Selecting a scenario opens its detail below the list and scrolls to it, respecting reduced motion (L14). |
| FR-PL-5 | The browser Back button steps detail, list, landing; a refresh returns to the landing (L15). |
| FR-PL-6 | The detail shows a disclaimer under the heading, four tiles (portfolio return, rupee impact, benchmark return with outperformed-by or behind-by and a caveat, coverage) (L7, L22, L30). |
| FR-PL-7 | The detail shows benchmark comparison bars and impact-by-asset-class bars in rupees with the percent beside each, grouped into six groups (L6, L20, L21, L28). |
| FR-PL-8 | A member dropdown chooses family combined or one member who holds funds; the choice is kept across scenarios in the visit (L5, L19). |
| FR-PL-9 | Fund rows under a member carry an Estimate chip for proxied results and Frozen text for frozen funds; there is no separate by-fund list (L25, L35). |
| FR-PL-10 | Multi-phase and freeze results keep their own bodies; benchmark tile and chart appear only when benchmarks exist (L23). |
| FR-PL-11 | Scenarios with no fund data show the index only with a note (L24). |
| FR-PL-12 | A Mira card says Coming soon and opens the existing Mira dialog (L26). |
| FR-PL-13 | Exact dates show on every scenario card and detail (PRD-04 FR-UX-7). |
| FR-PL-14 | A member id that does not belong to the account returns not found and reveals nothing. |

## 5. Non-functional

First detail load within the target set after the staging timing (Home targets about 1.5 s; this page's number is set after the script runs, L31). All money and percentages are Decimal strings. No new stored data, no new personal data, no consent change. Keyboard operable, focus ring on every control, every bar has a text value. Light and dark.

## 6. Compliance and release gates (unchanged)

The "not a prediction" disclaimer stays. Hypothetical values stay behind `SCENARIO_HYPOTHETICALS_ENABLED` until a markets-literate review. The SEBI-style disclaimer wording keeps its compliance-review gate. These are outside this PRD.

## 7. Success measures

Not instrumented in this release (event tracking deferred). Manual checks: staging timing numbers and a walk-through of the flows in the flows document.

## 8. Dependencies

Contract v1.5, shell PR 1, Home backend plan T1 (stored prices), the existing scenario job and tables.

## 9. Proposed document notes (not applied)

PRD-04, both copies: a one-line version note that the scenario screen moves under Planning with the layout in this PRD and that FR-UX-7 still applies. Applies only on your word.

## 10. Open items

None. G1 to G9 were answered on 23 Oct (L36 to L44).
