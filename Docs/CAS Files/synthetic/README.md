# Synthetic long-history CAS files

Built 2026-10-05 for the CAS value-discrepancy deep dive. Password for every PDF: `MF@123`.
Investors, PANs, folios and amounts are fictitious; fund names, ISINs, RTA codes and
current NAVs are real (one merged-away fund uses a made-up ISIN on purpose).

Each persona's history is simulated once; every file is a lookback window cut from the
same history, so **all files of one persona have the same true closing units and value**.
`truth.json` holds the expected opening/closing units, value and cost per fund per file.

| Persona | Since | Value | What it exercises |
|---|---|---|---|
| `p20_*` Vikram Mehta | 2006 | ~₹20 Cr | legacy pre-2013 plan names, 2014 move to Direct (old ARN kept), bonus units, fund fully exited, merged "Regular Savings – Direct" plan, merged-away fund (unknown ISIN), old HDFC Liquid ISIN with no AMFI code, IDCW reinvest, twin same-day SIPs, a bounced SIP, same fund in two folios |
| `p10_*` Neha Kulkarni | 2016 | ~₹15 Cr | Direct plans via a registered adviser (INA code), Direct plan carrying an ARN, DSP "Dir" naming, twin SIPs, IDCW payouts, partial exits |
| `p7_*` Arjun Nair | 2019 | ~₹12 Cr | DSP "Reg" naming, SBI "Dir" FMP, Regular plan with ARN, bounced SIPs, gift received |
| `p3_*` Isha Verma | 2023 | ~₹20 L | small plain baseline |

Windows: `20yr` (from 1 Jan 2006), `10yr` (1 Jan 2016), `7yr` (1 Jan 2019), `3yr`
(1 Oct 2023), `1yr` (1 Oct 2025), `FY` (1 Apr 2026). Statement date 5 Oct 2026.

Regenerate: `pip install reportlab pikepdf` then `python gen_scenarios.py` (in this folder).
`cas_builder.py` is the CAMS-layout PDF builder recovered from the 2026-09-30 session.
casparser 1.3.0 parses every file with zero warnings and exact opening + transactions =
closing for every fund.

## Test harness (`harness/`)

End-to-end checks used in the 2026-10-05 deep dive: each file goes through the real
`/imports/parse` → `/imports/confirm` → dashboard endpoints on an in-memory DB, and every
number is compared with truth derived from the CAS rows. Run one scenario per process
from `backend/` (the app caches one HTTP client per event loop; `conftest.py` works around
that for tests only):

    SEQ=p20_20yr.pdf OUT=/tmp/out.json SNAP=1 python -m pytest "<path>/harness/test_deep.py" -q --rootdir "<path>/harness"

`rundeep.sh` has the scenario list (paths in it point at the original scratchpad; edit `E`).
Needs network (mfapi.in) for fund matching and NAVs.

## Layout variants and extra scenarios (added later on 2026-10-05)

| File | What it tests |
|---|---|
| `kfin_pk_10yr.pdf`, `kfin_pk_1yr.pdf` | KFintech-issued layout (`layouts.KfinBuilder`: KFINCASWS watermark, 4-line header, date-twin overlay, "Phone Off:"). Persona **pk** (Rahul Iyer, ~₹5 Cr since 2016): letter-spaced STP switches (Axis Liquid → Axis Mid Cap), Franklin Low Duration wind-up with Jan-2020 segregated portfolio, units extinguished in tranches, one reversed row printed in brackets |
| `kfin_p7_7yr.pdf`, `kfin_p10_FY.pdf` | Same ledgers as p7/p10 in the KFintech layout (results must equal the CAMS versions) |
| `oldcams_p20_20yr.pdf` | Older CAMS template without the per-row Price column (`layouts.OldCamsBuilder`) |
| `fam_10yr.pdf` | p20 + p10 consolidated into one family statement |
| `p20_FY_altfolio.pdf` | p20 FY with folios printed "1047392/12" instead of "1047392 / 12" |

`harness/test_perf.py` measures CPU seconds, DB query counts and peak memory per step
(`FN=p20_20yr.pdf OUT=... python -m pytest .../harness/test_perf.py`).
