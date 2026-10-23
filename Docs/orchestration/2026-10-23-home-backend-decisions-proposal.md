# Home: backend decisions (proposal, not appended to `decisions.md`)

**Status:** proposal, 2026-10-23. Doc 9. Append to `decisions.md` only on the owner's go. Format: decision, why, reuse alternative.

| # | Decision | Why | Reuse alternative / note |
|---|---|---|---|
| BD1 | Home endpoints compute on request over existing tables; no daily-series table in v1 | measured 8-240 ms with one bulk NAV read; target 1.5 s | precompute after import confirm and in the 06:30 job if staging misses |
| BD2 | Home never starts an Analytics recompute and never calls the snapshot rebuild on load | keeps Analytics recompute unaffected; avoids multi-second loads | none |
| BD3 | Home uses the prices already stored by the 06:00 job and does not download live (owner direction 2026-10-23: no new jobs or tables). Needs only a small optional setting on `compute_holdings` (like the one the Analytics code already uses on the NAV lookup); confirmed by the owner (P7 A, 2026-10-23) | measured 19 to 24 s cold on staging otherwise | live downloads (slow) |
| BD4 | Day change is price movement only, units at previous close | B2 | none |
| BD5 | Sector view is a pro-rata split of each fund's exact change, labelled estimated, coverage under 50% falls back to category | L21, L47 | index-informed version deferred |
| BD6 | Benchmark is index total-return percent over the period; enum gains `nifty_smallcap_250` | L37, L45 | none; migration pattern 0006 |
| BD7 | Asset-class list and live/coming-soon status come from one backend constant | L20: later classes go live without front-end rework | a table is unnecessary until a class has data |
| BD8 | News: GDELT raw files, one job, one new table `news_items` (0044), per-user scoring at request time | L15, E13 | `analytics_sections` is the wrong shape |
| BD9 | `stock_master.nse_symbol` nullable column and an external job heartbeat | owner chose E11 option B | name/ISIN matching only was the default |
| BD10 | Credit to GDELT on the About/legal page, not the card | owner chose E14 B | counsel to confirm sufficiency |
| BD11 | Greeting is Good morning/afternoon/evening from the IST clock; no first-visit state (owner 23 Oct; replaces L16, confirmed) | no schema change | `users.home_first_seen_at` dropped |
| BD12 | Fix `invalidate_holdings_cache` in the opening-balance route as a separate small change (approved 23 Oct) | Home would otherwise show stale numbers | leave as is and document |
| BD13 | Extend disclosure retention from 3 to **6 months** per scheme (owner, H6 and N1) | late files, trend bar, added/removed view | keep 3 and omit the bar |
| BD14 | **Deferred 2026-10-23:** usage tracking (Google Analytics 4, opt-in, seven events) is not in the Home release; logged as PRIORITY 2 in `DEFERRED_FEATURES.md`; plan kept in `2026-10-23-home-tracking-ga4-plan.md` | owner decision | build it now (earlier answer) |
| BD15 | News ships in the same release and is **live from day one** with the disclaimer (owner, H24 and N5); the `news_enabled` kill switch remains; counsel review was recommended and is not a gate | owner choice | switched off until reviewed |
| BD16 | Links to unbuilt pages stay greyed out with a tooltip (L32 stands; owner, M17) | owner chose B on M17 | clickable "coming soon" note |

Schema conflicts with `Database-Schema-Unifolio.md`: none known; the schema doc needs the new table/columns added when they are built (owner to approve edits).

**BD17 (owner, P9 A, 2026-10-23: not now, logged as a known gap in `DEFERRED_FEATURES.md`):** the Dashboard has the same slow cold open; fixing the price-freshness rule in `nav.py` is a separate change, logged as a known gap rather than part of Home.
