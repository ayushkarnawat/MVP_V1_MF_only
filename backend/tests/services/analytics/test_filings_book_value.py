"""T2.12 Step B: book value per share from NSE Integrated Filing XBRL. No network: fixtures and fakes only.

The four XML files in tests/fixtures/filings are trimmed copies of real NSE files (all dated 30-SEP-2026):
TCS (non-bank, Ind AS), HDFC Bank (bank layout), Bajaj Finance (finance company), SBI Life (life insurer).
"""
import asyncio
import logging
import re
from datetime import date
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest

from app.models.enums import AssetType, TransactionType
from app.models.reference import StockMaster
from app.services.analytics import filings_book_value as fbv
from app.services.analytics.filings_book_value import (
    BASIS_CONSOLIDATED, BASIS_STANDALONE, FILING_SOURCE_LABEL, FilingDataError, FilingRow, FilingSourceError,
    NseAccessBlocked, NseFilingsClient, StoredBookValue, filing_pb_ratio, parse_book_value, parse_filing_rows,
    refresh_decision, refresh_filings_book_values, select_filing,
)

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures/filings"
SEP_30 = date(2026, 9, 30)
MAR_31 = date(2026, 3, 31)
TODAY = date(2026, 11, 3)


def _xml(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


TCS, HDFC, BAJAJ, SBILIFE = (_xml(n) for n in (
    "TCS_30-SEP-2026_Consolidated.xml", "HDFCBANK_30-SEP-2026_Consolidated.xml",
    "BAJFINANCE_30-SEP-2026_Consolidated.xml", "SBILIFE_30-SEP-2026_Standalone.xml"))


def _drop(xml: bytes, tag: str) -> bytes:
    return re.sub(rb"<in-capmkt:" + tag.encode() + rb"[ >].*?</in-capmkt:" + tag.encode() + rb">", b"", xml)


def _replace_fact(xml: bytes, tag: str, old: str, new: str) -> bytes:
    pattern = re.compile(rb"(<in-capmkt:" + tag.encode() + rb"[^>]*>)" + re.escape(old.encode()) + rb"(</in-capmkt:" + tag.encode() + rb">)")
    assert pattern.search(xml), tag
    return pattern.sub(rb"\g<1>" + new.encode() + rb"\g<2>", xml)


# ------------------------------------------------------------------------------------------ real-file parsing

def test_fixtures_are_small_and_valid():
    for path in FIXTURES.glob("*.xml"):
        assert path.stat().st_size < 60_000


def test_tcs_non_bank_owners_equity_over_shares():
    result = parse_book_value(TCS, balance_sheet_date=SEP_30)
    assert result.method == "owners_equity"
    assert result.shares == Decimal("3620000000")
    assert result.equity == Decimal("1189860000000")
    assert abs(result.book_value_per_share - Decimal("328.69")) < Decimal("0.01")


def test_hdfc_bank_capital_plus_reserves_over_shares():
    result = parse_book_value(HDFC, balance_sheet_date=SEP_30)
    assert result.method == "bank_capital_plus_reserves"
    assert result.equity == Decimal("15418600000") + Decimal("6019271900000")
    assert abs(result.book_value_per_share - Decimal("391.39")) < Decimal("0.01")


def test_finance_company_uses_the_non_bank_layout():
    result = parse_book_value(BAJAJ, balance_sheet_date=SEP_30)
    assert result.method == "owners_equity"       # owners' share only: the minority interest is left out
    assert result.equity == Decimal("1231797500000") and result.equity < Decimal("1263652600000")
    assert abs(result.book_value_per_share - Decimal("197.91")) < Decimal("0.01")


def test_life_insurer_fails_closed_no_face_value_or_share_count_in_the_file():
    """SBI Life's file has share capital and reserves but no face value or number of shares: no value, never a guess."""
    with pytest.raises(FilingDataError):
        parse_book_value(SBILIFE, balance_sheet_date=SEP_30, standalone=True)
    with pytest.raises(FilingDataError):
        parse_book_value(SBILIFE, balance_sheet_date=SEP_30, standalone=False)


def test_a_different_balance_sheet_date_finds_no_context_and_never_guesses():
    with pytest.raises(FilingDataError):
        parse_book_value(TCS, balance_sheet_date=MAR_31)       # the file also has a 31 Mar instant context, but no equity in it


# ------------------------------------------------------------------------------------------ fail-closed rules

@pytest.mark.parametrize("old,new", [("1189860000000", "-5"), ("1189860000000", "0")])
def test_non_positive_equity_is_rejected(old, new):
    with pytest.raises(FilingDataError):
        parse_book_value(_replace_fact(TCS, "EquityAttributableToOwnersOfParent", old, new), balance_sheet_date=SEP_30)


@pytest.mark.parametrize("tag,value", [("PaidUpValueOfEquityShareCapital", "0"), ("PaidUpValueOfEquityShareCapital", "-3620000000"),
                                       ("FaceValueOfEquityShareCapital", "0"), ("FaceValueOfEquityShareCapital", "-1")])
def test_non_positive_share_count_inputs_are_rejected(tag, value):
    old = "3620000000" if tag.startswith("PaidUp") else "1"
    with pytest.raises(FilingDataError):
        parse_book_value(_replace_fact(TCS, tag, old, value), balance_sheet_date=SEP_30)


@pytest.mark.parametrize("tag", ["EquityAttributableToOwnersOfParent", "PaidUpValueOfEquityShareCapital", "FaceValueOfEquityShareCapital"])
def test_a_missing_fact_gives_no_value_not_zero(tag):
    with pytest.raises(FilingDataError):
        parse_book_value(_drop(TCS, tag), balance_sheet_date=SEP_30)


def test_bank_without_reserves_gives_no_value():
    with pytest.raises(FilingDataError):
        parse_book_value(_drop(HDFC, "ReservesAndSurplus"), balance_sheet_date=SEP_30)


def test_bank_capital_that_disagrees_with_paid_up_capital_is_rejected():
    with pytest.raises(FilingDataError):
        parse_book_value(_replace_fact(HDFC, "Capital", "15418600000", "15000000000"), balance_sheet_date=SEP_30)


def test_two_different_values_for_the_same_fact_at_the_same_date_are_ambiguous():
    changed = _replace_fact(TCS, "PaidUpValueOfEquityShareCapital", "3620000000", "3600000000")
    # the first replacement hits both the quarter and the half-year contexts; make only one differ
    first = changed.replace(b"3600000000", b"3620000000", 1)
    with pytest.raises(FilingDataError, match="ambiguous"):
        parse_book_value(first, balance_sheet_date=SEP_30)


def test_share_count_rounded_too_coarsely_is_rejected():
    coarse = TCS.replace(b'decimals="-7" unitRef="INR">3620000000</in-capmkt:PaidUpValueOfEquityShareCapital>',
                         b'decimals="-9" unitRef="INR">3620000000</in-capmkt:PaidUpValueOfEquityShareCapital>')
    assert coarse != TCS
    with pytest.raises(FilingDataError, match="too_coarse"):
        parse_book_value(coarse, balance_sheet_date=SEP_30)


def test_wrong_unit_is_rejected():
    wrong = TCS.replace(b'unitRef="INR">1189860000000<', b'unitRef="INRPerShare">1189860000000<')
    assert wrong != TCS
    with pytest.raises(FilingDataError, match="unit"):
        parse_book_value(wrong, balance_sheet_date=SEP_30)


def test_standalone_filing_without_the_owners_fact_uses_total_equity_but_consolidated_does_not():
    no_owners = _drop(TCS, "EquityAttributableToOwnersOfParent")
    result = parse_book_value(no_owners, balance_sheet_date=SEP_30, standalone=True)
    assert result.method == "total_equity_standalone"
    assert abs(result.book_value_per_share - Decimal("331.48")) < Decimal("0.01")
    with pytest.raises(FilingDataError):
        parse_book_value(no_owners, balance_sheet_date=SEP_30, standalone=False)


@pytest.mark.parametrize("payload", [b"", b"<html>blocked</html>", b"not xml at all", b'<?xml version="1.0"?><other/>'])
def test_not_an_xbrl_file_is_rejected(payload):
    with pytest.raises(FilingDataError):
        parse_book_value(payload, balance_sheet_date=SEP_30)


def test_entity_declarations_are_refused():
    evil = b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]>' + TCS.split(b"?>", 1)[1]
    with pytest.raises(FilingDataError, match="dtd"):
        parse_book_value(evil, balance_sheet_date=SEP_30)


