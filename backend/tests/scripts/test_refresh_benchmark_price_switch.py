"""Review fix L-f: the PRICE fetch of the four newer indices can be switched off without touching TRI."""

from app.models.enums import LEGACY_BENCHMARK_INDICES, BenchmarkIndex, BenchmarkReturnType
from tests.scripts.test_background_jobs import _load_job


def _run_job(db_session, monkeypatch, price_indices):
    job = _load_job("refresh_benchmark_daily")
    calls = []

    async def fake_ensure_index_history_fresh(db, index, start_date, end_date, *, return_type, fresh_within):
        calls.append((index, return_type))
        return True

    monkeypatch.setattr(job, "SessionLocal", lambda: db_session)
    monkeypatch.setattr(job, "ensure_index_history_fresh", fake_ensure_index_history_fresh)
    monkeypatch.setattr(job, "_PRICE_INDICES", price_indices)
    job.main()
    return calls


def test_default_still_fetches_price_and_tri_for_every_index(db_session, monkeypatch):
    job = _load_job("refresh_benchmark_daily")

    calls = _run_job(db_session, monkeypatch, job._PRICE_INDICES)

    assert len(calls) == 16


def test_limiting_price_to_the_legacy_four_keeps_tri_for_all_eight(db_session, monkeypatch):
    calls = _run_job(db_session, monkeypatch, LEGACY_BENCHMARK_INDICES)

    assert len(calls) == 12
    assert {index for index, kind in calls if kind is BenchmarkReturnType.TRI} == set(BenchmarkIndex)
    assert {index for index, kind in calls if kind is BenchmarkReturnType.PRICE} == set(LEGACY_BENCHMARK_INDICES)
