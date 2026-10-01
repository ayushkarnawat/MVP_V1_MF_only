# CAS Member Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo, any task handed to Codex also goes through the `model-orchestration` skill (handoff doc + adversarial review gate).

**Goal:** Detect every holder in an uploaded CAS by PAN (name only for folios without a PAN), review them per person in ribbons, import them in one transaction, and unlock each detected person's dashboard once the user adds relationship and PAN. Remove the Just me / Family too onboarding branch.

**Architecture:** Parsing stays in the backend task's RAM review session. A new people layer (`people.py`, `name_match.py`, `people_resolution.py`) turns one `ParseResult` into `people[]` plus a queue of upload-time prompts; each prompt is answered through a small resolve endpoint that returns either the next prompt (409) or the preview (200). Confirm writes every person in one transaction under one `upload_group_id` and one S3 object. Member lock state lives on `household_members` and is guarded by check constraints plus a never-relock trigger.

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic (SQLite dev, Postgres 16 staging), casparser 1.3.0, pytest; React + Vite + TypeScript, shadcn/Radix UI, Vitest + Testing Library.

> **Superseded 2026-10-01 (member profile completion):** the detected-member lock and unlock (Part 6, rules L1-L9, `details_completed_at` / `lock_reason`, the never-relock trigger) are replaced by `Docs/superpowers/plans/2026-10-01-member-profile-completion.md` and the Member Profile Completion Map (`Docs/orchestration/member-profile-completion-map.html`). See `decisions.md` 2026-10-01. The text below is kept for history.

> **Superseded 2026-10-01 (partly):** rules L1/L2 (typed PAN at unlock), L3 (detected-PAN mismatch), L9 (edit name/PAN of an unlocked member) and the people-popup rename (U9) no longer apply. Name and PAN now come from the CAS; unlock is relationship-only (PAN only when the statement had none). See `decisions.md` 2026-10-01. The text below is kept for history.

