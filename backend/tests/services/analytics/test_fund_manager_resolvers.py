# backend/tests/services/analytics/test_fund_manager_resolvers.py
from app.services.analytics.fund_manager_layouts import LAYOUTS
from app.services.analytics.fund_manager_resolvers import AMC_RESOLVERS, ResolverKind


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
