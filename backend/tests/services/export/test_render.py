import asyncio
import base64
import json
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit
from uuid import UUID

import pytest

from app.config import settings
from app.services.export import browser_pool as pool, jobs, render
from tests.services.export.test_browser_pool import FakeSlotBackend, Clock


class FakePage:
    def __init__(self, context):
        self.context = context
        self.closed = False
        self.url = "about:blank"
        self.callback = None
        self.pdf_options = None
        self.media = None

    def is_closed(self):
        return self.closed

    def on(self, event, callback):
        self.callback = callback

    @property
    def main_frame(self):
        return self

    async def goto(self, url, **kwargs):
        self.url = url
        self.navigation_options = kwargs
        if self.context.browser.mode == "navigate":
            self.url = "https://outside.example.test/"
            self.callback(self)

    async def wait_for_function(self, expression, **kwargs):
        mode = self.context.browser.mode
        if mode == "timeout":
            raise TimeoutError()
        if mode in ("wait", "cancel"):
            await asyncio.Event().wait()
        return SimpleNamespace(json_value=self.result)

    async def result(self):
        return "error" if self.context.browser.mode == "error" else "ready"

    async def emulate_media(self, **kwargs):
        self.media = kwargs

    async def pdf(self, **kwargs):
        self.pdf_options = kwargs
        return b"x" * (40 * 1024 * 1024 + 1) if self.context.browser.mode == "large" else b"%PDF invented"

    async def close(self):
        self.closed = True


class FakeContext:
    def __init__(self, browser, options):
        self.browser, self.options, self.closed = browser, options, False
        self.page = FakePage(self)

    async def route(self, pattern, handler):
        assert pattern == "**/*"
        self.handler = handler

    async def close(self):
        self.closed = True


class FakeBrowser:
    def __init__(self):
        self.contexts = []
        self.mode = "ready"

    async def new_page(self, **options):
        context = FakeContext(self, options)
        self.contexts.append(context)
        return context.page

    async def close(self):
        pass


@pytest.fixture
def rig(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "export_job_dir", str(tmp_path / "jobs"))
    monkeypatch.setattr(settings, "export_lock_dir", str(tmp_path / "locks"))
    monkeypatch.setattr(settings, "frontend_base_url", "https://front.example.test")
    monkeypatch.setattr(settings, "export_api_origin", "https://api.example.test")
    monkeypatch.setattr(settings, "export_pass_secret", "invented-render-key-32-characters-only")
    for name in ("_factory", "_backend", "_clock"):
        monkeypatch.setattr(pool, name, getattr(pool, name))
    browser = FakeBrowser()
    async def factory():
        return browser
    pool.set_browser_factory(factory)
    pool.set_slot_backend(FakeSlotBackend(Clock()))
    return browser


def run(rig, mode="ready"):
    rig.mode = mode
    job_id = jobs.create_job(UUID(int=1), "family", 1)
    async def scenario():
        try:
            await render.run_export(job_id, UUID(int=1), render.ExportOptions(scope="family", section_ids=["overview-summary"]),
                                    members=[], meta={"holderName": None, "scopeName": None, "memberCount": 0})
        finally:
            await pool.close_pool()
    asyncio.run(scenario())
    return job_id


def test_uses_a_fresh_context_with_the_print_settings(rig):
    run(rig)
    assert rig.contexts[0].options == {"viewport": {"width": 680, "height": 1000}, "color_scheme": "light",
        "reduced_motion": "reduce", "java_script_enabled": True, "accept_downloads": False, "locale": "en-IN",
        "service_workers": "block"}


class RequestRoute:
    def __init__(self, url, headers=None):
        self.request = SimpleNamespace(url=url, headers=headers or {})
        self.aborted = False
        self.headers = None

    async def abort(self):
        self.aborted = True

    async def continue_(self, **kwargs):
        self.headers = kwargs.get("headers")

    async def fetch(self, **kwargs):
        self.headers = kwargs["headers"]
        self.fetch_options = kwargs
        return SimpleNamespace(status=getattr(self, "status", 200))

    async def fulfill(self, **kwargs):
        self.fulfilled = True


