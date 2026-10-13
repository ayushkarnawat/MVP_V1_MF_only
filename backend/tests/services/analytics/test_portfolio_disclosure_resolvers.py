# backend/tests/services/analytics/test_portfolio_disclosure_resolvers.py
from app.services.analytics.portfolio_disclosure_resolvers import (
    AMC_DISCLOSURE_RESOLVERS, DisclosureFileShape, DisclosureResolverKind,
)


def test_every_registry_key_follows_the_amc_name_convention():
    # F4b, part 1: `refresh_portfolio_disclosures` filters `Scheme` by exact string match
    # on `amc_name`, which the scheme master always populates as "<X> Mutual Fund" (AMFI's
    # own convention) -- never an informal name like "Union Asset Management" (the
    # spike's own prose for Union MF, confirmed not what scheme master stores). A
    # one-off fixture snapshotting every live scheme-master name would drift out of sync
    # with the real table the moment a new AMC launches; this check instead enforces the
    # *convention* itself, which catches the exact bug class this plan has already hit
    # once (Union) for free, forever, with no fixture to maintain. Before Task 6 ships,
    # cross-check this list once against `SELECT DISTINCT amc_name FROM schemes` live --
    # that one-time manual check (not an automated test) is what actually catches a
    # convention-following key that's still spelled subtly wrong (the ongoing automated
    # backstop is the runtime zero_schemes_matched alert in Task 6, which fires forever).
    for amc_name in AMC_DISCLOSURE_RESOLVERS:
        assert amc_name.endswith("Mutual Fund"), f"{amc_name!r} doesn't match scheme master's AMC-name convention"


def test_nippon_india_is_onboarded_as_single_workbook_multi_sheet():
    entry = AMC_DISCLOSURE_RESOLVERS["Nippon India Mutual Fund"]
    assert entry.kind is DisclosureResolverKind.STATIC_REGEX
    assert entry.file_shape is DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET
    assert entry.landing_url == "https://mf.nipponindiaim.com/investor-service/downloads/factsheet-portfolio-and-other-disclosures/"
    assert entry.link_pattern == r"MONTHLY-PORTFOLIO"


def test_helios_is_onboarded_as_multi_file_single_scheme_excluding_fortnightly():
    entry = AMC_DISCLOSURE_RESOLVERS["Helios Mutual Fund"]
    assert entry.file_shape is DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME
    assert entry.exclude_pattern == r"fortnightly"


def test_union_is_onboarded_as_deterministic_template():
    entry = AMC_DISCLOSURE_RESOLVERS["Union Mutual Fund"]
    assert entry.file_shape is DisclosureFileShape.DETERMINISTIC_TEMPLATE
    assert "{scheme_slug}" in entry.url_template
    assert "{dd}" in entry.url_template and "{yyyy}" in entry.url_template


def test_hdfc_is_onboarded_as_wayback_locate_with_a_separate_cdn_domain():
    entry = AMC_DISCLOSURE_RESOLVERS["HDFC Mutual Fund"]
    assert entry.kind is DisclosureResolverKind.WAYBACK_LOCATE
    assert entry.cdn_domain == "files.hdfcfund.com"


def test_alphagrep_uses_the_captured_manifest():
    # Capture: www host plus manifest; scheme folder names are not derivable.
    entry = AMC_DISCLOSURE_RESOLVERS["AlphaGrep Mutual Fund"]
    assert entry.kind is DisclosureResolverKind.JSON_API
    assert entry.endpoint_url == "https://www.alphagrepmf.ai/assets/documents/files.json"
    assert entry.url_template is None


def test_kotak_mahindra_is_onboarded_as_a_direct_date_built_template():
    # F4b: missing from the registry entirely until this pass, despite being resolved
    # (sixth pass, 2026-10-12) -- the original spike's filename guess had the wrong
    # path prefix/naming convention, which is why it 403'd even though the real file
    # was already live.
    # Decided 2026-10-13 (amc-coverage.html Q16): re-onboarded again as a direct
    # DETERMINISTIC_TEMPLATE fetch instead of WAYBACK_LOCATE -- the path is date-built,
    # not something that needs an archive lookup every month.
    entry = AMC_DISCLOSURE_RESOLVERS["Kotak Mahindra Mutual Fund"]
    assert entry.kind is DisclosureResolverKind.STATIC_REGEX
    assert entry.file_shape is DisclosureFileShape.DETERMINISTIC_TEMPLATE
    assert entry.cdn_domain == "vatseelabs-s3.kotakmf.com"
    assert "Consolidated-SEBI-Portfolio-as-on" in entry.url_template


