"""folios.folio_key (+ duplicate merge) and transaction_imports (#4, #5)

Revision ID: 0027
Revises: 0026

folio_key is the whitespace-stripped folio number: CAMS and KFintech print the
same folio with and without spaces around "/", which used to create a second
folio and count overlapping rows twice. Existing duplicates (same member,
scheme and key) are merged here: the folio with most rows is kept, rows it
already has are dropped (their links move to the kept row), the rest move.

transaction_imports gets one link per existing row (its first writer, all we
know). Its FK to transactions is composite (id, date) because transactions is
RANGE-partitioned on Postgres (FKs to partitioned tables need Postgres 12+;
staging runs 16).
"""
import json
import re

from alembic import op
import sqlalchemy as sa

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def _key(folio_number: str) -> str:
    # Frozen copy of people.folio_key (2026-10-06); migrations never import app code.
    return re.sub(r"\s+", "", folio_number)


def _norm_name(name: str) -> str:
    # Frozen copy of enrich.normalize_name (2026-10-06).
    s = (name or "").upper()
    s = re.sub(r"\([^)]*\)", "", s)
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _backfill_links_from_raw_output(bind) -> None:
    """Review MEDIUM 3: before 0027 a row remembered only its first writer, so
    an overlapping statement uploaded later had no link to the rows it also
    contained, and "safe delete" would still drop them. A CAS lists every
    transaction of a folio+scheme inside its period, so every CAS row
    (origin cas_row) of a folio the import's stored output lists, dated within
    the import's statement period, belongs to that import too."""
    imports = bind.execute(sa.text(
        "SELECT id, household_member_id, raw_parser_output, statement_from_date, statement_to_date FROM imports "
        "WHERE raw_parser_output IS NOT NULL AND statement_from_date IS NOT NULL AND statement_to_date IS NOT NULL"
    )).fetchall()
    for imp_id, member_id, raw, start, end in imports:
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except ValueError:
                continue
        if not isinstance(raw, dict):
            continue
        for f in raw.get("folios") or []:
            if not isinstance(f, dict) or not f.get("folio"):
                continue
            candidates = bind.execute(sa.text(
                "SELECT f.id, s.isin, s.amfi_code, s.name FROM folios f JOIN schemes s ON s.id = f.scheme_id "
                "WHERE f.household_member_id = :m AND f.folio_key = :k"
            ), {"m": member_id, "k": _key(f["folio"])}).fetchall()
            for entry in f.get("schemes") or []:
                # Review L1: a name-only match is trusted only when exactly one
                # candidate in this folio key has that normalised name.
                name_hits = [c for c in candidates if _norm_name(c[3]) == _norm_name(entry.get("scheme"))]
                for folio_id, isin, amfi, name in candidates:
                    if entry.get("isin") and isin:
                        same = entry["isin"] == isin
                    elif entry.get("amfi") and amfi:
                        same = str(entry["amfi"]) == amfi
                    else:
                        same = len(name_hits) == 1 and _norm_name(entry.get("scheme")) == _norm_name(name)
                    if not same:
                        continue
                    bind.execute(sa.text(
                        "INSERT INTO transaction_imports (transaction_id, transaction_date, import_id) "
                        "SELECT t.id, t.date, :imp FROM transactions t "
                        "WHERE t.folio_id = :f AND t.origin = 'cas_row' AND t.date >= :s AND t.date <= :e "
                        "AND NOT EXISTS (SELECT 1 FROM transaction_imports x WHERE x.transaction_id = t.id AND x.import_id = :imp)"
                    ), {"imp": imp_id, "f": folio_id, "s": start, "e": end})


def _normalise_cas_openings(bind, folio_id) -> None:
    """Review HIGH 2: a merged folio keeps at most one CAS opening row, the
    earliest, and none when real (cas_row/manual) rows predate it — the same
    earliest-statement rule confirm applies. Frozen here; the app has its own
    copy (opening_restore.normalise_cas_openings)."""
    openings = bind.execute(sa.text(
        "SELECT id, date FROM transactions WHERE folio_id = :f AND origin = 'cas_opening' ORDER BY date, id"
    ), {"f": folio_id}).fetchall()
    if not openings:
        return
    drop = [o[0] for o in openings[1:]]
    earliest = openings[0]
    earlier_real = bind.execute(sa.text(
        "SELECT 1 FROM transactions WHERE folio_id = :f AND origin IN ('cas_row', 'manual') AND date < :d LIMIT 1"
    ), {"f": folio_id, "d": earliest[1]}).first()
    if earlier_real is not None:
        drop.append(earliest[0])
    for tid in drop:
        bind.execute(sa.text("DELETE FROM transaction_imports WHERE transaction_id = :id"), {"id": tid})
        bind.execute(sa.text("DELETE FROM transactions WHERE id = :id"), {"id": tid})


