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


# T1.4: category spellings come from the committed synthetic AMFI NAVAll file.
import pytest
from unittest.mock import patch

DEBT_REASON = "This is a debt fund, so it isn't counted in an equity overlap."
LOW_REASON = "Less than 65% of this fund is in Indian shares, so it isn't counted."
MISSING_REASON = "We don't have this fund's holdings yet, so it isn't counted here."


def _equity_module():
    from app.services.analytics import equity_universe
    return equity_universe


def _t14_fund(db, category, equity="80", *, name=None, derivative=None):
    scheme = _scheme(db)
    scheme.sebi_category = category
    if name:
        scheme.name = name
    db.flush()
    if equity is not None:
        rows = [("Shared stock", "SHARED", equity, EQ)]
        if derivative is not None:
            rows += [("Short future", None, derivative, AssetType.DERIVATIVE)]
        _batch(db, scheme, rows)
    return scheme


@pytest.mark.parametrize("category", ["Debt Scheme - Corporate Bond Fund", "Debt Scheme - Overnight Fund", "Debt Scheme - Liquid Fund", "Debt Scheme - Low Duration Fund", "Hybrid Scheme - Arbitrage Fund"])
def test_debt_overnight_liquid_low_duration_arbitrage_are_excluded_with_reason(db_session, monkeypatch, category):
    scheme = _t14_fund(db_session, category)
    result = _compute(db_session, monkeypatch, [_holding(scheme, "100")])
    assert result.total_fund_count == 0
    assert [(f.name, f.reason) for f in result.excluded_funds] == [(scheme.name, DEBT_REASON)]


def test_index_fund_and_flexi_cap_are_included(db_session, monkeypatch):
    schemes = [_t14_fund(db_session, category) for category in ["Index Funds - Equity Funds", "Equity Scheme - Flexi Cap Fund"]]
    result = _compute(db_session, monkeypatch, [_holding(s, "100") for s in schemes])
    assert result.excluded_funds == [] and result.total_fund_count == 2
    assert len(result.by_category["Flexi Cap"].matrix_funds) == 1


@pytest.mark.parametrize("category", ["Hybrid Scheme - Multi Asset Allocation", "Hybrid Scheme - Dynamic Asset Allocation or Balanced Advantage", "Hybrid Schemes - Equity Savings Fund", "Solution Oriented Scheme - Children’s Fund"])
def test_hybrid_with_70_percent_net_domestic_equity_is_included_and_with_40_percent_is_excluded(db_session, monkeypatch, category):
    high = _t14_fund(db_session, category, "70")
    low = _t14_fund(db_session, category, "40")
    result = _compute(db_session, monkeypatch, [_holding(high, "100"), _holding(low, "100")])
    assert [f.scheme_id for f in result.matrix_funds] == [high.id]
    assert [(f.name, f.reason) for f in result.excluded_funds] == [(low.name, LOW_REASON)]


def test_balanced_advantage_fund_mostly_hedged_is_excluded(db_session, monkeypatch):
    scheme = _t14_fund(db_session, "Hybrid Scheme - Balanced Advantage Fund", "80", derivative="-50")
    result = _compute(db_session, monkeypatch, [_holding(scheme, "100")])
    assert result.total_fund_count == 0 and result.excluded_funds[0].reason == LOW_REASON


def test_fund_without_holdings_data_is_left_out_and_the_note_says_so_in_plain_words(db_session, monkeypatch):
    scheme = _t14_fund(db_session, "Equity Scheme - Large Cap Fund", None)
    result = _compute(db_session, monkeypatch, [_holding(scheme, "100")])
    assert result.total_fund_count == 0 and result.excluded_funds[0].reason == MISSING_REASON


def test_debt_index_fund_fails_the_data_rule_and_an_equity_index_fund_passes(db_session, monkeypatch):
    debt = _t14_fund(db_session, "Other Scheme - Index Funds", "5")
    equity = _t14_fund(db_session, "Other Scheme - Index Funds", "90")
    result = _compute(db_session, monkeypatch, [_holding(debt, "100"), _holding(equity, "100")])
    assert [f.scheme_id for f in result.matrix_funds] == [equity.id]
    assert result.excluded_funds[0].reason == LOW_REASON


@pytest.mark.parametrize("category", ["Equity Scheme - Large Cap Fund", "Equity Schemes - Large Cap Fund", "Index Funds - Equity Funds"])
def test_both_stored_category_spellings_are_matched(category):
    module = _equity_module()
    assert category in module.EQUITY_CATEGORIES
    assert module.is_equity_fund(category, Decimal("80"))
    assert not module.is_equity_fund(category, None)


