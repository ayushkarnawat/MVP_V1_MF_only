# Prompt for the XIRR planning session: add the Head of Family block (QA D-11) to the plan artifact
Paste the block below into the session that owns `Docs/orchestration/2026-11-24-xirr-vs-returns-plan.html`. Written 24 Nov 2026 by the orchestrator session.

```
You are the session that owns the XIRR planning artifact (Docs/orchestration/2026-11-24-xirr-vs-returns-plan.html). The owner wants a second, separate problem solved together with the XIRR work: a QA defect where a waiting CAMS import blocks every Head of Family change. Do NOT build anything now. Add this problem to the same planning artifact as its own clearly separated section (its own title, its own steps, its own tests), in the artifact's existing style, and keep the XIRR content unchanged. First read Docs/orchestration/2026-11-24-qa-round-report.md (item D-11) and the decisions.md entry "2026-11-24 - QA finding D-11".

## The problem (found in the owner's QA on staging, stage 9)
In Profile, "Choose who will be Head of Family" shows EVERY member greyed out with "Finish or cancel the statement you are importing first." and Next disabled, although all member details are filled in. At the time, one CAMS request sat on "Waiting for CAMS email" (0 of 5 done). Because of this the four Head of Family emails (QA rows M1-17, M1-18, M1-19) could not be tested at all.

## What I found in the code (verify it, do not trust it)
- backend/app/services/auth/head_eligibility.py: member_eligibility() adds the reason "import_in_progress" at lines 124-125 whenever _has_open_import_or_pan_claim() (lines 193-218) is true. That function is household-wide (so it greys out every member): (a) any Import of any member of the user whose status is not in TERMINAL_STATES (backend/app/services/import_/state_machine.py: import successful, confirmed, import failed, failed, expired; so a CAMS request waiting for its email, an uploaded file not yet confirmed, or an abandoned request that has not expired all count), or (b) any member with pan_pending_until in the future.
- backend/app/services/auth/head_change.py: the reason is in START_CODE_ELIGIBILITY_REASONS (line 73) and mapped to a 409 "import_in_progress" near line 424; check every place the change re-validates (start, each code verification, the final step) because the same reason may be re-checked later.
- frontend/src/features/profile-v2/components/ChangeHeadDialog.tsx line 63 holds the dialog text; the dialog does not say which import blocks or offer a Cancel.
- The rule was added in the change-requests release, Run 5, task 5.3 (commit d6147e07; review fixes f03b2cf3). Look at Docs/superpowers/plans/2026-10-31-change-requests-implementation-plan.md (task 5.3, the eligibility reasons) and the Head of Family briefing/ADR-007 to find WHY the rule was added, and say what it was protecting.

## Owner decision (24 Nov 2026)
A pending or abandoned import must NOT stop a Head of Family change. The owner wants to go deep on the investigation first.

## What the plan section must contain
1. The investigation, step by step: reproduce on a local database (a household with a waiting CAMS import, then try the change); list every Import status and where a row can be left open (and for how long: does an abandoned CAMS request ever expire, and when?); find every place "import_in_progress" or pan_pending_until is read; find out what the PAN-claim half protects and whether the head change can corrupt anything if it happens while an import or a PAN claim is open (imports hang on household_member and user, not on the head role; check what the change swaps: roles, labels, contact details, login identity, PAN ownership, retained CAS files, the import's later attribution of funds).
2. The proposed fix and the alternatives, with a recommendation: most likely remove "import_in_progress" from the household-wide eligibility (or narrow it to a confirm that is committing at that very moment, only if the investigation proves a real race), remove the same re-check everywhere else, keep only what the PAN half truly needs (with the reason in a code comment), keep the other eleven eligibility reasons unchanged. If any import-related blocker survives, the dialog must name the import and offer Cancel.
3. Tests first (write them as part of the plan, with names): a CAMS request waiting for its email and the change still starts and completes; an abandoned/uploaded-not-confirmed import; a confirm that is committing; PAN claim pending cases; the other eleven reasons still block; the dialog shows the right text; start, verify and final step all agree.
4. Files to touch, risks, a rollback note, and how it is deployed (a patch deploy; no migration expected, say if the investigation finds one).
5. Acceptance: the owner re-runs stage 9 (M1-17 to M1-19) after the patch: run a Head of Family change with an import waiting, and open all four emails in Gmail web, Gmail app, Apple Mail and Outlook.
6. A short list of anything the investigation could not settle that needs the owner's decision (ask before assuming, per CLAUDE.md).
Write nothing outside the planning artifact except what it needs; do not edit code or tests now.
```
