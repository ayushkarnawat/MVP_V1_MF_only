import asyncio
import logging
from uuid import UUID

import pytest

from app.services.export import browser_pool as pool, jobs, render
from tests.services.export.test_render import rig


def run_timed_export(rig, monkeypatch, caplog, outcome="done"):
    caplog.set_level(logging.INFO, logger=render.__name__)
    monkeypatch.setattr(render, "_clock", lambda: 1000.0)
    monkeypatch.setattr(render, "_timing_clock", lambda: 1000.0)

    async def second_pdf(*args):
        if outcome == "timeout":
            raise asyncio.TimeoutError("Invented private timeout")
        if outcome == "error":
            raise RuntimeError("Invented private error")
        return None if outcome == "mismatch" else b"%PDF invented final"

    monkeypatch.setattr(render, "_contents_pdf", second_pdf)
    job_id = jobs.create_job(UUID(int=1), "family", 1)

    async def scenario():
        try:
            await render.run_export(
                job_id, UUID(int=1), render.ExportOptions(
                    scope="family", section_ids=["overview-summary"], cover=outcome != "skipped"),
                members=[{"id": "invented-member", "name": "Invented Holder"}],
                meta={"holderName": "Invented Holder", "scopeName": "Invented family", "memberCount": 1},
            )
        finally:
            await pool.close_pool()

    asyncio.run(scenario())
    lines = [record.getMessage() for record in caplog.records if record.name == render.__name__]
    return job_id, lines


def timing_line(lines):
    timing = [line for line in lines if line.startswith("export timing: ")]
    assert len(timing) == 1
    return timing[0]


def test_run_export_logs_a_timing_line_with_every_stage(rig, monkeypatch, caplog):
    _, lines = run_timed_export(rig, monkeypatch, caplog)
    assert timing_line(lines) == (
        "export timing: slot_wait_ms=0 browser_start_ms=- goto_ms=0 build_wait_ms=0 "
        "pdf1_ms=0 contents_ms=0 contents_outcome=done store_ms=0 pdf_bytes=19"
    )


@pytest.mark.parametrize("outcome", ["done", "timeout", "error", "mismatch", "skipped"])
def test_contents_outcome_is_logged_for_done_timeout_error_mismatch_and_skipped(
    rig, monkeypatch, caplog, outcome,
):
    _, lines = run_timed_export(rig, monkeypatch, caplog, outcome)
    line = timing_line(lines)
    assert f"contents_outcome={outcome}" in line.split()
    assert ("contents_ms=-" if outcome == "skipped" else "contents_ms=0") in line.split()


def test_timing_line_contains_no_names_ids_or_amounts(rig, monkeypatch, caplog):
    job_id, lines = run_timed_export(rig, monkeypatch, caplog, "error")
    line = timing_line(lines)
    for private in (str(UUID(int=1)), job_id, "invented-member", "Invented Holder", "Invented family",
                    "overview-summary", "Invented private", "amount", "folio", "email"):
        assert private not in line
    assert all(value.isdigit() or value in {"-", "error"}
               for value in (field.split("=", 1)[1] for field in line.removeprefix("export timing: ").split()))


def test_the_export_finished_line_is_unchanged(rig, monkeypatch, caplog):
    _, lines = run_timed_export(rig, monkeypatch, caplog)
    assert lines[0] == (
        "export finished: status=ready scope_kind=family sections=1 duration_ms=0 "
        "pdf_bytes=19 blocked_requests=0 two_pass=yes"
    )
    assert timing_line(lines) == lines[1]


@pytest.mark.parametrize("outcome", ["done", "timeout", "error", "mismatch", "skipped"])
def test_timing_does_not_change_the_job_status_or_the_pdf(rig, monkeypatch, caplog, outcome):
    job_id, lines = run_timed_export(rig, monkeypatch, caplog, outcome)
    assert jobs.read_job(job_id)["status"] == "ready"
    assert jobs.open_pdf_once(job_id) == (b"%PDF invented final" if outcome == "done" else b"%PDF invented")
    timing_line(lines)
