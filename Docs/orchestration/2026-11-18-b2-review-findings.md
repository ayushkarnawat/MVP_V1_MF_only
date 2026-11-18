# B-2 address guard: independent adversarial review, findings and what was done (18 Nov 2026)

Reviewer: an independent Sonnet agent given the code, the spec and the attack list (workbook 7b part F), not the orchestrator's conclusions. Verdict: **FAIL** (nine findings; none was a data leak, a lost pending record or a changed existing answer). It ran its probes on SQLite only; Postgres behaviour is reasoned, not run. Committed as `f2ebe085` on `batch/b-journey` after the fixes below.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | Medium | Spellings of one phone number (`+91`, `0091`, `91`, `0`, spaces, dashes) count as one identifier in the guard but as eight different numbers in the 60-second rule, so both stop nothing: eight spellings got eight codes. Today phone sending is a stub, so no SMS goes out. | **Owner decision needed** (see below). |
| 2 | Medium | The count-then-insert is not atomic: with a barrier forcing every thread to read before any inserts, 12 of 12 distinct identifiers were admitted at limit 4. Real overshoot is bounded by in-flight concurrency (about 3 workers times the thread pool), far above the intended "one extra". | **Owner decision needed** (see below). |
| 3 | Medium | IPv4-mapped IPv6 addresses (`::ffff:a.b.c.d`) were cut to /64 and became `::` for every IPv4 client: one bucket for everyone (latent behind the stated proxies). | **Fixed** (red test first): mapped addresses are unwrapped to IPv4 before hashing; zone ids are ignored. |
| 4 | Medium | Every admitted request wrote a row, including repeats of an identifier already tried, so one address could grow the table without bound until the 03:15 purge and slow the count. | **Fixed** (red tests first): one row per address and identifier; a repeat refreshes the row's time and keeps its last outcome until the route records the new one (so the code quota still sees the identifier as used). |
| 5 | Low | A sign-up stopped by the code limit still created a pending verification (with its consent snapshot) before the check. Pre-existing, identical with the guard off. | **Fixed** (red test first): `signup_email` checks the code quota before creating the pending verification. |
| 6 | Low | A malformed last `X-Forwarded-For` entry makes `get_client_ip` return `None` and the guard skips (fails open). Not reachable behind the AWS load balancer (appends) or Caddy (replaces). | **Accepted, recorded.** The spec says no address means skip and log; the log is at info level. The production gate repeats the proxy-header check. |
| 7 | Low | Only the first of two `X-Forwarded-For` header lines was read. | **Fixed** (red test first): the last line is read; one-line behaviour unchanged. |
| 8 | Low | Plus-addressing and a trailing dot count as different identifiers. | **Accepted**: within the spec as decided (workbook 7b part C: "plus-addressing counts as different, which is acceptable"). |
| 9 | Low | `AUTH_GUARD_SECRET` was in no env template or infra file; staging with it unset runs unguarded (one error log). | **Fixed in the template** (`deploy/leapswitch/.env.example`); the M1 deploy guide must set it on the staging VM and on AWS and check the log has no "Auth request guard skipped" line; production already refuses to start without it. |

## After the fixes
567 tests green across auth services, the auth and email-code routes, the Head of Family routes, startup and migrations (4 skipped: the Postgres-only cases). One existing test (`test_ipv6_uses_first_64_bits`) counted one row per request and was updated to compare the hashes directly, because finding 4 intentionally changes that. Postgres was not run (no `TEST_DATABASE_URL`).

## For the production gate (carried forward)
- Re-verify the proxy's forwarded-header handling for whatever sits in front of production (AWS load balancer in append mode; Caddy replacing).
- Run the guard tests and migration 0054 on Postgres.
- Decide the concurrent-overshoot question before production (finding 2).
- Set `AUTH_GUARD_SECRET` and confirm no "Auth request guard skipped" log line after the deploy.
- When a real text-message provider is wired in: key the resend wait on one canonical phone form (finding 1).
