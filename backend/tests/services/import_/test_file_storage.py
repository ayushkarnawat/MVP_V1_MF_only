import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.enums import ImportStatus, Relationship
from app.models.imports import Import
from app.models.user import User, HouseholdMember
from app.services.import_.file_storage import (
    CAS_FILE_RETENTION_DAYS,
    LocalFileStorage,
    expire_stored_files,
    storage_key_for_import,
    store_cas_file,
)


@pytest.fixture
def storage(tmp_path):
    return LocalFileStorage(base_dir=str(tmp_path))


def test_storage_key_is_scoped_by_user_and_import():
    user_id = uuid.uuid4()
    import_id = uuid.uuid4()
    key = storage_key_for_import(user_id, import_id)
    assert key == f"{user_id}/{import_id}.pdf"


def test_save_then_read_round_trips_bytes(storage):
    key = storage.save("some/key.pdf", b"%PDF-1.4 fake bytes")
    assert storage.read(key) == b"%PDF-1.4 fake bytes"


def test_delete_is_idempotent(storage):
    key = storage.save("a/b.pdf", b"data")
    storage.delete(key)
    storage.delete(key)  # must not raise


def test_store_cas_file_sets_reference_and_expiry(db_session, storage):
    now = datetime.now(timezone.utc)

    # Create required User and HouseholdMember for foreign key constraints
    user = User(
        id=uuid.uuid4(),
        phone_number="1234567890",
        created_at=now,
    )
    db_session.add(user)
    db_session.flush()

    hm = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Test Member",
        relationship=Relationship.SELF,
        created_at=now,
    )
    db_session.add(hm)
    db_session.flush()

    import_rec = Import(
        id=uuid.uuid4(),
        household_member_id=hm.id,
        status=ImportStatus.PROCESSING,
        uploaded_at=now,
    )
    user_id = uuid.uuid4()
    store_cas_file(import_rec, user_id, b"%PDF-1.4 fake bytes", storage=storage)

    assert import_rec.file_reference == f"{user_id}/{import_rec.id}.pdf"
    assert storage.read(import_rec.file_reference) == b"%PDF-1.4 fake bytes"
    expected_expiry = now + timedelta(days=CAS_FILE_RETENTION_DAYS)
    assert abs((import_rec.file_expires_at - expected_expiry).total_seconds()) < 5


def test_expire_stored_files_deletes_only_past_expiry_rows(db_session, storage):
    now = datetime.now(timezone.utc)

    # Create required User and HouseholdMembers for foreign key constraints
    user = User(
        id=uuid.uuid4(),
        phone_number="9876543210",
        created_at=now,
    )
    db_session.add(user)
    db_session.flush()

    hm_expired = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Expired Member",
        relationship=Relationship.SELF,
        created_at=now,
    )
    hm_not_expired = HouseholdMember(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Fresh Member",
        relationship=Relationship.SELF,
        created_at=now,
    )
    db_session.add_all([hm_expired, hm_not_expired])
    db_session.flush()

    expired = Import(
        id=uuid.uuid4(), household_member_id=hm_expired.id, status=ImportStatus.IMPORT_SUCCESSFUL,
        uploaded_at=now, file_reference="expired/file.pdf", file_expires_at=now - timedelta(days=1),
    )
    not_expired = Import(
        id=uuid.uuid4(), household_member_id=hm_not_expired.id, status=ImportStatus.IMPORT_SUCCESSFUL,
        uploaded_at=now, file_reference="fresh/file.pdf", file_expires_at=now + timedelta(days=29),
    )
    storage.save("expired/file.pdf", b"old")
    storage.save("fresh/file.pdf", b"new")
    db_session.add_all([expired, not_expired])
    db_session.commit()

    deleted_count = expire_stored_files(db_session, storage=storage)

    assert deleted_count == 1
    db_session.refresh(expired)
    db_session.refresh(not_expired)
    assert expired.file_reference is None
    assert expired.file_expires_at is None
    assert not_expired.file_reference == "fresh/file.pdf"
    with pytest.raises(FileNotFoundError):
        storage.read("expired/file.pdf")
    assert storage.read("fresh/file.pdf") == b"new"
