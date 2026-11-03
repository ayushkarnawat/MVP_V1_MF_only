import asyncio
import uuid
from datetime import date
from decimal import Decimal
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest

from app.models.enums import AssetType, BenchmarkIndex, BenchmarkReturnType
from app.models.reference import BenchmarkIndexHistory, StockMaster
from tests.services.analytics.test_lookthrough import _scheme, _batch, _holding
from tests.services.analytics.test_stock_fundamentals_client import FixtureHTTP, FIXTURES, TODAY


def _stock(db, isin, pe, pb, note=None, pb_source='YAHOO'):
    row = StockMaster(isin=isin, name=isin, pe_ratio=Decimal(pe) if pe is not None else None,
        pb_ratio=Decimal(pb) if pb is not None else None, as_of_date=date(2026, 10, 12), source='NSE', pb_source=pb_source, footnote=note)
    db.add(row); db.flush(); return row


def _compute(db, monkeypatch, holdings, ids=None):
    from app.services.analytics import lookthrough
    from app.services.analytics.valuation import compute_valuation
    monkeypatch.setattr(lookthrough, 'compute_holdings', AsyncMock(return_value=holdings))
    return asyncio.run(compute_valuation(db, ids or [uuid.uuid4()]))


def test_valuation_worked_harmonic_means_equity_rescale_and_both_indices(db_session, monkeypatch):
    s = _scheme(db_session)
    _batch(db_session,s,[('A','A','24',AssetType.EQUITY_DOMESTIC),('B','B','36',AssetType.EQUITY_INTERNATIONAL),
        ('Debt','D','40',AssetType.DEBT),('Future','A','-50',AssetType.DERIVATIVE)])
    _stock(db_session,'A','20','2.68');_stock(db_session,'B','30','4.02')
    for index,pe,pb in [(BenchmarkIndex.NIFTY_50,'22.8','3.10'),(BenchmarkIndex.NIFTY_500,'24','3.2')]:
        for kind,value in [(BenchmarkReturnType.PE,pe),(BenchmarkReturnType.PB,pb)]:
            db_session.add(BenchmarkIndexHistory(index_name=index,date=date(2026,10,12),return_type=kind,value=Decimal(value)))
    # Future ratio rows and return levels must never become comparators.
    for kind in (BenchmarkReturnType.PRICE,BenchmarkReturnType.TRI,BenchmarkReturnType.PE):
        db_session.add(BenchmarkIndexHistory(index_name=BenchmarkIndex.NIFTY_50,date=date(2026,10,31),return_type=kind,value=Decimal('999')))
    db_session.flush()
    result = _compute(db_session,monkeypatch,[_holding(s,'1000')])
    assert result.pe.ratio == Decimal('25') and result.pb.ratio == Decimal('3.35')
    assert result.total_equity_value == 600 and result.pe.coverage_pct == result.pb.coverage_pct == 100
    assert len(result.indices) == 2
    fifty = next(i for i in result.indices if i.index_name == BenchmarkIndex.NIFTY_50)
    assert fifty.pe_ratio == Decimal('22.8') and fifty.pb_ratio == Decimal('3.10')
    assert fifty.pe_delta_pct.quantize(Decimal('.01')) == Decimal('9.65')


@pytest.mark.parametrize('weight,enough',[('59.999',False),('60',True)])
def test_valuation_separate_ratio_coverage_sixty_percent_boundary(db_session,monkeypatch,weight,enough):
    s = _scheme(db_session)
    _batch(db_session,s,[('Good','A',weight,AssetType.EQUITY_DOMESTIC),('Loss','B',str(100-Decimal(weight)),AssetType.EQUITY_DOMESTIC)])
    _stock(db_session,'A','25','3.35');_stock(db_session,'B',None,'3.35','Loss-making stock: negative earnings')
    result = _compute(db_session,monkeypatch,[_holding(s,'1000')])
    assert result.pe.enough_data == enough
    assert result.pe.ratio == (Decimal(25) if enough else None)
    assert result.pb.ratio == Decimal('3.35') and result.pb.enough_data
    assert result.pe.coverage_pct == Decimal(weight)
    assert result.pe.missing[0].instrument_name == 'Loss' and 'negative earnings' in result.pe.missing[0].reason


