# Redesign preview link, deploy loop and merge-back — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (this is mostly operations, not feature code). Planning status: the repo-side files (Caddyfile, docker-compose.yml, .env.example, `scripts/deploy-redesign.sh`, README section) are **already written on branch `leapswitch-redesign`, uncommitted**. What remains is the VM work (owner-run), verification, and the merge-back rehearsal. Companion: `Docs/orchestration/2026-10-24-ui-redesign-manual-steps.md` (owner-only steps).

**Goal:** `ls-redesign.unifolio.in` serves the `leapswitch-redesign` frontend against the **same** API, Postgres, worker and cron as `ls-staging.unifolio.in`; when the owner is satisfied, merging into `feat/leapswitch-staging` leaves the main staging link working with no surprises.

**Branch model (owner, 24 Oct):** all work on `leapswitch-redesign` (cut from `feat/leapswitch-staging`). Each task/page gets its own branch cut from `leapswitch-redesign`, with a **PR targeting `leapswitch-redesign`**. Nothing merges into `feat/leapswitch-staging` until the whole redesign is built, tested on the redesign link and approved.

## Facts verified in the repo (24 Oct 2026)

- Caddy serves `ls-staging.unifolio.in` from `/srv/frontend` (bind mount of `frontend/dist`) and reverse-proxies `ls-staging-api.unifolio.in` to `backend:8000`; certificates are automatic.
- The frontend bakes `VITE_API_BASE_URL` at build time; the new bundle is built with the **same** API domain.
- Auth is a Bearer token in `localStorage` (`features/auth/session.ts`); CORS origins come from `ALLOWED_ORIGINS`, comma-separated (`main.py:_allowed_cors_origins`). So no code change is needed for a second origin.
- `FRONTEND_BASE_URL` is used only by the PDF-export print page (`pdf_export.py`), whose UI entry point is removed in the redesign; it stays on the main domain.
- Compose project directory is `deploy/leapswitch`, so the default project name is `leapswitch`; the compose file now pins `name: leapswitch` so a second checkout drives the same containers/volumes.

## Design (what is already in the repo)

