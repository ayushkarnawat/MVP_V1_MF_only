"""Synthetic reproduction of the real family CAS that exposed the opening-cost
plausibility bug and the inflated-XIRR issue (2026-10-10 investigation --
see Docs/investigations/2026-10-10-cas-opening-cost-plausibility-bug-handoff.md).

Every fund, ISIN, AMFI/RTA code, unit balance, cost and transaction below is
copied verbatim from that real statement's casparser parse
(chandra_repro_data/member_a.json, member_b.json), so re-importing this file
reproduces the exact bug without depending on the real founder's PDF. Those
two JSON files already have PII stripped (no investor_info block, nominees
replaced with fictional names); this script supplies its own fictional
investor identity, email, mobile, address and folio numbers on top.

Run from this folder (needs reportlab + pikepdf):  python gen_chandra_repro.py
Password: MF@123
"""
from __future__ import annotations

import json
from datetime import datetime
from decimal import Decimal as D
from pathlib import Path

from cas_builder import AmcBlock, CASBuilder, Folio, Scheme, Txn, encrypt_pdf
from pdf_dir import pdf_dir

HERE = Path(__file__).resolve().parent
DATA_DIR = HERE / "chandra_repro_data"
FNAME = "r4_oak_family_legacy_cost_bug.pdf"
PASSWORD = "MF@123"

# Fictional identity standing in for the real uploader + two household members
# the real file split into (see the investigation doc for why two members
# share one consolidated statement).
INVESTOR_NAME = "Devendra Raghunath Oak"
INVESTOR_EMAIL = "oak.family.demo@example.com"
INVESTOR_MOBILE = "+919800012345"
INVESTOR_ADDRESS = ["A/404 Sunrise Enclave", "Baner Road", "Pune 411045", "Maharashtra India"]
MEMBER_A_NAME = "Devendra Raghunath Oak"  # member_a.json, 39 folios -- carries the two bug funds
MEMBER_B_NAME = "Deepa Devendra Oak"      # member_b.json, 5 folios


def fmt_date(iso: str) -> str:
    return datetime.strptime(iso, "%Y-%m-%d").strftime("%d-%b-%Y")


def fmt_amount(x) -> str: return f"{float(x):,.2f}"
def fmt_units(x) -> str: return f"{float(x):,.3f}"
def fmt_price(x) -> str: return f"{float(x):,.4f}"


def fake_folio(real_folio: str, index: int) -> str:
    """Deterministic fictional folio number; keeps a real sub-account's ' / NN' suffix."""
    base = 1000000 + index * 137
    if " / " in real_folio:
        _, suffix = real_folio.split(" / ")
        return f"{base} / {suffix}"
    return str(base)


def build_txn(raw: dict) -> Txn:
    return Txn(
        date=fmt_date(raw["date"]),
        desc=raw["description"],
        amount=fmt_amount(raw["amount"]) if raw["amount"] is not None else "",
        units=fmt_units(raw["units"]) if raw["units"] is not None else None,
        price=fmt_price(raw["nav"]) if raw["nav"] is not None else None,
        balance=fmt_units(raw["balance"]) if raw["balance"] is not None else None,
    )


