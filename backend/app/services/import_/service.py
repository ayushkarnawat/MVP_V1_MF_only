"""Import Service orchestration: parse preview (no DB writes) and confirm
(persists). Implements PRD-01 FR-9-FR-11.

In-memory preview sessions are a deliberate, prototype-carried
simplification (ponytail: single-process only; move to a DB-backed or
Redis-backed session store if a multi-instance deploy needs this later).
"""

from __future__ import annotations

import asyncio
import functools
import threading
import uuid
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.enums import (
    MemberNameSource,
    MemberPanSource,
    NameChangeReason,
    Relationship,
)
from app.models.folio import Folio
from app.models.member_history import HouseholdMemberNameChange
from app.models.user import HouseholdMember
from app.db.session import commit_off_loop
from app.services.import_.pan_claims import (
    CrossAccountPanBlockedError,
    PanConflictError,
    claim_pan_for_member,
    classify_detected_pan,
    is_expired_pending,
    release_pending_pan_claim,
    restore_pan_snapshot,
    switch_pan_claim,
)
from app.services.import_.crypto import decrypt_pan, hash_pan
from app.services.import_.enrich import MfApiClient, mfapi_client
# F22: the one SessionExpiredError (already mapped to 410 by /cas-imports).
from app.services.import_.lifecycle_service import SessionExpiredError
from app.services.import_.name_match import compare_names, validate_person_name
from app.services.import_.parser import ParseResult, mask_pan
from app.services.import_.people import ParsedPerson, folio_key
from app.services.import_.people_resolution import (
    PersonPlan,
    SelfMatch,
    has_permanent_pan,
    has_no_pan,
    plan_member_name_update,
    plan_name_update,
    plan_people,
)
# Aliased: this module's own resolve_self is the U3 endpoint's service.
from app.services.import_.people_resolution import resolve_self as match_self
from app.services.import_.schemas import (
    ImportConfirmResponse,
    ImportPreviewResponse,
    NameNotice,
    PersonPreview,
    SamePersonPrompt,
    SchemeConfirmation,
    SchemeMatchPreview,
    TransactionPreview,
)

_preview_sessions: dict[str, dict[str, Any]] = {}
# F5: guards every insert/pop on _preview_sessions. Each session also carries
# its own "lock": the resolve routes and discard hold it for their whole
# request (so a double-pressed resolve runs once, then sees its prompt
# answered), and confirm takes it without waiting and pops the session, so a
# second concurrent confirm finds nothing and gets 410. Lock order is always
# session lock -> _sessions_lock, never the reverse.
_sessions_lock = threading.Lock()

CONFIDENCE_THRESHOLD = 0.92
SESSION_TTL_MINUTES = 60


SESSION_EXPIRED_MESSAGE = "This review has expired"
NAME_NOT_ON_STATEMENT_MESSAGE = "This name doesn’t match the statement"


