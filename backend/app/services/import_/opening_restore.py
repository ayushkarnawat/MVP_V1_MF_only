"""Rebuild a folio's CAS opening balance from the imports that are left (#5).

After deleting an import, the remaining statements may no longer cover the
period the deleted one did (e.g. delete the 20-year file, keep the FY file:
the FY file's opening balance, removed when the 20-year file arrived, must come
back). For each folio, the remaining CONFIRMED import whose stored CAS output
lists the folio and starts earliest decides, through the same earliest-statement
rule confirm uses (confirm_people._apply_opening_rule).

Sync and offline on purpose: deletion runs in a plain `def` route, so the NAV
series for the plausibility check comes from the nav_history cache only.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.decimal_utils import quantize_units, to_decimal
from app.models.enums import ImportStatus, SchemeSource, TransactionOrigin
from app.models.folio import Folio, normalise_folio_key
from app.models.imports import Import
from app.models.reference import NavHistory, Scheme
from app.models.transaction import Transaction
from app.models.transaction_import import TransactionImport
from app.services.import_.opening_balance import price_opening_lot
from app.services.import_.parser import NormalizedTransaction, ParsedScheme
from app.services.import_.reconciliation import _same_scheme


def _entry(raw: dict | None, folio: Folio, scheme: Scheme) -> dict | None:
    for f in (raw or {}).get("folios") or []:
        if not f.get("folio") or normalise_folio_key(f["folio"]) != folio.folio_key:
            continue
        for s in f.get("schemes") or []:
            if _same_scheme({"isin": s.get("isin"), "amfi": s.get("amfi"), "scheme": s.get("scheme")}, scheme):
                return s
    return None


def _decimal(value) -> Decimal | None:
    return None if value in (None, "") else to_decimal(value)


def normalise_cas_openings(db: Session, folio: Folio) -> int:
    """A folio keeps at most one CAS opening row, the earliest, and none when
    real (cas_row/manual) rows predate it — confirm's earliest-statement rule.
    Used after rows from another folio were merged in (member merge; the 0027
    migration has a frozen copy). Returns rows removed. Doesn't commit."""
    openings = (
        db.query(Transaction)
        .filter(Transaction.folio_id == folio.id, Transaction.origin == TransactionOrigin.CAS_OPENING)
        .order_by(Transaction.date, Transaction.id)
        .all()
    )
    if not openings:
        return 0
    drop = openings[1:]
    earlier_real = (
        db.query(Transaction.id)
        .filter(Transaction.folio_id == folio.id,
                Transaction.origin.in_((TransactionOrigin.CAS_ROW, TransactionOrigin.MANUAL)),
                Transaction.date < openings[0].date)
        .first()
    )
    if earlier_real is not None:
        drop.append(openings[0])
    for txn in drop:
        db.query(TransactionImport).filter_by(transaction_id=txn.id).delete(synchronize_session=False)
        db.delete(txn)
    db.flush()
    return len(drop)


def _ordered_imports(db: Session, member_id: uuid.UUID, excluded: set[uuid.UUID]) -> list[Import]:
    """Remaining confirmed imports, earliest statement start first. Ties on the
    start date go to the longer statement, then upload order, then id, so the
    choice never depends on query order (review)."""
    imports = (
        db.query(Import)
        .filter(Import.household_member_id == member_id, Import.status == ImportStatus.CONFIRMED,
                Import.statement_from_date.isnot(None))
        .all()
    )
    imports = [i for i in imports if i.id not in excluded]
    imports.sort(key=lambda i: (
        i.statement_from_date,
        -(i.statement_to_date.toordinal() if i.statement_to_date else 0),
        i.uploaded_at, str(i.id),
    ))
    return imports


def restore_openings(
    db: Session, folio_ids: list[uuid.UUID], exclude_import_ids: list[uuid.UUID] | None = None,
) -> int:
    """Re-apply the opening rule to each folio from its remaining imports,
    ignoring `exclude_import_ids` (the ones being deleted, still in the
    session). Returns how many opening rows were written. Doesn't commit."""
    excluded = set(exclude_import_ids or [])
    from app.services.import_.confirm_people import _apply_opening_rule  # avoid an import cycle

    written = 0
    for folio_id in folio_ids:
        folio = db.get(Folio, folio_id)
        if folio is None:
            continue
        scheme = db.get(Scheme, folio.scheme_id)
        imports = _ordered_imports(db, folio.household_member_id, excluded)
        chosen = next(((imp, e) for imp in imports if (e := _entry(imp.raw_parser_output, folio, scheme))), None)
        if chosen is None:
            continue
        imp, entry = chosen
        start: date = imp.statement_from_date
        open_units = quantize_units(_decimal(entry.get("open")) or Decimal("0"))
        lot = None
        if open_units > 0:
            valuation = entry.get("valuation") or {}
            parsed = ParsedScheme(
                name=scheme.name, isin=scheme.isin, amfi=scheme.amfi_code, scheme_type=None,
                folio=folio.folio_number, amc=scheme.amc_name, transaction_count=0,
                open_units=open_units, valuation_cost=_decimal(valuation.get("cost")),
                valuation_nav=_decimal(valuation.get("nav")),
            )
            # Exactly the rows the chosen statement contained (its links), as a
            # fresh confirm of it would see them: valuation_cost is the cost at
            # that statement's end, so rows from later statements must not be
            # replayed (review HIGH 1).
            in_period = [
                NormalizedTransaction(
                    folio=folio.folio_number, amc=scheme.amc_name, scheme_name=scheme.name, isin=scheme.isin,
                    amfi=scheme.amfi_code, scheme_type=None, txn_date=t.date, txn_type=t.type,
                    description=t.raw_description or "", amount=t.amount, units=t.units, nav=t.nav, stamp_duty=t.stamp_duty,
                )
                for t in db.query(Transaction)
                .join(TransactionImport, TransactionImport.transaction_id == Transaction.id)
                .filter(Transaction.folio_id == folio.id, TransactionImport.import_id == imp.id,
                        Transaction.origin != TransactionOrigin.CAS_OPENING)
                .order_by(Transaction.date, Transaction.id)
                .all()
            ]
            # A CAS-only fund's history is a few statement prices, too sparse
            # for the plausibility check; like the preview path, it gets none
            # and the CAS cost stands (6 Oct review M4).
            series = [] if scheme.source == SchemeSource.CAS_ONLY else [
                (r.date, r.nav) for r in db.query(NavHistory).filter_by(scheme_id=scheme.id).all()]
            lot = price_opening_lot(parsed, in_period, start, series or None)
        if _apply_opening_rule(db, folio, lot, start, imp) in ("written", "replaced"):
            written += 1
    return written
