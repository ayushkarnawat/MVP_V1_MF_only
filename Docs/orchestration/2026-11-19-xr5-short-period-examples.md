# XR-5: what a short holding looks like when it is annualised (19 Nov 2026)

Worked with the app's own XIRR solver on invented cash flows (dates ending 18 Nov 2026). It shows why the owner's FX-8e decision (option 1) matters: a holding under a year is shown by the return since purchase, labelled "not annualised"; from 365 days it is annualised as before.

## One lump sum of 1,000, valued later (annualised rate against the plain gain)
| Held for | gain +2% | gain +5% | gain +10% | loss -5% |
|---|---|---|---|---|
| 1 month | 27.2% a year | 81.1% a year | 218.9% a year | -46.4% a year |
| 3 months | 8.3% | 21.6% | 46.6% | -18.6% |
| 6 months | 4.1% | 10.3% | 21.1% | -9.8% |
| 11 months | 2.2% | 5.5% | 11.0% | -5.5% |
| 1 year | 2.0% | 5.0% | 10.0% | -5.0% |
| 2 years | 1.0% | 2.5% | 4.9% | -2.5% |

The plain gain is +2%, +5%, +10% and -5% in every row. The figures are mathematically right (a 10% gain in one month, repeated for a year, is 219%) and practically misleading, which is the point of the decision. At one year the two agree.

## A monthly SIP of 1,000, worth 4% more than the money put in
| Months of SIP | Annualised | Since purchase |
|---|---|---|
| 3 | 26.8% | +4.0% |
| 6 | 14.5% | +4.0% |
| 9 | 10.0% | +4.0% |

## What the app now does (FX-8e, committed on `batch/a-xirr-fixes`)
- Span under 365 days (first flow to the price date): the tile and the per-fund column carry `basis = since_purchase` and the absolute return; the annualised rate stays in its old field for older screens.
- 365 days or more: `basis = annualised`, everything as before.
- Flows that net to zero on one day: no rate (a dash), not 0%.
- Real staging data (19 Nov): 7 of 8 invented households are over a year and unchanged; one household (under a year) gets +5.52% since purchase beside 10.56% annualised.
