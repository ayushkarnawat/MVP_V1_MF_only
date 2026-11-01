# Handoff: The swap transaction, undo and /auth/me (T5.5, T5.6)

**Status:** OPEN (blocked until `cr-r5-migration-and-codes` is DONE; IN REVIEW when Codex reports, DONE after the Run 5 review gate)
**Run:** 5 of 7 | **Slug:** `cr-r5-swap-and-undo` | **Commit prefix:** `cr-r5:` | **Tasks:** T5.5, T5.6
**Order:** T5.5 then T5.6. T5.7 (the gate) is the orchestrator's.
**Rules:** `Docs/orchestration/cr-r5-common-rules.md` (read first). **Task text (authoritative):** plan, "Task 5.5" and "Task 5.6". **Design:** the briefing's "The single transaction, in order" list and its label tables.

## Notes
- This is the riskiest code in the release. Follow the briefing's ten steps in that order. No step commits; one commit at the end; email after it.
- The snapshot stored for undo holds the deleted identities (including Google), the old contact, every member's old label and the swap's own label changes, the session count and the undo token hash. Do not store the raw undo token or any code.
- Re-validation inside the lock covers: request open and not expired, all four codes verified, old head still head, new head still a member of this account, account not pending deletion, no import preview or PAN claim open, contact still free (both the existing check and the identity `email` column check from T5.3), PAN checks still true.
- Undo restores identities, contact and only the labels the swap changed; later member edits are kept. `undo_contact_taken` (409) and `undo_expired` (410) use the briefing's messages. Changing back is limited to once per 7 days. Undo ends all sessions and records a consent withdrawal.
- `/auth/me` gains `head_member_id` and the pending request state, additively: old clients and existing tests are unaffected. The existing `/auth/me` tests are in `tests/api/test_auth_routes.py`; `tests/api/test_auth_me.py` does not exist yet, create it for the new cases.
- Account deletion removes the new table's rows (`account_deletion.py`); add its test.
- Postgres functional tests for the swap are mandatory and need `FOR UPDATE` to be real: include the concurrent-second-swap test there.
- Report: the exact `HeadChangeResult` shape, the undo route and token delivery (email link shape), and the regression-suite run over the nine Self-reading files.
