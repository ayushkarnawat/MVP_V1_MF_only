# Sub-project 2 — Task 12 capture log (2026-10-13)

Evidence behind the ingestion plan's registry and parser. Four capture agents each fetched, replayed with plain HTTP, and opened the real September 2026 files (Groups A, B, C1, C2 below). Fixtures are in `backend/tests/fixtures/portfolio_disclosures/` (see its README). **Where this log contradicts the plan's registry or parser assumptions, this log wins** (ingestion plan Revision block). Anything marked "not verified" was not checked.

## Cross-cutting findings (orchestrator summary)

**Verdicts (44 automatable + WhiteOak):** all fetched; no AMC was blocked except **Bandhan** (listing is an AES-encrypted call; file itself is public but its name is unguessable) — needs a decision (recommended: 7th manual AMC, same rule as Mahindra Manulife). Taurus's Sept 2026 file is not published yet (March used). Choice has a September file only for Overnight.

**Parser requirements the fixtures prove (Task 2 / Task 4):**
1. **Weight scale differs by file.** `% to NAV` is a fraction (0.0567 = 5.67%) for Axis, Trust, Mirae, LIC, Aditya Birla, Bank of India, Monarch, Bandhan, Unifi, Zerodha, Sundaram, ICICI, Bajaj, WhiteOak, Choice `.xlsx`, Nippon, and percent points for SBI, Taurus, HDFC, Canara, Navi, PGIM, Jio, Abakkus, quant, Tata, UTI. Detect per sheet (total near 1.0 means multiply by 100) before the 90–101% sum check, never per AMC.
2. **Reconcile to the sheet's Grand Total row, not by summing sections** (Arbitrage/derivative funds show negative short-leg blocks outside the total; Jio "Money Market" header row carries numbers; quant has duplicated TREPS/NCA/Total rows).
3. **Stop at `GRAND TOTAL`** (Aditya Birla has a defaulted-securities annexure with ISIN-like rows after it; Jio has a second table after Grand Total).
4. **Sniff real format by magic bytes**, not extension (Nippon, PPFAS consolidated, 360 ONE, Baroda consolidated, Bajaj `.xls`/Taurus are OOXML under old names; Aditya Birla is a ZIP wrapping a legacy xls).
5. **Header/data column offset:** several AMCs have an unlabelled leading code column (Bandhan, Abakkus, Jio, Zerodha, Axis…); HDFC puts ISIN before the name; UTI's ISIN column shifts (match ISINs by regex per row).
6. **Text in numeric cells:** `$0.00%`, `*`, `NIL`, `#VALUE!`; units "Lacs"/"Lakhs"/"lakh".
7. **Non-holdings sheets** inside holdings workbooks: `XDO_METADATA`, `TSS Performance`, `Annexure`, `F & O Disclosure`, `Scheme` (Kotak index), Index with header `Short Name` (Axis) or `Scheme Code`, LIC's index sheet named `Sheet1`.
8. **Sheets named by code** (Index lookup needed, Task 11): Bank of India YB01–YB45, Bandhan, Jio, Abakkus, quant, Zerodha, Tata, Sundaram, Bajaj, ICICI, Nippon, Quantum, Groww (IB01…).
9. **Funds with no ISIN rows legitimately** (overnight/liquid: Helios Overnight, Monarch Overnight, Choice Overnight) — written as `CASH_EQUIVALENT`, weights may exceed 1.0 or sit far from 100; they need an explicit exception to the sum band (see handoff).
10. **UTI** ships one ZIP whose holdings member is a single sheet with 88 scheme blocks (`SCHEME CODE0xxSTARTS`/`ENDS`): a new file shape.

**Registry corrections (full text per AMC below):** hosts — Bank of India is `www.boimf.in`, Monarch is `www.monarchamc.in` and publishes a **monthly** file (not fortnightly-only), AlphaGrep needs `www.alphagrepmf.ai` + `files.json` manifest; SBI endpoint is `GetSchemePortfolioSheets` (no `QS`) and returns HTML; LIC returns HTML to form POSTs; Franklin is a JSON GET (`/api/literature/v1/documents`); Tata has no API (page HTML embeds the links); Jio is a Next server-action POST; quant needs ASP.NET page-method POSTs; ICICI is JSON_API (`apimf.icicipruamc.com/nms/v1/downloads/files`) and needs an honest/complete header set; Abakkus reads an embedded `verticals-data` JSON; Sundaram has two workbooks a month; PGIM has a real endpoint; WhiteOak is a Strapi JSON API with a UA gate (project Chrome UA works); Old Bridge, DSP, Baroda, 360 ONE, PPFAS, Capitalmind, NJ, Wealth Company, Unifi, Zerodha, Navi link patterns differ from the plan. HDFC's Wayback mechanism is weak: the plan's landing URL has no captures; the one capture lists August files and its links are in embedded JSON, not anchors.

**Open decisions (user / manager):** Bandhan manual or not; Invesco PDF-only; Choice month-end data for index/gold funds; HDFC mechanism (Wayback path is fragile: consider the guessed-pattern direct fetch, `s3fs-public/<YYYY-MM>/Monthly HDFC <Scheme> - <date>.xlsx`, as the primary and Wayback as fallback).

---

## Group A
# Group A capture (20 AMCs), run 2026-10-13

Target as-of 2026-09-30 was published for ALL 20 AMCs (no fallback to 2026-08-31 needed). All GETs with a Chrome UA via curl. Playwright (/usr/bin/google-chrome) was used ONCE, only for Franklin Templeton discovery. No block hit anywhere.
Fixtures dir: backend/tests/fixtures/portfolio_disclosures/ (files saved byte-for-byte; the 3 "trimmed" ones are openpyxl copies, cell contents untouched).
Percent-unit convention differs per AMC (noted per section): fraction (0.0322) vs percent (3.22). A parser must detect it per file.

CROSS-CUTTING FINDINGS
- Extension lies: Nippon (.xls URL), PPFAS consolidated (.xls URL), 360 ONE (.xls URL), Baroda consolidated (.xls URL) all return OOXML (PK zip) bytes. Real BIFF .xls: Shriram, Helios, Franklin, AlphaGrep. Sniff magic bytes, never the extension.
- Tiny-percent cells can be text like '$0.00%' or '*' (Nippon, DSP) -> non-numeric in the % column.
- Notes sections below the holdings contain ISIN-bearing rows (DSP defaulted-securities table; Shriram, Union, PPFAS default tables) -> parser must stop at GRAND TOTAL / first 'Notes' row.
- Side tables to the right of the holdings in the same rows (DSP cols K-L 'Sector/Rating|Percent'; Motilal cols J-K; Union cols after YTM: Industry/Sector/Top 10 Issuers) -> restrict to the header-defined columns.
- Derivative short legs appear as negative Sub Totals (Capitalmind/NJ/Samco/Old Bridge arbitrage, NJ BAF) -> sums of equity sections are not 100%.

---
## 1. Nippon India  -- CONFIRMED-WITH-CHANGE (file shape/ext caveat)
- Landing (GET): https://mf.nipponindiaim.com/investor-service/downloads/factsheet-portfolio-and-other-disclosures/ (200, plain href list).
- File link: <a href="/InvestorServices/FactsheetsDocuments/NIMF-MONTHLY-PORTFOLIO-30-Sep-26.xls"> -> https://mf.nipponindiaim.com/InvestorServices/FactsheetsDocuments/NIMF-MONTHLY-PORTFOLIO-30-Sep-26.xls (200, application/vnd.ms-excel, 1,352,141 B). Saved nippon-india_asof_2026-09-30.xls.
- Page lists ~343 xls links (2012 onward): old names 'Reliance-Monthly-Portfolios-...', 'MONTHLY-PORTFOLIO-AUGUST-2023.xls', 'NIMF-MONTHLY-PORTFOLIO-30-Sep-24/25/26.xls', plus 'NIMF-FORTNIGHTLY-PORTFOLIO-30-Sep-26.xls' and 'Weblink-Files-for-Upload-September-2026.zip'. Month selection must be done on the date token (DD-Mon-YY, 'Sep'/'Sept'/'September' vary in older ones).
- Magic: 504b0304 (OOXML) despite .xls. 108 sheets: 'Index' + 2-letter codes (GF, GS, IP...). Index sheet: col A = sheet code, col B = full scheme name incl. SEBI descriptor; each holdings sheet row0 = ['RLMF001', '<scheme name (descriptor)>', 'Index'] (RLMF code = Nippon scheme code); row1 'Monthly Portfolio Statement as on September 30,2026'.
- Header (row 3, col A blank!): 'ISIN' | 'Name of the Instrument' | 'Industry / Rating' | 'Quantity' | 'Market/Fair Value ( Rs. in Lacs)' | '% to NAV' | 'YIELD'. Data rows carry a hidden-ish internal code in col A (e.g. MCEX02) with no header. Percent = FRACTION (0.0322).
- Sections: 'Equity & Equity related', '(a) Listed / awaiting listing on Stock Exchanges', '(b) UNLISTED', 'Debt Instruments', 'Floating Rate Note', 'Government Securities', 'Non Convertible Debentures', 'Zero Coupon Bonds', '(c) Securitised Debt', 'Derivatives' / 'Interest Rate Swaps', 'Money Market Instruments', 'Certificate of Deposit', 'Triparty Repo/ Reverse Repo Instrument', 'Alternative Investment Fund Units', 'Mutual Fund Units', 'Exchange Traded Funds', 'OTHERS'. Totals: 'Subtotal', 'Total', 'Net Current Assets', 'GRAND TOTAL' (=1).
- Sum check: GF: equity ISIN rows 0.9902 (+0.0095 repo +0.0016 margin -0.0013 NCA, GRAND TOTAL 1); GS 0.9563; IP (debt, ISIN rows only) 0.8974 (GRAND TOTAL 1). Derivative/fund-unit lines present: IP has 'Interest Rate Swaps' with ISIN-less rows; AF/PP/AL/K5 have 'Mutual Fund Units'; GD/RJ/SO 'Exchange Traded Funds'. Note '$0.00%' text in tiny rows (AF).
- Plan vs reality: plan says SINGLE_WORKBOOK_MULTI_SHEET, link_pattern r"MONTHLY-PORTFOLIO" -> true shape, but pattern matches every year since 2012 (incl. 'FORTNIGHTLY-MONTHLY-PORTFOLIO-31-AUG-22.xls', 'NIMF-MONTHLY-PORTFOLIO-30-Sep-25.xls'); needs a date filter. URL ends .xls but bytes are xlsx.

## 2. Shriram  -- CONFIRMED
- Landing: https://www.shriramamc.in/investor-statutory-disclosures (200, 1.29 MB, plain <a href="https://cdn.shriramamc.in/...">Download</a> inside accordions).
- File: https://cdn.shriramamc.in/uploads/Statutory-disclosure/Monthly--Fortnightly--Weekly-Portfolio-of-Scheme(s)/Monthly-Portfolio-for-the-Financial-Year/2026-2027/Monthly-Portfolio-Shriram-Mutual-Fund-September-2026.xls (200, 557,056 B). Saved shriram_asof_2026-09-30.xls. Path pieces: FY dir '2026-2027', month name full except 'Jan-2026' (Jan uses 3 letters in the FY25-26 dir) -> month token not uniform.
- Magic d0cf11e0 (real BIFF). 11 sheets named by SCHEME NAME ('Shriram Aggressive Hybrid Fund', ...); NO index sheet.
- Header (row 18): 'Name of  Instrument' (two spaces) | 'ISIN' | 'Industry/Rating' | 'Quantity' | 'Market/Fair Value  (INR Lacs)' | '%  to Net Assets' | '% Yield'; name BEFORE isin; col A blank, but the top ~6 rows have '|' in col A (shifts the columns by one for those rows only). Percent = PERCENT (4.32).
- Sections: 'Equity & Equity related', '(a)Listed / Awaiting listing on Stock Exchanges', '(b) Unlisted', 'Debt Instruments', '(c)Securitised Debt Instruments', 'Money Market Instruments', 'Certificate of Deposit', 'Treps'; 'Sub Total', 'TOTAL', 'GRAND TOTAL' (100.0). Below: 'Top 10 Holdings', 'Equity Portfolio Classification by Asset Class (%)' side tables with numeric rows.
- Sum: Aggressive Hybrid ISIN rows 99.2 (+ cash; GRAND TOTAL 100.0); Flexi Cap 95.73.
- Plan: all matches (link_pattern ok, multi-sheet ok).

## 3. PPFAS (Parag Parikh)  -- CONFIRMED-WITH-CHANGE
- Landing: https://amc.ppfas.com/downloads/portfolio-disclosure/ (200, 427 KB; plain hrefs).
- Page lists, per month, ONE consolidated file AND eight per-scheme files, all matching the plan regex:
  consolidated (no prefix, 7 sheets): /downloads/portfolio-disclosure/2026/PPFAS_Monthly_Portfolio_Report_September_30_2026.xls?07102026 (400,503 B)
  per-scheme (1 sheet each): PPAF_, PPCHF_, PPDAAF_, PPFCF_, PPLCF_, PPLF_, PPTSF_ + 'PPFAS_Monthly_Portfolio_Report_..' e.g. .../2026/PPTSF_PPFAS_Monthly_Portfolio_Report_September_30_2026.xlsx?07102026 (82,602 B).
  Saved: ppfas_asof_2026-09-30.xls (consolidated) and ppfas-elss-tsf_asof_2026-09-30.xlsx. The '?07102026' query is a DDMMYYYY upload cache-buster, suffixes like '?08052026_1' vary; URL date in path 'September_30_2026' (also 'Oct_31_2021', 'Sept_30_2021' in history -> month token varies).
- Magic of the consolidated '.xls': 504b0304 (OOXML!). Sheets: PPFCF, PPLF, PPTSF, PPCHF, PPAF, PPDAAF, PPLCF (scheme CODES, no Index sheet; scheme name in A1: 'Parag Parikh Flexi Cap Fund (An open-ended ...)'). Per-scheme file has one sheet named by code.
- Header (row 3, col A blank): 'Name of the Instrument' | 'ISIN' | 'Industry / Rating' (debt: 'Rating') | 'Quantity' | 'Market/Fair Value  (Rs. in Lakhs)' | '% to Net  Assets' (double space) | 'YTM~' | 'YTC^'. Col A holds an internal code (HDFB03). Percent = FRACTION.
- Sections: 'Equity & Equity related', '(a) Listed / awaiting listing on Stock Exchanges', 'Arbitrage', '(b) Reits', 'Equity & Equity related Foreign Investments', 'Money Market Instruments', 'Certificate of Deposit', 'Commercial Paper', 'Treasury Bill', 'Others', 'Mutual Fund Units', 'Reverse Repo / TREPS', 'Derivatives', 'Index / Stock Futures'. Totals: 'Sub Total', 'Total', 'GRAND TOTAL' (1).
- Sum: PPFCF ISIN rows 0.9614; PPTSF 0.9682; PPLF 0.8996 (+TREPS to 1.0).
- Plan contradictions: (a) plan note says 'single workbook' and cites the example '.../PPTSF_PPFAS_Monthly_Portfolio_Report_September_30_2026.xlsx?07102026' as that workbook -> that example is a SINGLE-SCHEME file; the multi-sheet consolidated is the unprefixed 'PPFAS_Monthly_Portfolio_Report_<Month>_<dd>_<yyyy>.xls'. link_pattern r"PPFAS_Monthly_Portfolio_Report" matches 9 files per month (all prefixes) -> double ingest unless pattern anchors on the unprefixed name (e.g. '/PPFAS_Monthly_Portfolio_Report'). (b) consolidated has .xls name but xlsx bytes.

## 4. Groww  -- CONFIRMED-WITH-CHANGE
- Landing: https://www.growwmf.in/statutory-disclosure/portfolio (200, plain <a href>).
- Files (two links, identical bytes, cmp-verified): https://assets-netstorage.growwmf.in/compliance_docs/Statutory%20Disclosure/Portfolio/2026%20-2027/Monthly%20Portfolio%20-%20September%2030,%202026.xlsx AND .../Monthly%20Portfolio-%20Sep%2030%202026.xlsx (200, 3,552,859 B each). Names are inconsistent month to month (space/no space before '-', 'Sep'/'September'/'Aug', comma/no comma, '.xls' vs '.xlsx' in FY25-26 and earlier). Page also lists 'Monthly AAUM - ...' files (different doc).
- Fixture: >2 MB -> groww_asof_2026-09-30-trimmed.xlsx (160 KB, sheets IB01 IB02 IB03 only; no Index sheet exists in source).
- Source: 63 sheets, names = codes IB01..IB72 (gaps) + trailing 'XDO_METADATA' (Oracle BI Publisher artifact, not a scheme). Row0 = ['BC'(short code), 'IB01-Groww Large Cap Fund'] -> scheme name is in B1 after 'IBnn-'. Row1 'Portfolio as on 30-SEP-2026'.
- Header (row 2): 'ISIN' | 'Name of Instrument' | 'Rating/Industry' | 'Quantity' | 'Market Value (In Rs. lakh)' | '% To Net Assets' | 'Maturity Date' | 'Put/Call Option' | 'Yield'; col A of data rows blank, ISIN in col B. Percent = FRACTION.
- Sections: 'EQUITY & EQUITY RELATED', '(a) Listed / awaiting listing on the stock exchanges', 'DEBT INSTRUMENTS', '(b) Privately placed / Unlisted', 'MONEY MARKET INSTRUMENTS', 'Commercial Papers', 'Certificate of Deposits', 'TREPS / Reverse Repo Investments', 'Cash & Cash Equivalents', 'Mutual Fund Units' (IB22,26,28,34,36,39,42,46,49,56,58,62,64), 'DERIVATIVES' (IB49, IB67). 'Sub Total', 'Total', 'Grand Total' (=1).
- Sum: IB01 ISIN rows 0.9789; IB02 (liquid) 0.8401; IB03 (aggressive hybrid) 1.0576 (>1: long equity + derivative/hedge legs both carry ISINs -> do not assert <=1 on ISIN rows).
- Plan: link_pattern r"Monthly\s*Portfolio" + exclude 'fortnightly' fine but also matches the AAUM files only if spacing weird; plan example 'Monthly%20Portfolio-%20Sep%2030%202026.xlsx' correct. Two duplicate links per month -> must de-dupe.

## 5. Helios  -- CONFIRMED
- Landing: https://www.heliosmf.in/portfolio-disclosure/ (redirects to /portfolio-disclosure, 200, plain hrefs, WordPress uploads).
- Sept 2026 monthly files are under /wp-content/uploads/2026/10/ (upload month dir, NOT as-of month): helios-{arbitrage,balanced-advantage,financial-services,flexi-cap,large-mid-cap,mid-cap,overnight,small-cap}-fund-monthly-portfolio-as-on-30th-september-2026.xls, BUT large-mid-cap/mid-cap/overnight/small-cap are spelled '...as-on-30st-september-2026.xls' ('30st' typo). Same page has '-fortnightly-portfolio-as-on-30th-september-2026.xls' (overnight) and 'half-yearly' files. Older ones capitalised 'Helios-Flexi-Cap-Fund-Monthly-Portfolio-as-on-...' and some 'Monthtly'.
- Downloaded (200): https://www.heliosmf.in/wp-content/uploads/2026/10/helios-flexi-cap-fund-monthly-portfolio-as-on-30th-september-2026.xls (256,000 B) and .../helios-overnight-fund-monthly-portfolio-as-on-30st-september-2026.xls (336,896 B). Saved helios-flexi-cap_asof_2026-09-30.xls, helios-overnight_asof_2026-09-30.xls.
- Magic d0cf11e0 (BIFF). One sheet each, named by CODE (HFCF, HOF); R1 'Helios Mutual Fund', R2 ['SCHEME NAME :', '<full name + descriptor>'], R3 ['PORTFOLIO STATEMENT AS ON :', 46295.0] -> as-of is an Excel SERIAL number (46295 = 2026-09-30), not text.
- Header (row 5): 'Name of the Instrument / Issuer' | 'ISIN' | 'Rating / Industry^' | 'Quantity' | 'Market value (Rs. in Lakhs)' | '% to AUM' | 'YTM %' | 'YTC % ##' | 'Notes & Symbols'; data rows: col B = numeric internal code (101313), then name, ISIN. Percent = PERCENT (98.45).
- Sections: 'EQUITY & EQUITY RELATED', 'Listed/awaiting listing on Stock Exchanges', 'OTHERS', 'TREPS / Reverse Repo Investments', 'Other Current Assets / (Liabilities)'; 'Total', 'GRAND TOTAL (AUM)' (100.0).
- Sum: flexi ISIN rows 98.45 (+1.92 TREPS -0.37 OCA = 100.0). Overnight: ZERO ISIN rows (TREPS only, no ISIN) -> 99.61 + 0.39 = 100.0; parser must accept ISIN-less rows.
- Plan: link_pattern r"monthly-portfolio" (lowercase) matches 2026 names; older capitalised ones don't (case-insensitive compile per Task 6 handles). exclude 'fortnightly' correct. As-of month dir mismatch (files for Sept live in /2026/10/) matters for any date-built logic.

## 6. Capitalmind  -- CONFIRMED-WITH-CHANGE (naming)
- Landing: https://www.capitalmindmf.com/statutory-disclosures.html (200, 557 KB). Links are RELATIVE: <a href="/uploads/CMFLEXI_Monthly_Portfolio_Disclosure_September_2026_2b33248f98.xlsx"> under heading 'FY 2026 - 2027' / '<span>September 2026</span>'. Host for download: https://capitalmindmf.com/uploads/... (apex, no www).
- Sept 2026 files: CMARB_, CMFLEXI_, CMLIQ_, CMMAAF_ (+ '_Monthly_Portfolio_Disclosure_September_2026_<10-hex>.xlsx'). Older: 'Capitalmind_Monthly_Portfolio_Disclosure_Sep_2025_Final_...', 'Monthly_Portfolio_Disclosure_30th_Nov_2025_...', '..._April_2026_<hash>' (3 files for April), '..._August_31_2026_<hash>' -> month/day token format changes monthly; duplicates exist.
- Downloaded: CMFLEXI (150,775 B) and CMARB (182,136 B); saved capitalmind-flexi-cap_asof_2026-09-30.xlsx, capitalmind-arbitrage_asof_2026-09-30.xlsx.
- One sheet each, named '<CODE>_30th September 2026' (e.g. 'CMFLEXI_30th September 2026'). Rows: R0 'Capitalmind Mutual Fund'; R1 ['SCHEME NAME :', ...]; R2 INCEPTION DATE; R3 ['MONTHLY PORTFOLIO STATEMENT AS ON :', 'September 30, 2026'].
- Header (row 5, cols A-B blank): 'Name of Instrument / Issuer' | 'ISIN' | 'Rating / Industry^' | 'Quantity' | 'Market Value (Rs. in Lakhs)' | '% to NAV' | 'YTM%' | 'YTC%*'. Percent = FRACTION.
- Sections: 'Equity & Equity related', '(a) Listed / awaiting listing on Stock Exchanges', '(b) Unlisted', 'Derivatives' + 'Index / Stock Futures' (arbitrage), 'Money Market Instruments', 'Treasury Bill', 'Others', 'Mutual Fund Units', 'Reverse Repo / TREPS'. 'Sub Total', 'Total', 'GRAND TOTAL' (1).
- Sum: CMFLEXI ISIN rows 0.9609; CMARB 0.9342 with Futures Sub Total -0.7835 (short legs negative) and 'Mutual Fund Units' 0.1484.
- Plan: example '.../Capitalmind_Monthly_Portfolio_Disclosure_September_2026_e738be9752.xlsx' is actually 'CMMAAF_Monthly_Portfolio_Disclosure_September_2026_e738be9752.xlsx' (scheme-code prefix dropped in the plan text). link_pattern 'Monthly_Portfolio_Disclosure' still matches. Also 'IR_Capitalmind_Mutual_Fund_<DDMMYYYY>_...xlsx' daily files exist on the same page (not matched).

