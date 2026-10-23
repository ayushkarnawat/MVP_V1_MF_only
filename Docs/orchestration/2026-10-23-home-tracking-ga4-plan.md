# Home usage tracking with Google Analytics 4 (plan, draft v1)

**Status:** DEFERRED by the owner on 2026-10-23; not part of the Home release. Logged as PRIORITY 2 in `DEFERRED_FEATURES.md`. Kept here as the ready plan. Proposal, planning only; nothing is built. Follows the owner's answers H20 (add basic tracking), N3 (seven key events) and N4 (an outside analytics tool, "can we use Google Analytics?"). This replaces the earlier idea of our own `product_events` table and `POST /home/events` endpoint; both are withdrawn.
**Short answer:** yes, GA4 can do this. The main cost is not the code (small) but consent, privacy wording and the fact that behaviour data from a financial app goes to Google's servers outside India. Section 8 lists the risks and a fallback.

## 1. What we want to learn

Do people use Home, and where do they go next. Seven events only (N3 A). Nothing about money, holdings or identity is sent.

## 2. How it works (frontend only)

- A small module `frontend/src/features/home/track.ts` exposes `track(eventName, params)`. It does nothing unless **(a)** a GA measurement ID is configured for this environment and **(b)** the user has granted analytics consent. In local development and in tests there is no ID, so no network call is ever made.
- When consent is granted, the module loads Google's `gtag.js` once (lazily, not at app start) and configures it with automatic page views **off**, Google Signals **off** and ad personalisation **off**. Home sends its own `home_viewed` event with a path-only location, so nothing like `/import?member=<id>` can leak.
- No backend change, no new table, no endpoint. Mobile is untouched.
- Only Home emits events (decision scope). The shell needs no change.

## 3. The seven events

All parameter values are fixed labels from a short allow-list in `track.ts`; anything else is dropped before sending. No amounts, units, percentages, fund names, scheme ids, member names or search text.

| Event | When it fires | Parameters |
|---|---|---|
| `home_viewed` | Home finishes first load | `scope` (family or member), `state` (normal, empty, partial) |
| `period_selected` | user picks 1D, 1W, 1M, 1Y or Custom | `period` |
| `benchmark_selected` | user changes the benchmark | `benchmark` (index id, for example `nifty_500`), `was_recommended` (true or false) |
| `mover_opened` | user opens a "what moved today" row | `view` (sector, category, fund) |
| `worth_a_look_clicked` | user clicks a Worth a look card | `signal` (concentration, cost, performance) |
| `news_clicked` | user clicks a news item | `kind` (company results, sector news, rates and macro, general), `rank` (1 to 3) |
| `mira_opened` | the Mira coming-soon popup opens | `source` (understand, ask_mira) |

A reading of "did Home lead into the app" is built in GA from `home_viewed` followed by a visit to a Portfolio page; to support that without shell changes, key events can be marked in GA once the Portfolio pages exist.

## 4. Consent (needs the owner's decision, question P1)

- Analytics runs **only after the user opts in**. Google's own Consent Mode is started with all four storages (`analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization`) set to **denied**; on opt-in only `analytics_storage` becomes granted.
- The app already has an append-only consent system (`consent_records`, purposes and document versions, re-consent gate). The clean way is a new consent **purpose** such as `analytics`, recorded when the user accepts or later withdraws. That touches the existing consent code and needs a migration to add the purpose value. This is shared infrastructure outside Home, so it is flagged for the owner (P1) rather than assumed.
- The prompt appears once after sign-in as a small, plain dialog: what is measured (which Home features are used), what is never sent (money, holdings, name, contacts), who processes it (Google), and a clear Allow / Not now choice. "Not now" must not reduce functionality. Withdrawal lives in Profile under data and privacy.
- India's Digital Personal Data Protection Act 2023 expects free, specific, informed and unambiguous consent with a notice. Counsel should confirm the final wording and any timing of the Rules; this plan is a design, not legal advice.

## 5. Identity (question P2)

Default: **no user id**. GA uses its own browser cookie id, so counts are per browser, not per person, and nothing links Google's data to our accounts. Option: a pseudonymous id (HMAC of the account id with a server secret) lets GA deduplicate across devices but gives Google a stable id per customer; not recommended for a financial app at this stage.

## 6. Google Analytics setup checklist (done by the owner in the GA console)

1. Two properties, **staging** and **production** (P3), each with one Web data stream. The measurement ID (format `G-XXXXXXXXXX`) goes into the build setting `VITE_GA_MEASUREMENT_ID`; staging and production use different values; local and tests leave it empty.
2. Turn **off** Google Signals, ads personalisation and every Google data-sharing setting (P4).
3. Event data retention: the longest standard setting (14 months).
4. Register the parameters above as custom dimensions so they appear in reports (period, benchmark, view, signal, kind, scope, state, source, rank, was_recommended).
5. Add an internal-traffic filter for team IPs so testing does not pollute production data.
6. Use GA4's DebugView on staging to confirm each event once.
7. No BigQuery export for now.

## 7. Where it touches the code and the environment

| Item | Change |
|---|---|
| `frontend/src/features/home/track.ts` (+ test) | new |
| Home sections call `track(...)` at the seven points | new calls in Home files only |
| Consent purpose `analytics`, prompt and withdrawal | **existing consent system**, owner approval needed (P1); one migration and tests |
| Build setting `VITE_GA_MEASUREMENT_ID` | new env value in staging and production builds; documented in the deploy guides |
| Content-Security-Policy / security headers | none found in the repository's Caddy config; if one is added later, allow `www.googletagmanager.com` for scripts and `www.google-analytics.com`, `region1.google-analytics.com`, `analytics.google.com` for connections. Verify on staging. |
| Privacy policy and legal pages | add Google Analytics as a processor, what is collected, the opt-in and withdrawal, and that data is processed outside India; goes to the F5 copy review |
| Backend, database, jobs | none |

## 8. Risks and honest limits

- **Behaviour data leaves our system** for a regulated financial product. Mitigation: opt-in, no identity, no values, allow-listed parameters, Google Signals off.
- **Opt-in lowers counts.** Only users who agree are counted, and ad blockers also block Google's script for a share of visitors (commonly estimated at 10 to 30 percent among technical users; an estimate, not measured here). Treat numbers as trends, not totals.
- **No per-person joins.** Google's data cannot be matched to our database or deleted per customer without an id. Fine for product questions, not for audit.
- **Account deletion:** with no user id there is nothing of the person to delete in GA; say so in the policy.
- **Fallback:** if counsel objects, the same `track.ts` can send to a self-hosted or India-region analytics tool (for example Plausible or PostHog) by changing one transport function.

## 9. Tests (no live network)

`track.test.ts`: nothing sent without consent or without an ID; script loads only after consent; unknown parameter keys and values are dropped; query strings never reach `page_location`; each of the seven events sends the right name and parameters; withdrawing consent stops sending. Home section tests assert `track` is called with the right arguments (mocked). Consent: migration test for the new purpose, API test that accept and withdraw append records.

## 10. Effort (estimate)

About 2 developer-days for the module, the seven calls and tests; about 1 to 2 more for the consent purpose, prompt, withdrawal, migration and tests; plus copy and legal review time and the GA console setup.

## 11. Decisions needed (in the artifact, group P)

P1 consent model, P2 identity, P3 properties, P4 Google settings, P5 what counts as a page view, P6 policy and cookie wording review, P8 who creates the GA properties.