def test_adds_the_proof_header_only_to_api_origin_requests(rig):
    run(rig)
    async def scenario():
        for url, expected in (("https://api.example.test/read", True), ("https://front.example.test/font", False), ("data:text/plain,x", False)):
            route = RequestRoute(url, {"x-export-proof": "untrusted"})
            await rig.contexts[0].handler(route)
            assert ("x-export-proof" in route.headers) is expected
            if expected:
                assert route.headers["x-export-proof"] != "untrusted"
    asyncio.run(scenario())


def test_aborts_requests_to_other_origins_and_counts_them():
    async def scenario():
        route = RequestRoute("https://outside.example.test/")
        handler, counter = render.network_guard("https://front.example.test", "https://api.example.test", "invented-proof")
        await handler(route)
        assert route.aborted and counter[0] == 1
    asyncio.run(scenario())


def test_redirects_cannot_forward_the_proof_to_another_origin():
    async def scenario():
        handler, blocked = render.network_guard("https://front.example.test", "https://api.example.test", "invented-proof")
        route = RequestRoute("https://api.example.test/read")
        route.status = 302
        await handler(route)
        assert route.fetch_options["max_redirects"] == 0
        assert route.aborted and blocked[0] == 1
    asyncio.run(scenario())


def test_network_errors_are_aborted_without_logging_credentials(caplog):
    async def scenario():
        handler, blocked = render.network_guard("https://front.example.test", "https://api.example.test", "invented-sensitive-proof")
        route = RequestRoute("https://api.example.test/read")
        async def fail(**kwargs):
            raise RuntimeError("invented-sensitive-proof")
        route.fetch = fail
        await handler(route)
        assert route.aborted and blocked[0] == 1
        assert "invented-sensitive-proof" not in caplog.text
    asyncio.run(scenario())


@pytest.mark.parametrize("cancel_task", [False, True])
def test_cancel_during_wait_closes_page_and_context(rig, cancel_task):
    rig.mode = "wait"
    job_id = jobs.create_job(UUID(int=1), "family", 1)
    async def scenario():
        task = asyncio.create_task(render.run_export(job_id, UUID(int=1), render.ExportOptions(scope="family", section_ids=["overview-summary"]), [], {}))
        try:
            for _ in range(100):
                if jobs.read_job(job_id)["stage"] == "building":
                    break
                await asyncio.sleep(0)
            assert jobs.read_job(job_id)["stage"] == "building"
            if cancel_task:
                task.cancel()
                with pytest.raises(asyncio.CancelledError):
                    await task
            else:
                jobs.request_cancel(job_id)
                await asyncio.wait_for(task, 2)
            assert jobs.read_job(job_id)["status"] == "cancelled"
            assert rig.contexts[0].closed and rig.contexts[0].page.closed
        finally:
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            await pool.close_pool()
    asyncio.run(scenario())


@pytest.mark.parametrize("scope", ["family", str(UUID(int=11))])
@pytest.mark.parametrize("holder", [True, False])
def test_build_print_meta_contains_only_scoped_names_and_no_personal_identifiers(db_session, scope, holder):
    from datetime import datetime, timezone
    from app.models.enums import Relationship
    from app.models.user import HouseholdMember, User
    now = datetime.now(timezone.utc)
    user = User(id=UUID(int=1), phone_number="+919900000401", email="invented@example.test", created_at=now)
    db_session.add(user)
    db_session.commit()
    rows = [HouseholdMember(id=UUID(int=11), user_id=user.id, name="Invented holder", relationship=Relationship.SELF if holder else None, created_at=now),
            HouseholdMember(id=UUID(int=12), user_id=user.id, name="Invented member", created_at=now)]
    db_session.add_all(rows)
    db_session.commit()
    members, meta = render.build_print_meta(db_session, user, scope)
    assert len(members) == meta["memberCount"] == (2 if scope == "family" else 1)
    assert meta["holderName"] == ("Invented holder" if holder else None)
    # never empty: a family report without a known holder says "Your family" (the cover's rule for a missing name)
    assert meta["scopeName"] == ((meta["holderName"] or "Your family") if scope == "family" else "Invented holder")
    assert all(set(member) == {"id", "name"} for member in members)
    text = json.dumps({"members": members, "meta": meta}).lower()
    assert "pan" not in text and "phone" not in text and "email" not in text and str(user.id) not in text


