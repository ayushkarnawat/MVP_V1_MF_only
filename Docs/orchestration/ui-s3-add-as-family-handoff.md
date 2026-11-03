# Handoff: ui-s3 add as family member, backend (tasks 3.1, 3.2)

**Status:** OPEN (blocked on S2 backend). **Worker:** Codex (backend only). **Rules:** `Docs/orchestration/ui-common-rules-codex.md`. **Plan:** `Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md`, Stage S3, Tasks 3.1 and 3.2 (the task text is the spec). Spec section `c5`.
Never touch `frontend/**`. Never run a git command that changes anything. Tests first. **Depends on `ui-s2-backend-handoff.md`** (`PersonConfirmResult.created`): dispatch only after S2 backend is committed in the base of your clone. Identity and PAN safety: a second scoped review follows.

## Head of Family (S0 result, read first)
`_self_member` (`service.py:435`) still finds the account holder by `Relationship.SELF`. `household_members.is_head` now exists (one head per user), and a head change relabels the old head, so the `self` member may no longer be the head. For S3 the rule is unchanged: "the account holder" is the `self` member as `_self_member` returns it. Add one test: `test_add_as_family_after_a_head_change_leaves_the_self_member_and_the_head_flag_untouched`. If any step of the flow reads or changes `is_head`, STOP and report.

## Decisions
- Synthetic files for Task 3.2 (password `MF@123`, `pdf_path(name)` finds a file in any subfolder): `r2_couple_rohan_priya_10yr.pdf` as the "different name" first upload, and `r1_first_jobber_riya_3yr.pdf` as the account holder's own later file. If these do not give the needed mismatch, pick others from `Docs/CAS Files/synthetic/pdfs/realistic/` and say which.
- Route and function as in the plan: `POST /imports/sessions/{session_id}/resolve-add-as-family`, `resolve_add_as_family`, no body. Keep `resolve-name` for old clients.

## Contract
The route returns the same `ImportPreviewResponse` as the other resolve routes, or 409 with the existing prompt-error shape for the next prompt. Nothing else is new for the frontend. Example: `POST /imports/sessions/abc123/resolve-add-as-family` (no body) returns the next preview.

## Verify
As in the plan. Postgres PAN-claim tests need `TEST_DATABASE_URL`; if your clone has no Postgres, say so and the orchestrator runs them.
