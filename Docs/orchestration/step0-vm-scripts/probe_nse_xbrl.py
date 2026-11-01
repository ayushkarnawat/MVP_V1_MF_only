#!/usr/bin/env python3
# NSE XBRL probe. Python 3, standard library only; run on the approved Indian-IP machine.
# Run: python3 probe_nse_xbrl.py --symbol TCS
# Bank (separate run, one ZIP): python3 probe_nse_xbrl.py --symbol HDFCBANK
# Optional exact listed issuer: --issuer "Tata Consultancy Services Limited"
# Paste back ONLY stdout: HTTP statuses/timings, ZIP size/member names and matching
# XBRL facts with their contexts. Never paste cookies, request headers or response bodies.
# No authentication, cookie values, household data or database access is printed.
# Each run uses a new folder beside this script; no existing files are modified.
# HTTP requests are sequential and separated by at least two seconds. There are
# no retries (within the allowed maximum of one). 401/403/429 stops the probe.
# Only the selected filing attachment is downloaded; period variants are separate
# list queries, not retries. The probe never downloads another attachment.

import argparse
import datetime as dt
import http.cookiejar
import io
import json
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path, PurePosixPath

BASE = "https://www.nseindia.com"
PAGE = BASE + "/companies-listing/corporate-filings-financial-results"
LIST = BASE + "/api/corporates-financial-results"
BLOCKED = {401, 403, 429}
# Known list period spelling is Quarterly. Other spelling variants below are
# candidates, not asserted API documentation; only parsed eligible records count.
PERIODS = ("Quarterly", "Half Yearly", "Half-Yearly", "Annual", "Yearly")
WORDS = re.compile(r"Equity|Reserves|PaidUp|Shares|FaceValue|NumberOf", re.I)
MAX_HTTP_BYTES = 64 * 1024 * 1024
MAX_XML_BYTES = 128 * 1024 * 1024
MAX_TOTAL_XML_BYTES = 256 * 1024 * 1024
XBRLI = "http://www.xbrl.org/2003/instance"


class StopProbe(Exception):
    pass


def emit(kind, **values):
    print(json.dumps({"kind": kind, **values}, ensure_ascii=True), flush=True)


def local_name(tag):
    return tag.rsplit("}", 1)[-1].split(":")[-1]


def safe_name(name):
    # JSON escaping prevents terminal control characters in member/tag names.
    return str(name)


class Network:
    def __init__(self):
        self.cookies = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cookies), NoRedirect()
        )
        self.last_finished = None

    def get(self, url, kind):
        if self.last_finished is not None:
            time.sleep(max(0, 2 - (time.monotonic() - self.last_finished)))
        request = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
            "Accept": "application/json,text/html,application/zip,*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": PAGE,
        })
        started = time.monotonic()
        try:
            try:
                response = self.opener.open(request, timeout=60)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                status = response.code
                # Do not read/store blocked or unsuccessful HTML response bodies.
                if status == 200:
                    body = response.read(MAX_HTTP_BYTES + 1)
                    if len(body) > MAX_HTTP_BYTES:
                        raise StopProbe("response_size_limit")
                else:
                    body = b""
            emit(kind, status=status, seconds=round(time.monotonic() - started, 3))
            if status in BLOCKED:
                raise StopProbe("blocked_" + str(status))
            return status, body
        except (urllib.error.URLError, TimeoutError, OSError):
            emit(kind, status=None, seconds=round(time.monotonic() - started, 3))
            raise StopProbe("network_error")
        finally:
            self.last_finished = time.monotonic()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    # No hidden extra requests, and no request to an attachment's redirect target.
    def redirect_request(self, request, fp, code, message, headers, new_url):
        return None


def parse_date(value):
    if not isinstance(value, str):
        return None
    value = value.strip()
    for fmt in ("%d-%b-%Y", "%d-%b-%Y %H:%M:%S", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y", "%d-%b-%Y %H:%M", "%d-%b-%Y %H:%M:%S.%f"):
        try:
            return dt.datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    try:
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def records(payload):
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict):
        for key in ("data", "results", "records"):
            if key in payload:
                return records(payload[key])
    return []


def first(row, keys):
    for key in keys:
        if row.get(key) is not None:
            return row[key]
    return None


def eligible(row, symbol):
    if str(first(row, ("symbol", "Symbol", "SYMBOL")) or "").strip().upper() != symbol:
        return None
    attachment = row.get("attachment_filename")
    if not isinstance(attachment, str) or not attachment.strip():
        return None
    end = parse_date(first(row, ("to_date", "period_ended", "periodEnded", "period_end", "periodEnd", "periodEndDate", "toDate")))
    if end is None or end > dt.date.today():
        return None
    start = parse_date(first(row, ("from_date", "fromDate", "period_start", "periodStart")))
    # NSE's financial-results list uses cumulitive for cumulative annual/half-year
    # spans, and period may still say Quarterly. Check actual reported span first.
    labels = " ".join(str(row.get(key) or "") for key in (
        "period", "period_type", "periodType", "result_type", "resultType", "cumulitive", "cumulative", "relating_to"
    )).lower()
    annual = bool(re.search(r"\b(?:annual|yearly|full[ -]?year|12\s*months?|twelve\s*months?|year\s*ended)\b", labels))
    half = bool(re.search(r"\b(?:half[ -]?year(?:ly)?|6\s*months?|six\s*months?)\b", labels))
    if start is not None:
        days = (end - start).days + 1
        if not (160 <= days <= 200 or 340 <= days <= 380):
            return None
    elif not (annual or half):
        # Never infer a half-year from a quarter merely ending in March/September.
        return None
    filed = parse_date(first(row, ("filing_date", "broadcast_date", "date", "filingDate", "an_dt"))) or end
    return end, filed, attachment.strip()