def test_a_fund_ranked_15th_still_appears_in_its_category_matrix(db_session, monkeypatch):
    schemes = [_t14_fund(db_session, "Equity Scheme - Large Cap Fund" if i < 13 else "Equity Scheme - Small Cap Fund") for i in range(15)]
    result = _compute(db_session, monkeypatch, [_holding(s, str(1500-i*10)) for i,s in enumerate(schemes)])
    assert len(result.matrix_funds) == 12 and schemes[-1].id not in {f.scheme_id for f in result.matrix_funds}
    small = result.by_category["Small Cap"]
    assert [f.scheme_id for f in small.matrix_funds] == [s.id for s in schemes[-2:]]
    assert len(small.matrix) == 1 and small.matrix[0].overlap_pct == Decimal("80")


def test_category_pair_equals_the_same_pair_in_all_funds(db_session, monkeypatch):
    from app.services.analytics import overlap
    schemes = [_t14_fund(db_session, "Equity Scheme - Mid Cap Fund", weight) for weight in ("70", "90", "80")]
    with patch.object(overlap, "_pair_result", wraps=overlap._pair_result) as calculation:
        result = _compute(db_session, monkeypatch, [_holding(s, "100") for s in schemes])
    assert calculation.call_count == 3  # three funds, three pair calculations, reused by category
    assert result.by_category["Mid Cap"].matrix == result.matrix


def test_category_with_no_funds_or_one_fund_returns_the_message_state(db_session, monkeypatch):
    scheme = _t14_fund(db_session, "Equity Scheme - Flexi Cap Fund")
    result = _compute(db_session, monkeypatch, [_holding(scheme, "100")])
    assert set(result.by_category) == {"Large Cap", "Mid Cap", "Small Cap", "Flexi Cap"}
    assert result.by_category["Large Cap"].message and result.by_category["Large Cap"].total_fund_count == 0
    assert result.by_category["Flexi Cap"].message and result.by_category["Flexi Cap"].total_fund_count == 1
    assert result.by_category["Flexi Cap"].matrix == []


def test_category_list_matches_stored_category_strings():
    import re
    module = _equity_module()
    navall = Path(__file__).resolve().parents[4] / "Docs/CAS Files/synthetic/navall_2026-10-06.txt"
    stored = set(re.findall(r"^(?:Open Ended|Close Ended|Interval Fund) Schemes\((.+)\)$", navall.read_text(), re.M))
    equity_categories = {c for c in stored if c.startswith(("Equity Scheme -", "Equity Schemes -")) or c in {"ELSS", "Index Funds - Equity Funds", "Exchange Traded Funds (ETFs) - Equity ETF"} or "Aggressive Hybrid" in c}
    assert len(equity_categories) >= 28
    assert equity_categories <= set(module.EQUITY_CATEGORIES)  # a new stored equity category must be reviewed
    assert all(module.is_equity_fund(c, Decimal("80")) for c in equity_categories)
    assert not module.is_equity_fund("Debt Scheme - Liquid Fund", Decimal("99"))
    assert not module.is_equity_fund("Other Scheme - FoF Overseas", Decimal("99"))


def test_funds_analysed_counts_equity_funds_only(db_session, monkeypatch):
    categories = ["Equity Scheme - Large Cap Fund", "Equity Scheme - Flexi Cap Fund", "Debt Scheme - Liquid Fund"]
    schemes = [_t14_fund(db_session,c) for c in categories]
    result = _compute(db_session, monkeypatch, [_holding(s,"100") for s in schemes])
    assert result.total_fund_count == 2 and len(result.excluded_funds) == 1
    assert {f.scheme_id for f in result.equity_funds} == {s.id for s in schemes[:2]}


def test_net_domestic_equity_uses_latest_written_batch_without_household_cutoff(db_session):
    module = _equity_module()
    scheme = _scheme(db_session)
    _batch(db_session, scheme, [("Old", "OLD", "90", EQ)], date(2026,8,31))
    _batch(db_session, scheme, [("Domestic", "EQ", "80", EQ), ("Short", None, "-30", AssetType.DERIVATIVE), ("Long", None, "25", AssetType.DERIVATIVE), ("Overseas", "INT", "20", AssetType.EQUITY_INTERNATIONAL)], date(2026,10,31))
    _batch(db_session, scheme, [("Failed", "BAD", "99", EQ)], date(2026,11,30), DisclosureBatchStatus.FAILED)
    assert module.net_domestic_equity_pct(db_session, scheme.id) == Decimal("50")
    assert module.net_domestic_equity_pct(db_session, _scheme(db_session).id) is None


def test_overlap_new_fields_default_for_old_payload(db_session, monkeypatch):
    from app.services.analytics.schemas import OverlapSummary
    old = _compute(db_session, monkeypatch, []).model_dump()
    for key in ("excluded_funds", "by_category", "message"):
        old.pop(key, None)
    parsed = OverlapSummary.model_validate(old)
    assert parsed.excluded_funds == [] and parsed.by_category == {} and parsed.message is None
