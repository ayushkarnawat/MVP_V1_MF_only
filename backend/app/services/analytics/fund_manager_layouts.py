# backend/app/services/analytics/fund_manager_layouts.py
"""Fund-manager extraction, one function per factsheet layout (attribute 04).

AMCs don't share a layout: the 9 Oct catalogue of every AMC's factsheet
(Docs/analytics/2026-10-09-attribute-04-factsheet-layouts.md) found six families, and a
single "generic" regex matched 5 AMCs of 22. Readers take one page of pypdfium2 text
and optionally its word boxes, returning one SchemePage, several SchemePages, or
no schemes. The registry (fund_manager_resolvers.py) selects each AMC's layout."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable

Word = tuple[float, float, float, float, str]  # PDF coordinates, never financial values

# "Mrs" before "Mr", and a word boundary, so "Mrs. A" loses all of "Mrs." and "Mrinal" keeps its "Mr".
_TITLE = re.compile(r"^(?:Mrs|Mr|Ms|Dr)\b\.?\s*")
_ISIN = re.compile(r"\bINF[0-9A-Z]{9}\b")
_CATEGORY = re.compile(r"Category(?: of (?:the )?Scheme)?\s*:?\s*([A-Za-z&/ -]{3,40}?Fund)\b")
_MONTH = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?"
_DATE = rf"{_MONTH}\s*\d{{1,2}},?\s*\d{{4}}"
# Lines that end a heading: the scheme-type sentence and running headers.
_HEADING_STOP = re.compile(
    r"^(an open[- ]ended|open[- ]ended|type of scheme|\(erstwhile|product label|this product|"
    r"past performance|data as on|additional disclosure|an? (?:interval|close))", re.I)
_RUNNING_HEADER = re.compile(r"^(\d+|\d+ \| \w+ \d{4}|For Product label.*|\.{3,}Contd.*)$")


@dataclass(frozen=True)
class SchemePage:
    heading: str
    managers: list[dict]
    isins: list[str] = field(default_factory=list)
    category: str | None = None


def _clean_name(raw: str) -> str:
    return " ".join(_TITLE.sub("", raw.strip()).split())


def _first_line_heading(page: str, max_lines: int = 3) -> str:
    """HDFC, Edelweiss: the first line that isn't a running header, joined with its wrapped
    continuation, stopping at the scheme-type sentence."""
    out: list[str] = []
    for line in (l.strip() for l in page.splitlines()):
        if not line or _RUNNING_HEADER.match(line):
            if out:
                break
            continue
        if _HEADING_STOP.match(line):
            break
        out.append(line)
        if len(out) == max_lines:
            break
    # HDFC prints "[(Erstwhile …)" / "[An open ended …" right after the name.
    return _TYPE_CUT.split(" ".join(out))[0]


def _brand_line_heading(page: str, prefix: str) -> str:
    """Nippon, ABSL, Kotak: return tables and notes come first on the page, so the name is
    the first line starting with the AMC's brand ("Nippon India …"), cut at any scheme-type
    text on the same line and joined with the next line when the name wraps."""
    lines = [l.strip() for l in page.splitlines() if l.strip()]
    for i, line in enumerate(lines):
        if line.lower().startswith(prefix.lower()):
            name = _TYPE_CUT.split(line)[0]
            nxt = lines[i + 1] if i + 1 < len(lines) else ""
            if name.endswith(("&", "-")) or (line.isupper() and nxt.isupper() and len(nxt) < 40
                                              and not nxt.startswith("(") and not _HEADING_STOP.match(nxt)):
                name = f"{name} {_TYPE_CUT.split(nxt)[0]}"
            return name
    return ""


_TYPE_CUT = re.compile(r"\s+(?:-\s+An open|NSE Symbol|BSE Scrip|\(|\[)|\s+-?\d+(?:\.\d+)?%")


def _page(heading: str, managers: list[dict], page: str) -> SchemePage | None:
    if not heading or not managers:
        return None
    category = _CATEGORY.search(page)
    return SchemePage(heading, managers, sorted(set(_ISIN.findall(page))), category.group(1).strip() if category else None)


def bullets_slash(page: str) -> list[dict] | None:
    """Nippon, Edelweiss: "Name of Fund Managers • Mr. A • Mr. B (Assistant Fund Manager)
    Total Experience 30 / 14  Managing Since: August 2007 / August 2024"."""
    names = re.search(r"Name of Fund Managers?\s*:?(.*?)Total\s*Experience", page, re.S)
    if not names:
        return None
    managers = []
    for raw in (n for n in re.split(r"•", names.group(1)) if n.strip()):
        role = re.search(r"\(([^)]*)\)", raw)
        managers.append({"name": _clean_name(re.sub(r"\([^)]*\)", "", raw)),
                         "role": role.group(1).strip() if role else None, "since_raw": None})
    since = re.search(r"Managing\s*[Ss]ince\s*:?(.*?)(?:Minimum (?:Additional )?Investment|Load Structure|Benchmark|$)", page, re.S)
    dates = [d.strip() for d in " ".join(since.group(1).split()).split("/")] if since else []
    for manager, date_raw in zip(managers, dates):
        manager["since_raw"] = date_raw or None
    return managers


def hdfc_table(page: str) -> list[dict] | None:
    """HDFC: "FUND MANAGER ¥ / Name Since Total Exp / Rahul Baijal July 29, 2022 Over 25 years /
    Bhagyesh Kagalkar (Gold/Silver Instruments) August 26,2026 …" -- no Mr., dates wrap."""
    block = re.search(r"FUND MANAGER\s*¥?(.*?)(?:DATE OF ALLOTMENT|NAV\s*\(|ASSETS UNDER)", page, re.S)
    if not block:
        return None
    text = " ".join(block.group(1).split()).replace("Name Since Total Exp", " ")
    managers = [
        # A bracketed "(Ashish Shah w.e.f September 11, 2026)" announces a handover, not a role:
        # the file describes the fund at its month-end, so the listed manager stays.
        {"name": _clean_name(m.group("name")), "since_raw": m.group("since"),
         "role": None if m.group("role") and re.search(r"w\.e\.f", m.group("role")) else m.group("role")}
        for m in re.finditer(rf"(?P<name>[A-Z][A-Za-z.' ]+?)\s*(?:\((?P<role>[^)]*)\))?\s*(?P<since>{_DATE})\s*Over\s*\d+\s*years", text)
    ]
    # "¥ Fund Manager for Overseas Investments: Mr. Dhruv Muchhal (since June 22, 2023) …
    # Mr. Gopal Agrawal w.e.f. September 01, 2026" -- co-managers for the fund's overseas
    # sleeve, printed as a footnote under the table (A04 Run 1 ruling: they're managers too).
    footnote = re.search(r"Fund Manager for Overseas Investments\s*:(.*?)(?:€|Please refer|$)", " ".join(page.split()))
    if footnote:
        for m in re.finditer(rf"((?:Mrs|Mr|Ms|Dr)\.?\s*[A-Z][A-Za-z.' ]+?)\s*(?:\(since\s*({_DATE})\)|w\.e\.f\.?\s*({_DATE}))", footnote.group(1)):
            managers.append({"name": _clean_name(m.group(1)), "role": "Overseas Investments", "since_raw": m.group(2) or m.group(3)})
    return managers


