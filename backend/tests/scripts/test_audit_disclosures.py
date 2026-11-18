"""Batch L audit queries (E1 to E5) run read-only on a local database with invented rows.

Invented data only: three fund houses (Alpha, Beta, Gamma) plus two expected-absent houses
that carry no batch. Target month end is 31 Oct 2026, the month before is 30 Sep 2026.

  Alpha: two live schemes, both written for both months, assets for the target month,
         plus one inactive (matured) scheme that must never count as a live fund.
  Beta : B1 failed the weight check in the target month (written in the month before),
         B2 written both months but no assets row (missing assets),
         B3 failed with no structured reason and never had a written batch.
  Gamma: G1 only has the month before, imported in November (a stale fund whose import
         date looks new), G2 is waiting for a by-hand upload.
  ASK, Taurus: expected-absent houses (their normal state is "no row").
"""
import csv
import importlib
import re
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.enums import DisclosureBatchStatus as Status
from app.models.reference import DisclosureBatch, Scheme, SchemeAaum

TARGET = date(2026, 10, 31)
PRIOR = date(2026, 9, 30)
IMPORTED_IN_NOVEMBER = datetime(2026, 11, 5, 6, 0, tzinfo=timezone.utc)


def audit():
    return importlib.import_module("scripts.audit_disclosures.run_audit")


def _scheme(db, name, amc, *, active=True):
    scheme = Scheme(name=name, base_name=name.split(" - ")[0], amc_name=amc,
                    sebi_category="Equity Scheme - Large Cap Fund", is_active=active)
    db.add(scheme)
    db.flush()
    return scheme


def _batch(db, scheme, as_of, status, *, errors=None, imported=None):
    db.add(DisclosureBatch(scheme_id=scheme.id, as_of_date=as_of, amc_name=scheme.amc_name, status=status,
                           parse_errors=errors, fetched_at=imported, written_at=imported))


@pytest.fixture()
def database_url(tmp_path):
    url = f"sqlite:///{(tmp_path / 'audit.db').as_posix()}"
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        a1 = _scheme(db, "Alpha Growth Fund - Direct", "Alpha Mutual Fund")
        a2 = _scheme(db, "Alpha Growth Fund - Regular", "Alpha Mutual Fund")
        _scheme(db, "Alpha Old Maturity Fund - Direct", "Alpha Mutual Fund", active=False)
        b1 = _scheme(db, "Beta Value Fund - Direct", "Beta Mutual Fund")
        b2 = _scheme(db, "Beta Bond Fund - Direct", "Beta Mutual Fund")
        b3 = _scheme(db, "Beta Gilt Fund - Direct", "Beta Mutual Fund")
        g1 = _scheme(db, "Gamma Equity Fund - Direct", "Gamma Mutual Fund")
        g2 = _scheme(db, "Gamma Hybrid Fund - Direct", "Gamma Mutual Fund")
        _scheme(db, "ASK Absent Fund - Direct", "ASK Mutual Fund")
        taurus = _scheme(db, "Taurus Half Yearly Fund - Direct", "Taurus Mutual Fund")

        for s in (a1, a2):
            _batch(db, s, TARGET, Status.WRITTEN)
            _batch(db, s, PRIOR, Status.WRITTEN)
        _batch(db, b1, TARGET, Status.FAILED,
               errors=[{"sheet": "Beta Value", "reason": "failed_sum_check", "detail": "total 87.2"}])
        _batch(db, b1, PRIOR, Status.WRITTEN)
        _batch(db, b2, TARGET, Status.WRITTEN)
        _batch(db, b2, PRIOR, Status.WRITTEN)
        _batch(db, b3, TARGET, Status.FAILED, errors=None)
        # Imported in November but dated in September: the file's own date decides, so it is stale.
        _batch(db, g1, PRIOR, Status.WRITTEN, imported=IMPORTED_IN_NOVEMBER)
        _batch(db, g2, TARGET, Status.AWAITING_MANUAL_UPLOAD)
        _batch(db, taurus, PRIOR, Status.WRITTEN)

        db.add_all([
            SchemeAaum(scheme_id=a1.id, reference_period=TARGET, aaum_value=Decimal("1000.00")),
            SchemeAaum(scheme_id=a2.id, reference_period=TARGET, aaum_value=Decimal("500.00")),
            SchemeAaum(scheme_id=b1.id, reference_period=TARGET, aaum_value=Decimal("2000.00")),
            # G1 only has the earlier period's figure: shown as an older period, not hidden.
            SchemeAaum(scheme_id=g1.id, reference_period=PRIOR, aaum_value=Decimal("300.00")),
        ])
        db.commit()
    engine.dispose()
    return url


