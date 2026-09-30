"""CAS upload validation and the shared upload errors.

The old one-step create/retry lifecycle was removed: every import now goes
through the people-detection session flow (service.py / confirm_people.py, M18).
"""

from __future__ import annotations

MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25MB


class InvalidFileFormatError(ValueError):
    """Raised when file magic bytes do not match PDF."""


class FileTooLargeError(ValueError):
    """Raised when file exceeds size cap."""


class SessionExpiredError(ValueError):
    """Raised when cached PDF buffer is expired or not found for password retry."""


def validate_file_payload(file_bytes: bytes) -> None:
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise FileTooLargeError("File too large. Maximum supported file size is 25MB.")
    if not file_bytes.startswith(b"%PDF-"):
        raise InvalidFileFormatError("PDF only — please upload a CAS statement in PDF format.")