def kotak_line(page: str) -> list[dict] | None:
    """Kotak: "Fund Manager*: Mr. Harsha Upadhyaya" (names joined by & / , / and; a new
    manager can carry "(w.e.f. June 01, 2026)"). No managing-since dates otherwise."""
    line = re.search(r"Fund Manager\*:\s*(.+?)(?:\n\s*\n|AAUM|AUM|Benchmark|Allotment|$)", page, re.S)
    if not line:
        return None
    managers = []
    # Names are joined by "&", ",", "and" -- or just a line break before the next "Mr.".
    for raw in re.split(r"&|,(?![^()]*\))|\band\b|(?=\b(?:Mr|Ms|Mrs|Dr)\.)", " ".join(line.group(1).split())):
        since = re.search(rf"\((?:w\.e\.f\.?|effective)\s*({_DATE})\)", raw)
        name = _clean_name(re.sub(r"\(.*", "", raw))
        if re.fullmatch(r"[A-Z][a-z]+(?: [A-Z][A-Za-z.]+)+", name):
            managers.append({"name": name, "role": None, "since_raw": since.group(1) if since else None})
    return managers


def absl_line(page: str) -> list[dict] | None:
    """ABSL: "Fund Manager - Mr. Harish Krishnan  Managing the Fund Since: January 07, 2026"
    (one or more). Replaces the plan's earlier comma-line guess, which the real file doesn't use."""
    managers = [
        {"name": _clean_name(m.group(1)), "role": None, "since_raw": m.group(2)}
        for m in re.finditer(rf"Fund Manager\s*[-:]\s*((?:(?:Mr|Ms|Dr)\.?\s*)?[A-Z][A-Za-z.' ]+?)\s+Managing the Fund Since\s*:?\s*({_DATE})", " ".join(page.split()))
    ]
    return managers


def abakkus_bullets(page: str) -> list[dict] | None:
    """September 2026: bullet names with sleeve roles; since dates labelled by name.

    The name block prints 'Abhishek K S', while the date block sometimes prints
    'Abhishek KS'. Compare whitespace-free names, never pair by column/text order.
    """
    text = " ".join(page.split())
    block = re.search(r"Name of Fund Managers[:;](.*?)(?:Total Experience|Minimum SIP|Performance of scheme)", text)
    if not block:
        return None
    dates = {
        re.sub(r"\s", "", _clean_name(m.group(1))): m.group(2).strip()
        for m in re.finditer(r"((?:Mr|Ms|Mrs|Dr)\.?\s+[A-Za-z. ]+?)\s*\((\d{1,2}(?:st|nd|rd|th)? [A-Za-z]+ \d{4})\)", text)
    }
    return [
        {"name": _clean_name(m.group(1)), "role": m.group(2).strip(),
         "since_raw": dates.get(re.sub(r"\s", "", _clean_name(m.group(1))))}
        for m in re.finditer(r"•\s*((?:Mr|Ms|Mrs|Dr)\.?\s+[A-Za-z. ]+?)\s*\(([^)]+)\)", block.group(1))
    ]


def _absl_scheme_heading(page: str) -> str:
    """The scheme title immediately precedes Type of Scheme, after metrics.

    Earlier brand lines name creation units or underlying holdings, not this fund.
    """
    lines = [line.strip() for line in page.splitlines() if line.strip()]
    for i, line in enumerate(lines):
        if line.startswith("Type of Scheme:"):
            for j in range(i - 1, max(-1, i - 4), -1):
                if lines[j].startswith("Aditya Birla Sun Life"):
                    return " ".join(lines[j:i])
    return ""


def canara_scheme_managers(page: str) -> list[dict] | None:
    """Use individual scheme pages, never the flattened multi-fund snapshots."""
    block = re.search(r"FUND MANAGER:\s*(.*?)DATE OF ALLOTMENT:", page, re.S)
    if not block:
        return None
    text = " ".join(block.group(1).split())
    names = list(re.finditer(r"(?:Mr|Ms|Mrs|Dr)\.\s*([A-Za-z. ]+?)\s*\(", text))
    managers = []
    for i, name in enumerate(names):
        detail = text[name.end():names[i + 1].start() if i + 1 < len(names) else len(text)]
        since = re.search(r"Managing fund since\s*([^&()]+?)\s*&\s*Overall", detail)
        role = re.search(r"(?:^|\()(For [^)]+|Dedicated Fund Manager [^)]+)\)", detail)
        # A name without a parseable date is still a manager; dropping it would leave a
        # partial list that looks complete (Run 3 review).
        managers.append({"name": _clean_name(name.group(1)), "role": role.group(1).strip() if role else None,
                         "since_raw": since.group(1).strip() if since else None})
    return managers


def _canara_heading(page: str) -> str:
    heading = _brand_line_heading(page, "CANARA ROBECO ").split("(", 1)[0].strip()
    return re.sub(r"[*#^$~@&]+$", "", heading).strip()


def _hsbc_heading(page: str) -> str:
    for line in page.splitlines():
        if line.strip().startswith("HSBC "):
            return re.sub(r"\s+(?:ID\s+)?HSBC Mutual Fund.*$", "", line.strip())
    return ""


