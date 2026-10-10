"""Real-life investor scenarios (2026-10-10) for QA and future feature testing.

Unlike the regression personas (gen_scenarios.py), amounts here are NOT scaled to a target
value: every SIP, step-up and lumpsum is the round number a real investor would type, so the
statement reads like a real one. Funds, ISINs and latest NAVs are real (saved AMFI feed
navall_2026-10-06.txt, Direct Growth plans); people, PANs, folios, amounts and dates are
fictitious. Like gen_big_family.py it only ADDS PDFs and truth.json entries.

  r1_first_jobber_riya_3yr.pdf      Riya Sharma, 24, first job (Aug 2023): 3 SIPs incl. ELSS,
                                    10% step-up every April, one bounced SIP, a Diwali-bonus
                                    lumpsum, an emergency fund in a liquid fund drawn once.
  r2_couple_rohan_priya_10yr.pdf    Rohan + Priya Kulkarni (family statement, one email), SIPs
                                    since 2017, all SIPs paused Apr-Jun 2020 (COVID), January
                                    ELSS lumpsums, 40% of equity + the bond fund redeemed in
                                    Mar 2023 for a house down payment.
  r3_family_minor_suresh_13yr.pdf   Suresh + Lakshmi Iyer and their son Aarav (minor folio,
                                    guardian Suresh): a child-education SIP since 2016, the
                                    parents' SIPs and ELSS, a corporate bond fund.

Run from this folder (needs reportlab + pikepdf):  python gen_realistic.py
Password: MF@123. PDFs go to pdfs/realistic/.
"""
from __future__ import annotations

import json
from datetime import date
from decimal import Decimal as D

import gen_scenarios as g
from pdf_dir import pdf_dir

OUT = pdf_dir() / "realistic"
FEED = g.HERE / "navall_2026-10-06.txt"

# key -> (ISIN, RTA code, assumed CAGR, equity?)
FUNDS = {
    "UTI_N50": ("INF789F01XA0", "UT050DG", 0.12, True),
    "PPFAS": ("INF879O01027", "PP001ZG", 0.16, True),
    "MIRAE_ELSS": ("INF769K01DM9", "MA178DG", 0.15, True),
    "MIRAE_LMC": ("INF769K01BI1", "MA118DG", 0.16, True),
    "HDFC_FLEXI": ("INF179K01UT0", "H02T", 0.16, True),
    "ICICI_LARGE": ("INF109K016L0", "P8042", 0.14, True),
    "AXIS_MID": ("INF846K01EH3", "128MCDG", 0.18, True),
    "NIPPON_SMALL": ("INF204K01K15", "RMFSCDG", 0.20, True),
    "KOTAK_FLEXI": ("INF174K01LS2", "K178DG", 0.14, True),
    "AXIS_ELSS": ("INF846K01EW2", "128TSDG", 0.13, True),
    "HDFC_CHILD": ("INF179KC1IX0", "HCGFDG", 0.13, True),
    "QUANT_ELSS": ("INF966L01986", "QT120DG", 0.18, True),
    "HDFC_CORP": ("INF179K01XD8", "HCBFDG", 0.072, False),
    "SBI_LIQUID": ("INF200K01UT4", "L072DG", 0.065, False),
}


def load_feed() -> dict[str, tuple[str, str, D]]:
    out, amc = {}, None
    for line in FEED.read_text(encoding="utf-8").splitlines():
        p = line.strip().split(";")
        if len(p) == 1 and p[0].endswith("Mutual Fund"):
            amc = p[0]
        elif len(p) >= 8 and p[1].startswith("INF") and p[4] == "Direct Plan" and p[5].startswith("Growth"):
            out.setdefault(p[1], (amc, p[3], D(p[6])))
    return out


def register_funds(feed):
    for key, (isin, code, cagr, equity) in FUNDS.items():
        amc, raw, nav = feed[isin]
        name = raw.split(" (erstwhile")[0].strip()
        name = name.title() if name.isupper() else name
        g.F[f"R_{key}"] = g.Fund(f"R_{key}", code, f"{name} - Direct Plan - Growth", isin, amc, nav, cagr, equity=equity)


def k(key):
    return f"R_{key}"


