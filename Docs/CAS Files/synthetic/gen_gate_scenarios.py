"""Extra synthetic statements for the Phase 7 gate (2026-10-06), added beside
gen_scenarios.py without regenerating its files: running this only ADDS the
PDFs below and their truth.json entries; existing files and entries are left
untouched.

- fam_FY.pdf          p20 + p10 family statement, FY window (order tests
                      against fam_10yr.pdf).
- fam_noname_FY.pdf   p20 + p3 family statement whose p3 folios print no
                      holder name: the people popup must ask for a name (U9).
- p3u_FY.pdf          p3's ledger plus one held fund whose ISIN is in no
                      master (made up on purpose): the one case the review
                      screen's replacement must still ask about (needs_review).

Run from this folder: python gen_gate_scenarios.py
"""
from __future__ import annotations

import copy
import json
from datetime import date
from decimal import Decimal as D

import gen_scenarios as g

UNKNOWN = g.Fund("ZEPHYR_EO_D", "ZEO01", "Zephyr Emerging Opportunities Fund - Direct Plan - Growth",
                 "INF000Z01ZZ9", "Zephyr Mutual Fund", D("23.4100"), 0.12)
g.F[UNKNOWN.key] = UNKNOWN


def build_p3u(L: g.Ledger):
    g.build_p3(L)
    L.buy("7700001", UNKNOWN.key, date(2024, 5, 6), 200000)


def main():
    by_slug = {p.slug: p for p in g.PERSONAS}
    p20, p10, p3 = by_slug["p20"], by_slug["p10"], by_slug["p3"]
    L20, L10, L3 = g.ledger_for(p20), g.ledger_for(p10), g.ledger_for(p3)

    # The addressee's persona carries per-folio holder overrides (see render()).
    p20_noname = copy.copy(p20)
    p20_noname.folio_holders = {h.folio: ("", p3.pan, []) for h in L3.h.values()}

    p3u = g.Persona("p3u", p3.name, p3.pan, p3.email, p3.first_year, D("2400000"),
                    [g.WFY], build_p3u, "p3 plus one held fund missing from every master")
    L3u = g.ledger_for(p3u)

    files = {
        "fam_FY.pdf": g.render(p20, L20, "FY", g.WFY[1], extra=[(p10, L10)]),
        "fam_noname_FY.pdf": g.render(p20_noname, L20, "FY", g.WFY[1], extra=[(p3, L3)]),
        "p3u_FY.pdf": g.render(p3u, L3u, "FY", g.WFY[1]),
    }
    truth_path = g.HERE / "truth.json"
    truth = json.loads(truth_path.read_text())
    for fname, (pdf, t) in files.items():
        g.encrypt_pdf(pdf, g.PASSWORD, str(g.PDF_DIR / fname))
        truth[fname] = t
        print(f"{fname:20} funds={len(t['funds']):2} value=Rs {D(t['total_value']):>16,.2f}")
    truth_path.write_text(json.dumps(truth, indent=1))


if __name__ == "__main__":
    main()
