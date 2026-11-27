"""Status check for the two AMC data pipelines (plan of 27 Nov 2026, part S), run read-only.

Invented rows only. Target month end 31 Oct 2026 (a Saturday), the month before 30 Sep 2026.

  Lic   : two Oct workbooks in Sep (two source URLs), only one in Oct; L2 family dropped.
  Frank : written in Sep; one Oct batch dated 30 Oct (the last working day) by a hand import.
  Zed   : a registry key with no live schemes (renamed upstream) -- registry check.
  Newco : a live house that no registry knows -- registry check.
  Factsheets: Lic has managers for Sep and Oct issues; Frank only for Aug.
"""
import asyncio
import importlib
import os
import subprocess
import sys
import uuid
from pathlib import Path
from datetime import date

import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.enums import DisclosureBatchStatus as Status
from app.models.reference import DisclosureBatch, Scheme, SchemeFundManager

TARGET = date(2026, 10, 31)
PRIOR = date(2026, 9, 30)


def status():
    return importlib.import_module("scripts.audit_pipelines.status")


def _scheme(db, name, amc, base, *, active=True):
    s = Scheme(name=name, base_name=base, amc_name=amc, sebi_category="Equity Scheme - Large Cap Fund",
               is_active=active)
    db.add(s)
    db.flush()
    return s


def _batch(db, scheme, as_of, st, url):
    db.add(DisclosureBatch(scheme_id=scheme.id, as_of_date=as_of, amc_name=scheme.amc_name, status=st,
                           source_url=url))


def _manager(db, scheme, period):
    db.add(SchemeFundManager(scheme_id=scheme.id, manager_name="A Manager", reference_period=period,
                             match_method="EXACT"))


def _seed(url):
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        l1 = _scheme(db, "Lic Equity Fund - Direct", "Lic Mutual Fund", "Lic Equity Fund")
        l1r = _scheme(db, "Lic Equity Fund - Regular", "Lic Mutual Fund", "Lic Equity Fund")
        l2 = _scheme(db, "Lic Debt Fund - Direct", "Lic Mutual Fund", "Lic Debt Fund")
        f1 = _scheme(db, "Frank Value Fund - Direct", "Frank Mutual Fund", "Frank Value Fund")
        _scheme(db, "Newco Flexi Fund - Direct", "Newco Mutual Fund", "Newco Flexi Fund")
        _scheme(db, "Zed Old Fund - Direct", "Zed Mutual Fund", "Zed Old Fund", active=False)
        for s in (l1, l1r):
            _batch(db, s, PRIOR, Status.WRITTEN, "https://lic.example/equity-sep.xlsx")
            _batch(db, s, TARGET, Status.WRITTEN, "https://lic.example/equity-oct.xlsx")
        _batch(db, l2, PRIOR, Status.WRITTEN, "https://lic.example/debt-sep.xlsx")
        _batch(db, f1, PRIOR, Status.WRITTEN, "https://frank.example/sep.xlsx")
        _batch(db, f1, date(2026, 10, 30), Status.WRITTEN, "manual:frank-oct.xlsx")
        _manager(db, l1, date(2026, 9, 30))
        _manager(db, l1, date(2026, 10, 31))
        _manager(db, l2, date(2026, 10, 31))
        _manager(db, f1, date(2026, 8, 31))
        db.commit()
    engine.dispose()


@pytest.fixture(params=["sqlite", "postgres"])
def database_url(request, tmp_path):
    schema = None
    if request.param == "sqlite":
        url = f"sqlite:///{(tmp_path / 'status.db').as_posix()}"
    else:
        base = os.environ.get("TEST_DATABASE_URL")
        if not base:
            pytest.skip("TEST_DATABASE_URL unset; Postgres unavailable")
        schema = "status_" + uuid.uuid4().hex
        admin = create_engine(base)
        with admin.begin() as conn:
            conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        admin.dispose()
        url = base + ("&" if "?" in base else "?") + f"options=-csearch_path%3D{schema}"
    _seed(url)
    yield url
    if schema is not None:
        admin = create_engine(base)
        with admin.begin() as conn:
            conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        admin.dispose()


def _rows(blocks, name):
    header, rows = blocks[name]
    return [dict(zip(header, ["" if v is None else str(v) for v in row])) for row in rows]


def test_s2_factsheets_newest_period_and_history_per_house(database_url):
    blocks = status().run_status(database_url, TARGET)
    newest = {r["amc_name"]: r for r in _rows(blocks, "S2a")}
    assert newest["Lic Mutual Fund"]["newest_period"] == "2026-10-31"
    assert newest["Lic Mutual Fund"]["schemes_at_newest"] == "2"
    assert newest["Lic Mutual Fund"]["live_schemes"] == "3"
    assert newest["Frank Mutual Fund"]["newest_period"] == "2026-08-31"
    assert newest["Newco Mutual Fund"]["newest_period"] == ""
    history = {(r["amc_name"], r["reference_period"]): r["schemes"] for r in _rows(blocks, "S2b")}
    assert history[("Lic Mutual Fund", "2026-09-30")] == "1"
    assert history[("Lic Mutual Fund", "2026-10-31")] == "2"


