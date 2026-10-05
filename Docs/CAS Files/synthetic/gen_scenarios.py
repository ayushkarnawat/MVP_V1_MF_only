"""Synthetic long-history CAS scenarios for the CAS value-discrepancy deep dive
(2026-10-05). Each persona's full investing history is simulated once as a
ledger; every statement file is then a *window* cut from that same ledger
(opening balance at the window start, in-window rows, closing balance), the
same way CAMS builds a real CAS for a chosen lookback. So every file of a
persona has the same true closing units and value, whatever its lookback --
the property the import must preserve.

Fund names, ISINs, RTA codes and current NAVs are real (casparser_isin
master + mfapi.in, fetched 2026-10-05); NAV history before today is a smooth
synthetic curve ending at the real NAV. Investors, PANs, folios, amounts and
dates are fictitious. One merged-away fund uses a made-up ISIN on purpose
(funds that no longer exist are absent from casparser's master).

Usage:  python gen_scenarios.py            # writes PDFs + truth.json here
Password for every file: MF@123
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

from cas_builder import AmcBlock, CASBuilder, Folio, Scheme, Txn, encrypt_pdf
from layouts import KfinBuilder, OldCamsBuilder

HERE = Path(__file__).resolve().parent
PASSWORD = "MF@123"
END = date(2026, 10, 1)  # NAV date of the real latest NAVs below
STATEMENT_TO = date(2026, 10, 5)
STAMP_FROM = date(2020, 7, 1)  # stamp duty on MF purchases started 1 Jul 2020
D = Decimal


def q2(x): return D(x).quantize(D("0.01"), ROUND_HALF_UP)
def q3(x): return D(x).quantize(D("0.001"), ROUND_HALF_UP)
def q4(x): return D(x).quantize(D("0.0001"), ROUND_HALF_UP)
def fmt_d(d: date) -> str: return d.strftime("%d-%b-%Y")


def money(x: Decimal, neg=False) -> str:
    s = f"{abs(x):,.2f}"
    return f"({s})" if neg or x < 0 else s


def unitstr(x: Decimal) -> str:
    s = f"{abs(x):,.3f}"
    return f"({s})" if x < 0 else s


# ---------------------------------------------------------------- fund catalog
@dataclass(frozen=True)
class Fund:
    key: str
    code: str          # RTA scheme code printed before the name
    name: str          # name as printed on the CAS
    isin: str
    amc: str
    nav_end: Decimal   # real NAV on END (or last NAV for a dead fund)
    cagr: float
    equity: bool = True
    dead_on: date | None = None  # fund stopped existing (merged) on this date


F = {f.key: f for f in [
    Fund("PPFAS_D", "PP001ZG", "Parag Parikh Flexi Cap Fund - Direct Plan Growth", "INF879O01027", "PPFAS Mutual Fund", D("88.2569"), 0.17),
    Fund("HDFC_FLEXI_LEGACY", "H02", "HDFC Flexi Cap Fund - Growth Option", "INF179K01608", "HDFC Mutual Fund", D("1951.4190"), 0.15),
    Fund("HDFC_FLEXI_D", "H02T", "HDFC Flexi Cap Fund - Direct Plan - Growth Option", "INF179K01UT0", "HDFC Mutual Fund", D("2150.0820"), 0.16),
    Fund("ICICI_LARGE_LEGACY", "P1191", "ICICI Prudential Bluechip Fund - Growth", "INF109K01BL4", "ICICI Prudential Mutual Fund", D("101.6000"), 0.14),
    Fund("ICICI_LARGE_D", "P8042", "ICICI Prudential Bluechip Fund - Direct Plan - Growth", "INF109K016L0", "ICICI Prudential Mutual Fund", D("112.2900"), 0.15),
    Fund("AXIS_LARGE_D", "128EFDG", "Axis Bluechip Fund - Direct Growth", "INF846K01DP8", "Axis Mutual Fund", D("65.8200"), 0.13),
    Fund("AXIS_LARGE_REG", "128EFGP", "Axis Bluechip Fund - Regular Growth", "INF846K01164", "Axis Mutual Fund", D("56.6400"), 0.12),
    Fund("DSP_ES_REG", "D562", "DSP Equity Savings Fund - Reg - Growth", "INF740KA1439", "DSP Mutual Fund", D("22.0030"), 0.08),
    Fund("DSP_ES_DIR", "D835", "DSP Equity Savings Fund - Dir - Growth", "INF740KA1504", "DSP Mutual Fund", D("24.9250"), 0.09),
    Fund("HDFC_RSF_D", "HSTGT", "HDFC Regular Savings Fund - Direct Plan - Growth Option", "INF179K01YP0", "HDFC Mutual Fund", D("35.3273"), 0.08, equity=False, dead_on=date(2018, 5, 8)),
    Fund("HDFC_BAF_IDCW", "HGFDD", "HDFC Balanced Advantage Fund - Regular Plan - IDCW Reinvestment", "INF179K01822", "HDFC Mutual Fund", D("34.3200"), 0.04),
    Fund("NIPPON_N50_D", "RMFNFAG", "Nippon India Index Fund - Nifty 50 Plan - Direct Plan Growth Plan - Growth Option", "INF204K01H36", "Nippon India Mutual Fund", D("41.4263"), 0.12),
    Fund("HSBC_VALUE_D", "OFIVGD", "HSBC Value Fund - Direct Plan - Growth", "INF917K01HD4", "HSBC Mutual Fund", D("122.4233"), 0.17),
    Fund("SBI_FMP_DIR", "LD587G", "SBI Fixed Maturity Plan (FMP) - Series 6 (3668 Days) Dir Growth", "INF200KA1F27", "SBI Mutual Fund", D("17.2527"), 0.07, equity=False),
    Fund("HDFC_LIQUID_OLD", "HLFG", "HDFC Liquid Fund - Growth", "INF179K01KG8", "HDFC Mutual Fund", D("5531.7426"), 0.065, equity=False),
    # KFintech-serviced (KARVY) Axis funds and the wound-up Franklin scheme + its
    # Jan-2020 segregated (Vodafone Idea) portfolio, all real.
    Fund("AXIS_LIQUID_D", "128CFDG", "Axis Liquid Fund - Direct Growth", "INF846K01CX4", "Axis Mutual Fund", D("3172.9339"), 0.065, equity=False),
    Fund("AXIS_MID_D", "128MCDG", "Axis Mid Cap Fund - Direct Growth", "INF846K01EH3", "Axis Mutual Fund", D("136.7400"), 0.16),
    Fund("FRANKLIN_LD_D", "FTI492", "Franklin India Low Duration Fund - Direct - Growth", "INF090I01HG7", "Franklin Templeton Mutual Fund", D("28.6858"), 0.075, equity=False, dead_on=date(2022, 8, 7)),
    Fund("FRANKLIN_SEG1", "FTI896", "Franklin India Low Duration Fund-Direct- Segregated Portfolio 1 (8.25% Vodafone Idea Ltd-10jul20) - Growth", "INF090I01UD7", "Franklin Templeton Mutual Fund", D("0"), 0.0, equity=False),
    # px persona: pre-face-value-change HDFC Liquid ISIN and its successor, an
    # NFO, and a matured FMP (all real ISINs/codes).
    Fund("HDFC_LIQ_OLD2", "HLFG", "HDFC Liquid Fund - Growth", "INF179K01KG8", "HDFC Mutual Fund", D("24.0000"), 0.075, equity=False, dead_on=date(2013, 6, 3)),
    Fund("HDFC_LIQ_NEW", "HLFGN", "HDFC Liquid Fund - Growth", "INF179KB1HK0", "HDFC Mutual Fund", D("5531.7426"), 0.068, equity=False),
    Fund("JIO_FLEXI_D", "JIO180", "JioBlackRock Flexi Cap Fund - Direct - Growth", "INF22M001093", "JioBlackRock Mutual Fund", D("10.0081"), 0.0),
    Fund("ICICI_FMP85A", "P9477", "ICICI Prudential FMP Series 85 - 1197 Days Plan A - Direct Plan Cumulative", "INF109KC1SL9", "ICICI Prudential Mutual Fund", D("12.8620"), 0.075, equity=False, dead_on=date(2022, 5, 5)),
    # Merged away in 2022; deliberately a made-up ISIN: dead funds are not
    # in casparser's master, which is exactly the situation being tested.
    Fund("SMALLCAP_MERGED", "XSC01", "Unifund Small Cap Equity Fund - Direct Plan - Growth", "INF000X01AB1", "HSBC Mutual Fund", D("31.5000"), 0.16, dead_on=date(2022, 11, 25)),
]}


def nav_on(fund: Fund, d: date) -> Decimal:
    if fund.nav_end == 0:  # segregated portfolio carried at zero
        return D("0")
    anchor = fund.dead_on or END
    years = (anchor - d).days / 365.25
    wobble = 1 + 0.035 * math.sin(d.toordinal() / 41 + len(fund.key))
    return q4(fund.nav_end / D(str((1 + fund.cagr) ** years)) * D(str(wobble)))


# ---------------------------------------------------------------- ledger
@dataclass
class Row:
    d: date
    desc: str
    amount: Decimal | None
    units: Decimal | None
    nav: Decimal | None
    balance: Decimal | None
    parens: bool = False  # KFin prints some *Reversed* rows in parentheses although positive


@dataclass
class Holding:
    fund: Fund
    folio: str
    advisor: str | None
    rows: list = field(default_factory=list)
    lots: list = field(default_factory=list)  # [units, cost_per_unit]
    bal: Decimal = D("0")


def _scheduled(fn):
    """Builders call ledger ops in any order; each op is queued with its date
    and replayed chronologically by Ledger.run(), so running balances, FIFO
    lots and opening balances are computed in true date order."""
    def wrapper(self, *args, **kwargs):
        d = next(a for a in list(args) + list(kwargs.values()) if isinstance(a, date))
        self.queue.append((d, len(self.queue), fn, args, kwargs))
    return wrapper


class Ledger:
    def __init__(self, scale: Decimal):
        self.scale = scale
        self.h: dict[tuple[str, str], Holding] = {}
        self.queue: list = []

    def run(self):
        for _, _, fn, args, kwargs in sorted(self.queue, key=lambda e: (e[0], e[1])):
            fn(self, *args, **kwargs)
        self.queue = []

    def hold(self, folio, key, advisor=None) -> Holding:
        k = (folio, key)
        if k not in self.h:
            self.h[k] = Holding(F[key], folio, advisor)
        return self.h[k]

    def _row(self, h, d, desc, amount, units, nav, stamp=None, stt=None):
        if units is not None:
            h.bal = q3(h.bal + units)
        h.rows.append(Row(d, desc, amount, units, nav, h.bal if units is not None else None))
        if stamp:
            h.rows.append(Row(d, "*** Stamp Duty ***", stamp, None, None, None))
        if stt:
            h.rows.append(Row(d, "*** STT Paid ***", stt, None, None, None))

    @_scheduled
    def buy(self, folio, key, d, gross, desc="Purchase", advisor=None):
        h = self.hold(folio, key, advisor)
        nav = nav_on(h.fund, d)
        gross = q2(D(gross) * self.scale)
        stamp = q2(gross * D("0.00005")) if d >= STAMP_FROM else None
        net = gross - (stamp or 0)
        units = q3(net / nav)
        h.lots.append([units, net / units])
        self._row(h, d, desc, net, units, nav, stamp=stamp)
        return units

    def sip(self, folio, key, start, months, gross, day=5, label="Systematic Investment Purchase", advisor=None,
            bounce: set[int] | None = None):
        bounce = bounce or set()
        d0 = start.replace(day=day)
        for i in range(months):
            y, m = d0.year + (d0.month - 1 + i) // 12, (d0.month - 1 + i) % 12 + 1
            d = date(y, m, day)
            if d > END:
                break
            self.buy(folio, key, d, gross, f"{label} - Instalment {i + 1}/{months}", advisor)
            if i in bounce:  # mandate bounced: that instalment reversed 3 days later
                self.reverse_last(folio, key, d + timedelta(days=3))

    @_scheduled
    def reverse_last(self, folio, key, d):
        h = self.hold(folio, key)
        last = next(r for r in reversed(h.rows) if r.units and r.units > 0)
        self._consume(h, last.units)
        self._row(h, d, "Reversal - SIP Purchase - Payment not received", -last.amount, -last.units, last.nav)

    def _consume(self, h, units) -> Decimal:
        remaining, cost = units, D("0")
        while remaining > 0 and h.lots:
            lot = h.lots[0]
            take = min(lot[0], remaining)
            cost += take * lot[1]
            lot[0] -= take
            remaining -= take
            if lot[0] == 0:
                h.lots.pop(0)
        return cost

    @_scheduled
    def redeem(self, folio, key, d, gross=None, all_units=False, fraction=None, desc="Redemption"):
        h = self.hold(folio, key)
        nav = nav_on(h.fund, d)
        if all_units:
            units = h.bal
        elif fraction is not None:
            units = q3(h.bal * D(str(fraction)))
        else:
            units = min(h.bal, q3(D(gross) * self.scale / nav))
        amount = q2(units * nav)
        self._consume(h, units)
        stt = q2(amount * D("0.00001")) if h.fund.equity and d >= date(2004, 10, 1) else None
        self._row(h, d, desc, -amount, -units, nav, stt=stt)
        return amount

    @_scheduled
    def switch(self, folio, from_key, to_folio, to_key, d, all_units=False, fraction=None, merger=False, advisor=None,
               desc_out=None, desc_in=None):
        src = self.hold(folio, from_key)
        nav = nav_on(src.fund, d)
        units = src.bal if all_units else q3(src.bal * D(str(fraction)))
        amount = q2(units * nav)
        self._consume(src, units)
        word = "Merger" if merger else f"To {F[to_key].name}"
        self._row(src, d, desc_out or f"Switch-Out - {word}", -amount, -units, nav)
        dst = self.hold(to_folio, to_key, advisor)
        nav2 = nav_on(dst.fund, d)
        u2 = q3(amount / nav2)
        dst.lots.append([u2, amount / u2])
        word = "Merger" if merger else f"From {src.fund.name}"
        self._row(dst, d, desc_in or f"Switch-In - {word}", amount, u2, nav2)

    @_scheduled
    def idcw_reinvest(self, folio, key, d, rate):
        h = self.hold(folio, key)
        nav = nav_on(h.fund, d)
        amount = q2(h.bal * D(str(rate)))
        units = q3(amount / nav)
        h.lots.append([units, amount / units])
        self._row(h, d, f"IDCW Reinvestment @ Rs.{rate} per unit", amount, units, nav)

    @_scheduled
    def idcw_payout(self, folio, key, d, rate):
        h = self.hold(folio, key)
        self._row(h, d, f"IDCW Paid @ Rs.{rate} per unit", q2(h.bal * D(str(rate))), None, None)

    @_scheduled
    def bonus(self, folio, key, d, ratio):
        h = self.hold(folio, key)
        units = q3(h.bal * D(str(ratio)))
        h.lots.append([units, D("0")])
        # Bonus rows carry units and balance but no amount/price, like CAMS prints them.
        self._row(h, d, "Bonus Units Allotted", None, units, None)

    @_scheduled
    def gift_in(self, folio, key, d, units, donor_folio="9988776655"):
        h = self.hold(folio, key)
        nav = nav_on(h.fund, d)
        units = q3(D(units) * self.scale)
        h.lots.append([units, nav])
        self._row(h, d, f"Gift - Transfer In from Folio No: {donor_folio}", q2(units * nav), units, nav)

    @_scheduled
    def face_value_change(self, folio, from_key, to_key, d):
        """Unit consolidation (face value change): old units debited, fewer
        new units credited at the same total value. CAMS prints these rows
        with units and balance but no amount or price."""
        src, dst = self.hold(folio, from_key), self.hold(folio, to_key)
        units = src.bal
        new_units = q3(units * nav_on(src.fund, d) / nav_on(dst.fund, d))
        cost = self._consume(src, units)
        self._row(src, d, "Face Value Change - Units Debited", None, -units, None)
        dst.lots.append([new_units, cost / new_units])
        self._row(dst, d, "Face Value Change - Units Credited", None, new_units, None)

    @_scheduled
    def nfo(self, folio, key, d, gross):
        h = self.hold(folio, key)
        gross = q2(D(gross) * self.scale)
        units = q3(gross / D("10"))
        h.lots.append([units, D("10")])
        self._row(h, d, "NFO Allotment - New Fund Offer", gross, units, D("10.0000"))

    @_scheduled
    def swp(self, folio, key, d, gross, i, n):
        h = self.hold(folio, key)
        nav = nav_on(h.fund, d)
        amount = q2(D(gross) * self.scale)
        units = q3(amount / nav)
        self._consume(h, units)
        self._row(h, d, f"Systematic Withdrawal Plan - Instalment {i}/{n}", -amount, -units, nav)

    @_scheduled
    def idcw_sweep(self, folio, key, to_folio, to_key, d, rate):
        """Dividend transfer (IDCW sweep): payout in the source fund, the same
        amount invested in another fund."""
        src = self.hold(folio, key)
        amount = q2(src.bal * D(str(rate)))
        self._row(src, d, f"IDCW Paid @ Rs.{rate} per unit", amount, None, None)
        dst = self.hold(to_folio, to_key)
        nav = nav_on(dst.fund, d)
        units = q3(amount / nav)
        dst.lots.append([units, nav])
        self._row(dst, d, "IDCW Sweep In - HDFC Balanced Adv Fund", amount, units, nav)  # fits the column like a real CAS

    @_scheduled
    def transmission_in(self, folio, key, d, units, ex_holder):
        h = self.hold(folio, key)
        nav = nav_on(h.fund, d)
        units = q3(D(units) * self.scale)
        h.lots.append([units, nav])
        self._row(h, d, f"Transmission - Units Credited (Ex-holder: {ex_holder})", q2(units * nav), units, nav)

    @_scheduled
    def redeem_tds(self, folio, key, d, fraction, tds_pct):
        """NRI redemption with TDS deducted on the gain (separate amount row)."""
        h = self.hold(folio, key)
        nav = nav_on(h.fund, d)
        units = q3(h.bal * D(str(fraction)))
        amount = q2(units * nav)
        cost = self._consume(h, units)
        self._row(h, d, "Redemption", -amount, -units, nav)
        h.rows.append(Row(d, "*** TDS on Capital Gains ***", q2((amount - cost) * D(str(tds_pct))), None, None, None))

    @_scheduled
    def merger_blank(self, folio, from_key, to_folio, to_key, d):
        """Merger printed without amount/price (units and balance only)."""
        src = self.hold(folio, from_key)
        units = src.bal
        value = units * nav_on(src.fund, d)
        cost = self._consume(src, units)
        self._row(src, d, "Switch-Out - Merger", None, -units, None)
        dst = self.hold(to_folio, to_key)
        u2 = q3(value / nav_on(dst.fund, d))
        dst.lots.append([u2, cost / u2])
        self._row(dst, d, "Switch-In - Merger", None, u2, None)

    @_scheduled
    def segregate(self, folio, key, seg_key, d):
        """Credit event: units equal to the holding are allotted in the
        segregated portfolio at zero cost (SEBI side-pocketing)."""
        h = self.hold(folio, key)
        seg = self.hold(folio, seg_key)
        units = h.bal
        seg.lots.append([units, D("0")])
        self._row(seg, d, "Segregated Portfolio Units Allotted", D("0"), units, D("0"))

    @_scheduled
    def extinguish(self, folio, key, d, fraction=None, all_units=False):
        """Wound-up scheme repaying investors: units extinguished at NAV."""
        h = self.hold(folio, key)
        nav = nav_on(h.fund, d)
        units = h.bal if all_units else q3(h.bal * D(str(fraction)))
        amount = q2(units * nav)
        self._consume(h, units)
        self._row(h, d, "Payment - Units Extinguished", -amount, -units, nav)

    @_scheduled
    def extinguish_reversed(self, folio, key, d):
        """KFin/Franklin quirk: the last extinguishment reversed (units come
        back) but printed in parentheses as if negative."""
        h = self.hold(folio, key)
        last = next(r for r in reversed(h.rows) if r.units and r.units < 0)
        h.lots.insert(0, [-last.units, last.nav])
        self._row(h, d, "Payment - Units Extinguished-Reversed", -last.amount, -last.units, last.nav)
        h.rows[-1].parens = True

    # ---- statement window
    def window(self, start: date, end: date):
        out = []
        for h in self.h.values():
            open_bal = D("0")
            rows = []
            for r in h.rows:
                if r.d < start:
                    if r.units is not None:
                        open_bal = r.balance
                elif r.d <= end:
                    rows.append(r)
            close = h.bal
            if open_bal == 0 and not rows and close == 0:
                continue
            nav_date = h.fund.dead_on or END
            nav = nav_on(h.fund, nav_date) if h.fund.dead_on else h.fund.nav_end
            cost = q2(sum((l[0] * l[1] for l in h.lots), D("0")))
            out.append((h, open_bal, rows, close, nav_date, nav, cost))
        return out


# ---------------------------------------------------------------- personas
@dataclass
class Persona:
    slug: str
    name: str
    pan: str
    email: str
    first_year: int
    target_value: Decimal
    windows: list  # (label, start)
    build: callable
    note: str
    folio_holders: dict = field(default_factory=dict)  # folio -> (holder name, pan, extra lines)


def build_p20(L: Ledger):
    # Investing since 2006: legacy (pre-2013, no Direct/Regular in name) plans,
    # a 2014 move to Direct, a bonus, a fund held and fully exited, a merged
    # "both words" plan, a merged-away fund, IDCW reinvest, twin SIPs, a bounced SIP,
    # the same fund in two folios.
    L.buy("1047392 / 12", "HDFC_FLEXI_LEGACY", date(2006, 3, 14), 500000, advisor="ARN-0007")
    L.sip("1047392 / 12", "HDFC_FLEXI_LEGACY", date(2006, 4, 1), 93, 10000, advisor="ARN-0007")
    L.buy("2215508", "ICICI_LARGE_LEGACY", date(2006, 6, 20), 300000, advisor="ARN-0007")
    L.bonus("2215508", "ICICI_LARGE_LEGACY", date(2007, 9, 18), 0.5)
    L.redeem("2215508", "ICICI_LARGE_LEGACY", date(2012, 2, 10), fraction=0.3)
    L.buy("1047392 / 12", "HDFC_LIQUID_OLD", date(2010, 1, 11), 2000000)
    L.redeem("1047392 / 12", "HDFC_LIQUID_OLD", date(2015, 6, 1), all_units=True)
    L.buy("1047392 / 12", "HDFC_BAF_IDCW", date(2012, 8, 3), 1000000, advisor="ARN-0007")
    for y in range(2013, 2026):
        L.idcw_reinvest("1047392 / 12", "HDFC_BAF_IDCW", date(y, 3, 20), "2.50")
    # 2014: switch most of the legacy plan into Direct (folio keeps the old ARN).
    L.switch("1047392 / 12", "HDFC_FLEXI_LEGACY", "1047392 / 12", "HDFC_FLEXI_D", date(2014, 1, 15), fraction=0.8, advisor="ARN-0007")
    L.sip("1047392 / 12", "HDFC_FLEXI_D", date(2014, 2, 1), 152, 25000, advisor="ARN-0007")
    L.buy("1047392 / 12", "HDFC_RSF_D", date(2014, 5, 2), 1500000)
    L.switch("1047392 / 12", "HDFC_RSF_D", "1047392 / 12", "HDFC_FLEXI_D", date(2018, 5, 8), all_units=True, merger=True)
    L.buy("5570012", "PPFAS_D", date(2014, 7, 7), 1000000, advisor="DIRECT")
    L.sip("5570012", "PPFAS_D", date(2014, 8, 1), 146, 20000, advisor="DIRECT", bounce={100})
    L.sip("5570012", "PPFAS_D", date(2021, 1, 1), 69, 20000, label="SIP Purchase", advisor="DIRECT")  # twin of the SIP above
    L.buy("5570099", "PPFAS_D", date(2019, 3, 3), 2500000, advisor="DIRECT")  # same fund, second folio
    L.buy("7781230", "SMALLCAP_MERGED", date(2015, 9, 9), 1500000)
    L.switch("7781230", "SMALLCAP_MERGED", "7781230", "HSBC_VALUE_D", date(2022, 11, 25), all_units=True, merger=True)
    L.sip("4400918 / 3", "NIPPON_N50_D", date(2016, 6, 1), 124, 30000)
    L.redeem("4400918 / 3", "NIPPON_N50_D", date(2024, 4, 15), fraction=0.25)
    L.sip("3310557", "AXIS_LARGE_REG", date(2010, 2, 1), 200, 7500, advisor="ARN-0007")


def build_p10(L: Ledger):
    # Investing since 2016 through a registered adviser (INA code on Direct
    # plans), a Direct plan still carrying an old ARN, DSP "Dir" naming, twin
    # SIPs, an IDCW payout, partial exits.
    L.buy("8812001", "AXIS_LARGE_D", date(2016, 2, 10), 2500000, advisor="INA000012345")
    L.sip("8812001", "AXIS_LARGE_D", date(2016, 3, 1), 127, 40000, advisor="INA000012345")
    L.buy("5590112", "PPFAS_D", date(2016, 5, 5), 3000000, advisor="ARN-104567")
    L.sip("5590112", "PPFAS_D", date(2016, 6, 1), 124, 50000, advisor="ARN-104567")
    L.sip("5590112", "PPFAS_D", date(2019, 1, 1), 94, 50000, label="SIP Purchase", advisor="ARN-104567")  # twin
    L.buy("6600123 / 45", "DSP_ES_DIR", date(2017, 1, 16), 2000000, advisor="INA000012345")
    L.redeem("6600123 / 45", "DSP_ES_DIR", date(2021, 6, 1), fraction=0.4)
    L.buy("2219987", "ICICI_LARGE_D", date(2018, 4, 4), 4000000, advisor="INA000012345")
    L.sip("4400777", "NIPPON_N50_D", date(2017, 8, 1), 110, 60000, advisor="INA000012345")
    L.buy("1050001 / 71", "HDFC_BAF_IDCW", date(2016, 9, 9), 1500000, advisor="ARN-104567")
    for y in range(2017, 2026):
        L.idcw_payout("1050001 / 71", "HDFC_BAF_IDCW", date(y, 3, 20), "2.50")
    L.redeem("2219987", "ICICI_LARGE_D", date(2023, 11, 20), fraction=0.5)


def build_p7(L: Ledger):
    # Investing since 2019: DSP "Reg" naming, an SBI "Dir" FMP, a Regular plan
    # with an ARN, bounced SIPs, a gift received.
    L.buy("6612001 / 22", "DSP_ES_REG", date(2019, 2, 11), 3000000, advisor="ARN-208811")
    L.sip("6612001 / 22", "DSP_ES_REG", date(2019, 3, 1), 91, 40000, advisor="ARN-208811", bounce={10, 37})
    L.buy("1901234", "SBI_FMP_DIR", date(2019, 7, 1), 5000000)
    L.sip("5591221", "PPFAS_D", date(2019, 4, 1), 90, 75000, advisor="DIRECT", bounce={50})
    L.buy("3319001", "AXIS_LARGE_REG", date(2020, 1, 20), 4000000, advisor="ARN-208811")
    L.gift_in("5591221", "PPFAS_D", date(2022, 12, 26), 15000)
    L.sip("1058877", "HDFC_FLEXI_D", date(2021, 4, 1), 66, 60000)


def build_p3(L: Ledger):
    # Small, recent investor (since 2023): plain baseline.
    L.sip("5599001", "PPFAS_D", date(2023, 1, 1), 45, 10000, advisor="DIRECT")
    L.sip("4401001", "NIPPON_N50_D", date(2023, 6, 1), 40, 5000)
    L.buy("2219001", "ICICI_LARGE_D", date(2024, 2, 2), 100000)


def build_pk(L: Ledger):
    # KFintech-issued statement: KFin-serviced Axis funds, a liquid-to-midcap
    # STP printed letter-spaced ("S T P Out"), and the Franklin Low Duration
    # wind-up: Jan-2020 segregation, units extinguished in tranches, one
    # extinguishment reversed (printed in parentheses) and redone.
    L.sip("7700101", "AXIS_LARGE_D", date(2016, 5, 1), 125, 25000)
    L.buy("7700101", "AXIS_LIQUID_D", date(2021, 1, 11), 10000000)
    for i in range(24):
        d = date(2021 + (1 + i) // 12, (1 + i) % 12 + 1, 15)
        L.switch("7700101", "AXIS_LIQUID_D", "7700101", "AXIS_MID_D", d, fraction=1 / (24 - i),
                 desc_out="S T P Out (Axis Mid Cap Fund)", desc_in="S T P In (Axis Liquid Fund)")
    L.buy("3301990", "FRANKLIN_LD_D", date(2018, 6, 15), 5000000)
    L.segregate("3301990", "FRANKLIN_LD_D", "FRANKLIN_SEG1", date(2020, 1, 24))
    L.extinguish("3301990", "FRANKLIN_LD_D", date(2021, 2, 12), fraction=0.4)
    L.extinguish("3301990", "FRANKLIN_LD_D", date(2021, 4, 12), fraction=0.3)
    L.extinguish_reversed("3301990", "FRANKLIN_LD_D", date(2021, 5, 3))
    L.extinguish("3301990", "FRANKLIN_LD_D", date(2021, 5, 4), fraction=0.3)
    L.extinguish("3301990", "FRANKLIN_LD_D", date(2022, 8, 7), all_units=True)


def build_px(L: Ledger):
    # Rarer transaction types and holder patterns.
    L.buy("1022001", "HDFC_LIQ_OLD2", date(2012, 3, 1), 3000000)
    L.face_value_change("1022001", "HDFC_LIQ_OLD2", "HDFC_LIQ_NEW", date(2013, 6, 3))
    for i in range(24):
        L.swp("1022001", "HDFC_LIQ_NEW", date(2020 + i // 12, i % 12 + 1, 7), 40000, i + 1, 24)
    L.buy("1050777 / 12", "HDFC_BAF_IDCW", date(2014, 4, 4), 2000000)
    for y in range(2016, 2026):
        L.idcw_sweep("1050777 / 12", "HDFC_BAF_IDCW", "5512001", "PPFAS_D", date(y, 3, 20), "2.50")
    L.sip("5512001", "PPFAS_D", date(2015, 1, 1), 141, 30000)
    L.buy("7781555", "SMALLCAP_MERGED", date(2016, 9, 9), 1000000)
    L.merger_blank("7781555", "SMALLCAP_MERGED", "7781555", "HSBC_VALUE_D", date(2022, 11, 25))
    L.transmission_in("4400555 / 1", "NIPPON_N50_D", date(2021, 8, 10), 20000, "SURESH RAO")
    L.buy("8812555", "AXIS_LARGE_D", date(2017, 5, 5), 3000000)
    L.redeem_tds("8812555", "AXIS_LARGE_D", date(2024, 6, 14), 0.4, 0.125)
    L.buy("2219555", "ICICI_FMP85A", date(2019, 2, 1), 2500000)
    L.redeem("2219555", "ICICI_FMP85A", date(2022, 5, 5), all_units=True, desc="Redemption - Maturity")
    L.nfo("9900555", "JIO_FLEXI_D", date(2025, 10, 10), 1500000)
    L.sip("6677001", "PPFAS_D", date(2020, 6, 1), 76, 10000)  # minor's folio


W14 = ("14yr", date(2012, 1, 1))
W20 = ("20yr", date(2006, 1, 1))
W10 = ("10yr", date(2016, 1, 1))
W7 = ("7yr", date(2019, 1, 1))
W3 = ("3yr", date(2023, 10, 1))
W1 = ("1yr", date(2025, 10, 1))
WFY = ("FY", date(2026, 4, 1))

PERSONAS = [
    Persona("p20", "VIKRAM ANAND MEHTA", "AAKPM4821Q", "vikram.mehta@example.com", 2006, D("200000000"),
            [W20, W10, W7, W3, W1, WFY], build_p20, "20-year investor, about Rs 20 Cr"),
    Persona("p10", "NEHA RAJESH KULKARNI", "BBRPK7319L", "neha.kulkarni@example.com", 2016, D("150000000"),
            [W10, W7, W3, W1, WFY], build_p10, "10-year investor via a registered adviser, about Rs 15 Cr"),
    Persona("p7", "ARJUN SURESH NAIR", "CCNPN2047M", "arjun.nair@example.com", 2019, D("120000000"),
            [W7, W3, W1, WFY], build_p7, "7-year investor, about Rs 12 Cr"),
    Persona("pk", "RAHUL VENKAT IYER", "EEIPI6684T", "rahul.iyer@example.com", 2016, D("50000000"),
            [], build_pk, "KFintech-issued statements: STP, Franklin wind-up + segregation, about Rs 5 Cr"),
    Persona("px", "KAVYA SURESH RAO", "FFKPR3308N", "kavya.rao@example.com", 2012, D("30000000"),
            [], build_px, "rarer events: face value change, SWP, IDCW sweep, merger without amount, transmission, NRI TDS, FMP maturity, NFO, joint + minor folios",
            folio_holders={"5512001": ("KAVYA SURESH RAO", "FFKPR3308N", ["Joint Holder 1: VIKAS ANAND RAO"]),
                           "6677001": ("ANANYA VIKAS RAO (MINOR)", None, ["Guardian: KAVYA SURESH RAO"])}),
    Persona("p3", "ISHA MOHAN VERMA", "DDVPV5532R", "isha.verma@example.com", 2023, D("2000000"),
            [W3, W1, WFY], build_p3, "3-year small investor, about Rs 20 L (baseline)"),
]


def ledger_for(p: Persona) -> Ledger:
    probe = Ledger(D("1"))
    p.build(probe)
    probe.run()
    value = sum((h.bal * h.fund.nav_end for h in probe.h.values() if not h.fund.dead_on), D("0"))
    L = Ledger(q4(p.target_value / value))
    p.build(L)
    L.run()
    return L


def render(p: Persona, L: Ledger, label: str, start: date, *, extra=(), folio_fmt=None,
           builder=CASBuilder, address_extra=()) -> tuple[bytes, dict]:
    """One statement window. `extra` adds other household members' (persona,
    ledger) pairs to the same CAS (a family statement consolidated by email,
    addressed to `p`); `folio_fmt` rewrites how folio numbers are printed."""
    by_amc: dict[str, dict[tuple, list]] = defaultdict(lambda: defaultdict(list))
    truth = []
    for person, ledger in [(p, L), *extra]:
        for h, open_bal, rows, close, nav_date, nav, cost in ledger.window(start, STATEMENT_TO):
            folio = folio_fmt(h.folio) if folio_fmt else h.folio
            value = q2(close * nav)
            style = "cams_inline_advisor" if h.advisor else "cams_inline"
            txns = [Txn(fmt_d(r.d), r.desc,
                        (money(r.amount, neg=r.parens) if r.amount is not None else ""),
                        ((f"({abs(r.units):,.3f})" if r.parens else unitstr(r.units)) if r.units is not None else None),
                        f"{r.nav:,.4f}" if r.nav is not None else None,
                        unitstr(r.balance) if r.balance is not None else None) for r in rows]
            by_amc[h.fund.amc][(folio, person.pan, person.name)].append(Scheme(
                code=h.fund.code, name=h.fund.name, isin=h.fund.isin, style=style, advisor=h.advisor,
                open_bal=f"{open_bal:,.3f}", txns=txns, close_bal=f"{close:,.3f}", nav_date=fmt_d(nav_date),
                nav=f"{nav:,.4f}", valuation=f"{value:,.2f}", cost=f"{cost:,.2f}"))
            truth.append({"member": person.name, "folio": folio, "isin": h.fund.isin, "fund": h.fund.name,
                          "open": str(open_bal), "close": str(close), "value": str(value), "cost": str(cost),
                          "rows": len(rows)})
    amc_blocks, summary = [], []
    for amc, folios in by_amc.items():
        blocks = []
        for (f, pan, name), sc in folios.items():
            ov = getattr(p, "folio_holders", {}).get(f)
            if ov:
                blocks.append(Folio(f, ov[1], ov[0], schemes=sc, extra_lines=list(ov[2])))
            else:
                blocks.append(Folio(f, pan, name, schemes=sc))
        amc_blocks.append(AmcBlock(amc, blocks))
        summary.append((amc, sum(float(x.cost.replace(",", "")) for sc in folios.values() for x in sc),
                        sum(float(x.valuation.replace(",", "")) for sc in folios.values() for x in sc)))
    pdf = builder().build(
        statement_from=fmt_d(start), statement_to=fmt_d(STATEMENT_TO), investor_name=p.name,
        investor_email=p.email, investor_address=["14 Example Residency", "Pune 411001", "Maharashtra India", *address_extra],
        investor_mobile="+919800000000", amc_blocks=amc_blocks, portfolio_summary=summary)
    return pdf, {"persona": p.slug, "window": label, "from": str(start), "investor": p.name, "funds": truth,
                 "total_value": str(sum(D(t["value"]) for t in truth))}


def main():
    all_truth = {}
    for p in PERSONAS:
        L = ledger_for(p)
        for label, start in p.windows:
            pdf, truth = render(p, L, label, start)
            fname = f"{p.slug}_{label}.pdf"
            encrypt_pdf(pdf, PASSWORD, str(HERE / fname))
            all_truth[fname] = truth
            print(f"{fname:14} funds={len(truth['funds']):2} value=Rs {D(truth['total_value']):>16,.2f}")
    ledgers = {p.slug: ledger_for(p) for p in PERSONAS}
    by_slug = {p.slug: p for p in PERSONAS}
    extras = {
        # Family CAS: Neha's folios consolidated into Vikram's statement (same email).
        "fam_10yr.pdf": render(by_slug["p20"], ledgers["p20"], "10yr", W10[1],
                               extra=[(by_slug["p10"], ledgers["p10"])]),
        # Same FY statement, folios printed without spaces around "/" (another RTA's style).
        "p20_FY_altfolio.pdf": render(by_slug["p20"], ledgers["p20"], "FY", WFY[1],
                                      folio_fmt=lambda f: f.replace(" / ", "/")),
        # KFintech-issued layout (watermark, 4-line header, date twins, Phone Off).
        "kfin_pk_10yr.pdf": render(by_slug["pk"], ledgers["pk"], "10yr", W10[1], builder=KfinBuilder,
                                   address_extra=["Phone Off: 020-24440000"]),
        "kfin_pk_1yr.pdf": render(by_slug["pk"], ledgers["pk"], "1yr", W1[1], builder=KfinBuilder,
                                  address_extra=["Phone Off: 020-24440000"]),
        "kfin_p7_7yr.pdf": render(by_slug["p7"], ledgers["p7"], "7yr", W7[1], builder=KfinBuilder),
        "kfin_p10_FY.pdf": render(by_slug["p10"], ledgers["p10"], "FY", WFY[1], builder=KfinBuilder),
        "px_14yr.pdf": render(by_slug["px"], ledgers["px"], "14yr", W14[1]),
        "px_FY.pdf": render(by_slug["px"], ledgers["px"], "FY", WFY[1]),
        # Older CAMS template without the per-row Price column.
        "oldcams_p20_20yr.pdf": render(by_slug["p20"], ledgers["p20"], "20yr", W20[1], builder=OldCamsBuilder),
    }
    for fname, (pdf, truth) in extras.items():
        encrypt_pdf(pdf, PASSWORD, str(HERE / fname))
        all_truth[fname] = truth
        print(f"{fname:20} funds={len(truth['funds']):2} value=Rs {D(truth['total_value']):>16,.2f}")
    (HERE / "truth.json").write_text(json.dumps(all_truth, indent=1))


if __name__ == "__main__":
    main()
