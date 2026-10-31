"""BSE-only fundamentals checks; fixed inputs and mocked HTTP only."""
from datetime import date


def test_bse_bhavcopy_address_is_the_verified_new_format():
    from app.services.analytics import stock_fundamentals_client as client
    expected = "https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_{date}_F_0000.CSV"
    template = getattr(client, "BSE_BHAVCOPY_URL", None)
    assert template == expected
    assert template.format(date=date(2026, 10, 30).strftime("%Y%m%d")) == (
        "https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_20261030_F_0000.CSV"
    )


def test_nse_ratios_and_requests_unchanged_golden(db_session):
    from decimal import Decimal
    from app.models.reference import StockMaster
    from tests.services.analytics.test_stock_fundamentals_client import FixtureHTTP, _refresh
    fake = FixtureHTTP()
    result = _refresh(db_session, fake)
    assert result.success and result.rows_written == result.universe_count == 2
    assert result.as_of_date == date(2026, 10, 12)
    rows = {row.isin: row for row in db_session.query(StockMaster).all()}
    assert {isin: (row.pe_ratio, row.pb_ratio, row.source, row.pe_source, row.pb_source,
                    row.pe_as_of, row.pb_as_of, row.as_of_date, row.bse_scrip_code, row.footnote)
            for isin, row in rows.items()} == {
        "INE591G01025": (Decimal("43.100000"), Decimal("6.784687"), "NSE", "NSE", "YAHOO",
                        date(2026, 10, 12), date(2026, 10, 14), date(2026, 10, 12), None, None),
        "INE758T01015": (Decimal("720.880000"), Decimal("9.329274"), "NSE", "NSE", "YAHOO",
                        date(2026, 10, 12), date(2026, 10, 14), date(2026, 10, 12), None, None),
    }
    assert [(request.url.host, request.url.path) for request in fake.calls if "yahoo.com" in request.url.host] == [
        ("fc.yahoo.com", "/"), ("finance.yahoo.com", "/quote/COFORGE.NS"),
        ("query2.finance.yahoo.com", "/v1/test/getcrumb"),
        ("query2.finance.yahoo.com", "/v10/finance/quoteSummary/COFORGE.NS"),
        ("query2.finance.yahoo.com", "/v10/finance/quoteSummary/ETERNAL.NS"),
    ]
    assert not any("bseindia.com" in request.url.host or "screener.in" in request.url.host for request in fake.calls)


import asyncio
from decimal import Decimal
import httpx
import pytest
from app.models.enums import AssetType, TransactionType
from app.models.reference import StockMaster
from tests.services.analytics.test_lookthrough import _scheme, _batch
from tests.services.analytics.test_stock_fundamentals_client import FixtureHTTP, TODAY, _refresh
from tests.services.home.test_units import _member, _folio, _txn

# Assumed standard new-format headers and group codes: UNVERIFIED until the owner checks a real file.
BSE_CSV = b"""FinInstrmId,ISIN,TckrSymb,SctySrs,FinInstrmNm,ClsPric,TradDt,OpnPric,HghPric,LwPric,LastPric,PrvsClsgPric
500001,INE000000001,TINY,A,Synthetic A,120.00,2026-10-14,110,125,100,119,110
500002,INE000000002,TINY2,B,Synthetic B,130.00,2026-10-14,110,135,100,129,110
500003,INE000000003,TINY3,T,Synthetic T,140.00,2026-10-14,110,145,100,139,110
500004,INE000000004,TINY4,X,Synthetic X,150.00,2026-10-14,110,155,100,149,110
500005,INE000000005,TINY5,XT,Synthetic XT,160.00,2026-10-14,110,165,100,159,110
500006,INE000000006,TINY6,Z,Synthetic Z,170.00,2026-10-14,110,175,100,169,110
500007,INE000000007,TINY7,ZP,Synthetic ZP,180.00,2026-10-14,110,185,100,179,110
500008,INE000000008,TINY8,M,Synthetic M,190.00,2026-10-14,110,195,100,189,110
500009,INE000000009,TINY9,MT,Synthetic MT,200.00,2026-10-14,110,205,100,199,110
500010,INE000000010,DEBT,F,Synthetic rejected series,100.00,2026-10-14,90,110,80,100,90
500011,US0000000011,FOREIGN,A,Synthetic overseas,100.00,2026-10-14,90,110,80,100,90
500012,INE000000012,BLANK,A,Synthetic blank,,2026-10-14,90,110,80,100,90
500013,INE000000013,UNHELD,A,Synthetic unheld,100.00,2026-10-14,90,110,80,100,90
"""
YAHOO = '{"quoteSummary":{"result":[{"defaultKeyStatistics":{"trailingEps":{"raw":6.0},"bookValue":{"raw":40.0},"priceToBook":{"raw":999}},"summaryDetail":{"trailingPE":{"raw":888}}}]}}'
SCREENER = '<ul><li>Current Price 150</li><li>Stock P/E 25</li><li>Book Value 50</li></ul>'
ISIN = "INE000000001"


