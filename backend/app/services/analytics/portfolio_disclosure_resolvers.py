"""Declarative discovery registry. Capture log (2026-10-13) overrides the plan.
JSON_API includes POST chains and embedded payloads, implemented in Task 11.
WhiteOak is deliberately absent until Task 11. Dates are never rounded here."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class DisclosureResolverKind(str, Enum):
    STATIC_REGEX = "static_regex"
    JSON_API = "json_api"
    MANUAL = "manual"
    WAYBACK_LOCATE = "wayback_locate"


class DisclosureFileShape(str, Enum):
    # One URL -> one workbook -> one sheet per scheme (Nippon India, Shriram, PPFAS, Groww).
    SINGLE_WORKBOOK_MULTI_SHEET = "single_workbook_multi_sheet"
    # One landing page links many separate single-scheme files; the scheme name comes
    # from the link's own text, not an internal worksheet name (Helios, Capitalmind,
    # Angel One).
    MULTI_FILE_SINGLE_SCHEME = "multi_file_single_scheme"
    # A ZIP containing workbooks (DSP, ICICI, ABSL); UTI additionally needs marker blocks.
    ZIP_OF_WORKBOOKS = "zip_of_workbooks"
    # No landing page at all -- the URL is built directly from the scheme's own name plus
    # the as-of date (Union).
    DETERMINISTIC_TEMPLATE = "deterministic_template"


@dataclass(frozen=True)
class DisclosureResolverEntry:
    kind: DisclosureResolverKind
    file_shape: DisclosureFileShape | None = None
    landing_url: str | None = None
    link_pattern: str | None = None
    exclude_pattern: str | None = None
    url_template: str | None = None
    cdn_domain: str | None = None
    # JSON_API and embedded-payload Locate mechanics are implemented in Task 11.
    endpoint_url: str | None = None
    response_json_path: str | None = None
    documents: tuple[str, ...] | None = None
    note: str | None = None



AMC_DISCLOSURE_RESOLVERS: dict[str, DisclosureResolverEntry] = {
    'Nippon India Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url='https://mf.nipponindiaim.com/investor-service/downloads/factsheet-portfolio-and-other-disclosures/',
        link_pattern='MONTHLY-PORTFOLIO',
    ),
    'Shriram Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url='https://www.shriramamc.in/investor-statutory-disclosures',
        link_pattern='Monthly-Portfolio-Shriram-Mutual-Fund',
    ),
    'PPFAS Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url='https://amc.ppfas.com/downloads/portfolio-disclosure/',
        link_pattern='/PPFAS_Monthly_Portfolio_Report',
        note='Capture 2026-10-13: "double ingest unless pattern anchors on the unprefixed name".',
    ),
    'Groww Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url='https://www.growwmf.in/statutory-disclosure/portfolio',
        link_pattern='Monthly\\s*Portfolio',
        exclude_pattern='fortnightly',
    ),
    'Helios Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url='https://www.heliosmf.in/portfolio-disclosure/',
        link_pattern='monthly-portfolio',
        exclude_pattern='fortnightly',
    ),
    'Capitalmind Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url='https://www.capitalmindmf.com/statutory-disclosures.html',
        link_pattern='Monthly_Portfolio_Disclosure',
    ),
    'Angel One Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url='https://www.angelonemf.com/downloads',
        link_pattern='monthly-portfolio',
    ),
    'Union Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.DETERMINISTIC_TEMPLATE,
        url_template='https://www.unionmf.com/docs/default-source/funddetail-downloads/fund-portfolio/{month_name_lower}-{yyyy}/monthly-portfolio-report-{scheme_slug}-{dd}-{mm}-{yyyy}.xlsx',
    ),
    'HDFC Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.WAYBACK_LOCATE,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url='https://www.hdfcfund.com/statutory-disclosure/portfolio/monthly-portfolio',
        cdn_domain='files.hdfcfund.com',
        note='Capture 2026-10-13: "the plan landing_url returns [] (zero captures); the 111 .xlsx URLs sit inside the embedded JSON".',
    ),
    'Canara Robeco Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.WAYBACK_LOCATE,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url='https://www.canararobeco.com/wp-content/uploads/',
        link_pattern='Canara-Robeco-.*-Fund',
        exclude_pattern=r'fortnightly|(?:^|[-_/])15(?:th|st|nd|rd)?[-_]',
        note='Capture 2026-10-13: "limit=-50 returned only 24 September-2026 workbooks; a month/date filter on the file name is needed".',
    ),
    'Kotak Mahindra Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.DETERMINISTIC_TEMPLATE,
        url_template='https://vatseelabs-s3.kotakmf.com/FAD/Portfolios/Consolidated-SEBI-Portfolio-as-on-{month_name}-{dd},-{yyyy}/ConsolidatedSEBIPortfolio{month_name}{yyyy}.xlsx',
        cdn_domain='vatseelabs-s3.kotakmf.com',
        note="Direct date-built path, confirmed live via sixth-pass Wayback CDX query then direct-download SEBI-schema verification. Main domain's downloads page lists no direct file link, so there's no landing_url to scrape -- the template is the only mechanism. Monthly, not the differently-named Fortnightly file found in an earlier pass. No automatic Wayback fallback is built -- that would need a second mechanism per entry, which nothing else in this registry has either. If the CDN path changes again the template 404s, Q12's day-10/day-20 alert catches it like any other AMC, and the fix is a one-off repeat of the sixth pass's Wayback CDX re-discovery, not a standing code path.",
    ),
    'AlphaGrep Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        endpoint_url='https://www.alphagrepmf.ai/assets/documents/files.json',
        note='Capture 2026-10-13: "a manifest https://www.alphagrepmf.ai/assets/documents/files.json lists {schemeName, folderName, financialYears}". Locate implementation: Task 11.',
    ),
    'Tata Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url='https://www.tatamutualfund.com/schemes-related/portfolio',
        note='Capture 2026-10-13: "The data is embedded in the Next.js flight payload". Locate implementation: Task 11.',
    ),
    'Sundaram Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url='https://www.sundarammutual.com/monthly-fortnightly-adhoc-portfolios',
        note='Capture 2026-10-13: "There are TWO workbooks per month, 30 plus 10 = 40 schemes". Locate implementation: Task 11.',
    ),
    'Choice Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        endpoint_url='https://choicemf.com/api/document-master-list',
        response_json_path='body',
        note='Capture 2026-10-13: "there is no server-side filter. It is a single unfiltered tree". Locate implementation: Task 11.',
    ),
    'UTI Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.ZIP_OF_WORKBOOKS,
        endpoint_url='https://www.utimf.com/api/get-consolidate-portfolio-disclosure',
        response_json_path='rows',
        note='Capture 2026-10-13: "one consolidated ZIP holding a single all-scheme sheet". Locate implementation: Task 11.',
    ),
    'PGIM India Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        endpoint_url='https://www.pgimindia.com/api/v1/brochure/published/disclosure',
        response_json_path='data',
        note='Capture 2026-10-13: "true endpoint /api/v1/brochure/published/disclosure with POST body above". Locate implementation: Task 11.',
    ),
    'Navi Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url='https://navi.com/mutual-fund/downloads/portfolio',
        endpoint_url='https://navi.com/wp-json/nv/v1/documents',
        response_json_path='data',
        note='Capture 2026-10-13: "category 884 = Monthly portfolio". Locate implementation: Task 11.',
    ),
    'Bandhan Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.MANUAL,
        landing_url='https://bandhanmutual.com/downloads/portfolio-summary/monthly',
        note='Capture 2026-10-13: "the listing that names it is an AES-encrypted API".',
    ),
    'Jio BlackRock Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url='https://www.jioblackrockamc.com/statutory-disclosure/disclosures/monthly-portfolio-disclosure',
        note='Capture 2026-10-13: "the file URLs come only from the Next server-action POST". Locate implementation: Task 11.',
    ),
    'Unifi Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url='https://unifimf.com/statutorydocuments/',
        link_pattern='MP-Unifi-.*-\\d{8}\\.xlsx?',
        note='Capture 2026-10-13: "link_pattern is MP-Unifi-.*-\\d{8}\\.xlsx?".',
    ),
    'Zerodha Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url='https://www.zerodhafundhouse.com/resources/disclosures',
        link_pattern='portfolio-disclosures/[^"\\\\]*Monthly Portfolio.*\\.xlsx',
        exclude_pattern='Fortnightly|Half Yearly|Quarterly',
        note='Capture 2026-10-13: "the links ARE in the server-rendered HTML (as JSON in the Next payload, with unescaped quotes)".',
    ),
    'Abakkus Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url='https://www.abakkusmf.com/statutory-disclosures.html',
        note='Capture 2026-10-13: "the selects filter a JSON blob embedded in the page HTML". Locate implementation: Task 11.',
    ),
    'quant Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url='https://quantmutual.com/statutory-disclosures',
        endpoint_url='https://quantmutual.com/statutorydisclosures.aspx/displaydisclouser',
        note='Capture 2026-10-13: "the call is an ASP.NET page-method POST returning an HTML string". Locate implementation: Task 11.',
    ),
    'Bajaj Finserv Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url='https://www.bajajamc.com/downloads?tab=portfolio',
        endpoint_url='https://www.bajajamc.com/wp-admin/admin-ajax.php',
        note='Capture 2026-10-13: "the year must be the financial-year string (2026-27), not 2026". Locate implementation: Task 11.',
    ),
    'ICICI Prudential Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.ZIP_OF_WORKBOOKS,
        landing_url='https://www.icicipruamc.com/media-center/downloads?currentTabFilter=OtherSchemeDisclosures&subCatTabFilter=Monthly+Portfolio+Disclosures',
        endpoint_url='https://apimf.icicipruamc.com/nms/v1/downloads/files',
        response_json_path='success.data.files',
        note='Capture 2026-10-13: "Chrome UA + the three headers + Origin/Referer/Accept returned JSON 3 of 3". Locate implementation: Task 11.',
    ),
    'DSP Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.ZIP_OF_WORKBOOKS,
        landing_url='https://www.dspim.com/mandatory-disclosures/portfolio-disclosures?origin=app',
        link_pattern='month-?end-portfolios?|dsp-isin-debt-portfolio-as-on',
        exclude_pattern='fortnightly',
        note='Capture 2026-10-13: "A robust pattern must be month-?end-portfolio and handle the debt-only xlsx".',
    ),
    'Motilal Oswal Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url='https://www.motilaloswalmf.com/sitemap.xml',
        link_pattern='Month_End_Portfolio_[^"<>]*\\.xlsx',
        note='Capture 2026-10-13: "90/90 pages reachable via sitemap, but only 81/90 expose a file link".',
    ),
    'NJ Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url='https://downloads.njmutualfund.com/njmf_download.php?nme=127',
        link_pattern='viewfile\\.php\\?file=.*(?:Monthly|MONTHLY).*\\.xlsx?',
        note='Capture 2026-10-13: "Landing is AMC-wide (all NJ funds, month rows back to 2022)".',
    ),
    'Franklin Templeton Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url='https://www.franklintempletonindia.com/fund-details/fund-overview/42352/reports/investor-services/funds-and-solutions/investor/about-us',
        endpoint_url='https://www.franklintempletonindia.com/api/literature/v1/documents?channel=en-in&cache=true',
        response_json_path='document',
        note='Capture 2026-10-13: "Mechanism (plain unauthenticated GET, JSON)". Locate implementation: Task 11.',
    ),
    'Quantum Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url='https://www.quantumamc.com/portfolio/combined/-1/1/0/0',
        link_pattern='/FileCDN/FactSheet/.*\\.xlsx',
        note="Batch B: plain HTML exposes direct 'All Funds' combined workbooks through September 2026, served from /FileCDN/FactSheet/<uuid>.xlsx -- the combined workbook avoids per-scheme fetching, same shape as Nippon/Shriram/PPFAS/Groww.",
    ),
    'Samco Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url='https://www.samcomf.com/StatutoryDisclosure',
        link_pattern='IN_MF_MONTHLY_PORTFOLIO_',
        note='Batch B: server-rendered inventory lists separate monthly portfolio files per scheme, titled IN_MF_MONTHLY_PORTFOLIO_<Month>_<Year>_<Scheme> -- ingestion enumerates schemes from the one landing page.',
    ),
    '360 ONE Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url='https://www.360.one/asset/mutual-funds/downloads/',
        link_pattern='IN_MF_MONTHLY_PORTFOLIO_[^"\\\\]*\\.xlsx?',
        note='Capture 2026-10-13: "A plain regex over the raw HTML finds the literal URL".',
    ),
    'The Wealth Company Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url='https://www.wealthcompanyamc.in/literature-forms/portfolio-documents/monthly/',
        link_pattern='/uploads/Monthly_Portfolio_',
        note='Capture 2026-10-13: "All 12 Sept 2026 files are on page 1 (sorted by uploadDate desc)".',
    ),
    'Old Bridge Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        landing_url='https://www.oldbridgemf.com/statutory-disclosures.html',
        link_pattern='OBMF_.*Portfolio_.*_[0-9a-f]+\\.xlsx|Old_Bridge_.*_Fund_.*_[0-9a-f]+\\.xlsx',
        exclude_pattern='IR_|Overlap|Performance|Average_Assets|MSP|HY_',
        note='Capture 2026-10-13: "real current-month holdings are per-scheme: OBMF_Flexi_Cap_Portfolio_Sept_26_0cfdd46aac.xlsx".',
    ),
    'Baroda BNP Paribas Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url='https://www.barodabnpparibasmf.in/downloads/monthly-portfolio-scheme',
        link_pattern='BOBBNPMF_Monthly_Portfolio_',
        note='Capture 2026-10-13: "true only on /downloads/monthly-portfolio-scheme (not /archivedownload/)".',
    ),
    'SBI Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        endpoint_url='https://www.sbimf.com/ajaxcall/CMS/GetSchemePortfolioSheets',
        note='Capture 2026-10-13: "Response is an HTML table fragment (not JSON)". Locate implementation: Task 11.',
    ),
    'Bank of India Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        endpoint_url='https://www.boimf.in/AjaxService.asmx/GetDocuments',
        note='Capture 2026-10-13: "WORKING HOST: https://www.boimf.in". Locate implementation: Task 11.',
    ),
    'Trust Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        endpoint_url='https://www.trustmf.com/api/api/Trust/GetData',
        response_json_path='resultSetArray',
        note='Capture 2026-10-13: "resultSetArray[i].fileurl (newest first)". Locate implementation: Task 11.',
    ),
    'Mirae Asset Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        endpoint_url='https://www.miraeassetmf.co.in/AjaxService/GetDownloadsData',
        response_json_path='Data',
        note='Capture 2026-10-13: "Data[i].URL (relative)". Locate implementation: Task 11.',
    ),
    'LIC Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        endpoint_url='https://www.licmf.com/downloads/consolidated-portfolio-filters',
        note='Capture 2026-10-13: "Consolidated route (NOT in the plan, simpler, 2 requests for all 40+ funds)". Locate implementation: Task 11.',
    ),
    'Axis Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        endpoint_url='https://www.axismf.com/cms/token',
        note='Capture 2026-10-13: "the URL key is spelled docuementURL (typo in the API)". Locate implementation: Task 11.',
    ),
    'Aditya Birla Sun Life Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.ZIP_OF_WORKBOOKS,
        endpoint_url='https://mutualfund.adityabirlacapital.com/postlogin/CustomApi/Resources/FactsheetAccordionById',
        response_json_path='AccordionList',
        note='Capture 2026-10-13: "the download is a ZIP (one member 30092026_ABSLMF_MonthlyDisclosure.xls)". Locate implementation: Task 11.',
    ),
    'Taurus Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.JSON_API,
        file_shape=DisclosureFileShape.MULTI_FILE_SINGLE_SCHEME,
        endpoint_url='https://www.taurusmutualfund.com/financials/portfolio',
        note='Capture 2026-10-13: "September 2026: HTTP 200, page renders with no .xls(x) links". Locate implementation: Task 11.',
    ),
    'Monarch Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.STATIC_REGEX,
        file_shape=DisclosureFileShape.SINGLE_WORKBOOK_MULTI_SHEET,
        landing_url='https://www.monarchamc.in/forms-downloads/portfolio-holdings/monthly',
        link_pattern='Monthly_Portfolio_Monarch_',
        note='Capture 2026-10-13: "A monthly file for 30 Sep 2026 exists and downloads".',
    ),
    'Edelweiss Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.MANUAL,
        note="Confirmed BOT_BLOCKED across 4 passes -- Akamai (akamai-grn header); the real disclosure page was found via Wayback but it's a client-rendered SPA shell with no static links and no capturable API.",
    ),
    'Mahindra Manulife Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.MANUAL,
        note="Confirmed across 4 passes -- the investorapi.mahindramanulife.com endpoint returns a genuinely AES-encrypted payload (directly observed, not inferred); real static files exist (/uploads/download/{uuid}.xlsx) but the UUID isn't discoverable without decrypting the API. Per the project's standing constraint against cracking encrypted vendor APIs.",
    ),
    'Invesco Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.MANUAL,
        note="Confirmed BOT_BLOCKED, sixth pass: both curl and a real headless-Chromium Playwright navigation return HTTP 403 from a WAF (server: volt-adc) -- a genuine bot wall, not a missing-interaction problem. Per the project's standing constraint against evading bot detection.",
    ),
    'ITI Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.MANUAL,
        note='Confirmed BOT_BLOCKED, fifth pass: a real headless-Chromium Playwright navigation gets a Cloudflare interactive-challenge page too, not just plain curl -- a genuine bot wall.',
    ),
    'JM Financial Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.MANUAL,
        note="Confirmed false positive, fifth pass: the file this AMC's query 'downloaded' decodes to 832KB of AES-ciphertext (exact 16-byte block multiple, chi-square ~235/uniform), not a real workbook -- joins Mahindra Manulife in the encrypted-API dead-end bucket.",
    ),
    'HSBC Mutual Fund': DisclosureResolverEntry(
        kind=DisclosureResolverKind.MANUAL,
        note='Confirmed fifth pass as the one AMC in the entire registry genuinely needing a real browser in production: plain curl gets HTTP 403 (Microsoft-Azure-Application-Gateway WAF), a real headless-Chromium Playwright navigation gets 200 with direct per-scheme .xlsx links under /portfolios/document-<DDMMYYYY>/. Per the 2026-10-12 decision not to add Playwright as a production dependency for one AMC -- handled as standing-manual-fetch instead.',
    ),
}
