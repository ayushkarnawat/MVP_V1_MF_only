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


# ---- round 2 ----

def test_select_sections_is_one_based_and_inclusive():
    assert mod.select_sections(1, 2) == mod.ALL_SECTIONS[:2]
    assert mod.select_sections(24, 24) == [mod.ALL_SECTIONS[-1]]
    assert len(mod.select_sections(1, 24)) == 24


def test_select_sections_rejects_bad_ranges():
    import pytest
    for first, last in ((0, 3), (5, 4), (1, 25)):
        with pytest.raises(ValueError):
            mod.select_sections(first, last)


def test_options_for_sets_cover_and_sections():
    options = mod.options_for("family", ["overview-sips"], False)
    assert options["cover"] is False and options["section_ids"] == ["overview-sips"] and options["scope"] == "family"


def test_settle_time_is_the_start_of_the_final_quiet_stretch():
    series = [(5, 300, 20, 1800, 2200), (10, 200, 20, 1800, 2200), (15, 10, 4, 300, 900), (20, 40, 4, 300, 900), (25, 5, 4, 300, 900), (30, 3, 4, 300, 900)]
    assert mod.settle_time(series) == 25


def test_settle_time_is_none_when_still_busy_or_unreadable():
    assert mod.settle_time([(5, 300, 1, 1, 1), (10, 280, 1, 1, 1)]) is None
    assert mod.settle_time([(5, None, 1, 1, 1)]) is None
    assert mod.settle_time([]) is None


def test_watch_idle_reports_cpu_between_samples(monkeypatch):
    usages = iter([0, 5_000_000, 5_500_000])  # microseconds of CPU: 0 at start, then 5 s, then 5.5 s
    monkeypatch.setattr(mod, "cpu_usage_usec", lambda: next(usages))
    monkeypatch.setattr(mod, "chromium_snapshot", lambda: (3, 120.0))
    monkeypatch.setattr(mod, "_read_int", lambda path: 900 * 1048576)
    now = [-2.5]

    def clock():  # every read moves 2.5 s: start 0, loop check, sample at 5, loop check, sample at 10, loop check (stop)
        now[0] += 2.5
        return now[0]

    series = mod.watch_idle(10, 5, clock=clock, sleep=lambda _: None)
    assert [row[0] for row in series] == [5, 10]
    assert series[0][1] == 100 and series[1][1] == 10  # 5 s of CPU in 5 s = 100%; 0.5 s in 5 s = 10%
    assert series[0][2:] == (3, 120, 900)
