import re

import pytest

from app.services.import_.name_match import (
    InvalidPersonNameError,
    compare_names,
    has_more_tokens,
    validate_person_name,
)


@pytest.mark.parametrize(
    "a, b, expected",
    [
        ("Ayush Karnawat", "AYUSH KARNAWAT", "exact"),
        ("Karnawat Ayush", "AYUSH KARNAWAT", "exact"),
        ("Mr. Ayush Karnawat", "AYUSH KARNAWAT", "exact"),
        ("Ayush Karnawat", "AYUSH KUMAR KARNAWAT", "variant"),
        ("Ayush", "AYUSH KARNAWAT", "variant"),
        ("A K Karnawat", "AYUSH KUMAR KARNAWAT", "variant"),
        ("Aayush Karnawat", "AYUSH KARNAWAT", "variant"),
        ("Kumar", "RAMESH KUMAR", "mismatch"),
        ("Ramesh Kumar", "SURESH KUMAR", "mismatch"),
        ("Priya Sharma", "PRIYA KARNAWAT", "mismatch"),
        ("Ayush Karnawat", "ROHAN MEHTA", "mismatch"),
        # Review Focus 4: punctuation
        ("Anil D'Souza", "ANIL D SOUZA", "exact"),
        ("Mohd. Irfan", "MOHD IRFAN", "exact"),
        ("S.K. Rao", "S K RAO", "exact"),
        # F17: curly apostrophes (iOS/macOS smart punctuation)
        ("Anil D’Souza", "ANIL D SOUZA", "exact"),
        ("Anil D‘Souza", "ANIL D SOUZA", "exact"),
    ],
)
def test_compare_names(a, b, expected):
    assert compare_names(a, b).result == expected


def test_compare_names_empty_is_mismatch():
    assert compare_names("Mr.", "AYUSH").result == "mismatch"


def test_has_more_tokens():
    assert has_more_tokens("AYUSH ANAND KARNAWAT", "Ayush Karnawat") is True
    assert has_more_tokens("AYUSH KARNAWAT", "Ayush Anand Karnawat") is False
    assert has_more_tokens("AYUSH KARNAWAT", "Ayush Karnawat") is False


@pytest.mark.parametrize(
    "raw, ok",
    [
        ("  Ayush   Karnawat ", "Ayush Karnawat"),
        ("D'Souza", "D'Souza"),
        ("D’Souza", "D'Souza"),
        ("D‘Souza", "D'Souza"),
    ],
)
def test_validate_person_name_accepts(raw, ok):
    assert validate_person_name(raw) == ok


@pytest.mark.parametrize(
    "raw, msg",
    [
        ("", "Enter your name as per PAN."),
        ("   ", "Enter your name as per PAN."),
        ("A", "Name must be 2 to 85 characters."),
        ("A" * 86, "Name must be 2 to 85 characters."),
        ("Ayush1", "Use letters, spaces, dots and apostrophes only."),
        ("..", "Use letters, spaces, dots and apostrophes only."),
        ("'.", "Use letters, spaces, dots and apostrophes only."),
    ],
)
def test_validate_person_name_rejects(raw, msg):
    with pytest.raises(InvalidPersonNameError, match=re.escape(msg)) as exc:
        validate_person_name(raw)
    assert exc.value.code == "invalid_name"
    assert exc.value.message == msg
