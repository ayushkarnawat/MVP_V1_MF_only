# CAS import baseline — Phase 1

Recorded 2026-10-06 on Windows, SQLite, Python 3.14.3. Synthetic fixtures only; no personal PDFs. All 17 scenario processes completed successfully. This is a measurement of existing import damage, not a claim of matching portfolios.

Dashboard values sum the member holding values using Decimal. They use live mfapi.in NAVs, so later live-valued totals can move. CAS values sum the generated statement values in truth.json for the final statement. Unit differences are the stable yardstick. Reconciliation is measured immediately after confirmation, before the harness warms holdings caches; cache_stale is therefore zero in these runs. The family scenario includes every household member.

| Scenario / upload order | Dashboard value (₹) | CAS value (₹) | Match | Units differ | No CAS data | Cache stale |
|---|---:|---:|---:|---:|---:|---:|
| p20_20yr.pdf | 191527931.13 | 199998422.83 | 9 | 2 | 1 | 0 |
| p20_10yr.pdf | 105507663.79 | 199998422.83 | 4 | 4 | 1 | 0 |
| p20_7yr.pdf | 67758398.16 | 199998422.83 | 2 | 5 | 1 | 0 |
| p20_3yr.pdf | 9101250.50 | 199998422.83 | 0 | 5 | 0 | 0 |
| p20_1yr.pdf | 2308586.62 | 199998422.83 | 0 | 4 | 0 | 0 |
| p20_FY.pdf | 1120590.24 | 199998422.83 | 0 | 4 | 0 | 0 |
| p10_10yr.pdf | 129069323.86 | 150002228.37 | 5 | 1 | 0 | 0 |
| p10_FY.pdf | 1717368.59 | 150002228.37 | 0 | 3 | 0 | 0 |
| p7_7yr.pdf | 117648851.97 | 120002330.08 | 3 | 2 | 0 | 0 |
| p3_FY.pdf | 190071.10 | 1999977.04 | 0 | 2 | 0 | 0 |
| kfin_pk_10yr.pdf | 50317402.18 | 49999493.84 | 4 | 0 | 0 | 0 |
| kfin_p7_7yr.pdf | 117648851.97 | 120002330.08 | 3 | 2 | 0 | 0 |
| oldcams_p20_20yr.pdf | 191527931.13 | 199998422.83 | 9 | 2 | 1 | 0 |
| fam_10yr.pdf | 239643835.11 | 350000651.20 | 9 | 5 | 1 | 0 |
| px_14yr.pdf | 162418528.40 | 29997923.58 | 7 | 1 | 1 | 0 |
| p20_FY.pdf → p20_20yr.pdf | 191527931.13 | 199998422.83 | 9 | 2 | 1 | 0 |
| p20_FY.pdf → p20_FY_altfolio.pdf | 1866260.15 | 199998422.83 | 0 | 6 | 0 | 0 |

The p20_FY yardstick reproduces the artifact: ₹0.112059 Cr on the dashboard versus ₹19.999842 Cr on the CAS. No corrective data-path work from later phases has been included.

Counts cover persisted folios, as specified by reconcile_members. A CAS-only fund that failed to obtain a persisted folio is absent from these counts; this is important for the closed/merged funds deferred to Phase 5. NAV differences also include the different valuation dates.

## Five largest absolute unit differences per scenario

A positive difference means extra app units; negative means missing app units. Zero entries are retained when fewer than five folios differ. No-CAS-data rows have no numeric difference and are omitted here.

### p20_20yr.pdf

| Folio | Scheme | Status | App minus CAS units |
|---|---|---|---:|
| 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | units_differ | -53895.083 |
| 2215508 | ICICI Prudential Bluechip Fund - Growth | units_differ | -43713.123 |
| 4400918 / 3 | Nippon India Index Fund - Nifty 50 Plan - Direct Plan Growth Plan - Growth Option | match | +0.000 |
| 5570099 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | match | +0.000 |
| 1047392 / 12 | HDFC Regular Savings Fund - Direct Plan - Growth Option | match | +0.000 |

### p20_10yr.pdf

| Folio | Scheme | Status | App minus CAS units |
|---|---|---|---:|
| 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | units_differ | -274229.493 |
| 1047392 / 12 | HDFC Balanced Advantage Fund - Regular Plan - IDCW Reinvestment | units_differ | -149574.880 |
| 3310557 | Axis Bluechip Fund - Regular Growth | units_differ | -97784.944 |
| 1047392 / 12 | HDFC Flexi Cap Fund - Direct Plan - Growth Option | units_differ | -19769.265 |
| 7781230 | HSBC Value Fund - Direct Plan - Growth | match | +0.000 |

### p20_7yr.pdf

| Folio | Scheme | Status | App minus CAS units |
|---|---|---|---:|
| 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | units_differ | -350116.454 |
| 1047392 / 12 | HDFC Balanced Advantage Fund - Regular Plan - IDCW Reinvestment | units_differ | -201905.770 |
| 4400918 / 3 | Nippon India Index Fund - Nifty 50 Plan - Direct Plan Growth Plan - Growth Option | units_differ | -135719.838 |
| 3310557 | Axis Bluechip Fund - Regular Growth | units_differ | -127204.661 |
| 1047392 / 12 | HDFC Flexi Cap Fund - Direct Plan - Growth Option | units_differ | -29924.151 |

### p20_3yr.pdf

| Folio | Scheme | Status | App minus CAS units |
|---|---|---|---:|
| 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | units_differ | -416525.437 |
| 1047392 / 12 | HDFC Balanced Advantage Fund - Regular Plan - IDCW Reinvestment | units_differ | -311454.428 |
| 4400918 / 3 | Nippon India Index Fund - Nifty 50 Plan - Direct Plan Growth Plan - Growth Option | units_differ | -237022.817 |
| 3310557 | Axis Bluechip Fund - Regular Growth | units_differ | -157539.763 |
| 1047392 / 12 | HDFC Flexi Cap Fund - Direct Plan - Growth Option | units_differ | -33164.411 |

### p20_1yr.pdf

| Folio | Scheme | Status | App minus CAS units |
|---|---|---|---:|
| 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | units_differ | -432641.905 |
| 4400918 / 3 | Nippon India Index Fund - Nifty 50 Plan - Direct Plan Growth Plan - Growth Option | units_differ | -269305.105 |
| 3310557 | Axis Bluechip Fund - Regular Growth | units_differ | -166151.062 |
| 1047392 / 12 | HDFC Flexi Cap Fund - Direct Plan - Growth Option | units_differ | -33977.176 |

### p20_FY.pdf

| Folio | Scheme | Status | App minus CAS units |
|---|---|---|---:|
| 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | units_differ | -435915.310 |
| 4400918 / 3 | Nippon India Index Fund - Nifty 50 Plan - Direct Plan Growth Plan - Growth Option | units_differ | -279568.027 |
| 3310557 | Axis Bluechip Fund - Regular Growth | units_differ | -167992.811 |
| 1047392 / 12 | HDFC Flexi Cap Fund - Direct Plan - Growth Option | units_differ | -34146.563 |

### p10_10yr.pdf

| Folio | Scheme | Status | App minus CAS units |
|---|---|---|---:|
| 5590112 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | units_differ | -187260.426 |
| 6600123 / 45 | DSP Equity Savings Fund - Dir - Growth | match | +0.000 |
| 8812001 | Axis Bluechip Fund - Direct Growth | match | +0.000 |
| 1050001 / 71 | HDFC Balanced Advantage Fund - Regular Plan - IDCW Reinvestment | match | +0.000 |
| 2219987 | ICICI Prudential Bluechip Fund - Direct Plan - Growth | match | +0.000 |

### p10_FY.pdf

| Folio | Scheme | Status | App minus CAS units |
|---|---|---|---:|
| 5590112 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | units_differ | -815681.341 |
| 8812001 | Axis Bluechip Fund - Direct Growth | units_differ | -535099.204 |
| 4400777 | Nippon India Index Fund - Nifty 50 Plan - Direct Plan Growth Plan - Growth Option | units_differ | -492407.513 |

### p7_7yr.pdf

| Folio | Scheme | Status | App minus CAS units |
|---|---|---|---:|
| 5591221 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | units_differ | -34058.742 |
| 6612001 / 22 | DSP Equity Savings Fund - Reg - Growth | units_differ | +13720.021 |
| 3319001 | Axis Bluechip Fund - Regular Growth | match | +0.000 |
| 1901234 | SBI Fixed Maturity Plan (FMP) - Series 6 (3668 Days) Dir Growth | match | +0.000 |
| 1058877 | HDFC Flexi Cap Fund - Direct Plan - Growth Option | match | +0.000 |

### p3_FY.pdf

| Folio | Scheme | Status | App minus CAS units |
|---|---|---|---:|
| 5599001 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | units_differ | -12480.230 |
| 4401001 | Nippon India Index Fund - Nifty 50 Plan - Direct Plan Growth Plan - Growth Option | units_differ | -10256.405 |

### kfin_pk_10yr.pdf