def helios_experience(page: str) -> list[dict] | None:
    block = re.search(r"Name of Fund Managers:(.*?)Minimum Investment", page, re.S)
    if not block:
        return None
    return [{"name": _clean_name(m.group(1)), "role": m.group(2), "since_raw": m.group(3)}
            for m in re.finditer(rf"((?:Mr|Ms|Mrs|Dr)\.\s*[A-Za-z. ]+?)\s*(?:\(([^)]+)\))?\s+Total Experience:\s*\d+ years\s+Managing Since:\s*(Inception|{_DATE})", " ".join(block.group(1).split()))]


def _groww_heading(page: str) -> str:
    # Scheme titles print GROWW; portfolio holdings print Groww.
    return _brand_line_heading("\n".join(line for line in page.splitlines()
                                        if not line.lstrip().startswith("Groww ")), "GROWW ")


def groww_scheme_managers(page: str) -> list[dict] | None:
    """Manager details on individual scheme pages; summary tables are excluded."""
    if not re.search(r"^GROWW ", page, re.M) or "FUND MANAGER" not in page:
        return None
    text = " ".join(page.split())
    names = list(re.finditer(r"(?:Mr|Ms|Mrs|Dr)\.\s*([A-Z][A-Za-z. ]+?)(?=\s*\(|\s+-|\s+Total experience)", text))
    managers = []
    for i, name in enumerate(names):
        detail = text[name.end():names[i + 1].start() if i + 1 < len(names) else len(text)].strip()
        if re.search(r"ceased to be (?:a )?(?:FM|fund manager)", detail, re.I):
            continue  # "(Ceased to be FM Sep 10, 2026)": a departed manager, not a current one
        since = re.search(r"\(Managing (?:Fund )?Since\s+([^()]+)\)", detail, re.I)
        role = re.match(r"\(((?:[^()]|\([^()]*\))+)\)", detail)
        role_raw = role.group(1).strip() if role and not role.group(1).lower().startswith("managing") else None
        if detail.startswith("-"):
            role_raw = detail[1:].split("(", 1)[0].strip()
        managers.append({"name": _clean_name(name.group(1)), "role": role_raw,
                         "since_raw": since.group(1).strip() if since else None})
    return managers


def _dsp_heading(page: str) -> str:
    # Overseas holdings captions also start with DSP but carry an 'as of' date.
    return _brand_line_heading("\n".join(line for line in page.splitlines() if " as of " not in line), "DSP ")


def dsp_experience(page: str) -> list[dict] | None:
    """Individual DSP scheme pages: each name precedes its experience and since."""
    block = re.search(r"FUND MANAGER\s+(.*?)(?:NAV AS ON|BSE & NSE SCRIP CODE)", page, re.S)
    if not block:
        return None
    return [
        {"name": _clean_name(m.group(1)), "role": m.group(2), "since_raw": m.group(3)}
        for m in re.finditer(
            rf"([A-Z][A-Za-z. ]+?)\s*(?:\(([^)]+)\))?\s+Total work experience of (?:over )?\d+ years\.\s*Managing (?:this|the) (?:Scheme|scheme|fund) since\s+({_MONTH}\s+(?:\d{{1,2}},\s*)?\d{{4}})",
            " ".join(block.group(1).split()))
    ]


def capitalmind_table(page: str) -> list[dict] | None:
    """August 2026 scheme pages: name / experience / since in separate rows."""
    block = re.search(r"Fund Manager Details\s*Name\s*Experience\s*Managing\s*Since(.*?)Minimum Investment", page, re.S)
    if not block:
        return None
    return [
        {"name": _clean_name(m.group(1)), "role": None, "since_raw": m.group(2)}
        for m in re.finditer(rf"([A-Z][A-Za-z. ]+?)\s+\d+(?:\.\d+)?\+?\s*yrs\s+(Inception|{_MONTH}\s+\d{{4}})", " ".join(block.group(1).split()))
    ]


def sundaram_managers(page: str) -> list[dict] | None:
    block_names = re.search(r"Name of Fund Managers:(.*?)Total Experience", page, re.S)
    if not block_names:
        return None
    managers = []
    for raw in re.split(r"•|,", block_names.group(1)):
        if not raw.strip():
            continue
        role = re.search(r"\(([^)]+)\)", raw)
        managers.append({"name": _clean_name(re.sub(r"\([^)]*\)", "", raw)),
                         "role": role.group(1) if role else None, "since_raw": None})
    block = re.search(r"Managing Since:(.*?)Minimum Investment", page, re.S)
    if block:
        for match in re.finditer(rf"(\d{{1,2}} {_MONTH} \d{{4}})\s*\(([^)]+)\)", " ".join(block.group(1).split())):
            for label in re.split(r"\s*&\s*", match.group(2)):
                # The file labels dates with printed first names ("Madan" for Madanagopal).
                named = [m for m in managers if m["name"].split()[0].startswith(label)]
                if len(named) == 1:
                    named[0]["since_raw"] = match.group(1)
    return managers


def _sundaram_heading(page: str) -> str:
    match = re.search(r"(Sundaram [^\r\n]+)(?:\s*(Fund - Series [IVX]+))?\s*Type Of Scheme:", page)
    return " ".join(part.strip() for part in match.groups() if part) if match else ""


def zerodha_managers(page: str) -> list[dict] | None:
    block = re.search(r"Name of Fund Managers(.*?)Minimum Investment", " ".join(page.split()))
    if not block:
        return None
    return [{"name": _clean_name(m.group(1)), "role": m.group(2), "since_raw": m.group(3)}
            for m in re.finditer(rf"((?:Mr|Ms)\. [A-Za-z ]+?)\s*(?:\(([^)]+)\)\s*)?Total Experience: \d+ years Managing Since: ({_MONTH} \d{{4}})", block.group(1))]


def unifi_managers(page: str) -> list[dict] | None:
    block = re.search(r"Fund Manager\s*\(Managing since inception\)(.*?)Tier [I1] Benchmark", page, re.S)
    if not block:
        return None
    return [{"name": m.group(1).strip(), "role": m.group(2).strip(), "since_raw": "inception"}
            for m in re.finditer(r"^([A-Za-z ]+) – ([^\r\n]+)", block.group(1), re.M)]


def _unifi_heading(page: str) -> str:
    match = re.search(r"Name of the Fund (Unifi [^\r\n]+)", page)
    return match.group(1).strip() if match else ""


