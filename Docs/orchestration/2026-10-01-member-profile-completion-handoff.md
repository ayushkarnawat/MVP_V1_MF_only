# Member Profile Completion: session handoff (2026-10-01)

Paste this into the next session, or point it at this file. It is self-contained.

## What this feature is

This feature removes the "locked detected family member" concept from the CAS import flow:
- Detected members' dashboards open straight away, with no unlock popup and no 403.
- A detected member's **name and PAN are saved at Confirm imports**, encrypted and stored exactly like Self's PAN: `encrypt_pan` → `pan_encrypted`, `hash_pan` → the unique `pan_lookup_hash`, with `pan_source='cas'` and `pan_verified_at`.
- **Other members' PANs are never reserved at upload** (user decision A). Self's upload-time pending claim is unchanged.
- A PAN that another Unifolio account already holds goes, still encrypted, to `detected_pan_*` with `pan_conflict='other_account'`.
- A "% complete" nudge opens one Complete-profile popup with these fields:
  - name: editable
  - PAN: greyed, or typed and required if the member has none
  - relationship: optional
  - phone and email
- Exit asks "Skip completing…?". Save writes only the fields entered. At 100% a success state shows.
- The same data appears in Account → Family members.

## Source of truth (read in this order)

1. **Spec, binding:** `Docs/orchestration/member-profile-completion-map.html`, artifact https://claude.ai/artifact/8oEaUu5UDtkP9dptxrroux (v5). Everything under "Decided (1 Oct review)" is binding.
2. **Plan:** `Docs/superpowers/plans/2026-10-01-member-profile-completion.md`. It has 10 tasks with full code, tests, and Global Constraints. It was edited after it was written:
   - Task 3's `can_merge` is now `member.origin == MemberOrigin.CAS_DETECTED`.
   - Task 4 follows the user's ruling below on edited names.
3. **SDD workspace (git-ignored, on disk):** `.superpowers/sdd/2026-10-01-member-profile-completion/`
   - `progress.md`: the ledger, with every ruling and the preflight scan
   - `task-N-brief.md`: briefs for Tasks 1–3 already extracted
   - `task-1-report.md`, `task-2-report.md`: the implementers' full reports, including test evidence
   - `review-*.diff`: the review packages
   - `snap.sh`: the no-commit snapshot helper (see Process)

## User decisions made in this session (all binding)