def test_navi_is_onboarded_as_json_api_with_the_documented_wordpress_endpoint():
    # The spike recorded this endpoint literally (not just a qualitative mechanism
    # description), and attribute 04's own resolver for the same domain
    # (fund_manager_resolvers.py) independently confirms the exact request shape
    # (POST with financial_year/month/category + a WP-NONCE scraped from the page).
    entry = AMC_DISCLOSURE_RESOLVERS["Navi Mutual Fund"]
    assert entry.kind is DisclosureResolverKind.JSON_API
    assert entry.endpoint_url == "https://navi.com/wp-json/nv/v1/documents"


def test_jio_blackrock_uses_the_captured_server_action():
    # The captured portfolio page uses its own slug and opaque file ids.
    entry = AMC_DISCLOSURE_RESOLVERS["Jio BlackRock Mutual Fund"]
    assert entry.kind is DisclosureResolverKind.JSON_API
    assert "server-action POST" in entry.note


def test_capture_corrected_registry_count_names_hosts_shapes_and_manual():
    assert len(AMC_DISCLOSURE_RESOLVERS) == 51
    assert "The Wealth Company Mutual Fund" in AMC_DISCLOSURE_RESOLVERS
    assert "Monarch Mutual Fund" in AMC_DISCLOSURE_RESOLVERS
    assert "WhiteOak Capital Mutual Fund" not in AMC_DISCLOSURE_RESOLVERS
    monarch = AMC_DISCLOSURE_RESOLVERS["Monarch Mutual Fund"]
    assert monarch.landing_url == "https://www.monarchamc.in/forms-downloads/portfolio-holdings/monthly"
    assert monarch.link_pattern == r"Monthly_Portfolio_Monarch_"
    assert AMC_DISCLOSURE_RESOLVERS["Bandhan Mutual Fund"].kind is DisclosureResolverKind.MANUAL
    assert AMC_DISCLOSURE_RESOLVERS["Bank of India Mutual Fund"].endpoint_url == "https://www.boimf.in/AjaxService.asmx/GetDocuments"
    assert AMC_DISCLOSURE_RESOLVERS["SBI Mutual Fund"].endpoint_url.endswith("/GetSchemePortfolioSheets")
    assert AMC_DISCLOSURE_RESOLVERS["Aditya Birla Sun Life Mutual Fund"].file_shape is DisclosureFileShape.ZIP_OF_WORKBOOKS
    assert AMC_DISCLOSURE_RESOLVERS["PPFAS Mutual Fund"].link_pattern == r"/PPFAS_Monthly_Portfolio_Report"


def test_captured_chains_and_payloads_are_deferred_with_evidence_notes():
    amcs = ["Franklin Templeton", "AlphaGrep", "Tata", "Jio BlackRock", "quant",
            "ICICI Prudential", "Abakkus", "Navi", "PGIM India", "Sundaram", "Bajaj Finserv",
            "UTI", "SBI", "LIC", "Axis", "Trust", "Mirae Asset", "Aditya Birla Sun Life",
            "Bank of India", "Taurus"]
    for amc in amcs:
        entry = AMC_DISCLOSURE_RESOLVERS[f"{amc} Mutual Fund"]
        assert entry.kind is DisclosureResolverKind.JSON_API
        assert "Capture 2026-10-13" in entry.note
        assert "Task 11" in entry.note


def test_fix_l4_canara_excludes_midmonth_fortnightly_links():
    import re
    entry = AMC_DISCLOSURE_RESOLVERS["Canara Robeco Mutual Fund"]
    midmonth = "BP-%E2%80%93-Canara-Robeco-Banking-and-PSU-Debt-Fund-%E2%80%93-15th-September-2026.xlsx"
    monthly = "SC-%E2%80%93-Canara-Robeco-Small-Cap-Fund-%E2%80%93-September-2026.xlsx"
    assert entry.exclude_pattern
    assert re.search(entry.exclude_pattern, midmonth, re.I)
    assert not re.search(entry.exclude_pattern, monthly, re.I)
