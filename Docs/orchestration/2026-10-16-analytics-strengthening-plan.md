# Analytics strengthening plan

**Living document — items are added as they come up; this pass covers what's been
diagnosed so far.** Scope: closing AMC/factsheet coverage gaps that make the Analytics
section's numbers incomplete or make a section unable to render at all (valuation's 70%
equity-coverage gate, the coverage banner's "not available" lists). Not a UX-copy or
layout plan — see `2026-10-15-analytics-ux-changes-plan.md` for that. Plan only, nothing
built.

Source material: the LeapSwitch QA pass (`2026-10-16-leapswitch-qa-report-sp1-sp2.md`),
the AWS `portfolio-disclosures-daily` alarm diagnosis (14–16 Oct logs), and the standing
Priority-1 factsheet-access item in `DEFERRED_FEATURES.md`.

## The items

| # | Sub-project | Item | Type | Impact |
|---|---|---|---|---|
| 1 | SP1 | Factsheet access gaps (attribute 04) | Decision + build | High — 722 funds across 15 AMCs |
| 2 | SP2 | HDFC's Wayback fallback is fragile | Bug fix | High — one of the largest AMCs by AUM |
| 3 | SP1 + SP2 | Per-AMC fix register (every named AMC, factsheet and disclosure) | Bug fixes + data + notes | Medium — narrower AMCs, clear causes |
| 4 | SP2 | Long-tail partial-AMC sheet issues (~12 AMCs, one or two funds each) | Bug fix, batched | Low individually, moderate in aggregate |
| 5 | SP2 | Manual-AMC import discipline (Bandhan, Invesco, HSBC + 4 standing-manual AMCs) | Process, not code | Medium — ceiling is already near-optimal without a bigger investment |
| 6 | Both | The two daily/monthly jobs: intended vs built, and how to tighten | Review + hardening | High — decides whether a failure is ever noticed |
| 7 | Both | Knowing when an AMC has published | Design + small build | Medium — feeds item 6 |
| — | Both | Shared manual-upload admin screen | Infrastructure | Serves items 1 and 5 together |

---

## Sub-project 1

### 1. Factsheet access gaps (attribute 04)

**Current state:** 10 fund houses need a monthly hand import (ICICI, Kotak, HDFC ×2
files, Axis, Bandhan, Invesco, WhiteOak, ITI, JM, Trust — 689 live funds); 5 have no
factsheet published at all (Bajaj, AlphaGrep, IL&FS, Lakshya, Monarch — 33 funds). The
automatic job covers the rest, but whether AWS itself blocks any of the ~40 "automatic"
AMCs has never been verified end to end.

**Why it matters for accuracy:** every fund in those 15 AMCs shows "not available" in
the Fund Manager Allocation card regardless of whether a manager is actually assigned —
it's a coverage gap, not a data-quality one, but it's the same shape of gap as SP2's.

**Open decisions, not yet made:**
- Long-term strategy: keep doing manual imports indefinitely, ask the 15 AMCs directly
  for access, or price out a licensed data vendor.
- Whether the manual import stays CLI-only or gets a real admin screen (see the shared
  item below).
- A missed-month alert doesn't exist yet — a manual import silently not happening one
  month currently fails quietly.
- The AWS-blocking question for the 40 automatic AMCs — unverified both ways.
- HDFC's passive-fund file is untested.

**Proposed path:** decide the long-term strategy first (it determines whether the admin
screen is worth building or whether this is a smaller, finite problem that gets solved by
a vendor contract instead). Independent of that decision, the missed-month alert and the
AWS-blocking check are both cheap and can happen immediately.

---

## Sub-project 2

### 2. HDFC's Wayback fallback is fragile

**Current state:** HDFC has no scrapeable landing page; the registry relies on the
Internet Archive's Wayback CDX index to discover its monthly file URLs
(`portfolio_disclosure_resolvers.py`, `DisclosureResolverKind.WAYBACK_LOCATE`). On AWS
staging this got rate-limited (`HTTP 429` from `web.archive.org`) on two consecutive
days, giving zero HDFC coverage. On LeapSwitch it currently works — but there's no reason
to believe that's a fix rather than a different network path not yet hitting the same
limit.

**Why it matters for accuracy:** HDFC is one of the largest AMCs in India. Of every item
on this list, a regression here affects the most real households.

**Proposed fix:** switch the primary mechanism to the guessed direct-URL pattern already
identified in the 2026-10-13 capture log
(`s3fs-public/<YYYY-MM>/Monthly HDFC <Scheme> - <date>.xlsx`), keep Wayback as a fallback
only instead of the primary path, and make it gentler: one index query per run (check how
many it makes today), back off on a 429 and honour its retry hint, and reuse the last
known URL pattern rather than re-asking. Needs to land before SP2 reaches AWS production, since
that's the environment where the rate limit was actually observed.