def upgrade() -> None:
    bind = op.get_bind()
    op.add_column("folios", sa.Column("folio_key", sa.String(), nullable=True))
    folios = bind.execute(sa.text("SELECT id, household_member_id, scheme_id, folio_number FROM folios")).fetchall()
    groups: dict[tuple, list] = {}
    for fid, member, scheme, number in folios:
        bind.execute(sa.text("UPDATE folios SET folio_key = :k WHERE id = :id"), {"k": _key(number), "id": fid})
        groups.setdefault((member, scheme, _key(number)), []).append(fid)

    op.create_table(
        "transaction_imports",
        sa.Column("transaction_id", sa.Uuid(), nullable=False),
        sa.Column("transaction_date", sa.Date(), nullable=False),
        sa.Column("import_id", sa.Uuid(), sa.ForeignKey("imports.id", ondelete="CASCADE"), nullable=False),
        sa.PrimaryKeyConstraint("transaction_id", "import_id"),
        sa.ForeignKeyConstraint(["transaction_id", "transaction_date"], ["transactions.id", "transactions.date"],
                                ondelete="CASCADE"),
    )
    op.create_index("ix_transaction_imports_import_id", "transaction_imports", ["import_id"])
    bind.execute(sa.text(
        "INSERT INTO transaction_imports (transaction_id, transaction_date, import_id) "
        "SELECT id, date, import_id FROM transactions"
    ))
    _backfill_links_from_raw_output(bind)

    for fids in groups.values():
        if len(fids) < 2:
            continue
        counts = {
            f: bind.execute(sa.text("SELECT count(*) FROM transactions WHERE folio_id = :f"), {"f": f}).scalar()
            for f in fids
        }
        keep = max(fids, key=lambda f: (counts[f], str(f)))
        for other in fids:
            if other == keep:
                continue
            rows = bind.execute(sa.text(
                "SELECT id, date, amount, units, type, occurrence FROM transactions WHERE folio_id = :f"
            ), {"f": other}).fetchall()
            for row in rows:
                twin = bind.execute(sa.text(
                    "SELECT id FROM transactions WHERE folio_id = :k AND date = :d AND amount = :a "
                    "AND units = :u AND type = :t AND occurrence = :o"
                ), {"k": keep, "d": row[1], "a": row[2], "u": row[3], "t": row[4], "o": row[5]}).scalar()
                if twin is None:
                    bind.execute(sa.text("UPDATE transactions SET folio_id = :k WHERE id = :id"), {"k": keep, "id": row[0]})
                    continue
                bind.execute(sa.text(
                    "INSERT INTO transaction_imports (transaction_id, transaction_date, import_id) "
                    "SELECT :twin, :tdate, ti.import_id FROM transaction_imports ti WHERE ti.transaction_id = :id "
                    "AND NOT EXISTS (SELECT 1 FROM transaction_imports x "
                    "WHERE x.transaction_id = :twin AND x.import_id = ti.import_id)"
                ), {"twin": twin, "tdate": row[1], "id": row[0]})
                bind.execute(sa.text("DELETE FROM transaction_imports WHERE transaction_id = :id"), {"id": row[0]})
                bind.execute(sa.text("DELETE FROM transactions WHERE id = :id"), {"id": row[0]})
            bind.execute(sa.text("DELETE FROM folios WHERE id = :f"), {"f": other})
        _normalise_cas_openings(bind, keep)

    with op.batch_alter_table("folios", recreate="always" if bind.dialect.name == "sqlite" else "auto") as batch:
        batch.alter_column("folio_key", existing_type=sa.String(), nullable=False)
        batch.drop_constraint("uq_folio_member_scheme_number", type_="unique")
        batch.create_unique_constraint("uq_folio_member_scheme_key", ["household_member_id", "scheme_id", "folio_key"])


def downgrade() -> None:
    # Merged duplicates stay merged (their rows can't be split back); the old
    # unique key on folio_number is restored, which merged folios satisfy.
    op.drop_index("ix_transaction_imports_import_id", table_name="transaction_imports")
    op.drop_table("transaction_imports")
    bind = op.get_bind()
    with op.batch_alter_table("folios", recreate="always" if bind.dialect.name == "sqlite" else "auto") as batch:
        batch.drop_constraint("uq_folio_member_scheme_key", type_="unique")
        batch.create_unique_constraint("uq_folio_member_scheme_number", ["household_member_id", "scheme_id", "folio_number"])
        batch.drop_column("folio_key")
