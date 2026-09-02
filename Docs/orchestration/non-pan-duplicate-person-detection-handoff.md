# Handoff: non-pan-duplicate-person-detection

**Status:** OPEN (2026-09-02)
**Parent:** User instruction 2026-09-02 (see `CLAUDE.md` Session State) — the same real person must not silently end up entered twice (two CAS uploads, or two household members) — **without persisting PAN**, per this codebase's existing test-guarded rule (`tests/models/test_no_pan_field.py`, ADR-004). User's own framing: "it's okay if the statements don't need to be the same" (i.e. two *different* CAS statements for the same real person must still be catchable, not just byte-identical re-uploads) and this needs to be "extensive."
**Dispatch mode:** User is running this directly in their own Codex CLI/app session (not via Claude's `codex:codex-rescue` Agent dispatch) — this doc is the source of truth both sides read; update `Status` here after Codex finishes and report back.

## Design summary (read before the task list — this is the reasoning, not just the diff)

The existing "Family Member Attribution Engine" (`app/services/import_/attribution.py`, `resolve_attribution`) already solves a *narrower* version of this: matching a freshly-parsed CAS statement to the right `HouseholdMember` **within the current user's own household**, using normalized name + email-to-self matching. It does not, and structurally cannot, catch the two real duplicate-person scenarios this task targets:

1. **Same user, same real person entered as two different household members** (e.g. two "Ayush"-shaped entries that didn't fuzzy-match on name because of how each CAS statement spells the name) — `resolve_attribution`'s name/email signal is the only thing it has, and name matching alone is exactly the weak signal that lets this slip through.
2. **Two different Unifolio user accounts each importing a CAS for the same real individual** (e.g. two spouses each sign up separately, and one imports the other's statement into their own household, or a person creates a second Unifolio account and re-uploads their own CAS there) — `resolve_attribution` never looks outside `user_id`, by design (it's the household-scoped part of the problem), so this case is currently invisible to the system entirely.

**The strongest available non-PAN signal for both is `(folio_number, amc_name)`.** A folio number is AMC-issued to exactly one real investor for a given AMC relationship — CAMS/KFintech CAS statements already expose it, and this codebase already persists it (`Folio.folio_number` + `Scheme.amc_name` via `Folio.scheme_id`). If the exact same `(folio_number, amc_name)` pair shows up attached to two different `household_member_id`s anywhere in the system, that is very strong evidence of the same real person, independent of how their name was spelled or which AMC's statement was uploaded. It is not persisted as new PII — it's a join over data the app already stores for its core holdings functionality, not a new field being added for surveillance purposes.

Name/email matching is kept as a secondary, weaker signal (already exists for case 1; extended cross-user for case 2) precisely because it's the thing that misses same-person cases when spelling/formatting differs, and produces false positives on common Indian names — so it's treated as advisory, not blocking, everywhere it's used outside the current within-household flow it already gates today.

**The two cases get different remedies, not the same one**, because they cross different privacy boundaries:

- **Case 1 (same user)** is a same-tenant problem — the user already owns both records, so a confirmed match can safely let them redirect the import onto the existing member (exactly `resolve_attribution`'s existing `MISMATCH_CONFIRMATION_REQUIRED` mechanism, just fed a stronger signal). No new privacy exposure.
- **Case 2 (cross-user)** must **never** expose one user's household/member data to another user, and must **never** auto-merge or auto-redirect data across the account boundary — that would be a serious cross-tenant data leak, not a UX nicety. The only safe action is a **non-blocking, identity-free warning** to the uploading user ("this may already be tracked under a different Unifolio account — if that's you, use that account instead, or contact support") with zero detail about the other account. It must not stop the import from completing.

## Task

### 1. Extend `resolve_attribution`'s within-household matching with the folio signal (Case 1)

`app/services/import_/attribution.py`, `resolve_attribution` (lines 50-113): before or alongside the existing name-normalization matching loop (lines 71-75), add a folio-based match pass scoped to the same `user_id` (same query scope as today — this is not the cross-user extension, that's item 2):

```python
parsed_folio_keys = {(s.folio, s.amc) for s in parse_result.schemes}
folio_matched_member: HouseholdMember | None = None
if parsed_folio_keys and members:
    existing_folios = (
        db.query(Folio)
        .join(Scheme, Folio.scheme_id == Scheme.id)
        .filter(Folio.household_member_id.in_([m.id for m in members]))
        .all()
    )
    folio_key_to_member_id = {
        (f.folio_number, f.scheme.amc_name): f.household_member_id for f in existing_folios
    }
    for key in parsed_folio_keys:
        if key in folio_key_to_member_id:
            folio_matched_member = next(
                (m for m in members if m.id == folio_key_to_member_id[key]), None
            )
            if folio_matched_member:
                break
```
(exact query shape — e.g. whether `Folio.scheme` needs an explicit relationship/eager-load or a manual `Scheme` join dict, matching whatever's idiomatic elsewhere in this file's neighbors like `holdings.py`/`allocation.py` — is an implementation detail; the important part is: build the set of `(folio_number, amc_name)` pairs the freshly-parsed statement contains, and check whether any of them already exist under a *different* member of the same household.)

Give the folio match **priority over** the existing name match when both are present (it's the stronger signal) — restructure the matching order so `matched_member = folio_matched_member or <existing name/email match result>`. If the folio match points to the *same* member already selected (`selected_member_id`), that's just a normal `AUTO_MATCHED` case, not a mismatch. If it points to a *different* member, that's a `MISMATCH_CONFIRMATION_REQUIRED` exactly as today's name-based mismatch already handles — no new `AttributionStatus` needed, this is additive signal strength on an existing status, not a new code path. Update `prompt_message` for a folio-based mismatch to be honest about why it matched (don't reuse the name-based wording verbatim if it would be misleading, e.g. "This folio (12345/67 at ICICI Prudential) is already linked to {member.name} — import for {member.name} instead?" rather than implying a name match that didn't actually happen).

### 2. New cross-user advisory check (Case 2)

New function in `attribution.py` (or a new small module `app/services/import_/cross_account_duplicate.py` if keeping `attribution.py` scoped to "within this user's household" reads cleaner — Codex's call, not load-bearing either way):

```python
@dataclass
class CrossAccountDuplicateWarning:
    detected: bool
    reason: str  # e.g. "folio_match" | "name_match" — for logging/support, not shown verbatim to the user
```

```python
def detect_cross_account_duplicate(
    db: Session, user_id: uuid.UUID, parse_result: ParseResult
) -> CrossAccountDuplicateWarning | None:
    """Advisory only — never blocks an import, never returns or logs the
    other account's identity/data. Folio match is the primary signal;
    name match is a much weaker secondary one and should be treated as
    lower-confidence in whatever `reason` value / logging this produces."""
```
Query scope: same `(folio_number, amc_name)` join as item 1, but **without** the `Folio.household_member_id.in_([...])` restriction to the current user's own members — instead, join through `HouseholdMember.user_id != user_id` to search every *other* user's folios. Return `detected=True, reason="folio_match"` on any hit — do not return which user/member matched, do not log the other user's id/name/email anywhere reachable by the current request's response or by this user's own logs (a shared application-level log is fine if it's genuinely operator-only and not user-facing, but default to NOT logging identifying details at all unless there's already an established operator-log precedent in this codebase for cross-tenant signals — check before assuming one exists).

For the weaker name-based cross-user signal: reuse `_normalize()` on `parse_result.investor.name` and compare against other users' `HouseholdMember.name` values (already-persisted, ordinary display names — not new PII) — but treat a name-only hit as materially weaker than a folio hit in the returned `reason` (e.g. `reason="name_match"` vs `"folio_match"`), since common-name false positives are a real risk at this signal alone.

Call this from `lifecycle_service.py`'s `confirm_cas_import`/`retry_cas_import_password` (the two `resolve_attribution(...)` call sites, ~lines 215 and 269) right after `resolve_attribution` resolves `target_member_id`. On `detected=True`, attach a non-blocking warning to the `Import` record's response — check whether `Import`/the confirm-endpoint's response schema already has a place for non-fatal warnings (e.g. `parse_warnings` on `ParseResult` is the existing precedent for "surface this but don't block" — mirror that shape/field name convention rather than inventing a new one) — and continue the import exactly as it would have without this check. **This must never change `import_rec.status`, never raise, never block `_commit_parsed_transactions`.**

### 3. Frontend surfacing

Grep for how `parse_warnings` (the existing precedent for a non-blocking parse-time notice) is currently rendered/surfaced to the user after an import, and mirror that exact pattern for the new cross-account warning banner/toast — don't design new UI chrome for this if an equivalent notice-surfacing component already exists. Copy should be generic and non-alarming (e.g. "This investment may already be tracked under a different Unifolio account. If that's you, consider using that account instead."), never naming the other account.

## Constraints

- **No PAN persistence anywhere in this task** — this is the whole point of the task, not a side constraint. Do not touch `pan_masked` (`ParsedInvestor.pan_masked`), do not add any PAN-shaped field to any model, do not extend `tests/models/test_no_pan_field.py`'s guarded surface. If implementation reveals PAN would make this meaningfully more accurate, stop and flag it back rather than adding it — that decision boundary was explicitly and deliberately set by the user this session and is not Codex's call to relitigate.
- **Case 2 (cross-user) must never leak the other account's data** — this is a hard privacy boundary, not a nice-to-have. No test should assert (and no code path should produce) a response, log line reachable by the requesting user, or API field that reveals the other user's id, household member name, email, or holdings. If genuinely unsure whether a piece of information is safe to include, exclude it and flag back.
- **Case 2 must never block, redirect, or auto-merge** — false positives here (folio number reused across unrelated AMCs by coincidence, or someone legitimately running two separate Unifolio accounts on purpose) would otherwise lock a real user out of their own import. Advisory only.
- Decimal, never float — this task touches no money math at all (pure identity/matching logic), but don't introduce any incidentally.
- Follow this codebase's existing degrade-gracefully posture (`nav.py`/`amfi_ter_client.py`'s docstrings are the established convention) — any failure in the new duplicate-detection queries (e.g. a malformed parsed folio list) must not crash the import; catch narrowly and treat as "no signal found," matching how `resolve_attribution` already treats an unmatched statement as `UNRECOGNIZED_MEMBER` rather than raising.
- Run the full backend test suite — must stay green. Add tests for: (a) Case 1's folio-based mismatch taking priority over a weaker/absent name match, (b) Case 1's folio match pointing to the already-selected member resolving as `AUTO_MATCHED` not a mismatch, (c) Case 2 detecting a folio-match duplicate across two distinct `user_id`s and confirming the returned warning carries no identifying detail about the other user, (d) Case 2 NOT firing when the only overlap is with the *same* user's own household (that's Case 1's job, not Case 2's), (e) Case 2 being non-blocking — the import still completes successfully when a warning is detected.
- Keep `tests/models/test_no_pan_field.py` green and unmodified unless it needs a new guarded surface added (extending its coverage is fine; weakening it is not).

## Approaches considered and rejected

- **A DB-level uniqueness constraint on `(scheme_id, folio_number)` across all household members** — rejected. A hard constraint would incorrectly reject legitimate cases this system can't yet distinguish from real duplicates (e.g. a genuinely shared/joint folio, or a rare coincidental folio-number collision across unrelated AMCs if AMC attribution is ever imperfect) — this needs to be a soft, confirmable signal (Case 1) or a non-blocking advisory (Case 2), not a hard rejection.
- **Persisting masked PAN (`pan_masked`) for matching** — rejected outright per explicit user instruction this session; even though it's already computed transiently and never stored today, extending its lifetime/use for dedup would mean starting to persist PAN-derived data, which is exactly what was ruled out.
- **Auto-merging households or auto-redirecting a cross-user match (Case 2) onto the existing member** — rejected; this would silently move one user's financial data under another user's account, a serious cross-tenant integrity/privacy violation. Only a same-tenant match (Case 1) is safe to auto-offer a redirect for.
- **Treating name/email as the primary signal (extending existing behavior only, no folio signal)** — rejected; this is the status quo and is exactly what's already known to miss same-person-different-spelling cases — the user explicitly wants something stronger and "extensive" than what already exists.

## Open questions

- Whether this codebase already has any operator-facing (not user-facing) logging precedent for cross-tenant signals that would be an acceptable place to log a Case 2 hit's other-account id for potential manual support follow-up (e.g. "two accounts may represent the same person, a human should look at this") — flag back rather than assuming one exists or inventing a new logging channel unilaterally.
- Whether `Import`'s response schema has an existing "non-fatal warnings" field/convention to reuse for the Case 2 warning, or whether one needs to be added — check `parse_warnings`' usage sites first; if no existing precedent evidently fits, flag back before inventing a new API contract shape.
- Confidence threshold/rollout question left to product: should Case 2's warning be shown at all right now, or logged-only for now until there's a sense of the false-positive rate at scale? Not blocking implementation (build both the detection and the warning surfacing), but flag this as a real product open question rather than deciding unilaterally that user-facing display is definitely correct from day one.