def test_valuation_hidden_headlines_null_isin_foreign_and_future_data(db_session,monkeypatch):
    a,b = [_scheme(db_session) for _ in range(2)]
    _batch(db_session,a,[('Good','A','80',AssetType.EQUITY_DOMESTIC),('Foreign','US1','10',AssetType.EQUITY_INTERNATIONAL),('No ISIN',None,'10',AssetType.EQUITY_DOMESTIC)])
    _stock(db_session,'A','25','3.35')
    future = _stock(db_session,'US1','10','2');future.as_of_date=date(2026,10,31);db_session.flush()
    result = _compute(db_session,monkeypatch,[_holding(a,'400'),_holding(b,'600')])
    assert result.hide_headlines and result.pe.enough_data and result.pe.ratio is None
    assert result.pb.ratio is None and len(result.pe.missing) == 1
    assert result.pe.coverage_pct == Decimal(90)  # a stock row dated after the NAV still counts (no ratio history exists)
    assert any('No ISIN' in m.reason for m in result.pe.missing)


def test_valuation_empty_scope_and_screener_source_note(db_session,monkeypatch):
    empty = _compute(db_session,monkeypatch,[])
    assert empty.total_equity_value == 0 and empty.pe.ratio is None and not empty.pe.enough_data
    s = _scheme(db_session);_batch(db_session,s,[('Stock','A','100',AssetType.EQUITY_DOMESTIC)])
    _stock(db_session,'A','25','3.35',pb_source='SCREENER')
    result = _compute(db_session,monkeypatch,[_holding(s,'1000')])
    assert any('screener.in' in note for note in result.footnotes)


def test_valuation_real_disclosure_and_fundamental_fixtures_offline(db_session,monkeypatch):
    from app.services.analytics.stock_fundamentals_client import refresh_stock_fundamentals,refresh_index_valuations,parse_security_master,parse_pe_csv
    from app.services.analytics.amfi_factsheet_client import build_families
    from app.services.analytics.portfolio_disclosure_parsing import parse_workbook
    from app.services.analytics.portfolio_disclosure_writer import write_disclosure_batch
    scheme = _scheme(db_session,'Motilal Oswal Mutual Fund')
    path = FIXTURES.parent/'portfolio_disclosures/motilal-oswal-yo58_asof_2026-09-30.xlsx'
    sheet = next(s for s in parse_workbook(path.read_bytes()) if s.holdings)
    write_disclosure_batch(db_session,build_families([scheme])[0],date(2026,9,30),scheme.amc_name,
        'https://example.test/fixture.xlsx',sheet.holdings,'EXACT',Decimal(1),declared_total=sheet.declared_total)
    async def refresh():
        async with httpx.AsyncClient(transport=httpx.MockTransport(FixtureHTTP(full=True,bad_screener=True).handler)) as client:
            result = await refresh_stock_fundamentals(db_session,today=TODAY,client=client,pace_seconds=0)
            assert result.success
            assert await refresh_index_valuations(db_session,today=TODAY,client=client,pace_seconds=0)
    asyncio.run(refresh())
    result = _compute(db_session,monkeypatch,[_holding(scheme,'1000')])
    assert result.pe.ratio > 0 and result.pb.ratio > 0
    assert result.pe.coverage_pct >= 60 and result.pb.coverage_pct >= 60
    stocks = [r for r in sheet.holdings if r.asset_type in (AssetType.EQUITY_DOMESTIC,AssetType.EQUITY_INTERNATIONAL)]
    master = parse_security_master((FIXTURES/'security_12102026.csv').read_bytes())
    pe = parse_pe_csv((FIXTURES/'pe_121026.csv').read_bytes())
    assert sum(r.isin in master for r in stocks) == 27
    assert sum(pe.get(master.get(r.isin)) is not None for r in stocks) == 22
    print('REAL_VALUATION',sheet.scheme_title,result.pe.ratio,result.pb.ratio,result.pe.coverage_pct,result.pb.coverage_pct)


