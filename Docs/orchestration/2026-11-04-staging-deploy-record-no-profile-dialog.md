# Staging deploy record: no Complete profile dialog inside any import (front end only) and DB wipe

**4 Nov 2026, evening.** Deployed on the owner's explicit instruction in chat (fix, wipe the database, push to staging).

- **Change:** commit `39a67410` on `leapswitch-redesign` (pushed). `useImportOrchestration` no longer queues the Complete profile dialog
  after an import, so onboarding, the plain import, the add-as-family import and the in-app import (one shared hook, web and mobile)
  go straight to the next screen. Untouched on purpose: the "N members detected" pop-up, the importing dialog, All set, the
  "N% complete" nudge, Profile > Family cards, Edit profile, the `CompleteProfileDialog` component. Decision: `decisions.md`, 4 Nov.
- **Checks before deploy:** vitest over import, dashboard/members, shell, profile-v2, auth, mobile: 172 files, 1896 tests pass; `tsc -b`
  clean; oxlint 0 errors (28 warnings, the ones in `useImportOrchestration.tsx` are the existing `runConfirm` dependency warning).
- **VM** `/opt/unifolio-redesign`: was clean on `b782be23`; `git pull --ff-only` to `39a67410`. Diff was `frontend/` plus docs only (no backend,
  no migration, Alembic head stays 0053). `sudo sh ./scripts/deploy-redesign.sh` (no `--full`): built, bundle `index-Cikq-prS.js` served.
- **Health:** `ls-redesign` 200, `ls-staging` 200, API `/health` 200.
- **DB wipe:** `sudo ./scripts/clean-db.sh` after a read-only count (4 users, 9 members, 8 imports, 1887 transactions: the QA accounts). All
  15 user-domain tables now 0; reference data intact (schemes 14467, nav_history 21973640, benchmark_index_history 443862, and the rest).
  No backup was taken first (same as earlier wipes); the wiped rows are not recoverable.
- **Rollback (front end only):** `cd /opt/unifolio-redesign && git checkout -B leapswitch-redesign b782be23` then
  `cd deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh`.
- **Not done:** the flow itself has not been re-checked live in a browser (needs a fresh sign-up and a real CAS); that is the next step.
