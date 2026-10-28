from __future__ import annotations

import importlib
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock


def test_measure_script_imports_without_side_effects(capsys):
    module = importlib.import_module("scripts.measure_fund_page_staging")
    assert callable(module.main)
    assert capsys.readouterr().out == ""


def test_budget_verdict_uses_strict_limits_and_reports_only_counts_and_ms():
    from scripts.measure_fund_page_staging import budget_verdict

    passed, line = budget_verdict("tier2", [12.4, 49.9], 50)
    assert passed is True
    assert line == "PASS tier2 count=2 max_ms=49.9 limit_ms=50.0"

    passed, line = budget_verdict("tier2", [12.4, 50.0], 50)
    assert passed is False
    assert line.startswith("FAIL tier2 count=2 max_ms=50.0")


def test_main_exits_nonzero_with_clear_message_when_read_only_guard_fires(
    monkeypatch, capsys,
):
    from scripts import measure_fund_page_staging as script

    def attempted_commit():
        raise script.WriteAttempted("session commit attempted")

    monkeypatch.setattr(script, "_main", attempted_commit)

    assert script.main() == 2
    assert "FAIL read-only guard: session commit attempted" in capsys.readouterr().err


def test_scheme_filtered_mode_uses_stored_only_filtered_holdings(monkeypatch, capsys):
    from scripts import measure_fund_page_staging as script

    calls = []

    async def filtered_holdings(_db, member_ids, **kwargs):
        calls.append((member_ids, kwargs))
        return [object()]

    monkeypatch.setattr(script, "compute_holdings", filtered_holdings)
    monkeypatch.setattr(script, "invalidate_holdings_cache", lambda _member_id: None)
    monkeypatch.setattr(script, "period_series", AsyncMock(return_value=object()))
    monkeypatch.setattr(script, "inception_returns", lambda *_args: object())
    monkeypatch.setattr(script, "compute_risk", lambda *_args: object())
    monkeypatch.setattr(script, "build_composition", lambda *_args: object())
    monkeypatch.setattr(script, "all_holdings", lambda *_args: object())
    monkeypatch.setattr(script, "build_manager", lambda *_args: object())
    scheme = SimpleNamespace(id=uuid.uuid4())
    args = SimpleNamespace(runs=2, include_score=False, user_id=uuid.uuid4())
    member_ids = [uuid.uuid4()]

    assert script._run_scheme_filtered(object(), args, member_ids, [scheme]) == 0
    assert len(calls) == 3
    assert all(call[1] == {
        "scheme_ids": frozenset({scheme.id}),
        "allow_stale_today": True,
        "stored_only": True,
    } for call in calls)
    output = capsys.readouterr().out
    assert str(scheme.id) not in output
    assert "PASS scheme_filtered funds=1" in output
