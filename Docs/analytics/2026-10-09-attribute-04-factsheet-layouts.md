# Attribute 04 — factsheet layout catalogue

**Date:** 2026-10-09 · **Status:** card 3's catalogue: part 1 = the 3 manual-import files; part 2 = all 57 AMCs in AMFI's directory, fetched the same day.
**Files tested** (supplied by the user, kept outside git — public PDFs, 8–22 MB each):
`HDFC MF Factsheet - August 2026.pdf` (144 pp), `KotakMFFactsheetSeptember2026.pdf` (193 pp),
`Edelweiss_Factsheet_September_2026_15092026193426.pdf` (270 pp). Text extracted with `pypdfium2`
(the plan's library): 5–10 s per file.

## Headline

- **The plan's generic extractor finds nothing in any of the three.** `_MANAGER_BLOCK_RE` needs a
  `Mr./Ms./Dr.` name followed by "Managing Since" within 80 characters; matches: HDFC 0, Kotak 0,
  Edelweiss 0 pages.
- **The plan's "first non-empty line is the scheme name" rule fails** on all three (page numbers,
  running headers, style boxes and wrapped headings come first).
- **With one extractor and one heading rule per layout** (prototyped below), every factsheet scheme
  page yields managers and a name, and every name matches an AMFI fund family, using the plan's
  matcher unchanged (exact, then fuzzy ≥ 0.80 with the 0.05 guard):

| AMC | Scheme pages with managers | Matched exact / fuzzy / unmatched | Live AMFI funds covered | Not in this file |
|---|---|---|---|---|
| HDFC | 53 | 53 / 0 / 0 | 53 of 112 | 59: index funds and ETFs (HDFC publishes passive funds in a separate factsheet) and 5 FMP-type "Income" rows |
| Kotak | 112 | 108 / 4 / 0 | 112 of 120 | 8 |
| Edelweiss | 76 | 71 / 5 / 0 | 76 of 76 | — |

"Live" = an AMFI NAV dated on or after 1 Sep 2026. Fund family = `(amc_name, base_name)`, as decided in card 1.

## Layout 1 — HDFC: "FUND MANAGER" table

```
HDFC Large Cap Fund
An open ended equity scheme predominantly investing in large cap stocks
...
FUND MANAGER ¥
Name Since Total Exp
Rahul Baijal July 29,
2022
Over 25
years
Bhagyesh Kagalkar
(Gold/Silver Instruments)
August
26,2026
...
DATE OF ALLOTMENT/INCEPTION DATE
```

- **Heading:** the first line that isn't a running header (`"12 | August 2026"`, `"For Product label…"`, `"....Contd from previous page"`).
- **Managers:** text between `FUND MANAGER` and `DATE OF ALLOTMENT` / `NAV (` / `ASSETS UNDER`, joined
  into one line, then `name [(role)] <Month D, YYYY> Over N years`. No `Mr.` prefix. Dates wrap
  across lines and can lack a space ("August 26,2026").
