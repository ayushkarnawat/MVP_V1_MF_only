# Staging VM disk resize runbook (LeapSwitch / CloudPe)

Written 2026-10-29. Docs only: nothing here has been run. Do it BEFORE the next `deploy-redesign.sh --full`.

**Who does what.**
- **Human (browser):** every CloudPe dashboard step, the browser smoke test, every GATE yes.
- **Manager's Claude (laptop WSL, `ssh deploy@202.66.174.251`, folder `/opt/unifolio-redesign/deploy/leapswitch`):** the VM commands. Same rules as the deploy prompt: read-only unless a step says "CHANGES", an explicit yes from the human at each GATE, never improvise, stop and report on any unexpected output.

Steps marked **RISKY** can lose data or take the site down if done wrong.

---

## 1. Goal, symptoms, rule, sizing

**Symptoms (29 Oct, register C185).** The VM disk is about 27 GB (29 GB in one reading). It holds the OS (`/usr` 2.5 GB), repo clones (`/opt` 1.2 GB), Docker images in `/var/lib/containerd` (15 GB: snapshots 13 GB, content 2.5 GB), `/var/lib/docker` (3.1 GB, almost all the Postgres volume `leapswitch_pgdata`, 3.28 GB) and about 8.4 GB of build cache. A `--full` deploy rebuilt the backend and worker images (about 2 GB each); free space went from 3.5 GB to 239 MB and the build failed with `no space left on device`, on the same disk as the database. Free space was only 1.8 GB (94% used) before any cleanup.

**The rule.** Do this resize before the next `--full`. `--full` needs 10 GB free; a front-end-only deploy (no flag) needs about 1 GB.

**Sizing recommendation: 60 GB minimum.** Reasoning: two backend-sized images (about 2 GB each) times two or three generations (`:latest`, `:previous`, one in flight) is 8 to 12 GB; build cache can reach 8 GB before it is pruned; the OS and clones are about 4 GB; the database is 3.3 GB and grows; and the 10 GB headroom rule must hold on top of that. 27 GB cannot satisfy this; 60 GB can, with room to grow. If the cost is acceptable, 80 GB is more comfortable.

**Optional alternative: a separate data volume for Postgres.**
- Pros: a full image disk can never starve the database; the volume can be snapshotted and resized on its own; it survives rebuilding the VM.
- Cons: more moving parts (a mount, an fstab line, moving the `leapswitch_pgdata` volume or pointing the compose volume at the mount, a restore-grade migration of live data); more downtime and risk now than a plain resize. It does not remove the need for a bigger image disk.
- Verdict: optional, later. The plain resize is the fix.

NOTE: the original plan (`leapswitch-staging-plan.html`) specified a 30 GB boot volume plus a 100 GB data volume mounted at `/srv/data`. Step 2 checks whether that data volume actually exists and is unused. If `lsblk` shows a second, mostly empty disk, tell the owner before going further: moving Docker's data-root or the Postgres volume there could be cheaper than a resize. That is the owner's decision, not this runbook's.

---

## 2. Pre-checks (read-only, manager's Claude)

Record every output in the sign-off table (section 9) or the session notes.

```
df -h
```
Expected: `/` about 27 to 29 GB, 85 to 95% used. Record Size, Used, Avail.

```
df -T /
```
Expected: a `Type` column of `ext4` (most likely) or `xfs`. Record it: it decides step 5.

```
findmnt /
```
Expected: SOURCE like `/dev/vda1` or `/dev/sda1` (plain partition) or `/dev/mapper/...` (LVM). Record it.

```
lsblk -f
```
Expected: one disk with partitions (for example `vda` with `vda1`, `vda15`) and `/` on a partition. Look for: (a) a `LVM2_member` or `lvm` row, which means LVM; (b) a second disk (for example `vdb`) mounted at `/srv/data`, see the note in section 1; (c) the partition layout. Record it.

```
sudo parted -l
```
Expected: partition table type `gpt` (or `msdos`), the root partition being the LAST partition (or last before a small EFI partition). **STOP** if the root partition is not the last one on the disk: `growpart` cannot extend it; report to the owner.

```
sudo docker system df
```
Expected: Images, Containers, Local Volumes, Build Cache rows with sizes. Record all four.

```
sudo du -sh /var/lib/containerd /var/lib/docker /opt
```
Expected: about 15 GB, 3.1 GB, 1.2 GB (will vary). Record.

```
sudo docker compose ps
```
Expected: postgres, backend, worker, caddy running and healthy. **STOP** if anything is restarting; report first.

