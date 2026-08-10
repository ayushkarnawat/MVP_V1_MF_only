import pytest

from app.models.enums import ImportStatus
from app.services.import_.state_machine import (
    ALLOWED_TRANSITIONS,
    TERMINAL_STATES,
    InvalidStateTransitionError,
    can_transition,
    transition_status,
)


def test_allowed_transitions_defined_for_all_non_terminal_states():
    """Every state should be accounted for in the transition table or terminal list."""
    all_states = set(ImportStatus)
    covered = set(ALLOWED_TRANSITIONS.keys()) | TERMINAL_STATES
    # Check that all canonical lifecycle states are covered
    expected = {
        ImportStatus.NOT_STARTED,
        ImportStatus.REQUESTING_CAS,
        ImportStatus.WAITING_FOR_USER,
        ImportStatus.UPLOAD_STARTED,
        ImportStatus.PASSWORD_REQUIRED,
        ImportStatus.VALIDATION_FAILED,
        ImportStatus.PROCESSING,
        ImportStatus.RETRY_PENDING,
        ImportStatus.IMPORT_SUCCESSFUL,
        ImportStatus.IMPORT_FAILED,
        ImportStatus.EXPIRED,
    }
    assert expected.issubset(covered)


@pytest.mark.parametrize(
    ("from_state", "to_state"),
    [
        (ImportStatus.NOT_STARTED, ImportStatus.REQUESTING_CAS),
        (ImportStatus.NOT_STARTED, ImportStatus.UPLOAD_STARTED),
        (ImportStatus.REQUESTING_CAS, ImportStatus.WAITING_FOR_USER),
        (ImportStatus.WAITING_FOR_USER, ImportStatus.UPLOAD_STARTED),
        (ImportStatus.WAITING_FOR_USER, ImportStatus.EXPIRED),
        (ImportStatus.UPLOAD_STARTED, ImportStatus.PASSWORD_REQUIRED),
        (ImportStatus.UPLOAD_STARTED, ImportStatus.VALIDATION_FAILED),
        (ImportStatus.UPLOAD_STARTED, ImportStatus.PROCESSING),
        (ImportStatus.PASSWORD_REQUIRED, ImportStatus.UPLOAD_STARTED),
        (ImportStatus.VALIDATION_FAILED, ImportStatus.REQUESTING_CAS),
        (ImportStatus.VALIDATION_FAILED, ImportStatus.UPLOAD_STARTED),
        (ImportStatus.PROCESSING, ImportStatus.RETRY_PENDING),
        (ImportStatus.PROCESSING, ImportStatus.IMPORT_SUCCESSFUL),
        (ImportStatus.PROCESSING, ImportStatus.IMPORT_FAILED),
        (ImportStatus.RETRY_PENDING, ImportStatus.PROCESSING),
        (ImportStatus.RETRY_PENDING, ImportStatus.IMPORT_FAILED),
        (ImportStatus.IMPORT_FAILED, ImportStatus.UPLOAD_STARTED),
    ],
)
def test_valid_transitions(from_state: ImportStatus, to_state: ImportStatus):
    assert can_transition(from_state, to_state) is True
    assert transition_status(from_state, to_state) == to_state


@pytest.mark.parametrize(
    ("from_state", "to_state"),
    [
        (ImportStatus.NOT_STARTED, ImportStatus.IMPORT_SUCCESSFUL),
        (ImportStatus.NOT_STARTED, ImportStatus.PASSWORD_REQUIRED),
        (ImportStatus.WAITING_FOR_USER, ImportStatus.IMPORT_SUCCESSFUL),
        (ImportStatus.PASSWORD_REQUIRED, ImportStatus.IMPORT_SUCCESSFUL),
        (ImportStatus.VALIDATION_FAILED, ImportStatus.IMPORT_SUCCESSFUL),
        (ImportStatus.IMPORT_SUCCESSFUL, ImportStatus.PASSWORD_REQUIRED),
        (ImportStatus.IMPORT_SUCCESSFUL, ImportStatus.PROCESSING),
        (ImportStatus.IMPORT_SUCCESSFUL, ImportStatus.UPLOAD_STARTED),
        (ImportStatus.EXPIRED, ImportStatus.PROCESSING),
        (ImportStatus.EXPIRED, ImportStatus.IMPORT_SUCCESSFUL),
    ],
)
def test_invalid_transitions_raise_error(from_state: ImportStatus, to_state: ImportStatus):
    assert can_transition(from_state, to_state) is False
    with pytest.raises(InvalidStateTransitionError) as exc_info:
        transition_status(from_state, to_state)
    assert exc_info.value.from_status == from_state
    assert exc_info.value.to_status == to_state


def test_terminal_states_cannot_transition():
    for terminal in TERMINAL_STATES:
        if terminal == ImportStatus.IMPORT_FAILED:
            # ImportFailed allows retrying to UploadStarted per PRD
            continue
        for target in ImportStatus:
            assert can_transition(terminal, target) is False
            with pytest.raises(InvalidStateTransitionError):
                transition_status(terminal, target)
