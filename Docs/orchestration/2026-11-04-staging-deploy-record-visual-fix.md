# Staging deploy record: auth visual fidelity pass (front end only)

**4 Nov 2026.** Deployed on the owner's explicit go ("merge and deploy to staging immediately, you have my complete approval").

- Merged `ui-visual-fix` into `leapswitch-redesign` (merge commit **`b782be23`**) and pushed to origin. The first two pushes of the
  branch ref were rejected by GitHub with an Internal Server Error (the objects pushed fine on the feature branch; the third
  push of `leapswitch-redesign` succeeded). The VM's `git fetch` also failed once and then succeeded with the same key: GitHub's
  SSH was intermittent that afternoon, the registered deploy key matched the VM's key.
- VM `/opt/unifolio-redesign`: was clean on `89ecd3ae`; checked out `b782be23`. `git diff --name-only 89ecd3ae HEAD` showed only
  `frontend/` and `Docs/` files (no backend, no migration).
- `sudo sh ./scripts/deploy-redesign.sh` (no `--full`): exit 0, front end built, bundle `index-M6TCmiP9.js` served.
- Health: API `/health` 200, `ls-redesign` 200, `ls-staging` 200, `person.png`, `laptop.svg` and the logo 200.
- Not run, as designed: backup, migration, `clean-db.sh`, `restore.sh`, `rollback.sh`. Backend and worker untouched (Alembic head stays 0053).
- **Rollback (front end only):** `cd /opt/unifolio-redesign && git checkout -B leapswitch-redesign 89ecd3ae` then
  `cd deploy/leapswitch && sudo sh ./scripts/deploy-redesign.sh`.
- Visual evidence and the honest list of differences: `auth-visual-fix/visual-gate.md`. Open for the owner: sign-up 2 to 6 and
  log-in code screens on staging with a real code; the sign-off column of the gate table.
