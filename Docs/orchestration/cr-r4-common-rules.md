# Run 4 common rules (both `cr-r4-*` handoffs point here)

Run 4 of 7: Consolidated family holdings (item 2). Plan: `Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md`, section "Run 4". Commit prefix `cr-r4:`. Everything in `cr-r2-common-rules.md` and `cr-r3-common-rules.md` applies (setup, method, lessons, report format), with these changes:
- Codex works in **`~/cr-run-1`** (the same clone, synced by the orchestrator to the Run 3 end after its review). Never git add/commit.
- **Money maths.** Decimal only, strings in payloads. Parent = exact sum of children to the paisa. Average price = total invested / total units (never the mean of child prices). No new XIRR engine: the parent XIRR is the stored combined-scope rate from the `benchmark_funds` section; a member's XIRR is that member's stored rate (a dash when the member scope has no stored row, and always for households with more than four members).
- **Folio numbers masked only** (last 4 characters); a test asserts a full number never appears in a payload.
- The single-member holdings response and view are unchanged. `consolidated` is an additive field in the family view only; old payloads without it render today's rows. No new cache key.
- Direct and Regular plans stay separate parents. Stale and NAV-unavailable flags carry to parent and child. The opening-balance disclaimer is inherited by the parent.
- Plain words on labels. `guards.test.ts`: only count/list may change, never a rule. No visual check is possible: say so.
- Run 4's gate is stricter (money): adversarial review plus a scoped second round.
