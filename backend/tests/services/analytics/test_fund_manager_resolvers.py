# backend/tests/services/analytics/test_fund_manager_resolvers.py
from app.services.analytics.fund_manager_layouts import LAYOUTS
from app.services.analytics.fund_manager_resolvers import AMC_RESOLVERS, ResolverKind
import pytest


@pytest.mark.parametrize("amc,layout,landing", [
    ("Abakkus Mutual Fund", "abakkus", "https://www.abakkusmf.com/factsheet.html"),
    ("Canara Robeco Mutual Fund", "canara", "https://www.canararobeco.com/documents/forms-downloads/forms-information-documents/information-documents/factsheets/"),
    ("Capitalmind Mutual Fund", "capitalmind", "https://capitalmindmf.com/factsheet.html"),
    ("Groww Mutual Fund", "groww", "https://www.growwmf.in/downloads/fact-sheet"),
    ("Helios Mutual Fund", "helios", "https://www.heliosmf.in/downloads"),
    ("HSBC Mutual Fund", "hsbc", "https://www.assetmanagement.hsbc.co.in/en/mutual-funds/investor-resources?Doc=fund-factsheets"),
])
def test_batch_one_verified_sources_are_enabled(amc, layout, landing):
    entry = AMC_RESOLVERS[amc]
    assert entry.kind is ResolverKind.STATIC_LINK
    assert entry.layout == layout
    assert entry.landing_url == landing


@pytest.mark.parametrize("amc,reason", [
    ("Bajaj Finserv Mutual Fund", "stale"),
    ("LIC Mutual Fund", "geometry"),
])
def test_blocked_batch_one_amcs_remain_disabled_with_auditable_notes(amc, reason):
    entry = AMC_RESOLVERS[amc]
    assert entry.layout is None
    assert reason in entry.note.lower()


def test_dsp_uses_verified_download_api():
    entry = AMC_RESOLVERS["DSP Mutual Fund"]
    assert entry.kind is ResolverKind.JSON_API
    assert entry.layout == "dsp"
    assert entry.response_json_path == "data"
    assert entry.endpoint_url == "https://www.dspim.com/downloads.json?page=1&per_page=10&category=Information%20Documents&sub_category=Factsheets"


def test_absl_uses_its_verified_monthly_factsheet_api_and_current_reader():
    entry = AMC_RESOLVERS["Aditya Birla Sun Life Mutual Fund"]
    assert entry.kind is ResolverKind.JSON_API
    assert entry.layout == "absl_september"
    assert entry.response_json_path == "MonthlyFactsheets"
    assert "GetMonthlyFactsheetsByYear?datasourceId=" in entry.endpoint_url


def test_every_amfi_fund_house_with_schemes_is_listed():
    # 55 of AMFI's 57 directory AMCs have schemes in NAVAll on 9 Oct (Carnelian, Nuvama have none).
    assert len(AMC_RESOLVERS) == 55


def test_every_entry_names_its_amfi_directory_company():
    assert all(entry.directory_name for entry in AMC_RESOLVERS.values())


def test_layouts_exist_for_every_onboarded_amc():
    for amc, entry in AMC_RESOLVERS.items():
        assert entry.layout is None or entry.layout in LAYOUTS, amc


def test_manual_amcs_say_why_and_have_a_reader():
    for amc, entry in AMC_RESOLVERS.items():
        if entry.kind is ResolverKind.MANUAL:
            assert entry.note and entry.layout, amc


def test_json_api_entries_have_an_endpoint():
    for amc, entry in AMC_RESOLVERS.items():
        if entry.kind is ResolverKind.JSON_API:
            assert entry.endpoint_url, amc