def test_dimensioned_contexts_are_never_used():
    """The same fact inside a dimensioned context (a breakdown) must not be read as the company total."""
    only_dimensioned = TCS.replace(b'<xbrli:context id="OneI">', b'<xbrli:context id="OneI"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier>'
                                   b'</xbrli:entity><xbrli:period><xbrli:instant>2026-09-30</xbrli:instant></xbrli:period><xbrli:scenario>'
                                   b'<xbrldi:explicitMember dimension="a:Axis">a:Member</xbrldi:explicitMember></xbrli:scenario></xbrli:context>'
                                   b'<xbrli:context id="OneI_plain">', 1)
    assert only_dimensioned != TCS
    with pytest.raises(FilingDataError):
        parse_book_value(only_dimensioned, balance_sheet_date=SEP_30)


# ------------------------------------------------------------------------------------------ list rows and selection

def _list_row(qe, basis="Consolidated", xbrl="auto", audited="Un-Audited"):
    if xbrl == "auto":
        xbrl = f"https://nsearchives.nseindia.com/corporate/xbrl/{qe}_{basis}.xml"
    return {"qe_Date": qe, "consolidated": basis, "audited": audited, "xbrl": xbrl, "pdf_attach": "x.pdf"}


def test_select_newest_march_or_september_row_with_an_xbrl_ignoring_quarters():
    rows = parse_filing_rows([
        _list_row("30-JUN-2026"), _list_row("31-DEC-2025"),          # no balance sheet in these
        _list_row("30-SEP-2026", xbrl=None),                         # newest half-year but no xbrl file
        _list_row("31-MAR-2026"), _list_row("30-SEP-2025"),
    ])
    chosen = select_filing(rows, today=TODAY)
    assert chosen.qe_date == MAR_31 and chosen.consolidated