### 3. Per-AMC fix register (replaces the earlier "five resolver bugs" table)

Every AMC named so far, split by which pipeline it belongs to. **SP1** = the monthly
factsheet job (fund managers). **SP2** = the daily portfolio-disclosure job (holdings).
They fail for different reasons, so each row says which one.

**A. Not fixable by us — note only**

| AMC | Pipeline | What happens | Why / what to do |
|---|---|---|---|
| Angel One | SP1 factsheet | Works on AWS, fails on CloudPe | Angel One's website is hosted on AWS and only answers AWS-side requests. Not something we can fix. Production runs on AWS, so this is a CloudPe-only limitation. Record it as a known environment difference. |
| DSP, Jio BlackRock, Mahindra Manulife, Mirae Asset, Motilal Oswal, SBI | SP1 factsheet | Factsheet missing on CloudPe | **Cause not stated; assumed to be the same kind** (network-path dependent). Confirm by running the factsheet job from both networks and comparing the per-AMC outcome (item 6). If confirmed, same note as Angel One. **Mahindra Manulife is different:** its download list is encrypted but public, and the standing ruling (8 Oct) is "switch to MANUAL if it breaks" — so if it is broken for a real reason, apply that ruling. |

**B. Sub-project 1 — factsheet fixes**

| AMC | Symptom | Cause | Fix |
|---|---|---|---|
| Edelweiss | No factsheet link found | The site's layout changed; the registry's link pattern no longer finds the file | Re-open the page, find where the monthly factsheet link now lives, update the registry entry, re-run the "is this month's file" check. If it cannot be made stable within a bounded effort, move to MANUAL (the standing procedure for the other 10). |
| Zerodha | Factsheet not fetched | A bug in our resolver code, not network | Read the job's alert reason for the exact failure, reproduce on the saved factsheet in `Desktop/Unifolio/Factsheets`, fix test-first. |
| Sundaram | "Internal error" | Unknown. The alert line cuts the error text at 300 characters, so the root cause is probably already lost | First log the full traceback (item 6), re-run, then diagnose. |

**C. Sub-project 2 — disclosure fixes**

| AMC | Symptom | Cause | Fix |
|---|---|---|---|
| HDFC | Zero coverage on AWS; works on CloudPe | Wayback (Internet Archive) rate-limited our requests (HTTP 429) | See item 2: direct-URL primary, Wayback fallback only, fewer and slower Wayback calls. |
| Angel One | `unmatched_scheme: Download` | The scheme-name hint is the link text, which is literally "Download". **Note:** `_usable_hint` already rejects a bare "Download", so the word is reaching the matcher by some other path — trace that first. | Change the hint source: take the fund name from the table row or heading around the link, or from the downloaded workbook's own title (the way Zerodha, Motilal and NJ already do via `_downloaded_hint`). |
| Zerodha | Cannot find ZEN50, Silver ETF, Gold ETF (as read from "Zin 50" — confirm) | The locator only reads titles shaped `MONTHLY PORTFOLIO STATEMENT OF <name> FOR <date>`; these ETF files use a different title format than the equity/debt files it was built on | Open the three real files, add the second title format (or an alias map), test against all three. |
| Union | Gold ETF not found | Same kind of problem as Zerodha's ETFs: a different title format | Same change as Zerodha's, ideally one shared "alternate title formats" fix. Confirm on the real file that it is a title issue and not a missing alias. |
| Wealth Company | Parse error and failed sum check on the VCGE Gold ETF and the Gold and Silver ETF sheets | The fraction-vs-percent scale guess misfires on a sheet that is nearly 100% one holding (a gold ETF holds one thing) | Stop guessing the scale from the percent column alone: derive each weight from market value ÷ total, or from the declared total row, and use the percent column only as a cross-check. Confirm on the real files. |
| WhiteOak, Tata | Data parsing error | Tata's is one sheet (`TMAOF`); WhiteOak's sheet is not identified. **Which pipeline for WhiteOak is unconfirmed** (its factsheet is manual; its disclosure is automatic). | Read the `parse_error file= sheet=` alert line for each. If the same single-holding or scale pattern, it is fixed by Wealth Company's change. |
| Navi | 3 new funds unmatched, including Nifty Smallcap 250 Momentum Quality 100 | Not in our scheme master (the local fund list) | Data, not parser: get them into the scheme master. The other two names to be confirmed. |
| Mirae Asset | 5 new ETFs unmatched; a batch of recently launched thematic ETFs | Same: not in our scheme master | Same fix as Navi. |