def _parser():
    from app.services.analytics import stock_fundamentals_client as client
    parser = getattr(client, "parse_bse_bhavcopy", None)
    assert parser is not None, "BSE CSV parser is not implemented"
    return parser


def test_bse_headers_and_equity_groups_are_explicit_constants():
    from app.services.analytics import stock_fundamentals_client as client
    assert set(getattr(client, "BSE_COLUMNS", {}).values()) == set(BSE_CSV.splitlines()[0].decode().split(','))
    assert getattr(client, "BSE_EQUITY_SERIES", None) == frozenset({"A", "B", "T", "X", "XT", "Z", "ZP", "M", "MT"})


def test_bse_accepts_each_approved_group_and_skips_other_series_foreign_blank_and_unheld():
    held = {f"INE{i:09d}" for i in range(1, 13)} | {"US0000000011"}
    result = _parser()(BSE_CSV, held, file_date=TODAY)
    assert set(result.quotes) == {f"INE{i:09d}" for i in range(1, 10)}
    assert result.quotes[ISIN].close == Decimal("120.00")
    assert result.quotes[ISIN].scrip_code == "500001"
    assert result.ambiguous == 0


@pytest.mark.parametrize("bad", ["0", "-1", "NaN", "Infinity", "not a price"])
def test_bse_nonpositive_or_unusable_close_is_skipped(bad):
    result = _parser()(BSE_CSV.replace(b"120.00", bad.encode()), {ISIN}, file_date=TODAY)
    assert result.quotes == {}


def test_bse_reads_header_names_not_positions():
    import csv, io
    reader = csv.DictReader(io.StringIO(BSE_CSV.decode()))
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=list(reversed(reader.fieldnames)))
    writer.writeheader(); writer.writerows(reader)
    assert _parser()(output.getvalue().encode(), {ISIN}, file_date=TODAY).quotes[ISIN].close == Decimal("120")


def test_bse_duplicate_series_prefers_unique_a_or_b_otherwise_counts_ambiguity():
    header = BSE_CSV.splitlines()[0]
    rows = b"""500001,INE000000001,TINY,T,Synthetic,100,2026-10-14,,,,,
500001,INE000000001,TINY,X,Synthetic,110,2026-10-14,,,,,
500002,INE000000002,TINY2,XT,Synthetic,100,2026-10-14,,,,,
500002,INE000000002,TINY2,A,Synthetic,125,2026-10-14,,,,,
500003,INE000000003,TINY3,A,Synthetic,130,2026-10-14,,,,,
500003,INE000000003,TINY3,B,Synthetic,135,2026-10-14,,,,,
"""
    result = _parser()(header+b"\n"+rows, {f"INE{i:09d}" for i in (1, 2, 3)}, file_date=TODAY)
    assert set(result.quotes) == {"INE000000002"}
    assert result.quotes["INE000000002"].close == Decimal("125")
    assert result.ambiguous == 2


def _seed_held(db, *, asset=AssetType.EQUITY_DOMESTIC, stock=True, units="100"):
    member, imported = _member(db)
    scheme = _scheme(db)
    folio = _folio(db, member, scheme, "BSE")
    _txn(db, folio, imported, TransactionType.PURCHASE, date(2026, 1, 1), units)
    _batch(db, scheme, [("Synthetic BSE stock", ISIN, "100", asset)])
    if stock:
        db.add(StockMaster(isin=ISIN, name="Synthetic BSE stock", source="BSE", as_of_date=date(2026, 10, 12)))
    db.commit()
    return scheme, folio, imported