def test_consolidated_is_preferred_on_the_same_date_and_a_newer_date_still_wins():
    both = parse_filing_rows([_list_row("30-SEP-2026", "Standalone"), _list_row("30-SEP-2026", "Consolidated")])
    assert select_filing(both, today=TODAY).consolidated
    mixed = parse_filing_rows([_list_row("30-SEP-2026", "Standalone"), _list_row("31-MAR-2026", "Consolidated")])
    chosen = select_filing(mixed, today=TODAY)
    assert chosen.qe_date == SEP_30 and not chosen.consolidated


def test_select_is_deterministic_when_the_list_order_changes():
    a = _list_row("30-SEP-2026", xbrl="https://nsearchives.nseindia.com/x/a.xml")
    b = _list_row("30-SEP-2026", xbrl="https://nsearchives.nseindia.com/x/b.xml")
    assert select_filing(parse_filing_rows([a, b]), today=TODAY) == select_filing(parse_filing_rows([b, a]), today=TODAY)


def test_rows_that_cannot_be_read_completely_are_ignored():
    rows = parse_filing_rows({"data": [
        _list_row("30-SEP-2026", xbrl="http://nsearchives.nseindia.com/a.xml"),          # not https
        _list_row("30-SEP-2026", xbrl="https://evil.example.com/a.xml"),                # not an NSE host
        _list_row("not a date"), _list_row("30-SEP-2026", basis="Other"), "junk", None,
        _list_row("30-SEP-2026"),
    ]})
    assert len(rows) == 1


def test_a_future_filing_or_a_very_old_latest_filing_gives_no_row():
    assert select_filing(parse_filing_rows([_list_row("30-SEP-2026")]), today=date(2026, 9, 1)) is None
    assert select_filing(parse_filing_rows([_list_row("31-MAR-2024")]), today=TODAY) is None
    assert select_filing([], today=TODAY) is None


def _stored(when=MAR_31, ref="https://nsearchives.nseindia.com/old.xml", basis=BASIS_CONSOLIDATED, value="100"):
    return StoredBookValue(Decimal(value), when, ref, basis)


def test_refresh_only_for_a_newer_or_revised_filing():
    new = FilingRow(SEP_30, True, "https://nsearchives.nseindia.com/new.xml")
    assert refresh_decision(None, new) == "refresh"
    assert refresh_decision(_stored(), new) == "refresh"                                              # newer balance sheet
    assert refresh_decision(_stored(SEP_30, ref=new.xbrl_url), new) == "unchanged"                    # same file
    assert refresh_decision(_stored(SEP_30, ref="https://nsearchives.nseindia.com/other.xml"), new) == "refresh"   # revised filing
    assert refresh_decision(_stored(date(2026, 9, 30)), FilingRow(MAR_31, True, "https://nsearchives.nseindia.com/z.xml")) == "unchanged"  # older
    assert refresh_decision(_stored(MAR_31, basis=BASIS_STANDALONE), FilingRow(MAR_31, True, "https://nsearchives.nseindia.com/c.xml")) == "refresh"


def test_a_newer_standalone_filing_never_replaces_a_stored_consolidated_value():
    standalone = FilingRow(SEP_30, False, "https://nsearchives.nseindia.com/s.xml")
    assert refresh_decision(_stored(), standalone) == "basis_downgrade"


# ------------------------------------------------------------------------------------------ the HTTP client (mock transport)

class Clock:
    def __init__(self):
        self.now = 0.0

    def monotonic(self):
        return self.now

    async def sleep(self, seconds):
        self.now += seconds


def _client(handler, clock=None, **kwargs):
    clock = clock or Clock()
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler), follow_redirects=False)
    return NseFilingsClient(http, sleep=clock.sleep, monotonic=clock.monotonic, **kwargs), clock


def test_client_handshake_then_list_with_cookie_and_the_exact_query():
    seen = []

    def handler(request):
        seen.append(request)
        if request.url.path == "/companies-listing/corporate-integrated-filing":
            return httpx.Response(200, text="<html/>", headers={"set-cookie": "nsit=abc; Path=/"})
        return httpx.Response(200, json=[_list_row("30-SEP-2026")])

    client, _ = _client(handler)
    asyncio.run(client.handshake())
    rows = asyncio.run(client.list_filings("TCS"))
    assert len(rows) == 1 and rows[0].qe_date == SEP_30
    assert str(seen[0].url) == "https://www.nseindia.com/companies-listing/corporate-integrated-filing"
    assert seen[1].url.path == "/api/integrated-filing-results"
    assert dict(seen[1].url.params) == {"index": "equities", "symbol": "TCS", "type": "Integrated Filing- Financials"}
    assert "nsit=abc" in seen[1].headers.get("cookie", "")


def test_client_keeps_two_seconds_between_requests():
    clock = Clock()
    starts = []

    def handler(request):
        starts.append(clock.now)
        clock.now += 0.3          # a request takes a little time
        return httpx.Response(200, json=[]) if "api" in request.url.path else httpx.Response(200, text="x")

    client, _ = _client(handler, clock)

    async def go():
        await client.handshake()
        for symbol in ("A", "B", "C"):
            await client.list_filings(symbol)

    asyncio.run(go())
    gaps = [b - a for a, b in zip(starts, starts[1:])]
    assert len(starts) == 4 and all(gap >= 2.0 for gap in gaps)