def test_valuation_shares_session_table_memo_and_wraps(db_session,monkeypatch):
    from app.services.analytics import lookthrough
    from app.services.analytics.valuation import compute_valuation
    from app.services.analytics.recompute import _SECTIONS
    s = _scheme(db_session);_batch(db_session,s,[('Stock','A','100',AssetType.EQUITY_DOMESTIC)]);_stock(db_session,'A','25','3.35')
    spy=AsyncMock(return_value=[_holding(s,'1000')]);monkeypatch.setattr(lookthrough,'compute_holdings',spy)
    ids=[uuid.uuid4()]
    async def run():
        await lookthrough.compute_stock_holdings(db_session,ids);db_session.commit()
        return await compute_valuation(db_session,ids)
    result=asyncio.run(run());assert spy.await_count==1
    spec=next(s for s in _SECTIONS if s.name=='valuation')
    assert spec.wrap_combined([],result).model_dump(mode='json') == {'members':[],'valuation':result.model_dump(mode='json')}


# T2.3: per-fund ratios and fund-value weighting, with hand-worked goldens.
def _reported(db, scheme, metric, value, period=date(2026, 10, 1), basis="trailing", method="harmonic"):
    from app.models.reference import SchemeReportedValuation
    row = SchemeReportedValuation(scheme_id=scheme.id, metric=metric, value=Decimal(value),
        reference_period=period, basis=basis, method=method, source_file="synthetic.pdf", page=1)
    db.add(row); db.flush(); return row


def test_fund_with_full_coverage_equals_hand_worked_harmonic_value(db_session, monkeypatch):
    scheme = _scheme(db_session)
    _batch(db_session, scheme, [("A", "A", "60", AssetType.EQUITY_DOMESTIC),
                               ("B", "B", "40", AssetType.EQUITY_DOMESTIC)])
    _stock(db_session, "A", "10", "2"); _stock(db_session, "B", "20", "4")
    result = _compute(db_session, monkeypatch, [_holding(scheme, "1000")])
    fund, = result.funds
    # P/E = 1000 / (600/10 + 400/20) = 12.5; P/B = 1000/(600/2+400/4) = 2.5.
    assert fund.scheme_id == scheme.id and fund.scheme_name == scheme.name
    assert Decimal(fund.pe.value) == Decimal("12.5")
    assert Decimal(fund.pb.value) == Decimal("2.5")
    assert (fund.pe.source, fund.pe.basis, fund.pe.method) == ("computed", "trailing", "harmonic")
    assert Decimal(fund.pe.coverage_pct) == 100
    assert fund.pe.as_of == date(2026, 10, 12)
    assert result.model_dump(mode="json")["funds"][0]["pe"]["value"] == fund.pe.value


def test_fund_below_60_percent_coverage_shows_no_value_and_a_reason(db_session, monkeypatch):
    scheme = _scheme(db_session)
    _batch(db_session, scheme, [("Known", "A", "59", AssetType.EQUITY_DOMESTIC),
                               ("Unknown", "B", "41", AssetType.EQUITY_DOMESTIC)])
    _stock(db_session, "A", "10", "2")
    result = _compute(db_session, monkeypatch, [_holding(scheme, "1000")])
    pe = result.funds[0].pe
    assert pe.value is None and pe.source == "none"
    assert Decimal(pe.coverage_pct) == 59
    assert "60%" in pe.reason
    assert all(word not in pe.reason.lower() for word in ("fallback", "proxy", "excluded: no data"))