```
sudo docker compose run --rm -T backend alembic current
```
Expected: `0046 (head)`. Record the current free space in GB: it is the number to beat.

**STOP:** if free space is under 500 MB, go to section 8 first, then come back.
**Undo:** nothing changed.

---

## 3. Safety first, schedule, notice

### 3a. Fresh database dump (CHANGES: writes a dump to object storage; manager's Claude, after a GATE)

```
sudo sh ./scripts/backup.sh
```
Expected: no output and exit code 0 (the script emails an alert through the SES path on failure). It needs about 1 GB of temporary space in `/tmp`; the dump is gzipped and then removed. **STOP** if it fails, or if free space is too low to write the dump: do not touch the disk without a verified backup.

Verify the object exists (the `cloudpe` aws profile and `BACKUP_BUCKET_NAME` are in `.env`; never print `.env`):

```
. ./.env && aws --profile cloudpe --endpoint-url "$OBJECT_STORAGE_ENDPOINT_URL" s3 ls "s3://${BACKUP_BUCKET_NAME}/postgres/" | tail -3
```
Expected: the newest line has today's UTC timestamp (a few minutes old) and a size of tens to hundreds of MB. **STOP** if the newest is older. If the aws profile is under the deploy user rather than root, run it without `sudo` as shown; if it fails on credentials, ask the human to check the bucket in the dashboard instead.
**Undo:** not needed.

### 3b. Volume snapshot or backup (human)

In the CloudPe dashboard open the VM and find its volume or disk settings. Check whether a snapshot or backup of the boot volume is offered; if yes, take one and wait until it shows as finished. The staging plan records that CloudPe volume backups exist (priced per GB and reachable through the Cinder API), but the exact menu names, the time it takes and whether it works on a boot volume in use are NOT verified here: follow the dashboard's own wording. If no snapshot is offered, the 3a dump is the only safety net: tell the manager's Claude.

### 3c. Window and notice

Pick a quiet window. Tell testers beforehand. A frontend maintenance banner exists from the AWS night-stop work (`CLAUDE.md` Session State, 2026-10-01), but no register row on it could be found for the LeapSwitch front end, so whether it can be switched on for this window is NOT verified: ask the owner. The resize may need the VM off for several minutes, so plan for 30 to 60 minutes in total.

### 3d. GATE 1

Human says: backup verified, snapshot taken or consciously skipped, window agreed. Only then continue.

---

## 4. The dashboard step (human, browser)

