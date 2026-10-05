"""Synthetic CAMS-style Detailed CAS PDF generator for QA of CAS member
detection. Produces a password-protected PDF that casparser 1.3.0 can
parse as CASFileType.DETAILED / FileType.CAMS, with multiple household
members (distinct PANs) grouped under one statement.

Layout (column x-anchors, title/period placement, investor+disclaimer
two-column block, portfolio summary, per-scheme header styles, "Page N of
M" footer) is reverse-engineered from a real CAMS Detailed CAS PDF so the
output visually and structurally matches a genuine statement. AMC/scheme
names, ISINs, and scheme codes below are real, verified against that same
real statement; everything else (investor identity, PANs, folio numbers,
amounts, dates) is fictitious.

Not part of the app codebase -- a QA fixture generator. Recovered on
2026-10-05 from the 2026-09-30 session transcript (the original lived only
in that session's scratchpad); `advisor` added so a scheme can carry any
advisor code. Driven by gen_scenarios.py.
"""
from __future__ import annotations

import io
import sys
from dataclasses import dataclass, field

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

PAGE_W, PAGE_H = A4  # 595.27 x 841.89
MARGIN_TOP = 841.89 - 40
MARGIN_BOTTOM = 50

# ---------------------------------------------------------------------------
# Column x-anchors for the transaction table, taken directly from a real
# CAMS Detailed CAS (see casparser cams_detailed.py detect_txn_columns /
# _column_ranges for why exact spacing matters).
# ---------------------------------------------------------------------------
X_DATE = 30
X_TXN = 75
X_AMOUNT_HI = 374
X_UNITS_HI = 432
X_PRICE_HI = 488
X_BAL_HI = 566

LEFT_COL_X = 35
RIGHT_COL_X = 210

FONT = "Helvetica"
FONT_BOLD = "Helvetica-Bold"
SIZE = 7.5

# Generic CAMS disclaimer boilerplate, reused verbatim (line-wrap fixed) from
# a real statement -- standard legal text printed on every CAMS CAS, not
# specific to any investor.
DISCLAIMER_LINES = [
    "This Consolidated Account Statement is brought to you as an investor",
    "friendly initiative by CAMS and KFintech, and lists the transactions,",
    "balances and valuation of Mutual Funds in which you are holding",
    "investments. The consolidation has been carried out based on the email id",
    "entered by you. If you have not entered a PAN Number and if the email id",
    "is common to several members of your family, this statement will",
    "consolidate all those investments as well.",
    "If you find any folios missing from this consolidation, you have not",
    "registered your email id against those folios.",
    "This statement may not reflect the complete information on your DEMAT",
    "holdings. Please check with your DP for details on DEMAT holdings.",
]

ENTRY_EXIT_LOAD_VARIANTS = [
    "Entry Load: Nil, Exit Load: Nil",
    "Entry Load NIL, Exit Load 1.00% if redeemed/switched out within 365 days from the date of allotment, Nil thereafter",
    "Entry Load: Not Applicable. Exit Load: Nil.",
]


@dataclass
class Txn:
    date: str
    desc: str
    amount: str
    units: str | None = None
    price: str | None = None
    balance: str | None = None


def stamp_duty(date: str, amount: str) -> Txn:
    return Txn(date, "*** Stamp Duty ***", amount)


@dataclass
class Scheme:
    code: str
    name: str
    isin: str
    style: str  # "kfintech" | "cams_inline" | "cams_inline_advisor"
    open_bal: str = "0.000"
    txns: list = field(default_factory=list)
    close_bal: str = "0.000"
    nav_date: str = "30-Sep-2025"
    nav: str = "100.0000"
    valuation: str = "0.00"
    cost: str = "0.00"
    load_note: str = ENTRY_EXIT_LOAD_VARIANTS[0]
    advisor: str | None = None  # printed as "(Advisor: ...)" when set


@dataclass
class Folio:
    folio_no: str
    pan: str | None
    holder_name: str
    nominee: str | None = None
    kyc: str = "OK"
    pan_status: str = "OK"
    schemes: list = field(default_factory=list)
    extra_lines: list = field(default_factory=list)  # joint holders / guardian, printed under the name


@dataclass
class AmcBlock:
    amc_name: str
    folios: list


