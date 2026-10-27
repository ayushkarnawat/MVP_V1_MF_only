"""T3: GDELT ingest. No live network anywhere -- every fetch goes through
httpx.MockTransport, backed by the committed fixtures in
tests/fixtures/gdelt/ (two 15-minute files, ~14 rows, original headlines in
the style of Indian business news)."""

from __future__ import annotations

import asyncio
import io
import random
import string
import tracemalloc
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest

from app.services.news.ingest import (
    IngestStats,
    RawArticle,
    fetch_file,
    ingest_window,
    iter_gkg_zip,
    parse_gkg_line,
    window_stamps,
)

UTC = timezone.utc
FIXTURES = Path(__file__).parents[2] / "fixtures/gdelt"


@pytest.fixture(autouse=True)
def no_real_pause(monkeypatch):
    """ingest_window pauses 1s between files in production (T6's job
    requirement); tests stub it so the suite stays fast without changing
    the fixed ingest_window signature."""
    async def instant_sleep(_seconds):
        return None
    monkeypatch.setattr("app.services.news.ingest.asyncio.sleep", instant_sleep)


def _zip_bytes(*rows: str) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("data.csv", ("\n".join(rows) + "\n").encode("utf-8"))
    return buffer.getvalue()


def _fixture_rows(name: str) -> list[str]:
    text = (FIXTURES / name).read_text(encoding="utf-8")
    return [line for line in text.split("\n") if line]


def _fixture_zip(name: str) -> bytes:
    return _zip_bytes(*_fixture_rows(name))


FILE_1_STAMP = "20261023080000"
FILE_2_STAMP = "20261023074500"
FILE_1_ZIP = _fixture_zip(f"{FILE_1_STAMP}.gkg.csv")
FILE_2_ZIP = _fixture_zip(f"{FILE_2_STAMP}.gkg.csv")


def _mock_client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _fixture_handler(available: dict[str, bytes]):
    def handle(request: httpx.Request) -> httpx.Response:
        stamp = request.url.path.rsplit("/", 1)[-1].split(".")[0]
        if stamp in available:
            return httpx.Response(200, content=available[stamp])
        return httpx.Response(404)
    return handle


# ---------------------------------------------------------------------------
# (1) window_stamps
# ---------------------------------------------------------------------------

def test_window_stamps_newest_first_floored_to_15_minutes():
    now = datetime(2026, 10, 23, 9, 7, tzinfo=UTC)
    assert window_stamps(now, 1) == [
        "20261023080000", "20261023074500", "20261023073000", "20261023071500",
    ]


def test_window_stamps_hours_five_gives_twenty_stamps():
    now = datetime(2026, 10, 23, 9, 7, tzinfo=UTC)
    assert len(window_stamps(now, 5)) == 20


# ---------------------------------------------------------------------------
# (2) fixture rows parse to the expected articles
# ---------------------------------------------------------------------------

def test_fixture_rows_parse_to_expected_articles():
    rows = _fixture_rows(f"{FILE_1_STAMP}.gkg.csv")
    hdfc = parse_gkg_line(rows[0])
    assert hdfc == RawArticle(
        url="https://www.moneycontrol.com/news/business/markets/hdfc-bank-q2-profit-example.html",
        title="HDFC Bank Q2 profit rises 11% as loan growth picks up",
        domain="moneycontrol.com",
        source="Moneycontrol",
        published_at=datetime(2026, 10, 23, 7, 58, 55, tzinfo=UTC),
        origin="indian",
    )
    apple = parse_gkg_line(rows[5])
    assert apple is not None
    assert apple.domain == "reuters.com"
    assert apple.source == "Reuters"
    assert apple.origin == "global"


# ---------------------------------------------------------------------------
# (3) non-English skipped
# ---------------------------------------------------------------------------

def test_non_english_translation_info_skipped():
    rows = _fixture_rows(f"{FILE_1_STAMP}.gkg.csv")
    assert parse_gkg_line(rows[6]) is None  # srclc:hi translation info