**Spec:** `Docs/orchestration/cas-member-detection-map.html` (artifact v7, https://claude.ai/artifact/MbEcNvyHmxcAz1PnvuAP7r). State ids (U1–U13, C1–C3, L1–L9, A1, D1–D2), scenario ids (M1–M22) and decision ids (I1–I16) below refer to that page.

## Global Constraints

- Migration is `0018`, `down_revision = "0017"`. No backfill: the database is wiped before testing (M20).
- PAN masking everywhere: first two and last two characters, `*` between (`BXQPS5678L` → `BX******8L`).
- A person with no PAN on the statement shows `(PAN not on statement)` wherever a masked PAN would appear.
- Raw PANs exist only in the RAM review session and in `*_encrypted` / `*_hash` columns. Never in API responses, logs, or `imports.raw_parser_output`.
- PAN matching is exact (HMAC). Name matching (`compare_names`) is used only to find Me, label people, place no-PAN folios, and decide renames.
- Renames of an existing member happen only when the statement has **more** name tokens than the stored name (I9). The same or fewer tokens: keep ours, show nothing.
- An unlocked member (`details_completed_at` set) is never locked again (I15), enforced by trigger `trg_member_never_relock`.
- No path imports a CAS without people detection (M18).
- Upload for a locked member is not allowed (I5).
- Decimal, never float, in any money/units/NAV path (AGENTS.md).
- All user-facing copy is taken verbatim from the spec's catalogue card for that state id.
- Relationship options: Spouse, Parent, Child, Sibling, Other. Other requires a typed label.
- Review session TTL stays 60 min; pending PAN claim stays 65 min; the review banner shows at 55 min.

## Review Focus

1. **Double-press of Confirm imports** (or a retry after a timeout) must not create a second set of members or imports: the second call gets 410 `session_expired`. Test in Task 9.
2. **The same family CAS confirmed from two tabs**: the second confirm must attach funds to the members the first one created (match by `detected_pan_hash` at confirm time, not only at parse time), not create duplicate locked people. Test in Task 9.
3. **PAN typed in lowercase or with spaces** at unlock (`bxqps 5678l`) must be normalised before the format check and HMAC compare. Test in Task 11.
4. **Names with punctuation**, e.g. `D'Souza`, `Mohd.`, `S.K. Rao`, must normalise the same way as the statement's upper-case form. Test in Task 3.
5. **KFintech statement layout**: the holder-name line may sit in a different position than on CAMS. The extractor must fall back cleanly (placeholder + editable name), never attach the wrong name. Test in Task 4.

---

## Part A · Backend foundations (no user-visible change)

### Task 1: Schema 0018, enums, models, never-relock trigger

**Files:**
- Create: `backend/alembic/versions/0018_cas_member_detection.py`
- Create: `backend/app/models/member_history.py`
- Create: `backend/app/db/member_trigger_sql.py`
- Modify: `backend/app/models/enums.py` (after `Relationship`, L20)
- Modify: `backend/app/models/user.py:27-54` (`HouseholdMember`)
- Modify: `backend/app/models/imports.py:12` (`Import`)
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/tests/models/test_no_pan_field.py`
- Test: `backend/tests/models/test_member_detection_schema.py`, `backend/tests/test_migrations.py`

**Interfaces:**
- Produces enums: `MemberOrigin(ONBOARDING="onboarding", MANUAL="manual", CAS_DETECTED="cas_detected")`, `MemberNameSource(USER_ENTERED="user_entered", CAS="cas")`, `MemberPanSource(CAS="cas", USER_ENTERED="user_entered")`, `MemberLockReason(DETAILS_NEEDED="details_needed", PAN_ON_OTHER_ACCOUNT="pan_on_other_account")`, `NameChangeReason(CAS_VARIANT="cas_variant", USER_CORRECTED_TO_CAS="user_corrected_to_cas", USER_EDIT="user_edit")`. All declared as `enum_column(...)`.
- Produces `HouseholdMember` columns:
  - `relationship` (now nullable)
  - `origin` (not null, default `manual`)
  - `name_source` (not null, default `user_entered`)
  - `name_updated_at`, `details_completed_at`, `pan_verified_at` (`DateTime(tz)|None`)
  - `lock_reason`, `pan_source` (enums, nullable)
  - `detected_from_import_id` (FK `imports.id`, `ondelete="SET NULL"`, nullable)
  - `detected_pan_encrypted`, `detected_pan_hash` (`String|None`)
  - property `is_locked -> bool` (`details_completed_at is None`)
- Produces `Import.upload_group_id: uuid.UUID | None` (indexed `ix_imports_upload_group_id`).
- Produces models `HouseholdMemberNameChange` (`household_member_name_changes`: id, household_member_id FK cascade, old_name, new_name, reason, import_id FK SET NULL nullable, changed_at) and `HouseholdMemberMerge` (`household_member_merges`: id, user_id FK, kept_member_id, removed_member_id, removed_member_name, folios_moved int, transactions_dropped int, merged_at).
- Produces constraints on `household_members`:
  - `ck_member_relationship_when_complete`: `relationship IS NOT NULL OR details_completed_at IS NULL`
  - `ck_member_other_label`: `relationship IS NULL OR relationship <> 'other' OR relationship_other_label IS NOT NULL`
  - `ck_member_lock_reason`: `(lock_reason IS NULL AND details_completed_at IS NOT NULL) OR (lock_reason IS NOT NULL AND details_completed_at IS NULL)`
  - `ck_member_detected_pan_pair`: `(detected_pan_encrypted IS NULL) = (detected_pan_hash IS NULL)`
  - index `ix_member_user_detected_pan_hash` on `(user_id, detected_pan_hash)`, non-unique
- Produces `member_trigger_sql.SQLITE_NEVER_RELOCK`, `POSTGRES_NEVER_RELOCK_FN`, `POSTGRES_NEVER_RELOCK_TRIGGER` (SQL strings). The trigger aborts with message `member_already_unlocked` when `OLD.details_completed_at IS NOT NULL AND (NEW.details_completed_at IS NULL OR NEW.lock_reason IS NOT NULL)`.

- [ ] **Step 1: Write the failing tests** in `tests/models/test_member_detection_schema.py`, using the `db_session` fixture and a local `_user(db)` helper:

```python
def test_locked_detected_member_may_have_no_relationship(db_session):
    m = _member(db_session, relationship=None, origin=MemberOrigin.CAS_DETECTED,
                details_completed_at=None, lock_reason=MemberLockReason.DETAILS_NEEDED)
    db_session.flush()
    assert m.is_locked is True

def test_unlocked_member_requires_relationship(db_session):
    _member(db_session, relationship=None, details_completed_at=NOW, lock_reason=None)
    with pytest.raises(IntegrityError): db_session.flush()

def test_other_requires_label(db_session):
    _member(db_session, relationship=Relationship.OTHER, relationship_other_label=None,
            details_completed_at=NOW, lock_reason=None)
    with pytest.raises(IntegrityError): db_session.flush()

def test_lock_reason_iff_not_completed(db_session):
    _member(db_session, relationship=Relationship.SELF, details_completed_at=NOW,
            lock_reason=MemberLockReason.DETAILS_NEEDED)
    with pytest.raises(IntegrityError): db_session.flush()

def test_detected_pan_columns_come_in_pairs(db_session):
    _member(db_session, detected_pan_encrypted="x", detected_pan_hash=None, **LOCKED)
    with pytest.raises(IntegrityError): db_session.flush()

def test_unlocked_member_cannot_be_locked_again(db_session):
    m = _member(db_session, relationship=Relationship.SPOUSE, details_completed_at=NOW, lock_reason=None)
    db_session.commit()
    m.details_completed_at = None; m.lock_reason = MemberLockReason.DETAILS_NEEDED
    with pytest.raises(DatabaseError, match="member_already_unlocked"): db_session.commit()
```

Add to `tests/test_migrations.py`: `test_0018_upgrade_creates_trigger_and_downgrade_removes_it`. It upgrades a temp SQLite DB to head and asserts `sqlite_master` has trigger `trg_member_never_relock` and table `household_member_name_changes`. It then downgrades to `0017` and asserts both are gone.

Update `tests/models/test_no_pan_field.py`: the expected PAN column set becomes `{"pan_encrypted", "pan_lookup_hash", "pan_pending_until", "pan_source", "pan_verified_at", "detected_pan_encrypted", "detected_pan_hash"}`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && pytest tests/models/test_member_detection_schema.py tests/models/test_no_pan_field.py -v`
Expected: FAIL (ImportError on the new enums / missing columns).

- [ ] **Step 3: Implement enums, columns, models and constraints** as listed in Interfaces. The trigger is attached with `event.listen(HouseholdMember.__table__, "after_create", DDL(...).execute_if(dialect=...))` for `sqlite` and `postgresql`, using the strings from `member_trigger_sql.py`. That way `Base.metadata.create_all` (used by the `db_session` fixture) gets it too.

- [ ] **Step 4: Write migration 0018** in the 0017 style (`op.add_column`). Use `op.batch_alter_table("household_members")` only for the `relationship` nullability change and the four check constraints; SQLite can't `ALTER COLUMN` otherwise. Copy the trigger SQL verbatim into the migration and don't import it from app code, so later edits can't rewrite history. Choose it per `op.get_bind().dialect.name`. Downgrade reverses everything, including `DROP TRIGGER` and the Postgres function.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && pytest tests/models tests/test_migrations.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/alembic/versions/0018_cas_member_detection.py backend/app/models backend/app/db/member_trigger_sql.py backend/tests/models backend/tests/test_migrations.py
git commit -m "feat(db): 0018 member detection columns, audit tables, never-relock trigger"
```

### Task 2: PAN masking, first two + last two

**Files:**
- Modify: `backend/app/services/import_/parser.py:63` (`mask_pan`)
- Modify: every test asserting the old mask. Known hits: `tests/api/test_cas_imports_routes.py`, `tests/api/test_imports_routes.py`, `tests/services/import_/test_lifecycle_service.py`, `tests/services/import_/test_parser.py`, `tests/services/import_/test_service.py`.
- Test: `backend/tests/services/import_/test_parser.py`

**Interfaces:**
- Produces: `mask_pan(pan: str | None) -> str | None`. `None`/`""` pass through. Length < 5 → all `*`. Otherwise `pan[:2] + "*" * (len(pan) - 4) + pan[-2:]`.

- [ ] **Step 1: Write the failing test**

```python
@pytest.mark.parametrize("pan, masked", [("BXQPS5678L", "BX******8L"), ("ABCD", "****"), (None, None), ("", "")])
def test_mask_pan_shows_first_two_and_last_two(pan, masked):
    assert mask_pan(pan) == masked
```

- [ ] **Step 2: Run it, expect FAIL** — `cd backend && pytest tests/services/import_/test_parser.py::test_mask_pan_shows_first_two_and_last_two -v`
- [ ] **Step 3: Implement** the new rule in `mask_pan`.
- [ ] **Step 4: Update old-mask assertions.** Run `cd backend && grep -rn "\*\*\*\*" tests` and replace each old-format expectation with the new format.
- [ ] **Step 5: Run the whole suite, expect PASS** — `cd backend && pytest -q`
- [ ] **Step 6: Commit** — `git commit -am "feat(import): mask PAN as first two and last two characters"`

### Task 3: Name matching and name validation

**Files:**
- Create: `backend/app/services/import_/name_match.py`
- Test: `backend/tests/services/import_/test_name_match.py`

**Interfaces:**
- Produces:
  - `NameMatch = Literal["exact", "variant", "mismatch"]`
  - `@dataclass(frozen=True) class NameComparison: result: NameMatch; shared: tuple[str, ...]; reason: str`
  - `normalise_name(name: str) -> list[str]`
  - `compare_names(a: str, b: str) -> NameComparison`
  - `has_more_tokens(statement_name: str, current_name: str) -> bool` (true when `len(normalise_name(statement_name)) > len(normalise_name(current_name))`)
  - `class InvalidPersonNameError(ValueError)` with `.code = "invalid_name"` and `.message`
  - `validate_person_name(raw: str) -> str` (returns the name with collapsed spaces)
- Constants (verbatim from the spec's pseudo-code):
  - `HONORIFICS = {"MR","MRS","MS","MISS","DR","SHRI","SMT","KUM","MASTER","LATE"}`
  - `WEAK = {"KUMAR","KUMARI","DEVI","BAI","BHAI","BEN","BEGUM"}`
- Validation rule: characters `[A-Za-z .']` only, 2–85 characters after trimming. Messages: `"Enter your name as per PAN."` (empty), `"Use letters, spaces, dots and apostrophes only."`, `"Name must be 2 to 85 characters."`

- [ ] **Step 1: Write the failing tests.** Parametrise the spec's example table exactly:

```python
@pytest.mark.parametrize("a, b, expected", [
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
    # Review Focus 4
    ("Anil D'Souza", "ANIL D SOUZA", "exact"),
    ("Mohd. Irfan", "MOHD IRFAN", "exact"),
    ("S.K. Rao", "S K RAO", "exact"),
])
def test_compare_names(a, b, expected):
    assert compare_names(a, b).result == expected

def test_has_more_tokens():
    assert has_more_tokens("AYUSH ANAND KARNAWAT", "Ayush Karnawat") is True
    assert has_more_tokens("AYUSH KARNAWAT", "Ayush Anand Karnawat") is False
    assert has_more_tokens("AYUSH KARNAWAT", "Ayush Karnawat") is False

@pytest.mark.parametrize("raw, ok", [("  Ayush   Karnawat ", "Ayush Karnawat"), ("D'Souza", "D'Souza")])
def test_validate_person_name_accepts(raw, ok): assert validate_person_name(raw) == ok

@pytest.mark.parametrize("raw, msg", [("", "Enter your name as per PAN."), ("A", "Name must be 2 to 85 characters."),
                                      ("Ayush1", "Use letters, spaces, dots and apostrophes only.")])
def test_validate_person_name_rejects(raw, msg):
    with pytest.raises(InvalidPersonNameError, match=re.escape(msg)): validate_person_name(raw)
```

- [ ] **Step 2: Run, expect FAIL** — `cd backend && pytest tests/services/import_/test_name_match.py -v`
- [ ] **Step 3: Implement `name_match.py`.** Normalise per the spec: uppercase; replace `. , ' -` with a space; collapse spaces; drop honorifics. Token matching (`same_token`): equal; or a single letter that prefixes the other token; or both tokens ≥ 5 characters with Levenshtein distance ≤ 1. Write a small local edit-distance function; don't add a new dependency. `variant` requires every token of the shorter name to be matched to a distinct token of the longer one, with at least one matched pair being a full, non-WEAK token.
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(import): compare_names and person-name validation"`

### Task 4: Per-folio PAN, holder names, grouping into people

**Files:**
- Create: `backend/app/services/import_/people.py`
- Modify: `backend/app/services/import_/parser.py` (dataclasses L112–158; `_normalize_cas_data` L183; `parse_cas_pdf_bytes` L271)
- Test: `backend/tests/services/import_/test_people.py`, `backend/tests/services/import_/test_parser.py`

**Interfaces:**
- Produces in `people.py`:
  - `folio_key(folio: str) -> str`: removes whitespace, so `"1234 / 56"` → `"1234/56"`.
  - `@dataclass class FolioHolder: folio_key: str; pan: str | None; holder_name: str | None`
  - `extract_folio_holders(lines: list[str]) -> dict[str, FolioHolder]`
  - `read_pdf_lines(pdf_path: str, password: str) -> list[str]`: uses casparser's internal `casparser.parsers.extract.extract_pages` (`Line.text`). Comment that this is pinned to casparser 1.3.0.
  - `NameSource = Literal["holder_line", "other_folio", "addressee", "placeholder", "typed"]`
  - `@dataclass class ParsedPerson: key: str; pan: str | None; pan_masked: str | None; name: str; name_source: NameSource; needs_name: bool; folio_keys: list[str]; matched_by_name: list[str]`
  - `group_people(folios: list[tuple[str, str | None]], holders: dict[str, FolioHolder], addressee_name: str | None) -> tuple[list[ParsedPerson], list[str]]`: takes `(folio_key, casparser PAN)` in statement order and returns `(people, unassigned_folio_keys)`.
- Produces in `parser.py`:
  - `ParsedScheme.person_key: str | None = None`
  - `NormalizedTransaction.person_key: str | None = None`
  - `ParseResult.people: list[ParsedPerson] = field(default_factory=list)`
  - `ParseResult.unassigned_folio_keys: list[str] = field(default_factory=list)`
  - `ParsedInvestor.pan` keeps its current meaning until Task 8.
- Rules (spec "How people are found" + "Fallbacks"):
  - The folio header regex is copied from casparser `cams_detailed.FOLIO_LINE_RE` (L226–238). The holder name is the next non-empty line that isn't another header, an AMC line, a date row, or a `Nominee`/`Registrar`/`KYC` label.
  - Person keys are `p1`, `p2`, … in first-appearance order. They never contain the PAN.
  - Folios with a PAN group by exact PAN.
  - Name fallbacks per PAN group, in order: holder line; another folio of the same PAN; the addressee name (only when the file has exactly one PAN group); otherwise `Person {n}` with `needs_name=True`. Fallback "Me's own name" is applied later, in Task 5.
  - A no-PAN folio with a readable name joins the one PAN group whose name `compare_names` rates exact/variant, and its key goes into that person's `matched_by_name`. If it matches none, it joins or forms a name-only person (`pan=None`, `pan_masked=None`).
  - No PAN and no name → `unassigned_folio_keys`.
  - Every fallback beyond the holder line appends a parse warning containing no PAN and no name: `"person p2: name not read from statement"`.

- [ ] **Step 1: Write the failing tests** in `test_people.py`. Use synthetic line lists modelled on the CAMS layout, plus one KFintech-style case (Review Focus 5):

```python
CAMS_LINES = ["HDFC Mutual Fund", "Folio No: 1234 / 56 PAN: ABCPS1234K KYC: OK PAN: OK", "ADITI SHARMA",
              "Axis Mutual Fund", "Folio No: 7788 PAN: BXQPS5678L KYC: OK PAN: OK", "RAMESH SHARMA",
              "Franklin Templeton", "Folio No: 9900", "ADITI SHARMA",
              "UTI Mutual Fund", "Folio No: 5511", "MEERA SHARMA"]

def test_groups_by_pan_and_places_no_pan_folios_by_name():
    holders = extract_folio_holders(CAMS_LINES)
    people, unassigned = group_people([("1234/56","ABCPS1234K"),("7788","BXQPS5678L"),("9900",None),("5511",None)],
                                      holders, "ADITI SHARMA")
    assert [(p.key, p.name, p.pan_masked) for p in people] == [
        ("p1","ADITI SHARMA","AB******4K"), ("p2","RAMESH SHARMA","BX******8L"), ("p3","MEERA SHARMA",None)]
    assert people[0].folio_keys == ["1234/56","9900"] and people[0].matched_by_name == ["9900"]
    assert unassigned == []

def test_no_pan_and_no_name_is_unassigned(): ...           # holder line missing for a no-PAN folio → in unassigned
def test_unreadable_name_uses_other_folio_of_same_pan(): ... # name_source == "other_folio"
def test_single_group_falls_back_to_addressee(): ...        # name_source == "addressee"
def test_multi_group_unreadable_name_gets_placeholder(): ... # name == "Person 2", needs_name is True, and a warning without PAN/name
def test_kfintech_layout_without_holder_line_never_borrows_a_neighbour_name(): ...  # header followed directly by a scheme row → placeholder, not the next folio's name
def test_person_keys_never_contain_pan(): ...
```

In `test_parser.py`, add `test_parse_cas_pdf_bytes_fills_people_and_person_keys`. It monkeypatches `casparser.read_cas_pdf` and `people.read_pdf_lines`, then asserts every `ParsedScheme.person_key` and `NormalizedTransaction.person_key` is set, and that `raw_json` contains no PAN.

- [ ] **Step 2: Run, expect FAIL** — `cd backend && pytest tests/services/import_/test_people.py tests/services/import_/test_parser.py -v`
- [ ] **Step 3: Implement `people.py`** to the rules above.
- [ ] **Step 4: Wire it into `parser.py`.** Inside `parse_cas_pdf_bytes`, while the temp file still exists, call `read_pdf_lines(tmp_path, password)`. Pass the lines into `_normalize_cas_data(data, lines)`. That function now reads the PAN per folio and tags each scheme and transaction with its person key.
- [ ] **Step 5: Run, expect PASS.** Then run the full import suite: `cd backend && pytest tests/services/import_ -q`.
- [ ] **Step 6: Manual check (not committed).** Parse one real multi-PAN family CAS (CAMS) and one KFintech CAS locally: `python -c "from app.services.import_.parser import parse_cas_pdf_bytes; ..."`. Print only person keys, name sources and masked PANs. Record the findings in the task's handoff doc. Any layout the extractor misses becomes a new synthetic test.
- [ ] **Step 7: Commit** — `git commit -m "feat(import): per-folio PAN, holder names and people grouping"`

### Task 5: Finding Me, classifying detected PANs, planning people

**Files:**
- Create: `backend/app/services/import_/people_resolution.py`
- Modify: `backend/app/services/import_/pan_claims.py` (add after `release_pending_pan_claim`, L182)
- Test: `backend/tests/services/import_/test_people_resolution.py`, `backend/tests/services/import_/test_pan_claims.py`

**Interfaces:**
- Consumes: `ParsedPerson`, `compare_names`, `has_more_tokens`, `hash_pan` (`crypto.py`).
- Produces in `pan_claims.py`:
  - `DetectedPanStatus = Literal["new", "existing_member", "locked_member", "other_account"]`
  - `classify_detected_pan(db, user_id: uuid.UUID, pan: str, *, now: datetime | None = None) -> tuple[DetectedPanStatus, uuid.UUID | None]`, checked in this order:
    - a non-expired `pan_lookup_hash` in this user's account → existing member
    - the same hash on another user → other account
    - a `detected_pan_hash` in this user's account → locked member
    - otherwise new
- Produces in `people_resolution.py`:
  - `@dataclass class SelfMatch: kind: Literal["pan", "exact", "variant", "ambiguous", "mismatch"]; person_key: str | None; candidate_keys: list[str]`
  - `resolve_self(self_member: HouseholdMember, people: list[ParsedPerson]) -> SelfMatch`:
    - if the self member has a permanent PAN, match by hash
    - otherwise compare names: one exact match wins over variants; two or more candidates of the best kind → `ambiguous`; none → `mismatch`
  - `PersonStatus = Literal["me", "new", "existing_member", "locked_member", "other_account"]`
  - `NameUpdate = Literal["none", "update", "ask"]`
  - `@dataclass class PersonPlan: person_key: str; status: PersonStatus; member_id: uuid.UUID | None; name: str; name_update: NameUpdate; current_name: str | None; same_person_member_id: uuid.UUID | None`
  - `plan_people(db, user_id: uuid.UUID, people: list[ParsedPerson], me_key: str) -> list[PersonPlan]`
- Rules:
  - For an existing or locked member: `variant` with `has_more_tokens` → `"update"`; `variant` otherwise → `"none"` (I9); `mismatch` → `"ask"` (M8).
  - For Me on a first upload: `variant` → `"update"` (I10).
  - U13: a new person whose name is exact/variant with an unlocked member that has `pan_source = user_entered`, `pan_verified_at IS NULL` and a different PAN → `same_person_member_id` is set.
  - Once Me is known, a placeholder name for Me is replaced by the self member's name (fallback "Me's own name").

- [ ] **Step 1: Write the failing tests.** `test_pan_claims.py` gets `test_classify_detected_pan_*` for each of the four outcomes plus "expired pending claim counts as new". `test_people_resolution.py` gets:

```python
def test_resolve_self_by_permanent_pan(): ...
def test_resolve_self_exact_beats_variant(): ...          # "Aditi Sharma" vs [ADITI SHARMA, A SHARMA] → exact p1
def test_resolve_self_ambiguous(): ...                     # "A Sharma" vs [ADITI SHARMA, ARJUN SHARMA] → ambiguous, both keys
def test_resolve_self_mismatch(): ...                      # "Ayush Karnawat" vs [ROHAN MEHTA] → mismatch
def test_plan_existing_member_longer_name_updates(): ...   # stored "Ayush Karnawat", file "AYUSH ANAND KARNAWAT" → "update"
def test_plan_existing_member_shorter_name_is_kept(): ...  # stored "Ayush Anand Karnawat", file "AYUSH KARNAWAT" → "none"
def test_plan_pan_match_name_mismatch_asks(): ...          # → "ask"
def test_plan_flags_possible_same_person(): ...            # U13
def test_plan_me_placeholder_takes_self_name(): ...
```

- [ ] **Step 2: Run, expect FAIL** — `cd backend && pytest tests/services/import_/test_people_resolution.py tests/services/import_/test_pan_claims.py -v`
- [ ] **Step 3: Implement** both modules to the rules above. Neither writes or flushes.
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(import): resolve Me, classify detected PANs, plan people"`

---

## Part B · Upload, prompts and confirm API

### Task 6: Parse route with people[] and the prompt queue

**Files:**
- Modify: `backend/app/services/import_/service.py` (`build_import_preview` L88, `start_import_session` L157, session keys L138–146)
- Modify: `backend/app/services/import_/schemas.py`
- Modify: `backend/app/api/imports.py` (`parse_import` L202, 409 mapping L246)
- Test: `backend/tests/api/test_imports_people_routes.py` (new, reusing the `_parse` / `_authed_headers_and_member` helpers from `tests/api/test_imports_routes.py`; move them into `tests/api/import_helpers.py`)

**Interfaces:**
- Produces in `schemas.py`:
  - `PersonPreview(person_key: str, name: str, name_source: str, needs_name: bool, pan_masked: str | None, is_me: bool, status: str, member_id: str | None, fund_count: int, unresolved_count: int, matched_by_name_temp_ids: list[str])`
  - `NameNotice(person_key: str, member_id: str | None, current_name: str, statement_name: str, kind: Literal["update", "ask"], first_upload: bool)`
  - `SamePersonPrompt(person_key: str, member_id: str, member_name: str, entered_pan_masked: str, statement_pan_masked: str)`
  - `SchemeMatchPreview.person_key: str | None`
  - `ImportPreviewResponse` gains `people: list[PersonPreview]`, `unassigned_temp_ids: list[str]`, `name_notices: list[NameNotice]`, `same_person_prompts: list[SamePersonPrompt]`, `expires_at: datetime` (session `created_at` + 60 min)
  - `ImportPromptDetail(code: str, message: str, session_id: str, details: dict[str, Any])` is the 409 `detail` body. Existing `{code, message}` consumers still work.
- Produces in `service.py`:
  - `class ImportPromptError(Exception): code: str; message: str; session_id: str; details: dict`
  - `next_prompt(db, session: dict) -> ImportPromptError | None`
  - `start_import_session(...)` keeps its signature. It now stores `people_plan`, `me_key`, `resolved_codes: set[str]`, `pending_claims: list[tuple[uuid.UUID, str]]` in the session, and raises `ImportPromptError` **without dropping the session**.
  - `unresolved_count` = schemes of that person with `plan_type == "unclassified"`.
- Prompt order (spec "Your three situations" flowchart), with copy from the catalogue cards:
  1. Target member locked → `member_details_required`, and the session **is** dropped (I5).
  2. Add data, target not found → U5 `member_not_in_file`, `details={"member_name", "member_pan_masked", "people": [names]}`.
  3. Add data, target's PAN typed at unlock and unverified, found by name under a different PAN → U4 `member_pan_mismatch`, `details={"member_name", "entered_pan_masked", "statement_pan_masked"}`.
  4. Every person is a locked member → U6 `locked_member_only`, `details={"member_id", "member_name"}`.
  5. Every person is on another account → U7 `cross_account_pan_blocked`, `details={"people": [names]}`.
  6. First upload, `SelfMatch.mismatch` → U2 `self_name_mismatch`, `details={"entered_name", "statement_name"}`.
  7. First upload, `SelfMatch.ambiguous` → U3 `which_is_self`, `details={"candidates": [{"person_key", "name", "pan_masked"}]}`.
- Self PAN claim (`claim_pan_for_member(..., pending=True)`) runs only once Me is known and no prompt from items 1–7 remains. It is recorded in `pending_claims`.

- [ ] **Step 1: Write the failing route tests**, one per prompt plus the happy paths:

```python
def test_parse_family_cas_returns_people_me_first(client, tmp_path): ...  # people[0].is_me, masked PANs, "(PAN not on statement)" person has pan_masked None
def test_parse_response_never_contains_raw_pan(client, tmp_path): ...     # assert "BXQPS5678L" not in resp.text
def test_parse_first_upload_name_mismatch_is_409_and_keeps_session(client, tmp_path): ...
    # detail.code == "self_name_mismatch"; detail.details == {"entered_name": "Ayush Karnawat", "statement_name": "ROHAN MEHTA"}
    # then POST /imports/sessions/{sid}/discard returns 204 (session still existed)
def test_parse_first_upload_variant_returns_update_notice(client, tmp_path): ...  # name_notices[0].first_upload is True, kind "update"
def test_parse_ambiguous_self_is_409_which_is_self(client, tmp_path): ...
def test_parse_for_locked_member_is_rejected(client, tmp_path): ...  # 409 member_details_required
def test_parse_member_not_in_file(client, tmp_path): ...
def test_parse_member_pan_mismatch_for_unverified_typed_pan(client, tmp_path): ...
def test_parse_locked_member_only(client, tmp_path): ...
def test_parse_whole_file_other_account(client, tmp_path): ...
def test_parse_claims_self_pan_only_after_prompts_clear(client, tmp_path, db_session): ...
def test_parse_same_person_prompt_listed(client, tmp_path): ...  # U13 in same_person_prompts
```

- [ ] **Step 2: Run, expect FAIL** — `cd backend && pytest tests/api/test_imports_people_routes.py -v`
- [ ] **Step 3: Implement** the schemas, the session keys, `next_prompt`, and the route mapping of `ImportPromptError` to `HTTPException(409, detail=ImportPromptDetail(...).model_dump())`.
- [ ] **Step 4: Run the new tests and `tests/api/test_imports_routes.py`, expect PASS.** Adjust old assertions only where the new response fields legitimately change them.
- [ ] **Step 5: Commit** — `git commit -m "feat(import): people preview and upload-time prompt queue"`

### Task 7: Resolve endpoints (U2, U3, U4/U12, U5/U6/U7, U13)

**Files:**
- Modify: `backend/app/services/import_/service.py`
- Modify: `backend/app/services/import_/schemas.py`
- Modify: `backend/app/api/imports.py`
- Test: `backend/tests/api/test_imports_people_routes.py`

**Interfaces:**
- Produces request models:
  - `ResolveNameRequest(name: str)`
  - `ResolveSelfRequest(person_key: str | None)`: `None` means "None of these" → continues as U2
  - `ResolvePanRequest(choice: Literal["statement"])`
  - `ResolveSamePersonRequest(person_key: str, member_id: str, same: bool)`
  - `AcknowledgeRequest(code: Literal["member_not_in_file", "locked_member_only", "cross_account_pan_blocked"])`
- Produces routes. Each returns `ImportPreviewResponse` (200) or the next prompt (409); an unknown or expired session gives 410 `session_expired`:
  - `POST /imports/sessions/{session_id}/resolve-name`: `validate_person_name`, then `compare_names(name, statement_name) != "mismatch"` (else 422 `{"code": "name_not_on_statement", "message": "This name doesn't match the statement"}`). Renames self (`name_source=cas`, `name_updated_at`), inserts `HouseholdMemberNameChange(reason=user_corrected_to_cas)`, commits, then continues the queue.
  - `POST /imports/sessions/{session_id}/resolve-self`
  - `POST /imports/sessions/{session_id}/resolve-pan`: claims the statement PAN for the target (pending) **before** releasing the old one, in one flush. On `CrossAccountPanBlockedError` it raises U12 `statement_pan_on_other_account` with `details={"member_name", "entered_pan_masked", "statement_pan_masked"}` and leaves the member untouched (I15).
  - `POST /imports/sessions/{session_id}/resolve-same-person`: `same=True` maps the person to that member, with the same PAN switch as resolve-pan (U12 on conflict). `same=False` leaves them new.
  - `POST /imports/sessions/{session_id}/acknowledge`: U6 re-checks, so if the member has been unlocked meanwhile the queue continues; if still locked, U6 again.
- Produces `SessionExpiredError` → 410 `{"code": "session_expired", "message": "This review has expired"}` for every session route, `/imports/confirm` included (C2). Today confirm returns 404 via `ValueError`. Change it; the frontend follows in Task 17.
- The discard route also releases every claim in `pending_claims`.

- [ ] **Step 1: Write the failing tests**

```python
def test_resolve_name_renames_self_logs_change_and_returns_preview(...): ...
def test_resolve_name_rejects_a_name_not_on_the_statement(...): ...   # 422 name_not_on_statement
def test_resolve_self_picks_candidate_and_claims_pan(...): ...
def test_resolve_self_none_of_these_goes_to_u2(...): ...
def test_resolve_pan_switches_claim(...): ...
def test_resolve_pan_other_account_is_u12_and_member_unchanged(...): ...  # member.details_completed_at still set, old pan_lookup_hash unchanged
def test_resolve_same_person_true_maps_person_to_member(...): ...
def test_acknowledge_member_not_in_file_returns_preview(...): ...
def test_acknowledge_locked_member_only_after_unlock_continues(...): ...
def test_session_routes_return_410_when_expired(...): ...
def test_discard_releases_all_pending_claims(...): ...
```

- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement** the service functions: `resolve_name(db, session_id, user_id, name)`, `resolve_self(db, session_id, user_id, person_key)`, `resolve_pan(db, session_id, user_id)`, `resolve_same_person(db, session_id, user_id, person_key, member_id, same)`, `acknowledge_prompt(db, session_id, user_id, code)`, each `-> ImportPreviewResponse`. Then add the thin routes.
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(import): resolve endpoints for upload-time prompts"`

### Task 8: One statement file per upload group

**Files:**
- Modify: `backend/app/services/import_/file_storage.py` (`storage_key_for_import` L84, `store_cas_file` L88, `expire_stored_files` L99)
- Test: `backend/tests/services/import_/test_file_storage.py`

**Interfaces:**
- Produces:
  - `storage_key_for_upload_group(user_id: uuid.UUID, upload_group_id: uuid.UUID) -> str` (`f"{user_id}/{upload_group_id}.pdf"`)
  - `store_group_cas_file(import_recs: list[Import], user_id: uuid.UUID, upload_group_id: uuid.UUID, pdf_bytes: bytes, storage: FileStorage = default_file_storage) -> None`: one `save`, the same `file_reference` and `file_expires_at` on every row
  - `release_file_if_unreferenced(db, file_reference: str, storage: FileStorage = default_file_storage) -> bool`
  - `expire_stored_files` NULLs `file_reference` on **every** row with an expired reference and calls `storage.delete` once per distinct reference

- [ ] **Step 1: Write the failing tests**: `test_group_file_saved_once_and_shared`, `test_expire_nulls_all_rows_of_a_group_and_deletes_once`, `test_release_file_only_when_no_row_references_it`. Use a fake storage that counts calls.
- [ ] **Step 2: Run, expect FAIL** — `cd backend && pytest tests/services/import_/test_file_storage.py -v`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(import): one stored CAS file per upload group"`

### Task 9: Multi-person Confirm imports

**Files:**
- Create: `backend/app/services/import_/confirm_people.py`
- Modify: `backend/app/services/import_/service.py` (`confirm_import` L192 becomes a thin adapter)
- Modify: `backend/app/services/import_/schemas.py`
- Modify: `backend/app/api/imports.py` (`confirm_import_route` L250)
- Test: `backend/tests/services/import_/test_confirm_people.py`, `backend/tests/api/test_imports_people_routes.py`

**Interfaces:**
- Consumes: `PersonPlan`, `classify_detected_pan`, `confirm_pan_claim`, `encrypt_pan` / `hash_pan`, `store_group_cas_file`.
- Produces:
  - `PersonConfirmation(person_key: str, name: str | None = None, include: bool = True, scheme_confirmations: list[SchemeConfirmation] = [], moved_temp_ids: dict[str, str] = {}, accept_name_update: bool | None = None)`. `moved_temp_ids` maps temp_id → target person_key (the "Move to…" picker and the U10 owner picker). `accept_name_update` answers an M8 `"ask"`.
  - `ImportConfirmRequest`: `household_member_id: str | None = None`, `people: list[PersonConfirmation] | None = None`. When `people` is None the old single-member body is mapped to one `PersonConfirmation` for Me.
  - `PersonConfirmResult(person_key: str, member_id: str, name: str, import_id: str, added: int, skipped: int)`
  - `ImportConfirmResponse` gains `people: list[PersonConfirmResult] = []` and `upload_group_id: str | None = None`. `added` / `skipped` / `import_id` stay as totals / Me's import id.
  - `confirm_people_import(db, session_id: str, user_id: uuid.UUID, people: list[PersonConfirmation]) -> ImportConfirmResponse`
- Rules (spec Part 5 table + "End-to-end flow with every database write"):
  - One transaction. The session is deleted only after commit. A second call → `SessionExpiredError` (Review Focus 1).
  - Validation → 422 `{"code": "confirm_invalid"}` for: a placeholder person without `name`; an included `other_account` person when the plan didn't offer inclusion; an unknown person_key.
  - Every person is re-classified at confirm time with `classify_detected_pan`, so a person created by a parallel confirm is attached, not duplicated (Review Focus 2).
  - A new person gets a `HouseholdMember` row:
    - `origin=cas_detected`, `relationship=None`, `details_completed_at=None`
    - `lock_reason=details_needed`, or `pan_on_other_account` if included under U7/U8
    - `detected_pan_encrypted` / `detected_pan_hash` (NULL for name-only people)
    - `detected_from_import_id` set to that person's import
  - Me: `confirm_pan_claim`, `pan_source=cas`, `pan_verified_at=now`.
  - A U4/U13-switched member: `pan_source=cas`, `pan_verified_at=now`.
  - Name updates: `"update"` → rename + `HouseholdMemberNameChange(reason=cas_variant)`. `"ask"` → rename only if `accept_name_update`. `name_source=cas`, `name_updated_at=now`.
  - One `Import` per included person with a shared `upload_group_id = uuid4()`. `raw_parser_output` holds only that person's folios, PAN redacted. Schemes, folios and transactions reuse the existing get-or-create and dedupe code from `service.py` L306–397 (extract it into `_write_person_rows(db, member, import_rec, schemes, txns, confirmations) -> tuple[int, int]` instead of copying it).
  - `store_group_cas_file` once, before commit. `invalidate_holdings_cache` for every member touched.
  - The route keeps today's background NAV prefetch and recompute claim (one claim for the whole household).

- [ ] **Step 1: Write the failing tests**

```python
def test_confirm_family_cas_creates_locked_members_and_grouped_imports(...):
    # 3 people → 2 new HouseholdMember rows (origin cas_detected, relationship None, lock_reason details_needed),
    # 3 Import rows sharing one upload_group_id and one file_reference, response.people has 3 entries
def test_confirm_name_only_person_has_no_detected_pan(...): ...
def test_confirm_twice_is_410_and_writes_nothing_more(...): ...           # Review Focus 1
def test_parallel_session_confirm_attaches_to_existing_locked_member(...): ...  # Review Focus 2
def test_confirm_applies_update_notice_and_logs_name_change(...): ...
def test_confirm_keeps_longer_stored_name(...): ...                        # I9
def test_confirm_moved_fund_lands_on_target_person(...): ...
def test_confirm_rolls_back_everything_on_failure(...): ...                # monkeypatch _write_person_rows to raise on person 2; assert 0 imports, session still present (C1)
def test_confirm_raw_parser_output_has_only_that_persons_folios_and_no_pan(...): ...
def test_confirm_old_single_member_body_still_works(...): ...
def test_confirm_included_other_account_person_is_locked_pan_on_other_account(...): ...
```

- [ ] **Step 2: Run, expect FAIL** — `cd backend && pytest tests/services/import_/test_confirm_people.py -v`
- [ ] **Step 3: Implement** `confirm_people.py` and the adapter.
- [ ] **Step 4: Run, expect PASS.** Then run `cd backend && pytest tests/api tests/services/import_ -q`.
- [ ] **Step 5: Commit** — `git commit -m "feat(import): multi-person confirm in one transaction"`

### Task 10: Route the one-step upload through detection (M18)

**Files:**
- Modify: `backend/app/api/cas_imports.py` (`upload_cas_import` L82)
- Modify: `frontend/src/features/import/WaitingForCasView.tsx:50` and `TwoPathImportContainer.tsx`
- Test: `backend/tests/api/test_cas_imports_routes.py`, `frontend/src/features/import/TwoPathImportContainer.test.tsx`

**Interfaces:**
- `POST /cas-imports` returns 409 `{"code": "review_required", "message": "Upload this statement through the review screen."}` for every file. The route stays so old clients get a clear answer. The request-status, cancel and opening-balance routes are unchanged.
- `WaitingForCasView` gains prop `onUploadSubmit: (file: File, password: string) => void`. `TwoPathImportContainer` passes its own `onUploadSubmit(file, password, "request")`, so the arrived statement goes through `ImportFlow`'s parse → prompts → people → ribbons path.

- [ ] **Step 1: Write the failing tests**: backend `test_one_step_upload_requires_review`; frontend `waiting view hands the file to the review flow` (asserts `onUploadSubmit` called with `(file, "pw", "request")` and `uploadCasImport` not called).
- [ ] **Step 2: Run, expect FAIL** — `cd backend && pytest tests/api/test_cas_imports_routes.py -v` and `cd frontend && npx vitest run src/features/import/TwoPathImportContainer.test.tsx`
- [ ] **Step 3: Implement.** Remove the now-dead one-step tests that asserted a 202.
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(import): no CAS import bypasses people detection"`

---

## Part C · Members: unlock, edit, merge, delete

### Task 11: Member details, lock gate, never-relock behaviour

**Files:**
- Create: `backend/app/services/dashboard/member_details.py`
- Modify: `backend/app/services/dashboard/household_members.py` (`create_household_member` L24)
- Modify: `backend/app/services/dashboard/schemas.py` (`HouseholdMemberCreate` L10, `HouseholdMemberResponse` L16)
- Modify: `backend/app/api/dashboard.py` (routes L78–254), `backend/app/api/analytics.py` (`/{scope}` L49, `/{scope}/retry` L94)
- Test: `backend/tests/services/dashboard/test_member_details.py`, `backend/tests/api/test_member_details_routes.py`

**Interfaces:**
- Produces:
  - `normalise_pan_input(raw: str) -> str` (strip all whitespace, uppercase)
  - `class InvalidPanFormatError` (422 `invalid_pan_format`, message `"Enter a valid PAN: 5 letters, 4 digits, then 1 letter."`, regex `^[A-Z]{5}[0-9]{4}[A-Z]$`)
  - `class DetectedPanMismatchError(detected_pan_masked: str)` (409 `detected_pan_mismatch`)
  - `class PanOnOtherMemberError(other_member_id, other_member_name, can_merge: bool)` (409 `pan_belongs_to_other_member`)
  - `CrossAccountPanBlockedError` reused (409 `cross_account_pan_blocked`)
  - `MemberDetailsRequest(name: str | None = None, relationship: Relationship, relationship_other_label: str | None = None, pan: str)`
  - `complete_member_details(db, user_id: uuid.UUID, member_id: uuid.UUID, body: MemberDetailsRequest) -> HouseholdMember`
  - `refresh_other_account_locks(db, user_id: uuid.UUID) -> int`: flips `pan_on_other_account` → `details_needed` when the other account no longer holds that hash (lazy, called from `list_members`)
  - `require_unlocked_member(db, user_id, member_id) -> HouseholdMember`: 404 if not owned, 403 `{"code": "member_details_required"}` if locked
  - Route `POST /household-members/{member_id}/details` → `HouseholdMemberResponse`
  - `HouseholdMemberResponse` gains `origin: str`, `lock_reason: str | None`, `details_required: bool`, `pan_masked: str | None` (from the claimed PAN, else the detected PAN, else None)
  - `create_household_member` applies `validate_person_name` (422 `invalid_name`) and sets `origin` (`onboarding` for self, `manual` otherwise), `name_source=user_entered`, `details_completed_at=now`, `lock_reason=None`
- Rules:
  - **Locked member:**
    - format check → L2
    - has `detected_pan_hash` and the typed hash differs → L3 `DetectedPanMismatchError(mask of the detected PAN)`
    - the hash is another member's in this account → L4 `PanOnOtherMemberError(can_merge = source has no detected PAN)`
    - the hash is on another account → L5: save relationship, set `lock_reason=pan_on_other_account`, commit, then raise `CrossAccountPanBlockedError`
    - otherwise claim permanently: `pan_source = cas` if it equals the detected PAN, else `user_entered` with `pan_verified_at=None`; set `details_completed_at=now`, `lock_reason=None`, clear `detected_pan_*`
  - Name-only people skip L3 and get `pan_source=user_entered`, unverified.
  - **Unlocked member (update-only, L9):** conflicts raise the same errors **without any side effect**. Never touches `details_completed_at` / `lock_reason`. The same PAN as already claimed → 200 with no change (idempotent retry, spec fix 3).
  - A name edit inserts `HouseholdMemberNameChange(reason=user_edit)`.
  - Every member-scope route in `dashboard.py` (holdings, distributor-comparison, allocation, sips, sips/monthly, cash-flow, snapshots) and `analytics.py` for a member-id scope uses `require_unlocked_member`. Aggregate routes include locked members.

- [ ] **Step 1: Write the failing tests**

```python
def test_unlock_with_matching_pan_completes_member(...): ...
def test_unlock_normalises_lowercase_spaced_pan(...): ...        # "bxqps 5678l" (Review Focus 3)
def test_unlock_bad_format_is_422(...): ...
def test_unlock_detected_mismatch_is_409_with_masked_hint(...): ...  # detail.details.detected_pan_masked == "BX******8L"
def test_unlock_pan_on_other_member_offers_merge_only_for_name_only(...): ...
def test_unlock_pan_on_other_account_saves_relationship_and_stays_locked(...): ...
def test_unlock_name_only_person_is_user_entered_unverified(...): ...
def test_retry_same_pan_on_unlocked_member_is_200(...): ...
def test_edit_unlocked_member_conflict_changes_nothing_and_stays_unlocked(...): ...  # L9 + I15
def test_member_routes_403_while_locked_and_aggregate_includes_them(...): ...
def test_refresh_other_account_locks_flips_to_details_needed(...): ...
def test_create_member_validates_name_and_sets_origin(...): ...
def test_list_members_response_has_lock_fields(...): ...
```

- [ ] **Step 2: Run, expect FAIL** — `cd backend && pytest tests/services/dashboard/test_member_details.py tests/api/test_member_details_routes.py -v`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run, expect PASS.** Also run `cd backend && pytest tests/api -q`, since the member-scope gate touches every dashboard route test.
- [ ] **Step 5: Commit** — `git commit -m "feat(members): unlock details, lock gate, never-relock behaviour"`

### Task 12: Merge a name-only duplicate into an existing member (M11)

**Files:**
- Create: `backend/app/services/dashboard/member_merge.py`
- Modify: `backend/app/services/dashboard/snapshots.py` (add after `get_snapshots` L45)
- Modify: `backend/app/api/dashboard.py`
- Test: `backend/tests/services/dashboard/test_member_merge.py`, `backend/tests/services/dashboard/test_snapshots.py`

**Interfaces:**
- Produces:
  - `invalidate_member_snapshots(db, household_member_ids: list[uuid.UUID]) -> int` in `snapshots.py` (deletes `PortfolioSnapshot` rows; no commit)
  - `@dataclass class MergeResult: folios_moved: int; transactions_dropped: int`
  - `class MergeNotAllowedError` (409 `merge_not_allowed`): the source must be locked, have no detected PAN and not be self; the target must be owned by the same user
  - `merge_member_into(db, user_id: uuid.UUID, source_id: uuid.UUID, target_id: uuid.UUID) -> MergeResult`
  - Route `POST /household-members/{member_id}/merge-into/{target_id}` → `{"folios_moved": int, "transactions_dropped": int}`
- Rules (spec M11 flow, one transaction):
  - same (scheme, folio number) on the target → move transactions, drop 5-column duplicates, delete the source folio
  - else re-point the folio to the target
  - re-point `imports.household_member_id`
  - `invalidate_member_snapshots([source, target])`
  - delete the source's `AnalyticsSection` rows
  - insert `HouseholdMemberMerge`
  - delete the source member
  - `bump_recompute_generation`
  - after commit, claim the recompute and invalidate the holdings cache for both

- [ ] **Step 1: Write the failing tests**: `test_merge_moves_folios_and_drops_duplicates`, `test_merge_repoints_imports_and_logs_audit`, `test_merge_refuses_member_with_detected_pan`, `test_merge_refuses_unlocked_source`, `test_merge_keeps_target_unlocked`, `test_invalidate_member_snapshots_deletes_only_those_members`.
- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(members): merge name-only duplicate into existing member"`

### Task 13: Deletion by person, by statement, by portfolio, and the jobs (M17)

**Files:**
- Create: `backend/app/services/import_/deletion.py`
- Modify: `backend/app/api/imports.py` (`delete_household_import` L79–138 becomes a thin route; `list_household_import_history` L64; `_history_item` L52)
- Modify: `backend/app/api/dashboard.py`
- Modify: `backend/app/services/auth/account_deletion.py:50` (`hard_delete_expired_accounts`)
- Modify: `backend/app/services/import_/schemas.py` (`HouseholdImportHistoryItem` L72, `DeleteImportResponse` L82)
- Test: `backend/tests/services/import_/test_deletion.py`, `backend/tests/api/test_import_history_delete_routes.py`, `backend/tests/services/auth/test_account_deletion.py` (or wherever `hard_delete_expired_accounts` is tested today)

**Interfaces:**
- Produces:
  - `DeleteScope = Literal["person", "group"]`
  - `@dataclass class DeleteResult: deleted_transactions_count: int; removed_member_ids: list[uuid.UUID]; deleted_file: bool`
  - `delete_import(db, user_id: uuid.UUID, import_id: uuid.UUID, scope: DeleteScope, storage: FileStorage = default_file_storage) -> DeleteResult`
  - `delete_member_portfolio(db, user_id: uuid.UUID, member_id: uuid.UUID, remove_member: bool, storage: FileStorage = default_file_storage) -> DeleteResult`
  - Route `DELETE /imports/{import_id}?scope=person|group` (default `person`, today's behaviour)
  - Route `DELETE /household-members/{member_id}/portfolio?remove_member=true|false`
  - `DeleteImportResponse` gains `removed_member_ids: list[str]`, `deleted_file: bool`
  - `HouseholdImportHistoryItem` gains `upload_group_id: str | None`, `member_name: str`, `group_people_count: int`
- Rules (spec M17 table):
  - Delete the transactions of the import(s); delete folios left empty (else `evaluate_folio_coverage_gaps`); delete the import rows.
  - `release_file_if_unreferenced` for each affected reference.
  - A locked `cas_detected` member left with no imports is removed. A complete member is kept unless `remove_member`. Self is never removed, and its PAN is untouched.
  - `invalidate_member_snapshots` for affected members (fixes the snapshot gap from the backend map); delete their `AnalyticsSection` rows; `bump_recompute_generation`.
  - After commit: invalidate holdings caches and claim a recompute.
  - `hard_delete_expired_accounts` also deletes `HouseholdMemberNameChange` and `HouseholdMemberMerge` rows, and calls `storage.delete` once per distinct `file_reference`.

- [ ] **Step 1: Write the failing tests**

```python
def test_delete_person_scope_keeps_other_people_and_the_file(...): ...
def test_delete_group_scope_removes_all_rows_and_the_file(...): ...
def test_delete_removes_locked_member_left_empty_keeps_complete_member(...): ...
def test_delete_never_removes_self_or_its_pan(...): ...
def test_delete_member_portfolio_across_statements_with_and_without_remove(...): ...
def test_delete_clears_snapshots_and_analytics_and_bumps_generation(...): ...
def test_history_items_carry_group_fields(...): ...
def test_hard_delete_removes_audit_rows_and_each_file_once(...): ...
```

- [ ] **Step 2: Run, expect FAIL** — `cd backend && pytest tests/services/import_/test_deletion.py tests/api/test_import_history_delete_routes.py -v`
- [ ] **Step 3: Implement** by moving today's inline route logic into `deletion.py` first, then extending it.
- [ ] **Step 4: Run, expect PASS.** Then run the full backend suite: `cd backend && pytest -q`.
- [ ] **Step 5: Commit** — `git commit -m "feat(import): person, statement and portfolio deletion with file and cache cleanup"`

---

## Part D · Frontend

### Task 14: Onboarding: name as per PAN, no household question

**Files:**
- Modify: `frontend/src/features/auth/Q1Name.tsx:82,92,114,148`
- Modify: `frontend/src/features/auth/validation.ts`
- Create: `frontend/src/features/auth/relationships.ts`
- Modify: `frontend/src/features/auth/onboardingSteps.ts:1-24`, `OnboardingFlow.tsx:11-15,62,154-239`, `SoloCasUpload.tsx:7-10`
- Delete: `Q4Household.tsx`, `AddFamilyMembers.tsx`, `AddFamilyMembers.test.tsx`, `FamilyCasUpload.tsx`, `UploadMyCas.tsx`, `ParseQueue.tsx`, `FamilyImportFlow.tsx`, `FamilyImportFlow.test.tsx`
- Test: `frontend/src/features/auth/OnboardingFlow.test.tsx`, `frontend/src/features/auth/validation.test.ts`, `frontend/src/features/auth/Q1Name.test.tsx` (new)

**Interfaces:**
- Produces:
  - `RELATIONSHIP_OPTIONS: { value: Exclude<Relationship, "self">; label: string }[]` = Spouse, Parent, Child, Sibling, Other, in that order
  - `validatePersonName(raw: string): string | null`, with the same three messages as Task 3
- Copy (spec Part 1): heading stays `What should we call you?`; subtext `Type your name exactly as it is printed on your PAN card.`; label `Full name as per PAN`; placeholder `Full name as per PAN`; helper `Initials are fine if your PAN card uses them.`
- `ONBOARDING_STEPS` drops `q4_household`, `add_family`, `family_cas_upload`, `upload_my_cas`, `parse_queue`. `trust_primer` continues to `cas_upload`. `SoloCasUpload` loses `onGoToHousehold`; its back action returns to `trust_primer`. `SoloCasUpload` still creates the self member on mount; that is the "leaving the privacy page" moment in the spec.

- [ ] **Step 1: Write the failing tests**: `Q1Name shows PAN copy` (asserts the four strings and the absence of the old subtext); `continue from privacy page goes to upload` (no "Just me" text rendered); `validatePersonName` cases matching Task 3.
- [ ] **Step 2: Run, expect FAIL** — `cd frontend && npx vitest run src/features/auth`
- [ ] **Step 3: Implement.** Delete the family files and their tests, then remove their imports.
- [ ] **Step 4: Run, expect PASS**, plus `cd frontend && npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(onboarding): name as per PAN and straight to upload"`

### Task 15: Import API client, types, prompt parsing, shared flow hook

**Files:**
- Modify: `frontend/src/features/import/types.ts`, `frontend/src/features/import/api.ts`
- Create: `frontend/src/features/import/importPrompt.ts` (replaces `panConflict.ts`; keep `getPanConflict` re-exported from it until Task 19)
- Create: `frontend/src/features/import/useImportFlow.ts`
- Modify: `frontend/src/features/auth/types.ts:49-54` (`HouseholdMember`), `frontend/src/features/auth/api.ts`
- Test: `frontend/src/features/import/importPrompt.test.ts`, `frontend/src/features/import/useImportFlow.test.ts`

**Interfaces:**
- Produces types mirroring Task 6/9/11 schemas: `PersonPreview`, `NameNotice`, `SamePersonPrompt`, `PersonConfirmation`, `PersonConfirmResult`, `ImportPromptCode` (union of every 409 code in Tasks 6/7 plus `session_expired`), `ImportPrompt { code; message; sessionId: string | null; details: Record<string, unknown> }`. `ImportPreviewResponse` gains `people`, `unassigned_temp_ids`, `name_notices`, `same_person_prompts`, `expires_at`. `HouseholdMember` gains `origin`, `lock_reason`, `details_required`, `pan_masked`.
- Produces `getImportPrompt(err: unknown): ImportPrompt | null` (409 and 410).
- Produces api functions: `resolveName(sessionId, name)`, `resolveSelf(sessionId, personKey | null)`, `resolvePan(sessionId)`, `resolveSamePerson(sessionId, personKey, memberId, same)`, `acknowledgePrompt(sessionId, code)` → `Promise<ImportPreviewResponse>`; `confirmPeopleImport(sessionId, people: PersonConfirmation[]) → Promise<ImportConfirmResponse>` (calls `invalidateApiCache()`); `deleteHouseholdImport(importId, scope: "person" | "group")`; `deleteMemberPortfolio(memberId, removeMember)`; in `auth/api.ts`, `completeMemberDetails(memberId, body)` and `mergeMemberInto(sourceId, targetId)` (both call `invalidateApiCache()`).
- Produces `useImportFlow(householdMemberId: string)` returning `{ stage, preview, prompt, confirmResult, error, upload, resolve, confirm, cancel, dismissNotice }`:
  - `stage: "upload" | "parsing" | "prompt" | "notices" | "people" | "review" | "confirmed" | "error"`
  - `resolve(action: PromptAction)`, where `PromptAction` is a discriminated union: `{kind: "name", name}` | `{kind: "self", personKey}` | `{kind: "pan"}` | `{kind: "samePerson", personKey, memberId, same}` | `{kind: "acknowledge", code}` | `{kind: "discard"}`
  - Stage order after parse: `prompt` while a 409 is pending → `notices` while `name_notices` / `same_person_prompts` remain → `people` (skipped when there is one person and nothing unassigned or to name, I1) → `review` → `confirmed`. A 410 from any call → `prompt` with `code="session_expired"`.

- [ ] **Step 1: Write the failing tests**: `getImportPrompt` maps each code and ignores non-API errors; the hook walks `parse 409 self_name_mismatch → resolveName → notices → people → review → confirm` with mocked api; a single-person preview goes straight to `review`; a 410 on confirm becomes a `session_expired` prompt.
- [ ] **Step 2: Run, expect FAIL** — `cd frontend && npx vitest run src/features/import/importPrompt.test.ts src/features/import/useImportFlow.test.ts`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(import): API client, prompt parsing and shared import flow hook"`

### Task 16: Upload-time and review dialogs (U1–U7, U12, U13, C1–C3)

**Files:**
- Create in `frontend/src/features/import/prompts/`: `NameVariantNotice.tsx` (U1, plus M8 ask mode), `NameMismatchDialog.tsx` (U2), `WhichIsYouDialog.tsx` (U3), `PanMismatchDialog.tsx` (U4), `MemberNotInFileDialog.tsx` (U5), `AddDetailsFirstDialog.tsx` (U6), `PanOnOtherAccountDialog.tsx` (U12), `SamePersonDialog.tsx` (U13), `ConfirmFailedDialog.tsx` (C1), `SessionExpiredDialog.tsx` (C2), `CancelImportDialog.tsx` (C3), `PromptHost.tsx`
- Modify: `frontend/src/features/import/CrossAccountBlockedDialog.tsx` (U7: add `onInclude`)
- Test: `frontend/src/features/import/prompts/prompts.test.tsx`

**Interfaces:**
- Each dialog uses `@/components/ui/dialog` (as `PanConflictDialog` does). Props: `{ isOpen: boolean; <data from ImportPrompt.details>; <one callback per CTA> }`. Closing (×) calls the callback the spec names under "Ways out".
- `PromptHost({ prompt, notices, onResolve })` picks the dialog by `prompt.code`, or shows the notice queue.
- U6 "Add details now" opens `MemberDetailsDialog` from Task 18. `PromptHost` accepts `renderMemberDetails?: (memberId, onDone) => ReactNode` so this task doesn't depend on Task 18.
- Copy: verbatim from the catalogue cards U1–U7, U12, U13, C1–C3, including the first-upload U1 variant: `This statement says {statement}. You entered {entered}. We'll update your name to match your statement.`

- [ ] **Step 1: Write the failing tests**: one `describe` per dialog asserting its title, body copy with masked PANs, CTA labels, and each CTA's callback.
- [ ] **Step 2: Run, expect FAIL** — `cd frontend && npx vitest run src/features/import/prompts`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(import): upload-time and review dialogs"`

### Task 17: People popup, ribbon review, ImportFlow wiring

**Files:**
- Create: `frontend/src/features/import/PeopleFoundDialog.tsx`, `frontend/src/features/import/MemberRibbonReview.tsx`, `frontend/src/features/import/ReviewExpiryBanner.tsx`
- Modify: `frontend/src/features/import/ReviewTable.tsx:32-37,88-103`, `ImportFlow.tsx`, `ImportConfirmed.tsx:7-11`
- Test: `PeopleFoundDialog.test.tsx`, `MemberRibbonReview.test.tsx`, `ImportFlow.test.tsx`, `ReviewTable.test.tsx`, `ImportConfirmed.test.tsx`

**Interfaces:**
- `PeopleFoundDialog({ people, unassigned, onContinue(edits: { names: Record<string, string>; includes: Record<string, boolean>; owners: Record<string, string> }), onCancel })`:
  - Me first, labelled `(Me)`
  - `pan_masked ?? "(PAN not on statement)"`
  - a pencil for editing names; placeholders must be named (U9), else Continue is disabled
  - other-account rows greyed with `(already on another Unifolio account)` and an `Include in family total` toggle (U8)
  - "funds we couldn't match" owner pickers, defaulting to Me (U10)
  - "already in your family" and "details needed" tags
- `ReviewTable` gains `schemes?: SchemeMatchPreview[]` (defaults to `preview.schemes`), `onUnresolvedCountChange?: (n: number) => void`, `hideConfirm?: boolean`, and `matchedByName?: string[]` with a `Move to…` picker `onMove?(tempId, personKey)`.
- `MemberRibbonReview({ preview, people, onConfirmImports(people: PersonConfirmation[]), onCancel, confirming })`:
  - collapsed ribbons reading `Click to review {name}'s holdings ({n} unresolved holdings)`
  - one open at a time; ribbon `Confirm` collapses it and marks it reviewed
  - reopening keeps the ribbon's choices
  - `Confirm imports` is enabled only when every ribbon is reviewed (I11)
  - excluded people get no ribbon
- `ReviewExpiryBanner({ expiresAt })` shows at `expiresAt - 5 min`: `Your review closes in 5 minutes. Confirm imports to save it.`
- `ImportConfirmed` shows per-person totals from `result.people`.
- `ImportFlow` keeps its props and renders from `useImportFlow`. Its 404 "session expired" `reviewNotice` is replaced by C2.

- [ ] **Step 1: Write the failing tests**: ribbon copy with a live unresolved count; Confirm imports gating; reopen keeps choices; placeholder name blocks Continue; the include toggle adds a ribbon; the owner picker moves a fund; the expiry banner appears at 55 min (fake timers); an end-to-end `ImportFlow` test (mocked api) runs parse → people → two ribbons → `confirmPeopleImport` called with both people.
- [ ] **Step 2: Run, expect FAIL** — `cd frontend && npx vitest run src/features/import`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run, expect PASS**, plus `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(import): people popup, ribbon review and multi-person confirm"`

### Task 18: Dashboard: locked members and the unlock popups

**Files:**
- Create in `frontend/src/features/dashboard/members/`: `MemberDetailsDialog.tsx`, `ConfirmLeaveDialog.tsx`, `PossibleDuplicateDialog.tsx` (L4), `OtherAccountDialog.tsx` (L5/L8), `EditMemberDialog.tsx` (L9)
- Modify: `frontend/src/features/dashboard/NavigationShell.tsx:14-29,119-140`, `MainDashboardFlow.tsx:24-61,91-159`
- Test: `frontend/src/features/dashboard/members/members.test.tsx`, `MainDashboardFlow.test.tsx`, `NavigationShell.test.tsx`

**Interfaces:**
- `MemberOption` gains `locked: boolean` and `lockReason: "details_needed" | "pan_on_other_account" | null`. `NavigationShellProps` gains `onLockedMemberSelect: (memberId: string) => void`; locked rows show a lock icon.
- `MemberDetailsDialog({ member, onUnlocked(member), onCancel })`:
  - fields: Name (editable), Relationship select from `RELATIONSHIP_OPTIONS`, `How are you related?` shown only for Other, and PAN
  - Continue / Cancel
  - inline errors L1, L2, L3 (with the masked hint), L7
  - L4 → `PossibleDuplicateDialog` (`Merge into {name}` / `Check the PAN`)
  - L5 → `OtherAccountDialog`
  - typed values survive Cancel → Enter details
- `ConfirmLeaveDialog` CTAs: `Enter details` / `Back to dashboard`.
- In `MainDashboardFlow`: picking a `details_needed` member opens the details dialog with `viewMode` still aggregate; picking a `pan_on_other_account` member opens `OtherAccountDialog` (L8); on unlock success → `invalidateApiCache()`, reload members, `viewMode="member"`, select them. The Add data picker shows locked members disabled with `Add details first`, which opens the details dialog (A1). `EditMemberDialog` is reachable from the member view header for unlocked members.

- [ ] **Step 1: Write the failing tests**: a locked member opens the dialog, not the view; Other shows the label field; each error state renders its copy; Cancel → confirm-leave → Enter details restores typed values; success switches to member view and the lock icon is gone; the merge path calls `mergeMemberInto`; the A1 picker row is disabled and opens the dialog.
- [ ] **Step 2: Run, expect FAIL** — `cd frontend && npx vitest run src/features/dashboard`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** — `git commit -m "feat(dashboard): locked members and unlock flow"`

### Task 19: Deletion dialogs and mobile parity

**Files:**
- Create: `frontend/src/features/profile/DeleteImportDialog.tsx` (D1), `frontend/src/features/profile/DeletePortfolioDialog.tsx` (D2), `frontend/src/features/profile/HouseholdMembersSection.tsx`
- Modify: `frontend/src/features/profile/ImportHistorySection.tsx:7-10,94`
- Modify: `frontend/src/mobile/features/import/MobileImportView.tsx:41-164`, `MobileReviewView.tsx`
- Delete: `frontend/src/features/import/panConflict.ts`, `panConflict.test.ts` (once mobile uses `importPrompt.ts`)
- Test: `frontend/src/features/profile/ImportHistorySection.test.tsx`, `HouseholdMembersSection.test.tsx`, `frontend/src/mobile/features/import/MobileImportView.test.tsx`

**Interfaces:**
- `DeleteImportDialog({ item, onDelete(scope), onKeep })`: radio `Only {name}'s funds from this statement` / `Everyone in this statement ({n} people)`, plus the note on people who will be removed.
- `DeletePortfolioDialog({ member, statementsCount, onDelete(removeMember), onKeep })`: includes the `Also remove {name} from my family` checkbox and the re-upload warning.
- `HouseholdMembersSection` lists members on the profile page with a `Delete all funds` action. The spec says "a member's menu" but doesn't place it; this plan puts it on the profile page next to Import History.
- `MobileImportView` replaces its duplicated parse/confirm logic with `useImportFlow` and reuses `PromptHost`, `PeopleFoundDialog` and `MemberRibbonReview`. `MobileReviewView` keeps only the mobile layout.

- [ ] **Step 1: Write the failing tests**: history groups by statement and D1 sends the scope; D2 sends `removeMember`; the mobile flow reaches the ribbons with a mocked two-person preview.
- [ ] **Step 2: Run, expect FAIL** — `cd frontend && npx vitest run src/features/profile src/mobile/features/import`
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run the full frontend suite, expect PASS**: `cd frontend && npm test && npx tsc --noEmit`
- [ ] **Step 5: Commit** — `git commit -m "feat(import): deletion dialogs and mobile parity"`

---

## Part E · Docs

### Task 20: PRD amendments and project records

**Files:**
- Modify:
  - `Docs/PRDs/Updated-CAS-PRD.md:222` and FR-4 L279–300 (restore "PAN" where the text says "password")
  - `Docs/PRDs/PRD-02-Signup-Onboarding.md:85,233,281-284`
  - `Docs/PRDs/PRD-01-CAS-Parser-v2.md:175`
  - `Docs/PRDs/App-Flow-Unifolio.md:33-34,75-76,122-124`
  - `Docs/PRDs/Database-Schema-Unifolio.md`
  - `DEFERRED_FEATURES.md`
  - `database.md`, `backend.md`, `decisions.md`, `log.md`, `session.md`

- [ ] **Step 1:** Apply the amendment text from the spec's "R6 in detail" table verbatim to each PRD line.
- [ ] **Step 2:** Add to `DEFERRED_FEATURES.md`: minors' folios (M5/I6), Ask for access to another account's member (option C, I7), general merge tool (M11).
- [ ] **Step 3:** Record migration 0018 in `Database-Schema-Unifolio.md` and `database.md`; the new endpoints in `backend.md`; decisions I1–I16 in `decisions.md`; a dated entry in `log.md`; overwrite `session.md`.
- [ ] **Step 4: Commit** — `git commit -m "docs: amend PRDs and records for CAS member detection"`

---

## Self-review notes

- **Spec coverage:** each of the spec's sections maps to a task:
  - Parts 1–6 → Tasks 14, 14, 4–6, 17, 17, 18
  - S1–S3 → Tasks 5–7, 9
  - U1–U13 → Tasks 6, 7, 16, 17
  - C1–C3 → Tasks 7, 9, 16, 17
  - L1–L9 → Tasks 11, 12, 18
  - A1 → Task 18
  - D1–D2 → Tasks 13, 19
  - Cross-account option B → Tasks 6, 9, 11
  - M9 → Tasks 6, 7, 18
  - M11 → Tasks 12, 18
  - M16 → Tasks 7, 17
  - M17 → Tasks 13, 19
  - M18 → Task 10
  - Unlocked is permanent → Tasks 1, 7, 11
  - Schema and jobs → Tasks 1, 8, 13
  - PAN masking → Task 2
  - Name check → Task 3
  - Fallbacks → Tasks 4, 17
  - R6 → Task 20
- **Where this plan adds to or differs from the spec, for your review:**
  - `POST /imports/sessions/{id}/acknowledge` (for U5/U6/U7) isn't named in the spec's API table. It exists so every prompt is answered the same way and returns the preview.
  - U7 and U8 reuse the code `cross_account_pan_blocked` with the session kept.
  - The Review session expiry becomes a 410 on `/imports/confirm` too (today it's a 404).
  - D2 is placed on the profile page.
  - `/cas-imports` answers 409 `review_required` instead of being removed.
- **Known risk carried from the spec:** holder-name extraction depends on casparser's internal `extract_pages` and on real CAS layouts. Task 4 Step 6 must run against real CAMS and KFintech statements before Part B starts.
