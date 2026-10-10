"""Stress-test family CAS (2026-10-10): Ayush Karnawat (26 funds) + Anand Karnawat
(20 funds), 46 holdings in one consolidated statement, ~Rs 2 Cr invested, ~Rs 2.95 Cr
market value (kept under Rs 3 Cr). Built to see how import/dashboard/analytics behave
on a very large real-looking file: thousands of SIP rows, many AMCs, stamp duty rows,
partial redemptions, bounced SIPs, a step-up SIP in a second folio, one fund in two folios.

Fund names/ISINs/NAVs are real, taken from the saved AMFI feed (navall_2026-10-06.txt)
so the local scheme master identifies every fund. Investors, PANs, folios, amounts and
dates are fictitious. Reuses gen_scenarios' ledger + CAMS-layout builder; like
gen_gate_scenarios.py it only ADDS a PDF and a truth.json entry.

Run from this folder (needs reportlab + pikepdf):  python gen_big_family.py
Password: MF@123
"""
from __future__ import annotations

import json
import random
import re
from datetime import date
from decimal import Decimal as D

import gen_scenarios as g
from pdf_dir import pdf_dir

FEED = g.HERE / "navall_2026-10-06.txt"
FNAME = "big_family_ayush_anand_7yr.pdf"
TARGET_TOTAL_VALUE = D("29700000")   # < Rs 3 Cr
TARGET_TOTAL_COST = 20000000         # Rs 2 Cr invested
WINDOW = ("7yr", date(2019, 1, 1))

AYUSH_ISINS = """INF879O01027 INF179K01UT0 INF179K01XQ0 INF179KA1RW5 INF109K012K1 INF200K01T51
INF200K01RA0 INF200K01QX4 INF200K01UG1 INF174K01KT2 INF204K01K15 INF204K01E54 INF204K01XI3
INF846K01EH3 INF846K01K35 INF846K01EW2 INF769K01DM9 INF769K01BI1 INF769K01AX2 INF789F01XA0
INF247L01957 INF966L01986 INF966L01911 INF966L01689 INF090I01FK3 INF740K01PI2""".split()
ANAND_ISINS = """INF090I01IW2 INF740K01PX1 INF740K01QD1 INF194K01W62 INF194KB1AL4 INF194K01Y29
INF277K01Z77 INF277K011O1 INF277K01I86 INF843K01AL0 INF843K01AO4 INF205K01LE4 INF205K01MA0
INF917K01GP0 INF336L01DH5 INF917K01FZ1 INF03VN01530 INF109K016B1 INF179K01WA6 INF846K01EI1""".split()
STEP_UP = {11: (3, 14), 23: (6,)}  # fund indexes that also get a second-folio step-up SIP (keeps holdings at 49)
DEBT = {"INF109K016B1", "INF846K01EI1"}


def load_feed() -> dict[str, tuple[str, str, g.Decimal]]:
    """ISIN -> (AMC, scheme name, NAV) for Direct Growth plans."""
    out, amc = {}, None
    for line in FEED.read_text(encoding="utf-8").splitlines():
        p = line.strip().split(";")
        if len(p) == 1 and p[0].endswith("Mutual Fund"):
            amc = p[0]
        elif len(p) >= 8 and p[1].startswith("INF") and p[4] == "Direct Plan" and p[5].startswith("Growth"):
            out.setdefault(p[1], (amc, p[3], D(p[6])))
    return out


def clean_name(raw: str) -> str:
    n = re.sub(r"\s*\(erstwhile[^)]*\)", "", raw).strip(" -")
    if n.isupper() or n.islower():
        n = n.title()
    return f"{n} - Direct Plan - Growth"


def make_funds(isins, feed, cagr_k):
    rng = random.Random(7)
    funds = []
    for i, isin in enumerate(isins):
        amc, raw, nav = feed[isin]
        debt = isin in DEBT
        base = 0.075 if debt else rng.choice([0.13, 0.15, 0.17, 0.19, 0.22])
        f = g.Fund(f"BIG{isin[-6:]}", f"BF{i:03d}G", clean_name(raw), isin, amc, nav,
                   base * cagr_k, equity=not debt)
        g.F[f.key] = f
        funds.append(f)
    return funds


def folio_no(rng, i):
    n = rng.randint(1000000, 9999999)
    return f"{n} / {rng.randint(10, 99)}" if i % 3 == 0 else str(n)


