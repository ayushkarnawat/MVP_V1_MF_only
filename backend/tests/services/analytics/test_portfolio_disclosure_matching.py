import pytest
# backend/tests/services/analytics/test_portfolio_disclosure_matching.py
import uuid
from decimal import Decimal

from app.models.reference import Scheme
from app.services.analytics.amfi_factsheet_client import build_families
from app.services.analytics.portfolio_disclosure_matching import (
    MATCH_METHOD_EXACT, MATCH_METHOD_FUZZY, match_scheme_name,
)


def _scheme(amc, base_name, plan="Direct"):
    return Scheme(
        id=uuid.uuid4(), name=f"{base_name} - {plan} - Growth", amc_name=amc, base_name=base_name,
        sebi_category="Equity Scheme - Flexi Cap Fund",
    )


def test_exact_match_scoped_to_one_amc():
    families = build_families([_scheme("Nippon India Mutual Fund", "Nippon India Large Cap Fund")])
    result = match_scheme_name("Nippon India Large Cap Fund", families)
    assert result is not None
    family, method, confidence = result
    assert family.base_name == "Nippon India Large Cap Fund"
    assert method == MATCH_METHOD_EXACT
    assert confidence == Decimal("1.0")


def test_fuzzy_match_above_threshold():
    families = build_families([_scheme("Nippon India Mutual Fund", "Nippon India Large Cap Fund")])
    result = match_scheme_name("Nippon India Large Cap Fund - Equity", families)
    assert result is not None
    assert result[1] == MATCH_METHOD_FUZZY


def test_ambiguous_match_returns_none():
    families = build_families([
        _scheme("Test AMC", "Test AMC Large Cap Fund"),
        _scheme("Test AMC", "Test AMC Large Cap Fund - Series 2"),
    ])
    assert match_scheme_name("Test AMC Large Cap", families) is None


def test_no_confident_match_returns_none():
    families = build_families([_scheme("Test AMC", "Test AMC Large Cap Fund")])
    assert match_scheme_name("Completely Unrelated Sheet Name", families) is None


def test_fully_named_base_resolves_despite_series_variant():
    families = build_families([
        _scheme("Test AMC", "Test AMC Large Cap Fund"),
        _scheme("Test AMC", "Test AMC Large Cap Fund - Series 2"),
    ])
    assert match_scheme_name("Test AMC Large Cap Fund", families)[0].base_name == "Test AMC Large Cap Fund"


def test_empty_name_never_matches_and_duplicate_exact_names_are_ambiguous():
    families = build_families([_scheme("Test AMC", "Test AMC Large Cap Fund")])
    assert match_scheme_name("", families) is None
    assert match_scheme_name("Test AMC Large Cap Fund", families + families) is None


def test_canonicalizer_matches_existing_family_note_rules():
    families = build_families([_scheme("Test AMC", "Test AMC Large Cap Fund (Erstwhile Old Fund)")])
    match = match_scheme_name("Test AMC Large Cap Fund (Erstwhile Old Fund)", families)
    assert match is not None
    assert match[1] == MATCH_METHOD_EXACT


@pytest.mark.parametrize("raw,candidate", [
    ("ICICI Prudential Silver ETF FOF", "ICICI Prudential Gold ETF FOF"),
    ("HDFC Nifty 100 Index Fund", "HDFC Nifty 50 Index Fund"),
    ("SBI Nifty 50 Index Fund", "SBI Nifty 50 ETF"),
    ("HDFC Nifty Next 50 Index Fund", "HDFC Nifty 50 Index Fund"),
    ("HDFC Nifty100 Index Fund", "HDFC Nifty50 Index Fund"),
])
def test_fix_m3_fuzzy_veto_preserves_numbers_and_instrument_identity(raw, candidate):
    assert match_scheme_name(raw, build_families([_scheme("Test AMC", candidate)])) is None


def test_fix_m3_fof_spelling_expansion_preserves_the_same_identity():
    families = build_families([_scheme("Test AMC", "ICICI Prudential Silver ETF Fund of Funds")])
    match = match_scheme_name("ICICI Prudential Silver ETF FOF", families)
    assert match is not None
    assert match[1] == MATCH_METHOD_FUZZY
