"""Logic tests for scripts/measure_export_staging.py (no server, no browser, no clock): the stage-change recorder and the
phase arithmetic. The script itself is read-only apart from the exports it asks for."""
import importlib.util
import sys
from pathlib import Path

_PATH = Path(__file__).resolve().parents[2] / "scripts" / "measure_export_staging.py"
_spec = importlib.util.spec_from_file_location("measure_export_staging", _PATH)
mod = importlib.util.module_from_spec(_spec)
sys.modules["measure_export_staging"] = mod
_spec.loader.exec_module(mod)


class FakeHttp:
    def __init__(self, jobs, post=(200, {"job_id": "a" * 32, "status": "preparing"})):
        self.jobs, self.post, self.posts = list(jobs), post, 0

    def post_report(self, options):
        self.posts += 1
        return self.post

    def get_job(self, job_id):
        job = self.jobs.pop(0) if len(self.jobs) > 1 else self.jobs[0]
        return 200, job

    def get_file(self, job_id):
        return 200, 1234


class Ticker:
    """A clock that moves 0.5 s every time it is read, and a sleep that does nothing."""

    def __init__(self):
        self.t = 0.0

    def clock(self):
        self.t += 0.25
        return self.t

    def sleep(self, _):
        pass


def test_all_24_sections_are_listed_and_unique():
    assert len(mod.ALL_SECTIONS) == 24 and len(set(mod.ALL_SECTIONS)) == 24


def test_transition_key_labels_each_state():
    assert mod.transition_key({"status": "preparing", "stage": "building"}) == "preparing/building"
    assert mod.transition_key({"status": "ready", "stage": "finishing"}) == "ready"


def test_phase_times_are_the_gaps_between_first_sightings():
    t = [("preparing/collecting", 3000), ("preparing/building", 5000), ("preparing/finishing", 25000), ("ready", 31000)]
    out = mod.phase_times(t)
    assert out == {
        "queued_to_collecting_ms": 3000,
        "collecting_to_building_ms": 2000,
        "building_to_finishing_ms": 20000,
        "finishing_to_ready_ms": 6000,
    }


def test_a_phase_whose_end_was_never_seen_is_none():
    out = mod.phase_times([("preparing/collecting", 1000), ("failed", 2000)])
    assert out["collecting_to_building_ms"] is None and out["finishing_to_ready_ms"] is None


def test_run_one_records_each_stage_change_once_and_downloads_the_file():
    jobs = [{"status": "preparing", "stage": "collecting"}] * 2 + [{"status": "preparing", "stage": "building"}] * 3 + [
        {"status": "preparing", "stage": "finishing"}, {"status": "ready", "stage": "finishing", "pdf_bytes": 999}]
    ticker = Ticker()
    result = mod.run_one(FakeHttp(jobs), {"scope": "family"}, clock=ticker.clock, sleep=ticker.sleep)
    labels = [label for label, _ in result["transitions"]]
    assert labels == ["preparing/collecting", "preparing/building", "preparing/finishing", "ready"]
    assert result["ok"] is True and result["pdf_bytes"] == 999 and result["download_bytes"] == 1234


def test_a_failed_job_is_reported_not_raised():
    result = mod.run_one(FakeHttp([{"status": "failed", "stage": "building", "error_code": "print_error"}]), {},
                         clock=Ticker().clock, sleep=lambda _: None)
    assert result["ok"] is False and result["error_code"] == "print_error" and "download_ms" not in result


def test_a_refused_request_stops_with_its_code():
    http = FakeHttp([], post=(429, {"code": "export_cooldown"}))
    result = mod.run_one(http, {}, clock=Ticker().clock, sleep=lambda _: None, retries=1)
    assert result == {"ok": False, "post_status": 429, "post_code": "export_cooldown"} and http.posts == 2


def test_cases_quick_skips_the_cold_runs():
    assert [c["name"] for c in mod.cases("family", True, 130)] == ["full", "small"]
    assert [c["name"] for c in mod.cases("family", False, 130)] == ["full_cold", "full_warm", "small_warm", "small_cold"]
    assert mod.cases("family", False, 130)[0]["wait"] == 130 and mod.cases("family", False, 130)[1]["wait"] == 0