## 7. Angel One  -- CONFIRMED
- Landing: https://www.angelonemf.com/downloads (200, 641 KB). Plain <a href="https://cms.angelonemf.com/amc-cms/wp-content/uploads/formidable/20/Monthly-Portfolio-September-2026-Angel-One-Nifty-50-ETF-1-1.xlsx">.
- Sept 2026 files (11): Gold-ETF-1-1, Gold-ETF-FOF-1-1, Nifty-1D-Rate-Liquid-ETF-GROWTH-1-2, Nifty-50-ETF-1-1, Nifty-50-Index-Fund-2-3, Nifty-Total-Market-ETF-1-2, Nifty-Total-Market-Index-Fund-3, Nifty-Total-Market-Momentum-Quality-50-ETF-1-1, ...-Index-Fund-1-, Silver-ETF-1-1, Silver-ETF-FOF-1-2 (trailing '-N-M' counters are re-upload suffixes, unpredictable).
- Downloaded Nifty-50-ETF (166,057 B) and Nifty-50-Index-Fund (167,734 B); saved angel-one-nifty-50-etf_asof_2026-09-30.xlsx, angel-one-nifty-50-index-fund_asof_2026-09-30.xlsx.
- One sheet each named by CODE (AO05, AO04). R0 'ANGEL ONE MUTUAL FUND', R1 scheme name, R2 'Monthly Portfolio Statement for the period ended 30 September 2026' (ETF) vs '...30.September.2026' (index fund) -> as-of text format differs between files.
- Header (row 3, col A = ISIN): 'ISIN' | 'Name of Instrument' | 'Rating/Industry' | 'Quantity' | 'Market Value (In Rs. lakh)' | '% To Net Assets' | 'Maturity Date' | 'Put/Call Option' | 'Yield'. Percent = FRACTION.
- Sections: 'EQUITY & EQUITY RELATED', '(a) Listed / awaiting listing on the stock exchanges', 'DEBT INSTRUMENTS', 'Others', 'MONEY MARKET INSTRUMENTS', 'TREPS', 'Reverse Repo Instrument', 'Preference share'; 'Sub Total' (many NIL), 'Total'. 
- Sum: Nifty 50 ETF ISIN rows 0.998553; Index Fund 0.999635.
- Plan: matches. Note the same layout is used by Groww/Wealth Company (shared SEBI template).

## 8. Union  -- CONFIRMED
- No landing. Request (GET): https://www.unionmf.com/docs/default-source/funddetail-downloads/fund-portfolio/{month_name_lower}-{yyyy}/monthly-portfolio-report-{scheme_slug}-{dd}-{mm}-{yyyy}.xlsx
  e.g. .../fund-portfolio/september-2026/monthly-portfolio-report-union-flexi-cap-fund-30-09-2026.xlsx (200, 97,900 B, IIS, Content-Disposition inline filename=Monthly-Portfolio-Report-Union-Flexi-Cap-Fund-30-09-2026.xlsx). union-corporate-bond-fund = 316,518 B; union-small-cap-fund = 100,557 B (200, not saved). Wrong slug -> 500 text/html; wrong month dir ('sep-2026') -> 500.
- Saved union-flexi-cap_asof_2026-09-30.xlsx, union-corporate-bond_asof_2026-09-30.xlsx. Scheme slug discovery source: not verified (only slugs built from scheme names were tried).
- One sheet named by short scheme name ('Flexi Cap Fund', 'Corporate Bond'). R1 ['UNION MUTUAL FUND','YK01', '0'] (YKnn = scheme code), R6 'MONTHLY PORTFOLIO STATEMENT OF UNION FLEXI CAP FUND AS ON SEPTEMBER 30, 2026'.
- Header (row 8, cols A-B blank): 'Name of the Instrument' | 'ISIN' | 'Rating / Industry' | 'Quantity' | 'Market value (Rs. in Lakhs)' | '% to NAV' | 'YTM %'; col A = numeric internal code (100012), name col C. Percent = PERCENT (6.32). Side tables to the right ('Industry / Rating | % to NAV | Sector | % to NAV | Top 10 Issuers') start at row 9 and also, in Corporate Bond, rows 15-19 contain summary rows ('Cash & Cash Equivalents 12.52 ...') in the SAME columns -> TOTAL-like false positives.
- Sections: 'EQUITY & EQUITY RELATED', 'a) Listed/awaiting listing on Stock Exchanges', 'b) Unlisted', 'c) Foreign Securities and /or overseas ETF', 'd) Real Estate Investment Trust', 'e) Infrastructure Investment Trust', 'DEBT INSTRUMENTS', 'd) Central Government Securities', 'MONEY MARKET INSTRUMENTS', 'c) Treasury Bills', 'OTHERS', 'd) Alternative Investment Funds', 'e) TREPS / Reverse Repo Investments', 'Other Current Assets / (Liabilities)'; 'Total', 'GRAND TOTAL (AUM)' (100).
- Sum: Flexi ISIN rows 95.13 (Total 95.02 + 0.11 + 5.09 - 0.22 = 100); Corporate Bond 87.48.
- Plan: template correct: month_name_lower is the full lowercase month name ('september'), dd-mm-yyyy of the month END. All confirmed.

## 9. DSP  -- CONFIRMED-WITH-CHANGE (link_pattern misses most months)
- Landing: https://www.dspim.com/mandatory-disclosures/portfolio-disclosures?origin=app (200, 406 KB, plain <a href>; files under /media/pages/mandatory-disclosures/portfolio-disclosures/<10-hex>-<epoch>/<name>).
- Sept 2026: https://www.dspim.com/media/pages/mandatory-disclosures/portfolio-disclosures/7737577fda-1791551248/dsp-monthend-portfolio-as-on-30-september-2026.zip (200, 1,147,927 B). Saved dsp_asof_2026-09-30.zip (whole, <2 MB).
- ZIP members: 'DSP Equity FOF ISIN Portfolio as on 30 Sep 2026.xlsx' (790,347 B; 65 sheets) and 'DSP ISIN DEBT Portfolio as on 30 Sep 2026.xlsx' (448,191 B; 26 sheets). Sheets named by short scheme label (AGGRESSIVE, FLEXICAP, LARGE MIDCAP, TIGER, LIQUID, ULTRA, ...), no Index sheet; R0 = full scheme name, R1 'Portfolio as on September 30, 2026'.
- Header (row 3): 'Sr. No.' | 'Name of Instrument' | 'ISIN' | 'Rating/Industry' | 'Quantity' | 'Market value (Rs. In lakhs)' | '% to Net Assets' | 'Maturity Date' | 'Put/Call Option' | 'YTM (%)'. Percent = FRACTION; tiny values '*'.
- Sections: 'EQUITY & EQUITY RELATED', 'Listed / awaiting listing on the stock exchanges', 'Unlisted', 'DEBT INSTRUMENTS', "BOND & NCD's", 'Government Securities (Central/State)', 'MONEY MARKET INSTRUMENTS', 'Certificate of Deposit', 'Commercial Papers', 'Treasury Bill', 'TREPS / Reverse Repo Investments', 'Alternative Investment Funds (AIF)', 'OTHERS', 'Mutual Funds'; 'Total', 'Cash & Cash Equivalent', 'GRAND TOTAL' (1).
- Sum: AGGRESSIVE main ISIN rows = 0.9747 (raw scan 904.5 because a defaulted-securities table under 'Notes:' repeats ISINs with text/large values: 0% IL&FS ... rows 124-126); LIQUID 0.9773.
- Plan contradictions: link_pattern r"dsp-monthend-portfolio-as-on" matches only Aug/Sep 2026. Other 2026 monthly names on the same page: 'monthend-portfolios_31_july_2026.zip', 'monthend-portfolios_31_may_2026.zip', 'monthend-portfolio-february-28-2026.zip', 'monthend-portfolio-31march2026.zip', 'dsp-monthend-portfolio-as-on-31-aug-2026.zip' (31-aug vs 30-september spelling). Debt is sometimes a SEPARATE file: 'dsp-isin-debt-portfolio-as-on-31-aug-2026.xlsx', '...-31-may-2026.zip', '...-30-jun-2026.xlsx', '...-31-jan-2026.xlsx'. Fortnightly: 'dsp-isin-debt-fortnightly-portfolio-as-on-30-sep-2026.xlsx' (a 30-Sep file that is NOT month-end holdings -> exclude 'fortnightly' correct). A robust pattern must be r"month-?end-portfolio" and handle the debt-only xlsx.

## 10. Motilal Oswal  -- CONFIRMED-WITH-CHANGE (9 of 90 fund pages have empty portfolioUrl)
- Mechanism: per-fund page HTML contains the TEXT fields 'Date As On: 30 Sep 2026' and 'portfolioUrl: /content/dam/motilal-mf/sheets/fund-csvs/Month_End_Portfolio_September_2026/YO58.xlsx' (rendered in <p><strong>portfolioUrl:</strong> ...</p>, not an <a href>). Fund page example: https://www.motilaloswalmf.com/mutual-funds/motilal-oswal-digital-india-fund (200). Download: https://www.motilaloswalmf.com/content/dam/motilal-mf/sheets/fund-csvs/Month_End_Portfolio_September_2026/YO58.xlsx (200, 178,318 B). Saved motilal-oswal-yo58_asof_2026-09-30.xlsx.
- Enumeration of fund pages: https://www.motilaloswalmf.com/sitemap.xml has 90 '/mutual-funds/<slug>' URLs. All 90 fetched (200): 81 carry a populated portfolioUrl 'Month_End_Portfolio_September_2026/<code>.xlsx'; 9 pages show 'portfolioUrl:' EMPTY although 'Date As On: 30 Sep 2026' is present: motilal-oswal-developed-market-ex-us-etfs-overseas-equity-passive-fof, -gold-and-silver-passive-fund-of-funds, -multi-cap-fund, -business-cycle-fund, -diversified-equity-flexicap-passive-fund-of-funds, -nifty-midsmall-financial-services-index-fund, -s-and-p-500-index-fund, -nasdaq-q-50-etf, -nifty-5-yr-benchmark-g-sec-etf. Whether those 9 publish elsewhere: not verified. Only YO58 was actually downloaded (the other 80 file URLs not fetched). Scheme-master cross-check: backend/.cache/amfi_navall/nav_all.txt gives roughly 90 distinct Motilal scheme names (regex-derived, approximate); one-to-one mapping page-slug to scheme NOT verified.
- File: one sheet named by scheme code ('YO58'), A1 'Back to Index' (hyperlink); R1-R4 AMC address; R5 'MONTHLY PORTFOLIO STATEMENT AS ON SEPTEMBER 30, 2026'; R7 scheme name; R8 descriptor. NO consolidated Index sheet in this file (only a 'Back to Index' link cell).
- Header (row 9): 'Sr. No.' | 'Name of the Instrument' | 'ISIN' | 'Industry*' | 'Quantity' | 'Market/Fair Value (Rs. in Lakhs)' | '% to Net Assets' (+ side table cols 'Sector / Rating' | 'Percent'). Percent = PERCENT (15.73).
- Sections: '(B)' / 'Money Market Instruments', '(a)' / 'TREPS / Reverse Repo' (section labels split across cols A-B). 'Sub Total', 'Total', 'GRAND TOTAL' (100.0).
- Sum: ISIN rows 93.43 + 5.06 TREPS = 98.49 (+ other assets) -> GRAND TOTAL 100.0.
- Plan: 'NEEDS LIVE VERIFICATION: every live scheme has a reachable fund page' -> answer: 90/90 pages reachable via sitemap, but only 81/90 expose a file link. link_pattern r"Month_End_Portfolio_.*\.xlsx" works on the text. landing_url (single fund page) is not enough: the loop must iterate sitemap.xml.

## 11. NJ  -- CONFIRMED-WITH-CHANGE (not one-fund page)
- Landing: https://downloads.njmutualfund.com/njmf_download.php?nme=127 (200, 148 KB) is AMC-wide (all NJ funds, month rows back to 2022), not a Flexi-Cap-only page. Plain hrefs 'viewfile.php?file=<name>' (116 xlsx links).
- Sept 2026 files (7): NJ-MF-Monthly-Portfolio-{NJABF,NJBAF,NJELSTCH,NJFCP,NJMOF,NJOVERFD,NJVAF}-September-2026-<yyyymmddhhmmss>.xlsx (suffix = upload timestamp, e.g. -20261008113127). Fetch: https://downloads.njmutualfund.com/viewfile.php?file=NJ-MF-Monthly-Portfolio-NJFCP-September-2026-20261008113127.xlsx (200, application/octet-stream, 189,610 B) and ...NJBAF...-20261008112949.xlsx (329,661 B). Saved nj-flexi-cap_asof_2026-09-30.xlsx, nj-balanced-advantage_asof_2026-09-30.xlsx. Older naming differs wildly ('IN-MF-MONTHLY-PORTFOLIO---August-2025-...', 'Monthly-Portfolio-Disclosure-April-2023-...', 'Disclosure-as-on-February-2022-....xls').
- One sheet each named by CODE (NJFCP, NJBAF); sheet dimension reports 1000 rows (padded). R0 'NJ Mutual Fund', R1 scheme name, R4 'Monthly Portfolio Statement as on September 30, 2026'.
- Header (row 5): 'Name of the Instrument' | 'ISIN' | 'Industry/ Rating' | 'Quantity' | 'Market/Fair Value(Rs. in Lakhs)' | '% to Net Assets' | 'YTM~' | 'YTC^' | 'null' (literal text 'null'); col A blank. Percent = FRACTION.
- Sections: 'Equity & Equity related', '(a) Listed / awaiting listing on Stock Exchanges', 'Derivatives', 'Index / Stock Futures', 'Debt Instruments', '(a) Listed / awaiting listing on Stock Exchange', 'Money Market Instruments', 'Treasury Bill', 'Reverse Repo / TREPS'. 'Sub Total', 'Total', (no GRAND TOTAL row captured in the scan).
- Sum: NJFCP ISIN rows 0.9787; NJBAF 0.9487 with Index/Stock Futures Sub Total = -0.265136 (short derivative legs carry ISINs? they are inside the 141 ISIN rows).
- Plan: link_pattern r"viewfile\.php\?file=.*\.xlsx" matches all months and 'Investor Charter' etc. need month filter; filename token NJ code is the only scheme key. Confirmed '(August 2026) NJ Flexi Cap' per plan; Sept now present.

## 12. Franklin Templeton  -- CONFIRMED-WITH-CHANGE (plan's mechanism is wrong; real mechanism is a JSON API)
- Plan: 'server-rendered fund report page lists current Monthly Portfolio Disclosure dates' (landing .../fund-details/fund-overview/42352/reports/...). Reality: curl returns a 4.7 KB Angular SPA shell (<app-root> with a loader, title empty, no document links). Playwright (one-time) revealed the data call.
- Mechanism (plain unauthenticated GET, JSON): https://www.franklintempletonindia.com/api/literature/v1/documents?channel=en-in&cache=true&frkOneTISNumber=<fund_id> (e.g. 42352) -> 70 KB JSON {"document":[...]}; entries carry contentGrouping ('Dis-Portfolio-Monthly' / '-Fortnightly' / '-Halfyearly'), dctermsTitle ('As on September 30, 2026 (Uploaded on October 08, 2026)'), frkReferenceDate (NOT the as-of: Sept doc '2026-09-30' but Aug doc '2026-09-09'), downloadUrl (https://franklintempletonprod.widen.net/content/<10-id>/original/<name>.xls?u=pl55mb&download=true). Without frkOneTISNumber the SAME endpoint returns the whole library (23,801 docs, 21 MB) - it holds 39 'Dis-Portfolio-Monthly' docs titled 'As on September 30, 2026' (one per fund; includes ids such as 51097 and 100634 not in the sitemap list I checked -- not verified whether they are live schemes). Fund IDs for the per-fund call come from https://www.franklintempletonindia.com/sitemap.xml ('/fund-details/fund-overview/<id>', 52 ids).
- Files fetched: Franklin_India_Long_Term_Fund_Sep_26_Monthly_Portfolio.xls (fund 42352, 163,840 B) and Franklin_India_Flexi_Cap_Fund_Sep_26_Monthly_Portfolio.xls (fund 4616, 152,064 B). Saved franklin-templeton-long-term_asof_2026-09-30.xls and franklin-templeton-flexi-cap_asof_2026-09-30.xls. Note fund 42352 is labelled 'Franklin India Long Term Fund (Formerly Franklin India Long Duration Fund)' and its older docs carry the old name.
- Magic d0cf11e0 (BIFF). One sheet per file named by CODE ('FIEF', 'FILTF'); R0 = scheme name + ' ^', R2 'Portfolio Statement as on September 30, 2026'.
- Header (row 3): 'ISIN Number' | 'Name of the Instrument' | 'Industry Classification / Rating' (debt: 'Rating') | 'Quantity' | 'Market Value (including accrued interest, if any) (Rs. in Lakhs)' | '% to Net Assets' | 'YTM'. ISIN FIRST column. Percent = PERCENT. Instrument names carry footnote suffixes ('Axis Bank Ltd !! ~~').
- Sections: 'Equity & Equity related', '(a) Listed / awaiting listing on Stock Exchanges', 'Money Market Instruments', 'Treasury Bill', 'Government Securities', 'Alternative Investment Fund #', 'Outstanding Interest Rate Swap Position' (contract rows w/o ISIN). Totals: 'Sub Total', 'Total', 'Call, Cash & Other Assets', 'Net Assets' (100.0) - no word 'GRAND TOTAL'.
- Sum: Flexi Cap ISIN rows 95.145 + Call/Cash 4.855 = 100.0; Long Term 61.87 + 38.13 = 100.0.
- Plan contradictions: 'server-rendered' false; landing_url+link_pattern r"Monthly\s*Portfolio" cannot work against raw HTML (no links in HTML). Needs JSON_API kind with that endpoint, a fund-ID list (sitemap) and the widen.net host; 'Dis-Portfolio-Monthly' is the key, not 'Monthly Portfolio' in text. The 'Latest Updates' / title use 'Uploaded on' dates.

## 13. Quantum  -- CONFIRMED-WITH-CHANGE (link is relative-to-host absolute + labels precede links)
- Landing: https://www.quantumamc.com/portfolio/combined/-1/1/0/0 (200, 149 KB). Plain <a href="https://www.quantumamc.com/FileCDN/FactSheet/<uuid>.xlsx" ...> followed by label text 'September 2026 - All Funds' INSIDE the anchor; the onClick JS repeats the URL.
- File (Sept 2026 = FIRST list item): https://www.quantumamc.com/FileCDN/FactSheet/18650bf5-c7b8-47b1-a725-78a86416c1a5.xlsx (200, 994,824 B). The next uuid (f616b3fb-...) is AUGUST 2026 (as of Aug 31) - do not pair a label with the NEXT link. Saved quantum_asof_2026-09-30.xlsx.
- Magic 504b0304. 16 sheets: 'Index' + codes (QLTEVF, QLF, QGF, QNF, QTSF, QEFOF, QGSF, QMAFOF, QDBF, QESG, QNFOF, QSCAPF, QMULTI, QETHICAL, QFLEXI); order of codes changed vs August (QGSF/QEFOF swapped) and QFLEXI is new. Index sheet: header ['Scheme Full Name', 'Scheme Code'] from row 9; R6 'Monthly Portfolio Statement of the Quantum Mutual Fund Schemes for the period ended September 30, 2026'.
- Per-scheme sheet: R6 scheme name, R8 'Monthly Portfolio Statement of the <scheme> for the period ended September 30, 2026'. Header (row 10): 'Sr.No.' | 'Name of Instrument' | 'ISIN' | 'Industry +' (debt: 'Rating') | 'Quantity' | 'Market/ Fair Value ( Rs. in Lakhs)' | '% to NAV' | 'Annualised Yield to Maturity' (debt adds '~YTC (AT1/Tier 2 bonds)'). Percent = FRACTION.
- Sections: 'EQUITY & EQUITY RELATED', 'a) Listed /Awaiting listing on Stock Exchanges', 'DEBT INSTRUMENTS', 'i) Bonds', 'MONEY MARKET INSTRUMENTS', 'a) Treasury Bills (T-Bill)', 'b) Commercial Papers (CP)', 'c) Certificate of Deposits (CD)', 'OTHERS'; totals are named 'Total of all Equity', 'Total of Bonds', 'Total of Debt Instruments', 'Total of T-Bill', 'Total of Money Market Instruments', 'Grand Total' (1) - not 'Sub Total'.
- Sum: QLTEVF ISIN rows 0.9572 (+0.0423 MM); QLF (liquid) 0.9093 + 0.0907 other. Side 'Portfolio Information' block in debt sheets holds 'Annualised Portfolio YTM*' etc.
- Plan: SINGLE_WORKBOOK_MULTI_SHEET correct; link_pattern r"/FileCDN/FactSheet/.*\.xlsx" matches all months and other doc types on the page (filter by the label 'Month YYYY - All Funds').

## 14. Samco  -- CONFIRMED
- Landing: https://www.samcomf.com/StatutoryDisclosure (200, 4.16 MB; 1,163 matching links across all history). Server-rendered table rows: <td data-th="Document Title">IN_MF_MONTHLY_PORTFOLIO_September_2026_Samco_Flexicap_Fund</td> with a separate download href '/amc-document-download/IN_MF_MONTHLY_PORTFOLIO_September_2026_SamcoFlexi..._<epoch>.xlsx'.
- Files (Sept 2026, 10 schemes listed e.g.): /amc-document-download/IN_MF_MONTHLY_PORTFOLIO_September_2026_Samco_Flexicap_Fund_1791526364.xlsx (200, 196,972 B) and ..._Samco_Arbitrage_Fund_1791526268.xlsx (197,408 B). Host https://www.samcomf.com. Scheme-name token spelling varies ('SamcoLargeCapFund', 'SamcoMid_CapFund', 'Samco_Active_Momentum_Fund') and the trailing number is an upload epoch.
- Saved samco-flexicap_asof_2026-09-30.xlsx, samco-arbitrage_asof_2026-09-30.xlsx. One sheet each named by CODE (SAMFLEX, SAMARB). R0 'SAMCO MUTUAL FUND', R2 'MONTHLY PORTFOLIO STATEMENT OF SAMCO FLEXICAP FUND AS ON September 30, 2026 (descriptor)'.
- Header (row 4, col A blank): 'Name of the Instrument' | 'ISIN' | 'Industry' | 'Quantity' | 'Market/Fair Value  (Rs. in Lakhs)' | '% to Net  Assets' | 'YTM' | 'null'. Percent = FRACTION. Col A = internal code (FCHE03).
- Sections: 'Equity & Equity related', '(a) Listed / awaiting listing on Stock Exchanges', 'Debt Instruments', 'Money Market Instruments', 'Others', 'Reverse Repo / TREPS', 'Derivatives', 'Index / Stock Futures', 'Equity & Equity related Foreign Investments'. 'Sub Total', 'Total', 'GRAND TOTAL' (1).
- Sum: Flexicap ISIN rows 0.9257; Arbitrage 0.7686 with Futures Sub Total -0.7719.
- Plan: matches (link_pattern r"IN_MF_MONTHLY_PORTFOLIO_").

