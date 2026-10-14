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


@pytest.mark.parametrize('weight,enough',[('69.999',False),('70',True)])
def test_valuation_separate_ratio_coverage_seventy_percent_boundary(db_session,monkeypatch,weight,enough):
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
    assert result.pe.coverage_pct >= 70 and result.pb.coverage_pct >= 70
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
