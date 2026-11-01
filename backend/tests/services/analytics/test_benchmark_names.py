import importlib
from decimal import Decimal
import pytest


def normalise(raw):
    return importlib.import_module("app.services.analytics.benchmark_names").normalise_benchmark_name(raw)


@pytest.mark.parametrize("raw", ["Nifty 50 TRI", "NIFTY 50 (TRI)", "Nifty 50 Total Return Index", "Nifty 50 Total Returns Index (TRI)"])
def test_variants_of_nifty_50_tri_map_to_one_key(raw):
    assert normalise(raw).key == "nifty_50"
    assert normalise(raw).quality == "exact"


def test_bse_500_tri_is_a_labelled_nse_500_proxy():
    match = normalise("S&P BSE 500 TRI")
    assert (match.key, match.quality, match.declared_name) == ("nifty_500", "proxy", "S&P BSE 500 TRI")


def test_crisil_series_returns_none_and_keeps_the_declared_name():
    raw = "CRISIL Hybrid 50+50 - Moderate Index"
    match = normalise(raw)
    assert (match.key, match.quality, match.declared_name) == (None, "none", raw)


@pytest.mark.parametrize("raw", ["65% Nifty 50 TRI + 35% CRISIL Composite Debt Index", "Nifty 50 TRI (65%) + CRISIL Composite Debt Index (35%)"])
def test_blend_is_split_into_components_with_weights_or_marked_not_available(raw):
    match = normalise(raw)
    assert match.key is None and match.quality == "none"
    assert [weight for _, weight in match.blend] == [Decimal("65"), Decimal("35")]


@pytest.mark.parametrize("raw,key", [("Nifty 50 Index", "nifty_50"), ("BSE 500 Index", "nifty_500")])
def test_price_only_name_is_treated_as_tri_and_marked(raw, key):
    match = normalise(raw)
    assert match.key == key and match.price_only_as_tri


def test_unknown_or_nearby_names_are_never_guessed():
    for raw in ("Nifty 50 Equal Weight TRI", "Nifty 500 Value 50 TRI", "Nifty Midcap 50 TRI", "NASDAQ 100 TRI"):
        assert normalise(raw).key is None
