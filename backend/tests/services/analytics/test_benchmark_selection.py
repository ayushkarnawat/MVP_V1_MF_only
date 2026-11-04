"""W5: one ordered selection (factsheet, closest, category, none) with its tables.

Pure tests call `choose_benchmark` directly; two tests go through the database
reader (`benchmark_choices`) so both paths provably share the one function.
"""
import re
from datetime import date
from pathlib import Path

import pytest

from app.models.enums import BenchmarkIndex, SchemePlanType
from app.models.reference import SchemeBenchmark
from app.services.analytics import benchmark_selection as sel
from app.services.analytics.benchmark import _benchmark_index_for_category
from app.services.analytics.benchmark_registry import INDICES, get_index, index_label
from app.services.fund_page.benchmark_select import benchmark_choices
from tests.services.fund_page.factories import add_scheme

ACTIVE = {spec.key: spec.active for spec in INDICES}


def pick(category, *, declared=None, name="Some Fund", mapped=None, quality="exact",
         tracked=None, tracked_quality=None, active=None):
    flags = ACTIVE if active is None else active
    return sel.choose_benchmark(
        category=category, scheme_name=name, declared=declared, mapped_key=mapped, mapped_quality=quality,
        tracked_key=tracked, tracked_quality=tracked_quality, age=None,
        is_active=lambda key: flags.get(key, False), label_of=index_label,
    )


# ---- step 3: every category row, one parametrised case each -------------------------------

@pytest.mark.parametrize("category,key", [
    ("Equity Scheme - Large Cap Fund", "nifty_100"),
    ("Equity Scheme - Mid Cap Fund", "nifty_midcap_150"),
    ("Equity Scheme - Small Cap Fund", "nifty_smallcap_250"),
    ("Equity Scheme - Large & Mid Cap Fund", "nifty_largemidcap_250"),
    ("Equity Scheme - Multi Cap Fund", "nifty_500"),
    ("Equity Scheme - Flexi Cap Fund", "nifty_500"),
    ("Equity Scheme - ELSS", "nifty_500"),
    ("Equity Scheme - Focused Fund", "nifty_500"),
    ("Equity Scheme - Value Fund", "nifty_500"),
    ("Equity Scheme - Contra Fund", "nifty_500"),
    ("Equity Scheme - Dividend Yield Fund", "nifty_500"),
    ("Equity Scheme - Sectoral/ Thematic", "nifty_500"),
    # New: a registered, owner-checked arbitrage index is the standard one for this category.
    ("Hybrid Scheme - Arbitrage Fund", "nifty_50_arbitrage"),
])
def test_each_category_gets_its_standard_index_labelled_by_category(category, key):
    choice = pick(category)
    assert (choice.index_key, choice.source, choice.declared_name) == (key, "category", None)
    assert choice.label == "Chosen by the fund's category"
    assert choice.window_start_note and index_label(key) in choice.window_start_note


@pytest.mark.parametrize("category", [
    "Equity Scheme - Large Cap Fund", "Equity Scheme - Mid Cap Fund", "Equity Scheme - Small Cap Fund",
    "Equity Scheme - Large & Mid Cap Fund", "Equity Scheme - Multi Cap Fund", "Equity Scheme - Flexi Cap Fund",
    "Equity Scheme - ELSS", "Equity Scheme - Focused Fund", "Equity Scheme - Value Fund", "Equity Scheme - Contra Fund",
    "Equity Scheme - Dividend Yield Fund", "Equity Scheme - Sectoral/ Thematic", "Equity Scheme - Mid cap",
    "EQUITY", "Equity Scheme - Large & Midcap Fund",
])
def test_table_reproduces_the_old_if_chain_for_every_equity_category(category):
    """The old inline chain, copied here: small, then large-without-mid, then the legacy function."""
    lower = category.lower()
    if "small" in lower:
        old = "nifty_smallcap_250"
    elif "large" in lower and "mid" not in lower:
        old = "nifty_100"
    else:
        old = _benchmark_index_for_category(category).value
    assert pick(category).index_key == old


# ---- order of preference --------------------------------------------------------------------