class BSEHTTP(FixtureHTTP):
    def __init__(self, *, body=BSE_CSV, status=200, yahoo=YAHOO, screener=SCREENER):
        super().__init__()
        self.body, self.status, self.yahoo, self.screener = body, status, yahoo, screener

    def handler(self, request):
        if request.url.host == "www.bseindia.com":
            self.calls.append(request)
            return httpx.Response(self.status, content=self.body)
        if "quoteSummary" in request.url.path and request.url.path.endswith(".BO"):
            self.calls.append(request)
            return httpx.Response(404) if self.yahoo is None else httpx.Response(200, text=self.yahoo)
        if request.url.host == "www.screener.in" and "/500001/" in request.url.path:
            self.calls.append(request)
            return httpx.Response(404) if self.screener is None else httpx.Response(200, text=self.screener)
        return super().handler(request)


def test_bse_close_drives_yahoo_eps_and_book_ratios_with_source_dates(db_session):
    _seed_held(db_session)
    fake = BSEHTTP()
    result = _refresh(db_session, fake)
    row = db_session.get(StockMaster, ISIN)
    assert row.bse_scrip_code == "500001"
    assert row.source == "BSE" and row.pe_ratio == Decimal("20") and row.pb_ratio == Decimal("3")
    assert row.pe_source == "BSE_YAHOO_EPS" and row.pb_source == "BSE_YAHOO_BOOK"
    assert row.pe_as_of == row.pb_as_of == row.as_of_date == TODAY
    assert result.success
    assert "BSE close" in row.footnote and "Yahoo" in row.footnote
    assert not any(word in row.footnote for word in ("fallback", "proxy", "TRI"))
    assert sum("bseindia" in request.url.host for request in fake.calls) == 1
    assert any(request.url.path.endswith("BhavCopy_BSE_CM_0_0_0_20261014_F_0000.CSV") for request in fake.calls)


def test_bse_yahoo_missing_inputs_uses_existing_screener_ratios(db_session):
    _seed_held(db_session)
    _refresh(db_session, BSEHTTP(yahoo='{"quoteSummary":{"result":[{}]}}'))
    row = db_session.get(StockMaster, ISIN)
    # Existing screener path: finished P/E=25; P/B=its Current Price 150 / Book Value 50 = 3.
    assert row.pe_ratio == 25 and row.pb_ratio == 3
    assert row.pe_source == row.pb_source == "SCREENER"
    assert row.pe_as_of == row.pb_as_of == TODAY


def test_bse_finished_yahoo_ratios_are_kept_as_supplied(db_session):
    _seed_held(db_session)
    body = '{"quoteSummary":{"result":[{"defaultKeyStatistics":{"priceToBook":{"raw":4.5}},"summaryDetail":{"trailingPE":{"raw":22.5}}}]}}'
    fake = BSEHTTP(yahoo=body, screener=None)
    _refresh(db_session, fake)
    row = db_session.get(StockMaster, ISIN)
    assert row.pe_ratio == Decimal("22.5") and row.pb_ratio == Decimal("4.5")
    assert row.pe_source == row.pb_source == "YAHOO"


@pytest.mark.parametrize("number", ["0", "-2", "NaN"])
def test_bse_bad_earnings_and_book_value_never_make_ratios(db_session, number):
    _seed_held(db_session)
    body = '{"quoteSummary":{"result":[{"defaultKeyStatistics":{"trailingEps":{"raw":"'+number+'"},"bookValue":{"raw":"'+number+'"}}}]}}'
    _refresh(db_session, BSEHTTP(yahoo=body, screener=None))
    row = db_session.get(StockMaster, ISIN)
    assert row.bse_scrip_code == "500001"
    assert row.pe_ratio is None and row.pb_ratio is None


@pytest.mark.parametrize("status,broken", [(404, None), (503, None), (200, "ISIN"), (200, "ClsPric"), (200, "SctySrs"), (200, "FinInstrmId"), (200, "TckrSymb")])
def test_bse_missing_or_unreadable_file_is_nonfatal_and_preserves_rows(db_session, caplog, status, broken):
    caplog.set_level("INFO")
    _seed_held(db_session)
    row = db_session.get(StockMaster, ISIN)
    row.pe_ratio, row.pb_ratio = Decimal("7"), Decimal("2")
    row.pe_as_of = row.pb_as_of = row.as_of_date
    db_session.commit()
    body = BSE_CSV if broken is None else BSE_CSV.replace(broken.encode(), b"unknown", 1)
    fake = BSEHTTP(body=body, status=status)
    assert _refresh(db_session, fake).success
    row = db_session.get(StockMaster, ISIN)
    assert (row.pe_ratio, row.pb_ratio, row.as_of_date, row.bse_scrip_code) == (Decimal("7"), Decimal("2"), date(2026, 10, 12), None)
    assert not any(request.url.path.endswith(".BO") for request in fake.calls)
    if status == 404:
        assert "no file today" in caplog.text
    else:
        assert "STOCK_FUNDAMENTALS_ALERT" in caplog.text and "bse_file_unusable" in caplog.text