| File | Change |
|---|---|
| `deploy/leapswitch/Caddyfile` | New site block `{$LS_REDESIGN_DOMAIN:ls-redesign.unifolio.in}` → `/srv/frontend-redesign`, `X-Robots-Tag: noindex, nofollow` |
| `deploy/leapswitch/docker-compose.yml` | `name: leapswitch`; caddy mounts `${MAIN_FRONTEND_DIST}` → `/srv/frontend` and `${REDESIGN_FRONTEND_DIST}` → `/srv/frontend-redesign` (defaults keep today's behaviour if unset) |
| `deploy/leapswitch/.env.example` | `LS_REDESIGN_DOMAIN`, `MAIN_FRONTEND_DIST`, `REDESIGN_FRONTEND_DIST` (absolute), `ALLOWED_ORIGINS` lists both origins |
| `deploy/leapswitch/scripts/deploy-redesign.sh` | frontend-only build; `--caddy` recreates only caddy; `--full` delegates to `deploy.sh`; refuses to run off `leapswitch-redesign` or with mis-pointed dist paths |
| `deploy/leapswitch/README.md` | "Redesign preview link" section with the VM layout and the one hard rule |

**VM layout:** main clone `/opt/unifolio` on `feat/leapswitch-staging`; `git worktree add /opt/unifolio-redesign leapswitch-redesign`; `/opt/unifolio-redesign/deploy/leapswitch/.env` → symlink to `/opt/unifolio/deploy/leapswitch/.env`. (Adjust the two roots to wherever the clone really is; the paths in `.env` must be absolute and match.)

**The one hard rule while the preview exists:** backend/worker deploys run only from the redesign worktree (it is the superset). Running `deploy.sh` from the main clone would rebuild the backend without redesign code and swap the Caddyfile to one without the redesign block. Hotfixes made on `feat/leapswitch-staging` are merged into `leapswitch-redesign` first (see "Keeping in step").

## Guarantees the owner asked for

1. **Old link looks and behaves exactly as now.** Its bundle (`/opt/unifolio/frontend/dist`) is not rebuilt by any redesign step; only a deliberate `deploy.sh` from the main clone changes it.
2. **Same backend/DB/worker/cron for both links.** One compose project (`name: leapswitch`).
3. **Backend changes are additive only** until the merge: new endpoints, nullable columns, new enum values, new JSON keys; no removed/renamed/reshaped existing field. This keeps the old link (and mobile) rendering identically on the shared backend.
4. **Merge-back safety:** see the last section.

## Tasks

### T1: Repo files (done, uncommitted) — verify
- [ ] `sh -n deploy/leapswitch/scripts/deploy-redesign.sh`; `python3 -c "import yaml; yaml.safe_load(open('deploy/leapswitch/docker-compose.yml'))"`.
- [ ] `docker compose -f deploy/leapswitch/docker-compose.yml config` (with a throwaway `.env` copied from `.env.example`) shows both bind mounts and `name: leapswitch`. (Cannot run on this machine if Docker is absent; then T3 does it on the VM.)
- [ ] Commit on `leapswitch-redesign` (explicit paths) when the owner says so.

### T2: Owner manual steps (see the manual-steps doc)
DNS record, Google OAuth origin, CloudPe Security Group (no change needed unless 80/443 are restricted), VM worktree and `.env` edits. Nothing here is automated.

### T3: First deploy on the VM (terminal labels: A = SSH to VM)
- [ ] **A:** `cd /opt/unifolio && git fetch && git worktree add /opt/unifolio-redesign leapswitch-redesign` (branch must be pushed first; the owner pushes).
- [ ] **A:** `ln -s /opt/unifolio/deploy/leapswitch/.env /opt/unifolio-redesign/deploy/leapswitch/.env`; append to the shared `.env` the new lines from `.env.example` (domain, two dist paths, both origins in `ALLOWED_ORIGINS`).
- [ ] **A:** `cd /opt/unifolio-redesign/deploy/leapswitch && ./scripts/deploy-redesign.sh --caddy`. Expected: Vite build succeeds, caddy recreated, final line prints the redesign URL.
- [ ] **A:** the backend must also learn the new origin: `docker compose up -d --no-deps backend` (re-reads `.env`; no rebuild) — only needed once, for `ALLOWED_ORIGINS`.
- [ ] Verify (from any machine): `curl -sI https://ls-redesign.unifolio.in | head -5` returns 200 and `x-robots-tag: noindex`; `curl -sI https://ls-staging.unifolio.in | head -3` still 200 and unchanged; in a browser, sign in on the redesign link (OTP) and open the old link in another profile — both load the same account data; browser dev-tools network tab shows no CORS errors on the redesign link.

### T4: Redeploy loop (every wave end, or when a page is ready to look at)
- Frontend only: **A:** `cd /opt/unifolio-redesign && git pull && cd deploy/leapswitch && ./scripts/deploy-redesign.sh`. No downtime for either link.
- Backend/worker changed: the migration checklist from `Docs/orchestration/leapswitch-staging-deploy-guide.md` (fresh `backup.sh`, then `./scripts/deploy-redesign.sh --full`, then `docker compose run --rm backend alembic upgrade head`, then `analytics recompute` if the analytics payload changed). Rollback: `./scripts/rollback.sh` retags `:previous`.
- After any backend deploy, smoke-check the **old link**: sign in, open Dashboard, Analytics, History (these must look exactly as before).

### T5: Keeping in step with staging
- [ ] At the start of every orchestrator session and before every wave end: `git fetch origin && git merge origin/feat/leapswitch-staging` into `leapswitch-redesign` (merge, never rebase). Resolve conflicts on `leapswitch-redesign`; run affected tests; record in the session file.
- [ ] Hotfixes needed urgently on the main link: commit on `feat/leapswitch-staging`, merge into `leapswitch-redesign`, then deploy backend from the redesign worktree.

### T6: Merge-back rehearsal and gates (before the real merge)
The goal is to prove the merged `feat/leapswitch-staging` works **before** it exists.
- [ ] Merge `feat/leapswitch-staging` into `leapswitch-redesign` (T5). Because the final merge into staging is then a fast-forward (`git merge --ff-only leapswitch-redesign` — the same pattern as the earlier branch model), the tree that lands on staging is byte-for-byte the tree QA'd on the redesign link.
- [ ] Full backend suite and full frontend suite (typecheck + vitest) on that merged tree. Plus the `functional_postgres` tests for the two migrations (news, benchmark enum).
- [ ] **Old-code-on-new-schema check:** with a scratch Postgres migrated to the latest redesign revision, run the **staging branch's** backend tests (`git stash`-free: use a second worktree of `feat/leapswitch-staging`) — proves that if the main link ever runs old backend code against the migrated DB (rollback case) nothing breaks. Migrations are additive, so this must be green.
- [ ] **Synthetic CAS gate:** upload two or three `Docs/CAS Files/synthetic/pdfs/realistic/` statements (password `MF@123`) on the redesign link; check the numbers (holdings, XIRR, analytics sections) against the same statements on the main link; every shared figure matches (fund-value-consistency rule).
- [ ] Mobile smoke test on a phone-width browser, both links: still the old mobile app, still works.
- [ ] `/print/analytics`, legal pages, sign-up, login, onboarding, re-consent on the redesign link.
- [ ] Performance gates from the plans (Home ≤ 1.5 s, History month-detail ≤ 1 s, analytics recompute within the worker's memory/time budget with the benchmark matrix).

### T7: The merge and cutover
- [ ] Tag the current staging head: `git tag pre-redesign-staging feat/leapswitch-staging` (owner pushes the tag).
- [ ] Owner: open one PR `leapswitch-redesign` → `feat/leapswitch-staging` (reviewers per CODEOWNERS: `@ayushkarnawat`, `@aditi-unifolio`), approve, `--ff-only` merge.
- [ ] **A:** `cd /opt/unifolio && git pull && ./scripts/deploy.sh` (builds the redesign into `ls-staging`; backend is already the superset). Run migrations if not already applied.
- [ ] Verify `ls-staging.unifolio.in` = redesign; repeat the T6 smoke list on it.
- [ ] Retire the preview: remove the Caddyfile block, the compose mount, the `.env` lines, `git worktree remove /opt/unifolio-redesign`, delete the DNS record, remove the Google origin; in a follow-up PR remove old `benchmark` keys and old screens only after the owner confirms.
- [ ] Rollback if needed: `git revert -m 1` the merge or redeploy the tag `pre-redesign-staging` (`./scripts/rollback.sh` for the backend image); the schema stays (additive).

## Risks
- Running a compose command from the wrong checkout (mitigated by the pinned project name, absolute dist paths, the hard rule, and the script's guards; the README says it in one place).
- The shared backend is redeployed more often than before (each backend wave): always take a `backup.sh` dump first.
- Let's Encrypt rate limits if DNS is wrong when Caddy first starts: set DNS first, wait for propagation (`dig +short ls-redesign.unifolio.in`).
- Testers on the old link see backend changes the moment they deploy; additive-only is what prevents visible differences.
