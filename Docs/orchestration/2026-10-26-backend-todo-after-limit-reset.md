# Backend to-do, parked until the Claude limits reset (26 Oct 2026)
Owner decision 26 Oct: **no review fixes and no new backend runs while the quota is low**; the front-end packets go first (Gemini has room). Nothing below is started except where marked. Review policy: Sonnet by default; when unsure, ask the owner before any Opus run.

## 1. Portfolio PR #15: fixes from the Sonnet review (verdict: merge after H1)
| # | Fix | Notes |
|---|---|---|
| H1 | Golden-fixture test and writer depend on today's date (XIRR ends at `date.today()`): patch `app.services.dashboard.xirr.date` to a fixed subclass in the test and in `write_portfolio_fixtures.py` | A partial attempt is saved as `portfolio-fix-partial-H1.patch` in the session scratchpad (not applied; the fixtures it changed must be re-checked). Goes red on 27 Oct if unfixed |
| M1 | `_value_series` loads prices from `today - (days + 15)` but the window is built back from `nav_as_of`: wrong when the newest NAV is more than about 26 days old. Load from `min(today, latest NAV date) - (days + 15)`; add a stale-feed test | Home's 1D/1W wealth routes have the same weakness (Low L15) |
| M2 | Three injected bugs survive the tests: summary total summed unrounded (C88), series end `today` instead of `nav_as_of`, member-scope `realized_gain` over all members | Add one failing-first test each |
| M3 | Gate has no independent oracle and no switch, bonus, opening balance, statement-priced or sold fund; its oracle call lacks `stored_only` and tries a live fetch | Pass `stored_only=True`; widen the household with L14 |
| L1 | `-0.0000` and `-0.00` strings (normalise like Home `_zero`) | |
| L5 | Summary and allocation use `view="sector"` needlessly; `view="fund"` if byte-identical | |
| Logged only | series last point vs summary on a weekend price of a held fund (same rule as Home N3); statement-only household's last point; Dashboard per-row gains differ by paise (C96); series loads all transactions; one tautological test | |

## 2. Mutual Funds PR #12: fixes from its Sonnet review
Review running at the time of writing; its findings are added here when it reports. Not fixed until the owner says so.

## 3. Backend runs still to do (see the execution plan v2 and the list given on 26 Oct)
Order: **NB1 to NB3** (Home news; migration 0044; owner runs the VM dry run first and calibrates thresholds), **IB1 + IB2**, **IB3 + IB4**, **IB5 + MB4** (owner runs the staging check), **PB1 + PB2**, MX1 (small, after MB4), the Profile line `created_at` on `/auth/me` (me). Each is a Claude terminal (Sonnet) session, verified by me, with a Sonnet PR review (Opus only if I am unsure and the owner agrees).
