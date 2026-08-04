from app.parser import classify_parse_error


def test_wrong_password_error():
    err = classify_parse_error(Exception("Incorrect password supplied"))
    assert err.code == "wrong_password"
    assert "PAN in uppercase" in err.message


def test_decrypt_failure_classified_as_wrong_password():
    err = classify_parse_error(Exception("Failed to decrypt PDF"))
    assert err.code == "wrong_password"


def test_scanned_pdf_error():
    err = classify_parse_error(Exception("Unable to extract text from image"))
    assert err.code == "unreadable_pdf"
    assert "scanned" in err.message.lower()


def test_generic_error_passes_through_sanitized():
    err = classify_parse_error(Exception("Some obscure internal casparser failure"))
    assert err.code == "parse_failed"
    assert "obscure internal casparser failure" in err.message


def test_generic_error_truncated_to_500_chars():
    err = classify_parse_error(Exception("x" * 1000))
    assert len(err.message) == 500
