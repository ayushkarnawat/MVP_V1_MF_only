"""Statement-layout variants on top of cas_builder.CASBuilder (2026-10-05).

KfinBuilder reproduces the KFintech-issued Detailed CAS quirks casparser
handles specially (see casparser/parsers/cams_detailed.py + extract.py):
  * "KFINCASWS" watermark -> casparser FileType.KFINTECH
  * 4-baseline transaction header (Amount/Price top, Unit, Date/Transaction/
    Units, (INR)/(INR)/Balance bottom) instead of CAMS's 2 baselines
  * the "date twin" overlay: the date column rendered twice ~0.7pt apart
  * "Phone Off:" line in the investor block
OldCamsBuilder reproduces older CAMS templates that omit the per-row Price
column (casparser then derives nav = amount / units).
"""
from cas_builder import (CASBuilder, FONT, FONT_BOLD, SIZE, X_AMOUNT_HI, X_BAL_HI, X_DATE, X_PRICE_HI,
                         X_TXN, X_UNITS_HI, Txn)


class KfinBuilder(CASBuilder):
    def hidden_marker(self, text):
        super().hidden_marker(text.replace("CAMSCASWS", "KFINCASWS").replace("V3.4", "V2.1"))

    def txn_header(self):
        c = self.c
        top = self.y
        c.setFont(FONT_BOLD, SIZE)
        c.drawRightString(X_AMOUNT_HI, top, "Amount")
        c.drawRightString(X_PRICE_HI, top, "Price")
        c.drawRightString(X_BAL_HI, top - 3.5, "Unit")
        c.drawString(X_DATE, top - 7, "Date")
        c.drawString(X_TXN, top - 7, "Transaction")
        c.drawRightString(X_UNITS_HI, top - 7, "Units")
        c.setFont(FONT, SIZE)
        c.drawRightString(X_AMOUNT_HI, top - 11, "(INR)")
        c.drawRightString(X_PRICE_HI, top - 11, "(INR)")
        c.setFont(FONT_BOLD, SIZE)
        c.drawRightString(X_BAL_HI, top - 11, "Balance")
        self.y = top - 11
        self._nl()
        self.page_has_txn_header = True

    def txn_row(self, t: Txn):
        # Date twin: a second, near-identical glyph layer ~0.7pt above.
        self.c.setFont(FONT, 7.0)
        self.c.drawString(X_DATE, self.y + 0.7, t.date)
        super().txn_row(t)


class OldCamsBuilder(CASBuilder):
    def txn_header(self):
        c = self.c
        c.setFont(FONT_BOLD, SIZE)
        c.drawString(X_DATE, self.y, "Date")
        c.drawString(X_TXN, self.y, "Transaction")
        c.drawRightString(X_AMOUNT_HI, self.y, "Amount")
        c.drawRightString(X_UNITS_HI, self.y, "Units")
        c.drawRightString(X_BAL_HI, self.y, "Unit")
        self._nl(9)
        c.setFont(FONT, SIZE)
        c.drawRightString(X_AMOUNT_HI, self.y, "(INR)")
        c.setFont(FONT_BOLD, SIZE)
        c.drawRightString(X_BAL_HI, self.y, "Balance")
        self._nl()
        self.page_has_txn_header = True

    def txn_row(self, t: Txn):
        super().txn_row(Txn(t.date, t.desc, t.amount, t.units, None, t.balance))
