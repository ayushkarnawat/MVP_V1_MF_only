import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.models.enums import ImportStatus, Relationship
from app.models.imports import Import
from app.models.user import User, HouseholdMember
from app.services.import_.file_storage import (
    CAS_FILE_RETENTION_DAYS,
    LocalFileStorage,
    S3FileStorage,
    _build_default_file_storage,
    expire_stored_files,
    release_file_if_unreferenced,
    storage_key_for_import,
    storage_key_for_upload_group,
    store_cas_file,
    store_group_cas_file,
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


def test_expire_stored_files_does_not_delete_storage_when_commit_fails(db_session, storage, monkeypatch):
    now = datetime.now(timezone.utc)
    user = User(id=uuid.uuid4(), phone_number="9876543211", created_at=now)
    db_session.add(user)
    db_session.flush()
    hm = HouseholdMember(id=uuid.uuid4(), user_id=user.id, name="M", relationship=Relationship.SELF, created_at=now)
    db_session.add(hm)
    db_session.flush()
    db_session.add(Import(
        id=uuid.uuid4(), household_member_id=hm.id, status=ImportStatus.IMPORT_SUCCESSFUL,
        uploaded_at=now, file_reference="expired/x.pdf", file_expires_at=now - timedelta(days=1),
    ))
    storage.save("expired/x.pdf", b"old")
    db_session.commit()

    def boom():
        raise RuntimeError("commit failed")

    monkeypatch.setattr(db_session, "commit", boom)
    with pytest.raises(RuntimeError):
        expire_stored_files(db_session, storage=storage)
    # F15 ordering: the row change did not commit, so the file must still exist.
    assert storage.read("expired/x.pdf") == b"old"


@patch("app.services.import_.file_storage.boto3")
def test_s3_storage_save_calls_put_object(mock_boto3):
    mock_client = MagicMock()
    mock_boto3.client.return_value = mock_client

    storage = S3FileStorage(bucket_name="test-cas-bucket")
    key = storage.save("some/key.pdf", b"%PDF-1.4 fake bytes")

    assert key == "some/key.pdf"
    mock_client.put_object.assert_called_once_with(
        Bucket="test-cas-bucket", Key="some/key.pdf", Body=b"%PDF-1.4 fake bytes"
    )


@patch("app.services.import_.file_storage.boto3")
def test_s3_storage_read_returns_object_body(mock_boto3):
    mock_client = MagicMock()
    mock_client.get_object.return_value = {"Body": MagicMock(read=lambda: b"pdf bytes")}
    mock_boto3.client.return_value = mock_client

    storage = S3FileStorage(bucket_name="test-cas-bucket")
    assert storage.read("some/key.pdf") == b"pdf bytes"
    mock_client.get_object.assert_called_once_with(Bucket="test-cas-bucket", Key="some/key.pdf")


@patch("app.services.import_.file_storage.boto3")
def test_s3_storage_delete_calls_delete_object(mock_boto3):
    mock_client = MagicMock()
    mock_boto3.client.return_value = mock_client

    storage = S3FileStorage(bucket_name="test-cas-bucket")
    storage.delete("some/key.pdf")

    mock_client.delete_object.assert_called_once_with(Bucket="test-cas-bucket", Key="some/key.pdf")


@patch("app.services.import_.file_storage.boto3")
def test_factory_picks_s3_backend_from_settings(mock_boto3, monkeypatch):
    from app.services.import_.file_storage import settings

    monkeypatch.setattr(settings, "cas_file_storage_backend", "s3")
    monkeypatch.setattr(settings, "cas_files_bucket_name", "test-cas-bucket")

    storage = _build_default_file_storage()

    assert isinstance(storage, S3FileStorage)
    assert storage._bucket_name == "test-cas-bucket"


def test_factory_defaults_to_local_backend(monkeypatch):
    from app.services.import_.file_storage import settings

    monkeypatch.setattr(settings, "cas_file_storage_backend", "local")

    assert isinstance(_build_default_file_storage(), LocalFileStorage)


# --- Task 8: one stored CAS file per upload group ---------------------------


class _CountingStorage:
    """Fake FileStorage that records every call, so tests can assert a group's
    file is written once and deleted once regardless of how many Import rows
    point at it."""

    def __init__(self):
        self.saved: list[str] = []
        self.deleted: list[str] = []
        self._data: dict[str, bytes] = {}

    def save(self, key: str, data: bytes) -> str:
        self.saved.append(key)
        self._data[key] = data
        return key

    def read(self, reference: str) -> bytes:
        return self._data[reference]

    def delete(self, reference: str) -> None:
        self.deleted.append(reference)
        self._data.pop(reference, None)


def _user_with_members(db_session, n: int):
    now = datetime.now(timezone.utc)
    user = User(id=uuid.uuid4(), phone_number=f"9{uuid.uuid4().int % 10**9:09d}", created_at=now)
    db_session.add(user)
    db_session.flush()
    members = []
    for i in range(n):
        hm = HouseholdMember(
            id=uuid.uuid4(), user_id=user.id, name=f"Member {i}",
            relationship=Relationship.SELF if i == 0 else Relationship.OTHER,
            relationship_other_label=None if i == 0 else "Other", created_at=now,
        )
        db_session.add(hm)
        members.append(hm)
    db_session.flush()
    return user, members


def test_storage_key_for_upload_group_is_scoped_by_user_and_group():
    user_id, group_id = uuid.uuid4(), uuid.uuid4()
    assert storage_key_for_upload_group(user_id, group_id) == f"{user_id}/{group_id}.pdf"


def test_group_file_saved_once_and_shared(db_session):
    now = datetime.now(timezone.utc)
    user, members = _user_with_members(db_session, 3)
    group_id = uuid.uuid4()
    recs = [
        Import(id=uuid.uuid4(), household_member_id=m.id, status=ImportStatus.PROCESSING,
               uploaded_at=now, upload_group_id=group_id)
        for m in members
    ]
    storage = _CountingStorage()

    store_group_cas_file(recs, user.id, group_id, b"%PDF family", storage=storage)

    assert storage.saved == [f"{user.id}/{group_id}.pdf"]
    assert {r.file_reference for r in recs} == {f"{user.id}/{group_id}.pdf"}
    assert len({r.file_expires_at for r in recs}) == 1
    expected_expiry = now + timedelta(days=CAS_FILE_RETENTION_DAYS)
    assert abs((recs[0].file_expires_at - expected_expiry).total_seconds()) < 5


def test_expire_nulls_all_rows_of_a_group_and_deletes_once(db_session):
    now = datetime.now(timezone.utc)
    user, members = _user_with_members(db_session, 3)
    group_id = uuid.uuid4()
    ref = f"{user.id}/{group_id}.pdf"
    recs = [
        Import(id=uuid.uuid4(), household_member_id=m.id, status=ImportStatus.IMPORT_SUCCESSFUL,
               uploaded_at=now, upload_group_id=group_id, file_reference=ref,
               file_expires_at=now - timedelta(days=1))
        for m in members
    ]
    fresh = Import(id=uuid.uuid4(), household_member_id=members[0].id,
                   status=ImportStatus.IMPORT_SUCCESSFUL, uploaded_at=now,
                   file_reference="fresh.pdf", file_expires_at=now + timedelta(days=5))
    db_session.add_all(recs + [fresh])
    db_session.commit()
    storage = _CountingStorage()

    expire_stored_files(db_session, storage=storage)

    assert storage.deleted == [ref]
    for r in recs:
        db_session.refresh(r)
        assert r.file_reference is None
        assert r.file_expires_at is None
    db_session.refresh(fresh)
    assert fresh.file_reference == "fresh.pdf"


def test_release_file_only_when_no_row_references_it(db_session):
    now = datetime.now(timezone.utc)
    user, members = _user_with_members(db_session, 2)
    ref = f"{user.id}/{uuid.uuid4()}.pdf"
    a = Import(id=uuid.uuid4(), household_member_id=members[0].id,
               status=ImportStatus.IMPORT_SUCCESSFUL, uploaded_at=now, file_reference=ref)
    b = Import(id=uuid.uuid4(), household_member_id=members[1].id,
               status=ImportStatus.IMPORT_SUCCESSFUL, uploaded_at=now, file_reference=ref)
    db_session.add_all([a, b])
    db_session.commit()
    storage = _CountingStorage()

    # Still referenced by b and a -> not deleted.
    assert release_file_if_unreferenced(db_session, ref, storage=storage) is False
    a.file_reference = None
    db_session.flush()
    assert release_file_if_unreferenced(db_session, ref, storage=storage) is False
    assert storage.deleted == []

    b.file_reference = None
    db_session.flush()
    assert release_file_if_unreferenced(db_session, ref, storage=storage) is True
    assert storage.deleted == [ref]
