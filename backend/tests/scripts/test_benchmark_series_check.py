"""Synthetic fixtures only; these checks do not verify a live NSE series."""
import importlib
from datetime import date
from decimal import Decimal

import pytest

from app.models.reference import BenchmarkIndexMaster


def checker():
    return importlib.import_module("scripts.benchmark_series_check")


def flat_series(end="100"):
    return [(date(2020, 9, 30), Decimal("100")), (date(2022, 9, 30), Decimal("100")),
            (date(2024, 9, 30), Decimal("100")), (date(2025, 9, 30), Decimal(end))]


def test_series_matching_the_printed_returns_passes():
    # Hand-worked: 100 -> 110; 10% over 365 days, then
    # (1.1 ** (365/1096) - 1)*100 = 3.225019%, and over 1826 days 1.923424%.
    checks = checker().check_series("nifty_1d_rate", flat_series("110"), date(2025, 9, 30), {"1Y": Decimal("10"), "3Y": Decimal("3.23"), "5Y": Decimal("1.92")})
    assert len(checks) == 3 and all(c.passed for c in checks)
    assert [c.computed.quantize(Decimal("0.000001")) for c in checks] == [Decimal("10.000000"), Decimal("3.225019"), Decimal("1.923424")]


def test_series_off_by_more_than_0_05_points_fails_and_stays_inactive(db_session):
    from app.services.analytics import benchmark_registry as registry
    from app.models.reference import BenchmarkIndexMaster
    spec = registry.get_index("nifty_1d_rate")
    db_session.add(BenchmarkIndexMaster(**spec.__dict__))
    db_session.commit()
    checks = checker().check_series(spec.key, flat_series(), date(2025, 9, 30), {"1Y": Decimal("0.06"), "3Y": Decimal("0"), "5Y": Decimal("0")})
    assert not checks[0].passed
    assert not registry.checked_index(spec, checks).active
    assert not db_session.get(BenchmarkIndexMaster, spec.key).active
    passing = checker().check_series(spec.key, flat_series(), date(2025, 9, 30), {"1Y": Decimal("0.05"), "3Y": Decimal("0"), "5Y": Decimal("0")})
    assert registry.checked_index(spec, passing).active
    assert not registry.checked_index(spec, passing[:1]).active


def test_inactive_index_funds_use_the_category_fallback(db_session):
    from app.services.analytics import benchmark_registry as registry
    from app.models.reference import BenchmarkIndexMaster
    spec = registry.get_index("nifty_bank")
    db_session.add(BenchmarkIndexMaster(**{**spec.__dict__, "active": False}))
    db_session.commit()
    assert registry.select_index(spec.key, "nifty_100", db=db_session).key == "nifty_100"
    assert registry.select_index("not_registered", "nifty_500", db=db_session).key == "nifty_500"


def candidates():
    module = checker()
    return [module.MetalETF("small", "gold", Decimal("10"), flat_series("110")),
            module.MetalETF("largest", "gold", Decimal("20"), flat_series("110.4")),
            module.MetalETF("unheld", "gold", Decimal("999"), flat_series("150"), held=False),
            module.MetalETF("blend", "gold", Decimal("9999"), flat_series("150"), plain_metal=False)]


def test_gold_etf_within_half_a_point_keeps_the_proxy():
    result = checker().check_metal_etf(candidates(), "gold", date(2025, 9, 30), Decimal("10"))
    assert (result.scheme_id, result.use_etf, result.difference_pp) == ("largest", True, Decimal("0.4"))


def test_gold_etf_outside_half_a_point_switches_to_printed_returns():
    result = checker().check_metal_etf(candidates(), "gold", date(2025, 9, 30), Decimal("9.89"))
    assert (result.scheme_id, result.use_etf) == ("largest", False)
    assert result.difference_pp == Decimal("0.51")
    assert not checker().check_metal_etf([], "silver", date(2025, 9, 30), Decimal("10")).use_etf


def test_blend_note_lists_the_weights_in_plain_words():
    from app.services.analytics.benchmark_notes import benchmark_note
    assert benchmark_note("benchmark_note_mix", weights="65% Nifty 50, 22.5% debt, 10% gold and 2.5% silver") == "This fund's benchmark is a mix: 65% Nifty 50, 22.5% debt, 10% gold and 2.5% silver. We show the returns the fund house prints."