def test_devanagari_title_with_empty_translation_info_skipped():
    rows = _fixture_rows(f"{FILE_1_STAMP}.gkg.csv")
    assert parse_gkg_line(rows[7]) is None  # < 80% ASCII letters


# ---------------------------------------------------------------------------
# (4) allow-list
# ---------------------------------------------------------------------------

def test_allowlist_sites_and_etimes_path_rule():
    rows = _fixture_rows(f"{FILE_1_STAMP}.gkg.csv")
    assert parse_gkg_line(rows[0]) is not None  # moneycontrol.com
    assert parse_gkg_line(rows[1]) is not None  # m.moneycontrol.com subdomain
    assert parse_gkg_line(rows[2]) is None      # fakemoneycontrol.com
    assert parse_gkg_line(rows[3]) is not None  # economictimes.indiatimes.com /markets
    assert parse_gkg_line(rows[4]) is None      # economictimes.indiatimes.com /news/economy
    apple = parse_gkg_line(rows[5])
    assert apple is not None and apple.origin == "global"


def test_disabled_source_skipped():
    rows = _fixture_rows(f"{FILE_1_STAMP}.gkg.csv")
    assert parse_gkg_line(rows[0], disabled_sources={"moneycontrol.com"}) is None
    assert parse_gkg_line(rows[0]) is not None


# ---------------------------------------------------------------------------
# (5) dedup
# ---------------------------------------------------------------------------

def test_ingest_window_dedups_same_url_and_same_title_across_and_within_files():
    now = datetime(2026, 10, 23, 9, 7, tzinfo=UTC)  # window covers both fixture stamps

    async def run():
        handler = _fixture_handler({FILE_1_STAMP: FILE_1_ZIP, FILE_2_STAMP: FILE_2_ZIP})
        async with _mock_client(handler) as client:
            return await ingest_window(client, now, 1)

    articles, stats = asyncio.run(run())
    urls = [a.url for a in articles]
    assert len(urls) == len(set(urls))
    assert "utm_source" not in "".join(urls)
    assert "#" not in "".join(urls)
    hdfc_matches = [a for a in articles if "hdfc-bank-q2-profit" in a.url]
    assert len(hdfc_matches) == 1
    sensex_matches = [a for a in articles if "sensex" in a.title.lower()]
    assert len(sensex_matches) == 1
    assert stats.skipped_dup >= 3  # cross-file URL dup, cross-file title dup, intra-file URL dup


# ---------------------------------------------------------------------------
# (6) title cleanup
# ---------------------------------------------------------------------------

def test_title_cleanup_entities_whitespace_and_publisher_suffix():
    line = parse_gkg_line(
        "\t".join(
            [
                "rec", "20261023080000", "1", "moneycontrol.com",
                "https://www.moneycontrol.com/news/example-entities.html",
            ] + [""] * 20 + [
                "",
                "<PAGE_TITLE>Markets  &amp;   economy   update   -   Moneycontrol</PAGE_TITLE>",
            ]
        )
    )
    assert line is not None
    assert line.title == "Markets & economy update"


def test_row_without_page_title_is_skipped():
    rows = _fixture_rows(f"{FILE_2_STAMP}.gkg.csv")
    assert parse_gkg_line(rows[5]) is None


# ---------------------------------------------------------------------------
# (7) published_at rule
# ---------------------------------------------------------------------------

def test_precise_timestamp_used_when_present_and_not_after_date():
    rows = _fixture_rows(f"{FILE_1_STAMP}.gkg.csv")
    article = parse_gkg_line(rows[0])
    assert article is not None
    assert article.published_at == datetime(2026, 10, 23, 7, 58, 55, tzinfo=UTC)


