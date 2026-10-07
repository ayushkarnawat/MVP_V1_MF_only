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
Set `MASTER_FILE` to a saved public AMFI NAVAll feed to seed the local scheme master
before the first upload. `navall_2026-10-06.txt` is the feed downloaded on 6 October
2026 from `https://portal.amfiindia.com/spages/NAVAll.txt`. Every later checkpoint
uses this saved file. Fund identification uses the master; mfapi.in supplies NAV history.

From `backend/` in Windows PowerShell:

```powershell
$env:MASTER_FILE = (Resolve-Path "../Docs/CAS Files/synthetic/navall_2026-10-06.txt").Path
$env:SEQ = "kfin_pk_10yr.pdf"
$env:OUT = Join-Path $env:TEMP "p6a_task0.json"
.venv\Scripts\python.exe -m pytest "../Docs/CAS Files/synthetic/harness/test_deep.py" -q --rootdir "../Docs/CAS Files/synthetic/harness"
```

With `MASTER_FILE` set, the harness also asserts that all final reconciliation rows match.

## Layout variants and extra scenarios (added later on 2026-10-05)

| File | What it tests |
|---|---|
| `kfin_pk_10yr.pdf`, `kfin_pk_1yr.pdf` | KFintech-issued layout (`layouts.KfinBuilder`: KFINCASWS watermark, 4-line header, date-twin overlay, "Phone Off:"). Persona **pk** (Rahul Iyer, ~₹5 Cr since 2016): letter-spaced STP switches (Axis Liquid → Axis Mid Cap), Franklin Low Duration wind-up with Jan-2020 segregated portfolio, units extinguished in tranches, one reversed row printed in brackets |
| `kfin_p7_7yr.pdf`, `kfin_p10_FY.pdf` | Same ledgers as p7/p10 in the KFintech layout (results must equal the CAMS versions) |
| `oldcams_p20_20yr.pdf` | Older CAMS template without the per-row Price column (`layouts.OldCamsBuilder`) |
| `fam_10yr.pdf` | p20 + p10 consolidated into one family statement |
| `p20_FY_altfolio.pdf` | p20 FY with folios printed "1047392/12" instead of "1047392 / 12" |

## Phase 7 gate additions (2026-10-06)

`gen_gate_scenarios.py` adds these without regenerating anything else (it only appends to `truth.json`):

| File | What it tests |
|---|---|
| `fam_FY.pdf` | p20 + p10 family statement, FY window (order tests with `fam_10yr.pdf`) |
| `fam_noname_FY.pdf` | p20 + p3 family statement whose p3 folios print no holder name: the people popup must ask for a name (U9), unless p3 is already a member (matched by PAN) |
| `p3u_FY.pdf` | p3 plus one held fund (Zephyr, ISIN `INF000Z01ZZ9`) that is in no master: the one case that still needs a question (`needs_review`) |

Harness switches and helpers:
- `MFAPI_BLOCKED=1` makes every api.mfapi.in request fail (outage run).
- `test_deep.py` confirms with the same people-based body the app sends (typed name where `needs_name`), answers the `member_not_in_file` prompt with "Import for these people", and writes its output before asserting.
- `test_real_check.py` runs the user's own statements and prints counts only (see its docstring). Run it with `--tb=no`.

`harness/test_perf.py` measures CPU seconds, DB query counts and peak memory per step
(`FN=p20_20yr.pdf OUT=... python -m pytest .../harness/test_perf.py`).