**One root cause across Navi, Mirae and the long tail (item 4):** newly launched funds
reach AMC files before they reach our scheme master. A holder of such a fund may also be
unable to match it at CAS import, so this is worth checking for the CAS side, not just
disclosures. Check how the scheme-master refresh picks up new launches, and how long it
lags.

**Why it matters:** each is a real, identified, narrow problem on an AMC that is
structurally automatable, apart from the section-A notes.

### 4. Long-tail partial-AMC sheet issues

One or two funds out of an otherwise-working AMC, found in the AWS alert logs:
ICICI Prudential (Gold ETF, Silver ETF, a couple of savings/overlap sheets), DSP (Tiger,
Silver ETF, Gold ETF), Kotak Mahindra (Silver ETF plus 4 renamed debt funds), UTI (Credit
Risk / Medium Term funds, including their segregated variants), SBI (5 FMP series), Baroda
BNP Paribas (Gold ETF, an Income Plus Arbitrage FOF, Large & Mid Cap), Aditya Birla Sun
Life (Silver ETF), Tata (one sheet, `TMAOF`), Quant (two sheets, `qMES`/`qMAB`), Nippon
India (3 internal codes), Sundaram (5 funds), Groww (several sheets, plus one real parse
bug on `IB67`).

**Why it matters:** no single one moves the needle much, but there are roughly a dozen of
these, and each shows up to a real user as "why is my one gold ETF missing" even though
the rest of that AMC works. Worth a batched investigation pass rather than one-offs,
since several share the same root cause (the fraction/percent scale heuristic, or
scheme-master staleness for newer ETFs).

### 5. Manual-AMC import discipline

**Confirmed still not available on LeapSwitch** (matching AWS, by design): Bandhan
(AES-encrypted listing), Invesco (PDF-only, no Excel source), HSBC (file not collected
yet). **Standing manual by design, not re-verified this round:** Edelweiss, Mahindra
Manulife, ITI, JM Financial.

**Why this isn't a code-fix item:** these AMCs are either genuinely un-automatable or not
worth the engineering cost relative to a 5-minute monthly manual import. Their accuracy
ceiling is set by whether that import actually happens every month, not by anything in
the resolver registry.

**What would actually help:** the same thing attribute 04 needs — see below.

---

### 6. The two jobs: what we meant to build, what we built, how to tighten

| | Sub-project 1 — factsheets (fund managers) | Sub-project 2 — portfolio disclosures (holdings) |
|---|---|---|
| **Meant to** | Monthly: fetch each AMC's factsheet, reject a stale or wrong file, keep last month's managers serving, alert on failure; hand-import the ones that block scripts | "Retry until found, daily, for N days after month-end"; reuse the ops-alerts topic; manual AMCs surface as a queue, no new table |
| **Built** | Matches the design. Runs **once**, 10th of the month, 06:00 IST. Checks the file's "as on" date; `FUND_MANAGER_ALERT` lines go to CloudWatch and then the ops-alerts topic | Matches the design. Runs **daily, days 1–20**, 05:45 IST. Skips files already stored. Late-file and manual-pending alerts on days 10 and 20; a month-end "AMCs with zero batches" summary on day 20; a stale-Wayback alert; a manual queue (`AWAITING_MANUAL_UPLOAD` rows) |

**Where each falls short (found by reading the code, not yet confirmed on live logs):**

1. **SP2 always reports success.** `refresh_portfolio_disclosures` returns `success=True`
   unconditionally and the script exits 0 even if every AMC failed. Only the log-line
   alerts can catch a bad run; the scheduler's own failure signal never fires.
2. **Errors lose their cause.** Both jobs cut the error text at 300 characters and log no
   traceback. That is likely why Sundaram's "internal error" is unexplained.
3. **SP1 gets one shot a month.** An AMC that publishes on the 11th waits a whole month,
   and the 3-month staleness clock ticks meanwhile. SP2 retries daily and handles this.
4. **SP1 has no missed-manual-import alert.** SP2 does (`manual_upload_pending`, days 10
   and 20). The 689 hand-imported funds have none.
5. **No per-AMC outcome line.** Neither job writes one structured line per AMC per run
   (`written` / `not yet published` / `blocked` / `parse error` / `unmatched`). That makes
   AWS-vs-CloudPe comparison manual, and it is what item 7 needs.
6. **No coverage summary.** The day-20 summary lists only AMCs with *zero* batches. An AMC
   with 40 of 45 schemes written is invisible. Neither job reports "this month: N of M AMCs,
   X of Y funds".
7. **Wayback cannot tell "not published" from "not captured."** Its stale alert fires for
   both.
8. **Never tested from AWS:** whether AWS is blocked by any of SP1's ~40 "automatic" AMCs.