1. Note the VM's public IP (`202.66.174.251`) and your current public IP (`curl https://api.ipify.org` on the laptop).
2. **RISKY, only if the dashboard step needs the VM off** (the dashboard's own wording says so; if unsure, ask support): have the manager's Claude stop the stack cleanly first, after a GATE:

```
sudo docker compose stop
```
Expected: `Container ... Stopped` for caddy, backend, worker, postgres (Postgres gets a clean shutdown). **Undo:** `sudo docker compose up -d`.

3. In the CloudPe dashboard open the VM, find its volume or disk settings, and increase the size to the target (60 GB or more) using the dashboard's own resize wording. Growing is normally one-way: a disk cannot be shrunk later. Wait until the dashboard shows the new size applied.
4. If the dashboard says to power off, restart or detach the volume, follow it. Then power the VM back on.
5. After the VM is back, check: the public IP must still be `202.66.174.251` (if it changed, stop and tell the owner; DNS and the `.env` domains depend on it), and the security group `unifolio-web` must still list your current IP for SSH. Diagnosis from the staging plan: an SSH **timeout** (it hangs, not "refused") while the websites still answer is the security-group IP allowlist, not the VM. Fix in the dashboard: Security Groups, `unifolio-web`, Inbound, add SSH port 22 from your current IP /32 (effective at once). A **refusal** is a different problem (fail2ban ban), see the plan's Phase 2 notes.
6. Tell the manager's Claude: "dashboard resize done, new size X GB, VM is on".

**STOP:** if the dashboard shows an error, the VM does not come back, or the size did not change: do not run step 5; contact CloudPe support with the VM ID.
**Undo:** a disk cannot be shrunk; the safe undo is restoring the snapshot (3b) or the dump (`scripts/restore.sh`), on the owner's call.

---

## 5. Grow the partition and filesystem (manager's Claude, CHANGES, RISKY)

Do this after GATE 2 (human yes). Re-run `findmnt /`, `df -T /` and `lsblk -f` from step 2 to pick the case below.

```
lsblk
```
Expected: the disk (for example `vda`) shows the new size while the root partition (for example `vda1`) still shows the old size. If the disk still shows the old size, the dashboard step has not applied or needs a reboot (`sudo reboot`, then reconnect); **STOP** if it still does not.

```
command -v growpart || sudo apt-get install -y cloud-guest-utils
```
Expected: a path such as `/usr/bin/growpart` (present on Ubuntu cloud images) or an install. 

**Case A: plain partition (SOURCE like `/dev/vda1`, not `/dev/mapper/...`).** Replace `vda` and `1` with the real disk and partition number from `findmnt /`. Note the space between disk and number.

```
sudo growpart /dev/vda 1
```
Expected: `CHANGED: partition=1 start=... old: size=... end=... new: size=... end=...`. `NOCHANGE: partition 1 is size ... it cannot be grown` means the disk is not bigger yet or the partition is not last: **STOP**.

Then grow the filesystem by type (from `df -T /`). For ext4:

```
sudo resize2fs /dev/vda1
```
Expected: `The filesystem on /dev/vda1 is now N (4k) blocks long.` Growing online is supported; no unmount.

For xfs:

```
sudo xfs_growfs /
```
Expected: a `data blocks changed from ... to ...` line.

**Case B: LVM (SOURCE `/dev/mapper/<vg>-<lv>`; `lsblk` shows `lvm`).** Grow the partition holding the physical volume first (`growpart` as in case A, on that partition, for example `/dev/vda 3`), then:

```
sudo pvresize /dev/vda3
```
Expected: `Physical volume "/dev/vda3" changed` and `1 physical volume(s) resized`. Then extend the logical volume and its filesystem in one go (the device name comes from `findmnt /`; the one below is the Ubuntu default):

```
sudo lvextend -r -l +100%FREE /dev/mapper/ubuntu--vg-ubuntu--lv
```
Expected: `Logical volume ... successfully resized` and a filesystem resize line.

**Verify.**

```
df -h /
```
Expected: Size matches the new disk (a little under the dashboard figure) and Avail is at least 30 GB more than before.

```
lsblk
```
Expected: the root partition fills the disk.

**STOP** on any error; do not try a different command blindly, report it. **Undo:** growing a partition or filesystem has no undo command; if the filesystem is damaged, restore from the snapshot or dump on the owner's call. Never run `fsck` on a mounted root.

---

## 6. After the resize

If the stack was stopped in step 4, start it (CHANGES, after a GATE):

```
sudo docker compose up -d
```
Expected: four containers started.

```
sudo docker compose ps
```
Expected: postgres, backend, worker, caddy running, none restarting or unhealthy. **STOP** otherwise: `sudo docker compose logs backend --tail 80`, report.

```
for u in https://ls-staging-api.unifolio.in/health https://ls-redesign.unifolio.in/ https://ls-staging.unifolio.in/; do curl -s -o /dev/null -w "%{http_code}\n" "$u"; done
```
Expected: `200 200 200` (one per line).

```
sudo docker compose run --rm -T backend alembic current
```
Expected: `0046 (head)`. **STOP** on anything else.

**Human smoke test:** open https://ls-redesign.unifolio.in/ in the browser, sign in, open Holdings, confirm the holdings load. If a maintenance banner was switched on, switch it off.

**Housekeeping (CHANGES, safe, after a yes):**

```
sudo docker image prune -f
```
Expected: `Total reclaimed space: ...` (often small, because layers are shared). Removes only dangling (untagged) images.

**Do NOT remove:** the `:latest` and `:previous` tags of `leapswitch-backend` and `leapswitch-worker`; the backend `:pre-redesign` tag (the rollback target); any volume (`leapswitch_pgdata` is the database). Never run `docker system prune -a` or `docker volume prune`. Record the final `df -h /`.

---

## 7. Ongoing prevention (documented only, NOT implemented)

**Checklist to follow by hand:**
1. Before any `--full`: `df -Pk /var/lib/docker` and require 10 GB or more free (the Available column in KB, 10485760 or more). Below that, stop.
2. Use the front-end-only form (`sudo sh ./scripts/deploy-redesign.sh`, no flag) unless `git diff --stat <deployed commit> <tip> -- backend` is not empty. About 1 GB free is enough for it.
3. After each deploy and after each signed-off release: `sudo docker image prune -f`, then `sudo docker builder prune -f` (frees the cache; the next `--full` builds slower).
4. Cap the cache: `sudo docker builder prune --keep-storage 3GB -f` keeps the newest 3 GB. The flag spelling can differ between Docker versions (`--keep-storage` or `--reserved-space`): check `docker builder prune --help` first.
5. Alert at about 80% disk use. Options: (a) a cron line that runs `df` and calls the existing ops alert path (`docker compose run --rm -T backend python scripts/send_job_failure_alert.py disk-usage <code>` with the `df` line on stdin, the same path `backup.sh` and `run-job.sh` use; whether that script accepts a new job name is NOT verified); (b) a CloudPe dashboard monitor or alert if one exists (not verified); (c) a manual `df -h` at the start of each QA day. Needs the owner's go because it changes the crontab.

**BACKLOG (not built; each needs the owner's go; also listed in `DEFERRED_FEATURES.md`):**
- **H1.** Free-disk pre-check before `exec ./scripts/deploy.sh` in `deploy-redesign.sh`, and before the front-end build in `deploy.sh` (refuse below 10 GB for `--full`, 1 GB for front-end only).
- **H2.** Skip the backend rebuild when `git diff --quiet <last-deployed> HEAD -- backend` shows no change.
- **H3.** Let the worker reuse the backend image: in `docker-compose.yml` give `worker` `image: leapswitch-backend:latest` and drop its `build:`, so only one image is built (less build time, disk and cache).
- **H4.** Build the backend and worker images BEFORE the front end goes live, so a failed build changes nothing live. Today a failed `--full` leaves the new front end live, `:previous` and `:latest` can point at the same image (so `rollback.sh` is a no-op for the backend), and there is no front-end rollback.

---

## 8. If the disk fills again before the resize (emergency)

What happened on 29 Oct: 3.5 GB free fell to 239 MB during a build, then the build failed. Postgres lives on the same disk, so a full disk can stop writes or crash the database (a failed WAL write, then crash recovery). The data is not usually corrupted, but treat it as at risk: take a dump as soon as there is room.

Free space in this order, each with a human yes, stopping once at least 2 GB is free:
1. Stop whatever is building (`Ctrl-C`) and do not start another build.
2. `sudo docker builder prune -f` (build cache; it freed 2 GB on 29 Oct). Safe.
3. Remove failed-build images by ID, after `sudo docker images --no-trunc` shows they are not used by a running container. Check that `:latest` does not point at a half-unpacked image; if it does, retag `:latest` to the running `:previous` image (manager's yes).
4. `sudo docker image prune -f` (dangling images; may free nothing because of shared layers, as on 29 Oct).
5. Unused old images known to be unneeded (on 29 Oct: `postgres:18-alpine`, `leapswitch-worker:pre-redesign`, the `pre-ux` images), by explicit tag, one at a time.
6. `sudo journalctl --vacuum-size=200M` and `sudo apt-get clean` (small gains).

**Never:** `docker system prune -a`, `docker volume prune`, or removing `leapswitch_pgdata`; deleting anything under `/var/lib/docker` or `/var/lib/containerd` by hand; removing images the running containers use; removing `:latest`, `:previous` or the backend `:pre-redesign`.

After freeing space: run the section 6 checks, take a `backup.sh` dump, then schedule the resize.

---

## 9. Sign-off table

| Step | Done | Who | Time | Result |
|---|---|---|---|---|
| 2 Pre-checks recorded (df, type, partition, LVM yes/no, docker df) | | Manager's Claude | | |
| 3a backup.sh dump verified in object storage | | Manager's Claude | | |
| 3b CloudPe snapshot taken (or skipped by choice) | | Human | | |
| 3c Window agreed, testers told | | Human | | |
| GATE 1 yes | | Human | | |
| 4 Stack stopped (only if required) | | Manager's Claude | | |
| 4 Dashboard resize applied, new size | | Human | | |
| 4 Public IP and SSH allowlist re-checked | | Human | | |
| GATE 2 yes | | Human | | |
| 5 growpart / pvresize done | | Manager's Claude | | |
| 5 resize2fs / xfs_growfs / lvextend -r done | | Manager's Claude | | |
| 5 `df -h /` shows the new size | | Manager's Claude | | |
| 6 Stack up, containers healthy | | Manager's Claude | | |
| 6 Health URLs 200 200 200 | | Manager's Claude | | |
| 6 `alembic current` 0046 (head) | | Manager's Claude | | |
| 6 Browser login and Holdings smoke test | | Human | | |
| 6 Housekeeping `image prune -f` done | | Manager's Claude | | |
| 7 Prevention checklist adopted; backlog H1 to H4 decision | | Owner | | |