def test_factsheet_beats_closest_beats_category_beats_none():
    cat = "Equity Scheme - Mid Cap Fund"
    assert pick(cat, declared="Nifty Midcap 100 TRI", mapped="nifty_midcap_100").source == "factsheet"
    # named index not held, but a published parent we hold exists
    closest = pick(cat, declared="Nifty Midcap 50 TRI")
    assert (closest.index_key, closest.source) == ("nifty_midcap_150", "closest")
    # no named index at all: category
    assert pick(cat).source == "category"
    # nothing defensible: none
    assert pick("Debt Scheme - Liquid Fund").source == "none"


def test_closest_is_preferred_over_the_category_index_when_the_named_index_has_a_close_sibling():
    choice = pick("Equity Scheme - Small Cap Fund", declared="Nifty Smallcap250 Momentum Quality 100 TRI")
    assert (choice.index_key, choice.source) == ("nifty_smallcap_250", "closest")
    # A named index with a close sibling beats the category's own index: a mid cap fund naming the
    # Nifty Financial Services 25/50 gets the financial services index, not the Midcap 150.
    choice = pick("Equity Scheme - Mid Cap Fund", declared="Nifty Financial Services 25/50 TRI")
    assert (choice.index_key, choice.source) == ("nifty_financial_services", "closest")
    assert choice.declared_name == "Nifty Financial Services 25/50 TRI"
    assert "Nifty Financial Services" in choice.window_start_note


# ---- W8: names registered on 3 Nov 2026 are step 1 (their own series), not step 2 ------------------

@pytest.mark.parametrize("category,declared,key", [
    ("Equity Scheme - Large Cap Fund", "Nifty 100 ESG Index TRI", "nifty100_esg"),
    ("Equity Scheme - Large Cap Fund", "Nifty 50 Value 20 TRI", "nifty50_value_20"),
    ("Equity Scheme - Flexi Cap Fund", "Nifty 500 Quality 50 TRI", "nifty500_quality_50"),
    ("Equity Scheme - Value Fund", "Nifty 500 Value 50 TRI", "nifty500_value_50"),
    ("Equity Scheme - Mid Cap Fund", "Nifty Midcap150 Momentum 50 TRI", "nifty_midcap150_momentum_50"),
    ("Equity Scheme - Small Cap Fund", "Nifty Smallcap250 Quality 50 TRI", "nifty_smallcap250_quality_50"),
    ("Other Scheme - Index Funds", "Nifty 200 Alpha 30 TRI", "nifty200_alpha_30"),
    ("Other Scheme - Index Funds", "Nifty100 Equal Weight Index (TRI)", "nifty100_equal_weight"),
    ("Equity Scheme - Sectoral/ Thematic", "Nifty Auto TRI", "nifty_auto"),
])
def test_a_newly_registered_index_named_by_the_factsheet_gets_its_own_series(category, declared, key):
    from app.services.analytics.benchmark_names import normalise_benchmark_name
    match = normalise_benchmark_name(declared)   # what the importer stores in mapped_index_key / match_quality
    assert (match.key, match.quality) == (key, "exact")
    choice = pick(category, declared=declared, mapped=match.key, quality=match.quality)
    assert (choice.index_key, choice.source, choice.declared_name) == (key, "factsheet", declared)
    assert choice.window_start_note is None
    assert choice.label == "From the fund's factsheet"


def test_a_newly_registered_index_switched_off_falls_to_the_category_index():
    flags = {**ACTIVE, "nifty100_esg": False}
    choice = pick("Equity Scheme - Large Cap Fund", declared="Nifty 100 ESG Index TRI", mapped="nifty100_esg", active=flags)
    # Not held, and no longer a closest row either: the category's index, labelled as the closest we hold.
    assert (choice.index_key, choice.source) == ("nifty_100", "closest")


def test_the_closest_table_keeps_only_names_that_are_not_registered():
    assert [row.declared for row in sel.CLOSEST_INDEX] == [
        "Nifty Midcap 50", "Nifty Smallcap250 Momentum Quality 100", "Nifty Financial Services 25/50"]


