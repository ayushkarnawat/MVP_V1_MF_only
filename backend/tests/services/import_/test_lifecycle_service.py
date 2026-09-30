import pytest

from app.services.import_.lifecycle_service import (
    FileTooLargeError,
    InvalidFileFormatError,
    validate_file_payload,
)


def test_magic_byte_validation_rejects_non_pdf():
    with pytest.raises(InvalidFileFormatError):
        validate_file_payload(b"Hello, this is a plain text file, not a PDF.")


def test_file_size_cap_rejects_oversized_files():
    with pytest.raises(FileTooLargeError):
        validate_file_payload(b"%PDF-" + b"0" * (26 * 1024 * 1024))