| # | Decision |
|---|---|
| Timing | Detected member's name and PAN are saved at **Confirm imports** (same step as Self's PAN becomes permanent). Relationship / phone / email saved only on popup **Save**. |
| A | **No upload-time PAN reservation for other members.** PAN written only at Confirm. |
| Encryption | Detected PANs must be encrypted and stored **the same way as Self's** (same columns, same unique index). |
| Relationship | **Optional.** Nothing in the popup is required, except PAN for a member with no PAN at all. |
| Q1 | Name **editable** (supersedes the morning's "names can't be edited" rule). On a later CAS, an edited name (`name_source='user_edited'`) follows **exactly the current CAS name rules**: mismatch → existing name-mismatch prompt ("ask"); longer variant → auto-update; shorter/equal → kept. Only onboarding (`user_entered`) names are replaced silently. |
| Q2 | Member with no PAN: PAN **editable, required, counts** toward %. |
| Q3 | PAN on another account: dashboard **opens**, with a **clearly visible red banner**; every Save that leaves the conflict also shows a **second warning popup**. Max 80%. |
| Q4 | Self has a % too; in Self's popup phone/email are **read-only** with a "Change in Account Info" link; relationship always Self. |
| Q5 | 20% per field (name, PAN, relationship, phone, email). **Exit shows a skip confirmation.** |
| Process | **Never commit** (user commits manually). **Run only affected tests**, never full suites. Workers: **Claude subagents** (Codex unavailable). Sonnet by default, Opus for the riskiest tasks + final review. |

## Progress

| Task | State |
|---|---|
| 1. Schema, migration `0023`, response shape, read gate removed | **Complete.** Reviewed; fix round 1 applied; re-review clean. |
| 2. Confirm saves real PAN; import lock prompts removed | **Implemented, reviewed. Fix round NOT done.** See "Open for Task 2" below. |
| 3. `PUT /household-members/{id}/profile` | Not started (brief extracted: `task-3-brief.md`). |
| 4. Edited name follows CAS rules on later import | Not started. |
| 5–9. Frontend (types/API + nudge/banner/success; CompleteProfileDialog; desktop; Account; mobile) | Not started. |
| 10. Docs | Not started. |

### What Task 1 changed (now in the working tree)

- **Migration** `backend/alembic/versions/0023_member_profile_completion.py`. It removes the lock (`details_completed_at`, `lock_reason`, their CHECKs, and the never-relock trigger) and adds `pan_conflict` (enum `memberpanconflict`) plus the `user_edited` name source. Its backfill:
  1. marks a row `other_account` when another user's row holds its PAN
  2. promotes the earliest locked row per detected PAN into `pan_lookup_hash`
  3. leaves later duplicates for merging
- **Model and code:** `member_trigger_sql.py` is deleted, and `HouseholdMember.__init__`/`is_locked` are gone.
- **New `backend/app/services/dashboard/profile_completion.py`** with `missing_profile_fields`, `completion_percent`, `has_profile_pan`, `pan_editable` and `removed_with_last_import`.
- **`HouseholdMemberResponse`** gains `pan_conflict`, `pan_editable`, `profile_completion`, `missing_fields` and `removed_with_last_import`, and drops `lock_reason`, `details_required` and `pan_on_statement`.
- **`member_to_response(m, user)`** uses the account's phone and email for Self.
- **Read gate:** `require_unlocked_member` → `require_member` (404 only), across the dashboard, analytics and cas_imports routes.
- **`refresh_pan_conflicts`** promotes a conflict PAN once the other account releases it. A flush runs after expired holders are cleared, to fix a unique-index bug that depended on PK order.
- **`is_name_only`** = `pan_source != CAS`. **Merge** is allowed only when the source is `origin == cas_detected` (ruling).
- **Deletion** uses `removed_with_last_import`: an untouched detected member is removed along with their last import.

### What Task 2 changed (now in the working tree, review pending fixes)

- `pan_claims.store_detected_pan(db, member, pan, *, now)` makes a confirm-time permanent claim. A PAN held by another account goes to the conflict columns instead. The implementer flushes after clearing an expired holder (deviation accepted).
- `classify_detected_pan` and `PersonStatus` no longer return `"locked_member"`; a detected-hash hit is now `existing_member`.
- In `confirm_people`:
  - `_member_for` stores the real PAN
  - the 5B (same person) path stores the PAN at Confirm
  - the mismatch guard compares against `pan_lookup_hash` or `detected_pan_hash`
  - the fallback now uses `plan_member_name_update`
- In `service.py`: the lock gates, `_details_required` and the `locked_member_only` prompt are removed, and same-person resolve always links (no upload-time claim). `schemas.py` prompt literal updated.
- `MemberLockReason` is **deliberately still in `enums.py`**. Task 3 deletes it together with `complete_member_details`.
- Tests: 241 passed, 4 skipped (real-PDF replay fixtures not on disk).

## Open for Task 2: do this first in the next session

Review verdict and findings: **see "Task 2 review result" at the bottom of this file**, which is filled in after the review finished. On top of those findings, these controller rulings must go into the same fix round. They are already recorded in the ledger:

1. **"Add data" for a `pan_conflict` target.** `_advance`'s target PAN claim would raise `cross_account_pan_blocked` (409) and drop the session. Fix: skip the target claim when `target.pan_conflict` is set and the found person's PAN hash equals `target.detected_pan_hash`. The funds attach normally. Add a test.
2. **No upload-time claim for a non-Self target found by name with no PAN.** `_advance` currently makes a pending claim for that target, which breaks decision A. Remove it for non-Self targets, so that Confirm's `has_no_pan` branch stores the PAN via `store_detected_pan`. Self keeps its pending claim. Add a test asserting `pan_lookup_hash is None` after the upload step and that it is set after Confirm.
3. **Stale comments.** Clean up the "locked" comments the implementer flagged: `cas_imports.py` (around line 243), `member_merge.py` (around line 60), and `member_update.py` line 1. `member_update.py` is deleted in Task 3 anyway.
4. **Frontend.** It still handles the removed prompt codes in 7 files under `frontend/src/features/import/`. Task 7 already covers this; nothing to do in Task 2.

After the fix round, run a scoped re-review. Then mark `Task 2: complete` in the ledger and continue with Task 3.

## How to resume (process)

- **Skills:** use `superpowers:subagent-driven-development` with the plan file. Per CLAUDE.md, also invoke `task-observer` at session start and `model-orchestration` before delegating. Codex isn't available, and the user chose Claude subagents.
- **Ledger:** `.superpowers/sdd/2026-10-01-member-profile-completion/progress.md`. Its first line names the plan. Task 1 has a `complete` line; Task 2 doesn't yet.
- **No-commit mode:** task boundaries are dangling snapshot commits from `snap.sh <parent> <label>`, fed to the skill's `review-package` script.
  - **After the user commits,** the ledger's snapshot ids become history only. Take a fresh baseline with `bash .superpowers/sdd/2026-10-01-member-profile-completion/snap.sh HEAD baseline-after-commit` and use it as the next BASE.
  - **Paths contain spaces,** so quote the workspace path in shell.
- **Tests:** backend uses `cd backend && python3 -m pytest <files> -q --basetemp=/tmp/pt-x` (system python3; `.venv` is Windows). Frontend uses `cd frontend && npx vitest run <files>`, plus `npx tsc -b` once per frontend task. Before each task's final run, grep the tests for every changed or removed symbol and add the matching files.
- **Interim breakage is expected:** `POST /household-members/{id}/details` stays broken until Task 3, and `tsc` stays red from Task 5 until Task 9. **Don't deploy mid-plan.**
- **Unverified:** the Postgres paths of migration 0023. `functional_postgres` skips without `TEST_DATABASE_URL`. Run it before deploy.
- **Delegation log:** `Docs/orchestration/delegation-log.md` has an IN PROGRESS line for this plan. Append to it when tasks finish.

## Rulings made so far (each with its cost if wrong)

1. **`MemberLockReason` deletion moved from Task 2 to Task 3.** This keeps the app importable. If wrong, a stale enum class lives one task longer.
2. **Models: Opus for Tasks 1–2, Sonnet for Tasks 3–10 and the task reviewers, Opus for the final review.** If wrong, a Sonnet task may need an extra fix round.
3. **Merge allowed only for `cas_detected` sources, and the profile-save `can_merge` mirrors it.** This preserves the old intent, since locked members were always detected. If wrong, a name-only manual member can't be merged.
4. **The migration backfill flags rows whose PAN another user holds as `pan_conflict`.** No cost if wrong.
5. **`store_detected_pan` flush-after-clear deviation accepted.** No cost if wrong.
6. **"Add data" for a `pan_conflict` target skips the target claim.** If wrong, that upload doesn't re-check the other account.
7. **No upload-time claim for a non-Self target with no PAN; it's stored at Confirm.** If wrong, another account could take the PAN during the review window, and Confirm then flags it as a conflict.

## Task 2 review result

**Verdict: Needs fixes** (Sonnet reviewer, diff `review-9c42d27..43b9366.diff`). Spec compliance otherwise ✅. `store_detected_pan`, `classify_detected_pan`, `confirm_people` and `service.py` match the brief and the PAN-storage constraint, and decision A holds for the 5B link.

**Important (fix round 1):**
- **Where:** `backend/app/services/import_/service.py`, `_advance`, the block `if person.pan and target.pan_lookup_hash is None: claim_pan_for_member(..., pending=True)` (around lines 566-572). Task 2 didn't touch it; it was unreachable before because locked targets were rejected earlier.
- **What breaks:**
  - It reserves a name-only detected target's PAN at upload, which violates decision A.
  - It turns "Add data" for a `pan_conflict` member into a 409 that drops the session.
- **No test covers it.**
- **Controller ruling (in the ledger):** skip this claim for **every non-Self target**. Confirm's `has_no_pan` branch then stores the PAN via `store_detected_pan`. This covers controller rulings 6 and 7 above.
- **Tests to add:**
  1. A name-only detected target: `pan_lookup_hash is None` after the upload step, and set after Confirm.
  2. "Add data" for a `pan_conflict` member: the review starts with no 409, and Confirm attaches the funds.

**Minor (deferred, not in the fix round):**
- In the Confirm 5B branch, add a comment that a conflict member isn't re-claimed there; `refresh_pan_conflicts` handles release.
- `store_detected_pan`'s docstring says "flushes only to free an expired claim". That's fine.
- The snapshot diff also showed unrelated files (an AWS plan, infra, CLAUDE.md, a maintenance banner). That is only the user's own commit `892c85e`, merged as `eb86a91` mid-session, appearing because the snapshot chain started before it. It isn't part of this feature and needs no action.

**Next step:** resume a Task 2 fix implementer, either a fresh Opus implementer pointed at `task-2-brief.md` and `task-2-report.md` or the old one if still available. Give it the Important finding plus "Open for Task 2" items 1–3. Then run a scoped re-review, mark Task 2 complete, and start Task 3.


---

## Prompt for the next session (copy-paste)

```
Continue implementing the Member Profile Completion plan, subagent-driven.

Read first, in order:
1. Docs/orchestration/2026-10-01-member-profile-completion-handoff.md (full context, decisions, progress, open findings)
2. .superpowers/sdd/2026-10-01-member-profile-completion/progress.md (SDD ledger: rulings, task states)
3. Docs/superpowers/plans/2026-10-01-member-profile-completion.md (the plan; spec is Docs/orchestration/member-profile-completion-map.html)

State: Tasks 1-2 are in the working tree, or committed by me if I've committed since. Task 1 is complete. Task 2 was implemented and reviewed, and still needs fix round 1. That fix: skip the upload-time target PAN claim in service.py _advance for every non-Self target, add the two tests named in the handoff, and clean up the stale "locked" comments. Then run a scoped re-review, mark Task 2 complete, and continue with Tasks 3-10.

Rules:
- Never git commit/add/stash; I commit manually.
- Run only affected tests, never full suites. Grep the tests for every changed symbol before each task's final run.
- Workers are Claude subagents (Codex is unavailable). Opus for fix rounds on Task 2 and for the final whole-branch review; Sonnet for Tasks 3-10 and the task reviewers.
- Invoke task-observer, model-orchestration and superpowers:subagent-driven-development at the start.
- No-commit mode: if HEAD has moved since the ledger's last snapshot, take a fresh baseline with
  bash ".superpowers/sdd/2026-10-01-member-profile-completion/snap.sh" HEAD baseline-new
  and use it as the next BASE.
- Don't pause between tasks unless one of the skill's stop conditions applies.
```

## Everything the next session needs

| What | Where |
|---|---|
| This handoff | `Docs/orchestration/2026-10-01-member-profile-completion-handoff.md` |
| Spec (binding) | `Docs/orchestration/member-profile-completion-map.html`, artifact https://claude.ai/artifact/8oEaUu5UDtkP9dptxrroux |
| Plan | `Docs/superpowers/plans/2026-10-01-member-profile-completion.md` |
| Ledger + rulings | `.superpowers/sdd/2026-10-01-member-profile-completion/progress.md` (git-ignored; survives commits, is lost to `git clean -fdx`) |
| Task briefs | the same folder: `task-1-brief.md`, `task-2-brief.md` and `task-3-brief.md` already exist. Make the others with the skill's `scripts/task-brief PLAN N`. |
| Implementer reports | the same folder: `task-1-report.md`, `task-2-report.md` |
| Snapshot helper | the same folder: `snap.sh <parent> <label>` prints a dangling commit id to use as the review-package BASE/HEAD |
| Older context | `Docs/orchestration/cas-member-detection-map.html` (the original detection design; Part 6/L1–L9 are replaced by this feature) |
| Delegation log | `Docs/orchestration/delegation-log.md`. Add a line when tasks finish. |

**If the git-ignored workspace is lost:** everything binding is also in this handoff file (decisions, rulings, open findings) and in the plan. Re-extract the briefs with `task-brief` and start a fresh ledger that marks Task 1 complete and Task 2 as needing fix round 1.
