# Batch L, L-5: why the regressed fund houses have nothing (or less) for October 2026

**Done 19 Nov 2026 from the staging VM (an Indian address), read-only.** Method: the project's own locators were run in discovery-only mode (no workbook downloaded, no row written, the database session set to read-only), then for some houses the public workbooks were read **into memory only** and run through the same parse-and-match step the daily job uses. Scripts are in the orchestrator's scratch folder, not in the repository. Nothing on staging was changed. The first pass is `2026-11-19-disclosures-audit-first-pass.md`.

**One fact first:** the daily job (`portfolio-disclosures-daily`, 05:45 IST) runs on **days 1 to 20 only**. Tomorrow, **20 Nov, is the last automatic run of this cycle**. The job writes **no log file** (the only logs on the VM are backup, disk and NAV), so *why a run wrote nothing* cannot be read back; only the state of the database and what the sites return today can be checked.

## Result per house
| House | Funds waiting | What was found | Whose problem | What fixes it |
|---|---|---|---|---|
| **Franklin Templeton** (171 written in Sep, 0 in Oct) | 321 live series | The site has the October files: **32 records, every one dated 30 Oct 2026** (uploaded 8 Nov). The job accepts only a file dated **exactly** the month end (31 Oct). **31 Oct 2026 was a Saturday**; Franklin dates its file on the last working day (the same house's 2021 file is dated 29 Oct, a Friday, because 31 Oct 2021 was a Sunday). The locator therefore finds 0 files. | **Ours (a rule that is too strict)**, not the site. Any house that dates its file on the last working day fails the same way in any month whose last day is a weekend. | A code change: accept the last working day on or before the month end (a bounded window, for example up to 3 days back). Proposal below; it must go through the review gate. |
| **Zerodha** (20 written in Sep, nothing now) | 25 live funds | The site has 24 October workbooks and our locator finds all 24. But the scheme master now names the house **"Zerodha CASE Mutual Fund"** (25 funds) and the registry key is "Zerodha Mutual Fund" (0 live funds under that name), so the job skips the house ("no scheme rows"). The website itself now redirects to `zerodhacasefunds.com`. | **Ours (a name change upstream)**, not the site. | A code change: register the new house name (and keep the old one for the history). Same gate. |
| **Samco** (26 written in Sep, nothing now) | 31 live series | The page lists October files, 36 links (12 distinct files, each on two hosts). The main host (`www.samcomf.com/amc-document-download`) now answers **HTTP 500** for the October files; the second host (`media.samcomf.com`) serves them. Read and matched in memory: **12 of 12 sheets parse and match** their funds. | Mixed: the main host is broken for the October files; whether the job falls back to the second host for every file was **not** proven (the code has a fallback, my test of it was not the real run). **I cannot say why 18 daily runs wrote nothing.** | Nothing to fix in the files. Tomorrow's run shows whether it writes; if not, read the code path for the fallback. |
| **AlphaGrep** (12 written in Sep, nothing now) | 12 live series | The manifest's newest monthly file for every fund is **September 2026** (then August, July). October is **not published yet**. | **Not ours.** The house is late. | Wait; nothing to do. Re-check after 20 Nov. |
| **Bajaj Finserv** (108 written in Sep, nothing now) | 108 live series | `bajajamc.com` answers **403 Forbidden** to our server even with ordinary browser headers (one plain request, no tricks). | **Blocked from our server**; whether the site changed or only blocks this address is unknown. | The owner opens the page in a normal browser (below). If it works there, the options are the by-hand route or asking the house. |
| **WhiteOak** (70 written in Sep, nothing now) | 82 live series | `cms.whiteoakamc.com` answers **403** (the data source) and the landing page **403**. | **Blocked from our server**, same as above. | Same. |
| **Trust** (45 written in Sep, nothing now) | 48 live series | `trustmf.com` answers **406 Not Acceptable** (even for the home page). | **Blocked from our server**, same as above. | Same. |
| **Angel One** (14 written in Sep, nothing now) | 16 live series | `angelonemf.com/downloads` answers **403**. | **Blocked from our server**, same as above. | Same. |

**What the four "blocked" rows mean:** all four refuse our server in the same way, and the same refusals were seen from the AWS address earlier (Priority 1 in `DEFERRED_FEATURES.md`). They did work in September, so either they began blocking servers in October, or September's run came from another network. I cannot tell which from here. This is the same class as the ten houses that need a monthly hand import.

## The three large falls (LIC, Motilal Oswal, Canara Robeco) and ICICI
- **LIC** (75 written now, 145 in Sep): the site has both October workbooks; reading and matching them in memory **matches all 43 of our 43 fund families**. **Motilal Oswal** (161 now, 191 in Sep): 71 workbooks found, **71 of 71 sheets match** (the other families are not in the files). **Canara Robeco** (82 now, 112 in Sep): 26 workbooks found (October 2026), **26 of 26 match** (27 families on our side).
- So for these three **nothing in the files or our matching explains the fall**: run today, the same steps find and match everything. The likely reasons are timing (files that appeared late in the month) or a run that stopped part-way, and **I cannot show which** without the job log. Tomorrow's run is the test.
- **ICICI Prudential** (551 of 2,512 written, 59 failed): the monthly ZIP exists (`Monthly-Portfolio-Disclosure-October-2026.zip`) and the locator finds it. The 59 failed batches **carry no stored reason** (all 172 failed rows in the two months show an empty reason), so which members failed and why is **not answered yet**. This needs a dry-run of the ZIP's 150 or so members; it is a bigger job and is the next step.

## What I did not do
- I did not run the daily job by hand, import anything, or change code or configuration on staging.
- I did not read ICICI's members or the failed weight sums.
- I did not open the blocked pages in a browser (the owner's check, below).
- Whether Zerodha and Samco write tomorrow, and why the three falls happened, are **unanswered** until the 20 Nov run (and the missing log is itself a finding).

## Needs the owner
1. **Open these four pages in a normal browser and say what you see:** https://www.bajajamc.com/downloads?tab=portfolio, https://www.angelonemf.com/downloads, https://mf.whiteoakamc.com/regulatory-disclosures/scheme-portfolios, https://www.trustmf.com/ (look for "Portfolio" / "Monthly Portfolio Disclosure" and whether October 2026 files are listed). If they open and list October, the sites block servers and these four join the by-hand houses (8 more files per month); if the pages themselves changed, I will read the new layout.
2. **Decide about the 20 Nov run:** the automatic run tomorrow at 05:45 is the last of the cycle. I suggest we **leave it as it is**, read the result on 20 Nov, and not run the job by hand (a hand run writes to staging; I will not do that without your yes). Franklin and Zerodha need code changes, which wait for the gate and ride a later milestone, so October stays at what it is for them unless you want them imported by hand too (Franklin's October workbooks are public; its 52 funds would be imported with the same importer as the seven by-hand houses).

## Proposed fixes (not built; each goes through the review gate with the owner's yes)
- **FX-L1 (Franklin, and any house that dates on the last working day):** accept a file dated on the last working day on or before the month end; test fixtures for a Saturday, a Sunday and a normal month end.
- **FX-L2 (Zerodha):** register "Zerodha CASE Mutual Fund" as the house name; one test.
- **FX-L3 (all houses):** keep the failure reason in the database for every failed batch (the obvious first fix named in the first pass), and write a plain log line per house per run to a file, so a quiet month is never a mystery again.
- **FX-L4:** an alert when a house that wrote last month has nothing by day 10 (today the alert only covers the by-hand houses).

## Follow-up the same evening (what was run, and what changed in the picture above)
**The four refused sites open normally in a browser (checked in the built-in browser on the orchestrator's machine, read only):**
| House | In a normal browser |
|---|---|
| WhiteOak | The scheme-portfolios page opens and lists the October 2026 monthly files ("Monthly Portfolio Disclosure - 31st October2026" for Liquid, Mid Cap, Multi Asset, Multi Cap, Pharma, Quality Equity, Special Opportunities, Ultra Short Term; 1,146 results in all). |
| Bajaj Finserv | The downloads page opens; the Monthly Portfolio filter offers year 2026-27 and, for it, months April to **October**. (The files themselves were not opened.) |
| Angel One | The downloads page opens and lists **Monthly-Portfolio-October-2026** workbooks (176 portfolio links on the page). |
| Trust | The site opens. Its Statutory Disclosure page lists a portfolio report "as on 31.10.2026" (the page calls the series Fortnightly Portfolio Report). Whether a separate monthly list exists was **not established**; the job's data source for Trust (a POST to its API) is the part that answers 406. |

So the four are **published and open to people, and refused only to our server** (Bajaj, WhiteOak, Angel One: 403; Trust's API: 406), the same class as Priority 1. The earlier row "whether the site changed or only blocks this address" is answered for the first three: the pages are fine, the server is refused.

**Dry run of the two houses with our own code problem (in memory, nothing written):**
- **Zerodha**, under its new name "Zerodha CASE Mutual Fund": 24 workbooks found; **21 of 24 sheets match** (21 of 25 families); the 3 that do not match are ETFs (ZSLVR, ZGOLD, ZEN50). No parse errors.
- **Franklin**, files dated 30 Oct 2026: 32 workbooks found; **32 of 32 sheets match** (32 of 45 families; the other 13 are not in the monthly set); no parse errors.
So once the two code fixes (FX-L1, FX-L2) exist, both houses read cleanly. **Nothing was written** to staging: writing them now would be a hand import dated 30 Oct for Franklin (the file's real date, with `--allow-any-date`), which the audit's strict 31 Oct count would not see; that is a decision for the owner, and the importer has no undo. Left for the later pass.

**Left for the later, deeper pass (the owner's call, 19 Nov):** the detailed write-up of the disclosure findings, the fix proposals FX-L1 to FX-L4 and the remaining L audits, to be done together with the fund-manager factsheet work once staging is complete. This file and the first-pass file are the record until then.
