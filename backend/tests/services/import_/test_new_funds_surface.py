from unittest.mock import patch

import pytest

from app.services.import_ import preview_store
from app.services.import_.service import _preview_sessions
from tests.api.import_helpers import _test_db
from tests.api.test_imports_confirm_new_funds import _confirm, upload_session


@pytest.mark.parametrize("surface, expected", [
    ("onboarding_upload", "onboarding_upload"), ("import_upload", "import_upload"),
    ("mobile_upload", "mobile_upload"), ("unknown", "import_upload"), (None, "import_upload"),
])
def test_surface_is_stored_in_the_session_and_unknown_surfaces_fall_back_to_import_upload(
    client, upload_session, surface, expected,
):
    _, _, preview = upload_session(surface)
    sid = preview["session_id"]
    assert _preview_sessions[sid]["surface"] == expected
    stored = preview_store.load(_test_db(), sid)
    assert stored["surface"] == expected


def test_confirm_returns_none_for_the_onboarding_upload_and_runs_no_new_funds_query(client, upload_session):
    headers, _, preview = upload_session("onboarding_upload", family=True)
    _preview_sessions.pop(preview["session_id"], None)
    with patch("app.services.import_.confirm_people.find_new_funds", create=True) as query:
        body = _confirm(client, headers, preview)
        query.assert_not_called()
    assert [person["created"] for person in body["people"]] == [False, True]
    assert all(person["new_funds"] == [] for person in body["people"])