@pytest.mark.parametrize(("mode", "code"), [("navigate", "print_error"), ("error", "print_error"), ("timeout", "timeout"), ("large", "too_large")])
def test_render_refusals(rig, mode, code):
    job_id = run(rig, mode)
    assert jobs.read_job(job_id)["error_code"] == code
    assert jobs.open_pdf_once(job_id) is None


def test_timeout_wait_limit_uses_a_fake_clock(rig, monkeypatch):
    ticks = iter([0, 0, 91, 91])
    monkeypatch.setattr(render, "_clock", lambda: next(ticks))
    job_id = run(rig, "wait")
    assert jobs.read_job(job_id)["status"] == "failed"
    assert jobs.read_job(job_id)["error_code"] == "timeout"


def test_waits_for_ready_and_prints_a4_with_backgrounds(rig):
    job_id = run(rig)
    page = rig.contexts[0].page
    assert jobs.read_job(job_id)["status"] == "ready"
    assert page.media == {"media": "print"}
    assert page.pdf_options == {"format": "A4", "print_background": True, "prefer_css_page_size": True}


def test_cancel_flag_closes_everything_and_marks_cancelled(rig):
    job_id = jobs.create_job(UUID(int=1), "family", 1)
    jobs.request_cancel(job_id)
    async def scenario():
        try:
            await render.run_export(job_id, UUID(int=1), render.ExportOptions(scope="family", section_ids=["overview-summary"]), [], {})
        finally:
            await pool.close_pool()
    asyncio.run(scenario())
    assert jobs.read_job(job_id)["status"] == "cancelled"
    assert all(context.closed and context.page.closed for context in rig.contexts)


def test_busy_pool_marks_the_job_busy(rig):
    class Busy:
        async def __aenter__(self):
            raise pool.ExportBusyError("slots_full")
        async def __aexit__(self, *args):
            pass
    from unittest.mock import patch
    with patch.object(render, "acquire_browser", return_value=Busy()):
        job_id = run(rig)
    assert jobs.read_job(job_id)["error_code"] == "busy"


@pytest.mark.parametrize("mode", ["ready", "error", "timeout", "navigate", "large"])
def test_context_and_page_are_closed_on_success_failure_and_cancel(rig, mode):
    run(rig, mode)
    assert all(context.closed and context.page.closed for context in rig.contexts)


def test_the_pass_and_proof_never_appear_in_logs_or_in_the_job_file(rig, caplog):
    import logging
    caplog.set_level(logging.INFO)
    job_id = run(rig)
    token = parse_qs(urlsplit(rig.contexts[0].page.url).fragment)["pass"][0]
    from app.services.export.pass_token import check_proof, verify_export_pass
    from datetime import datetime, timezone
    check = verify_export_pass(token, datetime.now(timezone.utc))
    from app.services.export.pass_token import _proof
    proof = _proof(check.jti, check.job)
    text = caplog.text + json.dumps(jobs.read_job(job_id))
    assert token not in text and proof not in text and str(UUID(int=1)) not in text


def test_the_url_fragment_carries_the_pass_and_the_options_not_the_query(rig):
    run(rig)
    url = urlsplit(rig.contexts[0].page.url)
    assert not url.query and url.path == "/print/report"
    fragment = parse_qs(url.fragment)
    encoded = fragment["opts"][0]
    options = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
    assert set(options) == {"scope", "sectionIds", "cover", "dataDates", "showFolios", "jobId", "members", "meta"}
    assert options["sectionIds"] == ["overview-summary"]


def test_the_log_line_has_only_counts_and_durations(rig, caplog):
    import logging
    caplog.set_level(logging.INFO)
    run(rig)
    lines = [record.getMessage() for record in caplog.records if record.name == render.__name__]
    assert len(lines) == 1
    assert lines[0].startswith("export finished: status=ready scope_kind=family sections=1 duration_ms=")
    assert "pdf_bytes=" in lines[0] and "blocked_requests=" in lines[0]


