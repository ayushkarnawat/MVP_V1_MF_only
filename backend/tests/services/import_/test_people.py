from app.services.import_.people import (
    extract_folio_holders,
    folio_key,
    group_people,
    name_warnings,
)

H, A, F, U = "HDFC Mutual Fund", "Axis Mutual Fund", "Franklin Templeton Mutual Fund", "UTI Mutual Fund"
CAMS_LINES = [
    H, "Folio No: 1234 / 56 PAN: ABCPS1234K KYC: OK PAN: OK", "ADITI SHARMA",
    A, "Folio No: 7788 PAN: BXQPS5678L KYC: OK PAN: OK", "RAMESH SHARMA",
    F, "Folio No: 9900", "ADITI SHARMA",
    U, "Folio No: 5511", "MEERA SHARMA",
]
F1, F2, F3, F4 = (H, "1234/56"), (A, "7788"), (F, "9900"), (U, "5511")


def test_folio_key_removes_whitespace():
    assert folio_key("1234 / 56") == "1234/56"


def test_extract_holders():
    h = extract_folio_holders(CAMS_LINES)
    assert h[F1].pan == "ABCPS1234K" and h[F1].holder_name == "ADITI SHARMA"
    assert h[F3].pan is None and h[F3].holder_name == "ADITI SHARMA"


def test_groups_by_pan_and_places_no_pan_folios_by_name():
    holders = extract_folio_holders(CAMS_LINES)
    people, unassigned = group_people(
        [(F1, "ABCPS1234K"), (F2, "BXQPS5678L"), (F3, None), (F4, None)], holders, "ADITI SHARMA"
    )
    assert [(p.key, p.name, p.pan_masked) for p in people] == [
        ("p1", "ADITI SHARMA", "AB******4K"),
        ("p2", "RAMESH SHARMA", "BX******8L"),
        ("p3", "MEERA SHARMA", None),
    ]
    assert people[0].folio_keys == [F1, F3] and people[0].matched_by_name == [F3]
    assert people[2].pan is None
    assert unassigned == []
    assert name_warnings(people) == []


def test_no_pan_and_no_name_is_unassigned():
    lines = [H, "Folio No: 1 PAN: ABCPS1234K", "ADITI SHARMA", A, "Folio No: 2", "Axis Bluechip Fund - ISIN: INF846K01DP8 Registrar : CAMS"]
    people, unassigned = group_people([((H, "1"), "ABCPS1234K"), ((A, "2"), None)], extract_folio_holders(lines), None)
    assert unassigned == [(A, "2")] and len(people) == 1


def test_unreadable_name_uses_other_folio_of_same_pan():
    lines = [H, "Folio No: 1 PAN: ABCPS1234K", "Opening Unit Balance: 10.0", A, "Folio No: 2 PAN: ABCPS1234K", "ADITI SHARMA"]
    people, _ = group_people([((H, "1"), "ABCPS1234K"), ((A, "2"), "ABCPS1234K")], extract_folio_holders(lines), None)
    assert people[0].name == "ADITI SHARMA" and people[0].name_source == "other_folio"
    assert not people[0].needs_name


def test_single_group_falls_back_to_addressee():
    lines = [H, "Folio No: 1 PAN: ABCPS1234K"]
    people, _ = group_people([((H, "1"), "ABCPS1234K")], extract_folio_holders(lines), "ADITI SHARMA")
    assert people[0].name == "ADITI SHARMA" and people[0].name_source == "addressee"


def test_multi_group_unreadable_name_gets_placeholder():
    lines = [H, "Folio No: 1 PAN: ABCPS1234K", "ADITI SHARMA", A, "Folio No: 2 PAN: BXQPS5678L"]
    people, _ = group_people(
        [((H, "1"), "ABCPS1234K"), ((A, "2"), "BXQPS5678L")], extract_folio_holders(lines), "ADITI SHARMA"
    )
    assert people[1].name == "Person 2" and people[1].needs_name is True
    assert people[1].name_source == "placeholder"
    warnings = name_warnings(people)
    assert warnings == ["person p2: name not read from statement"]
    assert not any("BXQ" in w or "ADITI" in w for w in warnings)


def test_kfintech_layout_without_holder_line_never_borrows_a_neighbour_name():
    lines = [
        H, "Folio No: 1 PAN: ABCPS1234K",
        "HDFC Top 100 Fund - Direct Growth - ISIN: INF179K01YV8 (Advisor: DIRECT) Registrar : KFINTECH",
        "01-Jan-2024 Purchase 1,000.00 10.000 100.00 10.000",
        A, "Folio No: 2 PAN: BXQPS5678L", "RAMESH SHARMA",
    ]
    h = extract_folio_holders(lines)
    assert h[(H, "1")].holder_name is None
    people, _ = group_people([((H, "1"), "ABCPS1234K"), ((A, "2"), "BXQPS5678L")], h, None)
    assert people[0].name == "Person 1" and people[0].needs_name
    assert people[1].name == "RAMESH SHARMA"


def test_labels_are_skipped_but_scheme_rows_and_digits_rejected():
    lines = [H, "Folio No: 1 PAN: ABCPS1234K", "Nominee 1: SOMEONE", "ADITI SHARMA"]
    assert extract_folio_holders(lines)[(H, "1")].holder_name == "ADITI SHARMA"
    lines = [H, "Folio No: 1", "ADITI SHARMA 2"]
    assert extract_folio_holders(lines)[(H, "1")].holder_name is None


def test_same_folio_number_under_two_amcs_does_not_collide():
    lines = [H, "Folio No: 1 PAN: ABCPS1234K", "ADITI SHARMA", A, "Folio No: 1 PAN: BXQPS5678L", "RAMESH SHARMA"]
    h = extract_folio_holders(lines)
    assert h[(H, "1")].holder_name == "ADITI SHARMA" and h[(A, "1")].holder_name == "RAMESH SHARMA"


def test_person_keys_never_contain_pan():
    holders = extract_folio_holders(CAMS_LINES)
    people, _ = group_people([(F1, "ABCPS1234K"), (F2, "BXQPS5678L")], holders, None)
    for p in people:
        assert p.key.startswith("p") and "ABCPS" not in p.key and "BXQPS" not in p.key


def test_scheme_name_continuation_line_is_not_a_holder_name():
    lines = [H, "Folio No: 1 PAN: ABCPS1234K", "Parag Parikh Flexi Cap Fund"]
    h = extract_folio_holders(lines)
    assert h[(H, "1")].holder_name is None
    people, _ = group_people([((H, "1"), "ABCPS1234K"), ((A, "2"), "BXQPS5678L")], h, "X")
    assert people[0].name == "Person 1" and people[0].needs_name


def test_no_pan_folio_matching_two_pan_groups_is_not_guessed():
    lines = [H, "Folio No: 1 PAN: ABCPS1234K", "ADITI SHARMA", A, "Folio No: 2 PAN: BXQPS5678L", "ADITI K SHARMA",
             F, "Folio No: 3", "ADITI SHARMA"]
    people, unassigned = group_people(
        [((H, "1"), "ABCPS1234K"), ((A, "2"), "BXQPS5678L"), ((F, "3"), None)], extract_folio_holders(lines), None
    )
    assert len(people) == 3 and people[2].pan is None and people[2].matched_by_name == []
    assert people[2].folio_keys == [(F, "3")] and unassigned == []
