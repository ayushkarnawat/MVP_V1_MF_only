"""Importing this module registers every model on Base.metadata."""

from app.models import (  # noqa: F401
    account_deletion,
    analytics,
    auth,
    folio,
    imports,
    reference,
    snapshot,
    transaction,
    user,
)