def load_member(path: Path, holder_name: str, folio_counter_start: int):
    data = json.loads(path.read_text(encoding="utf-8"))
    by_amc: dict[str, list[Folio]] = {}
    summary: dict[str, list[float]] = {}
    truth = []
    idx = folio_counter_start
    for f in data["folios"]:
        idx += 1
        folio_no = fake_folio(f["folio"], idx)
        schemes = []
        nominee = None
        for s in f["schemes"]:
            v = s["valuation"]
            style = "kfintech" if s["rta"] == "KFINTECH" else "cams_inline_advisor" if s.get("advisor") else "cams_inline"
            schemes.append(Scheme(
                code=s["rta_code"], name=s["scheme"], isin=s["isin"], style=style,
                open_bal=fmt_units(s["open"]), txns=[build_txn(t) for t in s["transactions"]],
                close_bal=fmt_units(s["close"]), nav_date=fmt_date(v["date"]),
                nav=fmt_price(v["nav"]), valuation=fmt_amount(v["value"]), cost=fmt_amount(v["cost"]),
                advisor=s.get("advisor"),
            ))
            if nominee is None and s.get("nominees"):
                nominee = s["nominees"][0]
            truth.append({"member": holder_name, "folio": folio_no, "isin": s["isin"], "fund": s["scheme"],
                          "open": s["open"], "close": s["close"], "value": v["value"], "cost": v["cost"],
                          "rows": len(s["transactions"])})
        folio = Folio(folio_no, None, holder_name, nominee=nominee, schemes=schemes)
        by_amc.setdefault(f["amc"], []).append(folio)
        for sc in schemes:
            totals = summary.setdefault(f["amc"], [0.0, 0.0])
            totals[0] += float(sc.cost.replace(",", ""))
            totals[1] += float(sc.valuation.replace(",", ""))
    return by_amc, summary, truth, idx


def main():
    by_amc_a, summary_a, truth_a, last_idx = load_member(DATA_DIR / "member_a.json", MEMBER_A_NAME, 0)
    by_amc_b, summary_b, truth_b, _ = load_member(DATA_DIR / "member_b.json", MEMBER_B_NAME, last_idx)

    by_amc: dict[str, list[Folio]] = {}
    summary: dict[str, list[float]] = {}
    for src_amc, src_sum in ((by_amc_a, summary_a), (by_amc_b, summary_b)):
        for amc, folios in src_amc.items():
            by_amc.setdefault(amc, []).extend(folios)
        for amc, (cost, val) in src_sum.items():
            totals = summary.setdefault(amc, [0.0, 0.0])
            totals[0] += cost
            totals[1] += val

    amc_blocks = [AmcBlock(amc, folios) for amc, folios in by_amc.items()]
    portfolio_summary = [(amc, cost, val) for amc, (cost, val) in summary.items()]
    period = json.loads((DATA_DIR / "member_a.json").read_text(encoding="utf-8"))["statement_period"]

    pdf = CASBuilder().build(
        statement_from=period["from_"], statement_to=period["to"],
        investor_name=INVESTOR_NAME, investor_email=INVESTOR_EMAIL,
        investor_address=INVESTOR_ADDRESS, investor_mobile=INVESTOR_MOBILE,
        amc_blocks=amc_blocks, portfolio_summary=portfolio_summary,
    )
    out = pdf_dir() / "realistic"
    out.mkdir(parents=True, exist_ok=True)
    encrypt_pdf(pdf, PASSWORD, str(out / FNAME))

    truth = truth_a + truth_b
    tp = HERE / "truth.json"
    data = json.loads(tp.read_text(encoding="utf-8"))
    data[FNAME] = {
        "persona": "r4_oak", "window": "FY", "from": period["from_"], "investor": INVESTOR_NAME,
        "funds": truth, "total_value": str(sum(D(str(t["value"])) for t in truth)),
    }
    tp.write_text(json.dumps(data, indent=1), encoding="utf-8", newline="\n")

    total_cost = sum(D(str(t["cost"])) for t in truth)
    total_val = sum(D(str(t["value"])) for t in truth)
    print(f"file={out / FNAME}")
    print(f"members=2  funds={len(truth)}  invested=Rs {total_cost:,.2f}  value=Rs {total_val:,.2f}")
    bug_funds = [t for t in truth if t["isin"] in ("INF179K01608", "INF903JA1LH5") and t["cost"] in ("30000.00", "100000.00")]
    print(f"bug funds present: {len(bug_funds)} (expect 2 -- HDFC Flexi Cap 603.209u/Rs 30,000 and Sundaram Multi Asset 9999.5u/Rs 100,000)")


if __name__ == "__main__":
    main()
