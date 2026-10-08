"""Confirm imports for every person in a statement, in one transaction (Task 9).

Spec Part 5 + "End-to-end flow with every database write": pending PAN claims
become permanent, a cas_detected household_members row is created per new person,
and one imports row per included person is written under a shared
upload_group_id and one stored CAS file. Any failure rolls everything back
and puts the review session back, so Confirm imports can be pressed again
(C1 "No half-imported family").

Raw PANs are read from the RAM session only to re-classify people and to
store them. New detected members get their PAN at confirm in pan_encrypted /
pan_lookup_hash (store_detected_pan), like Self's; only a PAN another account
holds goes to detected_pan_* with pan_conflict. They never reach a response,
a log line or raw_parser_output.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, Literal

from sqlalchemy.orm import Session

from app.models.enums import (
    MemberNameSource,
    MemberOrigin,
    MemberPanSource,
    NameChangeReason,
    PlanNameVariant,
    PlanType,
    SchemeSource, SchemePlanType,
    SourceCasType,
    CostSource,
    TransactionOrigin,
    TransactionType,
)
from app.models.folio import Folio, normalise_folio_key
from app.models.imports import Import, ImportStatus
from app.models.member_history import HouseholdMemberNameChange
from app.models.reference import NavHistory, Scheme
from app.models.transaction import Transaction
from app.models.transaction_import import TransactionImport
from app.models.user import HouseholdMember
from app.services.dashboard.holdings import invalidate_holdings_cache
from app.services.dashboard.snapshots import invalidate_member_snapshots
from app.services.import_ import preview_store
from app.services.import_.lifecycle_service import SessionExpiredError
from app.services.import_.crypto import hash_pan
from app.services.import_.identify import Identification, classify_plan
from app.services.import_ import file_storage
from app.services.import_.name_match import NameNotEditableError, normalise_name, validate_person_name
from app.services.import_.pan_claims import (
    PanBelongsToOtherMemberError,
    classify_detected_pan,
    confirm_pan_claim,
    store_detected_pan,
)
from app.services.import_.parser import (
    NormalizedTransaction,
    ParsedScheme,
    ParseResult,
    source_cas_type_from_file_type,
    SchemeKey,
    scheme_key,
)
from app.services.import_.opening_balance import OpeningLot
from app.services.import_.people import ParsedPerson, folio_key
from app.services.import_.people_resolution import (
    PersonPlan,
    find_member_by_exact_name,
    has_no_pan,
    plan_member_name_update,
)
from app.services.import_.schemas import (
    ImportConfirmResponse,
    PersonConfirmation,
    PersonConfirmResult,
    SchemeConfirmation,
    SchemeMatchPreview,
)
from app.services.import_.service import (
    SESSION_EXPIRED_MESSAGE,
    CONFIDENCE_THRESHOLD,
    SchemeConfidenceError,
    claim_session_for_confirm,
    return_confirmed_session,
)

# Review finding: classify_plan_from_name (parser.py) is a loose substring
# match on the whole scheme name -- fine as FR-5's best-effort primary
# signal, but not reliable enough to hard-veto a plan_type_override on its
# own (a base name that merely contains the word "Direct"/"Regular" outside
# of the standard SEBI-mandated designator would otherwise block a
# legitimate correction). The 409 backstop below only fires when the name
# also contains the actual "Direct Plan"/"Regular Plan" phrase.
logger = logging.getLogger(__name__)

_PLAN_DESIGNATOR_RE = re.compile(r"\b(DIRECT|REGULAR)\s+PLAN\b")



class AlreadyImportedError(Exception):
    """Every row of this statement is already saved for the same people (#22)."""
    code = "already_imported"
    message = "This statement was already imported."


class ConfirmInvalidError(Exception):
    """A confirm request that doesn't fit its review (422 confirm_invalid).
    Not a ValueError on purpose: the route maps ValueError to 404."""

    code = "confirm_invalid"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


@dataclass
class _PersonWork:
    """One included person (or, for a pre-people-detection session, the
    upload's target) and the funds that land on them."""

    person_key: str | None
    person: ParsedPerson | None
    plan: PersonPlan | None
    conf: PersonConfirmation
    member_id: uuid.UUID | None  # None -> a new detected member is created
    scheme_keys: list[SchemeKey] = field(default_factory=list)


# ------------------------------------------------------------- entry points


def confirm_people_import(
    db: Session,
    session_id: str,
    user_id: uuid.UUID,
    people: list[PersonConfirmation],
    moved_funds: dict[str, str] | None = None,
) -> ImportConfirmResponse:
    """Confirm imports with the people body. `moved_funds` maps temp_id ->
    person_key (F16: "Move to…" and U10 owner picks)."""

    def to_people(session: dict[str, Any]) -> tuple[list[PersonConfirmation], dict[str, str]]:
        if "people_plan" not in session:
            raise ConfirmInvalidError("This review has no people to confirm.")
        return people, moved_funds or {}

    return _confirm(db, session_id, user_id, to_people)


def confirm_single_member_import(
    db: Session,
    session_id: str,
    user_id: uuid.UUID,
    household_member_id: uuid.UUID,
    scheme_confirmations: list[SchemeConfirmation],
) -> ImportConfirmResponse:
    """The old single-member body (F12): the file's only person, Me or not."""

    def to_people(session: dict[str, Any]) -> tuple[list[PersonConfirmation], dict[str, str]] | None:
        if "people_plan" not in session:
            return None  # built by build_import_preview alone: no people layer
        people = session["parse_result"].people
        if len(people) != 1:
            raise ConfirmInvalidError("This statement has more than one person. Review each person to import it.")
        return [PersonConfirmation(person_key=people[0].key, scheme_confirmations=scheme_confirmations)], {}

    return _confirm(
        db, session_id, user_id, to_people,
        household_member_id=household_member_id, legacy_confirmations=scheme_confirmations,
    )


def _confirm(
    db: Session,
    session_id: str,
    user_id: uuid.UUID,
    to_request: Callable[[dict[str, Any]], tuple[list[PersonConfirmation], dict[str, str]] | None],
    *,
    household_member_id: uuid.UUID | None = None,
    legacy_confirmations: list[SchemeConfirmation] | None = None,
) -> ImportConfirmResponse:
    session, lock = claim_session_for_confirm(db, session_id, user_id, household_member_id)
    # Filled once the group file is stored, so a failure after that point
    # (typically the commit itself) can delete it: no Import row will ever
    # reference it, and each retry stores under a new upload_group_id.
    stored: dict[str, str] = {}
    try:
        response, touched = _confirm_claimed(
            db, session, user_id, to_request, household_member_id, legacy_confirmations or [], stored
        )
    except AlreadyImportedError:
        from app.services.import_.service import _release_session_claims

        try:
            db.rollback()
            _release_session_claims(db, session)
            preview_store.delete(db, session_id)
            db.commit()
        finally:
            return_confirmed_session(session_id, session, lock, keep=False)
        raise
    except BaseException:
        # C1: nothing half-written, and the review can be confirmed again.
        if "committed" in stored:
            # Failed after the commit (building the response): the data and
            # file are saved, so the session is spent, not retryable.
            return_confirmed_session(session_id, session, lock, keep=False)
            raise
        db.rollback()
        if "reference" in stored:
            _delete_orphaned_file(stored["reference"])
        return_confirmed_session(session_id, session, lock, keep=True)
        raise
    # Committed: the session is gone for good (a second press is 410).
    return_confirmed_session(session_id, session, lock, keep=False)
    for member_id in touched:
        invalidate_holdings_cache(member_id)
    return response


def _delete_orphaned_file(reference: str) -> None:
    # Best effort: the confirm's own error is the one to surface.
    try:
        file_storage.default_file_storage.delete(reference)
    except Exception:
        logger.exception("Could not delete stored CAS file %s after a failed confirm", reference)


# ------------------------------------------------------------ the transaction


def _confirm_claimed(
    db: Session,
    session: dict[str, Any],
    user_id: uuid.UUID,
    to_request: Callable[[dict[str, Any]], tuple[list[PersonConfirmation], dict[str, str]] | None],
    household_member_id: uuid.UUID | None,
    legacy_confirmations: list[SchemeConfirmation],
    stored: dict[str, str],
) -> tuple[ImportConfirmResponse, list[uuid.UUID]]:
    parse_result: ParseResult = session["parse_result"]
    previews: dict[str, SchemeMatchPreview] = session["scheme_previews"]
    key_to_temp: dict[SchemeKey, str] = session["key_to_temp"]
    target_member_id = session.get("household_member_id") or household_member_id

    # 1. Read-only: validate the request and decide who gets what.
    request = to_request(session)
    if request is None:
        works = [_PersonWork(
            None, None, None, PersonConfirmation(person_key="", scheme_confirmations=legacy_confirmations),
            target_member_id, scheme_keys=[s.key for s in parse_result.schemes],
        )]
    else:
        people, moved_funds = request
        works = _plan_works(db, session, user_id, people, moved_funds)

    overrides = {c.temp_id: c for w in works for c in w.conf.scheme_confirmations}
    txns_of = _transactions_by_scheme(parse_result.transactions)
    included_txns = [t for w in works for k in w.scheme_keys for t in txns_of.get(k, [])]
    parsed_scheme_by_key = {s.key: s for s in parse_result.schemes}
    _validate_schemes(included_txns, previews, key_to_temp, overrides, parsed_scheme_by_key, db=db, identifications=session.get("identifications", {}))

    _reject_changed_pans(db, works)

    if all(w.member_id is not None for w in works) and _all_rows_exist(db, works, txns_of, previews, key_to_temp, overrides,
            session.get("opening_lots", {}), parse_result.statement_from,
            identifications=session.get("identifications", {}), parsed_schemes=parsed_scheme_by_key):
        raise AlreadyImportedError()

    # 2. F14: every PAN claim is made permanent before any other write --
    # confirm_pan_claim's lost-race path does a full db.rollback().
    _finalise_pan_claims(db, session, target_member_id)
    # A lost PAN race can roll back the initial claim. Reclaim before writes;
    # PostgreSQL waits for an intervening worker, then sees its delete/rollback.
    claimed = db.query(Import).filter(
        Import.id == uuid.UUID(session["session_id"]),
        Import.status.in_((ImportStatus.PREVIEWING, ImportStatus.PROCESSING)),
    ).update({Import.status:ImportStatus.PROCESSING}, synchronize_session=False)
    if claimed != 1:
        raise SessionExpiredError(SESSION_EXPIRED_MESSAGE)

    # 3. Writes.
    now = datetime.now(timezone.utc)
    upload_group_id = uuid.uuid4()
    source_cas_type = _map_source_cas_type(parse_result.file_type)
    results: list[PersonConfirmResult] = []
    imports: list[Import] = []
    me_import_id: str | None = None
    match_warnings: list[str] = []
    for work in works:
        member, created = _member_for(db, work, user_id, now)
        if not created and work.person is not None and work.person.pan:
            pan_hash = hash_pan(work.person.pan)
            if has_no_pan(member):
                # Staging-QA fix 5B: a name-only member the user said is this
                # statement's person. Their PAN is saved now, at confirm, the
                # same way as a new detected member's (decision A).
                try:
                    store_detected_pan(db, member, work.person.pan, now=now)
                except PanBelongsToOtherMemberError:
                    raise ConfirmInvalidError(
                        f"{member.name} changed during this review. Upload the statement again."
                    ) from None
            # A pan_conflict member (PAN in detected_pan_hash) is not re-claimed
            # here: refresh_pan_conflicts promotes it once the other account
            # releases the PAN.
            elif pan_hash not in (member.pan_lookup_hash, member.detected_pan_hash):
                # Another tab's confirm gave this member a different PAN after
                # this review was built (final-review M-1).
                raise ConfirmInvalidError(f"{member.name} changed during this review. Upload the statement again.")
        import_rec = Import(
            id=uuid.uuid4(), household_member_id=member.id, status=ImportStatus.CONFIRMED,
            source_cas_type=source_cas_type,
            raw_parser_output=_person_raw_output(parse_result.raw_json, set(work.scheme_keys)),
            uploaded_at=now, confirmed_at=now, upload_group_id=upload_group_id,
            statement_from_date=parse_result.statement_from, statement_to_date=parse_result.statement_to,
        )
        db.add(import_rec)
        db.flush()
        if created:
            # Circular FK: the member row had to exist before its import.
            member.detected_from_import_id = import_rec.id
        else:
            _apply_name_choice(db, member, work, import_rec, now)
        schemes = [parsed_scheme_by_key[k] for k in work.scheme_keys]
        txns = [t for k in work.scheme_keys for t in txns_of.get(k, [])]
        added, skipped = _write_person_rows(
            db, member, import_rec, schemes, txns, overrides, previews=previews, key_to_temp=key_to_temp,
            opening_lots=session.get("opening_lots", {}), statement_from=parse_result.statement_from,
            match_warnings=match_warnings, identifications=session.get("identifications", {}),
        )
        import_rec.new_transactions_count = added
        import_rec.duplicate_transactions_count = skipped
        imports.append(import_rec)
        results.append(PersonConfirmResult(
            person_key=work.person_key or "", member_id=str(member.id), name=member.name,
            import_id=str(import_rec.id), added=added, skipped=skipped,
        ))
        if work.plan is None or work.plan.status == "me":
            me_import_id = str(import_rec.id)

    # Read at call time (not a default argument) so the storage backend in
    # use -- and a test's fake -- is the one the orphan cleanup deletes from.
    stored["reference"] = file_storage.store_group_cas_file(
        imports, user_id, upload_group_id, session["pdf_bytes"], storage=file_storage.default_file_storage,
    )
    preview_store.delete(db, session["session_id"])
    invalidate_member_snapshots(db, [uuid.UUID(r.member_id) for r in results])
    db.commit()
    # Committed Import rows now reference the file: from here on nothing may
    # delete it, and the review must not be put back for another confirm.
    stored.pop("reference", None)
    stored["committed"] = "1"

    response = ImportConfirmResponse(
        added=sum(r.added for r in results),
        skipped=sum(r.skipped for r in results),
        import_id=me_import_id or results[0].import_id,
        people=results,
        upload_group_id=str(upload_group_id),
        warnings=[w for w in parse_result.parse_warnings if "stamp" not in w.lower() and "stt" not in w.lower()]
        + match_warnings,
    )
    touched = list(dict.fromkeys(uuid.UUID(r.member_id) for r in results))
    return response, touched


# ---------------------------------------------------------- request -> works


def _plan_works(
    db: Session,
    session: dict[str, Any],
    user_id: uuid.UUID,
    people: list[PersonConfirmation],
    moved_funds: dict[str, str],
) -> list[_PersonWork]:
    parse_result: ParseResult = session["parse_result"]
    plans: dict[str, PersonPlan] = {pl.person_key: pl for pl in session["people_plan"]}
    persons: dict[str, ParsedPerson] = {p.key: p for p in parse_result.people}
    key_to_temp: dict[SchemeKey, str] = session["key_to_temp"]

    confs: dict[str, PersonConfirmation] = {}
    for conf in people:
        if conf.person_key not in plans or conf.person_key in confs:
            raise ConfirmInvalidError("That person isn’t in this review.")
        confs[conf.person_key] = conf

    # Me first, then statement order (the ribbon order).
    ordered = sorted(parse_result.people, key=lambda p: plans[p.key].status != "me")
    included: dict[str, PersonConfirmation] = {}
    for person in ordered:
        plan = plans[person.key]
        # An unlisted person is imported, except one on another account:
        # spec option A (exclude) is the default for them (U8).
        conf = confs.get(person.key) or PersonConfirmation(
            person_key=person.key, include=plan.status != "other_account"
        )
        if not conf.include:
            if plan.status != "other_account":
                # Only U8's "Leave it" drops a person; anything else would be
                # a half-imported family.
                raise ConfirmInvalidError("Only a person on another Unifolio account can be left out.")
            continue
        included[person.key] = conf

    owners = _fund_owners(session, persons, included, moved_funds)

    works: list[_PersonWork] = []
    emptied: list[tuple[ParsedPerson, PersonPlan, PersonConfirmation]] = []
    for key, conf in included.items():
        person, plan = persons[key], plans[key]
        scheme_keys = [
            s.key for s in parse_result.schemes
            if owners.get(key_to_temp[s.key]) == key
        ]
        if not scheme_keys:
            if plan.member_id is None:
                continue  # every fund moved away: no empty detected person
            # An existing member with nothing left would get a 0-transaction
            # Import in their history; keep it only if nothing else is imported.
            emptied.append((person, plan, conf))
            continue
        works.append(_resolve_member(db, user_id, person, plan, conf, scheme_keys))
    if not works:
        works = [_resolve_member(db, user_id, person, plan, conf, []) for person, plan, conf in emptied]
    if not works:
        raise ConfirmInvalidError("There is nothing to import.")
    return works


def _fund_owners(
    session: dict[str, Any],
    persons: dict[str, ParsedPerson],
    included: dict[str, PersonConfirmation],
    moved_funds: dict[str, str],
) -> dict[str, str | None]:
    """temp_id -> the person_key its fund lands on (None: not imported)."""
    parse_result: ParseResult = session["parse_result"]
    key_to_temp: dict[SchemeKey, str] = session["key_to_temp"]
    scheme_of = {key_to_temp[s.key]: s for s in parse_result.schemes}
    plans_by_key: dict[str, PersonPlan] = {pl.person_key: pl for pl in session["people_plan"]}

    for temp_id, target in moved_funds.items():
        scheme = scheme_of.get(temp_id)
        if scheme is None or target not in included:
            raise ConfirmInvalidError("A fund was moved to someone who isn’t in this import.")
        # Only a fund placed by name (M4) or not placed at all (U10) can be
        # moved: a PAN identifies its owner.
        movable = scheme.person_key is None or (
            (scheme.amc, folio_key(scheme.folio)) in set(persons[scheme.person_key].matched_by_name)
            # Staging-QA 5A: a whole person attached by exact name.
            or plans_by_key[scheme.person_key].matched_by_name
        )
        if not movable:
            raise ConfirmInvalidError("Only funds matched by name can be moved.")

    # U10: an unmatched fund's owner picker defaults to Me.
    me_key = session.get("me_key")
    target_key = session.get("target_person_key")
    default_owner = next(
        (k for k in (me_key, target_key) if k is not None and k in included),
        next(iter(included)) if len(included) == 1 else None,
    )
    owners: dict[str, str | None] = {}
    for temp_id, scheme in scheme_of.items():
        owner = moved_funds.get(temp_id) or scheme.person_key or default_owner
        if owner is None:
            raise ConfirmInvalidError("Choose who owns every fund we couldn’t match.")
        owners[temp_id] = owner if owner in included else None
    return owners


def _resolve_member(
    db: Session,
    user_id: uuid.UUID,
    person: ParsedPerson,
    plan: PersonPlan,
    conf: PersonConfirmation,
    scheme_keys: list[SchemeKey],
) -> _PersonWork:
    """Review Focus 2: every person the plan would create is re-classified
    now, so a person another tab's confirm already created is attached, not
    duplicated."""
    if conf.name is not None:
        validate_person_name(conf.name)  # 422 invalid_name before any write
    member_id = plan.member_id
    if member_id is not None and db.get(HouseholdMember, member_id) is None:
        member_id = None  # deleted during the review: re-classify below
    if member_id is None:
        if person.pan:
            status, found = classify_detected_pan(db, user_id, person.pan)
            if status == "existing_member":
                # A PAN or detected-hash (pan-conflict) hit attaches.
                member_id = found
            elif status == "other_account":
                if plan.status != "other_account":
                    # Claimed elsewhere after the review was built: the user
                    # was never offered U8 for them.
                    raise ConfirmInvalidError(
                        f"{plan.name} is now on another Unifolio account. Upload the statement again."
                    )
        if member_id is None and not person.pan and not person.needs_name:
            # Staging-QA 5A, same rule as plan_people: a same-named member
            # created by another tab's confirm is attached, not duplicated.
            members = db.query(HouseholdMember).filter(HouseholdMember.user_id == user_id).all()
            named = find_member_by_exact_name(members, person.name)
            if named is not None:
                member_id = named.id
        if member_id is None and person.needs_name and not conf.name:
            raise ConfirmInvalidError("Add a name for everyone before importing.")
    return _PersonWork(person.key, person, plan, conf, member_id, scheme_keys)


# ------------------------------------------------------------------ claims


def _finalise_pan_claims(db: Session, session: dict[str, Any], target_member_id: uuid.UUID | None) -> None:
    claims: list[tuple[uuid.UUID, str]] | None = session.get("pending_claims")
    if claims is None:
        # Session from build_import_preview alone (no people layer).
        member = db.get(HouseholdMember, target_member_id) if target_member_id else None
        if member is not None:
            confirm_pan_claim(db, member, session["parse_result"].investor.pan)
        return
    verified_at = datetime.now(timezone.utc)
    # confirm_pan_claim can roll back the whole transaction (its lost-race
    # path), which also silently drops claims finalised earlier in the pass.
    # It is idempotent, so repeat the pass until every claim reads back as
    # permanent (or given up, when someone else won the PAN).
    for _ in range(len(claims) + 1):
        for member_id, pan in claims:
            member = db.get(HouseholdMember, member_id)
            if member is None:
                continue
            confirm_pan_claim(db, member, pan)
            if member.pan_lookup_hash == hash_pan(pan):
                member.pan_source = MemberPanSource.CAS
                member.pan_verified_at = verified_at
        db.flush()
        if all(_claim_settled(db, member_id, pan) for member_id, pan in claims):
            return
    # Never import with a claim left pending (it would lapse after 65 min):
    # fail, roll back, and keep the session for C1's "Try again".
    raise RuntimeError("PAN claims could not be finalised; the import was rolled back")


def _claim_settled(db: Session, member_id: uuid.UUID, pan: str) -> bool:
    member = db.get(HouseholdMember, member_id)
    if member is None or member.pan_lookup_hash != hash_pan(pan):
        return True
    return member.pan_pending_until is None and member.pan_source == MemberPanSource.CAS


# ----------------------------------------------------------------- members


def _member_for(
    db: Session, work: _PersonWork, user_id: uuid.UUID, now: datetime
) -> tuple[HouseholdMember, bool]:
    if work.member_id is not None:
        member = db.get(HouseholdMember, work.member_id)
        if member is None:
            raise ConfirmInvalidError("A household member was removed during this review.")
        return member, False
    person, conf = work.person, work.conf
    assert person is not None  # a pre-people session always has a target member
    clean = validate_person_name(conf.name) if conf.name is not None else None
    edited = clean is not None and _is_edit(clean, person.name)
    if edited and not person.needs_name:
        # 2026-10-01 rule, same as _apply_name_choice: a new person the
        # statement names keeps the CAS name; only U9 people are typed (QB).
        raise NameNotEditableError("Names come from your statement and can’t be changed.")
    member = HouseholdMember(
        id=uuid.uuid4(), user_id=user_id,
        name=clean if edited else person.name,
        relationship=None, created_at=now,
        origin=MemberOrigin.CAS_DETECTED,
        # F32: a name typed in the people popup is the user's, not the CAS's.
        name_source=MemberNameSource.USER_ENTERED if edited else MemberNameSource.CAS,
    )
    if person.pan:
        try:
            store_detected_pan(db, member, person.pan, now=now)
        except PanBelongsToOtherMemberError:
            raise ConfirmInvalidError(
                f"{person.name} changed during this review. Upload the statement again."
            ) from None
    db.add(member)
    db.flush()
    return member, True


def _apply_name_choice(
    db: Session, member: HouseholdMember, work: _PersonWork, import_rec: Import, now: datetime
) -> None:
    person, plan, conf = work.person, work.plan, work.conf
    if person is None or plan is None:
        return  # pre-people session: names untouched, as before
    if conf.name is not None:
        clean = validate_person_name(conf.name)
        # The popup pre-fills the plan's name: sending it back unchanged (even
        # re-cased) is not an edit, else I9's "keep the longer stored name"
        # is bypassed.
        if _is_edit(clean, plan.name):
            # 2026-10-01 rule: only a person the statement couldn't name (U9)
            # gets a typed name; everyone else keeps the CAS name.
            if not person.needs_name:
                raise NameNotEditableError("Names come from your statement and can’t be changed.")
            _rename(db, member, clean, NameChangeReason.USER_EDIT, MemberNameSource.USER_ENTERED, import_rec, now)
            return
    if person.needs_name:
        return
    if member.name_source == MemberNameSource.USER_ENTERED and _is_edit(person.name, member.name):
        # QB/QE: a typed name is provisional; the first statement that has a
        # readable name for this person replaces it. (Not USER_EDITED: a
        # profile-popup name follows the CAS rules via plan_member_name_update.)
        _rename(db, member, person.name, NameChangeReason.USER_CORRECTED_TO_CAS, MemberNameSource.CAS, import_rec, now)
        return
    # The plan's own verdict holds for the member it was made for (it knows
    # Me's first-upload rule, I10); a re-classified member gets a fresh one.
    kind = plan.name_update if plan.member_id == member.id else plan_member_name_update(member, person.name)
    if kind == "update":
        _rename(db, member, person.name, NameChangeReason.CAS_VARIANT, MemberNameSource.CAS, import_rec, now)
    elif kind == "ask" and conf.accept_name_update:
        _rename(db, member, person.name, NameChangeReason.USER_CORRECTED_TO_CAS, MemberNameSource.CAS, import_rec, now)


def _is_edit(typed: str, shown: str) -> bool:
    return normalise_name(typed) != normalise_name(shown)


def _rename(
    db: Session,
    member: HouseholdMember,
    new_name: str,
    reason: NameChangeReason,
    source: MemberNameSource,
    import_rec: Import,
    now: datetime,
) -> None:
    if new_name == member.name:
        return
    db.add(HouseholdMemberNameChange(
        id=uuid.uuid4(), household_member_id=member.id, old_name=member.name, new_name=new_name,
        reason=reason, import_id=import_rec.id, changed_at=now,
    ))
    member.name = new_name
    member.name_source = source
    member.name_updated_at = now


# ------------------------------------------------------ raw parser output


def _person_raw_output(raw_json: str, scheme_keys: set[SchemeKey]) -> dict[str, Any]:
    """casparser's output narrowed to this person's schemes, with every folio
    PAN nulled again (parser.py already redacts; this keeps the guarantee
    local to the one place that persists it)."""
    data = json.loads(raw_json)
    folios = data.get("folios") if isinstance(data, dict) else None
    if not isinstance(folios, list):
        return data
    kept = []
    for f in folios:
        schemes = [
            s for s in f.get("schemes", [])
            if scheme_key(f.get("folio"), f.get("amc"), s.get("isin"), s.get("scheme")) in scheme_keys
        ]
        if schemes:
            kept.append({**f, "schemes": schemes, **({"PAN": None} if "PAN" in f else {})})
    data["folios"] = kept
    return data


# ------------------------------------------------ schemes, folios, transactions


def _transactions_by_scheme(txns: list[NormalizedTransaction]) -> dict[SchemeKey, list[NormalizedTransaction]]:
    out: dict[SchemeKey, list[NormalizedTransaction]] = {}
    for t in txns:
        out.setdefault(t.key, []).append(t)
    return out


def _resolve_category(mfapi_category: str | None, cas_scheme_type: str | None) -> str:
    return mfapi_category or cas_scheme_type or "Unclassified"


def _map_source_cas_type(file_type: str) -> SourceCasType | None:
    mapped = source_cas_type_from_file_type(file_type)
    return SourceCasType(mapped) if mapped else None


def _validate_schemes(
    txns: list[NormalizedTransaction],
    previews: dict[str, SchemeMatchPreview],
    key_to_temp: dict[SchemeKey, str],
    overrides: dict[str, SchemeConfirmation],
    parsed_scheme_by_key: dict[SchemeKey, ParsedScheme],
    *, db: Session, identifications: dict[str, Identification],
) -> None:
    """Every referenced scheme is validated up front -- a rejection here makes
    zero DB writes."""
    seen_temp_ids: set[str] = set()
    for norm in txns:
        temp_id = key_to_temp[norm.key]
        if temp_id in seen_temp_ids:
            continue
        seen_temp_ids.add(temp_id)
        preview = previews[temp_id]
        override = overrides.get(temp_id)
        amfi_code = (override.amfi_code if override and override.amfi_code else None) or preview.suggested_amfi_code
        # Gate on the same match_status already shown to the user in the preview
        # (not a fresh confidence comparison) — a scheme the preview labeled
        # "pending" must never be silently confirmed just because its score
        # happens to clear this function's own copy of the threshold.
        confident = preview.match_status == "confirmed" or bool(override and override.amfi_code)
        ident = identifications.get(temp_id)
        identified = ident is not None and (
            ident.status in ("verified", "closed", "unlisted")
            or (ident.status == "ask" and bool(override and override.unlisted))
        )
        if not identified and (not amfi_code or not confident):
            raise SchemeConfidenceError(
                f"Scheme '{preview.name}' requires an explicit AMFI code override (match confidence "
                f"{preview.match_confidence:.2f} below {CONFIDENCE_THRESHOLD})."
            )

        if override and override.amfi_code and db.query(Scheme).filter_by(amfi_code=override.amfi_code).first() is None:
            raise SchemeConfidenceError(
                f"Override AMFI code '{override.amfi_code}' for scheme '{preview.name}' was not found in AMFI's scheme master list."
            )

        # Combined fix for CLAUDE.md's "no server-side 409 backstop on
        # plan-type override" gap: the scheme's own CAS-parsed name is an
        # unambiguous, structurally-derived signal of Direct vs Regular
        # (unlike the ARN-derived preview.plan_type an override exists to
        # correct in the first place) — a plan_type_override that contradicts
        # it is almost certainly a client-side error, not a real correction.
        if override and override.plan_type_override:
            parsed_scheme = parsed_scheme_by_key.get(norm.key)
            variant = parsed_scheme.plan_name_variant if parsed_scheme else None
            designator_match = _PLAN_DESIGNATOR_RE.search(preview.name.upper()) if preview.name else None
            anchored_variant = designator_match.group(1).lower() if designator_match else None
            if (
                variant in (PlanNameVariant.DIRECT.value, PlanNameVariant.REGULAR.value)
                and anchored_variant == variant
                and variant != override.plan_type_override.value
            ):
                raise SchemeConfidenceError(
                    f"Plan-type override '{override.plan_type_override.value}' for scheme '{preview.name}' "
                    f"contradicts its CAS-parsed plan name ('{variant}')."
                )


def _apply_opening_rule(
    db: Session, folio: Folio, lot: OpeningLot | None, statement_from: date | None,
    import_rec: Import | None, *, dry_run: bool = False,
) -> Literal["written", "replaced", "skipped", "removed", "none"]:
    existing = db.query(Transaction).filter_by(
        folio_id=folio.id, origin=TransactionOrigin.CAS_OPENING,
    ).first()
    deleted = existing is not None and statement_from is not None and existing.date > statement_from
    if deleted:
        if not dry_run:
            db.delete(existing)
            db.flush()
        existing = None
    if lot is None:
        return "removed" if deleted else "none"
    if existing is not None:
        return "skipped"
    earlier = db.query(Transaction.id).filter(
        Transaction.folio_id == folio.id,
        Transaction.origin.in_((TransactionOrigin.CAS_ROW, TransactionOrigin.MANUAL)),
        Transaction.date < statement_from,
    ).first()
    if earlier:
        return "removed" if deleted else "skipped"
    if not dry_run:
        opening = Transaction(
            id=uuid.uuid4(), folio_id=folio.id, import_id=import_rec.id,
            type=TransactionType.OPENING_BALANCE, date=lot.start,
            units=lot.units, amount=lot.amount, nav=lot.nav,
            origin=TransactionOrigin.CAS_OPENING, cost_source=lot.cost_source,
            raw_description=f"Opening balance from CAS ({lot.start})",
        )
        db.add(opening)
        db.add(TransactionImport(transaction_id=opening.id, transaction_date=opening.date, import_id=import_rec.id))
        db.flush()
    return "replaced" if deleted else "written"


def _identified_scheme(db, parsed, ident, override=None, *, create=False):
    if override and override.amfi_code:
        return db.query(Scheme).filter_by(amfi_code=override.amfi_code).first()
    if ident is None:
        return None
    if ident.scheme_id is not None:
        return db.get(Scheme, ident.scheme_id)
    as_unlisted = ident.status == "unlisted" or (ident.status == "ask" and bool(override and override.unlisted))
    if ident.status != "closed" and not as_unlisted:
        return None
    query = db.query(Scheme).filter_by(source=SchemeSource.CAS_ONLY)
    query = query.filter_by(isin=parsed.isin) if parsed.isin else query.filter_by(name=parsed.name, amc_name=parsed.amc)
    scheme = query.first()
    if scheme is None and create:
        scheme = Scheme(id=uuid.uuid4(), amfi_code=None, isin=parsed.isin, name=parsed.name,
                        amc_name=parsed.amc, sebi_category=ident.category, source=SchemeSource.CAS_ONLY,
                        is_active=as_unlisted, plan_type=SchemePlanType(ident.plan_type))
        db.add(scheme)
        db.flush()
    return scheme


def _folio_for(db, member, parsed_scheme, preview, override, scheme_cache, folio_cache, identification=None,
               rows=None):
    member_id = member.id
    # "Not listed" for a fund an earlier statement filed under an AMFI scheme
    # (the user picked a code then): that folio, with its confirmed plan kept,
    # and no new CAS-only fund. Only on this explicit answer: other CAS-only
    # funds never look for a listed folio (removal-snapshot review 1, 6, 7).
    if identification is not None and identification.status == "ask" and override and override.unlisted:
        listed = _listed_folio_holding(db, member_id, normalise_folio_key(parsed_scheme.folio), rows or [])
        if listed is not None:
            return listed
    cache_id = (identification.scheme_id if identification else None,
                override.amfi_code if override and override.amfi_code else None,
                parsed_scheme.isin or (parsed_scheme.name, parsed_scheme.amc))
    if cache_id not in scheme_cache:
        scheme_cache[cache_id] = _identified_scheme(db, parsed_scheme, identification, override, create=True)
    scheme = scheme_cache[cache_id]
    if scheme is None:
        raise SchemeConfidenceError(f"Scheme '{preview.name}' requires an explicit AMFI code override.")
    chosen_plan, chosen_verified = preview.plan_type, preview.plan_verified
    if override and override.amfi_code:
        chosen_plan, chosen_verified = classify_plan(scheme, False, parsed_scheme.name)
        # A picked fund with a blank AMFI plan (8 Oct): the statement's plan,
        # as in identify_scheme, and still unverified when that is unclear too,
        # rather than an unfounded "regular" marked verified.
        if not chosen_verified and parsed_scheme.plan_type in ("direct", "regular"):
            chosen_plan, chosen_verified = parsed_scheme.plan_type, True
    if override and override.plan_type_override:
        chosen_plan, chosen_verified = override.plan_type_override, True
    # #4: match on the folio key, so "4400918 / 3" and "4400918/3" are one folio.
    key = normalise_folio_key(parsed_scheme.folio)
    cache_key = (member_id, scheme.id, key)
    if cache_key not in folio_cache:
        existing_folio = (
            db.query(Folio)
            .filter_by(household_member_id=member_id, scheme_id=scheme.id, folio_key=key)
            .first()
        )
        if existing_folio is None and scheme.source != SchemeSource.CAS_ONLY:
            existing_folio = _repoint_cas_only_folio(db, member_id, key, parsed_scheme, scheme)
        if existing_folio:
            folio_cache[cache_key] = existing_folio
        else:
            plan_type = chosen_plan
            arn_code = parsed_scheme.arn_code
            new_folio = Folio(
                id=uuid.uuid4(), household_member_id=member_id, scheme_id=scheme.id,
                folio_number=parsed_scheme.folio, folio_key=key, arn_code=arn_code, plan_type=PlanType(plan_type),
                plan_verified=chosen_verified,
            )
            db.add(new_folio)
            db.flush()
            folio_cache[cache_key] = new_folio

    folio = folio_cache[cache_key]
    folio.plan_type = PlanType(chosen_plan)
    folio.plan_verified = chosen_verified
    return folio


def _cas_only_folio(db, member_id, key, parsed_scheme):
    """This member's folio of the same fund (by the statement's ISIN) that an
    earlier import stored as CAS-only (unlisted or closed)."""
    if not parsed_scheme.isin:
        return None
    return (
        db.query(Folio).join(Scheme, Scheme.id == Folio.scheme_id)
        .filter(Folio.household_member_id == member_id, Folio.folio_key == key,
                Scheme.source == SchemeSource.CAS_ONLY, Scheme.isin == parsed_scheme.isin)
        .first()
    )


def _listed_folio_holding(db, member_id, key, rows):
    """The reverse of _repoint_cas_only_folio: "Not listed" for a fund an
    earlier statement already filed under an AMFI scheme (the user picked a
    code then). The folio whose saved rows this statement repeats is that
    fund: one folio number holds several funds, so the number alone can't
    tell (6 Oct re-review)."""
    if not rows:
        return None
    candidates = (
        db.query(Folio).join(Scheme, Scheme.id == Folio.scheme_id)
        .filter(Folio.household_member_id == member_id, Folio.folio_key == key,
                Scheme.source != SchemeSource.CAS_ONLY)
        .all()
    )
    for folio in candidates:
        if _match_rows(db, folio.id, rows, dry_run=True).matched:
            return folio
    return None


def _repoint_cas_only_folio(db, member_id, key, parsed_scheme, scheme):
    """An unlisted fund that has since joined the AMFI master (an NFO, a late
    feed): its folio moves to the master scheme, so the next statement matches
    its rows instead of adding them again in a second folio (review H1)."""
    folio = _cas_only_folio(db, member_id, key, parsed_scheme)
    if folio is not None:
        folio.scheme_id = scheme.id
        db.flush()
    return folio


def _write_person_rows(
    db: Session,
    member: HouseholdMember,
    import_rec: Import,
    schemes: list[ParsedScheme],
    txns: list[NormalizedTransaction],
    confirmations: dict[str, SchemeConfirmation],
    *,
    previews: dict[str, SchemeMatchPreview],
    key_to_temp: dict[SchemeKey, str],
    opening_lots: dict[str, OpeningLot] | None = None,
    statement_from: date | None = None,
    match_warnings: list[str] | None = None,
    identifications: dict[str, Identification] | None = None,
) -> tuple[int, int]:
    """Get-or-create schemes and this member's folios, then add this person's
    transactions, de-duplicated. Returns (added, skipped). Validation already
    ran (_validate_schemes)."""
    scheme_cache: dict[str, Scheme] = {}
    folio_cache: dict[tuple[uuid.UUID, uuid.UUID, str], Folio] = {}
    added = 0
    skipped = 0

    folios_by_key = {}
    prices_written: set[tuple[uuid.UUID, date]] = set()
    for parsed_scheme in schemes:
        temp_id = key_to_temp[parsed_scheme.key]
        folio = _folio_for(db, member, parsed_scheme, previews[temp_id], confirmations.get(temp_id),
                           scheme_cache, folio_cache, (identifications or {}).get(temp_id),
                           rows=[t for t in txns if t.key == parsed_scheme.key])
        folios_by_key[parsed_scheme.key] = folio
        _store_statement_prices(db, folio.scheme_id, parsed_scheme, txns, prices_written)
        verdict = _apply_opening_rule(db, folio, (opening_lots or {}).get(temp_id), statement_from, import_rec)
        if verdict in ("written", "replaced"):
            added += 1
    rows_by_folio: dict[uuid.UUID, list[NormalizedTransaction]] = {}
    for norm in txns:
        rows_by_folio.setdefault(folios_by_key[norm.key].id, []).append(norm)
    pending: dict[tuple, list[tuple[Decimal | None, int]]] = {}
    for folio_id, rows in rows_by_folio.items():
        match = _match_rows(db, folio_id, rows, pending, warnings=match_warnings)
        skipped += len(rows) - len(match.inserts)
        for saved in match.matched:
            _link(db, saved, import_rec.id)
        for norm, occurrence in match.inserts:
            txn = Transaction(
                id=uuid.uuid4(), folio_id=folio_id, import_id=import_rec.id, type=norm.txn_type,
                date=norm.txn_date, amount=norm.amount, units=norm.units, nav=norm.nav,
                raw_description=norm.description, origin=TransactionOrigin.CAS_ROW,
                balance_units=norm.balance, stamp_duty=norm.stamp_duty, occurrence=occurrence,
            )
            db.add(txn)
            db.add(TransactionImport(transaction_id=txn.id, transaction_date=txn.date, import_id=import_rec.id))
            added += 1

    return added, skipped


def _store_statement_prices(db: Session, scheme_id: uuid.UUID, parsed: ParsedScheme,
                            txns: list[NormalizedTransaction], written: set[tuple[uuid.UUID, date]]) -> None:
    """A CAS-only fund (in no master: unlisted, or closed and merged away) has
    no NAV feed, so the prices the statement prints are its price history:
    each row's NAV (>0; bonus/segregation rows carry 0, which is a cost, not a
    price) and the closing valuation NAV (a real 0 is kept: a written-off
    fund). Existing dates are left alone. Decided 6 Oct."""
    scheme = db.get(Scheme, scheme_id)
    if scheme is None or scheme.source != SchemeSource.CAS_ONLY:
        return
    prices: dict[date, Decimal] = {}
    for t in txns:
        if t.key == parsed.key and t.nav_printed and t.nav is not None and t.nav > 0:
            prices.setdefault(t.txn_date, t.nav)
    if parsed.valuation_date is not None and parsed.valuation_nav is not None:
        prices[parsed.valuation_date] = parsed.valuation_nav
    values = [{"scheme_id": scheme_id, "date": day, "nav": nav} for day, nav in prices.items()
              if (scheme_id, day) not in written]
    if not values:
        return
    written.update((scheme_id, v["date"]) for v in values)
    # ON CONFLICT DO NOTHING: two people's (or two users') confirms of the
    # same CAS-only fund can store the same date concurrently (review L1).
    from app.services.dashboard.nav import _NAV_UPSERT_INSERT_BUILDERS
    insert = _NAV_UPSERT_INSERT_BUILDERS[db.get_bind().dialect.name]
    db.execute(insert(NavHistory).values(values).on_conflict_do_nothing(
        index_elements=[NavHistory.scheme_id, NavHistory.date]))


@dataclass
class MatchResult:
    """_match_rows' verdict for one folio: rows to insert (with occurrence) and
    the saved rows the file also contains (they get a link to this import, #5)."""
    inserts: list[tuple[NormalizedTransaction, int]] = field(default_factory=list)
    matched: list[Transaction] = field(default_factory=list)


def _link(db: Session, txn: Transaction, import_id: uuid.UUID) -> None:
    """#5: record that `import_id` contains this row (idempotent)."""
    if db.get(TransactionImport, (txn.id, import_id)) is None:
        db.add(TransactionImport(transaction_id=txn.id, transaction_date=txn.date, import_id=import_id))


def _match_rows(
    db: Session,
    folio_id: uuid.UUID,
    rows: list[NormalizedTransaction],
    pending: dict[tuple, list[tuple[Decimal | None, int]]] | None = None,
    *,
    dry_run: bool = False,
    warnings: list[str] | None = None,
) -> MatchResult:
    """#2: which incoming rows of one folio must be inserted, each with its
    occurrence number. Rows match on (date, amount, units, type) plus the CAS
    running balance, which is identical across overlapping statements, so two
    genuine same-day twins (different balances) are both kept while a
    re-upload adds nothing. A saved row with no balance (pre-0026 data) matches
    by count and gets the balance filled in. Rows without a balance are
    matched by count: file has k copies, database m → insert k − m.
    `pending` carries rows inserted earlier in the same confirm (autoflush is
    off, so the query below can't see them)."""
    pending = {} if pending is None else pending
    groups: dict[tuple, list[NormalizedTransaction]] = {}
    for r in rows:
        groups.setdefault((r.txn_date, r.amount, r.units, r.txn_type), []).append(r)
    result = MatchResult()
    for (on, amount, units, ttype), incoming in groups.items():
        saved = (
            db.query(Transaction)
            .filter(
                Transaction.folio_id == folio_id, Transaction.date == on, Transaction.amount == amount,
                Transaction.units == units, Transaction.type == ttype,
                Transaction.origin != TransactionOrigin.CAS_OPENING,
            )
            .all()
        )
        pkey = (folio_id, on, amount, units, ttype)
        already = pending.setdefault(pkey, [])
        top = max([t.occurrence for t in saved] + [occ for _, occ in already], default=0)
        to_insert: list[NormalizedTransaction] = []
        if all(r.balance is not None for r in incoming):
            used: set[int] = set()
            pending_balances = [bal for bal, _ in already]
            for r in incoming:
                exact = next((i for i, t in enumerate(saved) if i not in used and t.balance_units == r.balance), None)
                if exact is None:
                    exact = next((i for i, t in enumerate(saved) if i not in used and t.balance_units is None), None)
                    if exact is not None and not dry_run:
                        saved[exact].balance_units = r.balance
                if exact is not None:
                    used.add(exact)
                    if not dry_run and saved[exact].stamp_duty is None and r.stamp_duty is not None:
                        saved[exact].stamp_duty = r.stamp_duty  # a pre-0032 row gets it from the newer statement
                    result.matched.append(saved[exact])
                elif r.balance in pending_balances:
                    pending_balances.remove(r.balance)
                else:
                    to_insert.append(r)
            # Review finding 5 (guard): saved rows with the same date, amount,
            # units and type exist but their running balances differ, so these
            # are added as new. Either genuine extra rows or two statements
            # disagreeing on the balance — say so instead of staying silent.
            unused_with_balance = any(
                i not in used and t.balance_units is not None for i, t in enumerate(saved)
            )
            if to_insert and unused_with_balance and warnings is not None:
                warnings.append(
                    f"{len(to_insert)} row(s) on {on} ({units} units) didn’t match the saved rows’ running "
                    "balance and were added as new; check Import health for this fund."
                )
        else:
            known = len(saved) + len(already)
            to_insert = incoming[known:] if len(incoming) > known else []
            for row, r in zip(saved[: len(incoming)], incoming):
                if not dry_run and row.stamp_duty is None and r.stamp_duty is not None:
                    row.stamp_duty = r.stamp_duty
                result.matched.append(row)
        for r in to_insert:
            top += 1
            result.inserts.append((r, top))
            if not dry_run:
                already.append((r.balance, top))
    return result


def _all_rows_exist(db, works, txns_of, previews, key_to_temp, overrides,
                    opening_lots=None, statement_from=None, *, identifications=None, parsed_schemes=None) -> bool:
    checked = 0
    folios = {}
    for w in works:
        for key in w.scheme_keys:
            cache_key = (w.member_id, key)
            temp_id = key_to_temp[key]
            if cache_key not in folios:
                override = overrides.get(temp_id)
                code = (override.amfi_code if override and override.amfi_code else None) or previews[temp_id].suggested_amfi_code
                ident = (identifications or {}).get(temp_id)
                parsed = (parsed_schemes or {}).get(key)
                scheme = _identified_scheme(db, parsed, ident, override) if ident is not None else db.query(Scheme).filter_by(amfi_code=code).first()
                folios[cache_key] = scheme and db.query(Folio).filter_by(
                    household_member_id=w.member_id, scheme_id=scheme.id, folio_key=normalise_folio_key(key[0])).first()
                if folios[cache_key] is None and ident is not None and ident.status == "ask" \
                        and override and override.unlisted:
                    folios[cache_key] = _listed_folio_holding(
                        db, w.member_id, normalise_folio_key(key[0]), txns_of.get(key, []))
                if scheme is not None and scheme.source != SchemeSource.CAS_ONLY and folios[cache_key] is None \
                        and parsed is not None and _cas_only_folio(db, w.member_id, normalise_folio_key(key[0]), parsed):
                    return False  # moves to the master scheme: not "already imported" (H1)
                if scheme is not None and scheme.source == SchemeSource.CAS_ONLY and parsed is not None \
                        and parsed.valuation_date is not None and parsed.valuation_nav is not None \
                        and db.get(NavHistory, (scheme.id, parsed.valuation_date)) is None:
                    return False  # a newer statement price to store (review M1)
            folio = folios[cache_key]
            lot = (opening_lots or {}).get(temp_id)
            if lot is not None and folio is None:
                return False
            if folio is not None and _apply_opening_rule(
                db, folio, lot, statement_from, None, dry_run=True,
            ) in ("written", "replaced", "removed"):
                return False
            rows = txns_of.get(key, [])
            checked += len(rows)
            if rows and (folio is None or _match_rows(db, folio.id, rows, dry_run=True).inserts):
                return False
    return checked > 0



def _reject_changed_pans(db: Session, works: list[_PersonWork]) -> None:
    """A concurrent PAN change wins over duplicate detection; read-only."""
    for work in works:
        if work.member_id is None or work.person is None or not work.person.pan:
            continue
        member = db.get(HouseholdMember, work.member_id)
        if member is not None and not has_no_pan(member) and hash_pan(work.person.pan) not in (
            member.pan_lookup_hash, member.detected_pan_hash,
        ):
            raise ConfirmInvalidError(f"{member.name} changed during this review. Upload the statement again.")