@pytest.mark.parametrize("earnings_ratio", ["-5", "0"])
def test_loss_making_stock_is_excluded_and_named(db_session, monkeypatch, earnings_ratio):
    scheme = _scheme(db_session)
    _batch(db_session, scheme, [("Known", "A", "80", AssetType.EQUITY_DOMESTIC),
                               ("Loss Company", "LOSS", "20", AssetType.EQUITY_DOMESTIC)])
    _stock(db_session, "A", "10", "2"); _stock(db_session, "LOSS", earnings_ratio, "4")
    result = _compute(db_session, monkeypatch, [_holding(scheme, "1000")])
    assert Decimal(result.funds[0].pe.value) == 10
    assert "Loss Company" in result.funds[0].pe.reason
    assert result.pe.missing[0].instrument_name == "Loss Company"
    assert "earnings" in result.pe.missing[0].reason


def test_factsheet_value_older_than_75_days_falls_back_to_computed(db_session):
    from datetime import timedelta
    from app.services.analytics.schemas import ValuationValue
    from app.services.analytics.valuation import resolve_fund_ratio
    computed = ValuationValue(value="12.5", source="computed", as_of=date(2026, 10, 12),
                              basis="trailing", method="harmonic", coverage_pct="100", reason=None)
    scheme = _scheme(db_session)
    reading = _reported(db_session, scheme, "pe", "33", period=date(2026, 8, 1))
    assert resolve_fund_ratio(reading, computed, date(2026, 8, 1) + timedelta(days=76)) == computed
    assert resolve_fund_ratio(reading, computed, date(2026, 8, 1) + timedelta(days=75)).source == "factsheet"
    assert resolve_fund_ratio(reading, computed, date(2026, 7, 31)) == computed


def test_forward_factsheet_pe_shows_basis_forward_in_the_fund_row_but_trailing_in_the_portfolio_total(db_session, monkeypatch):
    scheme = _scheme(db_session)
    _batch(db_session, scheme, [("Known", "A", "100", AssetType.EQUITY_DOMESTIC)])
    _stock(db_session, "A", "10", "2")
    _reported(db_session, scheme, "pe", "40", basis="forward", method="weighted_average")
    result = _compute(db_session, monkeypatch, [_holding(scheme, "1000")])
    assert result.funds[0].pe.value == "40.0000"
    assert result.funds[0].pe.source == "factsheet" and result.funds[0].pe.basis == "forward"
    assert result.pe.ratio == 10


def test_pe_from_factsheet_with_pb_computed_in_one_row(db_session, monkeypatch):
    scheme = _scheme(db_session)
    _batch(db_session, scheme, [("Known", "A", "100", AssetType.EQUITY_DOMESTIC)])
    _stock(db_session, "A", "10", "2")
    _reported(db_session, scheme, "pe", "30", period=date(2026, 9, 1))
    _reported(db_session, scheme, "pe", "35", period=date(2026, 10, 1))
    _reported(db_session, scheme, "pe", "99", period=date(2026, 11, 1))
    result = _compute(db_session, monkeypatch, [_holding(scheme, "1000")])
    fund, = result.funds
    assert (fund.pe.value, fund.pe.source, fund.pe.as_of) == ("35.0000", "factsheet", date(2026, 10, 1))
    assert (Decimal(fund.pb.value), fund.pb.source, fund.pb.basis) == (Decimal(2), "computed", "trailing")