- **Role** is printed for specialist co-managers ("Gold/Silver Instruments", "Debt Assets") → `role`.
- **Overseas-investment manager** sits in a footnote ("¥ Fund Manager for Overseas Investments: Mr. Dhruv
  Muchhal (since June 22, 2023)") — a second, optional pattern; one prototype miss came from a
  leaked table header ("Name Since Total Exp Anupam Joshi"), so strip that header before matching.
- **Month check:** "Data is as of August 31, 2026" on every scheme page.
- **Gap:** passive funds are in HDFC's separate passive factsheet — ops needs to download both.

## Layout 2 — Kotak: "Fund Manager*:" line, no dates

```
KOTAK LARGE CAP FUND
Large cap fund - An open-ended equity scheme predominantly investing in large cap stocks
...
Fund Manager*: Mr. Rohit Tandon
```

- **Heading:** the first upper-case line starting `KOTAK `; cut at " - An open", "NSE Symbol", "(";
  join the next line when the name wraps ("KOTAK INFRASTRUCTURE &" + "ECONOMIC REFORM FUND"). Debt
  pages start with a style box ("Maturity Short Medium Long…"), so "first line" never works.
- **Managers:** after `Fund Manager*:`, split on `&`, `,`, "and"; strip `Mr./Ms.`. Names can carry
  an effective date: "Mr. Sunil Pandey (w.e.f. June 01, 2026)", "Deepak Agrawal (effective October 24, …)"
  → that date is `managing_since`; otherwise `managing_since` is null (like ABSL, Review Focus #5).
- **No managing-since dates** on scheme pages; the "About our fund managers" pages (164–168, 183–187)
  list each manager's funds with the *fund's* inception date, not the manager's start — don't use them.
- **Month check:** "as on 30th September 2026" in the footnotes.

## Layout 3 — Edelweiss: bullet list + slash-separated dates

```
Edelweiss Large & Mid Cap Fund
Type of Scheme: An open ended equity scheme investing in both large cap and mid cap stocks
...
Fund Manager Details
Name of Fund Managers
• Mr. Sumanta Khan
• Mr. Trideep Bhattacharya
• Mr. Ashish Sood
Total
Experience 18 / 27 / 11
Managing
Since
Apr 01, 2024 / Oct 01, 2021 / Aug 03,
2026
```

- **Heading:** first line that isn't a bare page number / "Past Performance…"; join a wrapped second
  line (index-fund names run long: "Edelweiss Nifty500 Multicap Momentum Quality 50 Index Fund").
- **Managers:** bullets between `Name of Fund Managers` and `Total Experience`; dates after
  `Managing Since`, split on `/`, paired by position. 1 of 186 rows had no date.
- **Month check:** "Data as on August 31, 2026" (the September factsheet carries August-end data).

## What this changes in the A04 plan (for the plan revision)

1. Replace the single `extract_managers_generic` with a per-layout extractor chosen by AMC
   (`hdfc_table`, `kotak_line`, `edelweiss_bullets`, plus the existing ABSL line), each returning the
   same `{name, role, since_raw}` dicts — the rest of the pipeline is unchanged.
2. Replace "first non-empty line is the scheme name" with a per-layout heading rule (above).
3. Keep the matcher as is: it matched 100% of extracted names here, so the AUM tie-break (card 1,
   option C) still isn't needed.
4. The month check must accept "data as on <previous month-end>" — Edelweiss's September file and
   HDFC's August file both state the prior month-end.
5. Test fixtures: one short text excerpt per layout (a few KB, from these files), committed under
   `backend/tests/fixtures/factsheets/`; the PDFs stay outside the repo.
6. Ops procedure: HDFC needs **two** files a month (active + passive factsheet).

---

# Part 2 — every AMC in AMFI's factsheet directory (9 Oct)

**How:** `catalogue.py` (kept with the text dumps in `Desktop/Unifolio/Factsheets/2026-10-catalogue/`,
outside the repo) read AMFI's directory page, took each AMC's `amc_monthly_mf_factsheets` landing
URL, fetched it with plain HTTP (no browser), picked the best-scoring `.pdf` link (URL contains
"factsheet", prefers 2026 and a month), downloaded it, extracted the text with `pypdfium2` and
counted manager-block signatures. One run, ~25 minutes.

## What this changes in the plan (findings)

1. **AMFI's directory is keyed by the company, not the fund house.** Its `amc_name` is "Aditya Birla
   Sun Life AMC Limited"; our `schemes.amc_name` (from NAVAll) is "Aditya Birla Sun Life Mutual Fund".
   The plan's `directory.get(amc_name)` would miss every AMC. Each registry entry needs the
   directory's company name too (mapping below, 55/57 exact by name; 2 have no schemes).
2. **The plan's directory regex looks for `"amcName"`; the field is `"amc_name"`.** The real payload
   also carries `amc_website`, `amc_monthly_portfolio_disclosure`, etc. — 57 entries, 51 with a URL.
3. **Plain HTTP reaches a factsheet for 22 of 57; 29 landing pages have no factsheet link in their
   HTML** (JS-rendered lists or differently named links — e.g. Angel One shows 150 PDF links, Motilal 20,
   none with "factsheet" in the URL), and **6 have no landing URL at all**.
4. **"First PDF on the page" picks the wrong file often.** Of the 22, only ~11 picked this month's
   factsheet. Others picked a how-to guide (Mirae), a methodology note (Sundaram), or a stale month
   (HSBC 2020, Zerodha Sep 2025, LIC/Bajaj/Shriram/DSP/Capitalmind March–June 2026). Card 4's checks
   (content + month) are what keep these out — they're essential, not defensive extras.
5. **Edelweiss is reachable now.** Its landing page served the September factsheet over plain HTTP —
   it no longer needs the manual path (the 8 Oct "403 to a headless browser" finding is out of date).
   HDFC's and Kotak's pages have no link in their HTML; they stay manual.
6. **The plan's generic manager regex works for 5 AMCs** (Nippon, Groww, Helios, PPFAS, Samco — partially)
   **and nothing else.** There's no single "generic" layout: 6 layout families exist among the files
   we could read, and some AMCs need per-AMC handling.
7. **Carnelian and Nuvama have no AMFI-listed schemes**; IL&FS (3 live funds), AlphaGrep (3), Lakshya (1),
   Monarch (1) have no landing URL but *do* have live funds — they need a resolver found by hand or
   the manual path, not "nothing to resolve".

## Layout families

| Family | Shape (from the real text) | AMCs seen |
|---|---|---|
| **A · bullets + slash dates** | `Name of Fund Managers • Mr. A • Mr. B (Assistant Fund Manager) Total Experience 30 / 14 Managing Since: August 2007 / August 2024` | Nippon, Edelweiss |
| **B · labelled, repeated per manager** | `Name of Fund Manager: X  Total Experience: 33 Years  Managing Since: 03 February 2025` (repeats); variants: `Fund Manager: Mr. X (Equity), managing since 23rd March 2026; Mr. Y …` (Abakkus), `Name of the Fund Manager: Mr. A, Mr. B and Mr. C … Managing the Scheme Since …` (NJ), name line then `Managing since: Inception` (Samco) | quant, Helios, PPFAS, Samco, Abakkus, NJ |
| **C · heading block** | `FUND MANAGER Rohit Singhania Total work experience of 24 years. Managing this Scheme since June 2015.` (DSP); `Fund Manager - Mr. Harish Krishnan Managing the Fund Since: January 07, 2026` (ABSL); `Fund Manager & Experience Neelotpal Sahai … Managing this fund Since May 27, 2013` (HSBC); `Fund Managers Experience Managing Fund Since Mr. George Thomas 12 years April 01, 2022` (Quantum); `Fund Manager (Managing since inception) V N Saravanan – CIO …` (Unifi); `Mr. X (Head of Equity) (Managing fund since inception …)` (Capitalmind) | ABSL, DSP, HSBC, Quantum, Unifi, Capitalmind |
| **D · multi-fund summary table** | one page lists 6–8 funds in columns; managers per column flattened into one run of names (`Fund Manager Mr. A Mr. B Mr. A Mr. C …`) — can't be paired to funds from text order alone | Canara Robeco, Groww, LIC |
| **E · HDFC table** | part 1 | HDFC (manual file) |
| **F · Kotak line** | part 1 | Kotak (manual file) |

Family C is one pattern with per-AMC labels (heading text, "since" phrase, name/role separators);
family D needs either the AMC's per-scheme pages (if the factsheet has them further on) or
coordinate-aware extraction (`pypdfium2` gives character boxes) — decided per AMC during onboarding.

## Per-AMC status

| Fund house | Today's fetch (plain HTTP, 9 Oct) | File picked | Layout family |
|---|---|---|---|
| (no AMFI-listed schemes) | no factsheet page listed by AMFI | — | — |
| (no AMFI-listed schemes) | no factsheet page listed by AMFI | — | — |
| 360 ONE Mutual Fund | page has no factsheet link in its HTML (4 PDF links; JS-rendered or named differently) | — | — |
| Abakkus Mutual Fund | PDF fetched, 16 pp, data as on 31st July 2026 | Abakkus_Mutual_Fund_Factsheet_July_2026_7d7bfc4d | B labelled |
| Aditya Birla Sun Life Mutual Fund | PDF fetched, 255 pp, data as on July 31, 2026 | absl-factsheet_aug-2026.pdf | C heading block |
| AlphaGrep Mutual Fund | no factsheet page listed by AMFI | — | — |
| Angel One Mutual Fund | page has no factsheet link in its HTML (150 PDF links; JS-rendered or named differently) | — | — |
| ASK MUTUAL FUND | page has no factsheet link in its HTML (0 PDF links; JS-rendered or named differently) | — | — |
| Axis Mutual Fund | page has no factsheet link in its HTML (1 PDF links; JS-rendered or named differently) | — | — |
| Bajaj Finserv Mutual Fund | PDF fetched, 58 pp, data as on 30th April 2026 | Factsheet_June-2026.pdf | — |
| Bandhan Mutual Fund | page has no factsheet link in its HTML (0 PDF links; JS-rendered or named differently) | — | — |
| Bank of India Mutual Fund | page has no factsheet link in its HTML (0 PDF links; JS-rendered or named differently) | — | — |
| Baroda BNP Paribas Mutual Fund | page has no factsheet link in its HTML (6 PDF links; JS-rendered or named differently) | — | — |
| Canara Robeco Mutual Fund | PDF fetched, 74 pp, data as on 31st August, 2026 | Canara-Robeco-factsheet-as-on-August-2026-1.pdf | D multi-fund table |
| Capitalmind Mutual Fund | PDF fetched, 41 pp, data as on ? | Capitalmind_Mutual_Fund_Factsheet_March_2026_bb6 | C heading block |
| Choice Mutual Fund | page has no factsheet link in its HTML (0 PDF links; JS-rendered or named differently) | — | — |
| DSP Mutual Fund | PDF fetched, 170 pp, data as on JUNE 30, 2026 | dsp-factsheet-june-2026.pdf | C heading block |
| Edelweiss Mutual Fund | PDF fetched, 270 pp, data as on August 31, 2026 | Edelweiss_Factsheet_September_2026_1509202619342 | A bullets+slash |
| Franklin Templeton Mutual Fund | page has no factsheet link in its HTML (0 PDF links; JS-rendered or named differently) | — | — |
| Groww Mutual Fund | PDF fetched, 118 pp, data as on 30 June 2026 | Monthly%20Factsheet%20June-2026.pdf | D multi-fund table |
| HDFC Mutual Fund | page has no factsheet link in its HTML (0 PDF links; JS-rendered or named differently) | — | E HDFC table (manual file) |
| Helios Mutual Fund | PDF fetched, 34 pp, data as on September 30, 2026 | helios-mutual-fund-factsheet-september-2026.pdf | B labelled |
| HSBC Mutual Fund | PDF fetched, 38 pp, data as on 30 September 2020 | the-asset-factsheet-september-2020.pdf | C heading block |
| ICICI Prudential Mutual Fund | page has no factsheet link in its HTML (0 PDF links; JS-rendered or named differently) | — | — |
| IL&FS Mutual Fund (IDF) | no factsheet page listed by AMFI | — | — |
| Invesco Mutual Fund | page has no factsheet link in its HTML (0 PDF links; JS-rendered or named differently) | — | — |
| ITI Mutual Fund | page has no factsheet link in its HTML (0 PDF links; JS-rendered or named differently) | — | — |
| Jio BlackRock Mutual Fund | page has no factsheet link in its HTML (0 PDF links; JS-rendered or named differently) | — | — |
| JM Financial Mutual Fund | page has no factsheet link in its HTML (0 PDF links; JS-rendered or named differently) | — | — |
| Kotak Mahindra Mutual Fund | page has no factsheet link in its HTML (0 PDF links; JS-rendered or named differently) | — | F Kotak line (manual file) |
| Lakshya Mutual Fund | no factsheet page listed by AMFI | — | — |
| LIC Mutual Fund | PDF fetched, 88 pp, data as on 31st March 2026 | lic-mf-factsheet-31st-march-2026-111118910.pdf | D multi-fund table |
| Mahindra Manulife Mutual Fund | page has no factsheet link in its HTML (0 PDF links; JS-rendered or named differently) | — | — |
| Mirae Asset Mutual Fund | PDF fetched, 4 pp, data as on 31 March 2017 | mutual_fund_factsheet_how_to.pdf | — |
| Monarch Mutual Fund | no factsheet page listed by AMFI | — | — |
| Motilal Oswal Mutual Fund | page has no factsheet link in its HTML (20 PDF links; JS-rendered or named differently) | — | — |
| Navi Mutual Fund | page has no factsheet link in its HTML (0 PDF links; JS-rendered or named differently) | — | — |
| Nippon India Mutual Fund | PDF fetched, 372 pp, data as on Sep 3, 2026 | Nippon-FS-September-2026.pdf | A bullets+slash |
| NJ Mutual Fund | PDF fetched, 18 pp, data as on September 30, 2026 | viewfile.php?file=NJ-AMC-Factsheet-September-202 | B labelled |
| Old Bridge Mutual Fund | page has no factsheet link in its HTML (0 PDF links; JS-rendered or named differently) | — | — |
| PGIM India Mutual Fund | page has no factsheet link in its HTML (4 PDF links; JS-rendered or named differently) | — | — |
| PPFAS Mutual Fund | PDF fetched, 32 pp, data as on September 30, 2026 | ppfas-mf-factsheet-for-September-2026.pdf?081020 | B labelled |
| quant Mutual Fund | PDF fetched, 150 pp, data as on ? | quant_Factsheet_-_September_2026.pdf | B labelled |
| Quantum Mutual Fund | PDF fetched, 44 pp, data as on ? | 2020202f-e9c8-436a-9918-4a355b04891b.pdf | B labelled |
| Samco Mutual Fund | PDF fetched, 31 pp, data as on September 30, 2026 | Factsheet-September2026_1791201633.pdf | B labelled |
| SBI Mutual Fund | page has no factsheet link in its HTML (5 PDF links; JS-rendered or named differently) | — | — |
| Shriram Mutual Fund | PDF fetched, 32 pp, data as on ? | SAMC-Factsheet-April-2026.pdf | — |
| Sundaram Mutual Fund | PDF fetched, 2 pp, data as on ? | Factsheet_Calculation_Methodology.pdf | — |
| Tata Mutual Fund | page has no factsheet link in its HTML (5 PDF links; JS-rendered or named differently) | — | — |
| Taurus Mutual Fund | page has no factsheet link in its HTML (15 PDF links; JS-rendered or named differently) | — | — |
| The Wealth Company Mutual Fund | page has no factsheet link in its HTML (0 PDF links; JS-rendered or named differently) | — | — |
| Trust Mutual Fund | page has no factsheet link in its HTML (0 PDF links; JS-rendered or named differently) | — | — |
| Unifi Mutual Fund | PDF fetched, 13 pp, data as on 31st August 2026 | Unifi-MF-Factsheet-Sep-2026.pdf | C heading block |
| Union Mutual Fund | page has no factsheet link in its HTML (4 PDF links; JS-rendered or named differently) | — | — |
| UTI Mutual Fund | page has no factsheet link in its HTML (0 PDF links; JS-rendered or named differently) | — | — |
| WhiteOak Capital Mutual Fund | page has no factsheet link in its HTML (0 PDF links; JS-rendered or named differently) | — | — |
| Zerodha Mutual Fund | PDF fetched, 35 pp, data as on 30 Sep 2025 | Factsheet - Sep 25.pdf | — |


AMFI company → fund house mapping used above is in `dir_to_amc.json` next to the dumps (55 exact;
Carnelian and Nuvama have no AMFI-listed schemes).
