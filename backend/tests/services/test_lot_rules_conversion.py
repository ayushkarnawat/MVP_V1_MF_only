import pytest


@pytest.mark.parametrize("description,expected", [
    ("Merger of A", True), ("Face Value Change", True),
    ("SIP purchase", False), ("", False), (None, False),
])
def test_is_conversion_description(description, expected):
    from app.services.lot_rules import is_conversion_description

    assert is_conversion_description(description) is expected
