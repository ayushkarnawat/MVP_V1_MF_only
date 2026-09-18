"""Guards the ADR-004 (reopened 2026-09-18) invariant: PAN is persisted only
in encrypted/hashed form, never as plaintext, and only on HouseholdMember —
never on Scheme, Folio, or Import.

Original guard (pre-2026-09-18) asserted no PAN-shaped column existed
anywhere. That decision was formally reopened -- see
Docs/superpowers/specs/2026-09-18-pan-cas-attribution-design.md and the
updated Docs/PRDs/ADR-Technical-Stack-Decisions.md (ADR-004). This test now
guards the *replacement* invariant instead of the original one.
"""

from app.models.folio import Folio
from app.models.imports import Import
from app.models.reference import Scheme
from app.models.user import HouseholdMember


def test_no_pan_shaped_column_on_non_household_member_models():
    for model in (Scheme, Folio, Import):
        for column_name in model.__table__.columns.keys():
            assert "pan" not in column_name.lower(), (
                f"{model.__name__}.{column_name} looks PAN-related — PAN must only ever "
                "live on HouseholdMember (encrypted), per ADR-004 as reopened 2026-09-18."
            )


def test_household_member_pan_columns_are_named_for_encrypted_or_hashed_storage_only():
    pan_columns = [c for c in HouseholdMember.__table__.columns.keys() if "pan" in c.lower()]
    assert set(pan_columns) == {"pan_encrypted", "pan_lookup_hash"}, (
        "HouseholdMember must expose exactly pan_encrypted and pan_lookup_hash for PAN — "
        "a column named just 'pan' (or anything else PAN-shaped) would suggest plaintext "
        "storage, which ADR-004 (as reopened) still forbids."
    )