| Folio | Scheme | Status | App minus CAS units |
|---|---|---|---:|
| 7700101 | Axis Bluechip Fund - Direct Growth | match | +0.000 |
| 3301990 | Franklin India Low Duration Fund - Direct - Growth | match | +0.000 |
| 7700101 | Axis Mid Cap Fund - Direct Growth | match | +0.000 |
| 7700101 | Axis Liquid Fund - Direct Growth | match | +0.000 |

### kfin_p7_7yr.pdf

| Folio | Scheme | Status | App minus CAS units |
|---|---|---|---:|
| 5591221 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | units_differ | -34058.742 |
| 6612001 / 22 | DSP Equity Savings Fund - Reg - Growth | units_differ | +13720.021 |
| 1901234 | SBI Fixed Maturity Plan (FMP) - Series 6 (3668 Days) Dir Growth | match | +0.000 |
| 3319001 | Axis Bluechip Fund - Regular Growth | match | +0.000 |
| 1058877 | HDFC Flexi Cap Fund - Direct Plan - Growth Option | match | +0.000 |

### oldcams_p20_20yr.pdf

| Folio | Scheme | Status | App minus CAS units |
|---|---|---|---:|
| 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | units_differ | -53895.083 |
| 2215508 | ICICI Prudential Bluechip Fund - Growth | units_differ | -43713.123 |
| 1047392 / 12 | HDFC Balanced Advantage Fund - Regular Plan - IDCW Reinvestment | match | +0.000 |
| 7781230 | HSBC Value Fund - Direct Plan - Growth | match | +0.000 |
| 1047392 / 12 | HDFC Regular Savings Fund - Direct Plan - Growth Option | match | +0.000 |

### fam_10yr.pdf

| Folio | Scheme | Status | App minus CAS units |
|---|---|---|---:|
| 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | units_differ | -274229.493 |
| 5590112 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | units_differ | -187260.426 |
| 1047392 / 12 | HDFC Balanced Advantage Fund - Regular Plan - IDCW Reinvestment | units_differ | -149574.880 |
| 3310557 | Axis Bluechip Fund - Regular Growth | units_differ | -97784.944 |
| 1047392 / 12 | HDFC Flexi Cap Fund - Direct Plan - Growth Option | units_differ | -19769.265 |

### px_14yr.pdf

| Folio | Scheme | Status | App minus CAS units |
|---|---|---|---:|
| 1022001 | HDFC Liquid Fund - Growth | units_differ | +95823.024 |
| 8812555 | Axis Bluechip Fund - Direct Growth | match | +0.000 |
| 5512001 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | match | +0.000 |
| 6677001 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | match | +0.000 |
| 4400555 / 1 | Nippon India Index Fund - Nifty 50 Plan - Direct Plan Growth Plan - Growth Option | match | +0.000 |

### p20_FY.pdf → p20_20yr.pdf

| Folio | Scheme | Status | App minus CAS units |
|---|---|---|---:|
| 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | units_differ | -53895.083 |
| 2215508 | ICICI Prudential Bluechip Fund - Growth | units_differ | -43713.123 |
| 5570099 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | match | +0.000 |
| 4400918 / 3 | Nippon India Index Fund - Nifty 50 Plan - Direct Plan Growth Plan - Growth Option | match | +0.000 |
| 1047392 / 12 | HDFC Flexi Cap Fund - Direct Plan - Growth Option | match | +0.000 |

### p20_FY.pdf → p20_FY_altfolio.pdf

| Folio | Scheme | Status | App minus CAS units |
|---|---|---|---:|
| 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | units_differ | -435915.310 |
| 4400918 / 3 | Nippon India Index Fund - Nifty 50 Plan - Direct Plan Growth Plan - Growth Option | units_differ | -279568.027 |
| 4400918/3 | Nippon India Index Fund - Nifty 50 Plan - Direct Plan Growth Plan - Growth Option | units_differ | -279568.027 |
| 3310557 | Axis Bluechip Fund - Regular Growth | units_differ | -167992.811 |
| 1047392 / 12 | HDFC Flexi Cap Fund - Direct Plan - Growth Option | units_differ | -34146.563 |

## Reproduce

From backend, set SEQ to one scenario above and OUT to a temporary JSON path, then run:

```powershell
.venv\Scripts\python.exe -m pytest "../Docs/CAS Files/synthetic/harness/test_deep.py" -q --rootdir "../Docs/CAS Files/synthetic/harness"
```

Each scenario runs in its own process/database. Password MF@123 is the synthetic fixture password. The harness output includes reconcile: folio, scheme, status, diff_units.

## Staging checkpoint

pending — needs user: deploy Phase 1 to staging, upload one synthetic statement, open Profile → Import health, and compare its statuses with this table. No AWS/staging deployment or screenshot verification was performed.

## After phase 2

Recorded 2026-10-06 on Windows, Python 3.14.3, Node 25.8.2. All 18 scenarios ran against live mfapi.in in separate processes and databases. Phase 3 was not started.

### Comparison rule

Primary check: persisted app units versus the CAS closing units. Value check: app units × the CAS printed valuation.nav versus CAS closing units × the same NAV, tolerance ₹1 per fund/folio. This isolates units from changing prices. The user approved this checkpoint mechanics correction because CAS prices are dated 5 Oct while live dashboard prices are newer. Application valuation behavior was not changed.

### Scenario totals — live — not used for pass/fail

| Scenario | Live dashboard total (₹) | Phase 1 match | Phase 2 match | Units differ | No CAS data | CAS openings |
|---|---:|---:|---:|---:|---:|---:|
| p20_20yr.pdf | 191,527,931.13 | 9 | 9 | 2 | 1 | 0 |
| p20_10yr.pdf | 195,984,046.88 | 4 | 9 | 1 | 1 | 8 |
| p20_7yr.pdf | 195,984,046.88 | 2 | 8 | 1 | 1 | 8 |
| p20_3yr.pdf | 198,772,605.33 | 0 | 8 | 1 | 0 | 9 |
| p20_1yr.pdf | 200,203,135.26 | 0 | 8 | 1 | 0 | 9 |
| p20_FY.pdf | 200,493,689.23 | 0 | 8 | 1 | 0 | 9 |
| p10_10yr.pdf | 134,136,171.32 | 5 | 5 | 1 | 0 | 0 |
| p10_FY.pdf | 150,180,138.13 | 0 | 5 | 1 | 0 | 6 |
| p7_7yr.pdf | 117,648,851.97 | 3 | 3 | 2 | 0 | 0 |
| p3_FY.pdf | 1,520,685.89 | 0 | 3 | 0 | 0 | 3 |
| kfin_pk_10yr.pdf | 50,317,402.18 | 4 | 4 | 0 | 0 | 0 |
| kfin_p7_7yr.pdf | 117,648,851.97 | 3 | 3 | 2 | 0 | 0 |
| oldcams_p20_20yr.pdf | 191,527,931.13 | 9 | 9 | 2 | 1 | 0 |
| fam_10yr.pdf | 330,120,218.21 | 9 | 14 | 2 | 1 | 8 |
| px_14yr.pdf | 30,077,695.07 | 7 | 10 | 0 | 1 | 0 |
| p20_FY.pdf → p20_20yr.pdf | 191,527,931.13 | 9 | 9 | 2 | 1 | 0 |
| p20_20yr.pdf → p20_FY.pdf | 191,527,931.13 | n/a (full-history baseline: 9) | 9 | 2 | 1 | 0 |
| p20_FY.pdf → p20_FY_altfolio.pdf | 307,220,272.30 | 0 | 12 | 1 | 0 | 13 |

No original scenario has a lower match count. Reverse upload order is new in this phase and equals the full-history baseline. The alternate-folio scenario still duplicates overlapping holdings because folio normalization belongs to Phase 4; its live total is not a pass/fail value check.

### p20 per-fund value checks at the CAS printed NAV

Rows below include closed funds. PASS means absolute value difference ≤ ₹1. The only non-passing rows are the Phase 3 exceptions listed afterward.

#### p20_20yr.pdf

| Folio | Fund | CAS units | App units | CAS NAV | App minus CAS value (₹) | Check |
|---|---|---:|---:|---:|---:|---|
| 1047392 / 12 | HDFC Flexi Cap Fund - Growth Option | 4218.085 | 4218.085 | 1951.4190 | +0.00 | PASS |
| 1047392 / 12 | HDFC Liquid Fund - Growth | 0 | 0 | 5531.7426 | +0.00 | PASS |
| 1047392 / 12 | HDFC Balanced Advantage Fund - Regular Plan - IDCW Reinvestment | 363011.298 | 363011.298 | 34.3200 | +0.00 | PASS |
| 1047392 / 12 | HDFC Flexi Cap Fund - Direct Plan - Growth Option | 34304.385 | 34304.385 | 2150.0820 | +0.00 | PASS |
| 1047392 / 12 | HDFC Regular Savings Fund - Direct Plan - Growth Option | 0 | 0 | 34.1713 | +0.00 | PASS |
| 2215508 | ICICI Prudential Bluechip Fund - Growth | 91797.558 | 48084.435 | 101.6000 | -4,441,253.30 | Phase 3 exception |
| 3310557 | Axis Bluechip Fund - Regular Growth | 169763.685 | 169763.685 | 56.6400 | +0.00 | PASS |
| 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | 439004.391 | 385109.308 | 88.2569 | -4,756,612.95 | Phase 3 exception |
| 5570099 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | 199703.675 | 199703.675 | 88.2569 | +0.00 | PASS |
| 7781230 | Unifund Small Cap Equity Fund - Direct Plan - Growth | 0 | 0 | 31.8741 | +0.00 | PASS |
| 7781230 | HSBC Value Fund - Direct Plan - Growth | 149107.899 | 149107.899 | 122.4233 | +0.00 | PASS |
| 4400918 / 3 | Nippon India Index Fund - Nifty 50 Plan - Direct Plan Growth Plan - Growth Option | 289300.787 | 289300.787 | 41.4263 | +0.00 | PASS |