class ImportPromptError(Exception):
    """An upload-time prompt (spec U2-U7, U12): the route turns it into a 409
    whose detail is ImportPromptDetail. `session_id` is None when the prompt
    ended the review (the session is gone); otherwise the RAM session is kept
    and the matching resolve endpoint answers it."""

    def __init__(self, code: str, message: str, session_id: str | None, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.session_id = session_id
        self.details = details or {}


class NameNotOnStatementError(ValueError):
    code = "name_not_on_statement"
    message = NAME_NOT_ON_STATEMENT_MESSAGE


class InvalidResolveChoiceError(ValueError):
    """A resolve request that names a person/member the prompt didn't offer."""

    code = "invalid_choice"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class SchemeConfidenceError(Exception):
    """Raised when a scheme needs an explicit AMFI override and didn't get
    one — distinct from ValueError's "session not found" so the route can
    return 409 (fixable by the client) instead of 404 (start over)."""


def _sweep_expired_sessions(ttl_minutes: int = SESSION_TTL_MINUTES, db: Session | None = None) -> bool:
    """Evicts preview sessions older than ttl_minutes. Each session holds the
    full ParseResult, including investor name/email — sweeping keeps
    abandoned/rejected parses from accumulating in process memory forever.

    ponytail: sweeps on every build_import_preview call rather than a
    background thread/scheduler — fine for this single-process prototype
    (see module docstring); move to a real TTL cache if that changes.

    With `db`, every expired session's PAN claims are also released and any
    switched member PAN restored (F6); returns True when that wrote something
    the caller must commit. Without `db`, a session holding a switched PAN
    is left for the next DB-aware sweep -- dropping it here would strand the
    member on the switched pending PAN, which then expires to no PAN at all.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=ttl_minutes)
    evicted: list[dict[str, Any]] = []
    with _sessions_lock:
        for sid, session in list(_preview_sessions.items()):
            if session["created_at"] >= cutoff:
                continue
            lock = session.get("lock")
            if lock is not None and lock.locked():
                continue  # a request is working on it right now; next sweep
            if db is None and session.get("pan_restore"):
                continue
            del _preview_sessions[sid]
            evicted.append(session)
    if db is None:
        return False
    for session in evicted:
        _release_session_claims(db, session)
    return bool(evicted)


def _is_session_expired(session: dict[str, Any], ttl_minutes: int = SESSION_TTL_MINUTES) -> bool:
    # Checked at confirm time too, not only swept on the next parse: a pending
    # PAN claim lives PENDING_PAN_TTL (65 min), so a session must never be
    # confirmable past its own 60-minute TTL.
    return session["created_at"] < datetime.now(timezone.utc) - timedelta(minutes=ttl_minutes)


async def build_import_preview(
    parse_result: ParseResult,
    filename: str,
    pdf_bytes: bytes,
    client: MfApiClient | None = None,
    *,
    household_member_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
) -> ImportPreviewResponse:
    _sweep_expired_sessions()
    client = client or mfapi_client
    session_id = uuid.uuid4().hex

    scheme_previews: list[SchemeMatchPreview] = []
    key_to_temp: dict[tuple[str, str, str], str] = {}

    async def resolve(scheme):
        match, status = await client.resolve_scheme(scheme.name, scheme.amfi, scheme.isin)
        category = None
        if match and match.amfi_code:
            category = await client.get_scheme_category(match.amfi_code)
        return match, status, category

    resolutions = await asyncio.gather(*(resolve(scheme) for scheme in parse_result.schemes))

    for scheme, (match, status, category) in zip(parse_result.schemes, resolutions, strict=True):
        temp_id = uuid.uuid4().hex[:12]
        key_to_temp[(scheme.folio, scheme.amc, scheme.name)] = temp_id

        scheme_previews.append(
            SchemeMatchPreview(
                temp_id=temp_id, name=scheme.name, isin=scheme.isin, amfi_code=scheme.amfi,
                suggested_amfi_code=match.amfi_code if match else None,
                suggested_name=match.scheme_name if match else None,
                match_confidence=match.confidence if match else 0.0,
                match_status=status, folio=scheme.folio, amc=scheme.amc,
                transaction_count=scheme.transaction_count, plan_type=scheme.plan_type,
                category=category or scheme.scheme_type,
                person_key=scheme.person_key,
            )
        )

    txn_previews = [
        TransactionPreview(
            folio=t.folio, scheme_name=t.scheme_name, txn_date=t.txn_date, txn_type=t.txn_type.value,
            description=t.description, amount=str(t.amount) if t.amount is not None else None,
            units=str(t.units) if t.units is not None else None, nav=str(t.nav) if t.nav is not None else None,
        )
        for t in parse_result.transactions
    ]

    created_at = datetime.now(timezone.utc)
    _preview_sessions[session_id] = {
        "session_id": session_id,
        "created_at": created_at,
        "lock": threading.Lock(),
        "filename": filename, "parse_result": parse_result, "pdf_bytes": pdf_bytes,
        # Set by start_import_session (the only production caller); None only
        # when tests build a preview directly.
        "household_member_id": household_member_id, "user_id": user_id,
        "key_to_temp": key_to_temp,
        "scheme_previews": {s.temp_id: s for s in scheme_previews},
    }

    return ImportPreviewResponse(
        session_id=session_id, filename=filename,
        investor_name=parse_result.investor.name, investor_email=parse_result.investor.email,
        pan_masked=parse_result.investor.pan_masked, schemes=scheme_previews, transactions=txn_previews,
        transaction_count=len(txn_previews), parse_warnings=parse_result.parse_warnings,
        cas_type=parse_result.cas_type, file_type=parse_result.file_type,
        expires_at=created_at + timedelta(minutes=SESSION_TTL_MINUTES),
    )


async def start_import_session(
    db: Session,
    user_id: uuid.UUID,
    member: HouseholdMember,
    parse_result: ParseResult,
    filename: str,
    pdf_bytes: bytes,
    client: MfApiClient | None = None,
) -> ImportPreviewResponse:
    """Upload-time step of the two-step import: builds the preview, detects
    the people in it, then walks the prompt queue (next_prompt). A prompt
    raises ImportPromptError and keeps the RAM session so a resolve endpoint
    can answer it. Only once no prompt
    remains are PAN claims made -- pending -- and committed.

    Preview first on purpose: a flushed-but-uncommitted claim holds SQLite's
    write lock, and build_import_preview makes mfapi network calls (up to 30s
    on a cold cache) -- claiming first would block every other writer for
    that long."""
    if _sweep_expired_sessions(db=db):
        # Commit the sweep's restores now: holding them flushed across the
        # enrichment network calls below would hold SQLite's write lock.
        await commit_off_loop(db)

    parse_result = _ensure_people(parse_result)
    preview = await build_import_preview(
        parse_result, filename, pdf_bytes, client,
        household_member_id=member.id, user_id=user_id,
    )
    _preview_sessions[preview.session_id].update(
        base_preview=preview,
        people_plan=[],
        me_key=None,
        # Prompts answered by acknowledgement (U5, U7). U2/U3/U4/U6 are
        # re-derived from the DB and the choices below on every call.
        resolved_codes=set(),
        # (member_id, raw PAN) of every pending claim this session made.
        pending_claims=[],
        # member_id -> PanSnapshot for members whose PAN was switched (F6).
        pan_restore={},
        me_choice=None,
        u3_declined=False,
        same_person_declined=set(),
        # person_key -> member_id: "Yes, same person" for a name-only member (5B).
        same_person_linked={},
        ready=False,
    )
    try:
        response = _advance(db, preview.session_id)
    except (ImportPromptError, PanConflictError):
        await commit_off_loop(db)
        raise
    except Exception:
        _preview_sessions.pop(preview.session_id, None)
        raise
    await commit_off_loop(db)
    return response


# ---------------------------------------------------------------------------
# People detection and the upload-time prompt queue (Tasks 6/7).
# Prompt copy: spec catalogue card titles, verbatim (curly apostrophes).
# ---------------------------------------------------------------------------


def _ensure_people(parse_result: ParseResult) -> ParseResult:
    """A ParseResult built without people detection (every parse_cas_pdf_bytes
    result has people) is treated as a one-person file for the investor, the
    same grouping people.group_people gives a single-PAN statement, so no
    path imports without people (M18)."""
    if parse_result.people or not parse_result.schemes:
        return parse_result
    investor = parse_result.investor
    key = "p1"
    fids: list[tuple[str, str]] = []
    for s in parse_result.schemes:
        fid = (s.amc, folio_key(s.folio))
        if fid not in fids:
            fids.append(fid)
    person = ParsedPerson(
        key=key, pan=investor.pan, pan_masked=mask_pan(investor.pan),
        name=investor.name or "Person 1",
        name_source="addressee" if investor.name else "placeholder",
        needs_name=not investor.name, folio_keys=fids, matched_by_name=[],
    )
    return replace(
        parse_result,
        schemes=[replace(s, person_key=key) for s in parse_result.schemes],
        transactions=[replace(t, person_key=key) for t in parse_result.transactions],
        people=[person],
    )


def _self_member(db: Session, user_id: uuid.UUID) -> HouseholdMember | None:
    return (
        db.query(HouseholdMember)
        .filter(HouseholdMember.user_id == user_id, HouseholdMember.relationship == Relationship.SELF)
        .order_by(HouseholdMember.created_at)
        .first()
    )


def _is_first_upload(self_member: HouseholdMember | None) -> bool:
    # Spec "Your three situations": first upload = self has no permanent PAN.
    return self_member is not None and not has_permanent_pan(self_member)


def _people(session: dict[str, Any]) -> list[ParsedPerson]:
    return session["parse_result"].people


def _person(session: dict[str, Any], key: str) -> ParsedPerson:
    return next(p for p in _people(session) if p.key == key)


def _masked_member_pan(member: HouseholdMember) -> str | None:
    if not member.pan_encrypted:
        return None
    return mask_pan(decrypt_pan(member.pan_encrypted))


def _self_match(session: dict[str, Any], self_member: HouseholdMember) -> SelfMatch:
    if session.get("me_choice") and _is_first_upload(self_member):
        return SelfMatch("exact", session["me_choice"], [session["me_choice"]])
    match = match_self(self_member, _people(session))
    if match.kind == "ambiguous" and session.get("u3_declined"):
        return SelfMatch("mismatch", None, [])  # U3 "None of these" -> U2
    return match


def _me_key(session: dict[str, Any], self_member: HouseholdMember | None) -> str | None:
    if self_member is None:
        return None
    match = _self_match(session, self_member)
    return match.person_key if match.kind in ("pan", "exact", "variant") else None


def _statement_name(parse_result: ParseResult) -> str:
    """F29: U2 names the person matching the statement's addressee, else the
    first person."""
    people = parse_result.people
    addressee = parse_result.investor.name
    if addressee:
        hit = next(
            (p for p in people if not p.needs_name and compare_names(addressee, p.name).result != "mismatch"),
            None,
        )
        if hit is not None:
            return hit.name
    if people:
        return people[0].name
    return addressee or ""


def _find_target(
    db: Session, user_id: uuid.UUID, target: HouseholdMember, people: list[ParsedPerson], *, is_self: bool
) -> tuple[str, str | None]:
    """Spec flowchart "Find M in the file": M.pan_lookup_hash, then
    M.detected_pan_hash (a pan-conflict member), then a name match. Returns (outcome, person_key),
    outcome in found / found_by_name / pan_mismatch / not_found."""
    now = datetime.now(timezone.utc)
    hashes = {p.key: hash_pan(p.pan) for p in people if p.pan}
    if target.pan_lookup_hash and not is_expired_pending(target, now):
        hit = next((k for k, h in hashes.items() if h == target.pan_lookup_hash), None)
        if hit:
            return "found", hit
    if target.detected_pan_hash:
        hit = next((k for k, h in hashes.items() if h == target.detected_pan_hash), None)
        if hit:
            return "found", hit
    if is_self:
        return "not_found", None  # F11: a permanent self PAN is only found by PAN
    exact: list[ParsedPerson] = []
    variant: list[ParsedPerson] = []
    for p in people:
        if p.needs_name:
            continue
        if p.pan:
            status, member_id = classify_detected_pan(db, user_id, p.pan)
            # A person whose PAN already identifies someone else here is not M.
            if status == "existing_member" and member_id != target.id:
                continue
        result = compare_names(target.name, p.name).result
        if result == "exact":
            exact.append(p)
        elif result == "variant":
            variant.append(p)
    pick = exact[0] if len(exact) == 1 else (variant[0] if not exact and len(variant) == 1 else None)
    if pick is None:
        return "not_found", None
    if target.pan_lookup_hash is None or pick.pan is None:
        return "found_by_name", pick.key
    if target.pan_source == MemberPanSource.USER_ENTERED and target.pan_verified_at is None:
        return "pan_mismatch", pick.key  # U4: a typed, never-verified PAN
    return "not_found", None  # verified PAN differs -> U5


def next_prompt(db: Session, session: dict[str, Any]) -> ImportPromptError | None:
    """The first prompt still open for this review, in the spec's order
    ("Your three situations"), or None. Read-only: records only which person
    is the upload's target in the session."""
    sid = session["session_id"]
    user_id = session["user_id"]
    parse_result: ParseResult = session["parse_result"]
    people = parse_result.people
    resolved: set[str] = session["resolved_codes"]
    target = db.get(HouseholdMember, session["household_member_id"])
    if target is None:
        raise SessionExpiredError(SESSION_EXPIRED_MESSAGE)
    self_member = _self_member(db, user_id)
    first_upload = _is_first_upload(self_member)
    is_self_target = self_member is not None and target.id == self_member.id
    session["target_person_key"] = None
    session["target_mismatch_key"] = None
    # 1-2. Add data for M. (The first upload for self finds Me by name below.)
    if not (is_self_target and first_upload):
        outcome, key = _find_target(db, user_id, target, people, is_self=is_self_target)
        if outcome in ("found", "found_by_name"):
            session["target_person_key"] = key
        elif outcome == "pan_mismatch":
            session["target_mismatch_key"] = key
            return ImportPromptError(
                "member_pan_mismatch", "This PAN doesn’t match what you entered", sid,
                {
                    "member_name": target.name,
                    "entered_pan_masked": _masked_member_pan(target),
                    "statement_pan_masked": _person(session, key).pan_masked,
                },
            )
        elif "member_not_in_file" not in resolved:
            return ImportPromptError(
                "member_not_in_file", f"{target.name} isn’t in this statement", sid,
                {
                    "member_name": target.name,
                    "member_pan_masked": _masked_member_pan(target),
                    "people": [p.name for p in people],
                },
            )

    # 3. Whole-file check: every fund is another account's.
    whole_file = bool(people) and not parse_result.unassigned_folio_keys and all(p.pan for p in people)
    if whole_file:
        statuses = [classify_detected_pan(db, user_id, p.pan) for p in people]
        if all(status == "other_account" for status, _ in statuses) and "cross_account_pan_blocked" not in resolved:
            # F30: if Me is one of them, the self claim in _advance raises
            # today's session-dropping 409 instead of offering U7.
            if not (first_upload and _me_key(session, self_member)):
                return ImportPromptError(
                    "cross_account_pan_blocked", "This statement belongs to another Unifolio account", sid,
                    {"people": [p.name for p in people]},
                )

    # 4-5. First upload: find Me by name.
    if first_upload:
        match = _self_match(session, self_member)
        if match.kind == "mismatch":
            return ImportPromptError(
                "self_name_mismatch", "This statement is in a different name", sid,
                {"entered_name": self_member.name, "statement_name": _statement_name(parse_result)},
            )
        if match.kind == "ambiguous":
            return ImportPromptError(
                "which_is_self", "Which one is you?", sid,
                {"candidates": [
                    {"person_key": p.key, "name": p.name, "pan_masked": p.pan_masked}
                    for p in people if p.key in match.candidate_keys
                ]},
            )
    return None


def _record_claim(session: dict[str, Any], member_id: uuid.UUID, pan: str) -> None:
    if (member_id, pan) not in session["pending_claims"]:
        session["pending_claims"].append((member_id, pan))


def _release_session_claims(db: Session, session: dict[str, Any]) -> None:
    """Undo every pending claim a session made: switched members get their
    old PAN back (F6), everyone else's pending claim is released."""
    if "pending_claims" not in session:
        # Session from build_import_preview alone (no people layer).
        member_id = session.get("household_member_id")
        member = db.get(HouseholdMember, member_id) if member_id else None
        if member is not None:
            release_pending_pan_claim(member, session["parse_result"].investor.pan)
        return
    restore = session.get("pan_restore", {})
    # Newest first, so a member switched twice ends on its original PAN.
    for member_id, pan in reversed(session["pending_claims"]):
        member = db.get(HouseholdMember, member_id)
        if member is None:
            continue
        if member_id in restore:
            restore_pan_snapshot(db, member, pan, restore[member_id])
        else:
            release_pending_pan_claim(member, pan)
    db.flush()


def _drop_session(db: Session, session_id: str) -> None:
    with _sessions_lock:
        session = _preview_sessions.pop(session_id, None)
    if session is not None:
        _release_session_claims(db, session)


def _advance(db: Session, session_id: str) -> ImportPreviewResponse:
    """Raises the next open prompt, or makes the pending claims and returns
    the preview. Flushes only; the caller commits on every outcome."""
    session = _preview_sessions[session_id]
    session["ready"] = False
    prompt = next_prompt(db, session)
    if prompt is not None:
        if prompt.session_id is None:
            _drop_session(db, session_id)
        raise prompt

    user_id = session["user_id"]
    self_member = _self_member(db, user_id)
    me_key = _me_key(session, self_member)
    target_key = session.get("target_person_key")
    try:
        # Only now, with no prompt left, is Me's PAN claimed (pending).
        if me_key and _is_first_upload(self_member):
            me = _person(session, me_key)
            if me.pan:
                claim_pan_for_member(db, self_member, me.pan, pending=True)
                _record_claim(session, self_member.id, me.pan)
        if target_key and target_key != me_key:
            target = db.get(HouseholdMember, session["household_member_id"])
            person = _person(session, target_key)
            if person.pan and target.pan_lookup_hash is None:
                # M found by name and had no PAN yet: today's upload-time claim.
                claim_pan_for_member(db, target, person.pan, pending=True)
                _record_claim(session, target.id, person.pan)
    except PanConflictError:
        # F30: keeps today's behaviour -- 409 with the session dropped.
        _drop_session(db, session_id)
        raise

    plans = plan_people(db, user_id, _people(session), me_key)
    if target_key and target_key != me_key:
        target = db.get(HouseholdMember, session["household_member_id"])
        person = _person(session, target_key)
        for i, plan in enumerate(plans):
            # The upload's own target wins over a 5A exact-name attach elsewhere:
            # the user said whose data this is (final-review I-1).
            if plan.person_key == target_key and (plan.member_id is None or plan.matched_by_name):
                # Name-only person matched to the upload's target member.
                plans[i] = PersonPlan(
                    target_key, "existing_member", target.id,
                    target.name if person.needs_name else person.name,
                    "none" if person.needs_name else plan_name_update(target.name, person.name),
                    target.name, None,
                )
    linked: dict[str, uuid.UUID] = session.setdefault("same_person_linked", {})
    for i, plan in enumerate(plans):
        member = db.get(HouseholdMember, linked[plan.person_key]) if plan.person_key in linked else None
        if member is not None and plan.member_id is None:
            # Staging-QA fix 5B: "Yes, same person" for a name-only member.
            person = _person(session, plan.person_key)
            plans[i] = PersonPlan(
                plan.person_key, "existing_member", member.id,
                person.name, plan_member_name_update(member, person.name), member.name, None,
            )
    session["me_key"] = me_key
    session["people_plan"] = plans
    session["ready"] = True
    return _preview_response(db, session)


def _preview_response(db: Session, session: dict[str, Any]) -> ImportPreviewResponse:
    base: ImportPreviewResponse = session["base_preview"]
    parse_result: ParseResult = session["parse_result"]
    key_to_temp = session["key_to_temp"]
    plans: list[PersonPlan] = session["people_plan"]
    people = {p.key: p for p in parse_result.people}
    first_upload = _is_first_upload(_self_member(db, session["user_id"]))
    declined: set[str] = session["same_person_declined"]

    def temp_id(s) -> str:
        return key_to_temp[(s.folio, s.amc, s.name)]

    previews: list[PersonPreview] = []
    notices: list[NameNotice] = []
    same_prompts: list[SamePersonPrompt] = []
    # Me first, then statement order.
    for plan in sorted(plans, key=lambda pl: pl.status != "me"):
        person = people[plan.person_key]
        schemes = [s for s in parse_result.schemes if s.person_key == person.key]
        by_name = set(person.matched_by_name)
        previews.append(PersonPreview(
            person_key=person.key, name=plan.name, name_source=person.name_source,
            needs_name=person.needs_name and plan.member_id is None,
            pan_masked=person.pan_masked, is_me=plan.status == "me", status=plan.status,
            member_id=str(plan.member_id) if plan.member_id else None,
            fund_count=len(schemes),
            unresolved_count=sum(1 for s in schemes if s.plan_type == "unclassified"),
            matched_by_name_temp_ids=[
                temp_id(s) for s in schemes
                if plan.matched_by_name or (s.amc, folio_key(s.folio)) in by_name
            ],
        ))
        if plan.name_update in ("update", "ask"):
            notices.append(NameNotice(
                person_key=person.key, member_id=str(plan.member_id) if plan.member_id else None,
                current_name=plan.current_name or "", statement_name=person.name, kind=plan.name_update,
                first_upload=plan.status == "me" and first_upload,
            ))
        if plan.same_person_member_id and person.key not in declined:
            member = db.get(HouseholdMember, plan.same_person_member_id)
            name_only = has_no_pan(member)
            same_prompts.append(SamePersonPrompt(
                person_key=person.key, member_id=str(member.id), member_name=member.name,
                entered_pan_masked="" if name_only else (_masked_member_pan(member) or ""),
                statement_pan_masked=person.pan_masked or "",
                kind="name_only" if name_only else "typed_pan",
                member_fund_count=db.query(Folio).filter(Folio.household_member_id == member.id).count(),
                statement_name=person.name,
            ))
    return base.model_copy(update={
        "people": previews,
        "unassigned_temp_ids": [temp_id(s) for s in parse_result.schemes if s.person_key is None],
        "name_notices": notices,
        "same_person_prompts": same_prompts,
    })


# ---------------------------------------------------------------------------
# Resolve endpoints (Task 7). Sync on purpose (F31): they commit, and FastAPI
# runs plain `def` routes in its threadpool, off the event loop.
# Each answers the prompt currently open and returns _finish's outcome: the
# preview (200) or the next prompt (ImportPromptError -> 409). A request for
# a prompt that isn't the open one changes nothing and returns that outcome.
# ---------------------------------------------------------------------------


def _session_lock(session_id: str) -> threading.Lock | None:
    with _sessions_lock:
        session = _preview_sessions.get(session_id)
        if session is None:
            return None
        return session.setdefault("lock", threading.Lock())


def _serialised(fn):
    """Runs a resolve/discard request under its session's lock, so a
    double-press runs one after the other: the second then finds its prompt
    already answered and just returns the outcome (e.g. one U2 rename logged,
    not two). An unknown session runs unlocked and 410s as before."""

    @functools.wraps(fn)
    def wrapper(db: Session, session_id: str, *args, **kwargs):
        lock = _session_lock(session_id)
        if lock is None:
            return fn(db, session_id, *args, **kwargs)
        with lock:
            return fn(db, session_id, *args, **kwargs)

    return wrapper


def _live_session(db: Session, session_id: str, user_id: uuid.UUID) -> dict[str, Any]:
    if _sweep_expired_sessions(db=db):
        db.commit()
    session = _preview_sessions.get(session_id)
    # Another user's id gets the same 410 as an unknown one: no existence leak.
    if session is None or session.get("user_id") != user_id or "resolved_codes" not in session:
        raise SessionExpiredError(SESSION_EXPIRED_MESSAGE)
    if _is_session_expired(session):
        # The sweep above skips a session whose lock is held -- ours, here.
        _drop_session(db, session_id)
        db.commit()
        raise SessionExpiredError(SESSION_EXPIRED_MESSAGE)
    return session


def _finish(db: Session, session_id: str) -> ImportPreviewResponse:
    try:
        response = _advance(db, session_id)
    except (ImportPromptError, PanConflictError):
        db.commit()  # keeps what the resolve step wrote (e.g. a U2 rename)
        raise
    db.commit()
    return response


def _switch_or_u12(db: Session, session: dict[str, Any], member: HouseholdMember, person: ParsedPerson) -> None:
    """U4 / U13 "use the statement's PAN". U12 on another account, member
    untouched (I15); otherwise the old PAN is kept in the session (F6)."""
    try:
        snapshot = switch_pan_claim(db, member, person.pan, pending=True)
    except CrossAccountPanBlockedError as exc:
        raise ImportPromptError(
            "statement_pan_on_other_account", f"We can’t switch {member.name} to this PAN", session["session_id"],
            {
                "member_name": member.name,
                "entered_pan_masked": _masked_member_pan(member),
                "statement_pan_masked": person.pan_masked,
            },
        ) from exc
    # Keep the earliest snapshot: that is the PAN the member had before this review.
    session["pan_restore"].setdefault(member.id, snapshot)
    _record_claim(session, member.id, person.pan)


@_serialised
def resolve_name(db: Session, session_id: str, user_id: uuid.UUID, name: str | None = None) -> ImportPreviewResponse:
    """U2: self is renamed right away to the statement's name (spec S2), then
    the queue continues. `name` is accepted from old clients and ignored."""
    session = _live_session(db, session_id, user_id)
    current = next_prompt(db, session)
    if current is None or current.code != "self_name_mismatch":
        return _finish(db, session_id)
    # 2026-10-01 rule (names come from the CAS): U2 is now "Is that you? Yes",
    # so the statement name is always used and any typed name is ignored.
    clean = validate_person_name(current.details["statement_name"])
    self_member = _self_member(db, user_id)
    now = datetime.now(timezone.utc)
    db.add(HouseholdMemberNameChange(
        id=uuid.uuid4(), household_member_id=self_member.id, old_name=self_member.name, new_name=clean,
        reason=NameChangeReason.USER_CORRECTED_TO_CAS, changed_at=now,
    ))
    self_member.name = clean
    self_member.name_source = MemberNameSource.CAS
    self_member.name_updated_at = now
    # A new name may match two people again: offer U3 afresh.
    session["u3_declined"] = False
    session["me_choice"] = None
    db.flush()
    return _finish(db, session_id)


@_serialised
def resolve_self(db: Session, session_id: str, user_id: uuid.UUID, person_key: str | None) -> ImportPreviewResponse:
    """U3: the picked person becomes Me; None ("None of these") goes to U2."""
    session = _live_session(db, session_id, user_id)
    current = next_prompt(db, session)
    if current is None or current.code != "which_is_self":
        return _finish(db, session_id)
    if person_key is None:
        session["u3_declined"] = True
        return _finish(db, session_id)
    if person_key not in {c["person_key"] for c in current.details["candidates"]}:
        raise InvalidResolveChoiceError("Pick one of the people shown.")
    session["me_choice"] = person_key
    return _finish(db, session_id)


@_serialised
def resolve_pan(db: Session, session_id: str, user_id: uuid.UUID) -> ImportPreviewResponse:
    """U4 "The one on this statement" (the only choice that reaches the
    server; "The one I entered" is a discard)."""
    session = _live_session(db, session_id, user_id)
    current = next_prompt(db, session)
    if current is None or current.code != "member_pan_mismatch":
        return _finish(db, session_id)
    target = db.get(HouseholdMember, session["household_member_id"])
    try:
        _switch_or_u12(db, session, target, _person(session, session["target_mismatch_key"]))
    except (ImportPromptError, PanConflictError):
        db.commit()
        raise
    return _finish(db, session_id)


@_serialised
def resolve_same_person(
    db: Session, session_id: str, user_id: uuid.UUID, person_key: str, member_id: str, same: bool
) -> ImportPreviewResponse:
    """U13 (typed PAN): same=True switches the member to the statement PAN
    (U4, U12 on conflict). Name-only member (staging-QA 5B): same=True links
    the person to them; the PAN is saved at Confirm (store_detected_pan),
    never reserved here. same=False leaves them new."""
    session = _live_session(db, session_id, user_id)
    if not session.get("ready"):
        return _finish(db, session_id)  # an earlier prompt is still open
    plan = next(
        (
            pl for pl in session["people_plan"]
            if pl.person_key == person_key
            and pl.same_person_member_id is not None
            and str(pl.same_person_member_id) == member_id
            and person_key not in session["same_person_declined"]
        ),
        None,
    )
    if plan is None:
        raise InvalidResolveChoiceError("That person isn’t waiting for this question.")
    if not same:
        session["same_person_declined"].add(person_key)
        return _finish(db, session_id)
    member = db.get(HouseholdMember, plan.same_person_member_id)
    if has_no_pan(member):
        # 5B: linked now, PAN saved at confirm (store_detected_pan), never
        # reserved at upload -- the same rule for every non-Self member.
        session.setdefault("same_person_linked", {})[person_key] = member.id
        return _finish(db, session_id)
    try:
        _switch_or_u12(db, session, member, _person(session, person_key))
    except (ImportPromptError, PanConflictError):
        db.commit()
        raise
    return _finish(db, session_id)


@_serialised
def acknowledge_prompt(db: Session, session_id: str, user_id: uuid.UUID, code: str) -> ImportPreviewResponse:
    """U5 "Import for these people" and U7 "Include in family total"."""
    session = _live_session(db, session_id, user_id)
    current = next_prompt(db, session)
    if current is not None and current.code == code:
        session["resolved_codes"].add(code)
    return _finish(db, session_id)


# ---------------------------------------------------------------------------
# Confirm imports (Task 9): the multi-person confirm lives in confirm_people.py;
# the session store it needs is claimed and returned through these two helpers.
# ---------------------------------------------------------------------------


def claim_session_for_confirm(
    db: Session, session_id: str, user_id: uuid.UUID, household_member_id: uuid.UUID | None = None
) -> tuple[dict[str, Any], threading.Lock]:
    """F5: takes the session out of the store for one confirm. The session's
    lock is taken without waiting and the session popped, so a double-press
    (or a confirm racing a resolve) gets SessionExpiredError (410) instead of
    a second set of members and imports. The caller must hand it back with
    return_confirmed_session -- re-inserted on failure (C1 "Try again"),
    dropped after commit."""
    if _sweep_expired_sessions(db=db):
        db.commit()
    lock = _session_lock(session_id)
    if lock is None or not lock.acquire(blocking=False):
        raise SessionExpiredError(SESSION_EXPIRED_MESSAGE)
    try:
        session = _preview_sessions.get(session_id)
        if (
            session is None
            or session.get("user_id") not in (None, user_id)
            or (
                household_member_id is not None
                and session.get("household_member_id") not in (None, household_member_id)
            )
        ):
            # Another user's id gets the same 410 as an unknown one.
            raise SessionExpiredError(SESSION_EXPIRED_MESSAGE)
        if _is_session_expired(session):
            _drop_session(db, session_id)
            db.commit()
            raise SessionExpiredError(SESSION_EXPIRED_MESSAGE)
        if "resolved_codes" in session and not session.get("ready"):
            # A prompt is still open (a 409 kept this session): confirming now
            # would skip it. Re-raises that prompt instead.
            try:
                _advance(db, session_id)
            except (ImportPromptError, PanConflictError):
                db.commit()
                raise
        with _sessions_lock:
            _preview_sessions.pop(session_id, None)
    except BaseException:
        lock.release()
        raise
    return session, lock


def return_confirmed_session(
    session_id: str, session: dict[str, Any], lock: threading.Lock, *, keep: bool
) -> None:
    """Ends a claim_session_for_confirm: keep=True puts the session back
    (the confirm failed and rolled back, so the review can be confirmed again)."""
    try:
        if keep:
            with _sessions_lock:
                _preview_sessions.setdefault(session_id, session)
    finally:
        lock.release()


def confirm_import(
    db: Session,
    session_id: str,
    household_member_id: uuid.UUID,
    scheme_confirmations: list[SchemeConfirmation],
    user_id: uuid.UUID,
) -> ImportConfirmResponse:
    """The old single-member confirm body (F12): maps to the file's only
    person, and is 422 confirm_invalid when the file has more than one.
    Thin adapter over confirm_people.confirm_single_member_import."""
    # Function-level import: confirm_people imports this module.
    from app.services.import_.confirm_people import confirm_single_member_import

    return confirm_single_member_import(db, session_id, user_id, household_member_id, scheme_confirmations)


@_serialised
def discard_import_session(db: Session, session_id: str, user_id: uuid.UUID) -> None:
    """Abandons a preview session on purpose (Back / reset / Cancel, and
    every "Upload a different file") and releases all its pending PAN claims.
    Idempotent; never touches another user's session."""
    swept = _sweep_expired_sessions(db=db)
    with _sessions_lock:
        session = _preview_sessions.get(session_id)
        if session is not None and session.get("user_id") == user_id:
            del _preview_sessions[session_id]
        else:
            session = None
    if session is None:
        if swept:
            db.commit()
        return
    # Releases every pending claim and restores switched PANs (F6).
    _release_session_claims(db, session)
    db.commit()
