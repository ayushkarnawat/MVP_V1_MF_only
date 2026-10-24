# UI redesign — steps only you (or the manager) can do

Short and in order. Terminals: **A** = SSH to the CloudPe VM. **W** = a browser. Nothing here is automated by Claude. Names assumed: branch `leapswitch-redesign`, link `ls-redesign.unifolio.in` (change both everywhere if you prefer other names).

## Before the first deploy (Wave 1)

| # | Where | Step | Notes |
|---|---|---|---|
| 1 | Local terminal | Commit the repo-side files on `leapswitch-redesign` and `git push -u origin leapswitch-redesign` | Files: `deploy/leapswitch/{Caddyfile,docker-compose.yml,.env.example,README.md,scripts/deploy-redesign.sh}` plus the new docs. Claude does not push. |
| 2 | AWS Route 53 (DNS stays on AWS) | Add an **A record** `ls-redesign.unifolio.in` → the VM's public IP (same IP as `ls-staging.unifolio.in`) | TTL 300. Check: `dig +short ls-redesign.unifolio.in` returns the IP **before** step 5, or Let's Encrypt may rate-limit. |
| 3 | W: Google Cloud console → APIs & Services → Credentials → the OAuth client | Add `https://ls-redesign.unifolio.in` under **Authorised JavaScript origins** | Only needed for "Sign in with Google" on the new link. Takes a few minutes to apply. |
| 4 | CloudPe dashboard | Nothing to change if ports 80/443 are open to the world already (they are for ls-staging). If SSH times out but HTTPS works, it is the Security Group IP allowlist (see the plan's Troubleshooting) | |
| 5 | A | `cd /opt/unifolio && git fetch && git worktree add /opt/unifolio-redesign leapswitch-redesign` | Adjust `/opt/unifolio` to where the repo really is. |
| 6 | A | `ln -s /opt/unifolio/deploy/leapswitch/.env /opt/unifolio-redesign/deploy/leapswitch/.env` | One `.env` for both. |
| 7 | A | Edit `/opt/unifolio/deploy/leapswitch/.env` (`sudo`, keep `chmod 600`): add `LS_REDESIGN_DOMAIN=ls-redesign.unifolio.in`, `MAIN_FRONTEND_DIST=/opt/unifolio/frontend/dist`, `REDESIGN_FRONTEND_DIST=/opt/unifolio-redesign/frontend/dist`, and set `ALLOWED_ORIGINS=https://ls-staging.unifolio.in,https://ls-redesign.unifolio.in` | The dist paths must be absolute and match the real folders. |
| 8 | A | `cd /opt/unifolio-redesign/deploy/leapswitch && ./scripts/deploy-redesign.sh --caddy` | Builds the bundle, recreates only the caddy container. |
| 9 | A | `cd /opt/unifolio/deploy/leapswitch && docker compose up -d --no-deps backend` | Makes the backend read the new `ALLOWED_ORIGINS`. Once only. |
| 10 | W | Open `https://ls-redesign.unifolio.in`, sign in; open `https://ls-staging.unifolio.in` in another browser profile | Same account, same data, no console CORS errors; the old link looks unchanged. |

## During the build (every wave)

| Step | Who | Notes |
|---|---|---|
| `git push` the task branch and open the PR **into `leapswitch-redesign`** (or let Claude open it with `gh` once you have said so) | You | Claude never pushes to `feat/leapswitch-staging` or `main`. |
| Review/merge each PR into `leapswitch-redesign` after Claude's review gate | You (or the manager) | One merge per task branch. |
| Relay every Codex review: `/codex:status <id>`, `/codex:result <id>` | You | The review wrapper cannot be polled by Claude. |
| Redeploy the preview: A → `cd /opt/unifolio-redesign && git pull && cd deploy/leapswitch && ./scripts/deploy-redesign.sh` (frontend); `--full` after a backend change, with a fresh `./scripts/backup.sh` first and `alembic upgrade head` after | You | Claude writes the exact command block per wave in the same terminal-label style as the earlier guides. |
| After any backend deploy: check the **old link** still looks the same (Dashboard, Analytics, History) | You | This is the additive-only guarantee. |
| Opus review approvals | You | One blanket approval for the runs the handoff lists. |

## Wave 6 (QA) and Wave 7 (merge)

| Step | Who |
|---|---|
| Browser QA on the redesign link with synthetic CAS files (password `MF@123`), desktop only; send findings to Claude as a list | You / manager |
| Confirm the rehearsal results Claude reports (full suites, old-code-on-new-schema check, numbers match between links, mobile smoke test) | You |
| `git tag pre-redesign-staging feat/leapswitch-staging` and push the tag | You |
| One PR `leapswitch-redesign` → `feat/leapswitch-staging`; approvals from `@ayushkarnawat` and `@aditi-unifolio`; merge with fast-forward | You + manager |
| A: `cd /opt/unifolio && git pull && ./scripts/deploy.sh`, then `docker compose run --rm backend alembic upgrade head` if not already applied | You |
| Retire the preview: remove the Caddyfile block, compose mount and `.env` lines, `git worktree remove /opt/unifolio-redesign`, delete the Route 53 record and the Google origin | You |

## Not needed any more (decided 24 Oct)
- Home performance gate re-run (already measured; stored prices, no new table).
- News dark launch / waiting for a lawyer review: news is shown directly on the redesign link. (Plan text about a lawyer review is overridden for the preview; revisit before a public launch.)
