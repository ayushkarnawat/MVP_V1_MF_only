from datetime import date
from decimal import Decimal
import asyncio
import uuid
from unittest.mock import AsyncMock, patch

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.reference import Scheme
from app.services.analytics.scheme_universe import SchemeUniverseClient, _parse_nav_all

_SAMPLE_TEXT = (
    "Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date\r\n"
    "\r\n"
    "Open Ended Schemes(Equity Scheme - Flexi Cap Fund)\r\n"
    "\r\n"
    "HDFC Mutual Fund\r\n"
    "\r\n"
    "100001;INF001A01AA1;-;HDFC Flexi Cap Fund - Direct Plan - Growth;120.5000;10-Aug-2026\r\n"
    "100002;-;INF001A01AB9;HDFC Flexi Cap Fund - Regular Plan - IDCW;80.2500;10-Aug-2026\r\n"
    "\r\n"
    "Open Ended Schemes(Debt Scheme - Liquid Fund)\r\n"
    "\r\n"
    "ICICI Prudential Mutual Fund\r\n"
    "\r\n"
    "200001;INF002A01AA1;-;ICICI Prudential Liquid Fund - Direct Plan - Growth;350.1234;10-Aug-2026\r\n"
)


def _session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return sessionmaker(autoflush=False, bind=engine)()


def test_parse_nav_all_extracts_category_amc_and_isin():
    rows = _parse_nav_all(_SAMPLE_TEXT)
    assert len(rows) == 3

    first = rows[0]
    assert first.amfi_code == "100001"
    assert first.isin == "INF001A01AA1"
    assert first.name == "HDFC Flexi Cap Fund - Direct Plan - Growth"
    assert first.amc_name == "HDFC Mutual Fund"
    assert first.sebi_category == "Equity Scheme - Flexi Cap Fund"


def test_parse_nav_all_falls_back_to_second_isin_when_first_is_blank():
    rows = _parse_nav_all(_SAMPLE_TEXT)
    second = rows[1]
    assert second.amfi_code == "100002"
    assert second.isin == "INF001A01AB9"


def test_parse_nav_all_tracks_category_changes_across_blocks():
    rows = _parse_nav_all(_SAMPLE_TEXT)
    third = rows[2]
    assert third.amfi_code == "200001"
    assert third.sebi_category == "Debt Scheme - Liquid Fund"
    assert third.amc_name == "ICICI Prudential Mutual Fund"


def test_get_category_universe_creates_new_scheme_rows(tmp_path):
    db = _session()
    client = SchemeUniverseClient(cache_dir=tmp_path)
    with patch.object(client, "_fetch_nav_all_text", new=AsyncMock(return_value=_SAMPLE_TEXT)):
        universe = asyncio.run(client.get_category_universe(db, "Equity Scheme - Flexi Cap Fund"))

    assert len(universe) == 2
    assert {s.amfi_code for s in universe} == {"100001", "100002"}
    assert db.query(Scheme).count() == 2


def test_get_category_universe_reuses_existing_scheme_row(tmp_path):
    db = _session()
    existing = Scheme(
        id=uuid.uuid4(),
        amfi_code="100001",
        isin="INF001A01AA1",
        name="HDFC Flexi Cap Fund - Direct Plan - Growth",
        amc_name="HDFC Mutual Fund",
        sebi_category="Equity Scheme - Flexi Cap Fund",
    )
    db.add(existing)
    db.commit()

    client = SchemeUniverseClient(cache_dir=tmp_path)
    with patch.object(client, "_fetch_nav_all_text", new=AsyncMock(return_value=_SAMPLE_TEXT)):
        universe = asyncio.run(client.get_category_universe(db, "Equity Scheme - Flexi Cap Fund"))

    assert len(universe) == 2
    assert db.query(Scheme).count() == 2
    assert existing.id in {s.id for s in universe}


def test_get_category_universe_returns_empty_list_for_unknown_category(tmp_path):
    db = _session()
    client = SchemeUniverseClient(cache_dir=tmp_path)
    with patch.object(client, "_fetch_nav_all_text", new=AsyncMock(return_value=_SAMPLE_TEXT)):
        universe = asyncio.run(client.get_category_universe(db, "Hybrid Scheme - Balanced Fund"))
    assert universe == []


