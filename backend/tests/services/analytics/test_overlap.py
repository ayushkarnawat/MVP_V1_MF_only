import asyncio
import uuid
from datetime import date
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.models.enums import AssetType, DisclosureBatchStatus
from tests.services.analytics.test_lookthrough import _scheme, _batch, _holding

EQ = AssetType.EQUITY_DOMESTIC

def _row(name, isin, weight, asset=EQ):
    return SimpleNamespace(instrument_name=name, isin=isin, pct_to_nav=Decimal(weight), asset_type=asset)


def _compute(db, monkeypatch, holdings, ids=None):
    from app.services.analytics import lookthrough
    from app.services.analytics.overlap import compute_overlap
    monkeypatch.setattr(lookthrough, "compute_holdings", AsyncMock(return_value=holdings))
    return asyncio.run(compute_overlap(db, ids or [uuid.uuid4()]))


def test_worked_42_percent_example_uses_raw_weights_and_is_symmetric(db_session, monkeypatch):
    from app.services.analytics.overlap import compute_fund_pair_overlap
    names = ["HDFC Bank", "Reliance", "ICICI Bank", "Infosys", "TCS"] + [f"Other {i}" for i in range(11)]
    weights = ["8", "7", "6", "5", "5"] + ["1"] * 11
    a = [_row(n, f"ISIN{i}", w) for i, (n, w) in enumerate(zip(names, weights))]
    b = [_row(n, f"ISIN{i}", str(Decimal(w) + 1)) for i, (n, w) in enumerate(zip(names, weights))]
    pair = compute_fund_pair_overlap(a, b)
    assert pair.overlap_pct == Decimal("42")
    assert pair.common_total == 16
    assert [s.instrument_name for s in pair.common_stocks[:5]] == names[:5]
    reverse = compute_fund_pair_overlap(b, a)
    assert reverse.overlap_pct == pair.overlap_pct
    assert [(s.weight_a, s.weight_b) for s in reverse.common_stocks] == [(s.weight_b, s.weight_a) for s in pair.common_stocks]
    schemes = [_scheme(db_session) for _ in range(2)]
    for scheme, rows in zip(schemes, (a, b)):
        _batch(db_session, scheme, [(r.instrument_name, r.isin, str(r.pct_to_nav), r.asset_type) for r in rows])
    result = _compute(db_session, monkeypatch, [_holding(schemes[0], "900"), _holding(schemes[1], "100")])
    assert len(result.matrix) == 1 and result.matrix[0].overlap_pct == Decimal("42")
    assert result.pairs_above_low[0] == result.matrix[0]


def test_equity_only_repeated_isins_nulls_and_seventy_percent_cap():
    from app.services.analytics.overlap import compute_fund_pair_overlap
    a = [_row("Stock", "EQ", "30"), _row("Same stock lot", "EQ", "40"), _row("Null stock", None, "20")]
    b = [_row("Stock", "EQ", "70"), _row("Null stock", None, "20")]
    for kind in (AssetType.DEBT, AssetType.CASH_EQUIVALENT, AssetType.GOLD_SILVER, AssetType.REIT_INVIT, AssetType.DERIVATIVE, AssetType.OTHER):
        a.append(_row("Not stock", str(kind), "-90" if kind == AssetType.DERIVATIVE else "90", kind))
        b.append(a[-1])
    result = compute_fund_pair_overlap(a, b)
    assert result.overlap_pct == Decimal("70")
    assert result.common_total == 1
    assert result.common_stocks[0].weight_a == result.common_stocks[0].weight_b == Decimal("70")


def test_fifteen_funds_cap_matrix_but_not_pairs_or_overlap_sum(db_session, monkeypatch):
    schemes = [_scheme(db_session) for _ in range(15)]
    for s in schemes:
        _batch(db_session, s, [(f"Stock {i}", f"ISIN{i}", "1", EQ) for i in range(30)])
    result = _compute(db_session, monkeypatch, [_holding(s, str(1500-i*10)) for i, s in enumerate(schemes)])
    assert len(result.matrix_funds) == 12
    assert [f.scheme_id for f in result.matrix_funds] == [s.id for s in schemes[:12]]
    assert len(result.matrix) == 66 and len(result.pairs_above_low) == 105
    assert any(p.fund_b.scheme_id == schemes[-1].id for p in result.pairs_above_low)
    assert result.matrix_truncated and result.total_fund_count == 15
    assert result.bands.low == 20 and result.bands.high == 40
    assert all(p.common_total == 30 and len(p.common_stocks) == 20 and p.overlap_pct == 30 for p in result.pairs_above_low)
    payload = result.model_dump_json()
    assert len(payload.encode("utf-8")) < 600_000