@pytest.mark.parametrize("status", [401, 403, 429])
def test_client_blocked_statuses_raise_the_stop_signal_without_a_retry(status):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(status)

    client, _ = _client(handler)
    with pytest.raises(NseAccessBlocked) as exc:
        asyncio.run(client.list_filings("TCS"))
    assert exc.value.status == status and len(calls) == 1


@pytest.mark.parametrize("response", [httpx.Response(500), httpx.Response(302, headers={"location": "https://x.example/"}),
                                      httpx.Response(200, text="<html>not json</html>")])
def test_client_other_failures_are_source_errors_with_no_retry_and_no_redirect(response):
    calls = []

    def handler(request):
        calls.append(request)
        return response

    client, _ = _client(handler)
    with pytest.raises(FilingSourceError):
        asyncio.run(client.list_filings("TCS"))
    assert len(calls) == 1


def test_client_network_error_is_a_source_error():
    def handler(request):
        raise httpx.ConnectTimeout("slow")

    client, _ = _client(handler)
    with pytest.raises(FilingSourceError):
        asyncio.run(client.list_filings("TCS"))


def test_client_refuses_a_non_nse_xbrl_address_without_any_request():
    calls = []
    client, _ = _client(lambda r: calls.append(r) or httpx.Response(200))
    with pytest.raises(FilingDataError):
        asyncio.run(client.fetch_xbrl("https://evil.example.com/a.xml"))
    assert calls == []


def test_client_caps_the_download_size(monkeypatch):
    monkeypatch.setattr(fbv, "MAX_XBRL_BYTES", 100)
    client, _ = _client(lambda r: httpx.Response(200, content=b"x" * 500))
    with pytest.raises(FilingSourceError):
        asyncio.run(client.fetch_xbrl("https://nsearchives.nseindia.com/a.xml"))


# ------------------------------------------------------------------------------------------ the run

class FakeStore:
    def __init__(self, initial=None):
        self.values = dict(initial or {})
        self.saves, self.commits = [], 0

    def stored(self, isin):
        return self.values.get(isin)

    def save(self, isin, value):
        self.values[isin] = value
        self.saves.append(isin)

    async def commit(self):
        self.commits += 1


class FakeSource:
    def __init__(self, lists, files, *, handshake_error=None):
        self.lists, self.files, self.handshake_error = lists, files, handshake_error
        self.list_calls, self.fetch_calls, self.handshakes = [], [], 0

    async def handshake(self):
        self.handshakes += 1
        if self.handshake_error:
            raise self.handshake_error

    async def list_filings(self, symbol):
        self.list_calls.append(symbol)
        outcome = self.lists[symbol]
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    async def fetch_xbrl(self, url):
        self.fetch_calls.append(url)
        outcome = self.files[url]
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def _filing(symbol, qe=SEP_30, basis=True):
    return FilingRow(qe, basis, f"https://nsearchives.nseindia.com/{symbol}/{qe.isoformat()}.xml")


def _run(store, targets, source, today=TODAY):
    return asyncio.run(refresh_filings_book_values(store, targets, source, today=today))


def test_run_stores_book_value_with_filing_date_ref_and_basis():
    filing = _filing("TCS")
    store, source = FakeStore(), FakeSource({"TCS": [filing]}, {filing.xbrl_url: TCS})
    result = _run(store, [("INE467B01029", "TCS")], source)
    assert result.success and result.updated == 1 and source.handshakes == 1
    stored = store.values["INE467B01029"]
    assert abs(stored.book_value_per_share - Decimal("328.69")) < Decimal("0.01")
    assert (stored.balance_sheet_date, stored.filing_ref, stored.basis) == (SEP_30, filing.xbrl_url, BASIS_CONSOLIDATED)
    assert store.commits == 1


def test_the_same_filing_is_not_downloaded_again_and_a_newer_one_replaces_it():
    old, new = _filing("TCS", MAR_31), _filing("TCS", SEP_30)
    store = FakeStore()
    first = FakeSource({"TCS": [old]}, {old.xbrl_url: TCS.replace(b"2026-09-30", b"2026-03-31")})
    # the same file read as a March balance sheet: dates inside the fixture shifted so the March context exists
    assert _run(store, [("I1", "TCS")], first).updated == 1
    assert store.values["I1"].balance_sheet_date == MAR_31

    again = FakeSource({"TCS": [old]}, {})
    result = _run(store, [("I1", "TCS")], again)
    assert result.unchanged == 1 and result.updated == 0 and again.fetch_calls == [] and again.list_calls == ["TCS"]

    newer = FakeSource({"TCS": [new, old]}, {new.xbrl_url: TCS})
    result = _run(store, [("I1", "TCS")], newer)
    assert result.updated == 1 and newer.fetch_calls == [new.xbrl_url]
    assert store.values["I1"].balance_sheet_date == SEP_30 and store.values["I1"].filing_ref == new.xbrl_url