_SAMPLE_TEXT_8_FIELD = (
    "Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;"
    "Net Asset Value;Date\r\n"
    "\r\n"
    "Open Ended Schemes(Equity Scheme - Flexi Cap Fund)\r\n"
    "\r\n"
    "Parag Parikh Mutual Fund\r\n"
    "\r\n"
    "122639;INF879O01027;-;Parag Parikh Flexi Cap Fund;Direct Plan;Growth;90.4982;18-Aug-2026\r\n"
    "122640;-;INF879O01019;Parag Parikh Flexi Cap Fund;Regular Plan;Growth;82.4788;18-Aug-2026\r\n"
)


def test_parse_nav_all_handles_2026_amfi_format_with_separate_plan_and_option_columns():
    """AMFI's NAVAll.txt changed live in Aug 2026 to split Plan/Option into
    their own columns (8 fields, not the previous 6) — confirmed against
    the real feed, not just a spec read. Root cause of every held fund
    showing "Insufficient History": the old 6-field check silently
    dropped every row, so `get_category_universe` always returned []."""
    rows = _parse_nav_all(_SAMPLE_TEXT_8_FIELD)
    assert len(rows) == 2

    first = rows[0]
    assert first.amfi_code == "122639"
    assert first.isin == "INF879O01027"
    assert first.name == "Parag Parikh Flexi Cap Fund - Direct Plan - Growth"
    assert first.amc_name == "Parag Parikh Mutual Fund"
    assert first.sebi_category == "Equity Scheme - Flexi Cap Fund"


def test_get_category_universe_degrades_gracefully_on_fetch_failure(tmp_path):
    db = _session()
    client = SchemeUniverseClient(cache_dir=tmp_path)
    with patch.object(client, "_fetch_nav_all_text", new=AsyncMock(side_effect=httpx.ConnectError("boom"))):
        universe = asyncio.run(client.get_category_universe(db, "Equity Scheme - Flexi Cap Fund"))
    assert universe == []


def test_disk_cache_read_write_for_nav_all(tmp_path):
    db = _session()
    client = SchemeUniverseClient(cache_dir=tmp_path)
    mock_fetch = AsyncMock(return_value=_SAMPLE_TEXT)

    with patch.object(client, "_fetch_nav_all_text", mock_fetch):
        asyncio.run(client.get_category_universe(db, "Equity Scheme - Flexi Cap Fund"))
        assert mock_fetch.call_count == 1
        assert (tmp_path / "nav_all.txt").exists()

    # A fresh client instance (no in-memory cache) reading the same cache_dir
    # should hit the disk cache, not the network, within the 24h TTL.
    client2 = SchemeUniverseClient(cache_dir=tmp_path)
    mock_fetch2 = AsyncMock(return_value=_SAMPLE_TEXT)
    with patch.object(client2, "_fetch_nav_all_text", mock_fetch2):
        universe = asyncio.run(client2.get_category_universe(db, "Debt Scheme - Liquid Fund"))
        assert mock_fetch2.call_count == 0
    assert len(universe) == 1


NAVALL_8 = """Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Mid Cap Fund)

Edelweiss Mutual Fund

140228;INF754K01KO2;-;Edelweiss Mid Cap Fund;Direct Plan;Growth Option;128.3011;05-Oct-2026
140225;INF754K01KN4;-;Edelweiss Mid Cap Fund;Regular Plan;Growth Option;108.5602;05-Oct-2026
"""


def test_parse_nav_all_keeps_plan_base_name_and_nav():
    rows = _parse_nav_all(NAVALL_8)
    d = next(r for r in rows if r.amfi_code == "140228")
    assert d.plan == "Direct Plan" and d.base_name == "Edelweiss Mid Cap Fund"
    assert d.nav == Decimal("128.3011") and d.nav_date == date(2026, 10, 5)


def test_parse_nav_all_leaves_blank_plan_and_option_out_of_the_name():
    # AMFI leaves Plan/Option blank for some funds (8 Oct); the name used to
    # read "Motilal Oswal Midcap Fund - - ".
    text = NAVALL_8 + "127042;INF247L01445;-;Motilal Oswal Midcap Fund;;;116.4021;07-Oct-2026\n"
    row = next(r for r in _parse_nav_all(text) if r.amfi_code == "127042")
    assert row.name == "Motilal Oswal Midcap Fund" and row.plan is None
    assert next(r for r in _parse_nav_all(text) if r.amfi_code == "140228").name == \
        "Edelweiss Mid Cap Fund - Direct Plan - Growth Option"


