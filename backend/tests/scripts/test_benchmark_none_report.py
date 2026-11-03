"""The none-report counts final labels correctly on a small synthetic fixture and only reads."""
import importlib
from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.models.enums import SchemePlanType
from app.models.reference import SchemeBenchmark
from tests.services.fund_page.factories import add_folio, add_scheme, add_user_household


def report_module():
    return importlib.import_module("scripts.benchmark_none_report")


def _row(db, fund, declared, mapped=None, quality="exact"):
    db.add(SchemeBenchmark(scheme_id=fund.id, declared_benchmark_name=declared, mapped_index_key=mapped,
                           match_quality=quality, source="factsheet", verified_on=date(2026, 10, 1)))


def build(db):
    household = add_user_household(db)
    schemes = {}
    for key, category, name in [
        ("large", "Equity Scheme - Large Cap Fund", "Large Fund"),
        ("liquid", "Debt Scheme - Liquid Fund", "Liquid Fund"),
        ("goldetf", "Other Scheme - Gold ETF", "Gold ETF Fund"),
        ("mid", "Equity Scheme - Mid Cap Fund", "Mid Fund"),
        ("arb", "Hybrid Scheme - Arbitrage Fund", "Arb Fund"),
        ("passive", "Other Scheme - Index Funds", "Passive Fund"),
        ("old", "Debt Scheme - Gilt Fund", "Closed Gilt"),
    ]:
        schemes[key] = add_scheme(db, key, category, SchemePlanType.DIRECT, key, name=name)
    schemes["old"].is_active = False
    _row(db, schemes["goldetf"], "Domestic Price of Gold", None, "none")   # none, but printed words
    _row(db, schemes["mid"], "Nifty Midcap 100 TRI", "nifty_midcap_100")   # factsheet
    for key in ("large", "liquid", "goldetf", "old"):                      # held: includes a sold-out inactive fund
        add_folio(db, schemes[key], household.asha_id, f"F-{key}")
    db.commit()
    return schemes


def test_counts_by_final_label_and_none_lists(db_session):
    build(db_session)
    result = report_module().collect(db_session)
    # Held: large (category), liquid (none), goldetf (printed), old gilt (none; inactive but held).
    assert dict(result.held) == {
        "Chosen by the fund's category": 1, "No benchmark": 2, "As printed in the fund house's factsheet": 1}
    # Listed active: large, liquid, goldetf, mid, arb, passive (the inactive one is out).
    assert dict(result.listed) == {
        "Chosen by the fund's category": 2,                                  # large, arb
        "From the fund's factsheet": 1,                                      # mid
        "No benchmark": 2,                                                   # liquid, passive
        "As printed in the fund house's factsheet": 1,                       # gold etf
    }
    assert result.none_by_category == {
        "Debt Scheme - Liquid Fund": {"held": 1, "listed": 1},
        "Other Scheme - Gold ETF": {"held": 1, "listed": 1},
        "Other Scheme - Index Funds": {"held": 0, "listed": 1},
        "Debt Scheme - Gilt Fund": {"held": 1, "listed": 0},
    }
    assert ("Debt Scheme - Liquid Fund", "Liquid Fund", "No benchmark") in result.none_names_held
    # Sorted by category, then name.
    assert [n for _, n, _ in result.none_names_listed] == ["Liquid Fund", "Gold ETF Fund", "Passive Fund"]


def test_formatted_report_prints_labels_and_categories_but_no_user_data(db_session):
    build(db_session)
    module = report_module()
    text = module.format_report(module.collect(db_session), max_names=2)
    assert "Held schemes by final label (total 4)" in text
    assert "Listed active schemes by final label (total 6)" in text
    assert "Other Scheme - Index Funds" in text and "showing 2 of 3" in text
    assert "ASHA" not in text and "F-large" not in text


def test_main_only_reads_and_leaves_the_database_unchanged(tmp_path, capsys):
    url = f"sqlite:///{(tmp_path / 'none_report.db').as_posix()}"
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as db:
        build(db)
    with engine.connect() as conn:
        before = conn.exec_driver_sql("select count(*) from schemes").scalar(), conn.exec_driver_sql("select count(*) from scheme_benchmark").scalar()
    engine.dispose()
    assert report_module().main(["--database-url", url, "--max-names", "5"]) == 0
    out = capsys.readouterr().out
    assert "report_stopped" not in out and "Held schemes by final label (total 4)" in out
    engine = create_engine(url)
    with engine.connect() as conn:
        assert (conn.exec_driver_sql("select count(*) from schemes").scalar(), conn.exec_driver_sql("select count(*) from scheme_benchmark").scalar()) == before
    engine.dispose()


def test_a_write_attempt_stops_the_report(tmp_path, capsys, monkeypatch):
    url = f"sqlite:///{(tmp_path / 'none_report2.db').as_posix()}"
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    engine.dispose()
    module = report_module()

    def sneaky(db):
        db.execute(__import__("sqlalchemy").text("delete from schemes"))
    monkeypatch.setattr(module, "collect", sneaky)
    assert module.main(["--database-url", url]) == 1
    assert capsys.readouterr().out.strip() == "report_stopped=1"


def test_missing_database_file_stops_cleanly(tmp_path, capsys):
    assert report_module().main(["--database-url", f"sqlite:///{(tmp_path / 'missing.db').as_posix()}"]) == 1
    assert capsys.readouterr().out.strip() == "report_stopped=1"