def quantum_managers(page: str) -> list[dict] | None:
    block = re.search(r"Fund Managers? Experience Managing Fund Since(.*)", page, re.S)
    if not block:
        return None
    return [{"name": _clean_name(m.group(1)), "role": m.group(2) or m.group(3), "since_raw": m.group(4)}
            for m in re.finditer(rf"((?:Mrs|Mr|Ms)\. [A-Za-z]+ [A-Za-z]+)\s*(?:\(([^)]+)\)\s*| - (Fund Manager)\s*)?\d+ years ({_DATE})", " ".join(block.group(1).split()))]


def _quantum_heading(page: str) -> str:
    found = re.search(r"(Quantum [^\r\n]+)\s*An [Oo]pen", page)
    return found.group(1).strip() if found else ""


def quant_managers(page: str) -> list[dict] | None:
    block = re.search(r"Fund Manager Details(.*?)Minimum Investment", page, re.S)
    if not block:
        return None
    return [{"name": m.group(1).strip(), "role": None, "since_raw": m.group(2)}
            for m in re.finditer(rf"Name of Fund Manager: ([A-Za-z ]+?) Total Experience: \d+ (?:Years|Months) Managing Since: (\d{{1,2}} {_MONTH} \d{{4}})", " ".join(block.group(1).split()))]


def ppfas_managers(page: str) -> list[dict] | None:
    block = re.search(r"Name of the Fund Managers:(.*?)Minimum Investment", page, re.S)
    if not block:
        return None
    return [{"name": _clean_name(m.group(1)), "role": m.group(2).strip(), "since_raw": m.group(3)}
            for m in re.finditer(rf"((?:Mr|Ms)\. [A-Za-z]+ [A-Za-z]+)\s*(?::| -)\s*(.*?) Total Experience: \d+ Years Managing Since: (Since Inception|{_DATE})", " ".join(block.group(1).split()))]


def nj_managers(page: str) -> list[dict] | None:
    names = re.search(r"Name of the Fund Manager:(.*?)Work Experience:", page, re.S)
    since = re.search(r"Managing the Scheme Since:(.*?)Total Expense Ratio", page, re.S)
    if not names:
        return None
    printed = re.findall(r"Mr\.\s*([A-Za-z]+\s+[A-Za-z]+)", " ".join(names.group(1).split()))
    dates = {}
    if since:
        note = " ".join(since.group(1).split())
        for clause in re.finditer(rf"((?:Mr\.\s*[A-Za-z]+\s+[A-Za-z]+(?:\s+and\s+)?)+)\s+(?:is\s+)?managing\s+(?:the\s+)?scheme\s+(?:since|from)\s+(inception|{_DATE})", note):
            for name in re.findall(r"Mr\.\s*([A-Za-z]+\s+[A-Za-z]+)", clause.group(1)):
                dates[name] = clause.group(2)
    return [{"name": name, "role": None, "since_raw": dates.get(name)} for name in printed]


def lic_summary(page: str, words: list[Word]) -> list[SchemePage]:
    """LIC's printed summary: associate cells by position, never PDF text order.

    Individual scheme titles are artwork in this file; only the text-labelled
    summary with its verified three manager/since column pairs is supported.
    """
    if "Fund Manager Details" not in page or "Fund Manager 3" not in page or not words:
        return []
    def mid(word):
        return (word[1] + word[3]) / 2
    def lines(cell):
        grouped = []
        for word in sorted(cell, key=lambda w: (-mid(w), w[0])):
            if not grouped or abs(mid(word) - mid(grouped[-1][0])) > 4:
                grouped.append([word])
            else:
                grouped[-1].append(word)
        return [(sum(mid(w) for w in row) / len(row), " ".join(w[4] for w in sorted(row, key=lambda w: w[0]))) for row in grouped]
    anchors = sorted((w for w in words if w[4] == "LIC" and w[0] < 40), key=mid, reverse=True)
    roles = [w for w in words if w[4] in {"Equity", "Debt", "Commodity", "Equity/Arbitrage"} and w[0] >= 160]
    result = []
    for index, anchor in enumerate(anchors):
        y = mid(anchor)
        upper = (mid(anchors[index - 1]) + y) / 2 if index else y + 8
        lower = (mid(anchors[index + 1]) + y) / 2 if index + 1 < len(anchors) else y - 11
        heading = " ".join(w[4] for w in sorted(words, key=lambda w: w[0]) if w[0] < 160 and abs(mid(w) - y) < 4)
        managers = []
        for name_left, date_left, date_right in [(160, 240, 295), (295, 355, 410), (410, 480, 540)]:
            names = lines([w for w in words if name_left <= w[0] < date_left and lower < mid(w) < upper])
            dates = lines([w for w in words if date_left <= w[0] < date_right and lower < mid(w) < upper])
            header = sorted((w for w in roles if name_left <= w[0] < date_left and mid(w) > y + 5), key=mid)
            role = header[0][4] if header else None
            for name_y, name in names:
                nearby = [(abs(date_y - name_y), raw) for date_y, raw in dates if abs(date_y - name_y) < 4]
                if not nearby or not re.fullmatch(r"[A-Za-z]+(?: [A-Za-z]+)+", name):
                    continue
                since = min(nearby)[1]
                if not re.fullmatch(_DATE, since):
                    continue
                managers.append({"name": name, "role": role, "since_raw": since})
        if heading.startswith("LIC MF ") and managers:
            result.append(SchemePage(heading, managers))
    return result


def _mirae_heading(page: str) -> str:
    lines = [line.strip() for line in page.splitlines() if line.strip()]
    for i, line in enumerate(lines):
        if line.startswith("MIRAE ASSET"):
            title = [line]
            for following in lines[i + 1:]:
                if not following.replace("FoF", "FOF").isupper() or following.startswith(("NSE Symbol", "BSE Code", "(")):
                    break
                title.append(following)
            return " ".join(title)
    return ""