#### p20_10yr.pdf

| Folio | Fund | CAS units | App units | CAS NAV | App minus CAS value (₹) | Check |
|---|---|---:|---:|---:|---:|---|
| 1047392 / 12 | HDFC Flexi Cap Fund - Growth Option | 4218.085 | 4218.085 | 1951.4190 | +0.00 | PASS |
| 1047392 / 12 | HDFC Balanced Advantage Fund - Regular Plan - IDCW Reinvestment | 363011.298 | 363011.298 | 34.3200 | +0.00 | PASS |
| 1047392 / 12 | HDFC Flexi Cap Fund - Direct Plan - Growth Option | 34304.385 | 34304.385 | 2150.0820 | +0.00 | PASS |
| 1047392 / 12 | HDFC Regular Savings Fund - Direct Plan - Growth Option | 0 | 0 | 34.1713 | +0.00 | PASS |
| 2215508 | ICICI Prudential Bluechip Fund - Growth | 91797.558 | 91797.558 | 101.6000 | +0.00 | PASS |
| 3310557 | Axis Bluechip Fund - Regular Growth | 169763.685 | 169763.685 | 56.6400 | +0.00 | PASS |
| 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | 439004.391 | 385109.308 | 88.2569 | -4,756,612.95 | Phase 3 exception |
| 5570099 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | 199703.675 | 199703.675 | 88.2569 | +0.00 | PASS |
| 7781230 | Unifund Small Cap Equity Fund - Direct Plan - Growth | 0 | 0 | 31.8741 | +0.00 | PASS |
| 7781230 | HSBC Value Fund - Direct Plan - Growth | 149107.899 | 149107.899 | 122.4233 | +0.00 | PASS |
| 4400918 / 3 | Nippon India Index Fund - Nifty 50 Plan - Direct Plan Growth Plan - Growth Option | 289300.787 | 289300.787 | 41.4263 | +0.00 | PASS |

#### p20_7yr.pdf

| Folio | Fund | CAS units | App units | CAS NAV | App minus CAS value (₹) | Check |
|---|---|---:|---:|---:|---:|---|
| 1047392 / 12 | HDFC Flexi Cap Fund - Growth Option | 4218.085 | 4218.085 | 1951.4190 | +0.00 | PASS |
| 1047392 / 12 | HDFC Balanced Advantage Fund - Regular Plan - IDCW Reinvestment | 363011.298 | 363011.298 | 34.3200 | +0.00 | PASS |
| 1047392 / 12 | HDFC Flexi Cap Fund - Direct Plan - Growth Option | 34304.385 | 34304.385 | 2150.0820 | +0.00 | PASS |
| 2215508 | ICICI Prudential Bluechip Fund - Growth | 91797.558 | 91797.558 | 101.6000 | +0.00 | PASS |
| 3310557 | Axis Bluechip Fund - Regular Growth | 169763.685 | 169763.685 | 56.6400 | +0.00 | PASS |
| 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | 439004.391 | 385109.308 | 88.2569 | -4,756,612.95 | Phase 3 exception |
| 5570099 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | 199703.675 | 199703.675 | 88.2569 | +0.00 | PASS |
| 7781230 | Unifund Small Cap Equity Fund - Direct Plan - Growth | 0 | 0 | 31.8741 | +0.00 | PASS |
| 7781230 | HSBC Value Fund - Direct Plan - Growth | 149107.899 | 149107.899 | 122.4233 | +0.00 | PASS |
| 4400918 / 3 | Nippon India Index Fund - Nifty 50 Plan - Direct Plan Growth Plan - Growth Option | 289300.787 | 289300.787 | 41.4263 | +0.00 | PASS |

#### p20_3yr.pdf

| Folio | Fund | CAS units | App units | CAS NAV | App minus CAS value (₹) | Check |
|---|---|---:|---:|---:|---:|---|
| 1047392 / 12 | HDFC Flexi Cap Fund - Growth Option | 4218.085 | 4218.085 | 1951.4190 | +0.00 | PASS |
| 1047392 / 12 | HDFC Balanced Advantage Fund - Regular Plan - IDCW Reinvestment | 363011.298 | 363011.298 | 34.3200 | +0.00 | PASS |
| 1047392 / 12 | HDFC Flexi Cap Fund - Direct Plan - Growth Option | 34304.385 | 34304.385 | 2150.0820 | +0.00 | PASS |
| 2215508 | ICICI Prudential Bluechip Fund - Growth | 91797.558 | 91797.558 | 101.6000 | +0.00 | PASS |
| 3310557 | Axis Bluechip Fund - Regular Growth | 169763.685 | 169763.685 | 56.6400 | +0.00 | PASS |
| 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | 439004.391 | 416525.437 | 88.2569 | -1,983,922.80 | Phase 3 exception |
| 5570099 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | 199703.675 | 199703.675 | 88.2569 | +0.00 | PASS |
| 4400918 / 3 | Nippon India Index Fund - Nifty 50 Plan - Direct Plan Growth Plan - Growth Option | 289300.787 | 289300.787 | 41.4263 | +0.00 | PASS |
| 7781230 | HSBC Value Fund - Direct Plan - Growth | 149107.899 | 149107.899 | 122.4233 | +0.00 | PASS |

#### p20_1yr.pdf

| Folio | Fund | CAS units | App units | CAS NAV | App minus CAS value (₹) | Check |
|---|---|---:|---:|---:|---:|---|
| 1047392 / 12 | HDFC Flexi Cap Fund - Growth Option | 4218.085 | 4218.085 | 1951.4190 | +0.00 | PASS |
| 1047392 / 12 | HDFC Balanced Advantage Fund - Regular Plan - IDCW Reinvestment | 363011.298 | 363011.298 | 34.3200 | +0.00 | PASS |
| 1047392 / 12 | HDFC Flexi Cap Fund - Direct Plan - Growth Option | 34304.385 | 34304.385 | 2150.0820 | +0.00 | PASS |
| 2215508 | ICICI Prudential Bluechip Fund - Growth | 91797.558 | 91797.558 | 101.6000 | +0.00 | PASS |
| 3310557 | Axis Bluechip Fund - Regular Growth | 169763.685 | 169763.685 | 56.6400 | +0.00 | PASS |
| 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | 439004.391 | 432641.905 | 88.2569 | -561,533.29 | Phase 3 exception |
| 5570099 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | 199703.675 | 199703.675 | 88.2569 | +0.00 | PASS |
| 4400918 / 3 | Nippon India Index Fund - Nifty 50 Plan - Direct Plan Growth Plan - Growth Option | 289300.787 | 289300.787 | 41.4263 | +0.00 | PASS |
| 7781230 | HSBC Value Fund - Direct Plan - Growth | 149107.899 | 149107.899 | 122.4233 | +0.00 | PASS |

#### p20_FY.pdf

| Folio | Fund | CAS units | App units | CAS NAV | App minus CAS value (₹) | Check |
|---|---|---:|---:|---:|---:|---|
| 1047392 / 12 | HDFC Flexi Cap Fund - Growth Option | 4218.085 | 4218.085 | 1951.4190 | +0.00 | PASS |
| 1047392 / 12 | HDFC Balanced Advantage Fund - Regular Plan - IDCW Reinvestment | 363011.298 | 363011.298 | 34.3200 | +0.00 | PASS |
| 1047392 / 12 | HDFC Flexi Cap Fund - Direct Plan - Growth Option | 34304.385 | 34304.385 | 2150.0820 | +0.00 | PASS |
| 2215508 | ICICI Prudential Bluechip Fund - Growth | 91797.558 | 91797.558 | 101.6000 | +0.00 | PASS |
| 3310557 | Axis Bluechip Fund - Regular Growth | 169763.685 | 169763.685 | 56.6400 | +0.00 | PASS |
| 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | 439004.391 | 435915.310 | 88.2569 | -272,632.71 | Phase 3 exception |
| 5570099 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | 199703.675 | 199703.675 | 88.2569 | +0.00 | PASS |
| 4400918 / 3 | Nippon India Index Fund - Nifty 50 Plan - Direct Plan Growth Plan - Growth Option | 289300.787 | 289300.787 | 41.4263 | +0.00 | PASS |
| 7781230 | HSBC Value Fund - Direct Plan - Growth | 149107.899 | 149107.899 | 122.4233 | +0.00 | PASS |

