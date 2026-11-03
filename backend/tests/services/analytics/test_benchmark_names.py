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
    # Equal Weight and Value 50 are registered since 3 Nov 2026 (W8); these are still not held.
    for raw in ("Nifty Midcap 50 TRI", "NASDAQ 100 TRI", "Nifty Healthcare Index TRI", "Nifty 10 Yr Benchmark G-Sec Index",
                "Nifty 50 Equal Weight Plus TRI", "Nifty 500 Value 40 TRI", "Nifty Smallcap250 Momentum Quality 100 TRI"):
        assert normalise(raw).key is None


# ---- W8: the 56 indices registered 3 Nov 2026 --------------------------------------------------
# Two printed spellings per family. The normaliser ignores case, spacing, hyphens, brackets, "Index",
# "TRI" and "&" versus "and", so most spellings need no alias row.

@pytest.mark.parametrize("raw,key", [
    # factor and strategy
    ("Nifty 200 Quality 30 TRI", "nifty200_quality_30"),
    ("NIFTY200 Quality 30 Index (TRI)", "nifty200_quality_30"),
    ("Nifty 500 Value 50 TRI", "nifty500_value_50"),
    ("NIFTY500 Value 50 Total Returns Index", "nifty500_value_50"),
    ("Nifty Midcap150 Quality 50 TRI", "nifty_midcap150_quality_50"),
    ("Nifty Midcap 150 Quality 50 Index (TRI)", "nifty_midcap150_quality_50"),
    ("Nifty Alpha Low-Volatility 30 TRI", None),  # a different index, never mapped to Nifty Low Volatility 50
    ("Nifty500 Multicap Momentum Quality 50 TRI", "nifty500_multicap_momentum_quality_50"),
    ("Nifty MidSmallcap400 Momentum Quality 100 TRI", "nifty_midsmallcap400_momentum_quality_100"),
    ("Nifty Midsmall Cap 400 Momentum Quality 100 (TRI)", "nifty_midsmallcap400_momentum_quality_100"),
    ("Nifty 500 Flexi Cap Quality 30 TRI", "nifty500_flexicap_quality_30"),
    ("NIFTY500 Multifactor MQVLV 50 Index TRI", "nifty500_multifactor_mqvlv_50"),
    # ESG and Shariah
    ("Nifty 100 ESG Index TRI", "nifty100_esg"),
    ("NIFTY100 ESG TRI", "nifty100_esg"),
    ("Nifty100 Enhanced ESG Index (TRI)", "nifty100_enhanced_esg"),
    ("Nifty 100 ESG Sector Leaders TRI", "nifty100_esg_sector_leaders"),
    ("Nifty 500 Shariah TRI", "nifty500_shariah"),
    ("NIFTY500 SHARIAH Index (TRI)", "nifty500_shariah"),
    # equal weight and size
    ("Nifty 50 Equal Weight TRI", "nifty50_equal_weight"),
    ("Nifty50 Equal Weighted Index (TRI)", "nifty50_equal_weight"),
    ("Nifty 100 Equal Weight Index TRI", "nifty100_equal_weight"),
    ("Nifty 500 Equal Weighted TRI", "nifty500_equal_weight"),
    ("Nifty Top 20 Equal Weight TRI", "nifty_top_20_equal_weight"),
    ("Nifty 500 Large Mid Small Equal-Cap Weighted TRI", "nifty500_largemidsmall_equal_cap_weighted"),
    ("Nifty500 LargeMidSmall Equal Cap Weighted Index (TRI)", "nifty500_largemidsmall_equal_cap_weighted"),
    ("Nifty 500 Multicap India Manufacturing 50:30:20 TRI", "nifty500_multicap_india_manufacturing_50_30_20"),
    ("NIFTY500 MULTICAP INFRASTRUCTURE 50:30:20 Index (TRI)", "nifty500_multicap_infrastructure_50_30_20"),
    # sector and theme
    ("Nifty Auto TRI", "nifty_auto"),
    ("NIFTY AUTO Index (TRI)", "nifty_auto"),
    ("Nifty Pharma Total Return Index", "nifty_pharma"),
    ("Nifty PSU Bank TRI", "nifty_psu_bank"),
    ("Nifty Transportation and Logistics TRI", "nifty_transportation_logistics"),
    ("NIFTY Transportation & Logistics Index (TRI)", "nifty_transportation_logistics"),
    ("Nifty EV and New Age Automotive TRI", "nifty_ev_new_age_automotive"),
    ("Nifty EV & New Age Automotive Index (TRI)", "nifty_ev_new_age_automotive"),
    ("Nifty India Defence TRI", "nifty_india_defence"),
    ("Nifty Mid Small Healthcare TRI", "nifty_midsmall_healthcare"),
    ("NIFTY500 Healthcare Index TRI", "nifty500_healthcare"),
])
def test_new_index_spellings_resolve_to_their_key(raw, key):
    match = normalise(raw)
    assert match.key == key
    assert match.quality == ("exact" if key else "none")


def test_unregistered_healthcare_index_name_is_not_mapped_to_a_registered_healthcare_index():
    # NSE has no total-return series for plain "Nifty Healthcare Index"; the 500 and MidSmall ones are other indices.
    assert normalise("Nifty Healthcare Index TRI").key is None


def test_every_registered_index_resolves_from_its_own_name_and_two_printed_forms():
    from app.services.analytics.benchmark_registry import INDICES
    for spec in INDICES:
        for raw in (spec.nse_name, f"{spec.nse_name} TRI", f"{spec.nse_name} Index (TRI)"):
            assert normalise(raw).key == spec.key, (spec.key, raw)


def test_printed_name_without_tri_is_marked_price_only_for_a_new_index():
    match = normalise("Nifty 200 Quality 30 Index")
    assert match.key == "nifty200_quality_30" and match.price_only_as_tri
    assert not normalise("Nifty 200 Quality 30 TRI").price_only_as_tri


def test_equal_weighted_aliases_point_to_registered_keys_and_do_not_shadow_a_name():
    from app.services.analytics import benchmark_names as names
    from app.services.analytics.benchmark_registry import INDICES
    keys = {spec.key for spec in INDICES}
    assert set(names._PRINTED_ALIASES.values()) <= keys
    own = {names._canonical(spec.nse_name) for spec in INDICES}
    assert not own & {names._canonical(printed) for printed in names._PRINTED_ALIASES}