def test_precise_timestamp_ignored_when_later_than_date():
    line = "\t".join(
        [
            "rec", "20261023080000", "1", "moneycontrol.com",
            "https://www.moneycontrol.com/news/example-late-precise.html",
        ] + [""] * 20 + [
            "",
            "<PAGE_TITLE>Example headline for precise timestamp rule</PAGE_TITLE>"
            "<PAGE_PRECISEPUBTIMESTAMP>20261023081500</PAGE_PRECISEPUBTIMESTAMP>",
        ]
    )
    article = parse_gkg_line(line)
    assert article is not None
    assert article.published_at == datetime(2026, 10, 23, 8, 0, 0, tzinfo=UTC)


# ---------------------------------------------------------------------------
# (8) 404 retried then counted missing
# ---------------------------------------------------------------------------

def test_fetch_file_retries_404_then_returns_none():
    calls = []

    def handle(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        return httpx.Response(404)

    async def run():
        async with _mock_client(handle) as client:
            return await fetch_file(client, "20261023060000", tries=2, retry_sleep=0)

    result = asyncio.run(run())
    assert result is None
    assert len(calls) == 2


def test_ingest_window_counts_missing_and_still_reads_other_files():
    now = datetime(2026, 10, 23, 9, 7, tzinfo=UTC)

    async def run():
        handler = _fixture_handler({FILE_1_STAMP: FILE_1_ZIP})  # FILE_2_STAMP missing
        async with _mock_client(handler) as client:
            return await ingest_window(client, now, 1, retry_sleep=0)

    articles, stats = asyncio.run(run())
    assert stats.files_missing >= 1
    assert stats.files_ok >= 1
    assert any("hdfc-bank-q2-profit" in a.url for a in articles)


# ---------------------------------------------------------------------------
# (9) truncated zip
# ---------------------------------------------------------------------------

def test_ingest_window_truncated_zip_counts_failed_other_files_still_read():
    now = datetime(2026, 10, 23, 9, 7, tzinfo=UTC)
    truncated = FILE_1_ZIP[: int(len(FILE_1_ZIP) * 0.6)]

    async def run():
        handler = _fixture_handler({FILE_1_STAMP: truncated, FILE_2_STAMP: FILE_2_ZIP})
        async with _mock_client(handler) as client:
            return await ingest_window(client, now, 1, retry_sleep=0)

    articles, stats = asyncio.run(run())
    assert stats.files_failed >= 1
    assert any("gold-prices" in a.url for a in articles)  # from the intact file 2


# ---------------------------------------------------------------------------
# (10) iter_gkg_zip is a generator, bounded memory
# ---------------------------------------------------------------------------

def test_iter_gkg_zip_is_a_generator_with_bounded_memory():
    rng = random.Random(42)
    rows = [
        "".join(rng.choices(string.ascii_letters + string.digits + " \t", k=80))
        for _ in range(60_000)
    ]
    data = _zip_bytes(*rows)

    tracemalloc.start()
    count = 0
    peak_before, _ = tracemalloc.get_traced_memory()
    for _ in iter_gkg_zip(data):
        count += 1
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    assert count == 60_000
    peak_mb = peak / (1024 * 1024)
    if peak_mb >= 25:
        pytest.fail(f"iter_gkg_zip peak memory {peak_mb:.1f} MB (budget 25 MB) -- loose, report if flaky")


def test_iter_gkg_zip_returns_a_generator_not_a_list():
    import inspect
    result = iter_gkg_zip(_zip_bytes("a\tb"))
    assert inspect.isgenerator(result)


# ---------------------------------------------------------------------------
# (11) network error three times counts failed
# ---------------------------------------------------------------------------

def test_network_error_three_times_counts_failed():
    now = datetime(2026, 10, 23, 7, 7, tzinfo=UTC)  # window of 1h: 06:00,05:45,05:30,05:15

    def handle(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom", request=request)

    async def run():
        async with _mock_client(handle) as client:
            return await ingest_window(client, now, 1, retry_sleep=0)

    articles, stats = asyncio.run(run())
    assert articles == []
    assert stats.files_failed == 4
    assert stats.files_ok == 0
    assert stats.files_missing == 0


def _line_with_title(domain: str, title: str) -> str:
    return "\t".join(
        ["rec", "20261023080000", "1", domain, f"https://www.{domain}/news/x.html"]
        + [""] * 20
        + ["", f"<PAGE_TITLE>{title}</PAGE_TITLE>"]
    )


def test_title_keeps_non_publisher_dash_tail():
    article = parse_gkg_line(_line_with_title("moneycontrol.com", "Gold prices surge - silver follows"))
    assert article is not None
    assert article.title == "Gold prices surge - silver follows"


def test_title_strips_publisher_suffix_case_insensitively():
    article = parse_gkg_line(_line_with_title("moneycontrol.com", "Gold prices surge - MONEYCONTROL"))
    assert article is not None
    assert article.title == "Gold prices surge"


def test_title_does_not_strip_other_publishers_suffix():
    article = parse_gkg_line(_line_with_title("moneycontrol.com", "Gold prices surge - Reuters"))
    assert article is not None
    assert article.title == "Gold prices surge - Reuters"


def _line_with_url(domain: str, url: str) -> str:
    return "\t".join(
        ["rec", "20261023080000", "1", domain, url]
        + [""] * 20
        + ["", "<PAGE_TITLE>Some headline</PAGE_TITLE>"]
    )


@pytest.mark.parametrize("url", [
    "javascript:alert(1)",
    "ftp://www.moneycontrol.com/news/x.html",
    "https://evil.example.com/news/x.html",
    "https://moneycontrol.com.evil.example.com/news/x.html",
    "https://notmoneycontrol.com/news/x.html",
    "//www.moneycontrol.com/news/x.html",
])
def test_article_url_must_be_http_on_the_allow_listed_domain(url):
    assert parse_gkg_line(_line_with_url("moneycontrol.com", url)) is None


@pytest.mark.parametrize("url", [
    "https://www.moneycontrol.com/news/x.html",
    "http://moneycontrol.com/news/x.html",
])
def test_article_url_on_the_domain_or_a_subdomain_is_kept(url):
    assert parse_gkg_line(_line_with_url("moneycontrol.com", url)) is not None


def test_ingest_window_counts_off_domain_urls_as_a_skip():
    now = datetime(2026, 10, 23, 7, 7, tzinfo=UTC)
    good = _line_with_url("moneycontrol.com", "https://www.moneycontrol.com/news/a.html")
    bad = _line_with_url("moneycontrol.com", "https://evil.example.com/news/b.html")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("x.gkg.csv", good + "\n" + bad + "\n")

    def handle(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=buffer.getvalue())

    async def run():
        async with _mock_client(handle) as client:
            return await ingest_window(client, now, 1, retry_sleep=0)

    articles, stats = asyncio.run(run())
    assert [a.url for a in articles] == ["https://www.moneycontrol.com/news/a.html"]
    assert stats.skipped_bad_url == 4  # 1 bad row in each of the 4 identical files


def test_gdelt_files_are_fetched_over_https():
    seen: list[str] = []

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.scheme)
        return httpx.Response(404)

    async def run():
        async with _mock_client(handle) as client:
            return await fetch_file(client, "20261023060000", tries=1, retry_sleep=0)

    asyncio.run(run())
    assert seen == ["https"]

def test_oversized_gdelt_file_aborts_and_counts_failed(monkeypatch):
    import app.services.news.ingest as ingest

    monkeypatch.setattr(ingest, "MAX_GKG_FILE_BYTES", 1000)
    now = datetime(2026, 10, 23, 7, 7, tzinfo=UTC)
    calls = []

    def handle(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(200, content=b"x" * 5000)

    async def run():
        async with _mock_client(handle) as client:
            return await ingest_window(client, now, 1, retry_sleep=0)

    articles, stats = asyncio.run(run())
    assert articles == []
    assert stats.files_failed == 4 and stats.files_ok == 0
    assert len(calls) == 4  # an oversize body is not retried