### Explicit remaining Phase 3 exceptions

| Scenario | Folio | Fund | App minus CAS units | Cause |
|---|---|---|---:|---|
| p20_20yr.pdf | 2215508 | ICICI Prudential Bluechip Fund - Growth | -43713.123 | Amount-less bonus units skipped (#3) |
| p20_20yr.pdf | 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | -53895.083 | Identical twin SIP rows deduplicated (#2) |
| p20_10yr.pdf | 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | -53895.083 | Identical twin SIP rows deduplicated (#2) |
| p20_7yr.pdf | 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | -53895.083 | Identical twin SIP rows deduplicated (#2) |
| p20_3yr.pdf | 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | -22478.954 | Identical twin SIP rows deduplicated (#2) |
| p20_1yr.pdf | 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | -6362.486 | Identical twin SIP rows deduplicated (#2) |
| p20_FY.pdf | 5570012 | Parag Parikh Flexi Cap Fund - Direct Plan Growth | -3089.081 | Identical twin SIP rows deduplicated (#2) |

### Known exceptions (owned by Phase 5)

The user approved this pre-existing zero-value alias as a Phase 2 checkpoint exception and ruled Task 8 DONE. The matcher is unchanged. Phase 5 must save the closed CAS-only fund under its own name and turn its row to match.

| Scenario | Fund as printed on CAS | Matched scheme | App units | CAS closing units | Value (₹) | Phase 1 status |
|---|---|---|---:|---:|---:|---|
| p20_20yr.pdf | Unifund Small Cap Equity Fund - Direct Plan - Growth | UTI Small Cap Fund - Direct Plan - Growth | 0 | 0 | 0 | no_cas_data |
| p20_10yr.pdf | Unifund Small Cap Equity Fund - Direct Plan - Growth | UTI Small Cap Fund - Direct Plan - Growth | 0 | 0 | 0 | no_cas_data |
| p20_7yr.pdf | Unifund Small Cap Equity Fund - Direct Plan - Growth | UTI Small Cap Fund - Direct Plan - Growth | 0 | 0 | 0 | no_cas_data |
| oldcams_p20_20yr.pdf | Unifund Small Cap Equity Fund - Direct Plan - Growth | UTI Small Cap Fund - Direct Plan - Growth | 0 | 0 | 0 | no_cas_data |
| fam_10yr.pdf | Unifund Small Cap Equity Fund - Direct Plan - Growth | UTI Small Cap Fund - Direct Plan - Growth | 0 | 0 | 0 | no_cas_data |
| px_14yr.pdf | Unifund Small Cap Equity Fund - Direct Plan - Growth | UTI Small Cap Fund - Direct Plan - Growth | 0 | 0 | 0 | no_cas_data |
| p20_FY.pdf → p20_20yr.pdf | Unifund Small Cap Equity Fund - Direct Plan - Growth | UTI Small Cap Fund - Direct Plan - Growth | 0 | 0 | 0 | no_cas_data |
| p20_20yr.pdf → p20_FY.pdf | Unifund Small Cap Equity Fund - Direct Plan - Growth | UTI Small Cap Fund - Direct Plan - Growth | 0 | 0 | 0 | no_cas_data (full-history baseline; reverse order new) |

Each original scenario has the same no_cas_data folio/scheme/status row in its saved Phase 1 base_<scenario>.json. This is not a regression; the new reverse-order scenario inherits the same full-history row.


### Upload order and conversion checks

- FY → 20yr and 20yr → FY have identical final units for every persisted folio/ISIN and identical live value ₹191,527,931.13. Both have zero CAS opening rows left. In the reverse order, FY confirm returns 409 already_imported and writes no opening.

- px_14yr live value is ₹30,077,695.07 (about ₹3.01 Cr), versus Phase 1 ₹162,418,528.40. Old HDFC Liquid ISIN INF179K01KG8 ends at 0; new ISIN INF179KB1HK0 holds 829.574 units, exactly the CAS closing units. Reconciliation is 10 match, 0 units_differ, 1 no_cas_data. Face-value conversion and amount-less merger both pair; descriptions typed PURCHASE/REDEMPTION require the approved correction.

### XIRR arithmetic guard

The initial network-restricted px_14yr run overflowed in **member lifetime XIRR** during Newton iteration, before aggregate/current-holdings XIRR could be returned. Its external flows have 234 outflows and 26 positive transaction inflows, from 2012-03-01 through 2026-09-05; the terminal entry is dated 2026-10-06 and was zero because NAV access was blocked. Largest outflow: ₹2,096,400.00; largest transaction inflow: ₹2,071,702.53. The narrow Decimal guard now returns None when the solver cannot compute. On the final live run the terminal value is ₹30,077,695.07, adding a 27th positive inflow; member and aggregate dashboards return successfully.

### Execution notes

The first restricted-network outputs with zero valuations were discarded. Network-enabled runs were used for all totals above. A temporary pytest observer outside the repo exported persisted units, opening counts, cached holding prices and synthetic XIRR flow summaries. An observer UUID conversion error was corrected and affected scenarios rerun; no application or harness source change was needed for that instrumentation. JSON/log outputs remain under the Windows TEMP directory as p2_<scenario>.json/.log.

Postgres functional tests: SKIPPED (TEST_DATABASE_URL unset). SQLite migration upgrade/downgrade passed. Phase 1 staging Import health checkpoint remains pending — needs user, carried to the Phase 7 gate.

## After phase 3 (2026-10-06, run by the orchestrator in WSL; Codex hit its usage limit after Task 1)

Primary check: reconciliation status per fund (app units = CAS closing units). With the CAS's own NAV on both sides, a unit match is a value match (carry-over 4). Postgres 16.2: migrations 0025/0026 upgrade → downgrade 0025 → upgrade clean; `tests/functional_postgres` 13 passed.

| Scenario | match / differ / no_CAS | Phase 2 → Phase 3 |
|---|---|---|
| p20_20yr | 11 / 0 / 1 | twin-SIP + bonus rows fixed |
| p20_10yr | 10 / 0 / 1 | twin-SIP fixed |
| p20_7yr | 9 / 0 / 1 | twin-SIP fixed |
| p20_3yr | 9 / 0 / 0 | twin-SIP fixed |
| p20_1yr | 9 / 0 / 0 | twin-SIP fixed |
| p20_FY | 9 / 0 / 0 | twin-SIP fixed |
| p10_10yr | 6 / 0 / 0 | all match |
| p10_FY | 6 / 0 / 0 | all match |
| p7_7yr | 5 / 0 / 0 | bounced SIPs + gift now match |
| kfin_p7_7yr | 5 / 0 / 0 | same as CAMS layout |
| p3_FY | 3 / 0 / 0 | unchanged |
| oldcams_p20_20yr | 11 / 0 / 1 | as p20_20yr |
| fam_10yr | 16 / 0 / 1 | all differ rows fixed |
| px_14yr | 10 / 0 / 1 | unchanged (Phase 2 fix holds) |
| p20_FY → p20_20yr | 11 / 0 / 1 | identical to p20_20yr |
| p20_20yr → p20_FY | 11 / 0 / 1 | second confirm 409 already_imported (correct) |
| p20_FY → p20_FY_altfolio | 13 / 0 / 0 | reconciliation matches by folio_key; the duplicated-folio value overstatement remains (Phase 4) |
| kfin_pk_10yr | 3 / **1** / 0 | **newly exposed, owned by Phase 5** (below) |

**Known exceptions**
- **Unifund → UTI** `no_cas_data` (0 units, ₹0): unchanged, owned by Phase 5 (carry-over 5).
- **Franklin Low Duration segregated portfolio (kfin_pk_10yr):** the CAS lists the side pocket as its own fund (ISIN INF090I01UD7, AMFI 147989, 423,983.118 units). Today's mfapi-based matcher files it under the main Franklin fund's code (118530, #8 wrong identity). Until Phase 3 its SEGREGATION units weren't counted, so the error was invisible; Phase 3 counts them (decided), so the main Franklin folio now shows +423,983.118 units, valued at the main fund's NAV. Units across the two lines are right; the attribution is wrong. Owned by Phase 5 (ISIN-first identity), carry-over 8. Not deployed between phases, so it exists only in the in-progress code.

## After phase 4 (2026-10-06, orchestrator in WSL)

Postgres 16.2: 0027 upgrade → downgrade 0026 → upgrade clean; `tests/functional_postgres` 14 passed (incl. the 0027 duplicate-folio merge with real UUIDs and link cascades on the partitioned table).

| Scenario | match / differ / no_CAS | Note |
|---|---|---|
| p20_FY → p20_FY_altfolio | 9 / 0 / 0 | one folio per fund; second upload 409 already_imported; live value equals a single FY upload (was ~₹30.7 Cr double count) |
| p20_FY → p20_20yr, delete FY | 11 / 0 / 1 | 20-year rows covering the FY period kept |
| p20_FY → p20_20yr, delete 20-year | 9 / 0 / 0 | FY opening balance restored automatically |
| p20_10yr → p20_20yr, delete 20-year | 10 / 0 / 1 | 10-year opening restored |
| all 17 earlier scenarios | unchanged from phase 3 | no regressions |

Known exceptions unchanged (Phase 5): Unifund→UTI `no_cas_data`; Franklin segregated portfolio (+423,983.118 on the main Franklin folio in kfin_pk_10yr).

## After phase 5 (2026-10-06, Codex on Windows)

Migration 0028: Postgres 16.2 upgrade head → downgrade 0027 → upgrade head clean; full `tests/functional_postgres` **14 passed, no skips**. SQLite and Postgres nullable-code / downgrade-refusal tests also pass. Final affected-test run: **362 passed, 4 skipped** (missing optional synthetic family fixtures), plus **32 passed** for health/merge/deletion routes and services. No full backend suite was run.

AMFI master loaded into an isolated local SQLite dev DB under `%TEMP%/cas-fixes-p5-dev.db` using the daily job and the fresh portal NAVAll feed: **14,356 rows**, first run **14,356 inserted / 0 updated / 0 deactivated**; second run **0 inserted / 0 updated / 0 deactivated**. Each harness process seeds that master into its fresh test DB. No real CAS files or the user's dev database were used.

All **21 scenarios pass twice**: normal network and mfapi.in blocked (42 successful runs). The blocked run uses the proxy plus a temporary HTTP transport guard rejecting api.mfapi.in requests. No production fetcher was replaced. Every preview is confirmed; no plan is unclassified. Every final reconciliation row is `match`; values at the CAS's printed NAV differ by **₹0** wherever a printed NAV is available. Every immediate repeat confirm returns **409 already_imported**. No scenario's match count decreases versus Phase 4. The table includes all final rows, including closed funds.

| Scenario | Normal match / differ / no_CAS | Blocked match / differ / no_CAS | Live dashboard total (₹) — not used for pass/fail |
|---|---|---|---|
| p20_20yr | 12 / 0 / 0 | 12 / 0 / 0 | 200767882.2409798 |
| p20_10yr | 11 / 0 / 0 | 11 / 0 / 0 | 200767882.2409798 |
| p20_7yr | 10 / 0 / 0 | 10 / 0 / 0 | 200767882.2409798 |
| p20_3yr | 9 / 0 / 0 | 9 / 0 / 0 | 200767882.2409798 |
| p20_1yr | 9 / 0 / 0 | 9 / 0 / 0 | 200767882.2409798 |
| p20_FY | 9 / 0 / 0 | 9 / 0 / 0 | 200767882.2409798 |
| p10_10yr | 6 / 0 / 0 | 6 / 0 / 0 | 150757781.2550799 |
| p10_FY | 6 / 0 / 0 | 6 / 0 / 0 | 150757781.2550799 |
| p7_7yr | 5 / 0 / 0 | 5 / 0 / 0 | 120369886.6048974 |
| kfin_p7_7yr | 5 / 0 / 0 | 5 / 0 / 0 | 120369886.6048974 |
| p3_FY | 3 / 0 / 0 | 3 / 0 / 0 | 2010871.5239829 |
| oldcams_p20_20yr | 12 / 0 / 0 | 12 / 0 / 0 | 200767882.2409798 |
| fam_10yr | 17 / 0 / 0 | 17 / 0 / 0 | 351525663.4960597 |
| px_14yr | 11 / 0 / 0 | 11 / 0 / 0 | 30077695.0701948 |
| kfin_pk_10yr | 5 / 0 / 0 | 5 / 0 / 0 | 50317402.1815800 |
| FY_20yr | 12 / 0 / 0 | 12 / 0 / 0 | 200767882.2409798 |
| 20yr_FY | 12 / 0 / 0 | 12 / 0 / 0 | 200767882.2409798 |
| FY_altfolio | 9 / 0 / 0 | 9 / 0 / 0 | 200767882.2409798 |
| FY_20yr_delete_first | 12 / 0 / 0 | 12 / 0 / 0 | 200767882.2409798 |
| FY_20yr_delete_last | 9 / 0 / 0 | 9 / 0 / 0 | 200767882.2409798 |
| 10yr_20yr_delete_last | 11 / 0 / 0 | 11 / 0 / 0 | 200767882.2409798 |

Blocked live dashboard totals are ₹0 because no NAV history is available in those fresh databases; this does not enter pass/fail. Unit equality and both sides valued at the same CAS printed NAV are the checks.

**Identity acceptance criteria cleared.** Franklin main INF090I01HG7 / **118530** and segregated INF090I01UD7 / **147989** resolve to separate AMFI Scheme IDs in both runs. In kfin_pk_10yr the main row has app/CAS **0.000 units**, CAS NAV **29.6198**; the side pocket has app/CAS **423,983.118 units**, CAS NAV **0**, value **₹0**. Both reconcile `match`; the side pocket never borrows the main NAV. AMFI currently gives both codes the same displayed base name, but IDs/ISINs remain distinct.

Unifund Small Cap Equity Fund - Direct Plan - Growth imports under its own CAS name as `source=cas_only`, AMFI code NULL, app/CAS **0 units**, value **₹0**, `match`; never UTI. The old HDFC Liquid ISIN INF179K01KG8 also imports as a closed CAS-only fund. Closed-only repeat tests prove no extra Scheme or Folio. Adviser-held Direct and DSP Dir/Reg rows are classified from the master/name rules; ARN never decides plan. Unknown closed plans may be Regular with plan_verified=False; they do not become unclassified or block import.

**Orchestrator rulings applied.** Exact master ISIN (primary or reinvestment) always verifies, identified_by=isin. Identification retains `nav_matched` True/False/None; mismatch cannot redirect or block that fund. In px_14yr (1 Oct), HDFC Liquid printed **5531.7426** vs mfapi **5529.1083**, and JioBlackRock printed **10.0081** vs mfapi **9.5259** now verify; the strict NAV fingerprint still applies without an ISIN hit. Fixtures and tolerances were not changed. Existing Import health NAV checks compare cached exact-date NAV with the printed CAS NAV independently of units. Reconciliation and restore-on-delete now accept either master ISIN, without falling back to code/name on an ISIN mismatch. Migration 0027's frozen matcher was left alone.

**Daily jobs against the changed schemes table** (all exited 0, once each after master load):

| Job | Seconds | Persisted result / check |
|---|---:|---|
| refresh_nav_daily | 1.24 | 0 held schemes / 0 fetches / 0 NAV rows; held-folio join verified, no fetch for all 14,356 master rows |
| refresh_benchmark_daily | 3.76 | 4 indices succeeded; 9,908 benchmark history rows |
| refresh_ter_monthly | 13.69 | 0 TER rows; master plan_name_variant remains NULL as planned |
| refresh_aaum_quarterly | 32.75 | 8,569 AAUM rows |
| run_analytics_recompute | 1.11 | 0 households / 0 analytics sections |
| delete_expired_accounts_daily | 1.77 | 0 deleted accounts |
| app.scripts.expire_cas_files | 1.38 | 0 expired PDFs / 0 stale CAMS requests |

The isolated dev DB intentionally had no households/imports: the NAV, recompute and cleanup runs therefore verify startup/schema compatibility and empty-input behavior. Held-scheme NAV and deletion paths are exercised by affected tests and the synthetic harness, not by those empty daily jobs.

Scheduler change matches the plan's existing job-block formatting. **terraform fmt -check / validate: pending — orchestrator runs in WSL** (user ruling; neither apply nor plan run).

Self-review fixed: code overrides inheriting the original preview's plan; CAS-only identities changing to verified on repeat; reinvestment-ISIN reconciliation/restore mismatch; Windows edit-helper text encoding damage. Superseded checkpoint attempts exposed these issues; the final numbers above come from fresh successful runs. A temporary outage-wrapper setup error was fixed before rerunning the blocked scenarios. No Phase 6 work started.

## After phase 6 (2026-10-06, orchestrator in WSL — Task 12 checkpoint, Steps 1–2)

**Postgres (local test server, never staging):** `alembic upgrade head` → `downgrade 0028` → `upgrade head` clean (0029 down and up); `tests/functional_postgres` 14 passed.

**Synthetic, all 21 scenarios** (`MASTER_FILE=navall_2026-10-06.txt`, `SNAP=1`, outputs `/tmp/p6/p6_*.json`): every scenario passes, and every reconciliation row is `match`. Snapshot months: p20 20-year 247, p10 128, pk 125, px 175, p7 92; FY-then-20 has 247 months with no near-zero recent month.

| Scenario | Lifetime XIRR app / truth | Current XIRR app / truth | Snapshot months off truth |
|---|---|---|---|
| p20_20yr | 14.67 / 14.67 | 15.47 / 15.47 | 0 |
| oldcams_p20_20yr | 14.67 / 14.67 | 15.47 / 15.47 | 0 |
| fy_then_20 (+ delete first) | 14.67 / 14.67 | 15.47 / 15.47 | 0 |
| p10_10yr | 14.53 / 14.54 | 14.53 / 14.54 | 0 |
| p7_7yr, kfin_p7_7yr | 11.18 / 11.19 | 11.18 / 11.19 | 0 |
| kfin_pk_10yr | 12.48 / 12.49 | 15.16 / 15.17 | 0 |
| px_14yr | 11.82 / 11.83 | 12.98 / 18.62 (truth limit, below) | 0 |

The truth is only valid when every opening balance is 0. On FY, 1yr, 3yr and 7yr files, on p20_10yr and on fam (multi-member), and after delete-last, it reports the solver cap or another file's numbers. Those rows are not checks. Units still all match.

**Carry-over 16 (p20 XIRR gap): resolved, harness bug, no app change.** The app's and the truth's cash-flow lists were diffed per fund and date for p20_20yr. Totals are identical (−₹4,33,28,582.05). All per-date differences are switch/merger legs that cancel on the same day, plus HDFC Balanced Advantage IDCW, which the CAS prints under its reinvestment ISIN `INF179K01822` and the app stores under the scheme's primary ISIN `INF179K01814` (AMFI 100120 lists both). The truth looked NAVs up by CAS ISIN, found none, and dropped 363,011 units (about ₹1.25 Cr) from its terminal value. `harness/test_deep.py` now resolves a reinvestment ISIN through the master; with that, truth = app exactly (above). Nothing in the app was tuned.

**px_14yr current-holdings XIRR, truth-formula limit, no app change.** The truth keeps per-ISIN funds with units today. It drops (a) the ₹20,96,400 bought on HDFC Liquid's old ISIN `INF179K01KG8` (closed by conversion to `INF179KB1HK0`) and (b) the ₹6,98,800 invested in Unifund before its amount-less merger into HSBC Value. It keeps the later redemptions, so its current XIRR is inflated. The app carries that cost across the conversion and merger legs, which is the money that ended up in today's funds. Lifetime agrees (11.82 / 11.83).

**App bug found and fixed (test-first): monthly history ignored a 0 NAV.** The Phase 6 bulk snapshot rewrite skipped `nav == 0` rows, so pk's Franklin segregated portfolio (written off to NAV 0 on 2020-07-20) kept its last NAV ₹1.1077 forever: about ₹4,69,646 too high in every month since. The dashboard (and the pre-6A code) values it at 0. Now `nav >= 0` is used; pk snapshot months off truth went 4 → 0. Test: `test_snapshots.py::test_written_off_fund_is_worth_zero_after_its_nav_drops_to_zero`.

**Realised gains** (`realized_summary`):
- pk: Franklin Low Duration ₹26,39,862.20 and Axis Liquid ₹8,96,314.17, both fully sold.
- p20: sold funds Regular Savings ₹9,28,873.78, HDFC Liquid ₹20,17,039.48 and Unifund ₹65,88,072.58, ₹95.34 L in all (the plan's "≈₹96 L" was rounded). Total realised is ₹1,45,60,498.52.

**SIPs:**
- The 2013 HDFC Flexi Cap Regular SIP (₹21,485) is `stopped`.
- Twins: p20 Parag Parikh ₹42,967.85 × 2, and p10 Parag Parikh ₹90,520.47 × 2.
- **New finding, needs a decision (carry-over 19):** from July 2020 the 0.005% stamp duty reduces each instalment's invested amount (₹53,712.50 → ₹53,709.81). Under the decided rule "exact amounts distinguish series", one SIP therefore splits into an active series and a phantom `stopped` series ending 2020-06-05. Active SIPs, the monthly total and the calendar are right; only the opt-in "Show stopped SIPs" list shows the phantoms.

**History cost:** first build for p20 (forced `rebuild_member_snapshots`) is 247 months in 0.28 s with 12 queries (targets under 10 s and under 200). `harness/test_perf.py` is stale: its confirm gets 409 because it doesn't seed the master or handle the people step. Its numbers weren't used.

**Restart test:** parse p20_FY, clear `service._preview_sessions` (what a deploy, crash or 9 PM stop does), then confirm. Result: 200, 39 rows, 8 holdings, identical to the no-restart control.

**Step 3 (staging + frontend checklist C1–C14): pending the user** (staging deploy and screenshots).

## Phase 7 gate (2026-10-06, orchestrator in WSL) — Step 1 (synthetic): PASSED; Step 2 (real files on staging): pending the user

**What ran:** every synthetic file on its own (30, including the three new gate files from `gen_gate_scenarios.py`) plus 16 upload orders. That covers every order Phase 7 Task 1 lists, plus family orders: own → family member's own → family statement, and family FY ↔ 10-year. Each scenario ran twice, normal and with mfapi.in blocked (`MFAPI_BLOCKED=1`): 96 runs with `MASTER_FILE`, `SNAP=1`. The harness now confirms with the same people-based request the app sends, and answers prompts as a user would.

**Result:**
- **43 of 46 scenarios pass in both modes:**
  - every fund matches the CAS;
  - zero funds need review, and none is `unclassified`;
  - a name is asked only for the no-name family statement, and only when that person isn't already a member;
  - no history gaps;
  - reconciliation is identical with mfapi.in blocked.
- **The other 3 behave as designed:**
  - `p3u_FY`: the unknown held fund needs an answer.
  - The two `p20_20yr,p20_FY` delete variants: FY is refused as already imported, so the only import is deleted and the account ends empty.

**Partial months:**
- With mfapi.in blocked, every month is partial (no NAV history). That's expected; it's flagged and never gapped.
- Normally, p20/p10/px months are partial only while a CAS-only fund (not in any master, e.g. Unifund until its 2022 merger) was held. **Recommended follow-up, not done:** price such funds from the CAS rows' own NAVs.

**Error files:** all 7 behave correctly. Six fail with a clear 4xx code; `err_unencrypted` is accepted (users may remove the password). Fixed: a demat (NSDL/CDSL) statement casparser can't read now returns `demat_cas` ("Demat statements aren’t supported yet…") instead of casparser's internal text (`parser.classify_parse_error`, test in `test_parser.py`).

**Stale item closed:** `CLAUDE.md`'s open "`FamilyImportFlow.tsx` missing `member_mismatch` retry" no longer applies. That component and the `member_mismatch` code were removed in `0fbafe5`; family imports go through the people popup (scenarios above).

**Design gap for Phase 7 Task 3 (needs a user decision):** for a held fund in no master, `identify_scheme` offers no candidates (p3u: `candidates == []`). The planned fallback dialog requires choosing a candidate for a held fund, so the user would be stuck. Options: import it as an unlisted fund valued at the CAS's printed NAV, or skip that fund.

**Built ahead of the gate (additive, no screen removed):**
- Task 2: `needs_review` and per-fund `candidates` on the preview (`test_service.py::test_needs_review_only_for_unidentified_held_funds`).
- Task 4: `backend/scripts/reclassify_folio_plans.py` with `--dry-run` (3 tests).
- `harness/test_real_check.py`, the counts-only check for real statements.

| Scenario | Normal | mfapi blocked | Match | Review items | Names asked | History months / gaps | Note |
|---|---|---|---|---|---|---|---|
| `p20_10yr,p20_3yr,p20_20yr` | pass | pass | 12/12 | 0 | 0 | 247 / 0 | repeat = already imported |
| `p20_20yr,p20_FY` | pass | pass | 12/12 | 0 | 0 | 247 / 0 | repeat = already imported |
| `p20_20yr,p20_FY` (+delete) | FAIL | FAIL | 0/0 | 0 | 0 | 0 / 0 | repeat = already imported; delete first: 200; expected: FY refused as already imported, so the only import is deleted → empty |
| `p20_20yr,p20_FY` (+delete) | FAIL | FAIL | 0/0 | 0 | 0 | 0 / 0 | repeat = already imported; delete last: 200; expected: FY refused as already imported, so the only import is deleted → empty |
| `fam_10yr,fam_FY` | pass | pass | 17/17 | 0 | 0 | 129 / 0 | repeat = already imported |
| `fam_10yr` | pass | pass | 17/17 | 0 | 0 | 129 / 0 |  |
| `fam_FY` | pass | pass | 15/15 | 0 | 0 | 6 / 0 |  |
| `fam_noname_FY` | pass | pass | 12/12 | 0 | 1 | 6 / 0 |  |
| `fam_FY,fam_10yr` | pass | pass | 17/17 | 0 | 0 | 129 / 0 |  |
| `p20_FY,p20_20yr` | pass | pass | 12/12 | 0 | 0 | 247 / 0 |  |
| `p20_FY,p20_20yr` (+delete) | pass | pass | 12/12 | 0 | 0 | 247 / 0 | delete first: 200 |
| `p20_FY,p20_20yr` (+delete) | pass | pass | 9/9 | 0 | 0 | 6 / 0 | delete last: 200 |
| `p20_FY,p20_FY_altfolio` | pass | pass | 9/9 | 0 | 0 | 6 / 0 | repeat = already imported |
| `kfin_p10_FY` | pass | pass | 6/6 | 0 | 0 | 6 / 0 |  |
| `kfin_p7_7yr` | pass | pass | 5/5 | 0 | 0 | 92 / 0 |  |
| `kfin_pk_10yr` | pass | pass | 5/5 | 0 | 0 | 125 / 0 |  |
| `kfin_pk_1yr` | pass | pass | 3/3 | 0 | 0 | 12 / 0 |  |
| `oldcams_p20_20yr` | pass | pass | 12/12 | 0 | 0 | 247 / 0 |  |
| `p20_FY,p10_10yr,fam_10yr` | pass | pass | 17/17 | 0 | 0 | 129 / 0 | member_not_in_file → import for these people |
| `p20_FY,p3_FY,fam_noname_FY` | pass | pass | 12/12 | 0 | 0 | 6 / 0 | repeat = already imported; member_not_in_file → import for these people |
| `p10_10yr` | pass | pass | 6/6 | 0 | 0 | 128 / 0 |  |
| `p10_1yr` | pass | pass | 6/6 | 0 | 0 | 12 / 0 |  |
| `p10_3yr` | pass | pass | 6/6 | 0 | 0 | 36 / 0 |  |
| `p10_7yr` | pass | pass | 6/6 | 0 | 0 | 93 / 0 |  |
| `p10_FY` | pass | pass | 6/6 | 0 | 0 | 6 / 0 |  |
| `p10_FY,p10_10yr` | pass | pass | 6/6 | 0 | 0 | 128 / 0 |  |
| `p20_10yr` | pass | pass | 11/11 | 0 | 0 | 129 / 0 |  |
| `p20_1yr` | pass | pass | 9/9 | 0 | 0 | 12 / 0 |  |
| `p20_20yr` | pass | pass | 12/12 | 0 | 0 | 247 / 0 |  |
| `p20_3yr` | pass | pass | 9/9 | 0 | 0 | 36 / 0 |  |
| `p20_7yr` | pass | pass | 10/10 | 0 | 0 | 93 / 0 |  |
| `p20_FY` | pass | pass | 9/9 | 0 | 0 | 6 / 0 |  |
| `p20_FY_altfolio` | pass | pass | 9/9 | 0 | 0 | 6 / 0 |  |
| `p20_20yr,fam_10yr` | pass | pass | 18/18 | 0 | 0 | 247 / 0 |  |
| `p3_1yr` | pass | pass | 3/3 | 0 | 0 | 12 / 0 |  |
| `p3_3yr` | pass | pass | 3/3 | 0 | 0 | 36 / 0 |  |
| `p3_FY` | pass | pass | 3/3 | 0 | 0 | 6 / 0 |  |
| `p3u_FY` | FAIL | FAIL | 0/0 | 1 | 0 | 0 / 0 | expected: unknown held fund needs an answer (confirm 409 override) |
| `p7_1yr` | pass | pass | 5/5 | 0 | 0 | 12 / 0 |  |
| `p7_3yr` | pass | pass | 5/5 | 0 | 0 | 36 / 0 |  |
| `p7_7yr` | pass | pass | 5/5 | 0 | 0 | 92 / 0 |  |
| `p7_FY` | pass | pass | 5/5 | 0 | 0 | 6 / 0 |  |
| `kfin_pk_1yr,kfin_pk_10yr` | pass | pass | 5/5 | 0 | 0 | 125 / 0 |  |
| `px_14yr` | pass | pass | 11/11 | 0 | 0 | 175 / 0 |  |
| `px_FY` | pass | pass | 8/8 | 0 | 0 | 6 / 0 |  |
| `px_FY,px_14yr` | pass | pass | 11/11 | 0 | 0 | 175 / 0 |  |

**Still required before Task 3 (the removal):**
- Step 2: real statements on staging (Import health all ✓, including 1–2 real KFintech files). The counts-only check can be run locally first.
- Step 4: the user confirms the gate passed.

## Phase 7 gate — FINAL (2026-10-06, after the three user decisions and their review fixes)

This supersedes the table in "Phase 7 gate" above, which ran before the unlisted-fund, stamp-duty and TER changes.

**Synthetic (Step 1): PASSED.**
- 46 scenarios × normal / mfapi.in blocked = 92 runs.
- 88 pass. The other 4 are the two `p20_20yr,p20_FY` delete variants in both modes, which end empty by design.
- Every fund matches the CAS in every scenario.
- **Zero funds need review anywhere.** `p3u_FY` now imports: its held fund is in no master and imports as unlisted.
- No history gaps.
- Reconciliation is identical with mfapi.in blocked.

**Effect of storing statement prices** (CAS-only funds):
- p20 partial months went from 178 to 24.
- px went from 89 to 0.
- The partial months that remain are periods where the statement prints no price for a CAS-only fund. Example: Unifund held through a 10-year window's opening balance until its 2022 merger, with no rows in between. They are flagged, never gapped.

**Real statements (Step 2, local): PASSED.**
- The user supplied two stakeholder files, both CAMS detailed statements of different investors: the "CP…2016–2026" file and the "10 Yr" file.
- They ran through `harness/test_real_check.py` (counts only; nothing from the statements is recorded here). Each was run on its own, with mfapi.in blocked, and in both upload orders (the second person becomes a family member).

| Run | Funds | Identified | Needs review | Reconciliation | History months / gaps |
|---|---|---|---|---|---|
| CP file | 4 | 4 verified | 0 | 4/4 match | 9 / 0 |
| 10 Yr file | 13 | 13 verified | 0 | 13/13 match | 72 / 0 |
| either order, both files | 17 | 17 verified | 0 | 17/17 match | 72 + 9 / 0 |
| mfapi.in blocked (all of the above) | same | same | 0 | same | all months flagged partial (no feed), 0 gaps |
| same file twice | — | — | — | second confirm 409 already_imported | — |

**Not covered locally:**
- **A real KFintech statement.** Both real files are CAMS. KFintech layouts are covered by the synthetic `kfin_*` files. Upload one real KFintech statement on staging.
- **Staging Import health (C1–C14).** This happens after deploy.

**The review screen stays (user, 2026-10-06).** The removal (Task 3) waits for staging and the user's screenshots. It was briefly built and then restored.

| Scenario | Normal | mfapi blocked | Match | Review items | Names asked | History months / gaps / partial | Note |
|---|---|---|---|---|---|---|---|
| `p20_10yr,p20_3yr,p20_20yr` | pass | pass | 12/12 | 0 | 0 | 247 / 0 / 24 | repeat = already imported |
| `p20_20yr,p20_FY` | pass | pass | 12/12 | 0 | 0 | 247 / 0 / 24 | repeat = already imported |
| `p20_20yr,p20_FY` | FAIL | FAIL | 0/0 | 0 | 0 | 0 / 0 / 0 | repeat = already imported; delete first; by design: FY refused as already imported, so the only import is deleted → empty |
| `p20_20yr,p20_FY` | FAIL | FAIL | 0/0 | 0 | 0 | 0 / 0 / 0 | repeat = already imported; delete last; by design: FY refused as already imported, so the only import is deleted → empty |
| `fam_10yr,fam_FY` | pass | pass | 17/17 | 0 | 0 | 129 / 0 / 82 | repeat = already imported |
| `fam_10yr` | pass | pass | 17/17 | 0 | 0 | 129 / 0 / 82 |  |
| `fam_FY` | pass | pass | 15/15 | 0 | 0 | 6 / 0 / 0 |  |
| `fam_noname_FY` | pass | pass | 12/12 | 0 | 1 | 6 / 0 / 0 |  |
| `fam_FY,fam_10yr` | pass | pass | 17/17 | 0 | 0 | 129 / 0 / 82 |  |
| `p20_FY,p20_20yr` | pass | pass | 12/12 | 0 | 0 | 247 / 0 / 24 |  |
| `p20_FY,p20_20yr` | pass | pass | 12/12 | 0 | 0 | 247 / 0 / 24 | delete first |
| `p20_FY,p20_20yr` | pass | pass | 9/9 | 0 | 0 | 6 / 0 / 0 | delete last |
| `p20_FY,p20_FY_altfolio` | pass | pass | 9/9 | 0 | 0 | 6 / 0 / 0 | repeat = already imported |
| `kfin_p10_FY` | pass | pass | 6/6 | 0 | 0 | 6 / 0 / 0 |  |
| `kfin_p7_7yr` | pass | pass | 5/5 | 0 | 0 | 92 / 0 / 0 |  |
| `kfin_pk_10yr` | pass | pass | 5/5 | 0 | 0 | 125 / 0 / 0 |  |
| `kfin_pk_1yr` | pass | pass | 3/3 | 0 | 0 | 12 / 0 / 0 |  |
| `oldcams_p20_20yr` | pass | pass | 12/12 | 0 | 0 | 247 / 0 / 24 |  |
| `p20_FY,p10_10yr,fam_10yr` | pass | pass | 17/17 | 0 | 0 | 129 / 0 / 82 | family member’s own statement |
| `p20_FY,p3_FY,fam_noname_FY` | pass | pass | 12/12 | 0 | 0 | 6 / 0 / 0 | repeat = already imported; family member’s own statement |
| `p10_10yr` | pass | pass | 6/6 | 0 | 0 | 128 / 0 / 0 |  |
| `p10_1yr` | pass | pass | 6/6 | 0 | 0 | 12 / 0 / 0 |  |
| `p10_3yr` | pass | pass | 6/6 | 0 | 0 | 36 / 0 / 0 |  |
| `p10_7yr` | pass | pass | 6/6 | 0 | 0 | 93 / 0 / 0 |  |
| `p10_FY` | pass | pass | 6/6 | 0 | 0 | 6 / 0 / 0 |  |
| `p10_FY,p10_10yr` | pass | pass | 6/6 | 0 | 0 | 128 / 0 / 0 |  |
| `p20_10yr` | pass | pass | 11/11 | 0 | 0 | 129 / 0 / 82 |  |
| `p20_1yr` | pass | pass | 9/9 | 0 | 0 | 12 / 0 / 0 |  |
| `p20_20yr` | pass | pass | 12/12 | 0 | 0 | 247 / 0 / 24 |  |
| `p20_3yr` | pass | pass | 9/9 | 0 | 0 | 36 / 0 / 0 |  |
| `p20_7yr` | pass | pass | 10/10 | 0 | 0 | 93 / 0 / 46 |  |
| `p20_FY` | pass | pass | 9/9 | 0 | 0 | 6 / 0 / 0 |  |
| `p20_FY_altfolio` | pass | pass | 9/9 | 0 | 0 | 6 / 0 / 0 |  |
| `p20_20yr,fam_10yr` | pass | pass | 18/18 | 0 | 0 | 247 / 0 / 24 |  |
| `p3_1yr` | pass | pass | 3/3 | 0 | 0 | 12 / 0 / 0 |  |
| `p3_3yr` | pass | pass | 3/3 | 0 | 0 | 36 / 0 / 0 |  |
| `p3_FY` | pass | pass | 3/3 | 0 | 0 | 6 / 0 / 0 |  |
| `p3u_FY` | pass | pass | 4/4 | 0 | 0 | 6 / 0 / 6 | unlisted held fund imports at the statement’s NAV |
| `p7_1yr` | pass | pass | 5/5 | 0 | 0 | 12 / 0 / 0 |  |
| `p7_3yr` | pass | pass | 5/5 | 0 | 0 | 36 / 0 / 0 |  |
| `p7_7yr` | pass | pass | 5/5 | 0 | 0 | 92 / 0 / 0 |  |
| `p7_FY` | pass | pass | 5/5 | 0 | 0 | 6 / 0 / 0 |  |
| `kfin_pk_1yr,kfin_pk_10yr` | pass | pass | 5/5 | 0 | 0 | 125 / 0 / 0 |  |
| `px_14yr` | pass | pass | 11/11 | 0 | 0 | 175 / 0 / 0 |  |
| `px_FY` | pass | pass | 8/8 | 0 | 0 | 6 / 0 / 0 |  |
| `px_FY,px_14yr` | pass | pass | 11/11 | 0 | 0 | 175 / 0 / 0 |  |

## Re-run after the staging deploy (2026-10-07, orchestrator in WSL)

The full automated set was re-run on the deployed code (same tree as staging). Nothing from the real statements is recorded here, only counts.

**Synthetic gate: PASSED, 88/88.**
- 44 scenarios × normal / mfapi.in blocked.
- The two `p20_20yr,p20_FY` delete-variant scenarios are no longer counted: they end empty by design.
- Every fund matches, 0 review items, 0 gaps, and the blocked results are identical. `p3u_FY` imports as unlisted.

**Real statements (counts only): 25 runs. 24 pass, 1 fails.**
- Six CAMS files, each alone (normal and blocked), plus upload-order, repeat, two-investor and family combinations. All 23 runs pass, all funds verified, 0 needs review, every reconciliation matches.
- New file, **CP219255789**: passes. 1 fund, closed.
- New file, **CP219252880**: **FAILS**. The statement has 0 folios, so it is empty. The upload hits `self_name_mismatch`. Clicking "Yes, that's me" (resolve-name) loops back to the same prompt, which is a dead end. This comes from the 29 Sep member detection, not from the CAS fixes.
  - Proposed fix: reject an empty statement at parse with a clear message. **Awaiting the user's go.**

**Postgres (local, port 5433):**
- 0028 ↔ 0030 round trip is clean.
- `functional_postgres`: 14 passed.

**Backend suites:** 1291 passed, 8 skipped. These cover import_, dashboard, analytics, auth, legal, api, scripts and migrations.

**Frontend:** `tsc -b` is clean, and vitest passed 98 files / 767 tests. These cover import, mobile, dashboard, history, analytics, components, auth, legal, profile and lib.

**Known gap: no real KFintech statement.** None is available (user, 2026-10-07). Staging check A3 is skipped. KFintech layouts are covered only by the synthetic `kfin_*` files: the four automated scenarios above, plus staging checks A5 and C10 with `kfin_pk_10yr.pdf`. Run A3 when a real KFintech statement turns up.

### Artifact checks run locally (2026-10-07, after A2 on staging)

The harness `test_real_check.py` now also checks what the dashboard reads, for each member. Results are counts and pass/fail only:
- the totals add up;
- there is one row per fund;
- the allocation adds up;
- stamp duty doesn't split a SIP;
- the distributor comparison adds up;
- the drift from the statement total;
- a wrong password is refused.

It ran 44 times: 8 real files plus the 8 synthetic files the artifact uses, alone and in combination, with mfapi.in normal and blocked.

**No new product bug.** Every reconciliation matches. Duplicate rows, totals, allocation, distributor comparison and the wrong-password response (422 `wrong_password`) are all fine in every run. A repeat upload gives 409 `already_imported`.

**What the first run flagged, and why none of it is a product bug:**
- **Unpriced holdings when blocked:** expected. A fresh test database has no cached NAVs, while production keeps the daily NAV job's cache. The harness no longer counts this as a failure.
- **SIP split on `px_14yr`:** the check was wrong. These are two genuine SIPs in the same fund on the same day with different amounts (one on the minor's folio). The harness now keys SIPs on amount too.
- **family_cas_1/2 total +72–108% above the statement:** these files print made-up NAVs, for example ~45 for a fund whose real NAV is ~114. The value gap comes from the file, and units match.
- **CP219252880:** the known empty-statement dead end, fix awaiting the user's go.

**Two dashboard findings from the user's A2 screenshots, both confirmed locally and both pre-existing (not from the CAS fixes):**
1. **Allocation "Other" is 25.43%** on the 10 Yr file and 37.62% on the CP file. `allocation_labels.py` matches category keywords, so AMFI's "Other Scheme – Index Funds" and "Solution Oriented" funds fall into Other. Grouping decision pending with the user.
2. **Total Invested is ₹186 below the CAS cost** on the 10 Yr file. Every fund is short by exactly the 0.005% stamp duty: the CAS cost is the gross amount paid, while our invested figure is units × NAV. Decision pending with the user: include stamp duty in cost (recommended) or label it.

## 2026-10-08 — Analytics speed fix and stamp duty: gate after the change

Plan: `Docs/superpowers/plans/2026-10-07-analytics-speed-and-stamp-duty.md`. New checks in this round: Total Invested = the statement's cost per fund (₹1 plus up to 0.00005 × units for 4-decimal NAV rounding), no stamp-duty row left unattached, and on the Analytics run: no TER download, all 7 sections present, none failed.

**Synthetic gate: PASSED, 88/88** (44 scenarios × normal/mfapi-blocked).
- 81 passed in the main run.
- The other 7 passed on re-run after test-side fixes: runs that had started before a harness fix, and one new known case.
- `invested_mismatch` is empty and `stamp_unattached` is 0 everywhere.
- Skipped funds, all from the known list: ICICI Bluechip and HSBC Value (synthetic prices below the real fund's lowest NAV), and the Franklin segregated portfolio (zero cost).

**Analytics on `p20_20yr` (WSL):** 0 TER downloads, 7/7 sections, status 200. Time 46.6 s on the final run; 155–197 s earlier the same day. The time depends on how many mfapi downloads fail; that fix is deferred.

**Real statements, counts only: 34 runs, 31 pass.**
- **CP219252880:** fails ×2, as known: an empty statement.
- **Synthetic `fam_10yr` through the real-file checker:** passes on re-run after the same known-list skip (ICICI Bluechip) was added there.
- **"CAS 10 Yr":** Total Invested equals the CAS cost within ₹0.02, alone and in every upload order, normal and blocked.
- **CP225296748, 2025-26 FY, Last 2 years, CP219255789:** within ₹0.57.
- **family_cas_1/2** (hand-made test files): the same-person popup is answered Yes exactly once on the combined upload. Their cost and value checks are skipped (user decision: their printed cost omits stamp duty and doesn't carry over between the files).

**Postgres (local, port 5433):** 0030 → 0032 → 0030 → 0032 round trip clean, with `stamp_duty` on the parent table and all 8 partitions. 43 `functional_postgres` + migration tests pass.

**Backend:** 592 affected tests pass (imports, dashboard, analytics, jobs, migrations).