def make_builder(funds, seed):
    rng = random.Random(seed)
    folios = {}  # AMC -> folio (one per AMC; a few funds get a second folio)
    plan = []
    for i, f in enumerate(funds):
        folio = folios.setdefault(f.amc, folio_no(rng, len(folios)))
        plan.append((f, folio, i))
    kinds = [rng.choice(["sip", "sip", "sip", "lump+sip", "lump", "lump+sip"]) for _ in funds]
    starts = [date(rng.randint(2019, 2024), rng.randint(1, 12), rng.randint(1, 26)) for _ in funds]

    def build(L: g.Ledger):
        r = random.Random(seed + 1)
        for (f, folio, i), kind, s in zip(plan, kinds, starts):
            adv = "DIRECT"
            if "lump" in kind:
                L.buy(folio, f.key, s, r.choice([150000, 250000, 400000, 600000, 900000]), advisor=adv)
            if "sip" in kind:
                months = r.randint(24, 80)
                start = s if kind == "sip" else date(min(s.year + 1, 2025), s.month, 1)
                amt = r.choice([5000, 7500, 10000, 15000, 20000, 25000])
                bounce = {r.randint(3, months - 1)} if r.random() < 0.2 else set()
                L.sip(folio, f.key, start, months, amt, day=r.randint(1, 27), advisor=adv, bounce=bounce)
                if i in STEP_UP.get(seed, ()):  # step-up SIP in a second folio of the same fund
                    L.sip(folio + "1", f.key, date(2024, 4, 1), 18, amt * 2, day=8, label="SIP Purchase", advisor=adv)
            if r.random() < 0.3:
                L.redeem(folio, f.key, date(r.randint(2024, 2026), r.randint(1, 8), r.randint(1, 27)),
                         fraction=r.choice([0.1, 0.15, 0.25]))
    return build


def person(slug, name, pan, isins, feed, k, target):
    funds = make_funds(isins, feed, k)
    return g.Persona(slug, name, pan, f"{slug}@example.com", 2019, target, [WINDOW],
                     make_builder(funds, seed=11 if slug == "ay" else 23),
                     f"{len(funds)} funds")


def build_all(feed, k):
    # Value split by fund count, so the two investors look proportionate.
    tot = TARGET_TOTAL_VALUE
    ay = person("ay", "AYUSH KARNAWAT", "AXKPK4417R", AYUSH_ISINS, feed, k, tot * 26 // 46)
    an = person("an", "ANAND KARNAWAT", "BYNPK8826F", ANAND_ISINS, feed, k, tot * 20 // 46)
    return ay, an, g.ledger_for(ay), g.ledger_for(an)


def totals(ay, an, La, Ln):
    cost = value = D(0)
    for L in (La, Ln):
        for h, ob, rows, close, nd, nav, c in L.window(WINDOW[1], g.STATEMENT_TO):
            cost += c
            value += g.q2(close * nav)
    return cost, value


def main():
    feed = load_feed()
    # Bisect the growth multiplier until invested ~= Rs 2 Cr at ~Rs 2.97 Cr value.
    lo, hi = 0.3, 2.0
    for _ in range(18):
        k = (lo + hi) / 2
        cost, value = totals(*build_all(feed, k))
        if cost > TARGET_TOTAL_COST:
            lo = k          # too much invested for this value -> need more growth
        else:
            hi = k
    ay, an, La, Ln = build_all(feed, k)
    cost, value = totals(ay, an, La, Ln)
    pdf, truth = g.render(ay, La, WINDOW[0], WINDOW[1], extra=[(an, Ln)])
    out = pdf_dir() / "realistic"
    out.mkdir(parents=True, exist_ok=True)
    g.encrypt_pdf(pdf, g.PASSWORD, str(out / FNAME))
    tp = g.HERE / "truth.json"
    data = json.loads(tp.read_text(encoding="utf-8"))
    data[FNAME] = truth
    tp.write_text(json.dumps(data, indent=1), encoding="utf-8", newline="\n")
    rows = sum(t["rows"] for t in truth["funds"])
    by = {}
    for t in truth["funds"]:
        by.setdefault(t["member"], []).append(t)
    print(f"k={k:.3f}  file={out / FNAME}")
    print(f"funds={len(truth['funds'])}  txn rows={rows}  invested=Rs {cost:,.0f}  value=Rs {value:,.0f}")
    for m, ts in by.items():
        print(f"  {m}: {len(ts)} funds, value Rs {sum(D(t['value']) for t in ts):,.0f}")


if __name__ == "__main__":
    main()