class CASBuilder:
    TITLE = "Consolidated Account Statement"
    def __init__(self):
        self.buf = io.BytesIO()
        self.c = canvas.Canvas(self.buf, pagesize=A4)
        self.y = MARGIN_TOP
        self.page_no = 1
        self.total_pages = 1  # patched by build() after a dry-run pass
        self.page_has_txn_header = False
        self._pending_footer = True

    # -- low level -----------------------------------------------------
    def _footer(self):
        self.c.setFont(FONT, 7)
        self.c.drawCentredString(PAGE_W / 2, 25, f"Page {self.page_no} of {self.total_pages}")

    def _nl(self, dy=10.5):
        self.y -= dy
        if self.y < MARGIN_BOTTOM:
            self.new_page()

    def new_page(self):
        self._footer()
        self.c.showPage()
        self.page_no += 1
        self.y = MARGIN_TOP
        self.page_has_txn_header = False
        self.centred(self.TITLE, size=10, font=FONT_BOLD)
        self.centred(self._period_label, size=8.5)
        # >15pt (detect_txn_columns's HEADER_WINDOW_Y) so the title/period
        # lines never land in the same header-detection window as the
        # actual "Date Transaction..." row below -- otherwise the anchor
        # scan locks onto [title, period] with 0 header-label hits before
        # it ever reaches the real header, and (on a real CAMS file, this
        # gap is ~29pt) the second header line carrying "Balance" falls
        # outside a too-tight window, silently dropping the Unit Balance
        # column and every row's balance with it.
        self._nl(20)
        self.txn_header()

    def line(self, text, x=LEFT_COL_X, size=SIZE, font=FONT):
        self.c.setFont(font, size)
        self.c.drawString(x, self.y, text)
        self._nl()

    def centred(self, text, size=SIZE, font=FONT):
        self.c.setFont(font, size)
        self.c.drawCentredString(PAGE_W / 2, self.y, text)
        self._nl()

    def hidden_marker(self, text):
        # Tiny, white text -- a real PDF text object (pdfium's text
        # extraction finds it) but invisible on the rendered page. Mirrors
        # the rotated CAMSCASWS/KFINCASWS watermark string real statements
        # carry, which casparser's detect_file_type() keys off of.
        self.c.saveState()
        self.c.setFillColorRGB(1, 1, 1)
        self.c.setFont("Helvetica", 1)
        self.c.drawString(2, PAGE_H - 2, text)
        self.c.restoreState()

    def two_col(self, left_text, right_text):
        self.c.setFont(FONT, SIZE)
        if left_text:
            self.c.drawString(LEFT_COL_X, self.y, left_text)
        if right_text:
            self.c.drawString(RIGHT_COL_X, self.y, right_text)
        self._nl()

    def txn_header(self):
        self.c.setFont(FONT_BOLD, SIZE)
        self.c.drawString(X_DATE, self.y, "Date")
        self.c.drawString(X_TXN, self.y, "Transaction")
        self.c.drawRightString(X_AMOUNT_HI, self.y, "Amount")
        self.c.drawRightString(X_UNITS_HI, self.y, "Units")
        self.c.drawRightString(X_PRICE_HI, self.y, "Price")
        self.c.drawRightString(X_BAL_HI, self.y, "Unit")
        self._nl(9)
        self.c.setFont(FONT, SIZE)
        self.c.drawRightString(X_AMOUNT_HI, self.y, "(INR)")
        self.c.drawRightString(X_PRICE_HI, self.y, "(INR)")
        self.c.setFont(FONT_BOLD, SIZE)
        self.c.drawRightString(X_BAL_HI, self.y, "Balance")
        self._nl()
        self.page_has_txn_header = True

    def txn_row(self, t: Txn):
        # Date drawn a touch smaller: at 7.5pt Helvetica "05-May-2017" ends
        # within ~1pt of X_TXN and its last glyph bleeds into the Transaction
        # column, so casparser reads the date as "05-May-201" and skips the
        # row (it only warns). Real CAMS PDFs use a narrower face here.
        self.c.setFont(FONT, 7.0)
        self.c.drawString(X_DATE, self.y, t.date)
        self.c.setFont(FONT, SIZE)
        self.c.drawString(X_TXN, self.y, t.desc)
        self.c.drawRightString(X_AMOUNT_HI, self.y, t.amount)
        if t.units:
            self.c.drawRightString(X_UNITS_HI, self.y, t.units)
        if t.price:
            self.c.drawRightString(X_PRICE_HI, self.y, t.price)
        if t.balance:
            self.c.drawRightString(X_BAL_HI, self.y, t.balance)
        self._nl()

    def scheme_header(self, scheme: Scheme):
        full_name = f"{scheme.code}-{scheme.name}"
        if scheme.style == "kfintech":
            self.line("Registrar :")
            self.line(f"{full_name} - ISIN: {scheme.isin}")
            self.line("KFINTECH")
        elif scheme.style == "cams_inline_advisor":
            adv = scheme.advisor or "CAT-1 EOP -0009"
            self.line(f"{full_name} - ISIN: {scheme.isin}(Advisor: {adv}) Registrar : CAMS")
        else:  # cams_inline
            self.line(f"{full_name} - ISIN: {scheme.isin} Registrar : CAMS")

    # -- document --------------------------------------------------------
    def _render(
        self,
        *,
        statement_from,
        statement_to,
        investor_name,
        investor_email,
        investor_address,
        investor_mobile,
        amc_blocks,
        portfolio_summary,
    ):
        self._period_label = f"{statement_from} To {statement_to}"
        self.hidden_marker("CAMSCASWS Version:V3.4 Live-1017")

        self.centred(self.TITLE, size=10, font=FONT_BOLD)
        self.centred(self._period_label, size=8.5)
        self._nl(4)

        # Investor block (left column, x < 200 -- what
        # extract_cams_kfin_investor reads) beside the generic disclaimer
        # paragraph (right column), matching a real statement's two-column
        # layout.
        left_lines = [f"Email Id: {investor_email}", investor_name, *investor_address, f"Mobile: {investor_mobile}"]
        rows = max(len(left_lines), len(DISCLAIMER_LINES))
        for i in range(rows):
            l = left_lines[i] if i < len(left_lines) else None
            r = DISCLAIMER_LINES[i] if i < len(DISCLAIMER_LINES) else None
            self.two_col(l, r)
        self._nl(6)

        # Portfolio summary (cosmetic only -- no parser regex reads this).
        self.line("PORTFOLIO SUMMARY", size=8, font=FONT_BOLD)
        self.line("Mutual Fund" + " " * 40 + "Cost Value       Market Value")
        self.line(" " * 51 + "(INR)              (INR)")
        total_cost = total_val = 0.0
        for amc_name, cost, val in portfolio_summary:
            self.line(f"  {amc_name} {cost:,.2f} {val:,.2f}")
            total_cost += cost
            total_val += val
        self.line(f"Total {total_cost:,.2f} {total_val:,.2f}", font=FONT_BOLD)
        self._nl(6)

        self.txn_header()

        for amc in amc_blocks:
            self.line(amc.amc_name, size=8.5, font=FONT_BOLD)
            for folio in amc.folios:
                folio_line = f"Folio No: {folio.folio_no}"
                if folio.pan:
                    folio_line += f" PAN: {folio.pan}"
                folio_line += f" KYC: {folio.kyc} PAN: {folio.pan_status}"
                self.line(folio_line)
                self.line(folio.holder_name)
                for extra in folio.extra_lines:
                    self.line(extra)
                for scheme in folio.schemes:
                    self.scheme_header(scheme)
                    nom = folio.nominee or ""
                    self.line(f" Nominee 1: {nom}  Nominee 2:  Nominee 3:")
                    self.line(f" Opening Unit Balance: {scheme.open_bal}")
                    for t in scheme.txns:
                        self.txn_row(t)
                    self.line(
                        f"Closing Unit Balance: {scheme.close_bal} NAV on {scheme.nav_date}: "
                        f"INR {scheme.nav} Total Cost Value: {scheme.cost} Market Value on "
                        f"{scheme.nav_date}: INR {scheme.valuation}"
                    )
                    self.line(scheme.load_note, size=6.5)
            self._nl(4)

        self._footer()
        self.c.showPage()
        self.c.save()
        return self.buf.getvalue()

    def build(self, **kwargs):
        # Pass 1: dry run (throwaway canvas) purely to learn the final page
        # count, so "Page N of M" printed during pass 2 is correct.
        dry = type(self)()
        dry._render(**kwargs)
        total = dry.c.getPageNumber()

        self.total_pages = total
        return self._render(**kwargs)


def encrypt_pdf(raw_pdf: bytes, password: str, out_path: str) -> None:
    import pikepdf

    with pikepdf.open(io.BytesIO(raw_pdf)) as pdf:
        pdf.save(
            out_path,
            encryption=pikepdf.Encryption(
                user=password, owner=password, R=4, allow=pikepdf.Permissions(extract=True)
            ),
        )


if __name__ == "__main__":
    print("Import this module and call build_file_1 / build_file_2 instead.", file=sys.stderr)
