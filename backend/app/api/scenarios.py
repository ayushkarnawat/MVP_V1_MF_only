# backend/app/api/scenarios.py
import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException

from sqlalchemy.orm import Session as DbSession
from app.db.session import get_db
from app.services.auth.session import get_active_user
from app.config import settings
from app.models.reference import Scenario
from app.models.user import User
from app.services.analytics.scenario_engine import (
    _async_get_scenario_result_for_household,
    get_scenario_summary,
)
from app.services.analytics.schemas import ScenarioResultRow, ScenarioSummaryRow
from app.services.dashboard.household_members import list_household_members

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


@router.get("", response_model=list[ScenarioSummaryRow])
async def list_scenarios(
    curated: bool = False,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    return await asyncio.to_thread(_list_scenarios, db, curated, settings.scenario_hypotheticals_enabled)


def _list_scenarios(db: DbSession, curated: bool, hypotheticals_enabled: bool) -> list[ScenarioSummaryRow]:
    query = db.query(Scenario).filter(Scenario.parent_scenario_id.is_(None))
    # Release gate (decisions.md 2026-10-08): hypothetical % values stay hidden until a
    # markets-literate review; flip SCENARIO_HYPOTHETICALS_ENABLED only after it.
    if not hypotheticals_enabled:
        query = query.filter(Scenario.scenario_type != "HYPOTHETICAL")
    if curated:
        query = query.filter(Scenario.display_rank.isnot(None)).order_by(Scenario.display_rank)
    else:
        query = query.order_by(Scenario.name)
    scenarios = query.all()
    parent_ids = {parent_id for (parent_id,) in db.query(Scenario.parent_scenario_id).filter(
        Scenario.parent_scenario_id.in_([s.id for s in scenarios])
    ).distinct().all()}
    return [get_scenario_summary(db, s, has_phases=s.id in parent_ids) for s in scenarios]


@router.get("/{scenario_id}/results", response_model=ScenarioResultRow)
async def get_scenario_results(
    scenario_id: uuid.UUID,
    user: User = Depends(get_active_user),
    db: DbSession = Depends(get_db),
):
    scenario = db.get(Scenario, scenario_id)
    hidden = scenario is not None and scenario.scenario_type == "HYPOTHETICAL" and not settings.scenario_hypotheticals_enabled
    if scenario is None or hidden:
        raise HTTPException(status_code=404, detail="Scenario not found.")
    members = list_household_members(db, user.id)
    return await _async_get_scenario_result_for_household(db, scenario, [m.id for m in members])
