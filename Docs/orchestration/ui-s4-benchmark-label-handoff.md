# Handoff: ui-s4 benchmark_label on the returns response (task 4.1)

**Status:** OPEN. **Worker:** Codex (backend only). **Rules:** `Docs/orchestration/ui-common-rules-codex.md`. **Plan:** `Docs/orchestration/2026-11-02-ui-round-2-and-auth-redesign-implementation-plan.md`, Task 4.1 (the task text is the spec). Start commit `0b73a390`.
Never touch `frontend/**`. Never run a git command that changes anything. Tests first.

**Scope:** Task 4.1 exactly. Small and independent. The frontend type already declares `benchmark_label?`.

**Contract:** both modes of `GET /fund-page/{scheme_id}/returns` (`inception`, `current`) add `"benchmark_label": "Nifty 50 TRI"` (a string) or `null`. Existing fields do not change.

**Verify:** `cd backend && pytest tests/services/fund_page`.
