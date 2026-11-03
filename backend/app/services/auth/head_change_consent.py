"""Consent state after a Head of Family change.

A swap (or an undo) withdraws the sign-up consents: whoever signs in next has not agreed to the
Terms and Privacy Policy as the account's holder. The front-end gate (`ReconsentGate`) shows the
agreement screen, and `get_data_user` makes the server refuse data routes until it is done, so
the gate cannot be skipped by calling the API directly.

This is deliberately limited to that case. An ordinary new version of the Terms still only shows
the front-end gate (the existing behaviour); changing that would be a separate decision.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session as DbSession

from app.models.consent import ConsentRecord
from app.models.enums import ConsentAction
from app.services.legal.consent import SIGNUP_DOCUMENTS, outdated_documents

HEAD_CHANGE_SURFACES = ("head_change", "head_change_undo")
HEAD_CHANGE_REASON = "head_change"


def consent_outdated_reason(db: DbSession, user_id: uuid.UUID) -> str | None:
    """`"head_change"` while the account's most recent SIGN-UP-document consent record is a head-change
    withdrawal and the sign-up documents are still not agreed to; otherwise None. Rows for other documents
    (a PAN disclaimer written by an upload that was already past the gate when the swap committed) must not
    clear it. One indexed query on every data request; the heavier check only runs for an account in that
    state."""
    latest = (
        db.query(ConsentRecord.action, ConsentRecord.surface)
        .filter(ConsentRecord.user_id == user_id, ConsentRecord.document_type.in_(SIGNUP_DOCUMENTS))
        .order_by(ConsentRecord.recorded_at.desc(), ConsentRecord.id.desc())
        .first()
    )
    if latest is None or latest.action != ConsentAction.WITHDRAWN:
        return None
    if latest.surface not in HEAD_CHANGE_SURFACES:
        return None
    if not outdated_documents(db, user_id, SIGNUP_DOCUMENTS):
        return None
    return HEAD_CHANGE_REASON
