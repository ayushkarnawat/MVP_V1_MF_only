"""Importing this module registers every model on Base.metadata."""

from app.models import (  # noqa: F401
    auth,
    folio,
    imports,
    reference,
    snapshot,
    transaction,
    user,
)
