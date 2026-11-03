# Handoff: ui-s1 greeting follows the selected member (task 1.1, backend)

**Status:** OPEN. **Worker:** Codex (backend only). **Rules:** `Docs/orchestration/ui-common-rules-codex.md`. **Plan:** `Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md`, Task 1.1 (read it; it is the spec). Alembic head `0052`. Start commit `0b73a390`.
Never touch `frontend/**`. Never run a git command that changes anything. Tests first, show each fails for the stated reason. Money is `Decimal`.

**Scope:** Task 1.1, backend part only. The plan tags it Antigravity by mistake: it edits `backend/app/api/home.py`. The frontend test is in `ui-s1-quick-fixes-fe-handoff.md`.

**Files:** `backend/app/api/home.py` (`_display_name` at line 62, its call in `_summary` at line 125), `backend/tests/api/test_home_routes.py` (use the file's client and the `home_fixture.py` helpers).

**Interface:** `_display_name(db: Session, user_id: uuid.UUID, ctx: ScopeContext) -> str`, `ScopeContext` from `app/services/home/context.py` (`scope`, `member_name`). Family view (`ctx.scope == "aggregate"`): today's rule, unchanged. Member view: first word of `ctx.member_name`, title case; an empty name falls back to the family-view rule.

**Head of Family (S0 result):** the family-view rule keeps finding the head as today (the `self` relationship member, else the first member). `household_members.is_head` exists now, but this task must not switch the lookup to it.

**Response (unchanged shape):** `GET /home/summary?member_id=<uuid>` returns `display_name: str`. Example: family view `"Ayush"`, member view of Priya `"Priya"`.

**Tests:** the four backend tests named in the plan. The existing refusal test for another account's member id passes unchanged.

**Verify:** `cd backend && pytest tests/api/test_home_routes.py`, then `tests/api` and `tests/services/home`.

**Cheap probe (do this once, first):** in your clone write a one-line `probe.txt`, run `git add probe.txt` and `git commit -m probe`. Report whether each Git write worked. If the commit worked, undo it with `git reset --hard HEAD~1`. If Git writes fail, say so and carry on; the orchestrator does all staging and commits.
