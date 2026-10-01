"""Importing this module registers every model on Base.metadata."""

from app.models import (  # noqa: F401
    account_deletion,
    analytics,
    auth,
    consent,
    folio,
    imports,
    member_history,
    reference,
    snapshot,
    transaction,
    user,
)
