import asyncio
import csv
import gzip
import io
import json
from datetime import date
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from app.models.enums import AssetType, BenchmarkIndex, BenchmarkReturnType, DisclosureBatchStatus
from app.models.reference import BenchmarkIndexHistory, DisclosureBatch, StockMaster
from tests.services.analytics.test_lookthrough import _scheme, _batch

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures/stock_fundamentals"
TODAY = date(2026, 10, 14)


class FixtureHTTP:
    def __init__(self, *, bad_yahoo=(), bad_screener=False, stale=False, pe_failure=False, index_failure=False, full=False):
        self.calls = []
        self.bad_yahoo = set(bad_yahoo)
        self.bad_screener = bad_screener
        self.stale = stale
        self.pe_failure = pe_failure
        self.index_failure = index_failure
        self.full = full
        self.crumb_count = 0

    def handler(self, request):
        self.calls.append(request)
        path = request.url.path
        if '/peDetail/' in path:
            if self.pe_failure: return httpx.Response(503)
            return httpx.Response(200, content=(FIXTURES / 'pe_121026.csv').read_bytes()) if path.endswith('PE_121026.csv') else httpx.Response(404)
        if '/content/cm/' in path:
            return httpx.Response(200, content=gzip.compress((FIXTURES / 'security_12102026.csv').read_bytes())) if '12102026' in path else httpx.Response(404)
        if path.endswith('list.csv'):
            name = 'nifty50.csv' if '50list' in path else 'nifty500.csv'
            text = (FIXTURES / name).read_text(encoding='utf-8-sig')
            if not self.full:
                rows = list(csv.DictReader(text.splitlines()))
                out = io.StringIO(); writer = csv.DictWriter(out, fieldnames=list(rows[0])); writer.writeheader()
                writer.writerows(r for r in rows if r['Symbol'] in ('ETERNAL', 'COFORGE'))
                text = out.getvalue()
            return httpx.Response(200, text=text)
        if request.url.host == 'fc.yahoo.com':
            return httpx.Response(404, headers={'set-cookie': 'fixture_cookie=yes; Path=/'})
        if request.url.host == 'finance.yahoo.com': return httpx.Response(200, text='fixture quote page')
        if path.endswith('getcrumb'):
            self.crumb_count += 1
            return httpx.Response(200, text=f'fixture-crumb-{self.crumb_count}')
        if 'quoteSummary' in path:
            symbol = path.rsplit('/', 1)[-1].removesuffix('.NS')
            if self.stale and self.crumb_count == 1 and symbol == 'ETERNAL': return httpx.Response(401)
            if symbol in self.bad_yahoo: return httpx.Response(404)
            file = FIXTURES / f'yahoo_{symbol}.json'
            if self.full and not file.exists(): return httpx.Response(404)
            return httpx.Response(200, content=(file if file.exists() else FIXTURES / 'yahoo_ETERNAL.json').read_bytes())
        if request.url.host == 'www.screener.in':
            return httpx.Response(503) if self.bad_screener else httpx.Response(200, content=(FIXTURES / 'screener_reliance.html').read_bytes())
        if 'getpepbHistoricaldataDBtoString' in path:
            if self.index_failure: return httpx.Response(503)
            info = json.loads(json.loads(request.content)['cinfo'])
            file = 'index_nifty50.json' if info['name'].upper() == 'NIFTY 50' else 'index_nifty500.json'
            return httpx.Response(200, content=(FIXTURES / file).read_bytes())
        raise AssertionError(f'Unexpected offline request: {request.url.host}{path}')


def _refresh(db, fake, **kwargs):
    from app.services.analytics.stock_fundamentals_client import refresh_stock_fundamentals
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(fake.handler), follow_redirects=True) as client:
            return await refresh_stock_fundamentals(db, today=TODAY, client=client, pace_seconds=0, **kwargs)
    return asyncio.run(run())


def test_stock_real_parsers_and_raw_symbol_pe():
    from app.services.analytics.stock_fundamentals_client import parse_pe_csv, parse_security_master, parse_constituents, parse_yahoo_pb, parse_screener_pb
    pe = parse_pe_csv(b'SYMBOL,SYMBOL P/E,ADJUSTED P/E\nTHERMAX,65.70,70.89\nLOSS,,-\nNEG,-5,4\n')
    assert pe['THERMAX'] == Decimal('65.70') and pe['LOSS'] is None and pe['NEG'] is None
    assert parse_pe_csv((FIXTURES/'pe_121026.csv').read_bytes())
    master = parse_security_master((FIXTURES/'security_12102026.csv').read_bytes())
    assert master['INE002A01018'] == 'RELIANCE'
    constituents = parse_constituents((FIXTURES/'nifty500.csv').read_bytes())
    assert constituents['INE002A01018']['sector']
    assert parse_yahoo_pb((FIXTURES/'yahoo_ETERNAL.json').read_text()) == Decimal('9.329274')
    assert parse_screener_pb((FIXTURES/'screener_reliance.html').read_text(encoding='utf-8')) > 0