def test_no_user_string_contains_TRI_proxy_or_fallback():
    from app.services.analytics.benchmark_notes import BENCHMARK_NOTES
    assert set(BENCHMARK_NOTES) == {"benchmark_note_mix", "benchmark_note_closest", "benchmark_note_printed", "benchmark_note_gold"}
    assert not any(word in text.lower() for word in ("tri", "proxy", "fallback") for text in BENCHMARK_NOTES.values())


@pytest.mark.parametrize("series", [[], [(date(2025, 9, 30), Decimal("0"))], flat_series()[:-1]])
def test_missing_or_nonpositive_series_fails_closed(series):
    checks = checker().check_series("nifty_1d_rate", series, date(2025, 9, 30), {"1Y": Decimal("0"), "3Y": Decimal("0"), "5Y": Decimal("0")})
    assert not any(c.passed for c in checks)


def test_script_refuses_every_database_write(tmp_path):
    from sqlalchemy import create_engine, text
    engine = create_engine("sqlite://")
    checker().guard_read_only(engine)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT 1")).scalar_one() == 1
        with pytest.raises(RuntimeError, match="read-only"):
            conn.execute(text("CREATE TABLE forbidden (id INTEGER)"))


def test_metal_check_needs_the_same_as_on_date():
    result = checker().check_metal_etf(candidates(), "gold", date(2025, 10, 1), Decimal("10"))
    assert not result.use_etf


def test_silver_boundary_is_inclusive_and_largest_etf_is_not_replaced_if_it_fails():
    module = checker()
    silver = [module.MetalETF("largest", "silver", Decimal("20"), flat_series("110.5")),
              module.MetalETF("small", "silver", Decimal("10"), flat_series("110"))]
    assert module.check_metal_etf(silver, "silver", date(2025, 9, 30), Decimal("10")).use_etf
    result = module.check_metal_etf(silver, "silver", date(2025, 9, 30), Decimal("9.99"))
    assert not result.use_etf and result.scheme_id == "largest"


@pytest.mark.parametrize("sql", ["SELECT 1 INTO forbidden", "WITH x AS (SELECT 1) DELETE FROM forbidden", "SELECT 1; DELETE FROM forbidden"])
def test_read_only_guard_refuses_data_changing_selects(sql):
    from sqlalchemy import create_engine, text
    engine = create_engine("sqlite://")
    checker().guard_read_only(engine)
    with engine.connect() as conn, pytest.raises(RuntimeError, match="read-only"):
        conn.execute(text(sql))


def test_missing_sqlite_file_is_never_created(tmp_path):
    path = tmp_path / "absent.db"
    with pytest.raises(ValueError, match="existing"):
        checker().read_only_engine(f"sqlite:///{path}")
    assert not path.exists()


def test_sqlite_engine_reads_existing_data_and_the_connection_itself_cannot_write(tmp_path):
    import sqlite3
    from sqlalchemy import text
    path = tmp_path / "stored.db"
    with sqlite3.connect(path) as conn:
        conn.execute("CREATE TABLE stored (value INTEGER)")
        conn.execute("INSERT INTO stored VALUES (1)")
    engine = checker().read_only_engine(f"sqlite:///{path}")
    try:
        with engine.connect() as conn:
            assert conn.execute(text("SELECT value FROM stored")).scalar_one() == 1
        raw = engine.raw_connection()
        try:
            with pytest.raises(sqlite3.OperationalError, match="readonly"):
                raw.cursor().execute("UPDATE stored SET value=2")
        finally:
            raw.close()
    finally:
        engine.dispose()


def test_metal_database_check_requires_verified_plain_metal_candidates(monkeypatch):
    module = checker()
    def no_connection(*_):
        pytest.fail("Do not infer plain-metal tracking from a scheme name")
    monkeypatch.setattr(module, "read_only_engine", no_connection)
    with pytest.raises(SystemExit) as error:
        module.main(["--metal", "gold", "--user-id", "00000000-0000-0000-0000-000000000001", "--as-of", "2026-09-30", "--printed", "1Y=10"])
    assert error.value.code == 2