def test_blocked_mid_run_stops_everything_keeps_stored_values_and_raises_the_alert(caplog):
    caplog.set_level(logging.INFO)
    a, b, c = _filing("AAA"), _filing("BBB"), _filing("CCC")
    kept = StoredBookValue(Decimal("50"), MAR_31, "https://nsearchives.nseindia.com/keep.xml", BASIS_CONSOLIDATED)
    store = FakeStore({"IC": kept})
    source = FakeSource({"AAA": [a], "BBB": NseAccessBlocked(403), "CCC": [c]}, {a.xbrl_url: TCS, c.xbrl_url: TCS})
    result = _run(store, [("IA", "AAA"), ("IB", "BBB"), ("IC", "CCC")], source)
    assert not result.success and result.stopped == "blocked_403"
    assert source.list_calls == ["AAA", "BBB"]                    # CCC was never asked
    assert store.values["IC"] == kept                              # untouched
    assert "IA" in store.values and "IB" not in store.values       # what was already read stays
    assert "FILINGS_BOOK_VALUE_ALERT blocked status=403" in caplog.text


@pytest.mark.parametrize("status", [401, 403, 429])
def test_blocked_on_the_cookie_handshake_stops_before_any_stock(status, caplog):
    source = FakeSource({}, {}, handshake_error=NseAccessBlocked(status))
    result = _run(FakeStore(), [("I1", "TCS")], source)
    assert not result.success and result.stopped == f"blocked_{status}" and source.list_calls == []
    assert f"status={status}" in caplog.text


def test_blocked_while_downloading_a_file_also_stops_the_run():
    a, b = _filing("AAA"), _filing("BBB")
    source = FakeSource({"AAA": [a], "BBB": [b]}, {a.xbrl_url: NseAccessBlocked(429), b.xbrl_url: TCS})
    result = _run(FakeStore(), [("IA", "AAA"), ("IB", "BBB")], source)
    assert result.stopped == "blocked_429" and source.list_calls == ["AAA"]


def test_one_bad_stock_never_stops_the_others_and_never_stores_a_zero(caplog):
    caplog.set_level(logging.INFO)
    ok, insurer, junk = _filing("GOOD"), _filing("SBILIFE"), _filing("JUNK")
    source = FakeSource(
        {"BAJFINANCE": [_filing("BAJFINANCE")], "GOOD": [ok], "SBILIFE": [insurer], "JUNK": [junk], "NOFILING": [], "ODD": RuntimeError("boom")},
        {ok.xbrl_url: HDFC, insurer.xbrl_url: SBILIFE, junk.xbrl_url: b"<html>oops</html>", _filing("BAJFINANCE").xbrl_url: BAJAJ})
    store = FakeStore()
    targets = [("I1", "BAJFINANCE"), ("I2", "GOOD"), ("I3", "SBILIFE"), ("I4", "JUNK"), ("I5", "NOFILING"), ("I6", "ODD")]
    result = _run(store, targets, source)
    assert result.success and result.updated == 2 and result.skipped == 4
    assert set(store.values) == {"I1", "I2"}
    assert all(v.book_value_per_share > 0 for v in store.values.values())
    skip_lines = [r.getMessage() for r in caplog.records if "FILINGS_BOOK_VALUE_SKIP" in r.getMessage()]
    assert len(skip_lines) == 4 and all(re.fullmatch(r"FILINGS_BOOK_VALUE_SKIP symbol=[A-Z]+ (reason|error)=[A-Za-z_0-9]+", line) for line in skip_lines)
    assert "FILINGS_BOOK_VALUE_ALERT many_stocks_skipped" in caplog.text   # 4 of 6 skipped is more than a fifth


def test_a_few_skips_do_not_raise_the_alert(caplog):
    caplog.set_level(logging.INFO)
    lists = {f"S{i}": [_filing(f"S{i}")] for i in range(10)}
    files = {f.xbrl_url: TCS for rows in lists.values() for f in rows}
    lists["S0"] = []
    result = _run(FakeStore(), [(f"I{i}", f"S{i}") for i in range(10)], FakeSource(lists, files))
    assert result.success and result.skipped == 1 and "ALERT" not in caplog.text


def test_repeated_request_failures_stop_the_run_as_an_outage(caplog):
    lists = {f"S{i}": FilingSourceError("status_500") for i in range(8)}
    source = FakeSource(lists, {})
    result = _run(FakeStore(), [(f"I{i}", f"S{i}") for i in range(8)], source)
    assert not result.success and result.stopped == "source_unusable"
    assert len(source.list_calls) == fbv.MAX_CONSECUTIVE_SOURCE_FAULTS
    assert "FILINGS_BOOK_VALUE_ALERT source_unusable" in caplog.text


def test_a_stock_with_bad_data_between_request_failures_resets_the_outage_count():
    lists = {f"S{i}": FilingSourceError("status_500") for i in range(6)}
    lists["S2"] = []        # an answer arrives: the source is alive
    result = _run(FakeStore(), [(f"I{i}", f"S{i}") for i in range(6)], FakeSource(lists, {}))
    assert result.success