def test_s3_counts_distinct_files_and_shows_near_month_end_dates(database_url):
    rows = _rows(status().run_status(database_url, TARGET), "S3")
    by = {(r["amc_name"], r["as_of_date"], r["status"]): r for r in rows}
    assert by[("Lic Mutual Fund", "2026-09-30", "written")]["files"] == "2"
    assert by[("Lic Mutual Fund", "2026-10-31", "written")]["files"] == "1"
    # A batch dated on the last working day is listed, not hidden by the month-end rule.
    assert by[("Frank Mutual Fund", "2026-10-30", "written")]["batches"] == "1"


def test_s4_lists_families_written_last_month_and_short_now(database_url):
    rows = _rows(status().run_status(database_url, TARGET), "S4")
    found = {(r["amc_name"], r["family"]): r for r in rows}
    assert ("Lic Mutual Fund", "Lic Debt Fund") in found
    assert found[("Lic Mutual Fund", "Lic Debt Fund")]["target_written"] == "0"
    assert ("Lic Mutual Fund", "Lic Equity Fund") not in found  # same count both months
    assert ("Frank Mutual Fund", "Frank Value Fund") in found   # 30 Oct is not 31 Oct for E-style counts


def test_s7_registry_consistency(database_url, monkeypatch):
    mod = status()
    monkeypatch.setattr(mod, "_registries", lambda: {
        "disclosures": {"Lic Mutual Fund", "Frank Mutual Fund", "Zed Mutual Fund"},
        "factsheets": {"Lic Mutual Fund", "Frank Mutual Fund", "Newco Mutual Fund"},
    })
    rows = _rows(mod.run_status(database_url, TARGET), "S7")
    got = {(r["registry"], r["amc_name"], r["problem"]) for r in rows}
    assert ("disclosures", "Zed Mutual Fund", "registry_key_without_live_schemes") in got
    assert ("disclosures", "Newco Mutual Fund", "live_house_not_in_registry") in got
    assert not any(r[1] == "Newco Mutual Fund" and r[0] == "factsheets" for r in got)


def test_status_writes_nothing_and_refuses_non_select(database_url, monkeypatch):
    mod = status()
    engine = create_engine(database_url)
    with Session(engine) as db:
        before = (db.scalar(select(func.count()).select_from(DisclosureBatch)),
                  db.scalar(select(func.count()).select_from(SchemeFundManager)))
    mod.run_status(database_url, TARGET)
    with Session(engine) as db:
        after = (db.scalar(select(func.count()).select_from(DisclosureBatch)),
                 db.scalar(select(func.count()).select_from(SchemeFundManager)))
    engine.dispose()
    assert before == after
    monkeypatch.setitem(mod.QUERIES, "S3", "DELETE FROM disclosure_batches")
    with pytest.raises(RuntimeError, match="not a SELECT"):
        mod.run_status(database_url, TARGET)


def test_target_must_be_a_month_end(database_url):
    with pytest.raises(ValueError, match="last day of a month"):
        status().run_status(database_url, date(2026, 10, 30))


def test_relaxed_dates_keep_last_working_days_and_never_download():
    mod = status()
    client_mod = importlib.import_module("app.services.analytics.portfolio_disclosure_client")
    seen = []
    relaxed = mod.relaxed_fetch_dated_records(TARGET, window_days=3, seen=seen)
    records = [("https://x.example/oct31.xlsx", date(2026, 10, 31), None),
               ("https://x.example/oct30.xlsx", date(2026, 10, 30), "Fund A"),
               ("https://x.example/oct26.xlsx", date(2026, 10, 26), None),
               ("https://x.example/sep30.xlsx", date(2026, 9, 30), None),
               ("https://x.example/undated.xlsx", None, None)]
    token = client_mod._DISCOVERY_ONLY.set(True)
    try:
        files = asyncio.run(relaxed(None, records, TARGET))  # client None: any download would crash
    finally:
        client_mod._DISCOVERY_ONLY.reset(token)
    assert [f.as_of_date for f in files] == [date(2026, 10, 31), date(2026, 10, 30)]
    assert all(f.data is None for f in files)
    assert sorted(d for _, d in seen if d) == [date(2026, 9, 30), date(2026, 10, 26),
                                                date(2026, 10, 30), date(2026, 10, 31)]


