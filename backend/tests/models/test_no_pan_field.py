"""Guards the ADR-004 (reopened 2026-09-18) invariant: PAN is persisted only
in encrypted/hashed form, never as plaintext, and only on HouseholdMember —
never on any other mapped model.

Original guard (pre-2026-09-18) asserted no PAN-shaped column existed
anywhere. That decision was formally reopened -- see
Docs/superpowers/specs/2026-09-18-pan-cas-attribution-design.md and the
updated Docs/PRDs/ADR-Technical-Stack-Decisions.md (ADR-004). This test now
guards the *replacement* invariant instead of the original one.

Fix 7 (2026-09-18 whole-branch review): the previous version of this test
hardcoded the non-HouseholdMember models to check as (Scheme, Folio, Import)
-- a PAN-shaped column added to User, Transaction, Session, or any future
model would have passed silently. This version instead iterates every
SQLAlchemy-mapped model via Base.registry.mappers, so the guard automatically
covers any model added later without anyone remembering to update this file.
"""

import app.models  # noqa: F401  # registers every model on Base.metadata/registry
from app.db.base import Base
from app.models.user import HouseholdMember


def _all_mapped_classes():
    return [mapper.class_ for mapper in Base.registry.mappers]


def test_no_pan_shaped_column_on_non_household_member_models():
    mapped_classes = _all_mapped_classes()
    # Sanity check: fail loudly if model registration silently stops working,
    # rather than passing vacuously over an empty list.
    assert len(mapped_classes) >= 9, (
        f"Expected at least 9 mapped models, found {len(mapped_classes)} — "
        "app.models may not be registering every model module."
    )

    for model in mapped_classes:
        if model is HouseholdMember:
            continue
        for column_name in model.__table__.columns.keys():
            assert "pan" not in column_name.lower(), (
                f"{model.__name__}.{column_name} looks PAN-related — PAN must only ever "
                "live on HouseholdMember (encrypted), per ADR-004 as reopened 2026-09-18."
            )


def test_household_member_pan_columns_are_named_for_encrypted_or_hashed_storage_only():
    pan_columns = [c for c in HouseholdMember.__table__.columns.keys() if "pan" in c.lower()]
    # pan_pending_until (2026-09-24) holds a timestamp, not PAN data: it marks
    # an upload-time claim that becomes permanent on Confirm Import. See
    # Docs/superpowers/specs/2026-09-24-pan-at-upload-attribution-design.md.
    assert set(pan_columns) == {"pan_encrypted", "pan_lookup_hash", "pan_pending_until"}, (
        "HouseholdMember must expose exactly pan_encrypted, pan_lookup_hash and "
        "pan_pending_until for PAN — a column named just 'pan' (or anything else "
        "PAN-shaped) would suggest plaintext storage, which ADR-004 (as reopened) "
        "still forbids."
    )