def test_run_over_the_real_client_keeps_two_seconds_between_every_request():
    clock = Clock()
    starts = []
    filing = {s: _filing(s) for s in ("AAA", "BBB", "CCC")}

    def handler(request):
        starts.append(clock.now)
        path = request.url.path
        if path == "/companies-listing/corporate-integrated-filing":
            return httpx.Response(200, text="ok")
        if path == "/api/integrated-filing-results":
            symbol = request.url.params["symbol"]
            return httpx.Response(200, json=[_list_row(filing[symbol].qe_date.strftime("%d-%b-%Y").upper(), xbrl=filing[symbol].xbrl_url)])
        return httpx.Response(200, content=TCS)

    client, _ = _client(handler, clock)
    result = _run(FakeStore(), [("I1", "AAA"), ("I2", "BBB"), ("I3", "CCC")], client)
    assert result.success and result.updated == 3
    assert len(starts) == 1 + 3 + 3          # one cookie request, a list call and a download per stock
    assert all(b - a >= 2.0 for a, b in zip(starts, starts[1:]))


# ------------------------------------------------------------------------------------------ P/B from the filing value

def test_pb_is_close_over_book_value_and_fails_closed_on_missing_or_stale_inputs():
    stored = StoredBookValue(Decimal("30"), SEP_30, "https://nsearchives.nseindia.com/a.xml", BASIS_CONSOLIDATED)
    assert filing_pb_ratio(stored, Decimal("300"), date(2026, 11, 2)) == Decimal("10.000000")
    assert filing_pb_ratio(None, Decimal("300"), date(2026, 11, 2)) is None
    assert filing_pb_ratio(stored, None, date(2026, 11, 2)) is None
    assert filing_pb_ratio(stored, Decimal("0"), date(2026, 11, 2)) is None
    assert filing_pb_ratio(stored, Decimal("300"), date(2026, 9, 1)) is None            # filing dated after the close
    assert filing_pb_ratio(stored, Decimal("300"), date(2027, 11, 4)) == Decimal("10.000000")   # still inside 400 days
    assert filing_pb_ratio(stored, Decimal("300"), date(2027, 11, 6)) is None           # filing far too old
    assert filing_pb_ratio(StoredBookValue(Decimal("0"), SEP_30, "x", BASIS_CONSOLIDATED), Decimal("300"), date(2026, 11, 2)) is None


def test_source_label_is_plain_words():
    assert FILING_SOURCE_LABEL == "From the company's stock exchange filing"
    for jargon in ("xbrl", "proxy", "fallback", "tri", "api"):
        assert jargon not in FILING_SOURCE_LABEL.lower().split()
    footnote = fbv.filing_footnote(StoredBookValue(Decimal("328.690608"), SEP_30, "x", BASIS_CONSOLIDATED), date(2026, 11, 2))
    assert footnote == fbv.FILING_FOOTNOTE and "stock exchange filing" in footnote and "xbrl" not in footnote.lower()
    # One shared sentence: no stock's own figures, so the valuation page shows it once.
    assert "328" not in footnote and "2026" not in footnote


# ------------------------------------------------------------------------------------------ database side

def test_held_targets_use_the_daily_jobs_held_selection_and_need_an_nse_symbol(db_session):
    from tests.services.analytics.test_lookthrough import _batch, _scheme
    from tests.services.home.test_units import _folio, _member, _txn
    member, imported = _member(db_session)
    scheme = _scheme(db_session)
    folio = _folio(db_session, member, scheme, "F1")
    _txn(db_session, folio, imported, TransactionType.PURCHASE, date(2026, 1, 1), "100")
    _batch(db_session, scheme, [("Tata", "INE467B01029", "40", AssetType.EQUITY_DOMESTIC), ("Nosym", "INE000000011", "30", AssetType.EQUITY_DOMESTIC),
                                ("Bond", "INE000000022", "10", AssetType.DEBT)])
    unheld_scheme = _scheme(db_session)
    _batch(db_session, unheld_scheme, [("Other", "INE000000033", "50", AssetType.EQUITY_DOMESTIC)])
    for isin, symbol in (("INE467B01029", "TCS"), ("INE000000011", None), ("INE000000022", "BOND"), ("INE000000033", "OTHER")):
        db_session.add(StockMaster(isin=isin, name=isin, source="NSE", as_of_date=date(2026, 10, 12), nse_symbol=symbol))
    db_session.commit()
    targets, without_symbol = fbv.held_equity_targets(db_session, TODAY)
    assert targets == [("INE467B01029", "TCS")] and without_symbol == 1


def test_database_side_fails_closed_while_the_columns_are_missing(db_session, monkeypatch):
    # The columns exist since migration 0052; this keeps the fail-closed path for a database that has not
    # been migrated yet (the new code is deployed together with the migration, so this is a safety net).
    monkeypatch.setattr(fbv, "book_value_columns_exist", lambda: False)
    assert fbv.load_filing_values(db_session) == {}
    with pytest.raises(fbv.BookValueColumnsMissing):
        fbv.StockMasterBookValueStore(db_session)