@pytest.mark.parametrize("mode", ["international", "not_in_master", "fully_redeemed", "no_longer_disclosed"])
def test_bse_only_prices_current_held_domestic_isins_already_in_stock_master(db_session, mode):
    scheme, folio, imported = _seed_held(db_session, asset=AssetType.EQUITY_INTERNATIONAL if mode == "international" else AssetType.EQUITY_DOMESTIC,
                                     stock=mode != "not_in_master")
    if mode == "fully_redeemed":
        _txn(db_session, folio, imported, TransactionType.REDEMPTION, date(2026, 2, 1), "100")
    if mode == "no_longer_disclosed":
        _batch(db_session, scheme, [("Replacement", "INE000000099", "100", AssetType.EQUITY_DOMESTIC)], as_of=date(2026, 10, 1))
    db_session.commit()
    fake = BSEHTTP()
    _refresh(db_session, fake)
    assert not any("bseindia" in request.url.host or request.url.path.endswith(".BO") for request in fake.calls)


def test_bse_missing_file_alone_does_not_make_the_daily_job_fail(db_session, monkeypatch):
    from app.services.analytics import stock_fundamentals_client as client
    _seed_held(db_session)
    monkeypatch.setattr(client, "parse_constituents", lambda _: {})
    result = _refresh(db_session, BSEHTTP(status=404))
    assert result.success and result.rows_written == 0


def test_bse_new_close_keeps_a_newer_retained_pb_date(db_session):
    _seed_held(db_session)
    row = db_session.get(StockMaster, ISIN)
    row.pb_ratio, row.pb_source, row.pb_as_of = Decimal("7"), "YAHOO", date(2026, 10, 15)
    db_session.commit()
    _refresh(db_session, BSEHTTP())
    row = db_session.get(StockMaster, ISIN)
    assert row.pe_ratio == 20 and row.pe_as_of == TODAY
    assert row.pb_ratio == 7 and row.pb_as_of == date(2026, 10, 15)
    assert "retained" in row.footnote


def test_bse_screener_sources_reach_valuation_in_plain_words_and_overseas_stays_separate(db_session, monkeypatch):
    from tests.services.analytics.test_valuation import _compute
    from tests.services.analytics.test_lookthrough import _holding
    scheme, _, _ = _seed_held(db_session)
    # A new disclosure leaves 80% domestic and 20% overseas. Only domestic is BSE-priced.
    _batch(db_session, scheme, [("Synthetic BSE stock", ISIN, "80", AssetType.EQUITY_DOMESTIC),
                               ("Overseas", "US0000000011", "20", AssetType.EQUITY_INTERNATIONAL)], as_of=date(2026, 10, 1))
    _refresh(db_session, BSEHTTP(yahoo=None))
    result = _compute(db_session, monkeypatch, [_holding(scheme, "1000", nav_date=TODAY)])
    assert result.pe.ratio == 25 and result.pb.ratio == 3
    assert result.pe.coverage_pct == 80
    assert result.pe.overseas[0].instrument_name == "Overseas"
    assert not result.pe.missing
    assert any("screener.in" in note for note in result.footnotes)
    assert not any(word in " ".join(result.footnotes) for word in ("fallback", "proxy", "TRI"))


def test_nse_mapping_takes_over_a_former_bse_only_row(db_session):
    isin = "INE758T01015"
    db_session.add(StockMaster(isin=isin, name="Eternal", source="BSE", pe_ratio=Decimal("7"), pb_ratio=Decimal("2"),
                               as_of_date=date(2026, 10, 1)))
    db_session.commit()
    _refresh(db_session, FixtureHTTP())
    row = db_session.get(StockMaster, isin)
    assert row.source == "NSE" and row.pe_source == "NSE"
    assert row.pe_ratio == Decimal("720.88") and row.pb_ratio == Decimal("9.329274")