def test_a_registered_named_index_that_is_switched_off_falls_to_closest_then_category():
    flags = {**ACTIVE, "nifty_midcap_100": False}
    choice = pick("Equity Scheme - Mid Cap Fund", declared="Nifty Midcap 100 TRI", mapped="nifty_midcap_100", active=flags)
    assert (choice.index_key, choice.source) == ("nifty_midcap_150", "closest")


def test_closest_target_switched_off_falls_to_category():
    flags = {**ACTIVE, "nifty_midcap_150": False, "nifty_500": True}
    choice = pick("Equity Scheme - Flexi Cap Fund", declared="Nifty Midcap 50 TRI", active=flags)
    assert (choice.index_key, choice.source) == ("nifty_500", "closest")  # legacy label: a named index is not held
    flags["nifty_500"] = False
    assert pick("Equity Scheme - Flexi Cap Fund", declared="Nifty Midcap 50 TRI", active=flags).source == "none"


def test_declared_name_with_no_close_sibling_keeps_the_existing_closest_label_on_the_category_index():
    choice = pick("Equity Scheme - Large Cap Fund", declared="BSE Quality Index")
    assert (choice.index_key, choice.source, choice.declared_name) == ("nifty_100", "closest", "BSE Quality Index")
    assert choice.window_start_note == (
        "We don't have this fund's own benchmark, so it is compared with the Nifty 100, the closest index we hold.")


def test_blend_keeps_the_mix_note():
    choice = pick("Equity Scheme - Flexi Cap Fund", declared="65% Nifty 500 + 35% Nifty 50")
    assert choice.source == "closest" and choice.window_start_note.startswith("This fund's benchmark is a mix: 65% Nifty 500")


def test_factsheet_and_proxy_quality_labels_are_unchanged():
    assert pick("Equity Scheme - Large Cap Fund", declared="BSE 100 TRI", mapped="nifty_100", quality="proxy").source == "closest"
    tracked = pick("Other Scheme - Index Funds", declared="Nifty 500 TRI", mapped="nifty_500", tracked="nifty_50", tracked_quality="proxy")
    assert (tracked.index_key, tracked.source) == ("nifty_50", "closest")
    assert pick("Other Scheme - Index Funds", declared="Nifty 500 TRI", mapped="nifty_500", tracked="nifty_next_50").source == "factsheet"


# ---- must end on none (and say printed when the factsheet printed a benchmark) ---------------

@pytest.mark.parametrize("category", [
    "Debt Scheme - Liquid Fund", "Debt Scheme - Overnight Fund", "Debt Scheme - Gilt Fund",
    "Hybrid Scheme - Aggressive Hybrid Fund", "Hybrid Scheme - Dynamic Asset Allocation or Balanced Advantage",
    "Hybrid Scheme - Multi Asset Allocation", "Hybrid Scheme - Conservative Hybrid Fund",
    "Solution Oriented Scheme - Retirement Fund", "Other Scheme - Index Funds", "Other Scheme - Other ETFs",
    "Other Scheme - FoF Domestic", "Other Scheme - FoF Overseas", "Other Scheme - Gold ETF", "Unclassified", "",
])
def test_no_defensible_benchmark_ends_on_none(category):
    choice = pick(category)
    assert (choice.index_key, choice.source, choice.window_start_note) == (None, "none", None)
    assert choice.label == "No benchmark"


@pytest.mark.parametrize("category,name,declared", [
    ("Other Scheme - Gold ETF", "Some Gold ETF", "Domestic Price of Gold"),
    ("Other Scheme - Other ETFs", "Some Silver ETF", "Domestic Price of Physical Silver"),
    ("Other Scheme - Other ETFs", "Some Gold ETF", "FTSE Gold Mine TRI (in INR terms)"),
])
def test_gold_and_silver_funds_stay_on_printed_returns_only(category, name, declared):
    choice = pick(category, name=name, declared=declared)
    assert (choice.index_key, choice.source) == (None, "none")
    assert choice.label == "As printed in the fund house's factsheet"