def test_the_migrated_model_has_the_four_columns_and_a_real_row_round_trips(db_session):
    from datetime import date as _date
    assert fbv.book_value_columns_exist()
    db_session.add(StockMaster(isin="INE467B01029", name="TCS", as_of_date=_date(2026, 11, 2), source="NSE"))
    db_session.commit()
    store = fbv.StockMasterBookValueStore(db_session)
    assert store.stored("INE467B01029") is None
    value = StoredBookValue(Decimal("328.690608"), SEP_30, "https://nsearchives.nseindia.com/a.xml", BASIS_CONSOLIDATED)
    store.save("INE467B01029", value)
    asyncio.run(store.commit())
    db_session.expire_all()
    assert store.stored("INE467B01029") == value
    assert fbv.load_filing_values(db_session) == {"INE467B01029": value}
    with pytest.raises(fbv.FilingDataError):
        store.save("INE000000000", value)          # a stock that is not in stock_master is never invented


def test_store_adapter_round_trip_once_the_columns_exist(monkeypatch):
    for name in fbv.BOOK_VALUE_COLUMNS:
        monkeypatch.setattr(StockMaster, name, None, raising=False)
    row = SimpleNamespace(isin="I1", book_value_per_share=None, book_value_as_of=None, book_value_filing_ref=None, book_value_basis=None)
    committed = []

    class Db:
        def get(self, model, key):
            return row if key == "I1" else None

        def add(self, obj):
            pass

        def commit(self):
            committed.append(True)

    store = fbv.StockMasterBookValueStore(Db())
    assert store.stored("I1") is None
    value = StoredBookValue(Decimal("12.5"), SEP_30, "https://nsearchives.nseindia.com/a.xml", BASIS_STANDALONE)
    store.save("I1", value)
    assert store.stored("I1") == value
    with pytest.raises(FilingDataError):
        store.save("MISSING", value)
    asyncio.run(store.commit())
    assert committed == [True]


# ------------------------------------------------------------------------------------------ the daily job prefers the filing value

ETERNAL_ISIN = "INE758T01015"
TODAY_DAILY = date(2026, 10, 14)
BHAVCOPY = (b"SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE, LAST_PRICE, CLOSE_PRICE, AVG_PRICE\n"
            b"ETERNAL, EQ, 12-Oct-2026, 290.00, 291.00, 305.00, 289.00, 299.00, 300.00, 298.00\n"
            b"COFORGE, EQ, 12-Oct-2026, 1490.00, 1491.00, 1510.00, 1480.00, 1500.00, 1500.00, 1495.00\n"
            b"ETERNALBE, BE, 12-Oct-2026, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00\n")


def _fixture_http(*, bhavcopy=BHAVCOPY):
    from tests.services.analytics.test_stock_fundamentals_client import FixtureHTTP

    class WithCloses(FixtureHTTP):
        def handler(self, request):
            if "sec_bhavdata_full" in request.url.path:
                self.calls.append(request)
                if bhavcopy is not None and request.url.path.endswith("sec_bhavdata_full_12102026.csv"):
                    return httpx.Response(200, content=bhavcopy)
                return httpx.Response(404)
            return super().handler(request)

    return WithCloses()


def _daily(db, fake, **kwargs):
    from tests.services.analytics.test_stock_fundamentals_client import _refresh
    return _refresh(db, fake, **kwargs)


def _filing_value(when=SEP_30, value="30"):
    return StoredBookValue(Decimal(value), when, "https://nsearchives.nseindia.com/e.xml", BASIS_CONSOLIDATED)


def _quote_summary_symbols(fake):
    return {r.url.path.rsplit("/", 1)[-1] for r in fake.calls if "quoteSummary" in r.url.path}


def test_daily_pb_uses_the_filing_book_value_with_a_plain_label_and_yahoo_for_the_rest(db_session):
    fake = _fixture_http()
    result = _daily(db_session, fake, filing_values={ETERNAL_ISIN: _filing_value()})
    assert result.success
    eternal = db_session.get(StockMaster, ETERNAL_ISIN)
    assert eternal.pb_ratio == Decimal("10.000000")                       # close 300 / book value 30
    assert eternal.pb_source == "FILING" and eternal.pb_as_of == date(2026, 10, 12)
    assert "stock exchange filing" in eternal.footnote
    assert "ETERNAL.NS" not in _quote_summary_symbols(fake)               # no Yahoo call needed for it
    coforge = db_session.get(StockMaster, "INE591G01025")
    assert coforge.pb_source == "YAHOO" and coforge.pb_ratio > 0 and coforge.pb_as_of == TODAY_DAILY
    assert "COFORGE.NS" in _quote_summary_symbols(fake)


def test_daily_pb_falls_back_to_the_labelled_yahoo_value_when_the_close_file_is_missing(db_session, caplog):
    fake = _fixture_http(bhavcopy=None)
    _daily(db_session, fake, filing_values={ETERNAL_ISIN: _filing_value()})
    row = db_session.get(StockMaster, ETERNAL_ISIN)
    assert row.pb_source == "YAHOO" and row.pb_ratio == Decimal("9.329274")
    assert "nse_close_file_unusable" in caplog.text


def test_daily_pb_falls_back_when_the_close_is_missing_for_that_symbol_or_the_filing_is_stale(db_session):
    no_close = BHAVCOPY.replace(b"ETERNAL, EQ", b"OTHER, EQ")
    _daily(db_session, _fixture_http(bhavcopy=no_close), filing_values={ETERNAL_ISIN: _filing_value()})
    assert db_session.get(StockMaster, ETERNAL_ISIN).pb_source == "YAHOO"
    db_session.query(StockMaster).delete()
    db_session.commit()
    _daily(db_session, _fixture_http(), filing_values={ETERNAL_ISIN: _filing_value(when=date(2024, 3, 31))})
    assert db_session.get(StockMaster, ETERNAL_ISIN).pb_source == "YAHOO"