def mirae_managers(page: str) -> list[dict] | None:
    if not _mirae_heading(page):
        return None  # summary columns and performance tables aren't scheme pages
    names = re.search(r"Name of Fund Managers:(.*?)(?:Lump sum Amount|Minimum Investment)", page, re.S)
    if names:
        return [{"name": _clean_name(m.group(1)), "role": None,
                 "since_raw": re.sub(r"(\d)\s+(st|nd|rd|th)\b", r"\1\2", " ".join(m.group(2).split()))}
                for m in re.finditer(r"((?:Mr|Ms)\.\s*.*?)\s*Total Experience:.*?Managing Since:\s*(.*?)(?=(?:Mr|Ms)\.|$)", names.group(1), re.S)]
    # Passive pages repeat names with their start dates in the performance caption.
    info = re.search(r"Fund Managers[@*]?\s*:\s*(.*?)Allotment Date", page, re.S)
    if info:
        dates = {_clean_name(m.group(1).rstrip("@* ")): " ".join(m.group(2).split())
                 for m in re.finditer(r"((?:Mr|Ms)\.\s*[^()\r\n]+?)\s*\(since\s+([^)]*)\)", page)}
        out = []
        for m in re.finditer(r"((?:Mr|Ms)\.\s*[^()\r\n]+)(?:\s*\(([^)]*)\))?", info.group(1)):
            name = _clean_name(m.group(1).rstrip("@* "))
            out.append({"name": name, "role": m.group(2), "since_raw": dates.get(name)})
        return out or None
    return None


def _uti_heading(page: str) -> str:
    for line in page.splitlines():
        title = line.strip().split("(")[0].strip()
        if title.startswith("UTI ") and title.isupper():
            return title
    return ""


def uti_managers(page: str) -> list[dict] | None:
    if "Date of inception/allotment" not in page or "Investment Objective" not in page:
        return None  # reject biographies and repeated performance-only pages
    block = re.split(r"(?:\r?\n)Investment Objective\s*(?:\r?\n)", page, maxsplit=1)[0]
    out = []
    for m in re.finditer(r"((?:Mr|Ms)\.?\s+[^,()\r\n]+?)(?=\s*[,(-]).*?Managing\s+(?:the|this)\s+scheme\s+Since\s+(.*?)\s*Total Exp:", block, re.S | re.I):
        role = re.search(r"(Assistant Fund Manager|Asst\. Fund Manager|Equity Portion|Debt Portion)", m.group(0))
        out.append({"name": _clean_name(m.group(1)), "role": role.group(1) if role else None,
                    "since_raw": " ".join(m.group(2).split()).rstrip(".")})
    return out or None


def choice_managers(page: str) -> list[dict] | None:
    block = re.search(r"Fund Manager\(s\)(.*?)Fund Size", page, re.S)
    if not block:
        return None
    # Names can carry dots, hyphens and apostrophes ("Ajay Kr. Sharma", "D'Souza-Mehta").
    return [{"name": _clean_name(" ".join(m.group(1).split())), "role": None, "since_raw": " ".join(m.group(2).split())}
            for m in re.finditer(r"((?:(?:Mr|Ms|Mrs|Dr)\.\s*)?[A-Z][A-Za-z.'\- ]+?)\s*\(Managing Since ([^)]*)\)", block.group(1))] or None


def _choice_heading(page: str) -> str:
    return next((line.strip() for line in page.splitlines()
                 if re.fullmatch(r"Choice [A-Za-z0-9 &-]+(?:Fund|ETF)", line.strip())), "")


def pgim_managers(page: str) -> list[dict] | None:
    block = re.search(r"Fund Manager:(.*?)Benchmark:", page, re.S)
    if not block:
        return None
    out = []
    # The role parenthetical never starts with "w.e.f." -- that opens the next manager.
    for m in re.finditer(r"\(w\.e\.f\.\s*([^)]*)\)\s*((?:Mr|Ms)\.?\s*[^()]+)(?:\((?!w\.e\.f)([^)]*)\))?", block.group(1)):
        role = " ".join(m.group(3).split()) if m.group(3) else None
        if role and role.startswith("Over "):
            role = None  # experience is not a role
        # A name with no parenthetical runs up to the next "(w.e.f." -- drop the separator it carries.
        name = re.sub(r"(?:\s*(?:[;,&]|\band\b))+\s*$", "", _clean_name(m.group(2)))
        out.append({"name": name, "role": role, "since_raw": " ".join(m.group(1).split())})
    return out or None


def _pgim_heading(page: str) -> str:
    lines = [line.strip() for line in page.splitlines() if line.strip()]
    for i, line in enumerate(lines):
        if line == "PGIM INDIA" and i:
            title = [lines[i - 1]]
            j = i - 2
            while j >= 0 and lines[j].isupper() and not lines[j].startswith(("RISKOMETER", "AMFI")):
                title.insert(0, lines[j])
                j -= 1
            return "PGIM INDIA " + " ".join(title)
    return ""


def _axis_heading(page: str) -> str:
    found = re.search(r"(?m)^(AXIS [A-Z0-9 &'’:/.-]+?)(?: FACTSHEET| Portfolio Snapshot)?\s*$", page)
    return found.group(1).strip() if found else ""


def axis_managers(page: str) -> list[dict] | None:
    if not _axis_heading(page) or "FUND MANAGER" not in page:
        return None
    text = " ".join(page.split())
    found = [{"name": _clean_name(m.group(1)), "role": None, "since_raw": m.group(2)}
             for m in re.finditer(r"([A-Z][A-Za-z'’.-]*(?:\s+[A-Z][A-Za-z'’.-]*)*) is managing the scheme since (.*?) and (?:he|she) manages", text)]
    if not found:
        # One labelled scheme per page; keep its printed names without pairing
        # the separate experience/date columns by text order.
        block = re.search(r"((?:Mr|Ms)\..*?)Work experience", text)
        if block:
            found = [{"name": _clean_name(m.group(1)), "role": None, "since_raw": None}
                     for m in re.finditer(r"((?:Mr|Ms)\.\s*.*?)(?=(?:Mr|Ms)\.|\(|$)", block.group(1))]
    for manager in found:
        role = re.search(r"(?:Mr|Ms)\.\s*" + re.escape(manager["name"]) + r"\s*\(([^)]+)\)", text)
        if role:
            manager["role"] = role.group(1)
    return found or None