def test_stock_universe_includes_failed_disclosure_and_unheld_index_stocks(db_session):
    from app.services.analytics.stock_fundamentals_client import build_isin_universe, parse_constituents
    scheme = _scheme(db_session)
    _batch(db_session, scheme, [('Outside', 'OUTSIDE', '1', AssetType.EQUITY_DOMESTIC), ('Cash', None, '1', AssetType.CASH_EQUIVALENT)], status=DisclosureBatchStatus.FAILED)
    index = parse_constituents((FIXTURES/'nifty500.csv').read_bytes())
    universe = build_isin_universe(db_session, index)
    assert 'OUTSIDE' in universe and 'INE002A01018' in universe and None not in universe


def test_stock_refresh_resolves_nse_yahoo_without_disclosure_activity(db_session):
    fake = FixtureHTTP()
    result = _refresh(db_session, fake)
    assert result.success and result.rows_written == result.universe_count == 2
    assert result.as_of_date == date(2026, 10, 12)
    assert db_session.query(DisclosureBatch).count() == 0
    rows = db_session.query(StockMaster).all()
    assert all(r.source == 'NSE' and r.pb_source == 'YAHOO' and r.pe_ratio > 0 and r.pb_ratio > 0 for r in rows)
    assert fake.crumb_count == 1
    assert not any('screener' in r.url.host for r in fake.calls)
    assert any('PE_141026.csv' in r.url.path for r in fake.calls)
    assert any('NSE_CM_security_12102026' in r.url.path for r in fake.calls)


def test_stock_absent_security_isin_is_null_without_bse_or_yahoo_attempt(db_session):
    s = _scheme(db_session)
    _batch(db_session, s, [('HDFC Ltd merged', 'INE001A01036', '10', AssetType.EQUITY_DOMESTIC)])
    fake = FixtureHTTP()
    _refresh(db_session, fake)
    row = db_session.get(StockMaster, 'INE001A01036')
    assert row.pe_ratio is None and row.pb_ratio is None
    assert 'delisted/merged' in row.footnote
    assert not any('HDFC.NS' in r.url.path or 'bseindia' in r.url.host for r in fake.calls)


@pytest.mark.parametrize('bad_screener', [False, True])
def test_stock_yahoo_fallback_is_per_failing_symbol_only(db_session, bad_screener):
    fake = FixtureHTTP(bad_yahoo=['ETERNAL'], bad_screener=bad_screener)
    _refresh(db_session, fake)
    row = next(r for r in db_session.query(StockMaster) if r.name and 'Eternal' in r.name)
    assert (row.pb_ratio is None) == bad_screener
    assert row.pb_source == (None if bad_screener else 'SCREENER')
    assert row.pe_ratio > 0
    assert bool(row.footnote)
    screener_calls = [r for r in fake.calls if 'screener' in r.url.host]
    assert len(screener_calls) == 1 and 'ETERNAL' in screener_calls[0].url.path
    assert any(r.pb_source == 'YAHOO' for r in db_session.query(StockMaster))


def test_stock_stale_crumb_rehandshakes_once_and_bad_stock_does_not_abort(db_session):
    fake = FixtureHTTP(stale=True, bad_yahoo=['COFORGE'], bad_screener=True)
    result = _refresh(db_session, fake)
    assert result.success and fake.crumb_count == 2 and result.rows_written == 2
    assert any(r.pb_source == 'YAHOO' for r in db_session.query(StockMaster))


def test_stock_failure_preserves_good_existing_row(db_session):
    db_session.add(StockMaster(isin='INE002A01018', name='Reliance', pe_ratio=Decimal(25), pb_ratio=Decimal('3.35'), as_of_date=date(2026, 10, 10), source='NSE', pb_source='YAHOO'))
    db_session.commit()
    result = _refresh(db_session, FixtureHTTP(pe_failure=True))
    assert not result.success
    row = db_session.get(StockMaster, 'INE002A01018')
    assert row.pe_ratio == 25 and row.pb_ratio == Decimal('3.35') and row.as_of_date == date(2026, 10, 10)