**Proposed tightening (all small, none needs a new table):**
- Exit non-zero, and alert, when more than a set share of AMCs failed.
- Log the full traceback on every per-AMC error.
- SP1: run daily over a window (like SP2) and skip AMCs already current this month —
  first check the import is already safe to re-run (the plan says it is idempotent).
- SP1: a missed-manual-import alert modelled on SP2's.
- One outcome line per AMC per run, in both jobs.
- A month-end coverage line per job: AMCs and funds, expected vs got.

### 7. Knowing when an AMC has published

Two different questions: **has this AMC put its file out?** and **when do they usually?**

**Timing, what we know.** SEBI requires monthly portfolios on the AMC's website by the
10th of the following month; that is presumably why the SP2 alert days are 10 and 20 —
*confirm the rule against the current SEBI circular before relying on it.* In practice the
spec says most AMCs publish the same day and Kotak about ten days later. Real per-AMC
publishing days are **not recorded anywhere yet.**

**How "out" is detected today, by mechanism:**

| How we find the file | "It's out" means | Strength |
|---|---|---|
| Date-built URL (Kotak, AlphaGrep, Baroda…) | The URL returns a real workbook, and the date inside is the target month-end | Strongest — a 404 is "not yet" |
| Page with dated links | A new link whose label or file name carries the month | Strong |
| JSON API / records | A record with the target month | Strong |
| Browser-driven pages (ICICI, Sundaram, Bajaj…) | The new month appears in the page's dropdown | Medium — breaks when layout changes |
| Wayback (HDFC) | A capture exists | Weakest — lags, and cannot distinguish "not published" |
| Manual AMCs | Nothing; a person checks | None — this is the gap |
| Factsheets (SP1) | The PDF's own "as on" date is within the 45-day gate | Good, once a file is fetched |

**Proposal (reuse existing tables):**
- SP2 already stores `fetched_at` and `written_at` on each disclosure batch. A query over
  those gives each AMC's real publishing day after two or three months — no new table.
- SP1's table keeps only the reference month. Check whether it has a created/updated
  timestamp before adding a column; if not, one nullable timestamp, or read the job log.
- The outcome line from item 6 records first-seen day per AMC per run from 1 November,
  which starts the history.
- A partial release (some schemes) is told apart by comparing scheme counts with last month.
- For manual AMCs, the missed-month alert in item 6 is the detection; the shared admin
  screen is the fix.

## Shared opportunity: one manual-upload admin screen for both sub-projects

Both attribute 04 (factsheets) and SP2 (portfolio disclosures) have the identical shape
of problem: a fixed list of AMCs that can only be obtained by a human downloading a file
once a month and running a CLI import script. Today that's two separate CLI tools
(`import_manual_fund_managers.py`, `import_manual_portfolio_disclosures.py`) with no
alerting if a month is skipped. A single admin screen — upload a file, pick the AMC and
as-of date, see validation errors before committing — would serve both, is one build
instead of two, and removes the silent-miss risk from both at once. Worth scoping as one
item rather than deciding it twice.

## Suggested order

1. **Cheap and immediate, no dependencies:** the AWS-blocking verification for attribute
   04's 40 automatic AMCs, and a missed-month alert for attribute 04 — both already
   identified, neither needs a design decision first.
2. **HDFC's Wayback fix** — highest single-AMC impact in SP2, already has a known
   solution.
3. **The job tightening (item 6)** — non-zero exit, full tracebacks, per-AMC outcome line. It makes every later fix visible, and Sundaram's cause lives behind the truncation.
4. **The per-AMC fix register (item 3)** — bounded fixes; Zerodha/Union/Angel One/Wealth first, then the scheme-master gap for Navi/Mirae.
5. **Release detection (item 7)** — starts recording on 1 November; cheap.
6. **Decide attribute 04's long-term strategy** (manual / ask AMCs / vendor) — this
   decision gates whether the shared admin screen is worth building now or later.
7. **The long-tail batch** — lower priority individually; bundle into one investigation
   pass.
8. **Shared admin screen** — build once the long-term strategy decision (step 6) confirms
   manual import is staying as a permanent part of the system, not a stopgap.

## Open questions

Assumptions made reading the 16 Oct message — please confirm:

1. "Zin 50" read as **ZEN50**, the name in the AWS alert log.
2. The six factsheets listed after Angel One (DSP, Jio BlackRock, Mahindra, Mirae, Motilal, SBI) are missing on CloudPe for the same reason; no cause was given.
3. **Sundaram** "internal error" read as the factsheet job (it is also in the SP2 long tail).
4. **WhiteOak** "data parsing error": factsheet (manual) or disclosure (automatic)? Tata and Wealth Company read as disclosures.
5. Navi's other two new funds, and Mirae's five ETF names, are not yet known.
6. "Sound check" read as **sum check**; "VCGE" kept as written.