def axis_pages(page: str, words: list[Word] | None = None) -> SchemePage | None:
    found = _reader(axis_managers, _axis_heading)(page)
    if found is None or not words:
        return found
    def mid(word):
        return (word[1] + word[3]) / 2
    anchors = [w for w in words if w[4] in {"Mr.", "Ms."}]
    for manager in found.managers:
        if manager["since_raw"] is not None:
            continue
        for anchor in anchors:
            neighbors = sorted((w for w in anchors if abs(mid(w)-mid(anchor)) < 3), key=lambda w: w[0])
            i = neighbors.index(anchor)
            right = neighbors[i+1][0] if i+1 < len(neighbors) else anchor[0]+100
            name_line = " ".join(w[4] for w in sorted(words, key=lambda w: w[0])
                                 if anchor[0] <= w[0] < right and abs(mid(w)-mid(anchor)) < 3)
            if manager["name"] not in name_line:
                continue
            # Experience cards are wider than their centred name labels. Use
            # the printed Work headings to bound the date columns, so a word
            # from the neighboring manager's sentence cannot enter this one.
            works = [w for w in words if w[4] == "Work" and mid(anchor)-30 < mid(w) < mid(anchor)]
            if not works:
                continue
            work = min(works, key=lambda w: abs(w[0]-anchor[0]))
            columns = sorted((w for w in works if abs(mid(w)-mid(work)) < 3), key=lambda w:w[0])
            column = columns.index(work)
            width = (columns[column+1][0] - work[0] if column+1 < len(columns)
                     else work[0] - columns[column-1][0] if column else 100)
            left = work[0] - width * 0.18
            right = left + width
            cell = [w for w in words if left <= w[0] < right and mid(anchor)-100 < mid(w) < mid(anchor)-3]
            lines = []
            for word in sorted(cell, key=lambda w: (-mid(w),w[0])):
                if not lines or abs(mid(word)-mid(lines[-1][0])) > 2:
                    lines.append([word])
                else:
                    lines[-1].append(word)
            text = " ".join(w[4] for line in lines for w in sorted(line,key=lambda w:w[0]))
            since = re.search(r"managing this fund since\s+(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})", text)
            if since:
                manager["since_raw"] = since.group(1)
            break
    return found


def _icici_heading(page: str) -> str:
    title = re.search(r"performance details provided herein are of\s+(ICICI Prudential [^.]+)\.", page)
    if title:
        return " ".join(title.group(1).split())
    return ""


def icici_managers(page: str) -> list[dict] | None:
    if not _icici_heading(page):
        return None
    return [{"name": _clean_name(m.group(1)), "role": None, "since_raw": " ".join(m.group(2).split())}
            for m in re.finditer(r"((?:Mr|Ms)\.\s*[^.]+?) has been managing this fund since\s*([^.]+)\.", page)] or None


def icici_pages(page: str, words: list[Word] | None = None) -> SchemePage | list[SchemePage] | None:
    if "Fund Manager Details" not in page:
        return _reader(icici_managers, _icici_heading)(page)
    if not words:
        return []
    def mid(word):
        return (word[1] + word[3]) / 2
    def lines(cell):
        grouped = []
        for word in sorted(cell, key=lambda w: (-mid(w), w[0])):
            if not grouped or abs(mid(word) - mid(grouped[-1][0])) > 2:
                grouped.append([word])
            else:
                grouped[-1].append(word)
        return [(sum(mid(w) for w in row) / len(row), " ".join(w[4] for w in sorted(row, key=lambda w: w[0]))) for row in grouped]
    anchors = sorted((w for w in words if w[0] < 50 and w[4].strip('"').lower() in {"icici", "bharat"}), key=mid, reverse=True)
    result = []
    for i, anchor in enumerate(anchors):
        upper = mid(anchor) + 4
        lower = mid(anchors[i + 1]) + 4 if i + 1 < len(anchors) else 25
        row = [w for w in words if lower < mid(w) <= upper]
        heading = " ".join(text for _, text in lines([w for w in row if w[0] < 199])).strip('" ')
        managers = []
        # Columns by each word's centre: a name can start a fraction left of its column
        # ("Masoomi" at x=474.94 against 475, Sep 2026) and split from its surname.
        for left, date_left, right in [(199, 257, 289), (289, 349, 381), (381, 441, 475), (475, 534, 576)]:
            dates = lines([w for w in row if date_left <= (w[0] + w[2]) / 2 < right])
            for y, name in lines([w for w in row if left <= (w[0] + w[2]) / 2 < date_left]):
                since = next((raw.rstrip("/ ") for dy, raw in dates if abs(dy-y) < 2), None)
                clean = name.rstrip("/ ")
                # This table lowercases the surname in one row; the same fund's
                # scheme page prints "Ritesh Lunawat". Keep one manager identity.
                if clean == "Ritesh lunawat":
                    clean = "Ritesh Lunawat"
                managers.append({"name": clean, "role": None, "since_raw": since})
        if heading and managers:
            result.append(SchemePage(heading, managers))
    return result


def iti_managers(page: str) -> list[dict] | None:
    if "SCHEME DETAILS" not in page and "QUANTITATIVE DATA" not in page:
        return None  # never pair the ready-reckoner's summary columns by text order
    block = re.search(r"FUND MANAGER\s*(.*?)(?:PORTFOLIO DETAILS|AUM \(in)", page, re.S)
    if not block:
        return None
    return [{"name": _clean_name(m.group(1)), "role": None, "since_raw": m.group(2).strip()}
            for m in re.finditer(r"((?:Mr|Ms)\.\s*[^()]+)\s*\(Since ([^)]+)\)", block.group(1))] or None


def trust_managers(page: str) -> list[dict] | None:
    block = re.search(r"Fund Manager/s \(Managing scheme since\)(.*?)Benchmark", page, re.S)
    if not block:
        return None
    return [{"name": _clean_name(re.sub(r"\s+since$", "", m.group(1).strip())), "role": None,
             "since_raw": m.group(2).strip()}
            for m in re.finditer(r"([^\r\n]+)\s*\(([^)]+)\)\s*Total Experience", block.group(1))] or None


def _whiteoak_heading(page: str) -> str:
    title = re.search(r"(?:^|\n)(WhiteOak Capital [^\n]+(?:\nFund)?)(?:\n|$)", page)
    if title:
        return " ".join(title.group(1).split())
    title = re.search(r"Why to Invest in (WhiteOak Capital [^?]+)\s*\?", page)
    return " ".join(title.group(1).split()) if title else ""


def whiteoak_managers(page: str) -> list[dict] | None:
    if not _whiteoak_heading(page):
        return None
    return [{"name": _clean_name(m.group(1)), "role": m.group(2), "since_raw": " ".join(m.group(3).split())}
            for m in re.finditer(r"((?:Mr|Ms)\.\s*[^()\n]+)(?:\s*\(+([^)]+)\))?\s*Managing this [Ss]cheme (?:from|since)\s+(.*?)\s*Total Work Experience", page, re.S)] or None