def _read(path):
    with open(path, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def _run(database_url, tmp_path):
    return audit().run_audit(database_url, TARGET, tmp_path / "out")


def test_e1_counts_written_failed_awaiting_per_house_for_both_months(database_url, tmp_path):
    rows = _read(_run(database_url, tmp_path)["E1"])
    got = {(r["amc_name"], r["status"]): (int(r["batches_target"]), int(r["batches_prior"]),
                                         int(r["expected_gap"])) for r in rows}
    assert got == {
        ("Alpha Mutual Fund", "written"): (2, 2, 0),
        ("Beta Mutual Fund", "written"): (1, 2, 0),
        ("Beta Mutual Fund", "failed"): (2, 0, 0),
        ("Gamma Mutual Fund", "written"): (0, 1, 0),
        ("Gamma Mutual Fund", "awaiting_manual_upload"): (1, 0, 0),
        ("Taurus Mutual Fund", "written"): (0, 1, 1),   # kept, but flagged as an expected gap
    }


def test_e2_denominator_excludes_expected_absent_houses(database_url, tmp_path):
    rows = _read(_run(database_url, tmp_path)["E2"])
    live = {r["amc_name"]: int(r["live_schemes"]) for r in rows}
    # The inactive Alpha scheme is not live; ASK and Taurus are expected gaps, not misses.
    assert live == {"Alpha Mutual Fund": 2, "Beta Mutual Fund": 3, "Gamma Mutual Fund": 2}


def test_e3_money_weight_uses_assets_and_reports_missing_assets(database_url, tmp_path):
    rows = _read(_run(database_url, tmp_path)["E3"])
    by_name = {r["scheme_name"]: r for r in rows}
    # Live schemes at non-expected houses only: 2 + 3 + 2.
    assert len(rows) == 7
    assert "ASK Absent Fund - Direct" not in by_name and "Alpha Old Maturity Fund - Direct" not in by_name

    written_assets = sum(Decimal(r["aaum_value"]) for r in rows
                         if r["target_status"] == "written" and r["aaum_value"])
    all_assets = sum(Decimal(r["aaum_value"]) for r in rows if r["aaum_value"])
    assert (written_assets, all_assets) == (Decimal("1500.00"), Decimal("3800.00"))

    assert by_name["Alpha Growth Fund - Direct"]["assets_basis"] == "same_month"
    assert by_name["Beta Value Fund - Direct"]["target_status"] == "failed"
    assert by_name["Gamma Equity Fund - Direct"]["target_status"] == "no_batch"
    assert by_name["Gamma Equity Fund - Direct"]["assets_basis"] == "older_period"
    assert by_name["Gamma Equity Fund - Direct"]["aaum_reference_period"] == "2026-09-30"
    missing = sorted(name for name, r in by_name.items() if r["assets_basis"] == "missing")
    assert missing == ["Beta Bond Fund - Direct", "Beta Gilt Fund - Direct", "Gamma Hybrid Fund - Direct"]
    assert by_name["Beta Bond Fund - Direct"]["aaum_value"] == ""


def test_e4_stale_uses_as_of_date_not_import_date(database_url, tmp_path):
    rows = _read(_run(database_url, tmp_path)["E4"])
    by_name = {r["scheme_name"]: r for r in rows}
    g1 = by_name["Gamma Equity Fund - Direct"]
    # Imported 5 Nov 2026, but the file is dated 30 Sep 2026: stale, not fresh.
    assert g1["newest_written_as_of"] == "2026-09-30" and g1["freshness"] == "stale"
    assert by_name["Alpha Growth Fund - Direct"]["freshness"] == "fresh"
    # A failed target-month batch is not coverage: the newest written one is last month's.
    assert by_name["Beta Value Fund - Direct"]["freshness"] == "stale"
    assert by_name["Beta Value Fund - Direct"]["newest_any_as_of"] == "2026-10-31"
    # Never written at all (waiting, or failed with no earlier month).
    assert by_name["Gamma Hybrid Fund - Direct"]["freshness"] == "none"
    assert by_name["Beta Gilt Fund - Direct"]["freshness"] == "none"
    assert by_name["Gamma Hybrid Fund - Direct"]["newest_written_as_of"] == ""
    assert {r["house_newest_written_as_of"] for r in rows if r["amc_name"] == "Beta Mutual Fund"} == {"2026-10-31"}
    assert by_name["ASK Absent Fund - Direct"]["expected_gap"] == "1"
    assert "Alpha Old Maturity Fund - Direct" not in by_name


def test_e5_lists_parse_errors_per_failed_batch(database_url, tmp_path):
    rows = _read(_run(database_url, tmp_path)["E5"])
    got = {r["scheme_name"]: r for r in rows}
    assert set(got) == {"Beta Value Fund - Direct", "Beta Gilt Fund - Direct"}   # failed batches only
    assert "failed_sum_check" in got["Beta Value Fund - Direct"]["parse_errors"]
    assert got["Beta Value Fund - Direct"]["as_of_date"] == "2026-10-31"
    assert got["Beta Value Fund - Direct"]["source_kind"] in ("automatic", "manual", "unknown")
    # A stored JSON null is "no structured reason" (a weight-check failure), shown as empty.
    assert got["Beta Gilt Fund - Direct"]["parse_errors"] == ""


def test_run_is_read_only(database_url, tmp_path):
    module = audit()
    conn = module.open_read_only(database_url)
    try:
        assert conn.exec_driver_sql("PRAGMA query_only").scalar() == 1
        with pytest.raises(DBAPIError):
            conn.execute(text("DELETE FROM disclosure_batches"))
    finally:
        conn.rollback()
        conn.close()

    engine = create_engine(database_url)
    with engine.connect() as plain:
        before = plain.execute(text("SELECT COUNT(*) FROM disclosure_batches")).scalar()
    module.run_audit(database_url, TARGET, tmp_path / "out")
    with engine.connect() as plain:
        assert plain.execute(text("SELECT COUNT(*) FROM disclosure_batches")).scalar() == before

    # The shipped SQL itself is SELECT only, one statement per query.
    for name, sql in module.load_queries().items():
        assert sql.lstrip().upper().startswith("SELECT"), name
        assert ";" not in sql.rstrip().rstrip(";"), name
        assert not re.search(r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|GRANT)\b", sql, re.I), name
    engine.dispose()


def test_output_has_no_personal_columns(database_url, tmp_path):
    outputs = _run(database_url, tmp_path)
    assert sorted(outputs) == ["E1", "E2", "E3", "E4", "E5"]
    forbidden = {"user", "email", "phone", "mobile", "pan", "folio", "member", "household", "address", "dob", "password"}
    allowed = {
        "amc_name", "status", "batches_target", "batches_prior", "expected_gap", "live_schemes",
        "schemes_without_base_name", "scheme_name", "target_status", "aaum_reference_period", "aaum_value",
        "assets_basis", "newest_written_as_of", "newest_any_as_of", "freshness", "house_newest_written_as_of",
        "as_of_date", "source_kind", "parse_errors",
    }
    for key, path in outputs.items():
        assert path.exists() and path.suffix == ".csv"
        with open(path, newline="", encoding="utf-8") as handle:
            header = next(csv.reader(handle))
        assert set(header) <= allowed, (key, set(header) - allowed)
        assert not any(set(column.split("_")) & forbidden for column in header), key
    sql = (Path(audit().__file__).parent / "queries.sql").read_text(encoding="utf-8").lower()
    for table in ("users", "household_members", "folios", "transactions", "imports", "cas_"):
        assert table not in sql


def test_target_must_be_a_month_end(database_url, tmp_path):
    with pytest.raises(ValueError):
        audit().run_audit(database_url, date(2026, 10, 30), tmp_path / "out")


def test_expected_absent_names_cover_taurus_and_monarch_as_the_registry_spells_them():
    from app.services.analytics.portfolio_disclosure_resolvers import AMC_DISCLOSURE_RESOLVERS

    names = {n.upper() for n in audit().EXPECTED_ABSENT_AMCS}
    registry = {key.upper() for key in AMC_DISCLOSURE_RESOLVERS}
    assert {"TAURUS MUTUAL FUND", "MONARCH MUTUAL FUND"} <= names & registry
    assert len(names) == 7   # the five that publish nothing, plus Taurus and Monarch


def test_command_line_prints_every_csv_for_the_container_run(database_url, tmp_path, capsys):
    code = audit().main(["--database-url", database_url, "--target-month-end", "2026-10-31",
                         "--out-dir", str(tmp_path / "cli"), "--stdout"])
    printed = capsys.readouterr().out
    assert code == 0
    for key in ("E1", "E2", "E3", "E4", "E5"):
        assert f"=== {key} ===" in printed and f"=== end {key} ===" in printed
    assert "Target month end 2026-10-31" in printed and database_url not in printed