def test_unlisted_unreadable_house_funds_fail_closed_never_guessed():
    """UTI and Groww passive readers do not exist yet: no stored row, so nothing is inferred from the name."""
    for name in ("UTI Nifty 50 Index Fund", "Groww Nifty Total Market Index Fund", "UTI Nifty Next 50 Index Fund"):
        choice = pick("Other Scheme - Index Funds", name=name)
        assert (choice.index_key, choice.source) == (None, "none")


@pytest.mark.parametrize("category,name,declared", [
    # Run 7 backend review: the category step gave these Nifty 500 and called it the closest index we hold.
    ("Index Funds - Equity Funds", "XYZ Nifty Next 50 Index Fund", "Nifty Next 50 TRI"),
    ("Index Funds - Equity Funds", "Motilal Oswal S&P 500 Index Fund", "S&P 500 TRI"),
    ("Exchange Traded Funds (ETFs) - Equity ETF", "ABC Nifty Bank ETF", "Nifty Bank TRI"),
    ("Equity Scheme - Sectoral/Thematic", "ICICI Prudential US Bluechip Equity Fund", "S&P 500 TRI"),
    ("Equity Scheme - Sectoral/ Thematic", "Franklin India Feeder Franklin US Opportunities", "Russell 3000 Growth"),
    ("Fund of Funds - Equity Oriented", "X Equity FoF", "Nifty 500 TRI"),
    ("Equity Scheme - Sectoral/Thematic", "X Gold Mining Equity Fund", "NYSE Arca Gold Miners"),
])
def test_wrapper_overseas_and_gold_miner_funds_never_get_the_domestic_category_index(category, name, declared):
    choice = pick(category, name=name, declared=declared)
    assert (choice.index_key, choice.source) == (None, "none")


def test_an_ordinary_domestic_equity_fund_with_an_unheld_index_still_gets_its_category_index():
    choice = pick("Equity Scheme - Multi Cap Fund", name="X Multi Cap Fund", declared="Some Unheld TRI")
    assert (choice.index_key, choice.source) == ("nifty_500", "closest")


def test_unknown_category_ends_on_none():
    assert pick("Some Brand New Category - Weird Fund").source == "none"


def test_closest_never_crosses_asset_class():
    # A debt, gold, overseas or hybrid fund that somehow names an equity index is not given an equity sibling.
    for category, name in [("Debt Scheme - Liquid Fund", "Liquid Fund"),
                           ("Other Scheme - Gold ETF", "Some Gold ETF"),
                           ("Other Scheme - FoF Overseas", "Some Nasdaq 100 FoF"),
                           ("Hybrid Scheme - Aggressive Hybrid Fund", "Hybrid Fund")]:
        assert pick(category, name=name, declared="Nifty Midcap 50 TRI").source == "none"


def test_passive_equity_fund_with_a_close_sibling_gets_closest():
    choice = pick("Other Scheme - Index Funds", name="Some Midcap 50 Index Fund", declared="Nifty Midcap 50 TRI")
    assert (choice.index_key, choice.source) == ("nifty_midcap_150", "closest")


def test_non_equity_label_is_printed_only_when_a_benchmark_was_declared():
    assert pick("Debt Scheme - Liquid Fund", declared="CRISIL Liquid Debt A-I").label == "As printed in the fund house's factsheet"
    assert pick("Debt Scheme - Liquid Fund").label == "No benchmark"


# ---- table hygiene -------------------------------------------------------------------------

def test_every_table_target_is_registered_equity_family_or_the_arbitrage_row():
    for row in sel.CLOSEST_INDEX:
        spec = get_index(row.target)
        assert spec.family == "equity" and spec.active, row
        assert row.why.strip(), row
    for row in sel.CATEGORY_INDEX:
        spec = get_index(row.target)
        assert spec.active and row.why.strip(), row
        assert spec.family == ("arbitrage" if row.bucket == "Hybrid" else "equity"), row


def test_closest_names_are_unique_and_never_name_a_registered_index():
    from app.services.analytics.benchmark_names import canonical_index_name
    canon = [canonical_index_name(row.declared) for row in sel.CLOSEST_INDEX]
    assert len(canon) == len(set(canon))
    registered = {canonical_index_name(spec.nse_name) for spec in INDICES} | {canonical_index_name("Nifty LargeMidcap 250")}
    assert not registered & set(canon)  # exact names are step 1's job
    assert all("gold" not in c and "silver" not in c and "crisil" not in c and "nasdaq" not in c for c in canon)