def test_portfolio_ratio_equals_the_harmonic_mean_of_fund_figures(db_session, monkeypatch):
    a, b = _scheme(db_session), _scheme(db_session)
    _batch(db_session, a, [("A", "A", "100", AssetType.EQUITY_DOMESTIC)])
    _batch(db_session, b, [("B", "B", "50", AssetType.EQUITY_DOMESTIC),
                         ("Debt", "D", "50", AssetType.DEBT)])
    _stock(db_session, "A", "10", "2"); _stock(db_session, "B", "20", "4")
    result = _compute(db_session, monkeypatch, [_holding(a, "1000"), _holding(b, "3000")])
    # Each fund has full equity-ratio coverage. Weights are each fund's EQUITY rupees (owner decision
    # 31 Oct): 1000 and 1500 (fund B is half debt). P/E = 2500/(1000/10+1500/20) = 14.285714,
    # P/B = 2500/(1000/2+1500/4) = 2.857143. Whole-fund weights 1000:3000 would give 16 and 3.2.
    assert result.pe.ratio == Decimal("14.285714") and result.pb.ratio == Decimal("2.857143")
    assert {Decimal(f.pe.value) for f in result.funds} == {Decimal(10), Decimal(20)}


def test_overseas_holdings_are_counted_separately_not_missing(db_session, monkeypatch):
    scheme = _scheme(db_session)
    _batch(db_session, scheme, [("Known", "A", "80", AssetType.EQUITY_DOMESTIC),
                               ("Overseas Company", "US1", "20", AssetType.EQUITY_INTERNATIONAL)])
    _stock(db_session, "A", "10", "2")
    result = _compute(db_session, monkeypatch, [_holding(scheme, "1000")])
    assert not result.pe.missing and not result.pb.missing
    assert [s.instrument_name for s in result.pe.overseas] == ["Overseas Company"]
    assert sum(s.exposure_value for s in result.pe.overseas) == 200
    assert result.pe.coverage_pct == 80 and Decimal(result.funds[0].pe.coverage_pct) == 80


def test_old_stored_valuation_defaults_to_no_fund_rows(db_session, monkeypatch):
    from app.services.analytics.schemas import ValuationSummary
    payload = _compute(db_session, monkeypatch, []).model_dump(mode="json")
    payload.pop("funds", None)
    restored = ValuationSummary.model_validate(payload)
    assert restored.funds == []



@pytest.mark.parametrize("available_weight,shown", [("59.999", False), ("60", True)])
def test_portfolio_fund_figure_coverage_sixty_percent_boundary(db_session, monkeypatch, available_weight, shown):
    a, b = _scheme(db_session), _scheme(db_session)
    _batch(db_session, a, [("No stock ratio A", "A", "100", AssetType.EQUITY_DOMESTIC)])
    _batch(db_session, b, [("No stock ratio B", "B", "100", AssetType.EQUITY_DOMESTIC)])
    _reported(db_session, a, "pe", "30")
    result = _compute(db_session, monkeypatch,
                      [_holding(a, available_weight), _holding(b, str(100 - Decimal(available_weight)))])
    # Owner decision: fresh factsheets count even with no usable stock ratios.
    # Equity exposures are the fund values here. Only A has a usable P/E.
    assert result.pe.coverage_pct == 0 and not result.pe.enough_data
    assert result.pe.fund_coverage_pct == Decimal(available_weight)
    assert result.funds[0].pe.source == "factsheet"
    assert result.pe.ratio == (Decimal(30) if shown else None)
    assert result.pe.reason == (None if shown else "We could not get a P/E for enough of your funds yet.")
    assert result.pb.ratio is None and result.pb.fund_coverage_pct == 0


def test_forward_figure_without_computed_trailing_does_not_count_toward_portfolio_coverage(db_session, monkeypatch):
    scheme = _scheme(db_session)
    _batch(db_session, scheme, [("No earnings ratio", "A", "100", AssetType.EQUITY_DOMESTIC)])
    _reported(db_session, scheme, "pe", "30", basis="forward")
    result = _compute(db_session, monkeypatch, [_holding(scheme, "1000")])
    assert result.funds[0].pe.source == "factsheet" and result.funds[0].pe.basis == "forward"
    assert result.pe.ratio is None and result.pe.fund_coverage_pct == 0
    assert result.pe.reason == "We could not get a P/E for enough of your funds yet."