def test_uncovered_not_zero_pairs_and_same_batch_selection(db_session, monkeypatch):
    a, b, missing = [_scheme(db_session) for _ in range(3)]
    for s in (a, b):
        _batch(db_session, s, [("Stock", "EQ", "21", EQ)], date(2026, 8, 31))
        for when, status in [(date(2026, 9, 30), DisclosureBatchStatus.FAILED), (date(2026, 10, 1), DisclosureBatchStatus.AWAITING_MANUAL_UPLOAD), (date(2026, 10, 31), DisclosureBatchStatus.WRITTEN)]:
            _batch(db_session, s, [("Wrong", "WRONG", "99", EQ)], when, status)
    result = _compute(db_session, monkeypatch, [_holding(a, "100"), _holding(b, "100"), _holding(missing, "800")])
    assert result.total_fund_count == 2 and len(result.matrix) == 1
    assert result.matrix[0].overlap_pct == 21
    assert result.coverage.covered_value_pct == 20 and result.hide_headlines
    assert result.coverage.not_published_yet[0].scheme_id == missing.id
    assert result.holdings_as_of == date(2026, 8, 31)


def test_concentration_uses_complete_portfolio_weighted_table_and_memo(db_session, monkeypatch):
    from app.services.analytics import lookthrough
    from app.services.analytics.overlap import compute_overlap
    a, b = [_scheme(db_session) for _ in range(2)]
    _batch(db_session, a, [(f"A{i}", f"A{i}", "0.5", EQ) for i in range(120)])
    _batch(db_session, b, [("B", "B", "40", EQ), ("Debt", "D", "60", AssetType.DEBT)])
    spy = AsyncMock(return_value=[_holding(a, "750"), _holding(b, "250")])
    monkeypatch.setattr(lookthrough, "compute_holdings", spy)
    ids = [uuid.uuid4()]
    async def run():
        await lookthrough.compute_stock_holdings(db_session, ids)
        db_session.commit()
        return await compute_overlap(db_session, ids)
    result = asyncio.run(run())
    assert spy.await_count == 1 and result.total_stock_count == 121
    assert [(c.stock_count, c.exposure_pct) for c in result.concentration] == [(5, Decimal("11.5")), (10, Decimal("13.375")), (20, Decimal("17.125")), (50, Decimal("28.375"))]


def test_empty_short_curve_and_band_boundary(db_session, monkeypatch):
    result = _compute(db_session, monkeypatch, [])
    assert result.matrix == result.pairs_above_low == result.concentration == []
    a, b = [_scheme(db_session) for _ in range(2)]
    for s in (a, b):
        _batch(db_session, s, [("Stock", "EQ", "20", EQ)])
    result = _compute(db_session, monkeypatch, [_holding(a, "100"), _holding(b, "100")])
    assert result.pairs_above_low == []  # strictly above the low band
    assert [(c.stock_count, c.exposure_pct) for c in result.concentration] == [(1, Decimal("20"))]


def test_real_hdfc_funds_parsed_and_written_by_engine(db_session, monkeypatch):
    from app.services.analytics.amfi_factsheet_client import build_families
    from app.services.analytics.portfolio_disclosure_parsing import parse_workbook
    from app.services.analytics.portfolio_disclosure_writer import write_disclosure_batch
    schemes = [_scheme(db_session, "HDFC Mutual Fund") for _ in range(2)]
    fixtures = Path(__file__).resolve().parents[2] / "fixtures/portfolio_disclosures"
    for scheme, name in zip(schemes, ("hdfc-flexi-cap", "hdfc-bse-500-index-fund")):
        sheet = next(s for s in parse_workbook((fixtures / (name+"_asof_2026-09-30.xlsx")).read_bytes()) if s.holdings)
        write_disclosure_batch(db_session, build_families([scheme])[0], date(2026, 9, 30), scheme.amc_name,
            "https://example.test/fixture.xlsx", sheet.holdings, "EXACT", Decimal(1), declared_total=sheet.declared_total)
    result = _compute(db_session, monkeypatch, [_holding(schemes[0], "900"), _holding(schemes[1], "100")])
    pair = result.matrix[0]
    assert pair.overlap_pct == Decimal("40.310") and pair.common_total == 70
    assert len(pair.common_stocks) == 20
    assert any(s.isin == "INE002A01018" and {s.weight_a, s.weight_b} == {Decimal("1.4"), Decimal("4.16")} for s in pair.common_stocks)


def test_overlap_section_wrapping(db_session, monkeypatch):
    from app.services.analytics.recompute import _SECTIONS
    result = _compute(db_session, monkeypatch, [])
    spec = next(s for s in _SECTIONS if s.name == "overlap")
    assert spec.wrap_combined([], result).model_dump(mode="json") == {"members": [], "overlap": result.model_dump(mode="json")}