def test_category_rows_match_the_equity_enum_indices_that_exist():
    assert {row.target for row in sel.CATEGORY_INDEX} <= {spec.key for spec in INDICES}
    assert BenchmarkIndex.NIFTY_100.value in {row.target for row in sel.CATEGORY_INDEX}


def test_backend_labels_match_the_frontend_words():
    ts = Path(__file__).resolve().parents[4] / "frontend/src/lib/benchmarkDisplay.ts"
    if not ts.is_file():
        pytest.skip("frontend file not in this checkout")
    text = ts.read_text(encoding="utf-8")
    # Only the labels object: BENCHMARK_SOURCE_EXPLANATIONS has the same keys and would overwrite these.
    block = re.search(r"BENCHMARK_SOURCE_LABELS = \{(.*?)\} as const", text, re.S).group(1)
    found = dict(re.findall(r'^\s{2}(\w+): "([^"]+)",?$', block, re.M))
    assert {k: found[k] for k in sel.SOURCE_LABELS} == sel.SOURCE_LABELS
    assert re.search(r'BENCHMARK_PRINTED_LABEL = "([^"]+)"', text).group(1) == sel.PRINTED_LABEL


# ---- the database reader uses the same function --------------------------------------------

def _scheme(db, category, key, name=None):
    return add_scheme(db, key, category, SchemePlanType.DIRECT, key, name=name)


def _row(db, fund, declared, mapped=None, quality="none"):
    db.add(SchemeBenchmark(scheme_id=fund.id, declared_benchmark_name=declared, mapped_index_key=mapped,
                           match_quality=quality, source="factsheet", verified_on=date(2026, 10, 1)))
    db.commit()


def test_reader_and_pure_function_agree_for_every_ordered_case(db_session):
    midcap = _scheme(db_session, "Equity Scheme - Mid Cap Fund", "m1")
    _row(db_session, midcap, "Nifty Midcap 50 TRI")
    arb = _scheme(db_session, "Hybrid Scheme - Arbitrage Fund", "a1")
    gold = _scheme(db_session, "Other Scheme - Gold ETF", "g1", name="Some Gold ETF")
    _row(db_session, gold, "Domestic Price of Gold")
    unknown = _scheme(db_session, "Mystery - Fund", "u1")
    picks = benchmark_choices(db_session, {s.id: s for s in (midcap, arb, gold, unknown)})
    assert [(picks[s.id].index_key, picks[s.id].source) for s in (midcap, arb, gold, unknown)] == [
        ("nifty_midcap_150", "closest"), ("nifty_50_arbitrage", "category"), (None, "none"), (None, "none")]
    assert picks[gold.id].label == "As printed in the fund house's factsheet"
    assert picks[midcap.id].declared_name == "Nifty Midcap 50 TRI"


def test_reader_respects_a_switched_off_master_row(db_session):
    from app.models.reference import BenchmarkIndexMaster
    spec = get_index("nifty_50_arbitrage")
    db_session.add(BenchmarkIndexMaster(key=spec.key, nse_name=spec.nse_name, family=spec.family, source=spec.source,
                                        return_type=spec.return_type, active=False))
    db_session.commit()
    arb = _scheme(db_session, "Hybrid Scheme - Arbitrage Fund", "a2")
    assert benchmark_choices(db_session, {arb.id: arb})[arb.id].source == "none"


def test_equity_savings_ends_on_none_not_on_an_equity_index():
    # Owner rule, 3 Nov 2026: never show a wrong index. Equity Savings funds (large debt and arbitrage share)
    # used to get the Nifty 500 because the word "equity" puts them in the equity bucket.
    choice = pick("Hybrid Scheme - Equity Savings")
    assert (choice.index_key, choice.source) == (None, "none")
    assert choice.label == "No benchmark"
    named = pick("Hybrid Scheme - Equity Savings", declared="Nifty Equity Savings Index")
    assert (named.index_key, named.source) == (None, "none")
    assert named.label == "As printed in the fund house's factsheet"