def test_stock_pb_failure_retains_good_pb_while_pe_refreshes(db_session):
    from app.services.analytics.stock_fundamentals_client import parse_constituents
    isin = next(k for k,v in parse_constituents((FIXTURES/'nifty500.csv').read_bytes()).items() if v['symbol']=='ETERNAL')
    db_session.add(StockMaster(isin=isin, name='Eternal', pe_ratio=Decimal(25), pb_ratio=Decimal(3), as_of_date=date(2026, 10, 10), source='NSE', pb_source='YAHOO'))
    db_session.commit()
    _refresh(db_session, FixtureHTTP(bad_yahoo=['ETERNAL'], bad_screener=True))
    row = db_session.get(StockMaster, isin)
    assert row.pb_ratio == 3 and row.pb_source == 'YAHOO' and row.as_of_date == date(2026, 10, 12)
    assert 'retained' in row.footnote


def test_stock_index_series_real_fixture_and_atomic_failures(db_session):
    from app.services.analytics.stock_fundamentals_client import refresh_index_valuations
    async def run(fake):
        async with httpx.AsyncClient(transport=httpx.MockTransport(fake.handler)) as client:
            return await refresh_index_valuations(db_session, today=TODAY, client=client, pace_seconds=0)
    assert asyncio.run(run(FixtureHTTP()))
    rows = db_session.query(BenchmarkIndexHistory).all()
    assert {r.return_type for r in rows} == {BenchmarkReturnType.PE, BenchmarkReturnType.PB}
    latest = db_session.get(BenchmarkIndexHistory, (BenchmarkIndex.NIFTY_50, date(2026, 10, 13), BenchmarkReturnType.PE))
    assert latest.value == Decimal('19.41')
    assert not asyncio.run(run(FixtureHTTP(index_failure=True)))
    assert db_session.query(BenchmarkIndexHistory).count() == len(rows)


def test_stock_max_seven_day_stepback_rejects_failed_fetch_without_overwrite(db_session):
    fake = FixtureHTTP()
    from app.services.analytics.stock_fundamentals_client import refresh_stock_fundamentals
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(fake.handler)) as client:
            return await refresh_stock_fundamentals(db_session, today=date(2026, 10, 25), client=client, pace_seconds=0)
    assert not asyncio.run(run()).success
    assert len([r for r in fake.calls if '/peDetail/' in r.url.path]) == 7


def test_stock_malformed_ratio_is_not_accepted():
    from app.services.analytics.stock_fundamentals_client import parse_yahoo_pb
    for value in ('NaN', 'Infinity', '-2', '0'):
        data = json.dumps({'quoteSummary': {'result': [{'defaultKeyStatistics': {'priceToBook': {'raw': value}}}]}})
        assert parse_yahoo_pb(data) is None


@pytest.mark.parametrize('body', [
    '{"quoteSummary":{"result":[null]}}',
    '{"quoteSummary":{"result":[{"defaultKeyStatistics":null}]}}',
    '{"quoteSummary":{"result":[{"defaultKeyStatistics":{}}]}}',
])
def test_stock_missing_or_malformed_yahoo_fields_are_a_miss(body):
    from app.services.analytics.stock_fundamentals_client import parse_yahoo_pb
    assert parse_yahoo_pb(body) is None


def test_stock_malformed_csv_rows_do_not_crash_other_symbols():
    from app.services.analytics.stock_fundamentals_client import parse_security_master,parse_pe_csv
    assert parse_security_master(b'TckrSymb,ISIN,SctySrs\nBAD\nGOOD,INE002A01018,EQ\n') == {'INE002A01018':'GOOD'}
    assert parse_pe_csv(b'SYMBOL,SYMBOL P/E,ADJUSTED P/E\n,5,5\nGOOD,20,21\n') == {'GOOD':Decimal(20)}


@pytest.mark.parametrize('isin,symbol', [('INE001A01036',None),('INE758T01015','ETERNAL')])
def test_stock_older_source_files_do_not_erase_newer_good_ratios(db_session,monkeypatch,isin,symbol):
    from app.services.analytics import stock_fundamentals_client as client
    if symbol is None:
        scheme=_scheme(db_session)
        _batch(db_session,scheme,[('Newer holding',isin,'10',AssetType.EQUITY_DOMESTIC)])
    else:
        parse=client.parse_pe_csv
        def older_loss(data):
            result=parse(data);result[symbol]=None;return result
        monkeypatch.setattr(client,'parse_pe_csv',older_loss)
    db_session.add(StockMaster(isin=isin,name='Newer good data',pe_ratio=Decimal(25),pb_ratio=Decimal(3),
        as_of_date=date(2026,10,14),source='NSE',pb_source='YAHOO'))
    db_session.commit()
    _refresh(db_session,FixtureHTTP())
    row=db_session.get(StockMaster,isin)
    assert row.pe_ratio==25
    if symbol is None: assert row.pb_ratio==3
    assert 'retained' in row.footnote and 'loss-making' not in row.footnote and 'delisted/merged' not in row.footnote
