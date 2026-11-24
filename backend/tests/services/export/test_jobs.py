import multiprocessing
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest

from app.config import settings
from app.services.export import jobs

USER = UUID(int=101)


@pytest.fixture(autouse=True)
def directory(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "export_job_dir", str(tmp_path / "jobs"))
    monkeypatch.setattr(settings, "export_lock_dir", str(tmp_path / "locks"))
    return tmp_path / "jobs"


def test_create_and_read_round_trip():
    job_id = jobs.create_job(USER, "family", 2)
    job = jobs.read_job(job_id)
    assert len(job_id) == 32 and job["status"] == "preparing"
    assert jobs.job_belongs_to(job, USER)
    assert set(job) == {"job_id", "user_hash", "status", "stage", "sections_total", "scope_kind",
                        "created_at", "updated_at", "error_code", "pdf_bytes", "cancel"}


@pytest.mark.parametrize("job_id", ["../x", "/tmp/x", "C:\\x", "a" * 31, "A" * 32, "a" * 33])
def test_job_id_with_a_path_is_rejected(job_id, directory):
    for call in (jobs.read_job, jobs.request_cancel, jobs.open_pdf_once):
        with pytest.raises(ValueError):
            call(job_id)
    assert not directory.exists()


def _child_update(directory, locks, job_id, connection):
    settings.export_job_dir, settings.export_lock_dir = directory, locks
    connection.send(jobs.read_job(job_id)["stage"])
    jobs.update_job(job_id, stage="finishing")
    connection.close()


def test_update_is_atomic_and_visible_to_a_second_process():
    job_id = jobs.create_job(USER, "member", 1)
    jobs.update_job(job_id, stage="building")
    ctx = multiprocessing.get_context("spawn")
    parent, child = ctx.Pipe()
    process = ctx.Process(target=_child_update, args=(settings.export_job_dir, settings.export_lock_dir, job_id, child))
    process.start()
    child.close()
    try:
        assert parent.poll(10)
        assert parent.recv() == "building"
        process.join(10)
        assert process.exitcode == 0
        assert jobs.read_job(job_id)["stage"] == "finishing"
    finally:
        if process.is_alive():
            process.kill()
        process.join(10)
        parent.close()


def test_open_pdf_once_returns_the_bytes_once():
    job_id = jobs.create_job(USER, "family", 1)
    jobs.store_pdf(job_id, b"%PDF invented")
    with ThreadPoolExecutor(2) as executor:
        results = list(executor.map(lambda _: jobs.open_pdf_once(job_id), range(2)))
    assert results.count(b"%PDF invented") == 1 and results.count(None) == 1
    assert jobs.open_pdf_once(job_id) is None


def test_sweep_deletes_files_older_than_ten_minutes_and_fails_stuck_jobs(directory):
    old = jobs.create_job(USER, "family", 1)
    stuck = jobs.create_job(UUID(int=102), "family", 1)
    jobs.store_pdf(old, b"%PDF invented")
    jobs.update_job(old, status="ready")
    before = datetime.now(timezone.utc) - timedelta(seconds=601)
    jobs.update_job(stuck, created_at=before.isoformat())
    for path in directory.iterdir():
        if path.name.startswith(old):
            stamp = int(before.timestamp())
            os.utime(path, (stamp, stamp))
    jobs.sweep(datetime.now(timezone.utc))
    assert jobs.read_job(old) is None and jobs.open_pdf_once(old) is None
    assert jobs.read_job(stuck)["status"] == "failed"
    assert jobs.read_job(stuck)["error_code"] == "timeout"


def test_active_job_for_user_finds_only_that_users_preparing_job():
    first = jobs.create_job(USER, "family", 1)
    other = jobs.create_job(UUID(int=102), "family", 1)
    assert jobs.active_job_for_user(USER) == first
    jobs.update_job(first, status="ready")
    assert jobs.active_job_for_user(USER) is None
    assert jobs.active_job_for_user(UUID(int=102)) == other


def test_directory_is_private_and_holds_no_user_id_or_name(directory):
    job_id = jobs.create_job(USER, "family", 1)
    assert str(USER) not in (directory / (job_id + ".json")).read_text()
    assert all(str(USER) not in path.name for path in directory.iterdir())
    if os.name != "nt":
        assert directory.stat().st_mode & 0o777 == 0o700


@pytest.mark.skipif(os.name == "nt", reason="POSIX directory permissions")
def test_existing_job_directory_is_made_private(directory):
    directory.mkdir(mode=0o755, parents=True)
    os.chmod(directory, 0o755)
    jobs.create_job(USER, "family", 1)
    assert directory.stat().st_mode & 0o777 == 0o700