def test_daily_pb_without_any_filing_values_is_unchanged_and_asks_for_no_price_file(db_session):
    fake = _fixture_http()
    _daily(db_session, fake)
    assert not any("sec_bhavdata_full" in r.url.path for r in fake.calls)
    assert all(r.pb_source == "YAHOO" for r in db_session.query(StockMaster))


def test_nse_close_parser_reads_header_names_with_spaces_and_eq_only_and_checks_the_date():
    from app.services.analytics.stock_fundamentals_client import parse_nse_closes
    closes = parse_nse_closes(BHAVCOPY, file_date=date(2026, 10, 12))
    assert closes == {"ETERNAL": Decimal("300.00"), "COFORGE": Decimal("1500.00")}
    with pytest.raises(ValueError):
        parse_nse_closes(BHAVCOPY, file_date=date(2026, 10, 13))
    with pytest.raises(ValueError):
        parse_nse_closes(b"A,B\n1,2\n", file_date=date(2026, 10, 12))
    zero = BHAVCOPY.replace(b"300.00, 298.00", b"0, 298.00")
    assert "ETERNAL" not in parse_nse_closes(zero, file_date=date(2026, 10, 12))


# ------------------------------------------------------------------------------------------ the job entry

def test_job_exits_2_with_an_alert_and_no_network_while_the_columns_do_not_exist(db_session, caplog, monkeypatch):
    from tests.scripts.test_background_jobs import _load_job
    job = _load_job("refresh_filings_book_value")
    monkeypatch.setattr(fbv, "book_value_columns_exist", lambda: False)

    class NoNetwork:
        def __getattr__(self, name):
            raise AssertionError("no request may be made")

    assert asyncio.run(job.main_async(db_session, source=NoNetwork())) == 2
    assert "FILINGS_BOOK_VALUE_ALERT columns_missing" in caplog.text


def _job_with(monkeypatch, targets=(("I1", "TCS"),)):
    from tests.scripts.test_background_jobs import _load_job
    job = _load_job("refresh_filings_book_value")
    store = FakeStore()
    monkeypatch.setattr(job, "StockMasterBookValueStore", lambda db: store)
    monkeypatch.setattr(job, "held_equity_targets", lambda db, today: (list(targets), 0))
    return job, store


def test_job_success_writes_the_job_run_row_and_exits_0(db_session, monkeypatch):
    from app.models.news import JobRun
    filing = _filing("TCS")
    source = FakeSource({"TCS": [filing]}, {filing.xbrl_url: TCS})
    job, store = _job_with(monkeypatch)
    assert asyncio.run(job.main_async(db_session, source=source, today=TODAY)) == 0
    assert "I1" in store.values
    assert db_session.get(JobRun, fbv.JOB_NAME).last_success_at is not None


@pytest.mark.parametrize("status", [401, 403, 429])
def test_job_blocked_exits_1_raises_the_alert_and_leaves_no_success_time(db_session, monkeypatch, caplog, status):
    from app.models.news import JobRun
    source = FakeSource({"TCS": NseAccessBlocked(status)}, {})
    job, store = _job_with(monkeypatch)
    assert asyncio.run(job.main_async(db_session, source=source, today=TODAY)) == 1
    assert store.values == {} and db_session.get(JobRun, fbv.JOB_NAME) is None
    assert "FILINGS_BOOK_VALUE_ALERT" in caplog.text


def test_job_with_no_held_stock_that_has_a_symbol_alerts_and_exits_1(db_session, monkeypatch, caplog):
    job, _ = _job_with(monkeypatch, targets=())
    assert asyncio.run(job.main_async(db_session, source=FakeSource({}, {}), today=TODAY)) == 1
    assert "no_held_stocks_with_symbol" in caplog.text



def test_a_filing_pb_that_disagrees_wildly_with_the_previous_one_is_not_used():
    # Run 7 backend review: the book value per share is at the balance-sheet date, the close is after any bonus
    # issue or split, so the P/B would be wrong (a 1:1 bonus halves it) until the next filing. The previous stored
    # P/B is the cross-check; an ordinary difference between sources is far smaller than this.
    stored = StoredBookValue(Decimal("30"), SEP_30, "x", BASIS_CONSOLIDATED)
    assert filing_pb_ratio(stored, Decimal("300"), date(2026, 11, 2), previous=Decimal("9.5")) == Decimal("10.000000")
    assert filing_pb_ratio(stored, Decimal("300"), date(2026, 11, 2), previous=Decimal("14")) == Decimal("10.000000")
    assert filing_pb_ratio(stored, Decimal("150"), date(2026, 11, 2), previous=Decimal("10")) is None   # halved
    assert filing_pb_ratio(stored, Decimal("600"), date(2026, 11, 2), previous=Decimal("10")) is None   # doubled
    assert filing_pb_ratio(stored, Decimal("150"), date(2026, 11, 2), previous=None) == Decimal("5.000000")
