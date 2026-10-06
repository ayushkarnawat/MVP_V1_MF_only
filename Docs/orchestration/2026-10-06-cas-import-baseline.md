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