def test_impact_pairs_name_the_stocks_driving_the_top_pairs(db_session, monkeypatch):
    names = ["HDFC Bank", "Reliance", "ICICI Bank", "Infosys", "TCS", "Wipro", "ITC"] + [f"Other {i}" for i in range(9)]
    weights = ["8", "7", "6", "5", "5", "4", "3"] + ["0.5"] * 9
    a = [(n, f"ISIN{i}", w, EQ) for i, (n, w) in enumerate(zip(names, weights))]
    b = [(n, f"ISIN{i}", str(Decimal(w) + 1), EQ) for i, (n, w) in enumerate(zip(names, weights))]
    schemes = [_scheme(db_session) for _ in range(2)]
    for scheme, rows in zip(schemes, (a, b)):
        _batch(db_session, scheme, rows)
    result = _compute(db_session, monkeypatch, [_holding(schemes[0], "900"), _holding(schemes[1], "100")])
    # hand check: the smaller weight of each shared stock is fund A's, so the pair is 8+7+6+5+5+4+3 + 9 x 0.5 = 38 + 4.5 = 42.5
    pair = result.pairs_above_low[0]
    assert pair.overlap_pct == Decimal("42.5")
    assert len(result.impact_pairs) == 1
    impact = result.impact_pairs[0]
    assert (impact.fund_a.scheme_id, impact.fund_b.scheme_id) == (pair.fund_a.scheme_id, pair.fund_b.scheme_id)
    assert impact.overlap_pct == Decimal("42.5")
    assert [(d.instrument_name, d.contribution_pct) for d in impact.drivers] == [
        ("HDFC Bank", Decimal("8")), ("Reliance", Decimal("7")), ("ICICI Bank", Decimal("6")), ("Infosys", Decimal("5")), ("TCS", Decimal("5"))]
    assert impact.drivers[0].share_of_pair_pct == Decimal("8") / Decimal("42.5") * 100
    assert result.model_dump(mode="json")["impact_pairs"][0]["drivers"][0]["contribution_pct"] == "8.000"


def test_a_pair_at_exactly_the_low_band_is_listed_separately_for_an_inclusive_view(db_session, monkeypatch):
    a, b, c = [_scheme(db_session) for _ in range(3)]
    _batch(db_session, a, [("Shared", "S1", "20", EQ), ("OnlyA", "A1", "10", EQ)])
    _batch(db_session, b, [("Shared", "S1", "25", EQ), ("OnlyB", "B1", "10", EQ)])
    _batch(db_session, c, [("Shared", "S1", "21", EQ)])
    result = _compute(db_session, monkeypatch, [_holding(a, "300"), _holding(b, "200"), _holding(c, "100")])
    # hand check: a-b share min(20,25)=20 (exactly the band); a-c min(20,21)=20; b-c min(25,21)=21 (strictly above)
    assert [(p.fund_a.scheme_id, p.fund_b.scheme_id) for p in result.pairs_above_low] == [(b.id, c.id)]
    assert {(p.fund_a.scheme_id, p.fund_b.scheme_id) for p in result.pairs_at_low_boundary} == {(a.id, b.id), (a.id, c.id)}
    assert all(p.overlap_pct == Decimal("20") for p in result.pairs_at_low_boundary)


def test_impact_drivers_are_the_top_five_by_contribution_with_exact_shares(db_session, monkeypatch):
    # Eight shared stocks listed in scrambled order; the pair's overlap is the sum of the smaller weights: 36.
    weights = {"S1": "3", "S2": "8", "S3": "5", "S4": "7", "S5": "1", "S6": "6", "S7": "4", "S8": "2"}
    a = [(n, f"ISIN{n}", w, EQ) for n, w in weights.items()]
    b = [(n, f"ISIN{n}", str(Decimal(w) + 1), EQ) for n, w in weights.items()]
    schemes = [_scheme(db_session) for _ in range(2)]
    for scheme, rows in zip(schemes, (a, b)):
        _batch(db_session, scheme, rows)
    result = _compute(db_session, monkeypatch, [_holding(schemes[0], "900"), _holding(schemes[1], "100")])
    impact = result.impact_pairs[0]
    assert impact.overlap_pct == Decimal("36")
    assert [(d.instrument_name, d.contribution_pct) for d in impact.drivers] == [
        ("S2", Decimal("8")), ("S4", Decimal("7")), ("S6", Decimal("6")), ("S3", Decimal("5")), ("S7", Decimal("4"))]
    # hand check: 8/36, 7/36, 6/36, 5/36, 4/36 of the overlap; S1, S8, S5 (3, 2, 1) are left out
    assert [d.share_of_pair_pct for d in impact.drivers] == [
        Decimal(n) / Decimal("36") * 100 for n in ("8", "7", "6", "5", "4")]
