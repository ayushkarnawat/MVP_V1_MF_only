from app.services.auth.password import hash_password, verify_password


def test_hash_password_returns_a_different_string_than_the_input():
    hashed = hash_password("correct horse battery staple")
    assert hashed != "correct horse battery staple"
    assert len(hashed) > 20


def test_verify_password_succeeds_for_the_correct_password():
    hashed = hash_password("correct horse battery staple")
    assert verify_password("correct horse battery staple", hashed) is True


def test_verify_password_fails_for_the_wrong_password():
    hashed = hash_password("correct horse battery staple")
    assert verify_password("wrong password", hashed) is False


def test_hash_password_produces_different_hashes_for_the_same_input():
    # bcrypt salts automatically — two hashes of the same password must
    # differ, or verify_password would be trivially exploitable via
    # hash-equality timing/comparison shortcuts.
    first = hash_password("correct horse battery staple")
    second = hash_password("correct horse battery staple")
    assert first != second
    assert verify_password("correct horse battery staple", first) is True
    assert verify_password("correct horse battery staple", second) is True
