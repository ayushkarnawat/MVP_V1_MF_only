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
    min_schemes: int = 3                    # single-fund AMCs explicitly lower the content gate


AMC_RESOLVERS: dict[str, ResolverEntry] = {
    "360 ONE Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "360 ONE Asset Management Limited",
        layout='360',
        landing_url='https://www.360.one/asset/mutual-funds/downloads/',
        needs_boxes=True,
        note='10 Oct 2026: public Next factSheets.yearlyData/monthlyData download list, Factsheet - Fund group; August 2026 PDF current; coverage 12/12 live NAVAll families, no misses; Run 8: 10/19 manager-fund assignments have unambiguous performance-footnote dates, others NULL.'),
    "Abakkus Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Abakkus Investment Managers Private Limited", layout="abakkus", landing_url="https://www.abakkusmf.com/factsheet.html"),  # 10 Oct: September 2026; 4/4 live NAVAll families (100%); no misses.
    "Aditya Birla Sun Life Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "Aditya Birla Sun Life AMC Limited", layout="absl_september", landing_url="https://mutualfund.adityabirlacapital.com/forms-and-downloads/factsheets", endpoint_url="https://mutualfund.adityabirlacapital.com/api/sitecore/CalculatorPage/GetMonthlyFactsheetsByYear?datasourceId=%7B2D97ABF5-4F12-479A-86D6-27C538F48D13%7D", response_json_path="MonthlyFactsheets"),  # 10 Oct: September 2026 (31 Aug data); 103/104 live families (99.04%); Series TQ (1879 days) absent from this file.
    "AlphaGrep Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "AlphaGrep Investment Management Private Limited",
        landing_url="https://www.alphagrepmf.ai/disclosures",
        note="10 Oct 2026: AMFI member 86 links alphagrepmf.ai; own main script builds /assets/factssheet_reports/2026/factssheet_<month>_2026.pdf (and xls/xlsx fallbacks). October, September and August PDFs returned HTTP 200 text/html SPA, not files; September xls/xlsx also returned the shell. /assets/documents/files.json lists September portfolio spreadsheets, not factsheets. Disabled: all 3 live families lack a current factsheet."),
    "Angel One Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Angel One Asset Management Company Limited",
        layout='angel',
        landing_url='https://www.angelonemf.com/downloads',
        note='10 Oct 2026: public Next factsheetsData fields.post_guid download list (direct /api/factsheets returned 403, unused); August 2026 PDF current; coverage 11/11, no misses.'),
    "ASK MUTUAL FUND": ResolverEntry(ResolverKind.STATIC_LINK, "ASK ASSET MANAGEMENT PRIVATE LIMITED",
        layout='ask', min_schemes=1,
        landing_url='https://www.askmutualfund.com/pages/downloads.html',
        note='10 Oct 2026: own script loads /pages/downloads.html at the root; public /assests/pdf/ASK_Liquid_fund_factsheet_Sept26.pdf HTTP 200, October issue with September 30 data. min_schemes=1; coverage 1/1 live NAVAll families, no misses.'),
    "Axis Mutual Fund": ResolverEntry(ResolverKind.MANUAL, "Axis Asset Management Co. Ltd.", layout="axis", needs_boxes=True, note="2026-10-10: bot-protected source; user imports monthly via import_manual_fund_managers.py. Supplied August 2026 active/index/ETF file; separate manager/date columns use character boxes."),  # 88/89 live families (98.88%); Nifty500 Low Volatility 50 Index absent.
    "Bajaj Finserv Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Bajaj Finserv Asset Management Limited",
        landing_url="https://www.bajajamc.com/downloads?factsheet=",
        note="10 Oct 2026 re-check: /downloads?factsheet= and ?statutory-disclosures= HTTP 200; latest linked file Abridged-Factsheet_July-2026.pdf (July 2026), plus Factsheet_June-2026.pdf. Own anonymous admin-ajax bajaj_get_filter_options section 744/year 2026 returned options=[]; bajaj_get_downloads September returned count=0. Still disabled: linked files are stale; all 25 live families blocked by no current file."),
    "Bandhan Mutual Fund": ResolverEntry(ResolverKind.MANUAL, "Bandhan AMC Limited",
        layout='bandhan',
        landing_url='https://bandhanmutual.com/downloads/factsheets',
        note='10 Oct 2026: 401 API key required; no access-control workaround; user imports monthly via import_manual_fund_managers.py. October issue (30 Sep data), CLI coverage 87/89 (97.75%); 10:90 Gilt Plus SDL Dec 2029 and Fixed Term Plan series 179 absent.'),
    "Bank of India Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "Bank of India Investment Managers Private Limited",
        layout='boi', endpoint_url='https://www.boimf.in/AjaxService.asmx/GetDocuments',
        note='10 Oct 2026: own AjaxCall.js POST GetDocuments InvestorCorner/FACTSHEETS; HTTP 200 double-encoded d.Documents, DocName/FolderUrl/FolderTitle; August 2026 PDF current. Enabled with coverage 22/25 (88%), a reason per miss (Run 7 ruling): MID CAP TAX FUND SERIES 1, Series 2, VALUE FUND have no scheme-manager page in this file.'),
    "Baroda BNP Paribas Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Baroda BNP Paribas Asset Management India Private Limited",
        layout='baroda',
        landing_url='https://www.barodabnpparibasmf.in/downloads/monthly-factsheet',
        link_pattern='Fund(?:_|-|%20|\\s)*Facts|fact[-_ ]?sheet',
        note='10 Oct 2026: own loadmoredocumentsfactsheet.js uses POST ajax-load-more-documents-new; first current download already in public HTML, BBNPP_MF_Fund_Facts_August_2026_19985.pdf HTTP 200 current; coverage 47/47, no misses.'),
    "Canara Robeco Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Canara Robeco Asset Management Company Limited", layout="canara", landing_url="https://www.canararobeco.com/documents/forms-downloads/forms-information-documents/information-documents/factsheets/"),  # 10 Oct: served August-end 2026 factsheet (September upload); 27/27 live families (100%); per-scheme pages, no summary-column pairing.
    "Capitalmind Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Capitalmind Asset Management Private Limited", layout="capitalmind", landing_url="https://capitalmindmf.com/factsheet.html"),  # 10 Oct: latest served August 2026, 31 Aug data; 4/4 live NAVAll families (100%); no misses.
    "Choice Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "Choice AMC Private Limited", layout="choice", landing_url="https://choicemf.com/disclosures/factsheets", endpoint_url="https://choicemf.com/api/document-master-list", response_json_path="body", note="2026-10-10: newest August 2026 file, 31 Aug data; whole-file date check approved."),  # 4/4 live families (100%); no misses.
    "DSP Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "DSP Asset Managers Private Limited", layout="dsp", landing_url="https://www.dspim.com/downloads?category=Information%20Documents&sub_category=Factsheets", endpoint_url="https://www.dspim.com/downloads.json?page=1&per_page=10&category=Information%20Documents&sub_category=Factsheets", response_json_path="data"),  # 10 Oct: latest August 2026; 88/92 live families (95.65%); BSE Insurance ETF and FMP 264/267/270 absent.
    "Edelweiss Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Edelweiss Asset Management Limited", layout="edelweiss"),  # automated again: plain HTTP served the Sept file on 9 Oct
    "Franklin Templeton Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "Franklin Templeton Asset Management (India) Private Limited",
        layout='franklin',
        needs_boxes=True,
        endpoint_url='https://www.franklintempletonindia.com/api/literature/v1/responseLitJson?type=download',
        note='10 Oct 2026: own main script GET responseLitJson?type=download HTTP 200 PageType tree, FUND-FACTSHEETS literatureHref prefixed /download; August 31 2026 PDF current. Positional multi-scheme reader coverage 38/42 (90.5%); Credit Risk, Dynamic Accrual and Short-Term Income Plan segregated families have no current manager page; Liquid Fund- Institution is an unresolved separate family/option.'),
    "Groww Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Groww Asset Management Limited", layout="groww", landing_url="https://www.growwmf.in/downloads/fact-sheet", link_pattern=r"Monthly\s+Factsheet"),  # 10 Oct: latest August 2026; 62/62 live families (100%); individual scheme pages, no summary pairing.
    "HDFC Mutual Fund": ResolverEntry(ResolverKind.MANUAL, "HDFC Asset Management Company Limited", layout="hdfc", note="2026-10-09: http://hdfcfund.com/downloads/monthly-fact-sheet returned HTTP 403 and no PDF links. Ops imports two files monthly: active and passive factsheets (Task 21)."),
    "Helios Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Helios Capital Asset Management (India) Pvt. Ltd.", layout="helios", landing_url="https://www.heliosmf.in/downloads"),  # 10 Oct: September 2026; 8/8 live families (100%); no misses.
    "HSBC Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "HSBC Asset Management (India) Private Ltd.", layout="hsbc", landing_url="https://www.assetmanagement.hsbc.co.in/en/mutual-funds/investor-resources?Doc=fund-factsheets", link_pattern="the-asset|The Asset", note="10 Oct 2026 Run 9: August file; 44/45 live families, Ultra Short to Short Term fragmented manager text refused. 117 manager rows: unparsed non-NULL dates 6 -> 0; five dates trimmed; the comma-joined date pair for Mayank Chaturvedi/Dipan S. Parikh cannot be attributed, both NULL."),
    "ICICI Prudential Mutual Fund": ResolverEntry(ResolverKind.MANUAL, "ICICI Prudential Asset Management Company Limited", layout="icici", needs_boxes=True, note="2026-10-10: bot-protected source; user imports monthly via import_manual_fund_managers.py. One supplied September 2026 file covers active/passive; manager tables use character boxes."),  # 152/158 live families (96.20%); six Cash/Dividend-labelled legacy NAVAll families do not share canonical names with printed headings.
    "IL&FS Mutual Fund (IDF)": ResolverEntry(ResolverKind.STATIC_LINK, "IL&FS Infra Asset Management Limited",
        landing_url="https://www.ilfsinfrafund.com/other.php",
        note="10 Oct 2026: own /other.php and /our-funds.php HTTP 200; downloads list historical portfolio disclosures (latest listed May 2018) and 2019 AGM notice, no current factsheet or download API. Disabled: Series 2A, 2B and 2C (0/3 live families) all lack a current manager factsheet."),
    "Invesco Mutual Fund": ResolverEntry(ResolverKind.MANUAL, "Invesco Asset Management (India) Private Limited",
        layout='invesco',
        landing_url='https://invescomutualfund.com/literature-and-form?tab=Factsheets',
        note='10 Oct 2026: CloudFront 403; user imports monthly via import_manual_fund_managers.py. August file, CLI coverage 44/50 (88%); Pharma and Healthcare, Manufacturing, Multi Asset Allocation, Nifty G-sec Sep 2032, Nifty Chemical and Nifty India Defence absent.'),
    "ITI Mutual Fund": ResolverEntry(ResolverKind.MANUAL, "ITI Asset Management Limited", layout="iti", note="2026-10-10: bot-protected source; user imports monthly via import_manual_fund_managers.py. Supplied August 2026 file."),  # 20/21 live families (95.24%); Multi Asset Allocation absent.
    "Jio BlackRock Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "Jio BlackRock Asset Management Private Limited",
        layout='jio',
        endpoint_url='https://www.jioblackrockamc.com/statutory-disclosure/fund-documents/factsheet',
        note='10 Oct 2026: own statutory-disclosure script publishes getDisclosureL3Data Next action; public POST [factsheet,{year:FI2026-2027,month:August},MF] HTTP 200 data[].file.url in RSC response. Deployment id discovered dynamically. October empty, September methodology only (excluded); August PDF current; coverage 15/16 (93.8%); Balanced Advantage Fund absent from file.'),
    "JM Financial Mutual Fund": ResolverEntry(ResolverKind.MANUAL, "JM Financial Asset Management Limited",
        layout='jm',
        landing_url='https://www.jmfinancialmf.com/downloads/Factsheet/Factsheet',
        note='10 Oct 2026: AppTrana 406; user imports monthly via import_manual_fund_managers.py. September issue (31 Aug data), CLI coverage 17/17; no misses.'),
    "Kotak Mahindra Mutual Fund": ResolverEntry(ResolverKind.MANUAL, "Kotak Mahindra Asset Management Company Limited.", layout="kotak", note="2026-10-09: https://www.kotakmf.com/Information/forms-and-downloads/Information returned HTTP 200 and no PDF links in its HTML. Monthly manual import (Task 21)."),
    "Lakshya Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Lakshya Asset Management Private Limited", min_schemes=1,
        landing_url="https://www.lakshyafunds.com/compliance",
        note="10 Oct 2026: own CompliancePage/apiUtils scripts GET /api/ext/fund-documents/all HTTP 200 with sid, kim, sai, ssd=[] and factSheet=[]; no current factsheet. Disabled: Lakshya Overnight Fund (0/1) lacks a file; no access-control workaround."),
    "LIC Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "LIC Mutual Fund Asset Management Limited", layout="lic", landing_url="https://www.licmf.com/downloads/factsheet", needs_boxes=True),  # 10 Oct: latest August 2026; positional summary 43/43 live families (100%); no misses; artwork titles skipped.
    "Mahindra Manulife Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "Mahindra Manulife Investment Management Pvt Ltd", layout="mahindra", landing_url="https://www.mahindramanulife.com/downloads", endpoint_url="https://investorapi.mahindramanulife.com/api/v1/web/preLogin/downloads", response_json_path="data[].subcategories[].files", note="2026-10-10: page's anonymous GET preLogin/downloads returned HTTP 200 payload; its public script unwraps AES transport to status/data/categories/files with title/fileUrl. No authentication or API key sent; no constants persisted. Latest August PDF; 27/27 live families, no misses."),
    "Mirae Asset Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "Mirae Asset Investment Managers (India) Pvt. Ltd", layout="mirae", landing_url="https://www.miraeassetmf.co.in/downloads/factsheet", endpoint_url="https://www.miraeassetmf.co.in/AjaxService/GetDownloadsData", response_json_path="Data", documents=(r"active-factsheet", r"passive-factsheet"), note="2026-10-10: September active/passive files; whole-file month scan and same-category exact Liquid ETF variant ties approved. Both files validate before one AMC import."),  # 98/99 live families (98.99%), up from 96/99; BSE Information Technology Index absent.
    "Monarch Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Monarch Networth Asset Management Private Limited", min_schemes=1,
        landing_url="https://www.monarchamc.in/forms-downloads",
        note="10 Oct 2026: own /forms-downloads and /our-funds/overnight-fund HTTP 200; public Next download props contain policies/scheme documents, no factsheet link or factsheet field in the product page. Disabled: Monarch Overnight Fund (0/1) has no factsheet published on these pages."),
    "Motilal Oswal Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "Motilal Oswal Asset Management Company Limited", layout="motilal", landing_url="https://www.motilaloswalmf.com/downloads/factsheets", endpoint_url="https://www.motilaloswalmf.com/content/aem-cloud-dept-backend-motilal-oswal/api/search-documents.json", response_json_path="results", documents=(r"factsheet[^/]*active", r"factsheet[^/]*passive"), note="2026-10-10: page's searchDownloadDocuments request (year, category=factsheet, month, type=mf) returned HTTP 200 results with title/path/mimeType. Latest August active/passive PDFs both required; space/hyphen filename variants accepted. 88/90 live families (97.78%); Developed Market Ex US ETFs Overseas Equity Passive FOF and Quality Fund absent."),
    "Navi Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "Navi AMC Limited", layout="navi",
        landing_url="https://navi.com/mutual-fund/downloads/factsheet", endpoint_url="https://navi.com/wp-json/nv/v1/documents",
        response_json_path="data", documents=(r"Navi[_ -]*Active[_ -]*Factsheet", r"Navi[_ -]*Passive[_ -]*Factsheet"),
        note="10 Oct 2026: own app.js public POST nv/v1/documents with financial_year/month/category and anonymous page WP-NONCE returned success/data title/url; October and September empty, August active/passive PDFs HTTP 200, 31 Aug data, both required. Coverage 17/18 (94.44%); Nifty Reits & Realty Index fund absent from both files."),
    "Nippon India Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Nippon Life India Asset Management Limited", layout="nippon"),
    "NJ Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "NJ Asset Management Private Limited", layout="nj", landing_url="https://downloads.njmutualfund.com/downloads.php"),  # 10 Oct: September 2026; 7/7 live families (100%); no misses.
    "Old Bridge Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Old Bridge Asset Management Private Limited", layout="oldbridge",
        landing_url="https://www.oldbridgemf.com/factsheet.html",
        note="10 Oct 2026: own factsheet.html PDF anchors and AMFI direct September PDF HTTP 200; Old_Bridge_MF_Sept_26_Factsheet filename and Factsheet_AUG_26 variants dated explicitly. September 30 data, coverage 3/3, no misses; inception tenures retained raw, parsed NULL."),
    "PGIM India Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "PGIM India Asset Management Private Limite", layout="pgim", landing_url="https://www.pgimindia.com/mutual-funds/forms-and-product-updates/Fund-Factsheet", endpoint_url="https://www.pgimindia.com/api/v1/brochure/published/form", response_json_path="data.tab_0007"),  # 10 Oct: newest August 2026, 31 Aug data; 25/25 live families (100%); no misses; public published forms API.
    "PPFAS Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "PPFAS Asset Management Pvt. Ltd.", layout="ppfas", landing_url="https://amc.ppfas.com/downloads/factsheet/index.php#axzz4I2KR6um7"),  # 10 Oct: September 2026; 7/7 live families (100%); no misses.
    "quant Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "quant Money Managers Limited", layout="quant", landing_url="https://quantmutual.com/downloads/factsheet", as_on_pattern=r"\bAUM\s*\((\d{1,2}\s+[A-Za-z]+\s+\d{4})\)"),  # 10 Oct: October 2026 (30 Sep AUM); 30/31 live families (96.77%); Income Plus Arbitrage Active FOF absent from the full file.
    "Quantum Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Quantum Asset Management Company Private Limited", layout="quantum", landing_url="https://www.quantumamc.com/factsheets/combined/-1/0/0"),  # 10 Oct: September 2026 (second candidate; first stale); 15/15 live families (100%); no misses.
    "Samco Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Samco Asset Management Private Limited", layout="samco",
        landing_url="https://www.samcomf.com/downloads",
        note="10 Oct 2026 re-check: public downloads anchors include Factsheet-September2026_1791201633.pdf, HTTP 200 with September 30 data. AMC-specific filename month/year dating avoids June document-id digits 2086; hyphen/underscore variants accepted. Coverage 13/13, no misses; no ceased/w.e.f. notes."),
    "SBI Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "SBI Funds Management Limited", layout="sbi", landing_url="https://www.sbimf.com/factsheets", endpoint_url="https://www.sbimf.com/ajaxcall/CMS/GetRecentFactSheets", documents=(r"all-sbimf-schemes[^/]*factsheet", r"sbi-mf-passives[^/]*factsheet"), note="2026-10-10: page's FactSheets.js POST GetRecentFactSheets returned HTTP 200 HTML anchors for August active and passive PDFs; both required. 104/120 live families (86.67%); FMP series 1, 6, 34, 50-55, 57, 58, 60, 61 and Long Term Advantage IV/V/VI have no manager pages in either file."),
    "Shriram Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Shriram Asset Management Co. Ltd.", layout="shriram", landing_url="https://www.shriramamc.in/factsheet"),  # 10 Oct: latest August 2026; 10/11 live families (90.91%); Gold ETF Passive FOF announced on cover only, no manager page.
    "Sundaram Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "Sundaram Asset Management Company Ltd", layout="sundaram", landing_url="https://www.sundarammutual.com/fundwise-factsheet", endpoint_url="https://www.sundarammutual.com/ajax/Modules_Forms_Downloads_Fundwise_Factsheet,App_Web_4pv3qucy.ashx?_method=DownloadArchive&_session=no"),  # 10 Oct: September 2026 (31 Aug data); public legacy archive API; 40/40 live families (100%); 17 tested NAVAll legacy-name aliases; no misses.
    "Tata Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "Tata Asset Management Private Limited", layout="tata", landing_url="https://www.tatamutualfund.com/information-documents/factsheets", endpoint_url="https://prod-dist-api.tatamfdev.com/cms-data/api/CMSDATA_corporate_factsheets", response_json_path="[]", note="2026-10-10: page's public CMS request with year/month and check-enc:false returned HTTP 200 []; August returned title/field_media_document rows, latest August PDF. 67/68 live families (98.53%); CRISIL-IBX Financial Services 3-6 Months Debt Index Fund absent."),
    "Taurus Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Taurus Asset Management Company Limited", layout="taurus", needs_boxes=True,
        landing_url="https://www.taurusmutualfund.com/factsheet", link_pattern=r"Taurus[_ -]Times|factsheet",
        note="10 Oct 2026: public Drupal factsheet year filter field_factsheet_item_target_id (2026 option 565, discovered dynamically) HTTP 200 renders Taurus_Times_Aug_2026.pdf; August 31 data current. Coverage 8/10 (80%); Investor Education Pool (>3 yrs) and Unclaimed Dividend & Redemption Liability (<3 yrs) have no manager scheme pages; all 8 investment schemes match. Banking caption reconstructed from left-column word boxes; earlier 'was Fund Manager' names excluded."),
    "The Wealth Company Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Wealth Company Asset Management Holdings Private Limited", layout="wealth",
        landing_url="https://www.wealthcompanyamc.in/literature-forms/scheme-documents/factsheets/",
        note="10 Oct 2026: own public Next downloads list name/attachment.url; relative /uploads URL served August PDF HTTP 200, August 31 data. Date comes from printed numeric as-on title, not upload ids. Coverage 11/12 (91.67%); Multi Cap Fund absent from the full file."),
    "Trust Mutual Fund": ResolverEntry(ResolverKind.MANUAL, "Trust Asset Management Private Limited", layout="trust", note="2026-10-10: bot-protected source; user imports monthly via import_manual_fund_managers.py. Supplied September 2026 file."),  # 11/11 live families (100%); no misses.
    "Unifi Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Unifi Asset Management Private Limited", layout="unifi", landing_url="https://unifimf.com/factsheet/"),  # 10 Oct: September 2026; 3/3 live families (100%); no misses.
    "Union Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Union Asset Management Company Private Limited", layout="union",
        landing_url="https://www.unionmf.com/about-us/downloads/factsheets",
        note="10 Oct 2026: own Angular page embeds downloadfactsheets.push Title/Url; August PDF HTTP 200, August 31 data. Scheme pages pair tenure with explicit repeated manager names; printed ELSS title alias scoped to this AMC. Coverage 32/32, no misses; no ceased/w.e.f. notes."),
    "UTI Mutual Fund": ResolverEntry(ResolverKind.JSON_API, "UTI Asset Mgmt. Co. Ltd.", layout="uti", landing_url="https://www.utimf.com/downloads/fund-watch", endpoint_url="https://www.utimf.com/api/get-fact-sheet", response_json_path="rows", documents=(r"watch(?:[\s_-]|%20)*\(?active", r"watch(?:[\s_-]|%20)*\(?passive"), note="2026-10-10: October active/passive English files (30 Sep data; named 'Fund Watch (Active)', September's 'fund_watch_active' -- both matched); whole-file month scan. Regular/segregated Credit Risk and Medium Term tie on canonical category. 84/88: Master Equity Plan and Annual Interval Fund - I have no manager page; Sector Leaders ETF and FTIF XXXVI-I absent."),  # 76/88 live families (86.36%), unchanged from Run 5; four category-tie misses, eight without scheme pages (Run 6 report).
    "WhiteOak Capital Mutual Fund": ResolverEntry(ResolverKind.MANUAL, "WhiteOak Capital Asset Management Limited", layout="whiteoak", note="2026-10-10: bot-protected source; user imports monthly via import_manual_fund_managers.py. Supplied August 2026 file."),  # 22/22 live families (100%); no misses.
    "Zerodha Mutual Fund": ResolverEntry(ResolverKind.STATIC_LINK, "Zerodha Asset Management Private Limited", layout="zerodha", landing_url="https://www.zerodhafundhouse.com/resources/fund-documents"),  # 10 Oct: latest August 2026; 22/23 live families (95.65%); Life Cycle Fund 2031 absent.
    # Carnelian Investment Managers Private Limited: no AMFI-listed schemes on 9 Oct -- nothing to resolve; not in the registry.
    # Nuvama Asset Management Limited: no AMFI-listed schemes on 9 Oct -- nothing to resolve; not in the registry.

}
