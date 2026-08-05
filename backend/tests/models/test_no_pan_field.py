"""Guards the CLAUDE.md/ADR-004 non-negotiable: no PAN persistence, ever.

Confirms the Phase 1 Import Service port did not reintroduce the prototype's
pan_masked columns (CAS Parsers/mf-import/backend/app/models.py:56,66) onto
any of the models the Import Service writes to."""

from app.models.folio import Folio
from app.models.imports import Import
from app.models.reference import Scheme


def test_no_pan_shaped_column_on_import_related_models():
    for model in (Scheme, Folio, Import):
        for column_name in model.__table__.columns.keys():
            assert "pan" not in column_name.lower(), (
                f"{model.__name__}.{column_name} looks PAN-related — "
                "PAN must never be persisted (CLAUDE.md non-negotiable, ADR-004)."
            )