def _run7_heading(page: str, prefix: str) -> str:
    """These files print the scheme title on one or two lines before its type caption."""
    lines = [line.strip() for line in page.splitlines() if line.strip()]
    for i, line in enumerate(lines):
        if line.startswith(prefix):
            title = line
            if not re.search(r"\b(?:Fund|ETF)\b", title, re.I) and i + 1 < len(lines):
                title += " " + lines[i + 1]
            if prefix == "Bank of India " and re.search(r"\d", title):
                continue  # a portfolio holding followed by its allocation
            found = re.match(r"(.+?\b(?:Fund(?: of Funds?)?|ETF(?: Fund of Funds?| FOF)?)\b)", title, re.I)
            if found:
                return found.group(1)
    return ""


def one360_page(page: str, words: list[Word] | None = None) -> SchemePage | None:
    """Manager labels and names share a baseline; biographies below are not rows."""
    if words is None:
        return None
    managers = []
    labels = sorted((w for w in words if w[4] == "Manager" and w[0] < 80), key=lambda w: -w[1])
    for label in labels:
        baseline = [w for w in words if abs(w[1] - label[1]) < 3]
        if not any(w[4] == "Fund" and w[0] < label[0] for w in baseline):
            continue
        name_words = []
        for word in sorted((w for w in baseline if label[2] < w[0] < 190), key=lambda w: w[0]):
            if name_words and word[0] - name_words[-1][2] > 8:
                break  # the adjacent portfolio column is a separate text run
            name_words.append(word)
        name = " ".join(w[4] for w in name_words)
        found = re.match(r"(?:Mr|Ms)\.\s+([A-Za-z.]+(?:\s+[A-Za-z.]+)+)", name)
        if found:
            managers.append({"name": found.group(1), "role": "Co-Fund Manager" if any(w[4] == "Co-" for w in baseline) else None, "since_raw": None})
    return _page(_run7_heading(page, "360 ONE "), managers, page) if managers else None


def angel_managers(page: str) -> list[dict] | None:
    if "Fund Manager Details" not in page:
        return None
    return [{"name": _clean_name(m.group(1)), "role": None, "since_raw": m.group(2)}
            for m in re.finditer(r"((?:Mr|Ms)\.\s+[A-Za-z. ]+)\s+Overall Experience:\s*\d+ years\s*\(managing scheme since ([^)]+)\)", page)] or None


def boi_managers(page: str) -> list[dict] | None:
    block = re.search(r"FUND MANAGER(.*?)(?:AVERAGE AUM|$)", page, re.S)
    if not block:
        return None
    return [{"name": _clean_name(m.group(1)), "role": None, "since_raw": m.group(2).strip() if m.group(2) else None}
            for m in re.finditer(r"((?:Mr|Ms)\.\s+[A-Za-z. ]+?)\s*(?:\(w\.e\.f\.?\s*([^)]+)\))?\s*:", block.group(1))] or None


def baroda_managers(page: str) -> list[dict] | None:
    block = re.search(r"Fund Manager And Experience(.*?)(?:Scheme Riskometer|Fund Performance|Major Risk Factors|Quantitative|Portfolio|$)", page, re.S)
    if not block:
        return None
    managers, role = [], None
    for match in re.finditer(r"(?P<role>Equity Category|Fixed Income)|(?P<name>(?:Mr|Ms)\.\s+[A-Za-z.\s]+?)\s+\d+\s+[Yy]ears\s+(?P<since>\d{2}-[A-Za-z]+-\d{2})", block.group(1)):
        if match.group("role"):
            role = match.group("role")
        else:
            managers.append(dict(name=_clean_name(match.group("name")), role=role, since_raw=match.group("since")))
    return managers or None


def jio_managers(page: str) -> list[dict] | None:
    if "SCHEME DETAILS" not in page:
        return None
    return [{"name": _clean_name(m.group(1)), "role": None, "since_raw": m.group(2)}
            for m in re.finditer(r"((?:Mr|Ms)\.\s+[A-Za-z. ]+)\s+Total Experience\s+\d+ Years\s+Managing this fund since\s+([A-Za-z]+ \d{4})", page)] or None


def _position_lines(words: list[Word]) -> list[list[Word]]:
    """Group by vertical centre, then sort horizontally; input order is irrelevant."""
    lines: list[list[Word]] = []
    for word in sorted(words, key=lambda w: -(w[1] + w[3]) / 2):
        centre = (word[1] + word[3]) / 2
        if lines and abs(centre - (lines[-1][0][1] + lines[-1][0][3]) / 2) < 2.5:
            lines[-1].append(word)
        else:
            lines.append([word])
    return [sorted(line, key=lambda w: w[0]) for line in lines]


# A person's name: capitalised words or initials; hyphenated and apostrophe surnames
# ("Padwal-Desai", "D'Souza") are names too, not a reason to drop the manager.
_FRANKLIN_NAME = r"(?:[A-Z]'[A-Z][a-z]+|[A-Z][a-z]+(?:['-][A-Z][a-z]+)*|[A-Z]\.)(?: (?:[A-Z]'[A-Z][a-z]+|[A-Z][a-z]+(?:['-][A-Z][a-z]+)*|[A-Z]\.))+"