## 15. 360 ONE  -- CONFIRMED-WITH-CHANGE (answers the NEEDS LIVE VERIFICATION)
- Landing: https://www.360.one/asset/mutual-funds/downloads/ (200, 723 KB). The file link IS inside the React Server Component flight payload (self.__next_f.push script chunks), as a plain absolute URL inside JSON-escaped text: ...{\"title\":\"Monthly Portfolio\",\"yearlyData\":[{\"year\":\"Monthly Portfolio 2026\",\"monthlyData\":[{\"month\":\"null\",\"documentGroups\":[{\"title\":\"Monthly Portfolio 2026\",\"documents\":[{\"fileName\":\"September\",\"fileUrl\":\"https://s3.ap-south-1.amazonaws.com/x-web-s3.360.one/IN_MF_MONTHLY_PORTFOLIO_Sep2026_Final_fc91906e39.xls\"}...  A plain regex over the raw HTML finds the literal URL (verified: 1 occurrence; 0 as <a href>), no RSC parse needed, because the URL itself contains no escaped chars.
- File: https://s3.ap-south-1.amazonaws.com/x-web-s3.360.one/IN_MF_MONTHLY_PORTFOLIO_Sep2026_Final_fc91906e39.xls (200, application/vnd.ms-excel, 269,718 B). Saved 360-one_asof_2026-09-30.xls. Magic 504b0304 (OOXML) despite .xls.
- Filename drift: 'IN_MF_MONTHLY_PORTFOLIO_Aug2026_Final_b5e5446649.xls', '_July2026_', '_June2026_Final_', '_May2026_Final_...xlsx', '_Apr_2026_final_...xlsx', '_Mar_2026_final_', 'jan2026_final_', 'feb2026_final_File_', 'dec2025_Final_1_' -> ext alternates .xls/.xlsx; month token case/format varies. Same page also has 'Notice_Monthly_Portfolio_10_09_26_...pdf', 'MF_Portfolio_Overlap_Sep_2026_Monthly_...xlsx', half-yearly '360_ONE_MF_Half_yearly_portfolio_...xlsb' which a loose 'Monthly_Portfolio' regex would hit.
- 12 sheets named by SCHEME NAME ('Dynamic Term', 'Liquid Fund', 'Focussed Fund', 'Quant Fund', 'ELSS Tax Saver', 'Flexi Cap', 'Balance Hybrid', 'Gold ETF', 'Silver ETF', 'Overnight Fund', 'Multi Asset Allocation', 'MSCI India ETF'); NO Index sheet. R0 = full scheme name + descriptor; R2 'Monthly Portfolio Statement as on September 30,2026'.
- Header (row 3, col A blank): 'Name of the Instrument' | 'ISIN' | 'Industry / Rating' (debt: 'Rating') | 'Quantity' | 'Market/Fair Value(Rs. in Lacs)' | 'Rounded % to Net Assets' | 'YTM' | '~YTC (AT1/Tier 2 bonds)'. Percent = FRACTION. Stray internal codes (e.g. 'GOI4584', 'CDMD50ME', 'HDFB1009') sit in col A on section-header rows (Liquid Fund: instrument codes next to 'Commercial Paper', 'Treasury Bill') -> section detection by 'only one text cell' fails.
- Sections: 'REIT/InvIT Instruments', '(a) Listed / awaiting listing...', 'Debt Instruments', 'Money Market Instruments', 'Certificate of Deposit', 'Commercial Paper', 'Treasury Bill', 'Others', 'Corporate Debt Market Development Fund', 'TREPS / Reverse Repo'. 'Sub Total', 'Total'.
- Sum: Dynamic Term ISIN rows 0.9299 (others to GRAND).
- Plan: landing_url ok; plan gives NO link_pattern (empty). Suggested literal: r"IN_MF_MONTHLY_PORTFOLIO_[^\"\\]*\.xlsx?" over raw HTML. Domain is s3.ap-south-1.amazonaws.com/x-web-s3.360.one (not 360.one).

## 16. AlphaGrep  -- CONFIRMED-WITH-CHANGE (host + scheme folder name)
- Plan: url_template 'https://alphagrepmf.ai/assets/documents/{scheme_name}/monthly/FY-{yy}-{yy_plus_1}/{month_name}_{yyyy}.xls'. Reality: the APEX host 'alphagrepmf.ai' returns 404 text/plain (10 bytes) for every path (tried 6+). The WWW host serves the files: https://www.alphagrepmf.ai/assets/documents/AlphaGrep_Flexi_Cap_Fund/monthly/FY-2026-27/September_2026.xls -> 200, application/vnd.ms-excel, 1,247,232 B. '{yy}' is NOT two-digit: folder is FY-2026-27 (full first year, two-digit second year), i.e. FY-{yyyy}-{yy_plus_1}; plan test text 'FY-2026-27' is right but plan template key '{yy}' implies 26-27 (wrong).
- Scheme folder name is NOT derivable from the scheme name: a manifest https://www.alphagrepmf.ai/assets/documents/files.json (200, 1.7 KB JSON, found in the Angular main.js) lists {schemeName, folderName, financialYears[{yearFolder:'FY-2026-27', documents[{title:'September Report', fileName:'September_2026'}]}]} for 'monthly', 'halfyearly', 'fortnightly'. Monthly entries (2026-10-13): 'AlphaGrep Multi Asset Allocation Fund' -> AlphaGrep_Multi_Asset_Allocation_Fund (Jul/Aug/Sep 2026); 'AlphaGrep Flexi Cap Fund' -> AlphaGrep_Flexi_Cap_Fund (Aug/Sep); 'AlphaGrep Liquid Omni Fof Fund' -> AlphaGrep_Liquid_OMNI_Fund (Aug/Sep) (folder case/name differs from title). Wrong-case folder 'Alphagrep_Flexi_Cap_Fund' or 'AlphaGrep_Flexicap_Fund' on the www host returns the SPA soft-404 (200 text/html 59,089 B) -> must check Content-Type/magic, not status.
- Saved alphagrep-flexi-cap_asof_2026-09-30.xls (1,247,232 B), alphagrep-multi-asset-allocation_asof_2026-09-30.xls (1,228,800 B). Magic d0cf11e0 (BIFF); one sheet each named by CODE (AG002, AG001); R0 ['AG002', 'ALPHAGREP - FLEXI CAP FUND']; R1 'Portfolio Statement as on September 30, 2026'. (August file for Flexi Cap is 2.9 MB.)
- Header (row 2, cols A-B blank): 'Name of the Instrument / Issuer' | 'ISIN' | 'Industry^ / Rating' | 'Quantity' | 'Market value (Rs. in Lakhs)' | '% to AUM' | 'YTM %' | 'YTC %'; col B = numeric internal code (100069). Percent = FRACTION except the 'Derivatives Total' row in Multi Asset which is 16.23 (PERCENT, mixed units in one file).
- Sections: 'Equity & Equity Related', 'a) Listed/awaiting listing on Stock Exchanges', 'b) Real Estate Investment Trust', 'Debt Instruments', 'Money Market Instruments', 'Treasury Bills', 'Others', 'Exchange Traded Fund', 'Silver', 'TREPS / Reverse Repo Investments', 'Other Current Assets / (Liabilities)', 'DERIVATIVES', 'Exchange Traded Commodity Derivatives Futures'; 'Total', 'Total (A)', 'Gross Total (A)+(B)', 'Derivatives Total', 'GRAND TOTAL (AUM)' (1.0).
- Sum: Flexi Cap ISIN rows 0.8705 (ETF 0.038, TREPS 0.034, OCA 0.095 -> 1.0); Multi Asset ISIN rows 0.6316 (commodity ETF/derivative lines carry other items).

## 17. The Wealth Company  -- CONFIRMED-WITH-CHANGE (pagination + SSR JSON, not <a>)
- Landing: https://www.wealthcompanyamc.in/literature-forms/portfolio-documents/monthly/ (200, 173 KB). Next.js: the list is in escaped JSON in the HTML: {\"uploadDate\":\"2026-09-30\",...,\"name\":\"Monthly - The Wealth Company Flexicap Fund - Sep 30, 2026\",...,\"attachment\":{...,\"url\":\"/uploads/Monthly_Portfolio_Flexi_Cap_0fd0dc18c8.xlsx\"}}; also MUI buttons (no <a href>). Only 25 records are in page 1; pagination object {\"page\":1,\"pageSize\":25,\"pageCount\":4,\"total\":97}; '?page=2' returns the next 25 (200, verified). All 12 Sept 2026 files are on page 1 (sorted by uploadDate desc): Arbitrage, Multi Cap, Mid Cap, Large & Mid Cap, Flexicap, Liquid, Multi Asset Allocation, Ethical, Balanced Advantage, Small Cap, Gold ETF FOF, Gold ETF.
- Download host: https://www.wealthcompanyamc.in/uploads/<file> e.g. /uploads/Monthly_Portfolio_Flexi_Cap_0fd0dc18c8.xlsx (200, 95,682 B) and /uploads/Monthly_Portfolio_Arbitrage_49f61aa67c.xlsx (115,630 B). Saved the-wealth-company-flexi-cap_asof_2026-09-30.xlsx, the-wealth-company-arbitrage_asof_2026-09-30.xlsx. August names differ in case: 'Monthly_portfolio_Large_Midcap_...', 'Monthly_portfolio_Multi_Asset_Allocation_Fund_...' (lowercase 'portfolio'); 'name' strings differ ('Large & Midcap' vs 'Large & Mid Cap', literal '\n' suffix in some).
- One sheet each named by CODE (WCFL, WCAR); R0 'THE WEALTH COMPANY MUTUAL FUND', R1 scheme name, R2 'Monthly Portfolio Statement for the period ended 30.September.2026'. Header (row 3): 'ISIN' | 'Name of Instrument' | 'Rating/Industry' | 'Quantity' | 'Market Value (In Rs. lakh)' | '% To Net Assets' | 'Maturity Date' | 'Put/Call Option' | 'Yield' (same template as Angel One/Groww). Percent = FRACTION.
- Sections: 'EQUITY & EQUITY RELATED', '(a) Listed / awaiting listing on the stock exchanges', 'DEBT INSTRUMENTS', 'Others', 'MONEY MARKET INSTRUMENTS', 'TREPS', 'Reverse Repo Instrument', 'Preference share', 'Mutual Fund Units' (arbitrage). 'Sub Total', 'Total' (no GRAND TOTAL in the scan).
- Sum: Flexi Cap ISIN rows 0.9186 (+0.0449 TREPS); Arbitrage 0.9390 (equity Total 0.6881).
- Plan: link_pattern r"/uploads/Monthly_Portfolio_" misses the lowercase 'Monthly_portfolio_' variants (August) -> needs re.I (Task 6 says it compiles with re.I). 'A full grid of 97 downloadable files is server-rendered' is true only per page of 25; 4 pages needed for the full history (current month fits on page 1).

## 18. Old Bridge  -- CONFIRMED-WITH-CHANGE (plan's link_pattern wrong; IR_ file is NOT holdings)
- Landing: https://www.oldbridgemf.com/statutory-disclosures.html (200, 799 KB, 1,177 xlsx/xls refs); downloads from https://oldbridgemf.com/uploads/<name>.
- Answers the verification: (1) 'IR_Old_Bridge_Mutual_Fund_<DDMMYYYY>_<hash>.xlsx' is a DAILY (one per calendar day, ~170 for 2026) Crisil 'Fund Performance' / Information-Ratio sheet (sheet 'Fund_Performance': 'Crisil Intelligence', 'Generated on: 01-Oct-2026', columns Scheme Name, Benchmark, Riskometer..., NAV, Return 1 Year) - NOT a holdings disclosure (8,613 B). (2) The real current-month holdings are per-scheme: https://oldbridgemf.com/uploads/OBMF_Flexi_Cap_Portfolio_Sept_26_0cfdd46aac.xlsx (200, 192,267 B), OBMF_Arbitrage_Portfolio_Sept_26_05ec97d1b0.xlsx (241,943 B), OBMF_Focused_Portfolio_Sept_26_ffe4009490.xlsx (190,622 B, downloaded, not saved). Saved old-bridge-flexi-cap_asof_2026-09-30.xlsx, old-bridge-arbitrage_asof_2026-09-30.xlsx.
- Naming drift: older months 'Old_Bridge_Arbitrage_Fund_January_2026_<hash>.xlsx', 'OBMF_Monthly_Portfolio_Sep_2024_...', 'Monthly_Portfolio_Sep2025_...', 'OBMF_HY_Portfolio_Sep_2024_...'. Same page also has 'Monthly_Overlap_September_2026_...', 'Old_Bridge_Scheme_Performance_Sep_26_...', 'Old_Bridge_MSP_Mar_2026_...', 'Old_bridge_MF_Average_Assets_Under_Management_*.xls', 'TRN_21_<DDMMYY>_...' (daily).
- Plan link_pattern r"Old_Bridge_.*_\d{4}_[0-9a-f]+\.xlsx" does NOT match any Sept 2026 holdings file ('OBMF_..._Portfolio_Sept_26_<hash>.xlsx': '26' two digits, 'Sept', and an 'OBMF_' prefix) but DOES match non-holdings files ('Old_Bridge_Output_Scheme_Performance_May_2026_...', 'Old_Bridge_Average_Assets_Under_Management_September_2025_...'). exclude_pattern r"^IR_" is moot (IR_ not matched anyway). Suggested pattern: r"OBMF_.*Portfolio_Sept?_?\d{2}_[0-9a-f]+\.xlsx".
- Files: one sheet each named by CODE (OBFLX, OBAF); R0 ['OBFLX','Old Bridge Mutual Fund'], R1 'Monthly Portfolio Statement as on September 30, 2026', R2 scheme name. Header (row 4, col A blank): 'Name of the Instrument' | 'ISIN' | 'Industry*' (arbitrage: 'Industry* / Rating') | 'Quantity' | 'Market/Fair Value (Rs. in Lakhs)' | '% to Net Assets' | 'YTM'. Percent = PERCENT (91.6).
- Sections: 'Equity & Equity related', '(a) Listed / awaiting listing on Stock Exchanges', 'Derivatives', 'Index / Stock Futures', 'Money Market Instruments', 'Treasury Bill/Cash Management Bill', 'TREPS / Reverse Repo'. 'Sub Total', 'Total', 'GRAND TOTAL' (100).
- Sum: Flexi ISIN rows 91.6 (+8.56 TREPS ~ 100.16 incl. rounding; GRAND TOTAL 100); Arbitrage ISIN rows 90.93 with Futures Sub Total -79.82.

## 19. Kotak Mahindra  -- CONFIRMED
- Request (GET, no landing): https://vatseelabs-s3.kotakmf.com/FAD/Portfolios/Consolidated-SEBI-Portfolio-as-on-{month_name}-{dd},-{yyyy}/ConsolidatedSEBIPortfolio{month_name}{yyyy}.xlsx -> September: .../Consolidated-SEBI-Portfolio-as-on-September-30,-2026/ConsolidatedSEBIPortfolioSeptember2026.xlsx (200 via CloudFront, content-type application/octet-stream, 3,716,121 B, Last-Modified Fri 09 Oct 2026 11:21:52 GMT). August (.../as-on-August-31,-2026/ConsolidatedSEBIPortfolioAugust2026.xlsx) also 200, 3,706,593 B. month_name = full capitalised English month; the comma in the dir segment is literal ('September-30,-2026').
- Fixture >2 MB -> kotak-mahindra_asof_2026-09-30-trimmed.xlsx (35 KB; sheets V3I, TIF, TCH, SEF, 'Common Notes', 'Scheme'; I kept 4 holding sheets, the three first by order plus SEF=Kotak Flexicap).
- Source: magic 504b0304; 121 sheets: ~119 three-letter scheme codes + 'Common Notes' + 'Scheme' (Index equivalent: header ['Abbreviations','Scheme Name'], row0 'Kotak Mahindra Mutual Fund'; e.g. SEF=Kotak Flexicap Fund, TIF=Kotak Nifty India Tourism Index Fund, V3I=Kotak Nifty200 Value 30 Index Fund).
- Holdings sheet: R0 'Portfolio of Kotak Flexi Cap Fund as on 30-Sep-2026' (as-of is in this title only). Header (row 1): 'Name of Instrument' | 'ISIN Code' | 'Industry' | 'Yield' | 'Quantity' | 'Market Value (Rs.in Lacs)' | '% to Net Assets' (data rows have cols A-B blank; ISIN col is 'ISIN Code'). Percent = PERCENT (5.48).
- Sections: 'Equity & Equity related', 'Listed/Awaiting listing on Stock Exchange', 'Mutual Fund Units', 'Unlisted'. Totals: 'Total', 'Cash Margin', 'Net Current Assets/(Liabilities)', 'Grand Total' (100). Notes: 'Total Number of contracts where futures were bought/sold'.
- Sum: SEF ISIN rows 98.69 (Total 98.5 + 0.19 MF units - 0.08 NCA = 100); TIF Total 100.42 with NCA -0.69 (so 'Total' can exceed 100).
- Plan: template matches literally. Hosting is S3/CloudFront, no auth. Day-10 timing: file Last-Modified 9 Oct.

## 20. Baroda BNP Paribas  -- CONFIRMED-WITH-CHANGE (landing_url and link_pattern wrong; 17 MB file)
- Plan: landing https://www.barodabnpparibasmf.in/archivedownload/ + link_pattern r"assets/download_documents/Portfolio_Holdings_and_Exposure". Reality: /archivedownload/ (200, 92 KB) lists NO xlsx/xls at all (only a PDF circular; archive loaded via ajax/load_more_documents_archive.js; the text says 'The Monthly Portfolio ... 30th September 2026 is hosted ... under Downloads > Portfolio of Scheme'). The string 'Portfolio_Holdings_and_Exposure' does not occur in any page fetched.
- Current-month page: https://www.barodabnpparibasmf.in/downloads/monthly-portfolio-scheme (200, 116 KB, plain <a href=".../assets/download_documents/<name>" download>Download</a>; each card has a '<p class="file-name">Monthly Portfolio for Baroda BNP Paribas Overnight Fund as on 30th September 2026</p>' and a date '08/10/2026'). Files: BOBBNPMF_Monthly_Portfolio_30-09-2026_20376.xls = consolidated, ALL schemes (200, 17,370,574 B, magic 504b0304 i.e. xlsx bytes); plus per-scheme YR51_20371.xlsx, YR52_20372.xlsx, YR53_20373.xlsx, YR54_20374.xlsx, YR56_20375.xlsx (the consolidated workbook's last five sheets are YR51, YR52, YR53, YR54, YR56, so these per-scheme files duplicate sheets already in the consolidated file; contents not diffed). Trailing number = document id.
- Fixtures: baroda-bnp-paribas_asof_2026-09-30-trimmed.xlsx (44,662 B; kept Index + T0MD09, T0MD12, T0MD13, T0ME02 = first 3 holding sheets + Mid Cap Fund equity), and baroda-bnp-paribas-overnight-yr51_asof_2026-09-30.xlsx (442,587 B, untouched).
- Consolidated: 48 sheets = 'Index' + 47 codes (T0MD09 ... T0ME02 ... YR56). Index header ['Sr No.', 'Short Name', 'Scheme Name'] (code -> name). Holdings sheet R0 = scheme name, R2 'Monthly Portfolio Statement as on September 30, 2026'.
- Header (row 3, col A blank): 'Name of the Instrument' | 'ISIN' | 'Rating' (equity: 'Industry / Rating') | 'Quantity' | 'Market/Fair Value  (Rs. in Lakhs)' | '% to Net  Assets' | 'YTM~' | 'YTC^' | 'null'. Percent = FRACTION; col A internal code (SESA536).
- Sections: 'Equity & Equity related', 'Debt Instruments', '(c) Securitised Debt', 'Money Market Instruments', 'Certificate of Deposit', 'Others', 'Corporate Debt Market Development Fund', 'Reverse Repo / TREPS', 'Treasury Bill'. 'Sub Total', 'Total', 'GRAND TOTAL' (1).
- Sum: T0MD09 ISIN rows 0.975 (GRAND 1); T0ME02 0.9872.
- Plan: SINGLE_WORKBOOK_MULTI_SHEET and 'no custom index-sheet parse' - the claim holds for the sheet layout but the 'direct .xlsx link in the page's static HTML ... plain grep' is true only on /downloads/monthly-portfolio-scheme (not /archivedownload/); and the filename is BOBBNPMF_Monthly_Portfolio_<dd-mm-yyyy>_<id>.xls, 17.4 MB.

---
## Group B
# Group B capture (2026-10-13). Target month-end 2026-09-30 unless stated.

All requests: curl with a Chrome UA (Playwright/google-chrome used once for SBI, Trust, Mirae, ABSL, BoI, LIC discovery only). Fixtures in
`backend/tests/fixtures/portfolio_disclosures/`. Scratch copies in scratchpad `capture/b/<amc>/`.

CROSS-CUTTING FACTS THE PARSER MUST HANDLE (all observed)
- The `%` column is a FRACTION (0.0567 = 5.67%) for Axis, Trust, Mirae, LIC, Aditya Birla, Bank of India, Monarch. It is PERCENT (8.7 = 8.7%) for SBI, Taurus, HDFC, Canara Robeco. Mixed units, per AMC.
- Market-value unit text differs: "Rs. in Lakhs" (SBI, ABSL, Monarch, Taurus, Trust, Axis), "Rs. in Lacs" (Mirae, BoI, HDFC "Rs. in Lacs.", Canara), "Rounded, Rs. In Lacs" (LIC).
- Data rows often have an UNLABELLED leading column (security code or '|') so header cells and data cells are offset by one column in several AMCs (SBI, Axis, Trust, ABSL, HDFC). Parse by locating ISIN pattern per row, not by header index.
- Section header rows (single text cell), 'Sub Total' / 'Total' / 'GRAND TOTAL' rows, 'Net Receivables / (Payables)', 'TREPS' rows (no ISIN) appear in every file.
- Rows after GRAND TOTAL contain notes, derivative tables and (ABSL) a defaulted-securities annexure with ISIN-looking rows (e.g. `INE433M07033` with quantities in rupees) that would corrupt a naive sum. Stop at the GRAND TOTAL row.

---------------------------------------------------------------------------------------------------
## SBI Mutual Fund - CONFIRMED-WITH-CHANGE
Chain (plain, no auth):
1. `POST https://www.sbimf.com/ajaxcall/CMS/GetSchemePortfolioSheets` (NOT `...QS`), headers `Content-Type: application/json;charset=UTF-8`, `X-Requested-With: XMLHttpRequest`, body `{"FundId":"","PSYear":"","PSMonth":"","PSFrequency":"Monthly"}` (year/month blank = newest; also accepts `"PSYear":"2026","PSMonth":"September"`).
2. Response is an HTML table fragment (not JSON). File link = first `href="...all-schemes-monthly-portfolio---as-on-30th-september-2026.xlsx?sfvrsn=..."` (regex on href). Also lists one per-scheme file per fund, e.g. `sbi-balanced-advantage-fund-monthly-portfolio---september-2026.xlsx`.
3. `GET https://www.sbimf.com/docs/default-source/scheme-portfolios/all-schemes-monthly-portfolio---as-on-30th-september-2026.xlsx?sfvrsn=2a79126c_2` -> 200, xlsx.
Also seen: `POST /ajaxcall/CMS/GetMonthsByYear {"folder":"Scheme Portfolios","year":2026}` -> JSON array of month names.
Contradiction: plan endpoint `.../GetSchemePortfolioSheetsQS` -> HTTP 302 to `/error?aspxerrorpath=...` (tried POST JSON body and GET query string). The real endpoint has no `QS` suffix.
File: all-schemes workbook 2,610,463 B (> 2 MB) -> fixture `sbi_asof_2026-09-30-trimmed.xlsx` (127,672 B): Index + first 3 holding sheets SMEEF, SLMF, SLTEF (openpyxl, no cell edits). 120 sheets total in the original.
As-of 2026-09-30 (cell "PORTFOLIO STATEMENT AS ON :" = datetime). Sheet names = scheme short codes (SMEEF, SLMF, ...), 118 holdings sheets. `Index` sheet: header row 2 = `Scheme Code | Scheme Short code | Scheme Name` (e.g. `007 | SMEEF | SBI ESG Exclusionary Strategy Fund`). Each holdings sheet row 3 = `SCHEME NAME : <name>`, row 4 = date.
Header (row 5): `Name of the Instrument / Issuer | ISIN | Rating / Industry^ | Quantity | Market value (Rs. in Lakhs) | % to AUM | YTM % | YTC % ## | Notes & Symbols` (one sheet SMEEF adds `BRSR Scores (also called as ESG Scores)`, `BRSR Core Scores...`, `Link to BRSR disclosures`, `Link to BRSR Core Assured disclosures`). Header says `% to AUM`, NOT `% to NAV` as the fifth-pass doc says. Unit text = "Rs. in Lakhs". Percent units (98.77 = 98.77%). Data rows have an extra leading unlabelled code column (`100012 | ICICI Bank Ltd. | INE090A01021 | Banks | qty | mv | pct`).
Section headers: `EQUITY & EQUITY RELATED`, `a) Listed/awaiting listing on Stock Exchanges`, `Equity Shares`, `DEBT INSTRUMENTS`, `MONEY MARKET INSTRUMENTS`, `OTHERS`, `DERIVATIVES` (22 sheets), `Treasury Bills`, `Non Convertible Debenture`, ... Subtotals are literally `Total` (581 occurrences) with `GRAND TOTAL (AUM)`; some `Total` rows carry the text `#` in the % cell. `TREPS / Reverse Repo Investments`, `Other Current Assets / (Liabilities)` have no ISIN. Futures/options detail text below GRAND TOTAL.
Sum check (ISIN rows only, whole file): SMEEF 98.87 (sheet GRAND TOTAL 99.99); SLMF 96.40; median over 118 sheets 96.82, range 0..105.12 (SOF overnight fund 4.09 because TREPS dominates).

