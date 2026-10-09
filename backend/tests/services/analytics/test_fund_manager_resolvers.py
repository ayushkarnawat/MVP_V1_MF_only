# backend/tests/services/analytics/test_fund_manager_resolvers.py
from app.services.analytics.fund_manager_layouts import LAYOUTS
from app.services.analytics.fund_manager_resolvers import AMC_RESOLVERS, ResolverKind
import pytest


@pytest.mark.parametrize("amc,layout,landing", [
    ("Zerodha Mutual Fund", "zerodha", "https://www.zerodhafundhouse.com/resources/fund-documents"),
    ("Unifi Mutual Fund", "unifi", "https://unifimf.com/factsheet/"),
    ("Shriram Mutual Fund", "shriram", "https://www.shriramamc.in/factsheet"),
    ("Quantum Mutual Fund", "quantum", "https://www.quantumamc.com/factsheets/combined/-1/0/0"),
    ("PPFAS Mutual Fund", "ppfas", "https://amc.ppfas.com/downloads/factsheet/index.php#axzz4I2KR6um7"),
    ("NJ Mutual Fund", "nj", "https://downloads.njmutualfund.com/downloads.php"),
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
])
def test_blocked_batch_one_amcs_remain_disabled_with_auditable_notes(amc, reason):
    entry = AMC_RESOLVERS[amc]
    assert entry.layout is None
    assert reason in entry.note.lower()


def test_lic_is_enabled_with_positional_summary_reader():
    entry = AMC_RESOLVERS["LIC Mutual Fund"]
    assert entry.layout == "lic"
    assert entry.needs_boxes is True
    assert entry.landing_url == "https://www.licmf.com/downloads/factsheet"


@pytest.mark.parametrize("amc,reason", [("Mirae Asset Mutual Fund", "two"), ("Samco Mutual Fund", "June")])
def test_batch_two_blockers_remain_disabled_and_explained(amc, reason):
    entry = AMC_RESOLVERS[amc]
    assert entry.layout is None
    assert reason in (entry.note or "")


def test_sundaram_uses_verified_public_archive_api():
    entry = AMC_RESOLVERS["Sundaram Mutual Fund"]
    assert entry.kind is ResolverKind.JSON_API
    assert entry.layout == "sundaram"
    assert entry.endpoint_url == "https://www.sundarammutual.com/ajax/Modules_Forms_Downloads_Fundwise_Factsheet,App_Web_4pv3qucy.ashx?_method=DownloadArchive&_session=no"


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
def test_quant_registry_uses_its_verified_aum_caption():
    from app.services.analytics.fund_manager_resolvers import AMC_RESOLVERS
    entry = AMC_RESOLVERS["quant Mutual Fund"]
    assert entry.layout == "quant"
    assert entry.as_on_pattern == r"\bAUM\s*\((\d{1,2}\s+[A-Za-z]+\s+\d{4})\)"


def test_pgim_uses_live_verified_published_forms_and_reader():
    entry = AMC_RESOLVERS["PGIM India Mutual Fund"]
    assert entry.layout == "pgim"
    assert entry.endpoint_url == "https://www.pgimindia.com/api/v1/brochure/published/form"
    assert entry.response_json_path == "data.tab_0007"


@pytest.mark.parametrize("amc,reason", [
    ("Mirae Asset Mutual Fund", "first 12"), ("Choice Mutual Fund", "first 12"),
    ("UTI Mutual Fund", "76/88"), ("Axis Mutual Fund", "403"),
    ("ICICI Prudential Mutual Fund", "404"), ("ITI Mutual Fund", "403"),
    ("Trust Mutual Fund", "204"), ("WhiteOak Capital Mutual Fund", "403"),
])
def test_run_five_blocked_amcs_keep_proof_without_guessing_a_reader(amc, reason):
    entry = AMC_RESOLVERS[amc]
    assert entry.layout is None
    assert entry.kind is ResolverKind.JSON_API
    assert reason in entry.note


def test_mirae_and_uti_require_both_monthly_documents():
    assert AMC_RESOLVERS["Mirae Asset Mutual Fund"].documents == (r"active-factsheet", r"passive-factsheet")
    assert AMC_RESOLVERS["UTI Mutual Fund"].documents == (r"watch_active", r"watch_passive")
