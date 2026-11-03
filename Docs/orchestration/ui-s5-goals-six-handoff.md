# Handoff: ui-s5 six life goals, migration and backend (tasks 5.1, 5.2)

**Status:** OPEN. **Worker:** Codex (backend only). **Rules:** `Docs/orchestration/ui-common-rules-codex.md`. **Plan:** `Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md`, Stage S5, Tasks 5.1 then 5.2 (the task text is the spec). Start commit `0b73a390`.
Never touch `frontend/**`. Never run a git command that changes anything. Tests first. Deeper check follows: a second scoped review and a hand check.

**Migration number: `0053`**, `down_revision = "0052"` (one head, confirmed at S0). File `0053_primary_goals_life_goals.py`. If `0053` already exists in your clone, stop. The head assertion in `tests/test_migrations.py` becomes `"0053 (head)"`. Mirror the Postgres-only guards of `0019_user_primary_goals.py`.

**Codes:** `wealth_creation`, `retirement`, `childrens_education`, `buy_home`, `financial_freedom`, `tax_planning`.

**Contract:** `PATCH /auth/me` body `{"primary_goals": ["retirement","buy_home"]}` (1 to 6 unique codes). Empty list: 422 `Pick between 1 and 6 goals.` Old codes: 422. `GET /auth/me` returns `primary_goals` as before. The `primary_goal` field is gone from the body model and from the user row.

**Verify:** `cd backend && pytest tests/test_migrations.py tests/api/test_auth_routes.py tests/scripts/test_report_onboarding_goals.py`. The Postgres test and up, down, up need a local Postgres (`TEST_DATABASE_URL`); if your clone has none, say so and the orchestrator runs them.
