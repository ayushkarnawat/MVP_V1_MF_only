"""Explicit state machine governing the CAS Import lifecycle per Updated-CAS-PRD FR-5 and Updated-CAS-App-Flow.

Enforces transition validity across all 11 lifecycle states:
- NotStarted
- RequestingCAS
- WaitingForUser
- UploadStarted
- PasswordRequired
- ValidationFailed
- Processing
- RetryPending
- ImportSuccessful (Terminal)
- ImportFailed (Terminal, but allows retrying to UploadStarted)
- Expired (Terminal)
"""

from __future__ import annotations

from app.models.enums import ImportStatus


class InvalidStateTransitionError(ValueError):
    """Raised when an illegal transition is attempted on a CASImport record."""

    def __init__(self, from_status: ImportStatus, to_status: ImportStatus):
        self.from_status = from_status
        self.to_status = to_status
        super().__init__(
            f"Invalid CAS import state transition from '{from_status.value}' to '{to_status.value}'."
        )


ALLOWED_TRANSITIONS: dict[ImportStatus, set[ImportStatus]] = {
    ImportStatus.NOT_STARTED: {
        ImportStatus.REQUESTING_CAS,
        ImportStatus.UPLOAD_STARTED,
    },
    ImportStatus.REQUESTING_CAS: {
        ImportStatus.WAITING_FOR_USER,
        ImportStatus.UPLOAD_STARTED,
    },
    ImportStatus.WAITING_FOR_USER: {
        ImportStatus.UPLOAD_STARTED,
        ImportStatus.EXPIRED,
    },
    ImportStatus.UPLOAD_STARTED: {
        ImportStatus.PASSWORD_REQUIRED,
        ImportStatus.VALIDATION_FAILED,
        ImportStatus.PROCESSING,
    },
    ImportStatus.PASSWORD_REQUIRED: {
        ImportStatus.UPLOAD_STARTED,
        ImportStatus.PROCESSING,
        ImportStatus.VALIDATION_FAILED,
    },
    ImportStatus.VALIDATION_FAILED: {
        ImportStatus.REQUESTING_CAS,
        ImportStatus.UPLOAD_STARTED,
    },
    ImportStatus.PROCESSING: {
        ImportStatus.RETRY_PENDING,
        ImportStatus.IMPORT_SUCCESSFUL,
        ImportStatus.IMPORT_FAILED,
        ImportStatus.CONFIRMED,  # backwards compatibility alias
    },
    ImportStatus.RETRY_PENDING: {
        ImportStatus.PROCESSING,
        ImportStatus.IMPORT_FAILED,
    },
    ImportStatus.IMPORT_FAILED: {
        ImportStatus.UPLOAD_STARTED,
    },
    # Backwards compatibility legacy states
    ImportStatus.PENDING: {
        ImportStatus.PROCESSING,
        ImportStatus.CONFIRMED,
        ImportStatus.IMPORT_SUCCESSFUL,
        ImportStatus.FAILED,
        ImportStatus.IMPORT_FAILED,
    },
}

TERMINAL_STATES: set[ImportStatus] = {
    ImportStatus.IMPORT_SUCCESSFUL,
    ImportStatus.CONFIRMED,
    ImportStatus.IMPORT_FAILED,
    ImportStatus.FAILED,
    ImportStatus.EXPIRED,
}


def can_transition(from_status: ImportStatus, to_status: ImportStatus) -> bool:
    """Check whether a transition between two states is valid."""
    allowed = ALLOWED_TRANSITIONS.get(from_status, set())
    return to_status in allowed


def transition_status(from_status: ImportStatus, to_status: ImportStatus) -> ImportStatus:
    """Validate and transition from current status to target status.

    Raises InvalidStateTransitionError if the transition is prohibited.
    """
    if not can_transition(from_status, to_status):
        raise InvalidStateTransitionError(from_status, to_status)
    return to_status
