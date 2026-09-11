"""Orchestration layer for Docs/superpowers/specs/2026-09-02-analytics-precompute-architecture-design.md.
Computes all 7 Analytics sections for all 5 scopes (household-combined + up
to 4 members) and upserts each into analytics_sections. Reuses every
section's existing compute_*(db, member_ids) function completely unchanged
-- this module is pure orchestration, never a rewrite of section logic.

Scope order is combined-first, then each member, deliberately (see this
plan's "implementation-level refinements to the literal spec text" note):
category_ranking.py/scorer.py's own process-local, TTL'd caches
(_category_returns_cache, _category_score_cache) are populated by the
combined pass and naturally serve every subsequent per-member scope's
repeat categories as free cache hits, so warm_nav_history is still invoked
at most once per distinct category/scheme across the whole run -- without
this module needing its own separate union-then-warm step.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable

from pydantic import BaseModel
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.db.session import commit_off_loop
from app.models.analytics import AnalyticsRecomputeStatus, AnalyticsSection
from app.services.analytics.allocation import compute_category_allocation
from app.services.analytics.benchmark import compute_fund_vs_benchmark, compute_portfolio_vs_benchmarks
from app.services.analytics.category_ranking import compute_category_ranking
from app.services.analytics.schemas import (
    AggregateAnalyticsAllocationResponse,
    AggregateCategoryRankingResponse,
    AggregateDirectRegularTerResponse,
    AggregateFundVsBenchmarkResponse,
    AggregatePortfolioBenchmarkResponse,
    AggregatePortfolioScoreResponse,
    AggregateWeightedTerResponse,
)
from app.services.analytics.scorer import compute_portfolio_score
from app.services.analytics.ter import compute_direct_regular_ter_comparison, compute_weighted_ter
from app.services.dashboard.aggregate import get_member_statuses
from app.services.dashboard.household_members import list_household_members
from app.services.dashboard.schemas import MemberStatus

logger = logging.getLogger(__name__)

_STALE_RECOMPUTE_CEILING = timedelta(hours=2)


@dataclass  # not frozen: tests patch .compute per-instance via unittest.mock.patch.object
class _SectionSpec:
    name: str
    compute: Callable[[Session, list[uuid.UUID]], Awaitable[BaseModel]]
    wrap_combined: Callable[[list[MemberStatus], BaseModel], BaseModel]


_SECTIONS: list[_SectionSpec] = [
    _SectionSpec("allocation", compute_category_allocation, lambda statuses, result: AggregateAnalyticsAllocationResponse(members=statuses, allocation=result)),
    _SectionSpec("ter", compute_weighted_ter, lambda statuses, result: AggregateWeightedTerResponse(members=statuses, ter=result)),
    _SectionSpec("ter_direct_regular", compute_direct_regular_ter_comparison, lambda statuses, result: AggregateDirectRegularTerResponse(members=statuses, ter=result)),
    _SectionSpec("benchmark", compute_portfolio_vs_benchmarks, lambda statuses, result: AggregatePortfolioBenchmarkResponse(members=statuses, benchmark=result)),
    _SectionSpec("benchmark_funds", compute_fund_vs_benchmark, lambda statuses, result: AggregateFundVsBenchmarkResponse(members=statuses, comparison=result)),
    _SectionSpec("category_ranking", compute_category_ranking, lambda statuses, result: AggregateCategoryRankingResponse(members=statuses, ranking=result)),
    _SectionSpec("score", compute_portfolio_score, lambda statuses, result: AggregatePortfolioScoreResponse(members=statuses, score=result)),
]


def should_dispatch_recompute(db: Session, user_id: uuid.UUID) -> bool:
    """True if no recompute is currently in flight for this household, or
    the recorded one is old enough to be a crashed/killed run rather than
    one still working -- recompute_household_analytics's own try/finally
    clears started_at on every normal exit, so a flag this old means the
    process that set it is gone."""
    status = db.get(AnalyticsRecomputeStatus, user_id)
    if status is None or status.started_at is None:
        return True
    started_at = status.started_at
    if started_at.tzinfo is None:
        # SQLite's DateTime(timezone=True) doesn't round-trip tzinfo -- it
        # always returns naive datetimes on read, unlike Postgres. Every
        # write path here sets started_at via datetime.now(timezone.utc),
        # so a naive read-back is always UTC.
        started_at = started_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - started_at > _STALE_RECOMPUTE_CEILING


def try_claim_recompute(db: Session, user_id: uuid.UUID) -> bool:
    """Atomically claims the in-flight recompute slot for user_id if none is
    held or the held one is stale -- the single choke point every dispatch
    decision (GET, retry, CAS-import confirm, the daily backstop) must pass
    through before starting/queuing a recompute. should_dispatch_recompute()
    alone is read-only and leaves a check-then-dispatch race open between
    concurrent callers; this closes it with one atomic upsert, same
    dialect-branching pattern as _upsert_section."""
    now = datetime.now(timezone.utc)
    cutoff = now - _STALE_RECOMPUTE_CEILING
    dialect_name = db.get_bind().dialect.name
    if dialect_name == "sqlite":
        insert_fn = sqlite_insert
    elif dialect_name == "postgresql":
        insert_fn = postgresql_insert
    else:
        raise RuntimeError(f"Unsupported database dialect for analytics_recompute_status upsert: {dialect_name}")

    statement = insert_fn(AnalyticsRecomputeStatus).values(user_id=user_id, started_at=now)
    statement = statement.on_conflict_do_update(
        index_elements=[AnalyticsRecomputeStatus.user_id],
        set_={"started_at": now},
        where=(AnalyticsRecomputeStatus.started_at.is_(None)) | (AnalyticsRecomputeStatus.started_at < cutoff),
    )
    result = db.execute(statement)
    db.commit()
    return result.rowcount > 0


def release_recompute_claim(db: Session, user_id: uuid.UUID) -> None:
    """Clears a claim taken by try_claim_recompute() when the dispatch it
    was meant to gate never actually started (ECS unconfigured, or RunTask
    reported a placement failure) -- otherwise the claim sits held until
    the 2-hour staleness ceiling passes, blocking should_dispatch_recompute
    /try_claim_recompute recovery even though nothing is really running."""
    status = db.get(AnalyticsRecomputeStatus, user_id)
    if status is not None:
        status.started_at = None
        db.commit()


def bump_recompute_generation(db: Session, user_id: uuid.UUID) -> None:
    """Invalidates any analytics run that captured an earlier data version.

    Deliberately does not commit: transaction-mutating callers must persist
    the generation bump atomically with their own deletes.
    """
    dialect_name = db.get_bind().dialect.name
    if dialect_name == "sqlite":
        insert_fn = sqlite_insert
    elif dialect_name == "postgresql":
        insert_fn = postgresql_insert
    else:
        raise RuntimeError(f"Unsupported database dialect for analytics generation: {dialect_name}")

    statement = insert_fn(AnalyticsRecomputeStatus).values(
        user_id=user_id,
        started_at=None,
        generation=1,
    ).on_conflict_do_update(
        index_elements=[AnalyticsRecomputeStatus.user_id],
        set_={"generation": AnalyticsRecomputeStatus.generation + 1},
    )
    db.execute(statement)


def _locked_generation(db: Session, user_id: uuid.UUID) -> int | None:
    # On PostgreSQL this row lock closes the check-then-upsert window: a
    # concurrent mutation either commits its bump first (and this run stops),
    # or waits and then deletes the section this run just committed.
    return (
        db.query(AnalyticsRecomputeStatus.generation)
        .filter(AnalyticsRecomputeStatus.user_id == user_id)
        .with_for_update()
        .scalar()
    )


def _upsert_section(
    db: Session, user_id: uuid.UUID, scope_key: str, household_member_id: uuid.UUID | None,
    section_name: str, payload: BaseModel,
) -> None:
    values = {
        "user_id": user_id,
        "scope_key": scope_key,
        "section": section_name,
        "household_member_id": household_member_id,
        "payload": payload.model_dump(mode="json"),
        "computed_at": datetime.now(timezone.utc),
        "failed_at": None,
    }
    dialect_name = db.get_bind().dialect.name
    if dialect_name == "sqlite":
        insert_fn = sqlite_insert
    elif dialect_name == "postgresql":
        insert_fn = postgresql_insert
    else:
        raise RuntimeError(f"Unsupported database dialect for analytics_sections upsert: {dialect_name}")

    statement = insert_fn(AnalyticsSection).values(**values)
    statement = statement.on_conflict_do_update(
        index_elements=[AnalyticsSection.user_id, AnalyticsSection.scope_key, AnalyticsSection.section],
        set_={"payload": statement.excluded.payload, "computed_at": statement.excluded.computed_at, "failed_at": None},
    )
    db.execute(statement)


def _mark_section_failed(db: Session, user_id: uuid.UUID, scope_key: str, section_name: str) -> None:
    existing = db.get(AnalyticsSection, (user_id, scope_key, section_name))
    if existing is None:
        # No prior success to preserve -- leave no row, matching the
        # frontend's "no row yet" cold-start state rather than inventing a
        # placeholder payload for a section that has never once succeeded.
        return
    existing.failed_at = datetime.now(timezone.utc)


async def recompute_household_analytics(db: Session, user_id: uuid.UUID) -> None:
    status = db.get(AnalyticsRecomputeStatus, user_id)
    if status is None:
        status = AnalyticsRecomputeStatus(user_id=user_id, started_at=datetime.now(timezone.utc))
        db.add(status)
    else:
        status.started_at = datetime.now(timezone.utc)
    await commit_off_loop(db)
    captured_generation = status.generation

    try:
        members = list_household_members(db, user_id)
        statuses = get_member_statuses(db, user_id)
        all_member_ids = [m.id for m in members]

        scopes: list[tuple[str, uuid.UUID | None, list[uuid.UUID]]] = [("combined", None, all_member_ids)]
        scopes += [(str(m.id), m.id, [m.id]) for m in members]

        for scope_key, household_member_id, scoped_member_ids in scopes:
            for section in _SECTIONS:
                try:
                    result = await section.compute(db, scoped_member_ids)
                    payload = section.wrap_combined(statuses, result) if scope_key == "combined" else result
                except Exception:
                    logger.exception(
                        "recompute_household_analytics: section=%s failed for user=%s scope=%s",
                        section.name, user_id, scope_key,
                    )
                    if _locked_generation(db, user_id) != captured_generation:
                        return
                    _mark_section_failed(db, user_id, scope_key, section.name)
                    await commit_off_loop(db)
                    continue

                if _locked_generation(db, user_id) != captured_generation:
                    return
                _upsert_section(db, user_id, scope_key, household_member_id, section.name, payload)
                await commit_off_loop(db)
    finally:
        db.query(AnalyticsRecomputeStatus).filter_by(user_id=user_id).update(
            {AnalyticsRecomputeStatus.started_at: None},
            synchronize_session=False,
        )
        await commit_off_loop(db)