---------------------------------------------------------------------------------------------------
## Bank of India Mutual Fund - CONFIRMED-WITH-CHANGE (host + folderName)
WORKING HOST: `https://www.boimf.in` (apex redirects to www). `bankofindiamf.com` (apex and www, https and http): "Could not resolve host" (no DNS answer) from the dev machine.
Chain: `POST https://www.boimf.in/AjaxService.asmx/GetDocuments`, `Content-Type: application/json; charset=UTF-8`, body
`{"pagno":0,"category":null,"fromDate":null,"toDate":null,"LibraryName":"InvestorCorner","folderName":"MONTHLY PORTFOLIO","CategoryValue":null}`
Response `{"d":"<JSON string>"}`; parse `json.loads(d)["Documents"][i]` -> `DocName` ("MONTHLY-PORTFOLIO - 30-SEP-2026"), `FolderUrl` (the file URL). `folderName` is case sensitive: `"Monthly Portfolio"` returns an empty list; `"MONTHLY PORTFOLIO"` works (the page's tab text is `Monthly Portfolio`, the factsheet request on the page used `FACTSHEETS`).
File URL: `https://www.boimf.in/docs/default-source/investorcorner/monthly-portfolio/monthly-portfolio---30-sep-2026.xlsx?sfvrsn=8dbd0a0e_3` -> 200, 579,215 B, xlsx. Saved whole: `bank-of-india_asof_2026-09-30.xlsx` (< 2 MB, untrimmed). Note filename month token format varies ("30-sep-2026" vs "31-august-2026").
Sheets (27): `Index`, 25 scheme sheets `YB01 YB02 YB04 YB06 YB07 YB08 YB09 YB21 YB26 YB30 YB31 YB32 YB33 YB34 YB35 ... YB44 YB45`, and `F & O Disclosure` (1,163 rows, not holdings; must be skipped). Index: header `Scheme Code | Scheme Names`, then `YB01 | Bank Of India Liquid Fund \n (An Open Ended Liquid Scheme) | Click`; the scheme-name cell contains the product description after a newline.
Contradiction with plan ("scheme codes YB01-YB44"): codes run YB01 to YB45 (YB45 present), and only 25 codes exist in this file, not 44.
Holdings header (row 6/7): `Name of the Instrument | ISIN | Industry / Rating | Quantity | Market/Fair Value (Rs. in Lacs) | % to Net Assets | YTM` (variants: `Rating` for debt funds, `Industry` for YB44). Rows 0-5 = `Name of Mutual Fund : Bank of India Mutual Fund`, scheme name + description, risk-o-meter block, `Monthly Portfolio Statement as on September 30,2026`. Fraction % (0.081 = 8.1%). Section headers `Equity & Equity related`, `(a) Listed / awaiting listing on Stock Exchanges`, `Money Market Instruments`, `Treasury Bill`; `Sub Total` (145), `Total` (86), `GRAND TOTAL`, `TREPS / Reverse REPO`, `Net Receivables / (Payables)`. Notes block follows.
Sum (ISIN rows): YB04 0.9320, YB02 0.9481, YB07 0.7588; median 0.9433 over 25 sheets (YB35 overnight 0.0396, YB01 liquid 1.1833 because net receivables are negative).

---------------------------------------------------------------------------------------------------
## Trust Mutual Fund - CONFIRMED (one wrinkle: the request body)
Chain:
1. `POST https://www.trustmf.com/api/api/Trust/GetData`, `Content-Type: application/json`, body
`{"systemQueryFileName":"disclosuresweb.xml","tagName":"GetDisclosureByType","searchField":"","searchValue":"","sortField":"uploaddate","sortDirection":"DESC","replaceField":"_slug_","replaceValue":"portfolio-monthly-disclosure"}`
(the site itself sends the 4 slugs `portfolio-fortnightly-disclosure,portfolio-monthly-disclosure,portfolio-quarterly-disclosure,portfolio-half-yearly-disclosure` comma-joined; I used the monthly slug alone). Page that triggers it: `https://www.trustmf.com/disclosures` (NOT `/statutory-disclosure/...`).
2. JSON path: `resultSetArray[i].fileurl` (newest first), with `title` "TRUSTMF Monthly Portfolio Report as on 30.09.2026", `uploaddate` "10/9/2026 12:00:00 AM" (m/d/Y; published 9 Oct). `fileurl` = `https://trustmf.com/Content/2026/10/Monthly Port_20261009132916.xlsx` contains a SPACE and uses the apex host: percent-encode (`Monthly%20Port_...`); apex answers 307 to `www.trustmf.com`, so follow redirects.
3. GET -> 200 xlsx, 3,814,292 B (> 2 MB). Fixture `trust_asof_2026-09-30-trimmed.xlsx` (38,461 B) keeps 3 of the 11 sheets: TMFLIQ, TMFST, TMFFLEXI (one equity sheet chosen on purpose, rather than the strictly first 3).
Sheets (11, one per scheme, NO Index sheet): `TMFLIQ TMFST TMFOF TMFMM TMFCB TMFFLEXI TMFSCAP TMFMCAP TMFARB TMFMID TMFLRMCF`. Scheme name is in cell B2 (e.g. `TRUSTMF Flexi Cap Fund`); A1 holds a code. QUIRK: sheet `TMFFLEXI` has A1 = `TMFCB` (code mismatch with the sheet name), so do not trust A1; use sheet name or B2.
Header (row 6): `Name of the Instrument | ISIN | Industry (or Rating) | Quantity | Market/Fair Value (Rs. in Lakhs) | % to Net Assets | Yield to Maturity (YTM) | Yield to Call (YTC) | Notes & Symbols`. Fraction %. Unlabelled leading code column in data rows (and in TMFLIQ the codes are staggered one row off against the instruments).
Sections: `Equity & Equity related` (with `NIL` in ISIN column for empty), `a) Listed/awaiting listing...`, `Debt Instruments`, `Money Market Instruments`, `Others`, `Corporate Debt Market Development Fund`, `CBLO / Reverse Repo / TREPS`, `Net Receivables / (Payables)`, `Sub Total`, `Total`, `GRAND TOTAL` (the GRAND TOTAL row has the code `TRP_010926` in column A).
Sum (ISIN rows): TMFFLEXI 0.9228, TMFSCAP 0.9418, TMFMID 0.9421, median 0.9211; TMFLIQ 1.1764 (liquid fund, net receivables -0.1784, so >1 is genuine); TMFOF 0.023 (fund of funds, units counted).

---------------------------------------------------------------------------------------------------
## Mirae Asset Mutual Fund - CONFIRMED (per-scheme files, many)
Chain:
1. `POST https://www.miraeassetmf.co.in/AjaxService/GetDownloadsData`, `Content-Type: application/json; charset=UTF-8`, `X-Requested-With: XMLHttpRequest`, body `{"request":{"modulename":"portfolio_tab1","pgno":1,"pgsize":200}}` (page uses pgsize 10). Plain curl works.
2. JSON path `Data[i].URL` (relative, e.g. `/docs/default-source/portfolios/mafcf_sept2026.xlsx`), `Data[i].Title` "Portfolio Details as on 30th September 2026 for Mirae Asset Flexi Cap Fund", `DataCount` 3813. In the first 200 rows: 99 titles "30th September 2026", 98 "31st August 2026", 3 "31st July 2026" (so 99 per-scheme files for the month; need paging by pgno beyond ~100 per month only if pgsize is small). File URL = `https://www.miraeassetmf.co.in` + URL. Filename pattern `<code>_sept2026.xlsx`.
3. GET -> 200, `content-type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, magic `PK`. Saved mafcf (382,272 B) and macmf (396,810 B): `mirae-asset-flexi-cap_...`, `mirae-asset-liquid_...`.
Soft-404 verified: `.../maaf_oct2026.xlsx` (non-existent) -> HTTP 302 to `/error?aspxerrorpath=...`, which a redirect-following client turns into 200 `text/html` 140,468 B (matches the plan's "HTTP 200 HTML under .xlsx"). Magic-byte check is mandatory (no-redirect clients see 302).
One sheet per file, sheet name = code in caps (MAFCF, MACMF, MAMAAF). Rows: scheme name, `(An open ended ...)` description, then `Mirae Asset Flexi Cap Fund | MI043 | <date>`, `Monthly Portfolio Statement as on September 30, 2026`. Header: `Name of the Instrument | ISIN | Industry ^/ Rating | Quantity | Market/Fair Value (Rs. in Lacs) | % to Net Assets | YTM`. Unit text "Rs. in Lacs". Fraction %. Data rows have NO leading code column here. Sections `EQUITY & EQUITY RELATED`, `(a) Listed / awaiting listing on Stock Exchanges`, `Total`, `Total NIL NIL`, `GRAND TOTAL`.
Sum: MAFCF 0.9967, MACMF (liquid) 1.1963, MAMAAF 0.9669.

---------------------------------------------------------------------------------------------------
## LIC Mutual Fund - CONFIRMED-WITH-CHANGE (form-encoded HTML fragments, plus a consolidated route the plan does not mention)
The plan says "JSON POST chain". Reality: `application/x-www-form-urlencoded` POSTs with header `X-Requested-With: XMLHttpRequest`, responses are HTML `<option>`/`<a>` fragments, not JSON. Page URL is `https://www.licmf.com/downloads/monthly-portfolio` (`/downloads/portfolio` is 404).
Per-scheme chain (what the plan describes):
1. `POST /downloads/portfolio-filter-options` body `fund_category=Equity&filter=category` -> `<option value='LEEQTF'>LIC MF Flexi Cap Fund</option>...` (note some values have trailing spaces, `LEFE30 `).
2. `POST /downloads/portfolio-filter-options` body `scheme_code=LEEQTF&filter=fund_name&type=monthly_portfolio` -> year options; `year=2026&filter=year&type=monthly_portfolio&scheme_code=LEEQTF` -> month options (1..9, numeric).
3. `POST /downloads/portfolio-files` body `scheme_code=LEEQTF&fund_name=LIC MF Flexi Cap Fund&type=monthly_portfolio&month=9&year=2026` -> `<a href="/assets/downloads/portfolio/monthly/2026/9/LEEQTF09-10-2026-15:47:01.xlsx">`.
Consolidated route (NOT in the plan, simpler, 2 requests for all 40+ funds):
1. `POST /downloads/consolidated-portfolio-filters` body `id=639&filter=year` then `year=2026&id=639&filter=month` (id 639 = Monthly, 638 = Fortnightly).
2. `POST /downloads/consolidated-portfolio-files` body `id=639&month=9&year=2026` (`month=September` returns empty; `9` and `09` work) -> two links: `/assets/pdf/statuary_disclosure_new/21/LIC MF Monthly Equity Portfolio_Sep_26.xlsx` ("Monthly Portfolio Equity as on September 30, 2026") and `.../LIC MF Monthly Debt Portfolio_Sep_26.xlsx`. URLs contain spaces (percent-encode).
Fixtures: `lic-consolidated-equity_asof_2026-09-30.xlsx` (827,310 B, 33 sheets), `lic-consolidated-debt_asof_2026-09-30.xlsx` (507,614 B, 12 sheets), `lic-flexi-cap_asof_2026-09-30.xlsx` (per-scheme, 120,887 B; opening it with openpyxl emits "Defined names for sheet index N cannot be located" warnings, harmless).
Sheets: `Sheet1` = index (A1 `INDEX`, `Monthly Portfolio Statement as on September 30, 2026`, header `Scheme | Scheme Name | Riskometer`, e.g. `LEARBF | LIC MF Arbitrage Fund | Low`), then one sheet per scheme named by code (`LEARBF`, `LEBADF`, ... equity file; `LDBOND`, `LLIQDF`, ... debt file). Index sheet is named `Sheet1`, not `Index`.
Holdings header: `Name of the Instrument | ISIN | Industry / Rating | Quantity | Market/Fair Value (Rounded, Rs. In Lacs) | Rounded, % to Net Assets | Yield`. Fraction %. Sections `Equity & Equity related`, `(a)Listed / Awaiting listing on Stock Exchanges`, `(b) Unlisted`, `Investment in Mutual fund`, `Sub Total`, `TOTAL`, `GRAND TOTAL`, `Treps / Reverse Repo`, `Net Receivables / (Payables)`. Arbitrage sheet carries futures lines (negative quantity/market value, rows 108+, e.g. `Total | -4203425 | -20654.6 | -0.6777`) below GRAND TOTAL.
Sum (ISIN rows): LEARBF 0.9631, LEEQTF 0.9574; equity-file median 0.9603 (range 0.7739-0.9996); debt-file median 0.9641 (LDONTF 0.041, LDMNMF 1.0592, LLIQDF 1.0554).

---------------------------------------------------------------------------------------------------
## Axis Mutual Fund - CONFIRMED (with 3 parser-relevant details)
Chain:
1. `POST https://www.axismf.com/cms/token`, `Content-Type: application/json`, body `{}` -> `{"status":"success","statusCode":"0","data":"{'token': 'Bearer <hex>'}"}`. NB `data` here is a string/dict repr with single quotes in my parse (I read `d['data']['token']`; treat both shapes).
2. `POST https://www.axismf.com/cms/get-scheme-documents`, headers `Authorization: Bearer <hex>` (the token string already starts with "Bearer "), `Content-Type: application/json`, body `{"sdType":"yearMonthSchemeDocs","sdID":"sdMonthSchemePortfolio","year":"2026","month":"September","schemeCode":"Consolidated"}`.
3. JSON path `data.documentList[i]`; the URL key is spelled `docuementURL` (typo in the API), plus `documentName`, `documentPostedDate`, `orderNo`. Choose `documentName` starting "Monthly Portfolio" ("Monthly Portfolio 30-09-2026", posted 2026-09-30). The same list also holds weekly debt/arbitrage portfolios, adhoc portfolios and daily data, so filtering on `documentName` is required. `month` is the as-of month ("September"), not the publication month; `month=October` returns only weekly/daily files.
4. File `https://www.axismf.com/1/5/464/560/3622/4593/Monthly_Portfolio_30_09_2026_75011dd855.xlsx` -> 200, S3, 1,290,236 B. Saved whole: `axis_asof_2026-09-30.xlsx`.
Sheets (88): `Index` (header `Sr No. | Short Name | Scheme Name`, 87 rows; NOT `Scheme Code`) + 87 scheme sheets named by short name (`AXIS500`, `AXISASD`, `AXISBCF`...). A1 of each sheet = short name, B1 = scheme name.
Header (row 4): `Name of the Instrument | ISIN | Industry (or `Industry / Rating`, or `Rating`) | Quantity | Market/Fair Value (Rs. in Lakhs) | % to Net Assets | YTM~ | YTC^` (AXISESG adds ESG score columns). Variants seen: 44 sheets `Industry`, 33 `Industry / Rating`, 9 `Rating`, 1 ESG. Header row begins with an empty column A; data rows start with an unlabelled security code (equity `HDFB03`, fund units use the AMFI scheme code `141588`).
FRACTION % (0.0567). Sections: `Equity & Equity related`, `(a) Listed / awaiting listing on Stock Exchanges`, `(b) Unlisted`, `Debt Instruments`, `Money Market Instruments`, `Mutual Fund Units`, `Exchange Traded Funds`, `Alternative Investment Fund Units`, `Derivatives` (16 sheets), `Interest Rate Swaps`, `Reverse Repo / TREPS`, `Net Receivables / (Payables)`, `Sub Total` (364), `Total` (244), `GRAND TOTAL` (87). Derivative/futures disclosure text blocks after GRAND TOTAL.
Sum (ISIN rows): AXIS500 1.0018 (GRAND TOTAL = 1); AXISASD (fund of funds) 0.9742; median 0.9697 over 87 sheets.
Plan check: plan says `data` ... "documentList gives direct file URLs" - true but the field is `docuementURL`. Plan (Task 11 Step 6) index-sheet test assumes a `Scheme Code` header column; Axis uses `Short Name`.

---------------------------------------------------------------------------------------------------
## Aditya Birla Sun Life Mutual Fund - CONFIRMED-WITH-CHANGE
Chain:
1. `GET https://mutualfund.adityabirlacapital.com/postlogin/CustomApi/Resources/FactsheetAccordionById?id=3ccab227-9de5-4494-b78d-2b4f7c0c054a&ctype=%2Fsitecore%2Fcontent%2FRoot%2FBSL%2FLibrary%2FLists%2FFAQ%2FCustomer%20Types%2FIndividual&month=%20&year=0` (the page's own call; works with plain curl, Chrome UA). The 4 accordion ids come from the SSR HTML of `https://mutualfund.adityabirlacapital.com/forms-and-downloads/portfolio` (`data-accordian-api=` on each tab): `3ccab227-...` = Monthly Portfolio, `56e98138-...` = Half Yearly, `12341969-...` = Fortnightly, `9e12c317-...` = Portfolio Overlap.
2. JSON path `AccordionList[0].pdfUrl` (list has 212 entries, newest first), `ResourceLink` "Monthly Portfolios as on September 30, 2026", `IconClass` "zip". pdfUrl = `https://abcscprod.azureedge.net/-/media/bsl/files/resources/monthly-portfolio/2026/30092026_abslmf_monthlydisclosure.zip`. Host abcscprod.azureedge.net: "Could not resolve host" (dead, as the plan says).
3. `GET https://mutualfund.adityabirlacapital.com/-/media/bsl/files/resources/monthly-portfolio/2026/30092026_abslmf_monthlydisclosure.zip` -> 200, `application/x-zip-compressed`, 2,194,065 B.
Contradiction/precision: the download is a ZIP (one member `30092026_ABSLMF_MonthlyDisclosure.xls`, 8,235,008 B uncompressed, genuine BIFF/CDF legacy xls, xlrd opens it, 105 sheets). The plan registry note describes only "105-sheet workbook ... genuine legacy .xls"; the ZIP unwrap step is not mentioned in the registry (the earlier sample name differs per month: `monthly-portfolio-31082026_abslmf.zip`, `absl_monthly_portfolio_report_july--2026.zip`, so file names are not predictable; always take it from the API).
Fixture: ZIP kept unchanged `aditya-birla-sun-life_asof_2026-09-30.zip` (2,194,065 B, just over 2 MB; cannot trim a legacy xls, and the ZIP has one member).
Sheets (105): `Index` (header row 3: `Scheme Code | Scheme Short code | Scheme Name`, e.g. `AB001 | BSL95F | ADITYA BIRLA SUN LIFE AGGRESSIVE HYBRID FUND (FORMERLY KNOWN AS ...)`) + 104 scheme sheets named by short code (`BSL95F`, `ADVG`, `PLUS`, `CASH`, ...). A1 = short code, B1 = full name, row 3 = `Portfolio Statement as on September 30, 2026`.
Header (row 4): `Name of the Instrument / Issuer | ISIN | Industry^ / Rating | Quantity | Market value (Rs. in Lakhs) | % to AUM | YTM % | YTC %` (ABSLESG adds `ESG Score ( Rating & Analystics Ltd)`, `BRSR Core Score #`, `Link to BRSR report`). `% to AUM` (confirmed), FRACTION. Header sits at columns C onward; data rows have two leading cells (blank, security code).
Sections `Equity & Equity Related`, `a) Listed/awaiting listing on Stock Exchanges`, `Total` (many), `GRAND TOTAL (AUM)` (1.0), derivative blocks.
TRAP: sheets such as BSLMTP, MIP25, BSLCBF carry an annexure table AFTER GRAND TOTAL with defaulted securities (`9.80% IL&FS Tamil Nadu Power Company Limited (16/03/2020) | INE433M07033 | 0.0 | 0.0 | 968636468.14 | ...`), so a naive ISIN-row sum gives 2e8 to 1e9 for 3 sheets. Stop at GRAND TOTAL.
Sum (up to GRAND TOTAL): BSL95F 0.9799 (naive sum), GRAND TOTAL 1.0; naive median over 104 sheets 0.9744; 11 sheets are empty/zero (ETF/FoF with no ISIN rows) and 3 are the annexure trap.

---------------------------------------------------------------------------------------------------
## Taurus Mutual Fund - CONFIRMED (Sept 2026 NOT-PUBLISHED-YET; latest is March 2026)
Chain (plain GET, no AJAX needed): `GET https://www.taurusmutualfund.com/financials/portfolio?field_hy_portfolio_year_target_id=562&field_hy_portfolio_month_target_id=435`. Ids come from the page `<select>`s: year `562`=2026, `554`=2025, `512`=2024; month `435`=March, `436`=September. The response is HTML; file links are `href=" /sites/default/files/downloads/Taurus_Flexi_Cap_Fund_Half_Yearly_Portfolio_Report_Performance_March_2026.xlsx"` (leading space inside the href, strip it). 8 files for March 2026 (Ethical, Flexi Cap, Infrastructure, Large Cap, Nifty50 Index, ELSS, Banking & Fin Serv, Mid Cap).
`year=562&month=436` (September 2026): HTTP 200, page renders with no `.xls(x)` links (no `view-empty` class string in this response). September 2025 files (`year=554&month=436`) use a different naming style `TMF_TEF_half_yearly_portfolio_September_2025.xlsx`, so no single filename regex fits all vintages. Contradiction with fifth-pass doc: it says the files are `.xls`; they are `.xlsx` (PK zip).
Downloaded `.../sites/default/files/downloads/Taurus_Flexi_Cap_Fund_Half_Yearly_Portfolio_Report_Performance_March_2026.xlsx` (204,125 B) and the Large Cap one (200,264 B) -> `taurus-flexi-cap_asof_2026-03-31.xlsx`, `taurus-large-cap_asof_2026-03-31.xlsx`.
As-of 2026-03-31 (cell `PORTFOLIO STATEMENT AS ON :`). Sheets (3 per file): `TSS` (holdings; sheet name = scheme code, e.g. TSS = Flexi Cap, TBF = Large Cap), `TSS Performance` (CAGR table, not holdings), `Annexure` (not holdings). One scheme per workbook, name in B3 (`SCHEME NAME : Taurus Flexi Cap Fund`).
Header (row 6): `Name of the Instrument / Issuer | ISIN | Rating | Industry ^ | Quantity | Market value (Rs. in Lakhs) | % to AUM | Notes & Symbols`. NB column order is Rating then Industry (reverse of other AMCs) in the header, but data rows again have a leading code column (`100006 | HDFC Bank Ltd. | INE040A01034 | Banks | qty | mv | 8.7`). PERCENT units (8.7). Sections `EQUITY & EQUITY RELATED`, `a) Listed/awaiting listing on Stock Exchanges`, `b) Unlisted`, `DEBT INSTRUMENTS`, `MONEY MARKET INSTRUMENTS`, `OTHERS`, `Other Current Assets / (Liabilities)`, `Total` (x3; one has `#`), `GRAND TOTAL (AUM)`.
Sum (ISIN rows): TSS 97.89 (GRAND TOTAL 100), TBF 95.92.

---------------------------------------------------------------------------------------------------
## HDFC Mutual Fund (Wayback) - CONFIRMED-WITH-CHANGE (landing URL wrong; capture is a month stale; links are in embedded JSON)
Direct: `https://www.hdfcfund.com/...` -> 403 with or without a Chrome UA (also the portfolio page). `files.hdfcfund.com` -> 200 with a Chrome UA, 403 `application/xml` with no UA.
Wayback CDX works right now from the dev machine: HTTP 200 in 1.3 s to 3.8 s (no 503). I did not test it from AWS.
Chain:
1. `GET https://web.archive.org/cdx/search/cdx?url=<landing>&output=json&matchType=exact&filter=statuscode:200&collapse=urlkey&limit=-50`.
   - With the plan's landing_url `https://www.hdfcfund.com/statutory-disclosure/portfolio-disclosure` (also with a trailing slash): returns `[]` (zero captures). The plan's HDFC registry/landing URL finds nothing.
   - With `https://www.hdfcfund.com/statutory-disclosure/portfolio/monthly-portfolio` (the URL the 2026-10-09 spike batch D used): 1 row, timestamp `20260910104807`, status 200, text/html. Prefix CDX on `https://www.hdfcfund.com/statutory-disclosure` confirms this is the only monthly-portfolio capture newer than 2024/2025.
2. `GET https://web.archive.org/web/2id_/https://www.hdfcfund.com/statutory-disclosure/portfolio/monthly-portfolio` (needs `--compressed`/Accept-Encoding handling: body is gzip) -> 152,415 B Next.js page (capture 2026-09-10). Contradiction with plan Task 7 `_extract_links` (scans `<a href>`): the page has only ONE `<a href>` ending in a document (`HDFC AMC Final Booklet.pdf`). The 111 `.xlsx` URLs sit inside the embedded JSON as `"https://files.hdfcfund.com/s3fs-public/2026-09/Monthly%20HDFC%20Flexi%20Cap%20Fund%20-%2031%20August%202026.xlsx"` (plus `PortfolioOverlap31Aug2026.xlsx`). They are already absolute `files.hdfcfund.com` URLs, so the plan's netloc-rewrite step is a no-op; extraction must regex the JSON/script text, not anchors.
3. Staleness: the only capture is dated 2026-09-10, so the discovered files are the 31 AUGUST 2026 disclosures (folder `2026-09`). The 30 SEPTEMBER 2026 files are not discoverable via Wayback today (this would trigger the plan's `stale_wayback_capture` alert).
4. Pattern observed (not discovered, a guess verified live): `https://files.hdfcfund.com/s3fs-public/2026-10/Monthly%20HDFC%20Flexi%20Cap%20Fund%20-%2030%20September%202026.xlsx` -> 200 xlsx 752,904 B; the same name under `2026-09/` -> 403. Folder = upload month (YYYY-MM), name = `Monthly HDFC <Scheme Name> - <D Month YYYY>.xlsx`.
Fixtures: `hdfc-flexi-cap_asof_2026-09-30.xlsx` (752,904 B, via the pattern guess), `hdfc-flexi-cap_asof_2026-08-31.xlsx` (730,405 B, via the Wayback-discovered URL), `hdfc-bse-500-index-fund_asof_2026-09-30.xlsx` (190,714 B; the passive-fund shape, pattern guess; 500 ISIN rows).
Sheets: active equity = 2 (`HDFCEQ` holdings + `DerivativeHDFCEQ` with 65,504 rows, mostly blank padding, plus notional/future tables); passive = 1 (`HDFC500IDF`). Sheet name = scheme code; A1 = scheme name + description. Row 2 `Portfolio as on 30-Sep-2026`.
Header (row 5): col A blank, `ISIN | Coupon (%) | Name Of the Instrument | Industry+ /Rating | Quantity | Market/ Fair Value (Rs. in Lacs.) | % to NAV | Yield | ~YTC (AT1/Tier 2 bonds)`; August file adds `Derivative % to NAV`, `Unhedged % to NAV`. NB ISIN comes BEFORE the name here (all other AMCs: name then ISIN). Data rows: col A `|` marker (equity) or blank, B ISIN, C coupon, D name, E industry/rating, F qty, G market value, H % (PERCENT: 8.8). Sections `EQUITY & EQUITY RELATED`, `(a) Listed / awaiting listing on Stock Exchanges`, `Equity`, `(b) Units issued by ReIT`, `DEBT INSTRUMENTS`, `Government Securities (Central/State)`, `MONEY MARKET INSTRUMENTS`, `TREPS - Tri-party Repo`, `OTHERS`, `Net Current Assets`, `Sub Total`, `Total`, `Grand Total`, then `Portfolio Classification by Industry(%)` block and footnotes.
Sum (ISIN rows in col B, col H): HDFCEQ Sep 97.72 (+TREPS 2.81, Grand Total 100); Aug 97.48; HDFC500IDF 99.79.

---------------------------------------------------------------------------------------------------
## Canara Robeco Mutual Fund (Wayback) - CONFIRMED-WITH-CHANGE (not blocked now; one cap and one pattern issue)
Direct: `https://www.canararobeco.com/` -> 200 (with and without a UA), and the upload `.xlsx` itself downloads directly with 200. The task brief/plan said 403 for canararobeco.com; I could not reproduce that today from the dev machine. The portfolio files do not need Wayback to download, only to be discovered (no listing page).
Chain: `GET https://web.archive.org/cdx/search/cdx?url=https://www.canararobeco.com/wp-content/uploads/&output=json&matchType=prefix&filter=statuscode:200&collapse=urlkey&limit=-50` -> 200, 50 rows in 3.8 s: 28 xlsx, the rest PDF/PNG/JPG/SVG. 24 of the xlsx are `...uploads/2026/10/<CODE>-%E2%80%93-Canara-Robeco-<Scheme>-%E2%80%93-September-2026.xlsx` (published 9 Oct 2026, capture timestamps 20261009073xxx). Direct GET of e.g. `.../2026/10/SC-%E2%80%93-Canara-Robeco-Small-Cap-Fund-%E2%80%93-September-2026.xlsx` -> 200, 106,033 B; `LI-...Liquid-Fund...` 854,021 B.
Issues vs plan:
 - `limit=-50` takes the last 50 rows by urlkey order, which returned only 24 September-2026 workbooks (images, PDFs and 3 `scheme_documents/` files from 2025 occupy the remaining slots). Whether Canara has more than 24 schemes is not verified; the 50 cap is a real risk of silently dropping funds as more uploads accumulate.
 - The plan's `link_pattern` `Canara-Robeco-.*-Fund` also matches a debt FORTNIGHTLY file `2026/09/BP-%E2%80%93-Canara-Robeco-Banking-and-PSU-Debt-Fund-%E2%80%93-15th-September-2026.xlsx` (mid-month), and the previous month's `2026/09/SC-...-August-2026.xlsx`; a month/date filter on the file name is needed. `OF-...Overnight-Fund-September-2026.xlsx` has no second en-dash before the month (naming not uniform).
 - Month folder = UPLOAD month (`2026/10` holds September data).
Fixtures: `canara-robeco-small-cap_asof_2026-09-30.xlsx` (106,033 B), `canara-robeco-liquid_asof_2026-09-30.xlsx` (854,021 B), both untrimmed.
Sheets: 1 per file, name = 2-letter code (`SC`, `LI`); A1 = `CANARA ROBECO SMALL CAP FUND`; row 3 `Monthly Portfolio Statement as on September 30, 2026`. Per-scheme workbook (confirms the plan's per-scheme decision, not an index-sheet bundle; there is no Index sheet).
Header (row 4): `Name of the Instrument | ISIN | Industry / Rating | Quantity | Market/Fair Value (Rs. in Lacs) | % to Net Assets | Market Capitalization (equity) or Yield % (debt) | Outstanding derivative exposure as % to net assets Long / (Short) | Scheme Risk-O-Meter Level - September'26 | Benchmark Risk-O-Meter Level - September'26 | Scheme Risk-O-Meter Level - August'26 | Benchmark Risk-O-Meter Level - August'26 | Potential Risk Class (PRC) Matrix`. No leading code column; PERCENT units (2.73). The section-header row `Equity & Equity related` has the literal strings `#VALUE!` in cells B-E (broken Excel formulas): guard for error text in numeric/ISIN cells. Risk-o-meter/benchmark text is interleaved in the right-hand columns of ordinary holding rows (e.g. `Benchmark: Nifty Smallcap 250 Index TRI`).
Sections `Equity & Equity related`, `(a) Listed / awaiting listing on Stock Exchanges`, `Certificate of Deposit`, `Commercial Paper`, `Treasury Bill`, `Government Bonds`, `Alternative Investment Fund`, `TREPS`, `Net Receivables / (Payables)`, `Sub Total` (5), `Total` (5), `Grand Total`, footnotes `** Non Traded Security`, `# Unlisted Security`.
Sum (ISIN rows): SC 96.01 (Grand Total 100); LI 94.39.

---------------------------------------------------------------------------------------------------
## Monarch Mutual Fund - CONFIRMED-WITH-CHANGE (host, and a monthly file now exists)
HOST: `https://www.monarchamc.in` (apex also 200). `mf.monarchnetworth.com` and `www.monarchnetworth.com`: "Could not resolve host" (no DNS answer) from the dev machine. The plan registry `landing_url="https://mf.monarchnetworth.com/statutory-disclosure/portfolio"` is dead.
Chain (STATIC_REGEX on a server-rendered Next.js page, plain GET, no JS):
 - Fortnightly: `GET https://www.monarchamc.in/forms-downloads/portfolio-holdings/fortnightly` -> 200 (101,500 B); `href` regex `https://www.monarchamc.in/uploads/Fortnightly_Portfolio_Monarch_Overnight_Fund_30_September_2026_062218f2ff.xls` and `..._15_September_2026_a8e1f3e8fc.xls`. Latest = 30 Sep 2026. File name carries a random hash suffix (not guessable).
 - Monthly: `GET https://www.monarchamc.in/forms-downloads/portfolio-holdings/monthly` -> 200; `href` = `https://www.monarchamc.in/uploads/Monthly_Portfolio_Monarch_Overnight_Fund_30_September_2026_8d5f63f3c7.xls` ("Monthly - Portfolio Monarch Overnight Fund 30 September 2026"). The page JSON shows the `monthly` category `createdAt` 2026-10-08, so it is new.
Contradiction: plan note says "Monarch genuinely only publishes a Fortnightly portfolio disclosure, no monthly file exists" and the task brief says "fortnightly only". A monthly file for 30 Sep 2026 exists and downloads (200, `application/vnd.ms-excel`, 257,536 B). Fortnightly file 304,640 B. Both genuine legacy xls (CDF, magic `D0CF11E0`). Both saved: `monarch-overnight-fortnightly_asof_2026-09-30.xls`, `monarch-overnight-monthly_asof_2026-09-30.xls`. Cadence caveat: the 15th-of-month fortnightly and the month-end fortnightly/monthly files overlap on 30 Sep (same data); the plan's per-(scheme, as_of) grain must de-duplicate, and a month-end monthly file now supersedes the need for `cadence="fortnightly"`.
Sheets (2): `Index` (header row 3: `Scheme Code | Scheme Short code | Scheme Name`, one row `MN001 | MNOVNFD | MONARCH OVERNIGHT FUND`) and `MNOVNFD`. Same ABSL/SBI-style template.
Header (row 9): `Name of the Instrument / Issuer | ISIN | Industry^ / Rating | Quantity | Market value (Rs. in Lakhs) | % to NAV | YTM % | YTC %`. Row 8 says `Fortnightly Portfolio Statement as on September 30, 2026` (monthly file: `Monthly Portfolio Statement as on September 30, 2026`). FRACTION %. The overnight fund's rows (`1609260100 | 5.30% Reverse Repo | 5249.87 | 0.7397 | 0.053`, `TREPS`) have NO ISIN, so an ISIN-keyed parser finds zero holdings for this fund (every row is repo/TREPS and net current assets). Sections `Others`, `TREPS / Reverse Repo Investments`, `Total`, `GRAND TOTAL (AUM)` = 1.0.
Sum: Total TREPS 0.9969 + other 0.0031 = 1.0 (no ISIN rows).

---
## Group C1
# Group C1 capture notes (target as-of 2026-09-30; all 8 AMCs; capture date 2026-10-13)

Fixture dir: backend/tests/fixtures/portfolio_disclosures/

## Navi (Navi Mutual Fund) — CONFIRMED-WITH-CHANGE (plan right on endpoint; category value now known; file shape is per-scheme)
Request chain (plain curl/httpx, no cookies, no browser):
1. GET https://navi.com/mutual-fund/downloads/portfolio  (UA: Chrome string; 200, 105 KB). Nonce regex on HTML:
   `navi_property = {"ajaxurl":...,"rest_url":"https://navi.com/wp-json/","nonce":"<N>","filter_nonce":"..."}` -> `"rest_url":"[^"]*","nonce":"([a-z0-9]+)"`
2. POST https://navi.com/wp-json/nv/v1/documents  header `WP-NONCE: <N>`, form-encoded body
   `financial_year=2026-2027&value=September&category=884&type=Monthly&order=DESC`
   (financial_year = Apr-Mar FY "YYYY-YYYY"; value = full month name; category 884 = Monthly portfolio; the same page also has 885 Fortnightly, 886 HalfYearly, 887 Quarterly, 928 Overlap-report. Found in landing HTML `data-category`; request shape from the site's app.js `$.ajax`.)
3. Response JSON: {"success":true,"data":[{"title":"Navi Flexi Cap Fund 1st &#8211; 30th September 2026","url":"https:\/\/public-assets.prod.navi-tech.in\/navi-website-assests\/documents\/Navi_Flexi_Cap_Fund_1st_30th_September_2026_20261009174229.xlsx"},...]}  -> JSON path `data[].url` (title has HTML entities: &#8211; &amp;). 18 scheme files for Sep 2026 (one per scheme, NOT one workbook). October returns {"success":true,"data":[]} (not yet published).
   Filenames carry a publish-timestamp suffix (…_20261009174229), so no template guessing; must call the API.
Proof of replay: curl with a nonce scraped from a plain GET (no cookie jar) returned 200 + 18 docs; httpx GET of two file URLs returned 200 application/octet-stream, no auth.
Files: navi-flexi-cap_asof_2026-09-30.xlsx (41,229 B), navi-large-midcap_asof_2026-09-30.xlsx (40,816 B), unchanged. PK magic.
Sheet convention: one sheet named 'Sheet1' (no scheme name in sheet; scheme name in cell B5 'Navi Flexi Cap Fund'; B4 'NAVI MUTUAL FUND'; B6 'Monthly Portfolio Statement for the month ended 30 Sep 2026').
Header row (row 7, columns B..H): 'Name of the Instrument' | 'ISIN' | 'Industry/Rating' | 'Quantity' | 'Market/Fair Value (Rs. in Lacs)' | '% to Net Assets' | 'YIELD'.
Units: Rs. in Lacs; % column '% to Net Assets'.
Section rows: ' Equity & Equity related' (leading space), '(a)Listed / awaiting listing on Stock Exchanges', '(b)Unlisted', ' Money Market Instruments', '(a)Certificate of Deposit', '(b)Commercial Paper', '(c)Treasury Bills'; 'Sub Total' / 'Total' rows (label in col B, value cols F,G with NO ISIN); 'TREPS/Reverse Repo/Net Current Assets/Cash/Cash Equivalent' line (no ISIN); 'Grand Total' = 100; footnote '** Non Traded Security'; then 'Notes' block incl. NAV table with scheme codes. Yield cell is a string like '         7.23 %'. Company names have double spaces ('THE FEDERAL BANK  LIMITED').
Sum check (all numeric % rows excluding Sub Total/Total/Grand Total, includes the TREPS/NCA line): Flexi Cap 100.0 (equity sub-total 93.63 + CP 1.04 + TREPS/NCA 5.33); Large&Midcap 100.0 (equity 94.67).
Contradictions with plan: plan says "Only the exact `category` value ... needs one live confirmation" -> value is 884 (Monthly). Plan registry has no file_shape for Navi; true shape is MULTI_FILE_SINGLE_SCHEME (18 files; scheme name from API title / cell B5, sheet always 'Sheet1'). Plan lists no `response_json_path`; it is `data` with `url` per item. Navi's % column header is '% to Net Assets'.

## PGIM India — CONFIRMED-WITH-CHANGE (JSON API real, but different endpoint from the factsheet one; single POST, no nonce)
Landing (SPA, Angular): https://www.pgimindia.com/mutual-funds/disclosures/Portfolios/Monthly-Portfolio (my guessed Fund-Factsheet-style URL /forms-and-product-updates/Portfolio-Disclosure is 404 — the registry's endpoint should be the disclosure API, not /api/v1/brochure/published/form).
Discovery: Playwright network log (Chrome UA; default HeadlessChrome UA got 403 on the HTML pages only). Section catalogue: GET https://www.pgimindia.com/api/v1/brochure/disclosure/section -> data[].Sections[] with SectionName 'Monthly Portfolio' => SectionId "SECTION_747960037" (tabs: Equity 12, Debt 13, Fund of Funds 14, 'Prior to June 2021' 66).
Document list: POST https://www.pgimindia.com/api/v1/brochure/published/disclosure  Content-Type: application/json
  body {"headerId":2,"sectionId":"SECTION_747960037","source":"W","branchCode":null}
  -> {"resultInfo":{...},"data":[{"tabName":"Equity","tabId":..,"content":[{"title":"PGIM INDIA FLEXI CAP FUND Sep 2026","pdfPath":"https://www.pgimindia.com/api/v1/brochure/about-us/image/PGIM INDIA FLEXI CAP FUND Sep 2026.xlsx","dateMonthYear":"30 September 2026","date":"30","month":"September","year":"2026",...}]}]}
  JSON path: data[].content[].pdfPath (URL contains literal spaces — percent-encode; httpx does). ALL months returned in one call (Equity 676, Debt 603, FoF 184 entries; filter on month=='September' and year=='2026', or dateMonthYear). Sep 2026: 14 equity/hybrid + 8 debt + 3 FoF = 25 files. 'Prior to June 2021' tab has .xls/.xlsb/.xlsx — xlsb appears in old tabs (not current).
Proof: plain httpx.post with default python-httpx UA and no cookies -> 200; plain httpx.get of file URLs (default UA) -> 200 application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.
Files (unchanged): pgim-india-flexi-cap_asof_2026-09-30.xlsx (88,519 B), pgim-india-liquid_asof_2026-09-30.xlsx (78,871 B), pgim-india-global-real-estate-fof_asof_2026-09-30.xlsx (81,597 B).
Sheet convention: ONE short sheet per file ('Flexi Cap', 'Liquid', 'Real Estate') = not the scheme name verbatim; scheme name in A1 ('PGIM INDIA FLEXI CAP FUND').
Layout: A1 scheme name, A2 category description, riskometer rows, A11 'Portfolio Statement as on September 30,2026'; header row 12 (cols B..H): 'Name of  Instrument' (double space) | 'ISIN' | 'Industry/Rating' (debt files: 'Rating$') | 'Quantity' | 'Market/Fair Value  (INR Lacs)' (double space) | '%  to Net Assets' (double space) | '% Yield '.
Sections: 'Equity & Equity related', '(a)Listed / Awaiting listing on Stock Exchanges', '(b) Unlisted', 'Money Market Instruments', 'Treasury Bill', 'Margin Mutual Fund Units' (fund-unit line, margin), 'Treps / Reverse Repo', 'Net Receivables / (Payables)' (negative %), 'Sub Total'/'TOTAL'/'GRAND TOTAL' (100). FoF: 'Foreign Securities and/or Overseas ETFs' / 'International  Mutual Fund Units'. Debt: 'Debt Instruments', 'Certificate of Deposit', etc. 'NIL' text appears in value cells of empty subtotals. Notes block below (derivative exposure 'NIL', NAV table with datetime header cells).
Sum check: Flexi Cap numeric % rows excl sub/totals = 100.0 (equity 96.79 + TB 0.12 + margin MF 0.79 + TREPS 2.49 + NCA -0.19); Real Estate FoF 100.0; Liquid 100.0.
Contradictions: plan registry gives no endpoint; plan's note says the factsheet endpoint is "not a direct reuse candidate" – confirmed (true endpoint /api/v1/brochure/published/disclosure with POST body above). Plan says 'resultStatus/pdfPath fields' – matches (resultInfo.resultStatus, pdfPath). Plan says 'full history back to 2021' – true. Shape is MULTI_FILE_SINGLE_SCHEME (25 files), not one workbook.

## Bandhan — BLOCKED for automatic discovery (file itself is a plain public object; the listing that names it is an AES-encrypted API)
What I saw (Playwright, Chrome UA, one-time):
- Page https://bandhanmutual.com/downloads/portfolio-summary/monthly (React SPA; tabs Monthly/Weekly, year+month dropdowns). Shows ONE item for Sep 2026: "Bandhan Debt Fund Portfolio as on 30-09-2026" (debt schemes only; no equity/hybrid monthly file listed there — not verified whether equity/hybrid portfolios exist elsewhere on the site).
- The list comes from POST https://pnservices.bandhanmutual.com/internal/investorservices/encdec/investor/v1/dashboard/cms-call  headers `x-api-key: <static key embedded in the site's JS>`, `content-type: text/plain`; request body is an opaque base64url ciphertext (differs per call) and the response body is also opaque base64url ciphertext (text/plain). The path literally says "encdec". Decoding needs the site's AES key/scheme from its bundle -> that is "cracking an encrypted API" under the project rules, so I did NOT attempt it.
- Clicking the item triggers browser navigation GET https://bandhanmutual.com/investor/v1/dashboard/download-doc?filepath=<url-encoded GCS URL>&fname=<name> (no auth, no cookies needed).
  Example filepath: https://storage.googleapis.com/nonprod-static-assets-121to59kaawfgfi7bol/2026/10/0661c66e-bandhan-debt-fund-portfolio-as-on-30-09-2026.xlsx
Replay proof: plain curl GET of the proxy URL -> 200 xlsx 1,339,221 B; plain curl GET of the raw GCS URL -> 200, byte-identical (cmp equal), NO signature/expiry query params (so plan's "signs a time-limited GCS URL" is not what happens: the object is public, path = <year>/<month-of-upload-number>/<8-hex-hash>-bandhan-debt-fund-portfolio-as-on-DD-MM-YYYY.xlsx). The 8-hex hash prefix and the upload-month folder (here 2026/10 for a 30-09 file) cannot be guessed; bucket listing is denied to anonymous callers (HTTP 401 on storage.objects.list), so there is no replayable way to find the URL without decrypting cms-call.
What would be needed: either (a) the user's approval to implement the site's own AES transport (client-side key in public JS) like attribute 04's Mahindra resolver did, or (b) manual monthly download (stays a manual AMC), or (c) ask Bandhan for a direct feed. Verdict recorded: BLOCKED (not a CAPTCHA/WAF block - an encrypted-transport listing).
File (obtained via the browser-click URL, unchanged): bandhan-debt-funds_asof_2026-09-30.xlsx, 1,339,221 B (<2 MB so not trimmed). PK magic.
Layout: 24 sheets: scheme short codes/names ('Bandhan ON','Bandhan LF','Bandhan LDF','Bandhan MMF','Bandhan USTF','Bandhan DBF','Bandhan Medium to Long Term','Bandhan Medium Term Fund','Bandhan STP','Bandhan Banking & PSU','Bandhan CBF','Bandhan CRF','Bandhan Floating Fund','Bandhan Gilt Fund','Bandhan 10 Year CM Gilt Fund','Bandhan Long Term Fund','Bandhan CRISIL IBX June 2027','Bandhan CRISIL IBX April 2028','BANDHAN CRISIL IBX SDL APR 2032','BANDHAN CRISIL IBX SDL NOV 2026','BANDHAN CRISIL IBX SDL SEP 2027','Bandhan Index April 2032','BANDHAN CRISIL IBX Fin Serv3-6M','Disclaimers'). NOT scheme names; the real scheme name is in row 2 and the internal scheme code ('IDF001') in A1 beside 'Portfolio Statement as on September 30,2026'.
Header row 4 (cells B4..H4): 'Name of the Instrument' | 'ISIN' | 'Industry / Rating' | 'Quantity' | 'Market/Fair Value ( Rs. in Lacs)' | '% to NAV' | 'YTM'. Column A has NO header but holds the internal security code in data rows (A8='GOI3639', B8='5.74% GOI (MD 15/11/2026)', C=ISIN, D=rating, E=qty, F=value, G=% to NAV, H=YTM). Scheme name is B2, scheme code in A1 ('IDF001'), 'Portfolio Statement as on September 30,2026' in B1. Rows without ISIN (TREPS) have code in A, name in B, then value/%/yield.
Units: Rs. in Lacs; % to NAV is stored as a FRACTION formatted '0.00%' (0.0412 = 4.12%), not percent points. Sum of the column = 1.0 (not 100). Tiny weights are the TEXT '$' ("Less Than 0.01% of NAV"). YTM also fraction.
Sections: 'Debt Instruments', '(a) Listed / awaiting listing on Stock Exchange', '(b) Privately placed / Unlisted', 'Government Securities', 'Non Convertible Debentures', 'Money Market Instruments', 'Certificate of Deposit', 'Commercial Paper', 'Treasury Bill', 'TREPS / Reverse Repo Instrument' (row 'TRP_011026','Triparty Repo TRP_011026' has no ISIN), 'Corporate Debt Market Development Fund' (fund-unit line with ISIN INF0RQ622028, 'Class A2'), 'OTHERS' (Cash Margin - CCIL), 'Net Current Assets' (negative), 'Subtotal'/'Total'/'GRAND TOTAL'=1; footnotes '$  Less Than 0.01% of NAV', '** Thinly Traded/Non Traded Securities/Illiquid Securities'; last sheet 'Disclaimers'.
Sum check: Bandhan ON 1.0; Bandhan LF 1.0; Bandhan LDF 0.99999999999 (all numeric % rows excl totals, fraction units).
Contradictions with plan: (1) plan: "backend download-proxy that signs an underlying GCS URL ... issues a public, time-limited GCS URL to any caller (no login observed)" -> the proxy takes a GCS URL as input (it signs nothing), the GCS object is public & unsigned, and the document LIST is the encrypted cms-call: cannot be replayed without decrypting. Plan registry says JSON_API: not true; it's not a plain JSON API. (2) Plan implies all schemes; the monthly page listed only the DEBT workbook for Sep 2026.

## Jio BlackRock — CONFIRMED-WITH-CHANGE (Next.js server action, but the PORTFOLIO page has its own slug; plain curl works; CDN link is an opaque id, not a name template)
Page: https://www.jioblackrockamc.com/statutory-disclosure/disclosures/monthly-portfolio-disclosure   (NOT under /fund-documents/ like the factsheet; the section index https://www.jioblackrockamc.com/statutory-disclosure/disclosures lists ad-hoc-, daily-, fortnightly-, monthly-, half-yearly-portfolio-disclosure slugs.)
Request (discovered with Playwright network log; replayed with curl, no browser, no cookies):
  POST https://www.jioblackrockamc.com/statutory-disclosure/disclosures/monthly-portfolio-disclosure
  headers: `Next-Action: 705bdd1994b82409c4f44c64a077cd477327752135`, `Content-Type: text/plain;charset=UTF-8`, `Accept: text/x-component`  (Chrome UA used; no x-deployment-id or router-state-tree header was needed)
  body (JSON text): ["monthly-portfolio-disclosure",{"year":"FI2026-2027","month":"September","date":"$undefined"},"MF"]
  (year = fiscal-year token 'FI<YYYY>-<YYYY>' Apr-Mar; month = full English name)
  Response: HTTP 200 RSC flight text. Line `0:{"a":"$@1",...}` then line `1:{"data":[{"id":6221,"title":"JioBlackRock Arbitrage Fund-Monthly-Portfolio-30-09-2026","docType":"file","year":"FI2026-2027","month":"September","date":"2026-10-09","uid":"...","file":{"url":"https://cdnstorage-ddh3hqhvg3gyedd9.a02.azurefd.net/brcms/jioblackro-mv0kd9he-62d1e1.xlsx","ext":".xlsx"}},...],"meta":{"pagination":{"page":1,"pageSize":100,"pageCount":1,"total":16}}}`  -> parse the line starting `1:` as JSON; path `data[].file.url`.
  The Next-Action id (a hash of the server function) changes when the site redeploys (same caveat as attribute 04's Jio resolver, which rediscovers it dynamically from the page JS) -> production must scrape it from the page bundle, not hard-code it. NEEDS: not verified how it is best discovered (attribute 04's code already does this).
  October query returns "No documents found" (not yet published at capture time); September 2026 returns 16 documents published 2026-10-09: 15 per-scheme files + ONE all-schemes workbook titled 'JioBlackRock Mutual Fund-Monthly-Portfolio-30-09-2026'.
CDN link pattern: https://cdnstorage-ddh3hqhvg3gyedd9.a02.azurefd.net/brcms/jioblackro-<8-char base36>-<6-hex>.xlsx  — opaque, NOT derivable from scheme/date; must come from the action response. Azure Front Door, anonymous GET 200 (httpx, default UA).
Proof of replay: curl POST above -> 200 + 16 docs; httpx GET of 3 CDN URLs -> 200 application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.
Files (unchanged): jio-blackrock-all-schemes_asof_2026-09-30.xlsx (539,832 B, 16 sheets: 'Index' + 15 scheme sheets), jio-blackrock-flexi-cap_asof_2026-09-30.xlsx (129,054 B), jio-blackrock-arbitrage_asof_2026-09-30.xlsx (125,243 B). The per-scheme files are one-sheet versions of the sheets in the all-schemes file. Recommend the all-schemes file as the one to fetch (single workbook, Index sheet gives code -> scheme name).
Sheet convention: Index sheet columns 'Sr No.' | 'Short Name' | 'Scheme Name' (e.g. 'JBFLEXI' -> 'JioBlackRock Flexi Cap Fund'); other sheets named by SHORT CODE (NIFTYJBLK, JBLARGE, JBMMF, JBOF, JBLF, JBN8-13, JBLOW, JBSHORT, JBN50, JBNNX50, JBNM150, JBNS250, JBFLEXI, JBARB, JBSECRO). Per-scheme file's single sheet is also the short code.
Layout: column A EMPTY; data in B..H. Row 1 B1 scheme name; row 2 '-'; row 3 'Monthly Portfolio Statement as on September 30, 2026'; header row 4: 'Name of the Instrument ' (trailing space) | 'ISIN' | 'Industry Classification' (Arbitrage: 'Industry Classification / Rating') | 'Quantity' | 'Market/Fair Value\n (Rs. in Lakhs)' (embedded newline) | '% to Net\n Assets' (embedded newline) | 'Yield to Maturity ' (trailing space).
Units: Rs. in LAKHS ('Lakhs' not 'Lacs' — differs from Navi/PGIM spelling); % to Net Assets in percent points (5.896 = 5.9%), unrounded floats.
Sections: 'Equity & Equity related', '(a) Listed / awaiting listing on Stock Exchanges', '(b) Unlisted ' (trailing space), 'Sub Total', 'Total', 'Grand Total' = 100, 'Money Market Instruments', 'Certificate of Deposit', 'Mutual Fund Units' (fund-unit lines, ISIN INF..., no rating), 'TREPS' (value in col with extra trailing yield), 'Margin on Derivatives', 'Net Receivables / (Payables)' (negative). Footnote '* Less Than 0.01% of Net Asset Value'. Then Notes, risk-o-meter blocks.
PARSER TRAPS found: (1) Derivatives are a SECOND table AFTER 'Grand Total' with its own header ('Name of the Instrument ' | 'Long / Short' | 'Industry Classification' | 'Quantity' | 'Market/Fair Value (Rs. in Lakhs)' | '% to Net Assets ' — the ISIN column is replaced by Long/Short, so columns are not the same) e.g. 'VOLTAS LTD FUT 27-OCT-26','Short',...,-375,-4.04,-0.0072; NIFTY 27-OCT-26 FUT, Long. (2) In the Arbitrage sheet the 'Money Market Instruments' SECTION HEADER row itself carries numbers (41363.55, 74.08 — a copy of the equity subtotal); naive summing double-counts it (my naive sum gave 174.08; excluding that header row gives 100). (3) Longer-than-needed trailing spaces / newlines in header labels.
Sum check (rows before 'Grand Total', excluding sub-total/total lines and numeric section header): JBFLEXI 100.0 (equity 99.04 + NCA), JBLARGE 100.0, JBLF 100.0, JBARB 100.0 after excluding the numeric header row (equity 74.08 + CD 8.77 + MF units 13.99 + TREPS 4.94 + NCA -1.79). Derivative table % are small +/- numbers and are NOT part of the 100.
Contradictions with plan: plan note says "the combobox is a discovery mechanism, not an API ... the real file is a direct static CDN link once its naming convention is known ... (scheme-name/date substitution, most likely)". FALSE: CDN filenames are opaque ids (jioblackro-mv0kmyqm-328617.xlsx) with no scheme/date; the file URLs come only from the Next server-action POST (so it is a JSON_API-style call, not STATIC_REGEX). The plan's registry entry says kind=STATIC_REGEX with no endpoint; true mechanism = Next.js server action on /statutory-disclosure/disclosures/monthly-portfolio-disclosure (the same action family attribute 04 uses for factsheets but different slug/path + category arg 'monthly-portfolio-disclosure'; the earlier registry draft's hypothesis (same action, different category arg) was essentially right). Also the plan implies per-scheme files; in fact an all-schemes workbook (Index + 15 sheets) is published alongside.

## Unifi (Unifi Mutual Fund) — CONFIRMED-WITH-CHANGE (plain static links in the server HTML; link pattern captured; plan's "Scheme Dashboard" caveat was a wrong-document trap, real file is 'MP-Unifi-...')
Request chain: single GET https://unifimf.com/statutorydocuments/  (200, 578 KB static HTML, Chrome UA; no JS needed — the page does load a reCAPTCHA script but the file links are in the raw HTML; I did not need or solve it). Then GET each file URL.
Link regex on the raw HTML: `https://unifimf\.com/wp-content/uploads/fund-sheets/MP-Unifi-[A-Za-z0-9-]+-(\d{2})(\d{2})(\d{4})\.xlsx?` where the trailing DDMMYYYY is the as-of date, e.g. .../MP-Unifi-Flexi-Cap-Fund-30092026.xlsx, .../MP-Unifi-Liquid-Fund-30092026.xlsx, .../MP-Unifi-Dynamic-Asset-Allocation-Fund-30092026.xlsx. Month history is listed on the same page (31102025, 30112025, 31012026 ... 31082026, 30092026). THREE schemes only (Flexi Cap, Liquid, Dynamic Asset Allocation). Extension varies by month: Liquid Sep-2026 is .xlsx but most earlier Liquid files are .xls -> regex must allow xls|xlsx and parser must handle both.
Do NOT confuse with: 'Unifi-Flexi-Cap-Fund-30092025-Monthly.xlsx' (Sep 2025), 'Monthly-Portfolio-April-25.xlsx', 'Scheme-Dashboard_*.xlsx', 'FN-Unifi-Liquid-Fund-DDMMYYYY.xls' (fortnightly) and 'Notice_Monthly-portfolio*.pdf' (a one-page notice; the 'September 2026' row of the page's Monthly Portfolio table links to this PDF notice, NOT a workbook — I read it: it only says the monthly portfolio is hosted on unifimf.com/amfiindia.com, dated 8 Oct 2026). Month label on the page does not point to the workbook, so the filename regex above is the discovery path.
Proof of replay: curl GET of the page (no cookies) returned the links; curl GET of 3 file URLs -> 200 application/vnd.openxmlformats-officedocument.spreadsheetml.sheet with PK magic. Playwright was only used to confirm the visible 'Monthly Portfolio' table rows; links were already in static HTML.
Files (unchanged): unifi-flexi-cap_asof_2026-09-30.xlsx (39,330 B), unifi-liquid_asof_2026-09-30.xlsx (58,170 B), unifi-dynamic-asset-allocation_asof_2026-09-30.xlsx (133,114 B).
Sheet convention: scheme name as sheet name with trailing space on DAAF ('Unifi Dynamic Asset Allocation '), 'Unifi Flexi Cap Fund', 'Unifi Liquid Fund'; DAAF has a second sheet 'Missing ISIN' (header 'ISIN' | 'CRISIL / ICRA', empty).
Layout: column A starts the data (no blank lead column). Row 1 'Unifi Mutual Fund'; row 2 scheme name + category in one cell with newline; row 3 'Monthly Portfolio Statement as on September 30, 2026' (Liquid has an extra blank row so header is row 5, others row 4).
Header: 'Name of Instrument' | 'ISIN' | 'Rating/Industry' | 'Quantity' | 'Market Value (In Rs. lakh)' | '% To Net Assets' | 'Yield to Maturity (YTM)' | (Flexi: 'Yield to call (YTC)^^').
Units: Rs. LAKH (singular 'lakh'); % To Net Assets stored as FRACTION (0.0465 = 4.65%); sum of the column = 1.0 (not 100).
Sections: 'Equity & Equity related', 'a) Listed / awaiting listing on Stock Exchanges' (no leading parenthesis on 'a)'), '(b) UNLISTED', 'Preference Shares', 'Debt Instruments', 'Govt Securities / SDL', 'Non Convertible Debentures', 'Securitised Debt', 'Money Market Instruments', 'Commercial Papers', 'Tri Party Repo (TREPs)', 'Others' (Share Application Money Pending Allotment, Margin Money for Derivatives/ Treps, Net Current Assets), 'Subtotal' / 'Total' / 'GRAND TOTAL'; empty sections show the TEXT 'NIL' in value cells ('Subtotal','NIL','NIL'). Instrument names have a LEADING SPACE (' HDFC Bank Limited'). A trailing '#' in a later column marks 'Securities earmarked for Derivative Margin'.
Derivatives/fund units: DAAF has a 'DERIVATIVE' block AFTER 'GRAND TOTAL' (negative weights; Subtotal -0.3344 = -33.44%) and a detailed futures table ('Underlying','Series','Long / Short','Futures Price when purchased','Current price of the contract','Margin maintained in Rs. Lakhs'); no fund-unit lines seen in these three.
Sum check (rows before GRAND TOTAL excluding Subtotal/Total): Flexi 1.0 (59 holding rows; equity 98.2%), DAAF 0.9999999999999999 (398 numeric rows incl. derivative-hedged equity; derivative block excluded); Liquid 1.0 (4 holding rows with ISIN; rest TREPS etc).
Contradictions with plan: plan says "Unifi ... static regex too narrow ... NEEDS LIVE VERIFICATION: confirm the real link_pattern" -> link_pattern is `MP-Unifi-.*-\d{8}\.xlsx?` (above); registry has no file_shape — true shape is MULTI_FILE_SINGLE_SCHEME (3 files), and the % column is a fraction (not percent points) so a global 90-101% band check fails for Unifi (and Bandhan) unless the parser scales fractions. Plan says Unifi's per-scheme file is a 'Monthly Portfolio Statement file': confirmed (title row says so).

## Zerodha (Zerodha Fund House) — CONFIRMED-WITH-CHANGE (the links ARE in the raw HTML — inside the Next.js payload JSON — contradicting the spike's "only reachable via the rendered page")
Request chain (plain curl/httpx, Chrome UA, no cookies): 
1. GET https://www.zerodhafundhouse.com/resources/disclosures/  -> HTTP 308 redirect to /resources/disclosures (no trailing slash); follow redirects (curl -L / httpx follow_redirects=True). Final 200, 729 KB HTML (Next.js app-router; ~54 KB-scale RSC data embedded in <script> tags).
2. In the raw HTML the document list is embedded as JSON objects: {"id":"<uuid>","name":"ZARBI - Monthly Portfolio September 2026","url":"https://assets.zerodhafundhouse.com/statutory-reports/portfolio-disclosures/ZARBI - Monthly Portfolio September 2026.xlsx","modTs":"2026-10-09T09:39:25Z"}. Regex that matched on the plain HTML: `https://assets\.zerodhafundhouse\.com/statutory-reports/portfolio-disclosures/[^"\\]*?Monthly Portfolio September 2026\.xlsx` -> 23 distinct URLs (generic: `...portfolio-disclosures/[^"\\]*Monthly Portfolio <Month> <YYYY>\.xlsx`). URLs contain literal spaces (percent-encode when fetching; httpx does it). The same folder also has 'Fortnightly Portfolio 15/30 September 2026' files (ZLIQD, ZLTGC, ZNSDG, ZOVER) — must be excluded by the 'Monthly Portfolio' match — and older 'Half Yearly'/'Quarterly Portfolio' files (other-disclosures folder).
3. GET each file URL on assets.zerodhafundhouse.com (anonymous, 200, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet).
Filenames are inconsistent: '<CODE> - Monthly Portfolio <Month> <YYYY>.xlsx' versus '<CODE>- Monthly Portfolio ...' (no space before dash on ZE100-, ZE150-, ZEN50-, ZESML-) and older files 'Monthly Portfolio - December 2023.xlsx' (reverse order); and 'Aug 2025' abbreviations in older months (e.g. 'ZE100- Monthly Portfolio Aug 2025.xlsx') — so the regex must be tolerant, and month text varies ('Aug' vs 'August').
Proof: curl of the page + regex produced 23 URLs; httpx.get of 4 of them returned 200 + PK magic. Rendered-page/Playwright was not needed for this AMC.
Sep-2026 file codes seen: ZARBI, ZBSEN, ZE100, ZE150, ZELSS, ZEN50, ZESML, ZGFOF, ZGOLD, ZLC31, ZLC36, ZLC41, ZLIQD, ZLTGC, ZMIDS, ZMLTI, ZN250, ZNFTY, ZNH73, ZNSDG, ZOVER, ZSFOF, ZSLVR (23).
Files (unchanged): zerodha-arbitrage_asof_2026-09-30.xlsx (175,072 B), zerodha-nifty100-etf_asof_2026-09-30.xlsx (133,809 B), zerodha-liquid-etf_asof_2026-09-30.xlsx (134,453 B). Also downloaded (not saved): ZGFOF (133,925 B) — gold ETF FoF, one holding 'ZERODHA GOLD ETF' with % 1.0018 (i.e. >100% because Net Receivable is negative).
Sheet convention: ONE sheet per file named by scheme code ('ZARBI','ZE100','ZLIQD','ZGFOF'); scheme name is only in row 2 text: 'MONTHLY PORTFOLIO STATEMENT OF ZERODHA ARBITRAGE FUND FOR SEPTEMBER 2026' (name embedded after 'OF', before ' FOR <MONTH> <YYYY>'); A1 'ZERODHA MUTUAL FUND'.
Header row 4 in COLUMNS C..I (columns A and B empty): 'Name of the Instrument' | 'ISIN' | 'Rating / Industry^' (ZLIQD: 'Rating / Industry') | 'Quantity' | 'Market value\n(Rs. in Lakhs)' | '% to NAV' | 'YTM %'.
Units: Rs. in LAKHS; % to NAV stored as FRACTION rounded to 4 d.p. (0.0818 = 8.18%); sum ~1.0 (not 100).
Sections: 'EQUITY & EQUITY RELATED', 'a) Listed/awaiting listing on Stock Exchanges', 'b) Unlisted', 'c) Foreign Securities and /or overseas ETF', 'DEBT INSTRUMENTS', 'd) Central Government Securities', 'e) State Government Securities', 'Futures' (arbitrage), 'Money Market Instruments', 'Treasury Bills', 'Mutual Fund Units', 'OTHERS' / 'Exchange Traded Funds', 'TREPS / Reverse Repo Investments' (a row with code '110210100' + name), 'Other Current Assets / (Liabilities)' -> 'Net Receivable / Payable' (can be negative), 'Total' / 'Sub Total' / 'GRAND TOTAL (AUM)' = 1; then Notes, NAV table ('As on 30 Sept 2026' / 'As on 31 Aug 2026'), derivatives disclosure, risk-o-meter pictures. YTM may be a string like '5.3 %'.
PARSER TRAPS: (1) In the Arbitrage file the 'Futures' block (negative qty/MV/%: e.g. 'Oberoi Realty Limited 27/10/2026', ISIN blank, qty -350, % -0.0013) sits INSIDE the main table before 'GRAND TOTAL', with a Total of -0.6887, but it is a memo: the Grand Total (4672.2 lakh) = equity 3199.05 + T-bills 475 + MF units 601.6 + TREPS 720 - NCA 323.4. Percent sum excluding futures: 0.6847+0.1017+0.1288+0.1541-0.0693 = 1.0. Including futures it is 0.31. A parser must exclude the 'Futures' section from the 90-101% check. (2) In ZLIQD the T-Bill 'Sub Total' (5400 / 0.0051) repeats only the first T-bill row (two rows listed, both 0.0051): sub-total rows can be wrong; my sum excluding sub-totals 1.0051 vs Grand Total 1. (3) Column offset (A,B blank). (4) Some rows have the code in the name column (TREPS) and the value in later columns.
Sum check: ZE100 (excl. totals) 0.9998; ZARBI 1.0 excluding the Futures block (see above); ZLIQD 1.0051 (see trap 2).
Contradictions with plan: plan says "a real September 2026 monthly file exists but isn't in the static HTML -- only reachable via the rendered page ... the file is very likely a sibling static link on the same page" -> the links ARE in the server-rendered HTML (as JSON in the Next payload, with unescaped quotes), reachable with plain GET after following the 308; 23 per-scheme files, not one. Registry has landing_url with trailing slash (/resources/disclosures/) which 308-redirects — the client must follow redirects. Plan implies a single file; true shape is MULTI_FILE_SINGLE_SCHEME.

## Abakkus (Abakkus Mutual Fund) — CONFIRMED-WITH-CHANGE (no AJAX and no predictable filename: the selects filter a JSON blob embedded in the page HTML; file name has an arbitrary stem + 10-hex hash)
Request chain (plain curl, no cookies, no browser; I never needed Playwright for this site):
1. GET https://www.abakkusmf.com/statutory-disclosures.html (200, 636 KB static HTML; UA Chrome string).
2. Extract `<script id="verticals-data" type="application/json">(.*?)</script>` (regex, DOTALL) and json.loads it. It is a list of 34 'verticals'; take the one with title "Monthly Portfolio Disclosures" (subTitle "Monthly Portfolio Disclosure"): vertical.sections[].subSections[].items[] with item.title = "September 30, 2026" and item.downloadMedia.url = "/uploads/Final_Monthly_Portolio_Sep30_2026_fd59e57829.xlsx" (typo 'Portolio' is in the real name; ext varies: earlier months are .xls). JSON path: [title=="Monthly Portfolio Disclosures"].sections[].subSections[].items[] -> match item.title (e.g. "September 30, 2026") -> .downloadMedia.url ; file extension in .downloadMedia.ext; downloadUrl is null. (The page's own JS builds <a href=downloadUrl || downloadMedia.url> — I read that code in the HTML; the #mpdYear/#mpdMonth selects only re-filter this in-memory array, there is NO network call when you pick year/month.)
3. GET https://www.abakkusmf.com + url (host-relative path) -> 200, Content-Type application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, 262,012 B, Last-Modified Thu, 08 Oct 2026. Server is IIS-style (ETag, Accept-Ranges).
Months listed in the page: April 30 2026 .. September 30 2026 (FY 2026-27 sub-section) plus Dec 31 2025 .. March 31 2026; mid-month 'Flexi Cap 15 Jan 2026' also appears. Filenames are not templatable: IN_MF_MONTHLY_PORTFOLIO_April_30_2026_<hash>.xls, Abakkus_Mutual_Fund_31_05_2026_<hash>.xls, Monthly_Portfolio_Jun26_30_Jun_<hash>.xls, Final_Monthly_Portfolio_Jul_31_<hash>.xls, Portfolio_Aug31_Monthly_<hash>.xls, Final_Monthly_Portolio_Sep30_2026_<hash>.xlsx. Therefore a link regex is NOT enough; the JSON blob lookup is required (or title text 'Month DD, YYYY').
Proof of replay: curl (no cookies) of the page and the file; PK magic; opened with openpyxl.
File (unchanged): abakkus-all-schemes_asof_2026-09-30.xlsx (262,012 B, not trimmed).
Sheet convention: 5 sheets: 'Index' ('Sr No.' | 'Short Name' | 'Scheme Name' -> ABAFC Abakkus Flexi Cap Fund; ABALI Abakkus Liquid Fund; ABALM Abakkus Large & Mid cap Fund; ABASC Abakkus Small Cap Fund) + one sheet per scheme named by SHORT CODE (ABAFC, ABALI, ABALM, ABASC). Same vendor template as Jio BlackRock and Bandhan.
Layout: row 1: A=short code, B='Abakkus Mutual Fund'; row 2 scheme name; row 3 'Monthly Portfolio Statement as on September 30, 2026'; header row 5 in columns B..I: 'Name of the Instrument' | 'ISIN' | 'Industry* / Rating' (ABALI: 'Rating'; ABALM: 'Industry*') | 'Quantity' | 'Market/Fair Value (Rs. in Lakhs)' | '% to Net Assets' | 'YTM' | 'YTC'. Data rows: column A = internal security code (IBCL05, GOI3639, unheaded), B name, C ISIN, D industry/rating, E qty, F value, G %, H YTM, I YTC.
Units: Rs. in LAKHS; % to Net Assets in PERCENT POINTS (4.97 = 4.97%), rounded 2 d.p.
Sections: 'Equity & Equity related', '(a) Listed / awaiting listing on Stock Exchanges', '(b) Unlisted' (value cells literal 'Nil'), 'Debt Instruments', 'Money Market Instruments', 'Certificate of Deposit', 'Commercial Paper', 'Treasury Bill/Cash Management Bill', 'TREPS / Reverse Repo' (rows without ISIN), 'Net Receivables / (Payables)' (negative), 'Sub Total' / 'Total' / 'GRAND TOTAL'=100; footnotes '* Industry Classification...', '** non-traded', '^ YTC ...'; Notes (1)-(16) with NAV table. No derivative or fund-unit lines in these four schemes (note (5) 'derivative instruments ... Nil').
Sum check (rows with % excluding Sub Total/Total/Grand Total, incl. TREPS and NCA): ABAFC 100.0 (equity 94.08 + CD 0.06 + CP 0.13 + TREPS 6.1 - 0.37 NCA...), ABALI 99.99999999999999, ABALM 100.00000000000001.
Contradictions with plan: plan says "cascading #mpdYear/#mpdMonth selects ... very likely populate a predictable static URL (same pattern as Union's DETERMINISTIC_TEMPLATE)" -> FALSE: no predictable pattern (arbitrary stems and a 10-hex hash suffix); and not AJAX either — the selects read an embedded JSON <script id="verticals-data">. kind=STATIC_REGEX with a link_pattern does not work (the links are not in the HTML as <a href>); needs a small JSON-extract resolver. Plan's file_shape SINGLE_WORKBOOK_MULTI_SHEET is correct ('Index sheet + 4 per-scheme sheets' confirmed).

## quant (quant Mutual Fund) — CONFIRMED-WITH-CHANGE (plain ASP.NET page-method POSTs, no browser/cookies; the widget is NOT on /downloads/factsheet but on /statutory-disclosures; two document families: AMC-wide workbook and per-fund files)
Page: https://quantmutual.com/statutory-disclosures (the registry's landing_url https://quantmutual.com/downloads/factsheet is the FACTSHEET page and has no submit_event widget; the portfolio widget lives on /statutory-disclosures, HTTP 200, 121 KB). Its inline jQuery defines submit_event(id,cat) / submit_event1(id,cat) / submit_event2(id,cat,tab), each an $.ajax POST of a JSON string to an ASP.NET page method; the result `.d` is an HTML string that the page drops into a div (#<cat> or #files).
Requests (all `Content-Type: application/json; charset=utf-8`, Chrome UA, no cookies, no antiforgery token; replayed with curl):
 A) AMC-wide workbook (accordion 'MONTHLY PORTFOLIO', li onclick=submit_event(year,'MONTHLY PORTFOLIO')):
    POST https://quantmutual.com/statutorydisclosures.aspx/displaydisclouser   body `{id:'2026',cat:'MONTHLY PORTFOLIO'}` (note: single-quoted pseudo-JSON string exactly as the page sends it)
    -> {"d":"<ul><li>&#9658;<a href='/Admin/disclouser/Monthly_portfolio_sept_30092026.xlsx' target='_blank'>September 2026</a></li><li>...August 2026...</li>...</ul>"}
    Link regex on `.d`: `href='(/Admin/disclouser/[^']+\.xlsx?)'[^>]*>\s*September 2026<` (label text is '<Month> <YYYY>'; filename stems are irregular: Monthly_portfolio_sept_30092026.xlsx, Monthly_Portfolio_31082026.xlsx, Monthly_Portfolio_July26.xlsx, monthly_portfolio_june_30062026.xlsx, Monthly_Portfolio_May26.xlsx, ...). 
 B) Per-fund files (accordion 'MONTHLY PORTFOLIO - FUND - WISE', li onclick=submit_event1(year,cat) then submit_event2(monthNo,cat,year)):
    POST .../statutorydisclosures.aspx/displaydisclouser1 body `{id:'2026',cat:'MONTHLY PORTFOLIO - FUND - WISE'}` -> list of month <li>s with ids 1..9 (Jan..Sep; id = month number);
    POST .../statutorydisclosures.aspx/displaydisclouser2 body `{id:'9',cat:'MONTHLY PORTFOLIO - FUND - WISE',tab:'2026'}` -> `.d` = <ul> of <a href='/Admin/disclouser/quant_Flexi_Cap_Fund_30_Sep_2026.xlsx'>quant Flexi cap Fund</a>... (31 links; names like quant_<Fund_Name>_30_Sep_2026.xlsx with irregular variants 'quant_Value_Fund_30-Sep-2026.xlsx', 'quant_Manufacturing_Fund_30-Sep_2026.xlsx').
 Files: GET https://quantmutual.com/Admin/disclouser/<name> -> 200 application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, no auth.
Proof of replay: all 3 POSTs and 3 file GETs done with plain curl (no browser, no cookies) -> 200. Playwright was not needed beyond reading the page source.
Files (unchanged): quant-all-schemes_asof_2026-09-30.xlsx (1,143,508 B; not trimmed, <2 MB; 31 sheets), quant-flexi-cap_asof_2026-09-30.xlsx (114,149 B), quant-arbitrage_asof_2026-09-30.xlsx (125,174 B).
Sheet convention: AMC-wide workbook: 31 sheets named by INTERNAL SHORT CODES with NO Index sheet (qMES, qMHC, qIF, qMON, qMQM, qMBC, qESG, qMIA, qFF, qMCF, qMTK, qMAB, qMDA, qMGG, qMAF, 'qL&MF', qMMF, qTP, qMBS, qMCN, qSCF, qMLC, qActive, qMPU, qAF, qMMO, qMSE, qVF, qMCO, qLF, qFLEXI); scheme name is in cell C2 (e.g. qMAB -> 'quant Arbitrage Fund', qTP -> 'quant ELSS Tax Saver Fund', qMSE -> 'quant Silver ETF', qMIA -> 'quant Income Plus Arbitrage Active FOF'). Per-fund files: one sheet named like the file ('quant_Flexi_Cap_Fund').
Layout: A1 'quant Mutual Fund'; row 2 scheme name; row 3 category description; row 4 'MONTHLY PORTFOLIO STATEMENT AS ON 30 Sep 2026'; header row 8: 'SR' | 'ISIN' | 'NAME OF THE INSTRUMENT' | 'RATING' | 'INDUSTRY' | 'QUANTITY' | 'MARKET VALUE(Rs.in Lakhs)' | '% to NAV' | 'YTM' (note: ISIN comes BEFORE the name, with a leading serial column 'SR'; names are in upper-case headers). Hedged schemes (Arbitrage qMAB, Equity Savings qMES) have header 'SR','ISIN','NAME OF THE INSTRUMENT',<blank>,'INDUSTRY','QUANTITY','MARKET VALUE(Rs.in Lakhs)','% to NAV','YTM','Hedged Quantity','Hedged % to NAV' (the RATING header cell is blank but column D exists) — two different column layouts across the same workbook.
Units: Rs. in LAKHS ('Rs.in Lakhs' with no space); '% to NAV' in percent points (9.284033 = 9.28%), 6 d.p.; ratings column 'N.A.'; YTM '-' text for equities.
Sections: 'EQUITY & EQUITY RELATED', '(a) Listed / awaiting listing on Stock Exchanges', '(b) Unlisted', '(c) REIT', 'DERIVATIVES' with '(a) Index / Stock Futures', '(b) Index / Stock Options', 'Exchange Traded Commodity Derivatives', '(c) Commodity Futures', '(d) Commodity Option'; 'DEBT INSTRUMENTS' ('(a) Listed / awaited listed on Stock Exchanges', '(b) Unlisted / Privately Placed', '(c) Securitised Debt Instruments'); 'MONEY MARKET INSTRUMENTS' ('a) Commercial Paper','b) CD-Certificate of Deposits','c) Treasury Bills','d) Units of an Alternative Investment Fund (AIF)'); 'FIXED DEPOSITS'; 'OTHERS' ('(a) Mutual Fund Unit' [fund-unit lines], '(b) Tri Party Repo (TREPs)', '(c) Units of Infrastructure Investment Trust', '(d) Other Receivables (Payables)' -> row 'NCA-NET CURRENT ASSETS' negative); 'Sub Total', 'Total', 'Grand Total'=100; then 'Disclosure for investment in derivative instruments' blocks, NAV table, etc.
PARSER TRAPS: (1) DERIVATIVES (futures) are inside the main table. For most schemes the futures are PART of the 100% (Flexi: equity 72.55 + futures 15.46 + money market 3.74 + Others 8.26 = 100.0; Grand Total 730,934.71 lakh = 530,258.70 + 113,013.76 + 27,302.93 + 60,359.32), but for the hedged schemes (Arbitrage) the futures block is NEGATIVE (-76.70%) and NOT part of the Grand Total (Arbitrage: equity 76.45 + money market 21.30 + Others 2.25 = 100.0; GT 100,709.77 = 76,991.14 + 21,447.81 + 2,270.83). So summing section rows to 90-101% is wrong for hedged funds unless derivatives are excluded by scheme type; reconcile to the 'Grand Total' row instead. (2) The two hedged sheets (qMES, qMAB; also the per-fund Arbitrage file) carry DUPLICATED rows near the end: TREPS row twice (SR 202 and 203 identical), NCA twice (SR 204/205), '(d) Other Receivables' header twice, 'Sub Total'/'Total'/'Grand Total' each twice (2 'Grand Total' rows found in qMES and qMAB only) — a naive sum double counts TREPS/NCA. (3) Two column layouts (with and without a populated RATING column; hedged sheets add 2 columns). (4) 'quant Income Plus Arbitrage Active FOF' (qMIA) and 'quant Silver ETF' (qMSE) are present here.
Sum check: Flexi (numbered holding rows incl. derivatives, % col H) 99.999998; Arbitrage numbered rows naive sum is meaningless (25.55, includes the -76.70 futures and duplicates) — reconciled via Grand Total as above. Healthcare sheet (qMHC) 99.99999999999999 (equity 67.30 + futures 32.11 + ...). Not computed for the other 28 sheets.
Contradictions with plan: plan says "<li onclick=submit_event1/2(...)> widget ... drives an AJAX call that populates a #files div with the real link ... very likely resolves to a static link" and registry landing_url=https://quantmutual.com/downloads/factsheet, kind=STATIC_REGEX -> the widget is on /statutory-disclosures (not the factsheet page), the call is an ASP.NET page-method POST returning an HTML string, and the plain-HTML page contains no portfolio link, so STATIC_REGEX over the landing page cannot work (needs a small JSON-POST resolver like Navi/PGIM). There is ALSO an AMC-wide combined monthly workbook (via submit_event, not submit_event1/2) in addition to the per-fund files the plan describes.

---
## Group C2
# Group C2 capture findings (2026-10-13)

Target month-end 2026-09-30: published for every AMC below except Choice (see Choice). All replays below were proven with plain httpx or curl. Playwright was used only for one-time discovery. Fixtures are in `backend/tests/fixtures/portfolio_disclosures/`.

Cross-cutting parser facts:
- The unit of the % column differs between AMCs, and inside Choice between files.
  - Fraction (1.0 = 100%): Sundaram, ICICI, Bajaj, WhiteOak, Choice `.xlsx`.
  - Percent points: Tata, UTI, Choice Gold ETF `.xls`.
  - Normalize per file. Do not assume a scale per AMC.
- Magic bytes beat extensions. Bajaj serves a real XLSX under a `.xls` name with content-type `application/vnd.ms-excel`. openpyxl refuses it by extension and only works from BytesIO.
- Subtotal and total rows carry no ISIN. Real positions are the rows with an `^IN[A-Z0-9]{10}$` cell. Choice Gold uses `IDIA00500001`-style pseudo-ISINs, and TREPS/repo/derivative rows have no ISIN.
- Derivative lines have negative quantity and negative value (Sundaram, Bajaj, WhiteOak).
- The sum of the % column over ISIN rows is about 86-98%. The remainder is cash and net current assets plus ISIN-less lines (repo/TREPS and derivatives).

---
## 1. Tata Mutual Fund
**Verdict: CONFIRMED-WITH-CHANGE.** The mechanism is static SSR HTML, not a JSON API call.

Request chain (2 hops, plain HTTP):
1. `GET https://www.tatamutualfund.com/schemes-related/portfolio` returns 200 and ~370 KB of HTML.
   - Playwright showed NO XHR to the CMS on this page. The data is embedded in the Next.js flight payload.
   - Default httpx UA and a browser UA both work.
2. In the HTML, regex over the backslash-escaped JSON:
   `field_document_title\\":\\"(Portfolio as on [^"\\]*?)\s*\\",\\"field_media_document\\":\\"(https://[^"\\]+)`
   - 197 rows came back: monthly, plus weekly/fortnightly.
   - Pick the row whose title matches `Portfolio as on 30th September, 2026`.
   - Select on the `Monthly%20Portfolio` filename. Fortnightly/weekly rows share this pattern.
3. `GET https://betacms.tatamutualfund.com/system/files/2026-10/Monthly%20Portfolio%20as%20on%2030th%20September%202026.xlsx`.
   - Returns 302 to `https://www.tatamutualfund.com/system/files/2026-10/...xlsx`, so follow redirects.
   - Returns 200, content-type spreadsheetml, 1,788,845 bytes. Default httpx UA works.

Path facts:
- The `YYYY-MM` folder is the upload month, one month after the as-of month.
- Filenames are inconsistent: `...30th%20April%202026%20%281%29.xlsx`, `...%20-%2031st%20January%202025.xls`. Never construct the URL, always read it from the page.

Proof:
- httpx on the page returned 200. Page and file were fetched with the default `python-httpx` UA.
- The file's sha equals the curl download.

Plan contradictions:
- Plan: "kind=JSON_API ... sibling content-type slug (e.g. CMSDATA_corporate_portfolio_disclosures) is the likely literal call".
  - True: the page does not call the CMS API at all. A sibling slug `CMSDATA_portfolio` (also `_fortnightly`, `_weekly`) exists in the JS bundle, but `prod-dist-api.tatamfdev.com/cms-data/api/CMSDATA_portfolio?year=2026&month=09` with `check-enc:false` returned `SYSTEM_ERROR` for me.
  - Correct params for that slug: not verified. Not needed.
- A STATIC_REGEX-style resolver on the SSR HTML is the right shape.

File:
- `tata_asof_2026-09-30.xlsx`, 1.79 MB, kept unchanged. As-of 2026-09-30.
- 72 sheets: `Index`, `Tata Scheme Risk-o-Meter`, `Dividend History`, `Debt Replication Index`, then ~68 scheme sheets named by scheme CODE (`TBAF`, `TIFSA`, `TCORPBF`).
- The `Index` sheet maps CLASSIFICATION / SCHEME CODE / SCHEME NAME.

Per-scheme sheet layout:
- Title block, then `Portfolio as on 30-09-26`.
- Header (col B..H): `NAME OF THE INSTRUMENT | YIELD ( IN % ) | INDUSTRY | ISIN CODE | QUANTITY | MKT VAL(Rs. Lacs) | % to NAV`.
- A second header row appears at the debt section, with `RATINGS` replacing `INDUSTRY`.
- Units: market value in Rs. Lacs, % in percent points.
- Section rows: `EQUITY & EQUITY RELATED`, `A) LISTED/AWAITING LISTING...`, `B) UNLISTED`, `DEBT INSTRUMENTS`, `(I) GOVERNMENT SECURITIES`, `(II) NON-CONVERTIBLE DEBENTURES/BONDS/ZCB`, `B) SECURITISED DEBT`, `C) PRIVATELY PLACED DEBENTURE`, `D) MONEY MARKET INSTRUMENTS`, `E) AIF CAT`, `F) MARGIN MONEY DEPOSITS`, `G) MUTUAL FUND UNITS`, `H) FOREIGN SECURITIES`, `I) REPO`.
- Empty sections are `Nil` rows. Totals read `... TOTAL`, `PORTFOLIO TOTAL`, `CASH / NET CURRENT ASSET`, `NET ASSETS`.
- `I) REPO` carries a value and % but no ISIN.
- A derivatives block follows below the notes, with no ISINs.

Sum check (percent over ISIN rows):

| Sheet | Instrument sum | PORTFOLIO TOTAL row | Cash/NCA | NET ASSETS |
|---|---|---|---|---|
| TBAF | 96.31 | 98.19 (instruments + repo 0.64) | 1.81 | 100 |
| TCORPBF | 95.72 | 97.5 | 2.5 | 100 |

---
## 2. Sundaram Mutual Fund
**Verdict: CONFIRMED-WITH-CHANGE.** It is not one 31-scheme workbook. There are TWO workbooks per month, 30 plus 10 = 40 schemes.

Request chain:
1. `GET https://www.sundarammutual.com/monthly-fortnightly-adhoc-portfolios`.
   - Scrape the legacy AjaxPro script path from `<script src="/ajax/Modules_Disclosure_Monthly_Fortnightly_Adhoc_Portfolios,App_Web_ni5waqhv.ashx">`.
   - The `App_Web_xxxxxxxx` hash is per-deploy, so scrape it.
   - The proxy script shows the argument name: `GetCategory:function(Catid,...)` posting `'Catid=' + enc(Catid)`.
2. `POST https://www.sundarammutual.com/ajax/Modules_Disclosure_Monthly_Fortnightly_Adhoc_Portfolios,App_Web_ni5waqhv.ashx?_method=GetCategory&_session=no`
   - Headers: `Content-Type: text/plain`.
   - Body: `Catid=Monthly`. The other values are `Fortnightly` and `AdHoc`.
   - Returns 200 and ~186 KB. The body is a single-quoted JS string of HTML with `\'` escapes, covering all years back to FY2021-22, in tabs `#tab-2026-2027-1` etc. (the FY is the accordion title).
   - Wrong param (`Category=`) returns `System.DBNull cannot be converted`.
3. Parse the links in the tab for the target month. The tab button says `September`.
   - `/uploaddir/MonthlyPortfolio/monthlyportfolio_091026155031.xlsx` has title `Monthly Portfolio Disclosure Equity & Fund of Funds - Sep 2026`.
   - `/uploaddir/MonthlyPortfolio/monthlyportfolio_091026155117.xlsx` has title `Monthly Portfolio Disclosure Fixed Income - Sep 2026`.
   - The filename is a ddmmyy+timestamp of upload (091026 = 9 Oct 2026). It is not derivable.
   - Link order inside a tab varies (Fixed Income is sometimes first), so match on the title text.
4. `GET https://www.sundarammutual.com/uploaddir/MonthlyPortfolio/<file>.xlsx` returns 200 and spreadsheetml.

Proof: httpx with the default UA worked for both the POST and both GETs. The POST returned 186,539 bytes. Both files (567,251 and 784,198 bytes) start with `PK`.

Plan contradictions:
- Plan: "a single Index-sheet workbook covering 31 schemes", `file_shape=SINGLE_WORKBOOK_MULTI_SHEET`.
  - True: two single-Index workbooks per month. Equity & Fund-of-Funds has 30 scheme sheets, Fixed Income has 10, total 40.
  - The Index sheets list 30 and 10 respectively.
- Plan: "same handler with a different Modules_Forms_Downloads_* module argument".
  - True: the module is `Modules_Disclosure_Monthly_Fortnightly_Adhoc_Portfolios` (class prefix `Modules_Disclosure_`, not `Modules_Forms_Downloads_`). The method is `GetCategory(Catid)`.
- The factsheet resolver's `DownloadArchive` handler is unrelated to this path.

Files:
- `sundaram-equity-fof_asof_2026-09-30.xlsx` (567 KB).
- `sundaram-fixed-income_asof_2026-09-30.xlsx` (784 KB).
- As-of 2026-09-30.

Sheets: `Index` (columns `S.NO.`, `ACRONYM`, `SCHEME NAME`) plus acronym-named scheme sheets (`CAPEXG`, `MIDCAP`, `SPBAF`, `SFRLTP`, ...).

Per-sheet layout:
- Row 0 holds `SUNDARAM MUTUAL FUND` plus an `Index` back-link. Then the scheme name, then `Monthly Portfolio Statement for the month ended 30 September 2026`.
- Header (col A..): `SL No | ISIN Code | Name of the instrument | Rating / \nIndustry | Quantity | Mkt Value\nRs. in Lacs | % of Net Asset | YTM (%) [| Yield to call date %]`. Note the ISIN column comes BEFORE the name.
- Units: Rs. in Lacs. The % column is a FRACTION (0.0807 = 8.07%).
- Sections: `A) Equity & Equity Related` (sub-sections `(a) Listed...`, `(b) Overseas Security`, `(c) Privately Placed / Unlisted`, `(d) Preference / Right Shares`, `(e) Warrants`, `f) Derivative`), `B) Debt Instruments` (`(a)` listed ... `(d) Securitized`), `C) Money Market Instruments` (CD, CP, T-bills, `(d) ReverseRepo / TREPS`), `D) Mutual Fund Units`, `E) Others`.
- Subtotals are `Sub Total`, `Total for ...`, and `Grand Total`. Empty ones read `'0 '` as a string with a trailing space.
- `TREPS` rows have no ISIN.
- Derivative rows (`Union Bank of India OCT-2026`, `Stock Future`) have no ISIN and negative quantity/value/%.

Sum check (fractions over ISIN rows):

| Sheet | Sum |
|---|---|
| CAPEXG | 0.9718 (+ TREPS 0.0141 + NCA 0.014 = 1.0; Grand Total 1.0) |
| SPBAF | 0.9781 |
| SFRLTP (Corporate Bond) | 0.9138 |

---
## 3. Choice Mutual Fund
**Verdict: CONFIRMED-WITH-CHANGE, plus NOT-PUBLISHED-YET for 3 of 4 schemes.** The API and file replay work. Only Choice Overnight Fund has 30-Sep-2026 holdings; the others are absent or stale.

Request chain:
1. `GET https://choicemf.com/api/document-master-list`. The JS client `axios.get('/document-master-list')` uses `baseURL https://choicemf.com/api`.
   - Plain httpx with the default UA returns 200 and ~200 KB.
   - No auth, no params.
2. JSON path `body[*]` is a TREE:
   - Level 1 is `name`, `slug`, `children[]`.
   - Level 2 nodes carry `financial_years[] -> {financial_year, files[]}`.
   - Each file has `doc_name`, `scheme_id`, `scheme_name`, `frequency`, `month`, `file_type`, `created_at`, and `open_file_url`. Example: `https://choicemf.com/api/document/ngCwkJfMCu/Choice-Mutual-Fund-Fortnightly-Portfolio-OV-30-Sep-2026.xlsx`.
3. Relevant level-2 nodes:
   - `regulatory-compliance/monthly-portfolio` (`redirection_link disclosures/monthly-portfolio`).
   - `regulatory-compliance/fortnight-portfolio` (`disclosures/fortnight-portfolio`).
   - `regulatory-compliance/half-yearly-portfolio`.
4. `GET open_file_url` returns 200 with `Content-Disposition: attachment; filename="..."` and spreadsheetml. Default httpx UA works. The short code alone (`/api/document/<code>`) returns 404, so the full URL is needed.

What is actually published:
- `monthly-portfolio`: 4 files, ALL `Choice Gold ETF` for Nov 2025 to Feb 2026 (`.xlsx`, `.xlsx`, `.xls`, `.xls`). NOTHING for Mar-Sep 2026. Stale 7+ months.
- `fortnight-portfolio` (the only category with Sept 2026): `Choice Mutual Fund-Fortnightly Portfolio-OV-30 Sep 2026.xlsx` (`scheme_id` 10, Choice Overnight Fund, created 2026-10-05) plus 15-Sep, 31-Aug, 15-Aug and a mis-named `CLONTF - Fortnightly Portfolio 31 July 2026.xlsx` (it is actually the Overnight Fund).
- Choice has 4 schemes: Overnight, Nifty 50 Index, Nifty Next 50 Index, Gold ETF.
  - Nifty 50 Index and Nifty Next 50 Index: NO holdings file in the whole master list (only factsheet PDFs, scheme summary `.xls`/`.xml`/`.pdf`, SID/KIM).
  - Gold ETF: stale at Feb 2026.
  - Whether these are published elsewhere on the site: not verified.

Plan contradictions:
- Plan: "'% to AUM' is Choice's label". True for Gold ETF `.xls` only. The Overnight `.xlsx` says `% to NAV`.
- Plan: "appears genuinely scheme-by-scheme", "filtered by a disclosure document-type value". True, but there is no server-side filter. It is a single unfiltered tree; select by `slug` / `scheme_name` client-side.
- Plan: the as-of month-end file is in a "monthly" category. It is in `fortnight-portfolio`, and the 30-Sep file is a month-end fortnightly (`frequency` field says "monthly" on the fortnight rows, which is unreliable).

Files:
- `choice-overnight_asof_2026-09-30.xlsx` (261 KB).
- `choice-clontf_asof_2026-07-31.xlsx` (254 KB; Overnight Fund 31-Jul, NOT 30-Sep).
- `choice-gold-etf_asof_2026-02-28.xls` (285 KB; true OLE2 `.xls`, as-of read from the Excel serial 46081 = 2026-02-28).

Layout:
- Single sheet named `Sheet` (`.xlsx`). The Gold ETF `.xls` has `Index` + `CGETF` (code).
- Rows 0-3: `Choice Mutual Fund` / `SCHEME NAME : <name>` / `FORTNIGHTLY PORTFOLIO STATEMENT AS ON : <datetime>` (the `.xlsx`; the Gold file says `PORTFOLIO STATEMENT AS ON :` with a serial number).
- Header (col C..K): `Name of the Instrument / Issuer | ISIN | Rating / Industry^ | Quantity | Market value\n(Rs. in Lakhs) | % to NAV [| % to AUM in the Gold .xls] | YTM % | YTC % ## | Notes & Symbols`.
- Sections: `EQUITY & EQUITY RELATED`, `DEBT INSTRUMENTS`, `MONEY MARKET INSTRUMENTS`, `OTHERS` (`c) Gold`, `e) TREPS / Reverse Repo Investments`), `Other Current Assets / (Liabilities)`. Empty ones read `NIL`. `Total` and `GRAND TOTAL (AUM)` are the totals.
- The Overnight fund is 100% TREPS plus net receivables (`TREPS` 0.9899 + `Net Receivable / Payable` 0.0101 = 1), so there are ZERO ISIN rows.
- The Gold ETF has no `IN...` ISINs, only `IDIA00500001`/`IDIA00500003` and a `500001` code in col C.
- Scale: Overnight `.xlsx` is fraction (0.9899), Gold `.xls` is percent points (97.65).

Sum-check: ISIN-row sum is 0 for all three files (no ISINs). Totals check: Overnight 0.9899 + 0.0101 = 1.0; Gold ETF 97.65 + 0.06 + 2.29 = 100.0.

---
## 4. UTI Mutual Fund
**Verdict: CONFIRMED-WITH-CHANGE.** There is one consolidated ZIP holding a single all-scheme sheet. The scheme-by-scheme path the spike saw is not needed.

Request chain:
1. `GET https://www.utimf.com/api/get-consolidate-portfolio-disclosure?year=2026&month=September`.
   - `month` is the full English name, as with the sibling `get-fact-sheet`.
   - Default httpx UA works. Returns 200 `application/json`.
   - Response: `{"rows":[{"name":"Consolidated Portfolio September 2026","type":"Zip","doc":"https://d3ce1o48hc5oli.cloudfront.net/static/generic-zip/Oct-26/FW__UTI_MF_SCHEME_PORTFOLIOS_-_30.09.2026_.zip","url":"<same>","category":"Consolidate portfolio disclosure","month":"September","year":"2026"}]}`.
   - JSON path `rows[0].doc`.
   - August returned a different shape: `.../s3fs-public/2026-09/fw_uti_mf_scheme_portfolios_31.08.2026_revised_final.zip?VersionId=...`. Never construct the URL.
2. `GET <doc>` returns 200, `application/zip`, `Last-Modified: Wed, 07 Oct 2026`, 1,808,905 bytes. Default httpx UA works. No redirects.

How I found the endpoint: the Angular SPA's server-rendered `ng-state` blob in the page HTML (`curl https://www.utimf.com/downloads/scheme-wise-portfolio-disclosure`) lists every download form's `document_filter_api` template. The relevant ones are:
- `api/get-scheme-portfolio-disclosure?dofa_scheme_code={dofa_scheme_code}&year={year}&month={month}` (per-scheme, the spike's path).
- `api/get-consolidate-portfolio-disclosure?year={year}&month={month}` ("Consolidated Portfolio Disclosure (All scheme)").
- `api/get-consolidate-debt-portfolio-disclosure?year=&month=`. It returned `{"rows":[]}` for Aug and Sep 2026.
- `api/get-fortnightly-statements-debt-schemes`.
- The per-scheme category/fund list comes from `getSchemesBasedOnCategory`. Not replayed (not needed).

Plan contradictions:
- Plan: "No all-schemes bulk workbook observed -- scheme-by-scheme", and "a sibling path (e.g. get-scheme-wise-portfolio) is the likely literal call".
  - True: an all-schemes consolidated bulk file exists at `get-consolidate-portfolio-disclosure`. The per-scheme call is `get-scheme-portfolio-disclosure` (name differs from the guess).
  - The spike's `consolidate-all-portfolio-disclosure` page route exists in the Angular app, but at `/downloads/consolidate-all-portfolio-disclosure` it rendered no controls headless. Not investigated.
  - `file_shape` should be a ZIP whose only holdings member is a single-sheet workbook with scheme blocks, a new shape not covered by `ZIP_OF_WORKBOOKS` or `SINGLE_WORKBOOK_MULTI_SHEET`.

File:
- `uti-consolidated_asof_2026-09-30.zip`, 1.81 MB, unchanged. As-of 2026-09-30.
- 4 members. Only one is holdings:
  - `Sebi Exposure as on 30 Sep 2026_FINAL.xlsx` (333 KB): the holdings.
  - `Divmast asof-01-Apr-2026-30-Sep-2026_final.xls` (351 KB): dividend history.
  - `Fut Disclo-Fut Exposure Sebi Format-01-Apr-2026-30-Sep-2026_FINAL.xlsx`: derivatives, half-year.
  - `Risk-o-meter_Funds and Benchmark_Aug 2026.xlsx`: risk-o-meter.
- The holdings workbook has ONE sheet, `EXPOSURE` (9,430 rows), with 88 scheme blocks delimited by marker rows `SCHEME CODE002STARTS` ... `SCHEME CODE002ENDS`.
  - The code is the 3-digit UTI scheme code.
  - The first block is `UTI - Unit Linked Insurance Plan` (code 002).

Block layout:
- `UTI MUTUAL FUND` / `SCHEME: <name>` / `PROVISIONAL AND UNAUDITED PORTFOLIO DISCLOSURE AS OF 30/09/2026 (Market value in Lacs)`.
- Header (repeated per block): `NAME OF THE INSTRUMENT | RATING/INDUSTRY | QUANTITY | MARKET-VALUE | % TO NAV | ISIN | Yield to call (AT1 and ATII Bonds) | Yield`.
  - There are blank cells in the header row between `% TO NAV` and `ISIN`, so on equity rows the ISIN sits in col index 7.
  - On debt rows an extra flag token (`**`, `*`, or a blank) can precede the ISIN. Locate the ISIN per row by regex, not by fixed index.
- Units: Market value in Lacs, % in percent points.
- Instruments are prefixed (`EQ - HDFC BANK LIMITED`, `CD - NABARD - 22/01/2027`, `182 DAYS T-BILL`, `CP ...`, `REIT- ...`).
- Sections: `EQUITY AND EQUITY RELATED` (`(a) Listed...`, `(b) Unlisted`), `DEBT INSTRUMENTS`, `MONEY MARKET INSTRUMENTS`, `SHORT TERM DEPOSITS -`, `Others`, `REITs/INVITs`, `FUTURES`.
- Totals read `TOTAL:...` and `TOTAL : <scheme>`. `NET CURRENT ASSETS` has a value and %.
- The `FUTURES` blocks carry negative values.
- Footer notes plus `SCHEME CODE0xxENDS`.

Sum check (percent over ISIN rows, ISIN at index 7, % at index 4):

| Block | Sum |
|---|---|
| UTI - Large Cap Fund | 96.03 |
| UTI - Flexi Cap Fund | 97.26 |
| UTI Large & Mid Cap Fund | 97.97 |

Across 88 blocks the max is 101.25. Some blocks sum to 0 by my fixed-index test (debt blocks where the ISIN column shifts), which is exactly the shifting-ISIN-column hazard above; rows with a flag token before the ISIN need a regex scan.

---
## 5. Bajaj Finserv Mutual Fund
**Verdict: CONFIRMED-WITH-CHANGE.** The year argument is a financial year, and the nonce comes from the page.

Request chain (WordPress admin-ajax):
1. `GET https://www.bajajamc.com/downloads?tab=portfolio` (the `?statutory-disclosures=` query also works).
   - Scrape `bajajDownloads = {"ajaxUrl":"https://www.bajajamc.com/wp-admin/admin-ajax.php","nonce":"e0b28f6063"}`.
   - Regex: `bajajDownloads\s*=\s*\{[^}]*?"nonce":"([0-9a-f]+)"`.
   - Beware: the HTML has a SECOND, unrelated `"nonce"` earlier in the page (`aaf0554ab8`, another plugin), and using it gives 403 `-1`.
2. `POST https://www.bajajamc.com/wp-admin/admin-ajax.php`, multipart/form-data (urlencoded also works through httpx `data=`).
   - Fields: `action=bajaj_get_filter_options`, `nonce=<nonce>`, `filter_for=years`, `section_id=757`.
   - Response: `{"success":true,"data":{"options":[{"value":"2026-27",...},...]}}`.
   - Years are FINANCIAL years: 2026-27, 2025-26, 2024-25, 2023-24.
3. Months: `action=bajaj_get_filter_options`, `filter_for=months`, `section_id=757`, `year=2026-27`. Returns April..September.
4. File link: `action=bajaj_get_downloads`, `section_id=757`, `year=2026-27`, `month=September`.
   - Response: `{"success":true,"data":{"html":"<div class=\"bd-download-row\"><span class=\"bd-download-title\">Bajaj Finserv Mutual Fund_Monthly Portfolio as on 30 Sep 2026</span><a href=\"https://media.bajajamc.com/wp-content/uploads/2026/10/Bajaj-Finserv-Mutual-Fund_Monthly-Portfolio-as-on-30-Sep2026-1.xls\" ...","count":1}}`.
   - Extract with the regex `href="([^"]+\.xls[x]?)"` over `data.html`.
   - Never construct the URL (the `-1` suffix and the `Sep2026` missing hyphen are a one-off).
   - The July-to-September uploads sit in `/2026/10/`. August is `/2026/09/...Aug-2026.xls`.
5. `GET <href>` returns 200, content-type `application/vnd.ms-excel`, 2,122,463 bytes. Default httpx UA works.

Section ids on the page: 757 = Monthly Portfolio, 756 = Fortnightly, 755 = Half Yearly, 744 = Download Factsheet.

Proof: httpx Client (cookie jar kept, default UA), page GET then the three POSTs, all 200. The Aug call also returned 200 with a link.

Plan contradictions:
- Plan: "year/month selects (cascading) reveal a direct link".
  - True, with FY-formatted years (`2026-27`).
  - The fund_manager resolver's check (`bajaj_get_filter_options section 744/year 2026 returned options=[]`) failed only because the year must be the financial-year string `2026-27`, not `2026`.
  - A `bajaj_get_downloads` for "September" returned count=0 earlier. With `year=2026-27` it works.
- Plan: SINGLE_WORKBOOK_MULTI_SHEET. True (25 sheets).
- Plan: "one workbook for all 25 schemes". True.
- The file is `.xls` by name, but its magic is `PK` (an XLSX). Parsers must sniff magic bytes.

File:
- `bajaj-finserv_asof_2026-09-30.xls`, 2.12 MB (marginally over the ~2 MB target; kept unchanged). As-of 2026-09-30.
- 25 sheets named by scheme code (`BFARB`, `BFBAF`, `BFBKFIN`, ...), with no Index sheet.
- Layout per sheet: row 0 is `BFARB` / `Bajaj Finserv Arbitrage Fund`, then `Monthly Portfolio Statement as on September 30, 2026`.
- Header (col B..I): `Name of the Instrument | ISIN | Industry / Rating | Quantity | Market/Fair Value\n (Rs. in Lakhs) | % to Net\n Assets | YTM~ | YTC^`. Note the `\n` inside the headers and that `% to Net Assets` is neither `% to NAV` nor `% to AUM`.
- Units: Rs. in Lakhs; % is a fraction.
- Col A holds an internal symbol (`IBCL05`).
- Sections: `Equity & Equity related`, `(a) Listed / awaiting listing...`, `(b) Unlisted`, `Derivatives`, `(a) Index / Stock Futures`, `Index / Stock Options`. Totals are `Sub Total` / `Total`.
- Futures rows have a symbol-style name (`POWFNOV26`), a text name (`Power Finance Corporation Limited November 2026 Future`), negative quantity/value, and the % may be a string `'$0.00%'`.

Sum check (fractions over ISIN rows): `BFARB` 0.9669, `BFBAF` 0.885. The second figure is low because the equity rows are only 82.8% plus debt/derivatives.

---
## 6. ICICI Prudential Mutual Fund
**Verdict: CONFIRMED-WITH-CHANGE.** The plan's literal request is the SPA API at `apimf.icicipruamc.com`, and the download uses a `/blob/` path. The old `archive.icicipruamc.com` is indeed NXDOMAIN, but the live download does not need it.

Request chain (no browser; three headers are enough):
1. `POST https://apimf.icicipruamc.com/nms/v1/downloads/files`. Body (JSON):
   `{"categoryId":"26a073d7-08d2-4a95-95fa-f83a4ee51e40","schemeCategory":"","userType":"Investor","fileType":"All","page":"1","size":"20","filter":[],"categoryName":"OTHERS"}`
   - `categoryId` is the sub-category id of `Monthly Portfolio Disclosures`. It comes from `GET /nms/v1/downloads/categories?userType=Investor` -> `success.data[internalName="other scheme disclosures"].subCategory[internalName="monthly-portfolio-disclosures"].id`.
   - Headers: `requestapiid: <random uuid4>`, `sourceurl: DOWNLOADS`, `env: api`. These are three non-secret app headers, with no login and no crypto.
   - Replay works with the default httpx UA, or a custom UA like `UnifolioBot/1.0`.
   - Response: `success.data.files[]` (20, newest first, `isNext: true`).
     - Each has `title.text` ("Monthly Portfolio Disclosure September 2026"), `url` ("/downloads/Files/Monthly Portfolio Disclosures/2026/Sep/Monthly-Portfolio-Disclosure-September-2026.zip"), `applicableMonth` (epoch ms), `fileDate`, `lastModifiedDate`.
     - Month folder names are inconsistent (`Sep`, `Aug`, `July`, `June`), so use the returned `url`.
2. `GET https://www.icicipruamc.com/blob` + `urllib.parse.quote(file.url)`:
   `https://www.icicipruamc.com/blob/downloads/Files/Monthly%20Portfolio%20Disclosures/2026/Sep/Monthly-Portfolio-Disclosure-September-2026.zip`
   - Returns 200, `application/x-zip-compressed`, 25,874,809 bytes, with no redirect.
   - Works with the default httpx UA, a Chrome UA, or a custom UA.
   - I found the `/blob` prefix from the real browser DOWNLOAD click.
   - `GET https://www.icicipruamc.com/downloads/Files/...` WITHOUT `/blob` 307-redirects to `archive.icicipruamc.com`, which does not resolve (checked via `dig` against 8.8.8.8, 1.1.1.1, and the local resolver: no answer). That is the plan's "dead NXDOMAIN" host. The `/blob/` path bypasses it. This is the site's own download path, not a workaround.

IMPORTANT behaviour (F5 bot-defense on the API host):
- `POST .../nms/v1/downloads/files` is gated by F5 TSPD. A Chrome UA with the three custom headers but WITHOUT `Referer`/`Origin`/`Accept` gets an HTTP 200 JS-challenge HTML page (`bobcmn` / `/TSPD/`), not JSON (tested 3 of 3).
- Chrome UA + the three headers + `Origin`/`Referer`/`Accept` returned JSON 3 of 3, and a non-browser UA + the three headers returned JSON 3 of 3. The pattern: an incoherent browser-lookalike request is challenged, while an honest client or a complete browser header set passes.
- Recommendation: use a plain honest UA (or the project's `_HEADERS`) and assert `content-type` starts with `application/json`. Treat a `text/html` 200 as `BLOCKED` and alert. I did not try to solve or bypass the challenge.
- `GET /nms/v1/downloads/categories` also returned a text/plain 404-ish body from curl with a bare UA. It succeeds with the three headers.
- `GET https://apimf.icicipruamc.com/header` is open with no headers.
- `POST /auth/v1/pre-login` (RSA key exchange) is sent by the SPA, but the downloads endpoints did not need it.

Plan contradictions:
- Plan: "kind=STATIC_REGEX ... landing_url = media-center page ... the literal 'DOWNLOAD' button's href/request needs one capture".
  - True: the media-center page is a React SPA. Its HTML has no file links (the curl'd page status is 404 with a shell). The correct kind is JSON_API.
  - Correct `endpoint_url` is the `POST` above, with `link_pattern` `files[].url` -> prefix `/blob`.
- Plan: "archive.icicipruamc.com ... is a dead NXDOMAIN, not a block". CONFIRMED (no DNS answer), but the replay does not use it.
- Plan: `ZIP_OF_WORKBOOKS`. CONFIRMED: 151 `.xlsx` members, one per scheme, flat (no folders), named `ICICI Prudential <Scheme Name>.xlsx`.

Fixture: `icici-prudential_asof_2026-09-30-trimmed.zip` (603 KB). It holds 3 members byte-identical to the originals (verified equal): Balanced Advantage Fund, Banking and PSU Debt Fund, Arbitrage Fund. The full ZIP is 25.9 MB and is not in the repo. As-of 2026-09-30.

Workbook layout (per scheme):
- 2 sheets: a scheme-code sheet (`BAF`, `BANPSU`, `ARBITRAGE`) plus `Derivative`.
- Row 0 `ICICI Prudential Mutual Fund`, row 1 the scheme name, row 2 `Portfolio as on Sep 30,2026`.
- Header (col B..): `Company/Issuer/Instrument Name | ISIN | Coupon | Industry/Rating | Quantity | Exposure/Market Value(Rs.Lakh) | % to Nav | Yield of the instrument | Yield to Call @...`.
- Units: Rs. Lakh; % is a fraction.
- Section subtotal rows carry value and %: `Equity & Equity Related Instruments (Note -1)`, `Units of Real Estate Investment Trust (REITs)`, `Listed / Awaiting Listing On Stock Exchanges`, `Debt Instruments`, `Government Securities`, `Non-Convertible debentures / Bonds`, `Securitized Debt Instruments`, `Money Market Instruments`, `Certificate of Deposits`, `Treasury Bills`, `Reverse Repo`, `TREPS`, `Cash Margin - Derivatives`, `Net Current Assets`, `Total Net Assets`. Empty ones read `Nil`.
- `INTEREST RATE SWAPS (At Notional Value)` rows follow the total, with no ISIN.
- The `Derivative` sheet has header `Scheme | Underlying Security Name | Long/(Short) | Future price when purchased (in Rs.) | Current price of the contract (in Rs.) | Margin Maintained (Rs. in Lakhs)`, and its scheme codes differ from the main sheet's (`EQDINO` in the Arbitrage workbook).

Sum check (fractions over ISIN rows): `BAF` 0.9622 (Total Net Assets 1.0), `BANPSU` 0.974.

---
## 7. WhiteOak Capital Mutual Fund (new discovery)
**Verdict: CONFIRMED (new).** It is a Strapi JSON API on `cms.whiteoakamc.com`, and the files are on `content.whiteoakamc.com`. Every host is CloudFront-gated on the User-Agent: it returns 403 for `curl`, `python-httpx`, `UnifolioBot/1.0`, and bare `Mozilla/5.0`, and 200 for a full browser-style UA string. The project's existing `amfi_factsheet_client._HEADERS` UA (Chrome/126 on Windows) passes. I did not try anything beyond a UA string (no proxy, no challenge solving; there was none).

Discovery narrative:
1. `GET https://mf.whiteoakamc.com/regulatory-disclosures/scheme-portfolios`.
   - With a non-browser UA the host returns a CloudFront 403 (919 bytes, `Request blocked`). This is the likely meaning of the registry's earlier "bot-protected".
   - With a Chrome UA it returns 200 and 60 KB of Next.js shell. The shell has no data and no links. The CSP header lists `cms.whiteoakamc.com`, `content.whiteoakamc.com` and an S3 bucket.
2. Playwright with a Chrome UA, logging XHR: the page makes exactly one data call on load:
   `GET https://cms.whiteoakamc.com/api/scheme-portfolios?pagination[page]=1&pagination[pageSize]=10&sort[0]=published_date:desc&sort[1]=id:desc&populate=*`
   - No auth header. No cookies.
3. Replay with httpx: this call returns 200 `application/json` only with a browser-style UA. With the project UA I used `pagination[pageSize]=100`.
   - Response is `{"data":[{"id":1560,"attributes":{...}}],"meta":{"pagination":{"page":1,"pageSize":100,"pageCount":12,"total":1111}}}` (1,111 rows in total, newest first).
4. Each row's `attributes`: `scheme_name`, `period` (`Monthly` or `Fortnightly`), `doc_name` ("WhiteOak Capital Ultra Short Term Fund Monthly Portfolio Disclosure - 30th September2026" - note the missing space), `doc_link` (null for all 100 rows), `published_date` (`2026-10-09`), and `doc_file.data.attributes.{name, ext, mime, size, url}`.
   - `url` is `https://content.whiteoakamc.com/WOC_Special_Opportunities_Fund_Sept_2026_e22c53bbd6.xlsx` (the hash suffix makes URLs unguessable).
5. `GET <url>` returns 200 spreadsheetml, with the project UA. The default httpx UA gets 403 on this host too.
6. Filter: `period == "Monthly"` and `doc_name` containing `September` and `2026`. The first page of 100 rows had 22 Sept-2026 Monthly rows (matching the 22 live schemes), all published 2026-10-09. A Strapi filter query was not tried; paging 1..N with `sort=published_date:desc` and stopping at the first row older than the target month is the safe path.

Registry entry I would write:
```
"WhiteOak Capital Mutual Fund": DisclosureResolverEntry(
    kind=DisclosureResolverKind.JSON_API,
    file_shape=DisclosureFileShape.PER_SCHEME_WORKBOOKS,   # 22 single-sheet workbooks per month, one per scheme
    landing_url="https://mf.whiteoakamc.com/regulatory-disclosures/scheme-portfolios",
    endpoint_url="https://cms.whiteoakamc.com/api/scheme-portfolios"
                 "?pagination[page]=1&pagination[pageSize]=100&sort[0]=published_date:desc&sort[1]=id:desc&populate=*",
    response_json_path="data[*].attributes",          # then doc_file.data.attributes.url
    link_pattern=None,                                # file URL read from JSON, not regex
    # period=="Monthly", doc_name month/year == target; needs a full browser-style User-Agent
    # (CloudFront 403s curl/httpx/custom UAs on mf., cms. and content. hosts)
)
```
`PER_SCHEME_WORKBOOKS` is not an existing enum member in the plan; same shape as Choice/PGIM.

Files (3 saved; the first two are the requested pair):
- `whiteoak-special-opportunities_asof_2026-09-30.xlsx` (191 KB).
- `whiteoak-liquid_asof_2026-09-30.xlsx` (78 KB).
- `whiteoak-balanced-advantage_asof_2026-09-30.xlsx` (217 KB).
- As-of 2026-09-30. All have magic `PK`.

Layout:
- Exactly 1 sheet per file, and the sheet name is NOT stable: `WOSOP` (a code) in one file, `WhiteOak Capital Liquid Fund` (the full name) in another. Do not rely on it.
- Row 0 is the scheme name, row 2 is `Monthly Portfolio Statement as on September 30, 2026`.
- Header (col B..I): `Name of the Instrument | (blank) | ISIN | Industry / Rating | Quantity | Market/Fair Value\n (Rs. in Lakhs) | % to Net\n Assets | YTM~`. Equity files say `Industry / Rating`, the Liquid file says `Rating`.
- Units: Rs. in Lakhs; % is a fraction. This is the same template family as Bajaj.
- Sections: `Equity & Equity related`, `(a) Listed / awaiting listing on Stock Exchanges`, `(b) Reits`, `(c) Unlisted`, `Money Market Instruments`, `Treasury Bill`, `Reverse Repo / TREPS`. Subtotals are `Sub Total` / `Total`, then `Net Receivables / (Payables)` and `GRAND TOTAL`.
- Derivatives: below the totals, a separate table with its own header `Long/Short | Name of the Instrument | Industry | Quantity. | Market/Fair Value (Rs. in Lacs). | % to NAV.` listing `Long NIFTY Index ...`. These rows have no ISIN and the % header differs (`% to NAV.` with a trailing dot).
- TREPS rows have an ID-like code (`TRP_011026`) in the ISIN-ish column but no real ISIN.

Sum check (fractions over ISIN rows):

| Sheet | Instrument sum | GRAND TOTAL |
|---|---|---|
| WOSOP | 0.9267 | 1.0 (instrument rows + REIT/other + TREPS 0.0758 - 0.0025 NCA) |
| Liquid | 0.959 | 1.0 |

---
## Items not verified
- Choice: whether Nifty 50 / Nifty Next 50 Index Fund and Gold ETF month-end holdings are published anywhere other than `document-master-list` (it shows none for Mar-Sep 2026).
- Tata: correct query params for the `CMSDATA_portfolio` API (not needed).
- UTI: the Angular route `/downloads/consolidate-all-portfolio-disclosure` renders no controls headless, and the debt-consolidated endpoint returns empty rows for Aug/Sep 2026.
- ICICI: stability of F5 TSPD gating over time or from AWS egress; I only tested from this dev box.
- WhiteOak: paging across all 12 pages and a Strapi server-side filter; the CloudFront UA gate from AWS egress.
- Whether Sundaram's `App_Web_*` hash and Bajaj's nonce stay stable between fetches (both are re-scraped on each run, so this is expected to be fine).

---
