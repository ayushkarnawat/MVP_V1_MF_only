"""Per-AMC fund-manager source registry (attribute 04).

Keyed by our fund-house name (`schemes.amc_name`, from AMFI's NAVAll). AMFI's factsheet
directory is keyed by the asset-management *company* ("Aditya Birla Sun Life AMC Limited"),
so every entry carries that name too (`directory_name`). Built from the 9 Oct catalogue of
every AMC (Docs/analytics/2026-10-09-attribute-04-factsheet-layouts.md).

An entry with `layout=None` isn't onboarded yet: the job skips it and its schemes show as
"not available yet". Task 8 onboards each one (resolver verified against the live site,
reader built on its real file, coverage measured) before staging -- none is left behind."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class ResolverKind(Enum):
    STATIC_LINK = "static_link"  # factsheet link found on a landing page (AMFI's, or landing_url)
    JSON_API = "json_api"        # the AMC's own document API
    MANUAL = "manual"            # no automatable source; ops imports the PDF monthly (Task 21)


@dataclass(frozen=True)
class ResolverEntry:
    kind: ResolverKind
    directory_name: str                    # AMFI factsheet directory's amc_name
    layout: str | None = None              # key into fund_manager_layouts.LAYOUTS
    landing_url: str | None = None         # overrides AMFI's landing URL when AMFI's is empty or wrong
    link_pattern: str | None = None        # regex for this AMC's factsheet link text/URL, if not "factsheet"
    endpoint_url: str | None = None        # JSON_API only
    response_json_path: str | None = None  # JSON_API only: dotted path to the document list
    note: str | None = None                # what was tried, why MANUAL; never left blank for MANUAL
    needs_boxes: bool = False              # positional reader; extract words only for this AMC
    documents: tuple[str, ...] = ()         # every required document pattern must validate
    as_on_pattern: str | None = None        # AMC-specific caption; replaces the shared scan


AMC_RESOLVERS: dict[str, ResolverEntry] = {
    "360 ONE Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "360 ONE Asset Management Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Abakkus Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Abakkus Investment Managers Private Limited", layout="abakkus", landing_url="https://www.abakkusmf.com/factsheet.html"),  # 10 Oct: September 2026; 4/4 live NAVAll families (100%); no misses.
    "Aditya Birla Sun Life Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "Aditya Birla Sun Life AMC Limited", layout="absl_september", landing_url="https://mutualfund.adityabirlacapital.com/forms-and-downloads/factsheets", endpoint_url="https://mutualfund.adityabirlacapital.com/api/sitecore/CalculatorPage/GetMonthlyFactsheetsByYear?datasourceId=%7B2D97ABF5-4F12-479A-86D6-27C538F48D13%7D", response_json_path="MonthlyFactsheets"),  # 10 Oct: September 2026 (31 Aug data); 103/104 live families (99.04%); Series TQ (1879 days) absent from this file.
    "AlphaGrep Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "AlphaGrep Investment Management Private Limited"),  # 9 Oct: no_landing_url
    "Angel One Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Angel One Asset Management Company Limited"),  # 9 Oct: no_factsheet_link_in_html
    "ASK MUTUAL FUND": ResolverEntry(ResolverKind.STATIC_LINK, "ASK ASSET MANAGEMENT PRIVATE LIMITED"),  # 9 Oct: no_factsheet_link_in_html
    "Axis Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "Axis Asset Management Co. Ltd.", landing_url="https://www.axismf.com/downloads", endpoint_url="https://www.axismf.com/cms/product/factsheet-document", note="2026-10-10: old /cms/downloads/category GET 404. Public downloads script calls /cms/product/factsheet-document POST; ordinary request returns 403 Forbidden, so document response shape and current PDF cannot be verified."),  # 0/89 live families; all blocked by unverified source, not guessed.
    "Bajaj Finserv Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Bajaj Finserv Asset Management Limited", note="2026-10-10: https://www.bajajamc.com/downloads?factsheet= and ?statutory-disclosures= served July/June 2026 PDFs, both stale. Public bajaj_get_filter_options returned no 2026 months; bajaj_get_downloads for September returned no documents. Disabled pending a current source."),  # 0/25 live families enabled; all blocked by unavailable current source (not MANUAL).
    "Bandhan Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Bandhan AMC Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Bank of India Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Bank of India Investment Managers Private Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Baroda BNP Paribas Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Baroda BNP Paribas Asset Management India Private Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Canara Robeco Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Canara Robeco Asset Management Company Limited", layout="canara", landing_url="https://www.canararobeco.com/documents/forms-downloads/forms-information-documents/information-documents/factsheets/"),  # 10 Oct: served August-end 2026 factsheet (September upload); 27/27 live families (100%); per-scheme pages, no summary-column pairing.
    "Capitalmind Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Capitalmind Asset Management Private Limited", layout="capitalmind", landing_url="https://capitalmindmf.com/factsheet.html"),  # 10 Oct: latest served August 2026, 31 Aug data; 4/4 live NAVAll families (100%); no misses.
    "Choice Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "Choice AMC Private Limited", landing_url="https://choicemf.com/disclosures/factsheets", endpoint_url="https://choicemf.com/api/document-master-list", response_json_path="body", note="2026-10-10: verified nested financial_years/files API; newest August 2026 file carries 31 Aug data and reader matches 4/4. Current dates occur after first 12 pages, shared month check rejects it. Disabled pending a date-scope ruling."),  # 0/4 enabled; 4/4 extractable, all blocked by the month-check boundary.
    "DSP Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "DSP Asset Managers Private Limited", layout="dsp", landing_url="https://www.dspim.com/downloads?category=Information%20Documents&sub_category=Factsheets", endpoint_url="https://www.dspim.com/downloads.json?page=1&per_page=10&category=Information%20Documents&sub_category=Factsheets", response_json_path="data"),  # 10 Oct: latest August 2026; 88/92 live families (95.65%); BSE Insurance ETF and FMP 264/267/270 absent.
    "Edelweiss Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Edelweiss Asset Management Limited", layout="edelweiss"),  # automated again: plain HTTP served the Sept file on 9 Oct
    "Franklin Templeton Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Franklin Templeton Asset Management (India) Private Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Groww Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Groww Asset Management Limited", layout="groww", landing_url="https://www.growwmf.in/downloads/fact-sheet", link_pattern=r"Monthly\s+Factsheet"),  # 10 Oct: latest August 2026; 62/62 live families (100%); individual scheme pages, no summary pairing.
    "HDFC Mutual Fund": ResolverEntry(ResolverKind.MANUAL, "HDFC Asset Management Company Limited", layout="hdfc", note="2026-10-09: http://hdfcfund.com/downloads/monthly-fact-sheet returned HTTP 403 and no PDF links. Ops imports two files monthly: active and passive factsheets (Task 21)."),
    "Helios Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Helios Capital Asset Management (India) Pvt. Ltd.", layout="helios", landing_url="https://www.heliosmf.in/downloads"),  # 10 Oct: September 2026; 8/8 live families (100%); no misses.
    "HSBC Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "HSBC Asset Management (India) Private Ltd.", layout="hsbc", landing_url="https://www.assetmanagement.hsbc.co.in/en/mutual-funds/investor-resources?Doc=fund-factsheets", link_pattern="the-asset|The Asset"),  # 10 Oct: latest August 2026; 44/45 live families (97.78%); Ultra Short to Short Term manager text fragmented, refused.
    "ICICI Prudential Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "ICICI Prudential Asset Management Company Limited", endpoint_url="https://apimf.icicipruamc.com/nms/v1/downloads/categories", note="2026-10-10: official site JavaScript confirms apimf base; /nms/v1/downloads/categories and /kcs/v1/categories/filtered-categories both returned text reporting Original Status Code: 404 with HTML, not document JSON. Response shape and current file unverified."),  # 0/158 live families; all blocked by unavailable document response.
    "IL&FS Mutual Fund (IDF)": ResolverEntry(ResolverKind.STATIC_LINK, "IL&FS Infra Asset Management Limited"),  # 9 Oct: no_landing_url
    "Invesco Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Invesco Asset Management (India) Private Limited"),  # 9 Oct: no_factsheet_link_in_html
    "ITI Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "ITI Asset Management Limited", endpoint_url="https://www.itimf.com/jeeth/api/v1/catalog/digitalfactsheet", note="2026-10-10: document endpoint GET/POST and /downloads return Cloudflare 403 HTML. No current file or API shape verified."),  # 0/21 live families; all blocked by source access.
    "Jio BlackRock Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Jio BlackRock Asset Management Private Limited"),  # 9 Oct: no_factsheet_link_in_html
    "JM Financial Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "JM Financial Asset Management Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Kotak Mahindra Mutual Fund": ResolverEntry(ResolverKind.MANUAL, "Kotak Mahindra Asset Management Company Limited.", layout="kotak", note="2026-10-09: https://www.kotakmf.com/Information/forms-and-downloads/Information returned HTTP 200 and no PDF links in its HTML. Monthly manual import (Task 21)."),
    "Lakshya Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Lakshya Asset Management Private Limited"),  # 9 Oct: no_landing_url
    "LIC Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "LIC Mutual Fund Asset Management Limited", layout="lic", landing_url="https://www.licmf.com/downloads/factsheet", needs_boxes=True),  # 10 Oct: latest August 2026; positional summary 43/43 live families (100%); no misses; artwork titles skipped.
    "Mahindra Manulife Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Mahindra Manulife Investment Management Pvt Ltd"),  # 9 Oct: no_factsheet_link_in_html
    "Mirae Asset Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "Mirae Asset Investment Managers (India) Pvt. Ltd", landing_url="https://www.miraeassetmf.co.in/downloads/factsheet", endpoint_url="https://www.miraeassetmf.co.in/AjaxService/GetDownloadsData", response_json_path="Data", documents=(r"active-factsheet", r"passive-factsheet"), note="2026-10-10: two September files verified live; multi-document contract built. Reader matches 96/99, BSE Information Technology Index absent and both Liquid ETF families canonically ambiguous. Active file's latest shared date in first 12 pages is March 2020; 31 Aug 2026 starts page 18. Disabled pending date-scope ruling; passive alone never imports."),  # 0/99 enabled; 96/99 extractable (96.97%); all blocked by active-file month check.
    "Monarch Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Monarch Networth Asset Management Private Limited"),  # 9 Oct: no_landing_url
    "Motilal Oswal Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Motilal Oswal Asset Management Company Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Navi Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Navi AMC Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Nippon India Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Nippon Life India Asset Management Limited", layout="nippon"),
    "NJ Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "NJ Asset Management Private Limited", layout="nj", landing_url="https://downloads.njmutualfund.com/downloads.php"),  # 10 Oct: September 2026; 7/7 live families (100%); no misses.
    "Old Bridge Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Old Bridge Asset Management Private Limited"),  # 9 Oct: no_factsheet_link_in_html
    "PGIM India Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "PGIM India Asset Management Private Limite", layout="pgim", landing_url="https://www.pgimindia.com/mutual-funds/forms-and-product-updates/Fund-Factsheet", endpoint_url="https://www.pgimindia.com/api/v1/brochure/published/form", response_json_path="data.tab_0007"),  # 10 Oct: newest August 2026, 31 Aug data; 25/25 live families (100%); no misses; public published forms API.
    "PPFAS Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "PPFAS Asset Management Pvt. Ltd.", layout="ppfas", landing_url="https://amc.ppfas.com/downloads/factsheet/index.php#axzz4I2KR6um7"),  # 10 Oct: September 2026; 7/7 live families (100%); no misses.
    "quant Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "quant Money Managers Limited", layout="quant", landing_url="https://quantmutual.com/downloads/factsheet", as_on_pattern=r"\bAUM\s*\((\d{1,2}\s+[A-Za-z]+\s+\d{4})\)"),  # 10 Oct: October 2026 (30 Sep AUM); 30/31 live families (96.77%); Income Plus Arbitrage Active FOF absent from the full file.
    "Quantum Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Quantum Asset Management Company Private Limited", layout="quantum", landing_url="https://www.quantumamc.com/factsheets/combined/-1/0/0"),  # 10 Oct: September 2026 (second candidate; first stale); 15/15 live families (100%); no misses.
    "Samco Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Samco Asset Management Private Limited", landing_url="https://www.samcomf.com/downloads", note="2026-10-10: downloads page's latest factsheet is June 2026, as on June 30; both download and media URLs verified stale. Dedicated /downloads/factsheet route returns 404. Disabled pending a current source."),  # 0/13 live families enabled; all blocked by unavailable current source.
    "SBI Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "SBI Funds Management Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Shriram Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Shriram Asset Management Co. Ltd.", layout="shriram", landing_url="https://www.shriramamc.in/factsheet"),  # 10 Oct: latest August 2026; 10/11 live families (90.91%); Gold ETF Passive FOF announced on cover only, no manager page.
    "Sundaram Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "Sundaram Asset Management Company Ltd", layout="sundaram", landing_url="https://www.sundarammutual.com/fundwise-factsheet", endpoint_url="https://www.sundarammutual.com/ajax/Modules_Forms_Downloads_Fundwise_Factsheet,App_Web_4pv3qucy.ashx?_method=DownloadArchive&_session=no"),  # 10 Oct: September 2026 (31 Aug data); public legacy archive API; 40/40 live families (100%); 17 tested NAVAll legacy-name aliases; no misses.
    "Tata Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Tata Asset Management Private Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Taurus Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Taurus Asset Management Company Limited"),  # 9 Oct: no_factsheet_link_in_html
    "The Wealth Company Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Wealth Company Asset Management Holdings Private Limited"),  # 9 Oct: no_factsheet_link_in_html
    "Trust Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "Trust Asset Management Private Limited", endpoint_url="https://www.trustmf.com/api/api/Trust/GetData", note="2026-10-10: API GET 406, ordinary POST 204 with no body. /Downloads HTML available but its /assets/index-BnnMCDpc.js is blocked by AppTrana 406. Cannot verify request payload/response shape or current PDF."),  # 0/11 live families; all blocked by unverified document source.
    "Unifi Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Unifi Asset Management Private Limited", layout="unifi", landing_url="https://unifimf.com/factsheet/"),  # 10 Oct: September 2026; 3/3 live families (100%); no misses.
    "Union Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Union Asset Management Company Private Limited"),  # 9 Oct: no_factsheet_link_in_html
    "UTI Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "UTI Asset Mgmt. Co. Ltd.", landing_url="https://www.utimf.com/downloads/fund-watch", endpoint_url="https://www.utimf.com/api/get-fact-sheet", response_json_path="rows", documents=(r"watch_active", r"watch_passive"), note="2026-10-10: public year/full-month-name API verified; September active/passive English files, 31 Aug data. Reader matches 76/88 (86.36%); Credit Risk and Medium Term each collide with segregated families (4 misses), eight other families lack scheme pages. Active date absent in first 12 pages; disabled pending date-scope/matching rulings."),  # 0/88 enabled; 76/88 extractable; all blocked by active-file month check; per-miss reasons in Run 5 report.
    "WhiteOak Capital Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "WhiteOak Capital Asset Management Limited", endpoint_url="https://cms.whiteoakamc.com/graphql", note="2026-10-10: GraphQL GET and public __typename POST return CloudFront 403 HTML; mf.whiteoakamc.com/downloads and www.whiteoakamc.com redirect also 403. No response shape or current PDF verified."),  # 0/22 live families; all blocked by source access.
    "Zerodha Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Zerodha Asset Management Private Limited", layout="zerodha", landing_url="https://www.zerodhafundhouse.com/resources/fund-documents"),  # 10 Oct: latest August 2026; 22/23 live families (95.65%); Life Cycle Fund 2031 absent.
    # Carnelian Investment Managers Private Limited: no AMFI-listed schemes on 9 Oct -- nothing to resolve; not in the registry.
    # Nuvama Asset Management Limited: no AMFI-listed schemes on 9 Oct -- nothing to resolve; not in the registry.

}