def franklin_pages(page: str, words: list[Word] | None = None) -> SchemePage | list[SchemePage] | None:
    if words is None:
        return None  # prose extraction loses the scheme/manager column relationship
    titles = []
    lines = _position_lines(words)
    for i, line in enumerate(lines):
        text = " ".join(w[4] for w in line)
        if not any(w[4] in {"Franklin", "Templeton"} and w[0] < 100 for w in line):
            continue  # titles begin in the left margin; holdings occupy the next column
        title = re.match(r"^(?:\$+ )?((?:Franklin|Templeton) (?:India|Asian|Build|U\.S\.) .+)", text)
        if not title:
            continue
        text = title.group(1)
        if not re.search(r"\b(?:Fund|Plan)\b", text) or text.endswith(" of"):
            if i + 1 < len(lines):
                text += " " + " ".join(w[4] for w in lines[i + 1])
        name = re.match(r"(.+?\b(?:Fund(?: of Funds?)?|Plan)\b)", text)
        if name:
            titles.append(((line[0][1] + line[0][3]) / 2, name.group(1)))
    result, seen = [], set()
    for label in sorted((w for w in words if w[4] in {"MANAGER(S)", "MANAGER"} and w[0] < 100), key=lambda w: -w[1]):
        y = (label[1] + label[3]) / 2
        above = [(ty, title) for ty, title in titles if ty > y]
        if not above:
            continue
        _, heading = min(above, key=lambda pair: pair[0] - y)
        if heading in seen:
            continue  # the second labelled block on the US FoF belongs to the underlying fund
        seen.add(heading)
        fund = next((w for w in words if w[4] == "FUND" and abs((w[1] + w[3]) / 2 - y) < 3 and w[0] < label[0]), None)
        if fund is None:
            continue
        left = fund[0] - 2
        column = [w for w in words if left <= (w[0] + w[2]) / 2 < left + 132 and y - 100 < (w[1] + w[3]) / 2 < y - 3]
        rows = []
        for line in _position_lines(column):
            text = " ".join(w[4] for w in line)
            if re.match(r"(?:BENCHMARK|FUND ?SIZE|FUND MANAGER|NAV|DATE ?OF ?ALLOTMENT|TYPE OF|VOLATILITY|MATURITY|LOAD|MINIMUM|BASE)", text):
                break
            if text.isupper():
                continue  # first block's '(FOR …)' caption wraps below its label
            if rows and (text.startswith("(") or rows[-1].count("(") > rows[-1].count(")")):
                rows[-1] += " " + text
            else:
                rows.append(text)
        managers = []
        for row in rows:
            collective = re.search(r"\(w\.e\.f\.?\s*([^)]+)\)$", row) if "&" in row else None
            for raw in re.split(r",(?![^()]*\))|&", row):
                raw = raw.strip()
                since = re.search(r"\(w\.e\.f\.?\s*([^)]+)\)", raw)
                role = re.search(r"\((dedicated[^)]+)\)", raw)
                name = re.sub(r"\s*\(.*", "", raw).strip()
                if re.fullmatch(_FRANKLIN_NAME, name):
                    managers.append(dict(name=name, role=role.group(1) if role else None, since_raw=since.group(1) if since else collective.group(1) if collective else None))
        if managers:
            result.append(SchemePage(heading, managers))
    return result[0] if len(result) == 1 else result or None


def _reader(managers: Callable[[str], list[dict] | None], heading: Callable[[str], str]) -> Callable[[str], SchemePage | None]:
    def read(page: str) -> SchemePage | None:
        found = managers(page)
        if found:
            current = []
            for manager in found:
                name_pattern = r"\s+".join(re.escape(word) for word in manager["name"].split())
                if re.search(name_pattern + r"\s*\([^)]*\bceased\b", page, re.I):
                    continue
                role = manager.get("role")
                if role and re.search(r"w\.e\.f\.?", role, re.I):
                    manager = {**manager, "role": None}
                current.append(manager)
            found = current
        return _page(heading(page), found, page) if found else None
    return read


# One reader per AMC: a manager layout plus where that AMC prints the scheme name.
# Task 8 adds an entry per onboarded AMC (reusing a layout where the shape matches).
LAYOUTS: dict[str, Callable[..., SchemePage | list[SchemePage] | None]] = {
    "360": one360_page,
    "angel": _reader(angel_managers, lambda p: _run7_heading(p, "Angel One ")),
    "boi": _reader(boi_managers, lambda p: _run7_heading(p, "Bank of India ")),
    "baroda": _reader(baroda_managers, lambda p: _run7_heading(p, "Baroda BNP Paribas ")),
    "franklin": franklin_pages,
    "jio": _reader(jio_managers, lambda p: _run7_heading(p, "JioBlackRock ")),
    "axis": axis_pages,
    "icici": icici_pages,
    "iti": _reader(iti_managers, lambda p: _brand_line_heading(p, "ITI ")),
    "trust": _reader(trust_managers, lambda p: _brand_line_heading(p, "TRUSTMF ")),
    "whiteoak": _reader(whiteoak_managers, _whiteoak_heading),
    "choice": _reader(choice_managers, _choice_heading),
    "pgim": _reader(pgim_managers, _pgim_heading),
    "uti": _reader(uti_managers, _uti_heading),
    "mirae": _reader(mirae_managers, _mirae_heading),
    "sundaram": _reader(sundaram_managers, _sundaram_heading),
    "zerodha": _reader(zerodha_managers, lambda p: _brand_line_heading(p, "Zerodha ")),
    "unifi": _reader(unifi_managers, _unifi_heading),
    "shriram": _reader(bullets_slash, lambda p: _brand_line_heading(p, "Shriram ")),
    "quantum": _reader(quantum_managers, _quantum_heading),
    "quant": _reader(quant_managers, lambda p: _brand_line_heading(p, "quant ")),
    "ppfas": _reader(ppfas_managers, lambda p: _brand_line_heading(p, "Parag Parikh ")),
    "nj": _reader(nj_managers, lambda p: _brand_line_heading(p, "NJ ")),
    "lic": lic_summary,
    "hsbc": _reader(bullets_slash, _hsbc_heading),
    "helios": _reader(helios_experience, lambda p: _brand_line_heading(p, "Helios ")),
    "groww": _reader(groww_scheme_managers, _groww_heading),
    "dsp": _reader(dsp_experience, _dsp_heading),
    "capitalmind": _reader(capitalmind_table, lambda p: _brand_line_heading(p, "Capitalmind ")),
    "canara": _reader(canara_scheme_managers, _canara_heading),
    "abakkus": _reader(abakkus_bullets, lambda p: _brand_line_heading(p, "Abakkus ")),
    "absl_september": _reader(bullets_slash, _absl_scheme_heading),
    "nippon": _reader(bullets_slash, lambda p: _brand_line_heading(p, "Nippon India")),
    "edelweiss": _reader(bullets_slash, _first_line_heading),
    "hdfc": _reader(hdfc_table, _first_line_heading),
    "kotak": _reader(kotak_line, lambda p: _brand_line_heading(p, "KOTAK ")),
    "absl": _reader(absl_line, lambda p: _brand_line_heading(p, "Aditya Birla Sun Life")),
}
