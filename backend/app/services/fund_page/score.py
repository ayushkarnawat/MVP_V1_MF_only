from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.models.reference import Scheme
from app.services.analytics.schemas import FundScoreRow
from app.services.analytics.scorer import compute_fund_score
from app.services.fund_page.schemas import ScoreResponse
from app.services.fund_page.scope import ScopeContext
from app.services.fund_page.sections import stored_section


async def build_score(
    db: Session,
    scheme: Scheme,
    ctx: ScopeContext,
    user_id: uuid.UUID,
    today: date,
    now: datetime,
) -> ScoreResponse:
    del today
    stored = stored_section(db, user_id, ctx.scope_key, "score", ctx.member_ids)
    if stored is not None:
        match = next(
            (
                row for row in stored.payload.get("funds", [])
                if row.get("scheme_id") == str(scheme.id)
            ),
            None,
        )
        if match is not None:
            row = FundScoreRow.model_validate(match)
            computed_at = stored.computed_at
            if computed_at.tzinfo is None:
                computed_at = computed_at.replace(tzinfo=timezone.utc)
            return ScoreResponse(
                **row.model_dump(), source="stored", computed_at=computed_at,
            )
    row = await compute_fund_score(db, scheme)
    return ScoreResponse(**row.model_dump(), source="computed", computed_at=now)