def attachment_url(value):
    url = urllib.parse.urljoin(BASE + "/", value)
    parsed = urllib.parse.urlsplit(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or parsed.username or parsed.password or not (
        host == "nseindia.com" or host.endswith(".nseindia.com")
    ):
        raise StopProbe("attachment_host_not_nse")
    return url


def contexts(root):
    result = {}
    for context in root.iter("{" + XBRLI + "}context"):
        result[context.get("id")] = {
            "id": context.get("id"),
            "period": [
                {"tag": node.tag, "value": (node.text or "").strip()}
                for node in context.iter()
                if local_name(node.tag) in {"instant", "startDate", "endDate", "forever"}
            ],
            "dimensions": [
                {"tag": node.tag, "dimension": node.get("dimension"), "value": " ".join(node.itertext()).strip()}
                for node in context.iter()
                if local_name(node.tag) in {"explicitMember", "typedMember"}
            ],
        }
    return result


def inspect_xml(name, body):
    # No external entities, DTDs, extraction to disk or network-enabled XML parser.
    if b"<!DOCTYPE" in body.upper() or b"<!ENTITY" in body.upper():
        raise StopProbe("xml_doctype_or_entity")
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        raise StopProbe("invalid_xbrl_xml")
    ctx = contexts(root)
    for node in root.iter():
        fact_name = node.get("name") if local_name(node.tag) in {"nonFraction", "nonNumeric", "fraction"} else node.tag
        if not fact_name or not WORDS.search(local_name(fact_name)):
            continue
        # Fact values may use scale/decimals or a unit reference. Preserve them:
        # the probe prints raw facts, without silently selecting a context or unit.
        emit("fact", file=safe_name(name), tag=fact_name,
             value=" ".join(node.itertext()).strip(), context_ref=node.get("contextRef"),
             context=ctx.get(node.get("contextRef")), unit_ref=node.get("unitRef"),
             decimals=node.get("decimals"), scale=node.get("scale"), sign=node.get("sign"),
             nil=node.get("{http://www.w3.org/2001/XMLSchema-instance}nil"))


def main():
    parser = argparse.ArgumentParser(description="One-file, sequential NSE XBRL probe.")
    parser.add_argument("--symbol", default="TCS")
    parser.add_argument("--issuer")
    args = parser.parse_args()
    symbol = args.symbol.strip().upper()
    if not re.fullmatch(r"[A-Z0-9&_.-]+", symbol):
        raise StopProbe("invalid_symbol")
    issuers = {"TCS": "Tata Consultancy Services Limited", "HDFCBANK": "HDFC Bank Limited"}
    issuer = args.issuer if args.issuer is not None else issuers.get(symbol)
    if not issuer:
        raise StopProbe("issuer_required")
    network = Network()
    status, _ = network.get(PAGE, "handshake")
    if status != 200:
        raise StopProbe("handshake_failed")
    candidates = []
    for period in PERIODS:
        query = urllib.parse.urlencode({"index": "equities", "symbol": symbol, "issuer": issuer, "period": period})
        status, body = network.get(LIST + "?" + query, "list")
        if status != 200:
            continue
        try:
            payload = json.loads(body.decode("utf-8-sig"))
        except (ValueError, UnicodeError):
            raise StopProbe("invalid_list_json")
        for row in records(payload):
            candidate = eligible(row, symbol)
            if candidate is not None:
                candidates.append(candidate)
    if not candidates:
        raise StopProbe("no_half_year_or_annual_attachment")
    # Newest period, then newest filing. One attachment, never one per variant.
    _, _, attachment = max(candidates, key=lambda item: (item[0], item[1]))
    url = attachment_url(attachment)
    folder = Path(tempfile.mkdtemp(prefix=symbol + "-xbrl-", dir=Path(__file__).resolve().parent))
    status, body = network.get(url, "zip")
    if status != 200:
        raise StopProbe("zip_download_failed")
    emit("zip_size", bytes=len(body))
    if not zipfile.is_zipfile(io.BytesIO(body)):
        raise StopProbe("attachment_is_not_a_zip")
    (folder / "filing.zip").write_bytes(body)
    with zipfile.ZipFile(io.BytesIO(body)) as archive:
        members = [item for item in archive.infolist() if not item.is_dir()]
        files = [item for item in members if PurePosixPath(item.filename).suffix.lower() in {".xml", ".xbrl", ".xhtml", ".html", ".htm"}]
        emit("xbrl_files", files=[safe_name(item.filename) for item in files])
        if not files:
            raise StopProbe("zip_has_no_xbrl_xml_files")
        if any(item.file_size > MAX_XML_BYTES for item in files) or sum(item.file_size for item in files) > MAX_TOTAL_XML_BYTES:
            raise StopProbe("xml_size_limit")
        for item in files:
            inspect_xml(item.filename, archive.read(item))
    return 0


if __name__ == "__main__":
    try:
        code = main()
    except StopProbe as error:
        emit("stop", reason=str(error))
        code = 1
    except Exception:
        # Do not expose response bodies, cookies or URLs through exception text.
        emit("stop", reason="probe_error")
        code = 1
    sys.exit(code)