import pytest
from app.models.enums import SchemePlanType
from app.services.analytics.scheme_universe import (
    SchemeUniverseClient, UniverseRow, canonical_category, get_category_peers,
)


@pytest.mark.parametrize("raw, expected", [
    ("Equity Schemes - Flexi Cap Fund", "Equity Scheme - Flexi Cap Fund"),
    ("Equity Scheme - Flexi Cap Fund", "Equity Scheme - Flexi Cap Fund"),
    ("Equity Schemes - ELSS- Tax Saver Fund", "Equity Scheme - ELSS"),
    ("Equity Schemes - Thematic Fund", "Equity Scheme - Sectoral/ Thematic"),
    ("Hybrid Schemes - Balanced Advantage Fund/ Dynamic Asset Allocation",
     "Hybrid Scheme - Dynamic Asset Allocation or Balanced Advantage"),
    ("Income/Debt Oriented Schemes - Liquid Fund", "Debt Scheme - Liquid Fund"),
    ("Income/Debt Oriented Schemes - Banking and PSU Debt Fund", "Debt Scheme - Banking and PSU Fund"),
    ("Solution Oriented Schemes ** - Retirement Fund", "Solution Oriented Scheme - Retirement Fund"),
    # Ambiguous legacy headings are left alone rather than guessed:
    ("Income/Debt Oriented Schemes - Ultra Short to Short Term Fund",
     "Debt Scheme - Ultra Short to Short Term Fund"),
])
def test_canonical_category(raw, expected):
    assert canonical_category(raw) == expected


def _row(code, base, plan, option, category="Equity Scheme - Contra Fund", amc="A"):
    return UniverseRow(amfi_code=code, isin=None, name=" - ".join(p for p in (base, plan, option) if p),
                       amc_name=amc, sebi_category=category, base_name=base, plan=plan, option=option)


def test_peers_merge_spellings_and_keep_one_series_per_fund(tmp_path):
    client = SchemeUniverseClient(cache_dir=tmp_path)
    client._rows = [
        _row("1", "Alpha Contra Fund", "Direct Plan", "Growth"),
        _row("2", "Alpha Contra Fund", "Direct Plan", "IDCW"),
        _row("3", "Alpha Contra Fund", "Regular Plan", "Growth"),
        _row("4", "Beta Contra Fund", "Direct Plan", "Growth", category="Equity Schemes - Contra Fund", amc="B"),
        _row("5", "Beta Contra Fund", "Regular Plan", "Growth", category="Equity Schemes - Contra Fund", amc="B"),
    ]
    db = _session()
    peers = asyncio.run(client.get_category_peers(db, "Equity Schemes - Contra Fund", SchemePlanType.DIRECT))
    assert sorted(s.amfi_code for s in peers.schemes) == ["1", "4"]   # Direct Growth of each fund
    assert peers.fund_count == 2
    by_code = {s.amfi_code: s.id for s in db.query(Scheme).all()}
    # every variant of a fund maps to that fund's Direct Growth series
    assert peers.representative_of[by_code["2"]] == by_code["1"]
    assert peers.representative_of[by_code["3"]] == by_code["1"]


def test_peers_for_regular_plan_pick_regular_growth(tmp_path):
    client = SchemeUniverseClient(cache_dir=tmp_path)
    client._rows = [
        _row("1", "Alpha Contra Fund", "Direct Plan", "Growth"),
        _row("3", "Alpha Contra Fund", "Regular Plan", "Growth"),
        _row("6", "Alpha Contra Fund", "Regular Plan", "IDCW"),
    ]
    peers = asyncio.run(client.get_category_peers(_session(), "Equity Scheme - Contra Fund", SchemePlanType.REGULAR))
    assert [s.amfi_code for s in peers.schemes] == ["3"]


def test_peers_degrade_to_empty_when_amfi_is_unreachable(tmp_path):
    """get_category_universe already returns [] on a fetch failure; the peer step must
    keep that graceful behaviour instead of fetching again and raising."""
    client = SchemeUniverseClient(cache_dir=tmp_path)
    with patch.object(client, "_fetch_nav_all_text", new=AsyncMock(side_effect=httpx.ConnectError("down"))):
        peers = asyncio.run(client.get_category_peers(_session(), "Equity Scheme - Contra Fund", SchemePlanType.DIRECT))
    assert (peers.schemes, peers.fund_count, peers.representative_of) == ([], 0, {})