def step_up_sip(L, folio, key, start: date, first_amount: int, years: int, pct: int, day: int, bounce_month=None):
    """A yearly step-up SIP: the same mandate, amount raised by pct% each April (as AMCs print it,
    each year's instalments continue the count)."""
    amount, d, n = first_amount, start, 0
    for y in range(years):
        months = 12 if y else (16 - start.month if start.month >= 4 else 4 - start.month)
        for i in range(months):
            yy, mm = d.year + (d.month - 1 + i) // 12, (d.month - 1 + i) % 12 + 1
            when = date(yy, mm, day)
            if when > g.END:
                return
            n += 1
            L.buy(folio, k(key), when, amount, f"Systematic Investment Purchase - Instalment {n}", advisor="DIRECT")
            if bounce_month == (yy, mm):
                L.reverse_last(folio, k(key), date(yy, mm, day + 3))
        d = date(d.year + (d.month - 1 + months) // 12, (d.month - 1 + months) % 12 + 1, 1)
        amount = int(round(amount * (100 + pct) / 100 / 100) * 100)


# ---------------------------------------------------------------- R1
def build_r1(L):
    step_up_sip(L, "91204411", "UTI_N50", date(2023, 8, 1), 5000, 4, 10, day=5, bounce_month=(2024, 11))
    step_up_sip(L, "55103876", "PPFAS", date(2023, 8, 1), 5000, 4, 10, day=5)
    step_up_sip(L, "77812093", "MIRAE_ELSS", date(2023, 9, 1), 3000, 4, 10, day=10)
    L.buy("55103876", k("PPFAS"), date(2024, 11, 4), 25000, "Purchase", advisor="DIRECT")  # Diwali bonus
    L.buy("30041122", k("SBI_LIQUID"), date(2024, 2, 14), 50000, "Purchase", advisor="DIRECT")  # emergency fund
    L.redeem("30041122", k("SBI_LIQUID"), date(2025, 7, 21), gross=20000)  # a medical bill


# ---------------------------------------------------------------- R2
def paused_sip(L, folio, key, start, amount, day):
    """A SIP paused for Apr-Jun 2020 (COVID), then resumed with the same mandate."""
    before = (2020 - start.year) * 12 + (4 - start.month)
    if before > 0:
        L.sip(folio, k(key), start, before, amount, day=day, advisor="DIRECT")
    resume = date(2020, 7, 1) if start < date(2020, 7, 1) else start
    L.sip(folio, k(key), resume, (2026 - resume.year) * 12 + (10 - resume.month), amount, day=day, advisor="DIRECT")


def build_rohan(L):
    paused_sip(L, "1197340 / 21", "HDFC_FLEXI", date(2017, 4, 1), 10000, 7)
    paused_sip(L, "8820154", "ICICI_LARGE", date(2017, 4, 1), 8000, 7)
    paused_sip(L, "4471900", "AXIS_MID", date(2019, 1, 1), 5000, 12)
    L.sip("6650218", k("NIPPON_SMALL"), date(2021, 6, 1), 64, 5000, day=12, advisor="DIRECT")
    L.buy("1197340 / 21", k("HDFC_CORP"), date(2019, 9, 3), 200000, advisor="DIRECT")  # house fund
    L.buy("1197340 / 21", k("HDFC_CORP"), date(2021, 3, 15), 300000, advisor="DIRECT")
    # March 2023: house down payment.
    L.redeem("1197340 / 21", k("HDFC_CORP"), date(2023, 3, 6), all_units=True)
    for folio, key in (("1197340 / 21", "HDFC_FLEXI"), ("8820154", "ICICI_LARGE"), ("4471900", "AXIS_MID")):
        L.redeem(folio, k(key), date(2023, 3, 6), fraction=0.4)


def build_priya(L):
    paused_sip(L, "3304517", "KOTAK_FLEXI", date(2018, 1, 1), 7500, 3)
    paused_sip(L, "71120934", "MIRAE_LMC", date(2018, 8, 1), 5000, 10)
    L.sip("91877402", k("UTI_N50"), date(2021, 4, 1), 66, 5000, day=3, advisor="DIRECT")
    for y in (2018, 2019, 2020, 2021, 2022):  # January ELSS for the 80C limit
        L.buy("5521093", k("AXIS_ELSS"), date(y, 1, 20), 150000, advisor="DIRECT")
    L.redeem("71120934", k("MIRAE_LMC"), date(2023, 3, 6), fraction=0.4)  # her share of the down payment


# ---------------------------------------------------------------- R3
def build_suresh(L):
    L.sip("2238710 / 45", k("HDFC_FLEXI"), date(2014, 6, 1), 148, 7500, day=5, advisor="DIRECT")
    for y in range(2015, 2027):  # ELSS every February
        L.buy("9910237", k("QUANT_ELSS"), date(y, 2, 10), 50000, advisor="DIRECT")
    L.buy("2238710 / 45", k("HDFC_CORP"), date(2018, 11, 12), 400000, advisor="DIRECT")
    L.redeem("2238710 / 45", k("HDFC_CORP"), date(2024, 6, 3), fraction=0.5)  # school admission fee
    # Aarav's folio (minor, guardian Suresh): child-education SIP since his birth year.
    L.sip("6710054", k("HDFC_CHILD"), date(2016, 4, 1), 127, 10000, day=10, advisor="DIRECT")
    L.buy("6710054", k("HDFC_CHILD"), date(2021, 4, 15), 100000, advisor="DIRECT")  # grandparents' gift


def build_lakshmi(L):
    L.sip("88410273", k("UTI_N50"), date(2019, 7, 1), 87, 5000, day=15, advisor="DIRECT")
    L.sip("44027761", k("PPFAS"), date(2020, 10, 1), 72, 5000, day=15, advisor="DIRECT")


def ledger(build):
    L = g.Ledger(D("1"))  # amounts as written, never scaled
    build(L)
    L.run()
    return L


def persona(slug, name, pan, first_year, build, note, folio_holders=None):
    return g.Persona(slug, name, pan, f"{slug}@example.com", first_year, D("0"), [], build, note,
                     folio_holders=folio_holders or {})


SCENARIOS = [
    ("r1_first_jobber_riya_3yr.pdf", date(2023, 7, 1),
     [persona("r1", "RIYA ANIL SHARMA", "GKLPS7731Q", 2023, build_r1, "first jobber")]),
    ("r2_couple_rohan_priya_10yr.pdf", date(2016, 1, 1),
     [persona("r2a", "ROHAN VIJAY KULKARNI", "BQWPK2209L", 2017, build_rohan, "salaried, house purchase"),
      persona("r2b", "PRIYA ROHAN KULKARNI", "CJRPK6614M", 2018, build_priya, "salaried, ELSS")]),
    ("r3_family_minor_suresh_13yr.pdf", date(2014, 1, 1),
     [persona("r3a", "SURESH RAMAN IYER", "AHNPI5508D", 2014, build_suresh, "parent, child-education SIP",
              folio_holders={"6710054": ("AARAV SURESH IYER (MINOR)", None, ["Guardian: SURESH RAMAN IYER"])}),
      persona("r3b", "LAKSHMI SURESH IYER", "DPLPI3317K", 2019, build_lakshmi, "spouse, index + flexi SIPs")]),
]


def main():
    register_funds(load_feed())
    OUT.mkdir(parents=True, exist_ok=True)
    tp = g.HERE / "truth.json"
    data = json.loads(tp.read_text(encoding="utf-8"))
    for fname, start, people in SCENARIOS:
        ledgers = [(p, ledger(p.build)) for p in people]
        (lead, lead_l), extra = ledgers[0], ledgers[1:]
        pdf, truth = g.render(lead, lead_l, fname.rsplit("_", 1)[1][:-4], start, extra=extra)
        g.encrypt_pdf(pdf, g.PASSWORD, str(OUT / fname))
        data[fname] = truth
        invested = sum(D(t["cost"]) for t in truth["funds"])
        print(f"{fname:34} funds={len(truth['funds']):2} rows={sum(t['rows'] for t in truth['funds']):4} "
              f"invested=Rs {invested:>12,.0f} value=Rs {D(truth['total_value']):>12,.0f}")
    tp.write_text(json.dumps(data, indent=1), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