@pytest.fixture
def two_pass(rig, monkeypatch):
    from tests.services.export.test_pdf_pages import make_pdf
    rig.first = make_pdf(["Invented cover", "[[sec:overview-summary]]", "[[sec:holdings-all-stocks]] [[sec:notes]]"])
    rig.second = make_pdf(["Final invented cover", "Final invented overview", "Final invented holdings"])
    rig.evaluations = []
    rig.prints = []
    rig.hook_exists = True
    rig.failure = None
    rig.cancel_at = None
    original = rig.new_page

    async def new_page(**options):
        page = await original(**options)

        async def pdf(**settings):
            rig.prints.append(settings)
            if len(rig.prints) == 1:
                if rig.cancel_at == "first":
                    jobs.request_cancel(jobs.active_job_for_user(UUID(int=1)))
                return rig.first
            if rig.failure == "pdf":
                raise RuntimeError("invented private second-print failure")
            if rig.failure == "pdf_timeout":
                await asyncio.Event().wait()
            return rig.second

        async def evaluate(expression, arg=None):
            rig.evaluations.append((expression, arg))
            if arg is None:
                return rig.hook_exists
            if rig.failure == "evaluate":
                raise RuntimeError("invented private hook failure [[sec:overview-summary]]")
            if rig.failure == "timeout":
                await asyncio.Event().wait()
            if rig.cancel_at == "hook":
                jobs.request_cancel(jobs.active_job_for_user(UUID(int=1)))
            return None

        page.pdf = pdf
        page.evaluate = evaluate
        return page

    monkeypatch.setattr(rig, "new_page", new_page)
    return rig


def run_two_pass(browser, cover=True):
    job_id = jobs.create_job(UUID(int=1), "family", 2)
    async def scenario():
        try:
            await render.run_export(job_id, UUID(int=1), render.ExportOptions(
                scope="family", section_ids=["overview-summary", "holdings-all-stocks"], cover=cover),
                members=[], meta={"holderName": None, "scopeName": "Your family", "memberCount": 0})
        finally:
            await pool.close_pool()
    asyncio.run(scenario())
    return job_id


def test_second_pass_fills_the_contents_and_keeps_the_second_pdf_when_the_page_count_matches(two_pass):
    job_id = run_two_pass(two_pass)
    assert jobs.read_job(job_id)["status"] == "ready"
    assert jobs.open_pdf_once(job_id) == two_pass.second
    calls = [(expression, arg) for expression, arg in two_pass.evaluations if arg is not None]
    assert len(calls) == 1 and "__unifolioSetPrintPages" in calls[0][0]
    assert calls[0][1] == {"overview-summary": 2, "holdings-all-stocks": 3, "notes": 3}
    assert two_pass.evaluations[0] == ("typeof window.__unifolioSetPrintPages === 'function'", None)
    expected = {"format": "A4", "print_background": True, "prefer_css_page_size": True}
    assert two_pass.prints == [expected, expected]


def test_second_pass_is_skipped_without_the_cover(two_pass):
    job_id = run_two_pass(two_pass, cover=False)
    assert jobs.open_pdf_once(job_id) == two_pass.first
    assert len(two_pass.prints) == 1 and two_pass.evaluations == []


@pytest.mark.parametrize("missing", ["holdings-all-stocks", "notes"])
def test_second_pass_is_skipped_and_first_pdf_kept_when_a_marker_is_missing(two_pass, missing):
    from tests.services.export.test_pdf_pages import make_pdf
    markers = ["overview-summary", "holdings-all-stocks", "notes"]
    two_pass.first = make_pdf([" ".join("[[sec:" + marker + "]]" for marker in markers if marker != missing)])
    job_id = run_two_pass(two_pass)
    assert jobs.read_job(job_id)["status"] == "ready"
    assert jobs.open_pdf_once(job_id) == two_pass.first
    assert len(two_pass.prints) == 1 and two_pass.evaluations == []