def test_discover_reports_exact_and_near_files_per_house(monkeypatch):
    mod = status()
    client_mod = importlib.import_module("app.services.analytics.portfolio_disclosure_client")
    resolvers = importlib.import_module("app.services.analytics.portfolio_disclosure_resolvers")
    entry = resolvers.DisclosureResolverEntry(kind=resolvers.DisclosureResolverKind.JSON_API,
                                              custom_locator="fake")
    manual = resolvers.DisclosureResolverEntry(kind=resolvers.DisclosureResolverKind.MANUAL)
    monkeypatch.setattr(mod, "_disclosure_registry", lambda: {"Frank Mutual Fund": entry,
                                                              "Hand Mutual Fund": manual})

    async def fake_locate(client, entry_, scheme_rows):
        assert client_mod._DISCOVERY_ONLY.get() is True
        assert client_mod._locate_month_end() == TARGET
        return await client_mod._fetch_dated_records(client, [
            ("https://f.example/a.xlsx", date(2026, 10, 30), None),
            ("https://f.example/b.xlsx", date(2026, 10, 30), None),
            ("https://f.example/old.xlsx", date(2026, 9, 30), None)], TARGET)

    monkeypatch.setitem(client_mod._CUSTOM_LOCATORS, "fake", fake_locate)
    monkeypatch.setattr(client_mod, "_locate_and_fetch", fake_locate)
    header, rows = mod.discover(TARGET, {"Frank Mutual Fund": [object()], "Hand Mutual Fund": []})
    got = {r[header.index("amc_name")]: dict(zip(header, r)) for r in rows}
    frank = got["Frank Mutual Fund"]
    assert frank["result"] == "ok"
    assert frank["exact_month_end_files"] == 0
    assert frank["near_month_end_files"] == 2
    assert frank["near_dates"] == "2026-10-30"
    assert frank["newest_other_date"] == "2026-09-30"
    assert got["Hand Mutual Fund"]["result"] == "manual"
    # the real rule is back after the run
    assert client_mod._fetch_dated_records is not None and \
        client_mod._fetch_dated_records.__name__ == "_fetch_dated_records"


def test_discover_static_pages_keep_history_out_of_near_dates(monkeypatch):
    """Static-page houses return their whole history without the dated-records filter."""
    mod = status()
    client_mod = importlib.import_module("app.services.analytics.portfolio_disclosure_client")
    resolvers = importlib.import_module("app.services.analytics.portfolio_disclosure_resolvers")
    entry = resolvers.DisclosureResolverEntry(kind=resolvers.DisclosureResolverKind.STATIC_REGEX)
    monkeypatch.setattr(mod, "_disclosure_registry", lambda: {"Nip Mutual Fund": entry})

    async def fake_locate(client, entry_, scheme_rows):
        return [client_mod.LocatedFile(None, f"https://n.example/{d}.xlsx", d)
                for d in (date(2026, 10, 31), date(2026, 9, 30), date(2026, 8, 31))]

    monkeypatch.setattr(client_mod, "_locate_and_fetch", fake_locate)
    header, rows = mod.discover(TARGET, {"Nip Mutual Fund": [object()]})
    row = dict(zip(header, rows[0]))
    assert (row["records_seen"], row["exact_month_end_files"], row["near_month_end_files"]) == (3, 1, 0)
    assert row["near_dates"] == ""
    assert row["newest_other_date"] == "2026-09-30"


def test_command_line_prints_every_block(database_url, capsys):
    assert status().main(["--database-url", database_url, "--target-month-end", "2026-10-31"]) == 0
    out = capsys.readouterr().out
    assert out.splitlines()[0].startswith("AMC pipelines status check, read-only. Target month end 2026-10-31")
    for name in ("S1-E1", "S1-E2", "S1-E3", "S1-E4", "S1-E5", "S2a", "S2b", "S3", "S4", "S7"):
        assert f"=== {name} ===" in out and f"=== end {name} ===" in out
    assert "=== S5 ===" not in out  # network discovery only with --discover
    assert "=== done ===" in out


def test_piped_on_stdin_from_the_backend_folder_like_the_vm_guide(database_url):
    # The guide runs `python - <args> < status.py` in /app; Python then sets __file__ to "<stdin>".
    backend = Path(__file__).resolve().parents[2]
    script = backend / "scripts" / "audit_pipelines" / "status.py"
    with script.open("rb") as stdin:
        done = subprocess.run(
            [sys.executable, "-", "--database-url", database_url, "--target-month-end", "2026-10-31"],
            stdin=stdin, cwd=backend, capture_output=True, text=True, timeout=120,
        )
    assert done.returncode == 0, done.stderr
    assert done.stdout.count("=== end ") == 10
    assert done.stdout.rstrip().endswith("=== done ===")


@pytest.mark.parametrize("file_value", [None, "<stdin>"])
def test_project_root_is_the_working_folder_when_piped(file_value):
    # On the VM the working folder is /app: Path("/app/<stdin>").parents[2] does not exist.
    assert status()._project_root(file_value, Path("/app")) == Path("/app")


def test_project_root_from_the_script_file():
    script = Path(status().__file__).resolve()
    assert status()._project_root(str(script), Path("/elsewhere")) == script.parents[2]