@pytest.mark.parametrize("failure", ["evaluate", "timeout", "pdf", "pdf_timeout", "parse"])
def test_second_pass_failure_keeps_the_first_pdf_and_the_job_still_succeeds(two_pass, monkeypatch, failure):
    monkeypatch.setattr(render, "SECOND_PASS_TIMEOUT_SECONDS", 0.01)
    two_pass.failure = failure
    if failure == "parse":
        two_pass.second = b"invented unreadable second PDF"
    job_id = run_two_pass(two_pass)
    assert jobs.read_job(job_id)["status"] == "ready"
    assert jobs.open_pdf_once(job_id) == two_pass.first
    assert two_pass.contexts[0].closed and two_pass.contexts[0].page.closed


def test_second_pass_keeps_the_first_pdf_when_the_page_count_changes(two_pass):
    from tests.services.export.test_pdf_pages import make_pdf
    two_pass.second = make_pdf(["Different contents pagination", "Invented overview", "Invented holdings", "Extra page"])
    job_id = run_two_pass(two_pass)
    assert jobs.read_job(job_id)["status"] == "ready"
    assert jobs.open_pdf_once(job_id) == two_pass.first
    assert len(two_pass.prints) == 2


def test_missing_hook_keeps_the_first_pdf(two_pass):
    two_pass.hook_exists = False
    job_id = run_two_pass(two_pass)
    assert jobs.open_pdf_once(job_id) == two_pass.first
    assert len(two_pass.prints) == len(two_pass.evaluations) == 1


@pytest.mark.parametrize("hook_exists", [True, False])
def test_log_line_reports_two_pass_and_nothing_else_new(two_pass, caplog, hook_exists):
    import logging
    caplog.set_level(logging.INFO)
    two_pass.hook_exists = hook_exists
    run_two_pass(two_pass)
    lines = [record.getMessage() for record in caplog.records if record.name == render.__name__]
    assert len(lines) == 1
    fields = dict(item.split("=", 1) for item in lines[0].removeprefix("export finished: ").split())
    assert set(fields) == {"status", "scope_kind", "sections", "duration_ms", "pdf_bytes", "blocked_requests", "two_pass"}
    assert fields["two_pass"] == ("yes" if hook_exists else "no")


def test_no_text_or_page_numbers_in_logs_or_the_job_file(two_pass, caplog):
    import logging
    caplog.set_level(logging.INFO)
    job_id = run_two_pass(two_pass)
    document = jobs.read_job(job_id)
    text = caplog.text + json.dumps(document)
    for private in ("Invented cover", "overview-summary", "holdings-all-stocks", "[[sec:", "pages=", "section_pages"):
        assert private not in text
    assert not {"pages", "markers", "text"}.intersection(document)
    fragment = parse_qs(urlsplit(two_pass.contexts[0].page.url).fragment)
    encoded = fragment["opts"][0]
    assert "pages" not in json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))


@pytest.mark.parametrize("cancel_at", ["first", "hook"])
def test_cancel_flag_is_honoured_between_the_two_prints(two_pass, cancel_at):
    two_pass.cancel_at = cancel_at
    job_id = run_two_pass(two_pass)
    assert jobs.read_job(job_id)["status"] == "cancelled"
    assert jobs.open_pdf_once(job_id) is None and len(two_pass.prints) == 1
    assert two_pass.contexts[0].closed and two_pass.contexts[0].page.closed


def test_size_limit_applies_to_the_pdf_that_is_kept(two_pass, monkeypatch):
    from tests.services.export.test_pdf_pages import make_pdf
    two_pass.second = make_pdf(["a", "b", "c"])
    assert len(two_pass.second) < len(two_pass.first)
    monkeypatch.setattr(render, "MAX_PDF_BYTES", len(two_pass.second))
    job_id = run_two_pass(two_pass)
    assert jobs.read_job(job_id)["status"] == "ready"
    assert jobs.read_job(job_id)["pdf_bytes"] == len(two_pass.second)
    assert jobs.open_pdf_once(job_id) == two_pass.second
