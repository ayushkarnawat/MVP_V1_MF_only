# LeapSwitch (CloudPe) staging runbook

**Date:** 2026-10-15
**Scope:** staging only, running 24/7 on one VM in CloudPe `IN-WEST3`. Production stays on AWS.
**Plan and reasoning:** the artifact at https://claude.ai/artifact/1MKv81XjzmfTTh86uz1CDi (committed copy: `Docs/orchestration/leapswitch-staging-plan.html`). This runbook is the *doing* document; the artifact explains why.

## Status of this runbook

| Part | State |
|---|---|
| 1. Branches and releases | Complete |
| 2. Dashboard setup | Complete (field names come from CloudPe's guides, not from your screen; screenshot anything that differs) |
| 3. First login and VM hardening | Complete, commands ready |
| 4. Object storage test | Complete |
| 5. AWS-side items and DNS | Complete |
| 6. Deploy the application | **Outline only.** Needs `deploy/leapswitch/` (compose file, Caddyfile, timers, scripts), which is not written yet, and decision D2 |
| 7. Copy data from AWS | Outline, depends on Part 6 |
| 8. Test, upgrade, cut over, roll back | Complete |

**Still open decisions** (detail in the artifact): D2 (recompute without ECS, needs your go), D3 (reuse or new PAN keys), D4 (CloudPe to confirm encryption), D5 (real data on CloudPe or synthetic only).

**Until D4 and D5 are settled, use only the synthetic CAS PDFs** in `Docs/CAS Files/synthetic/pdfs/`. No real statements on CloudPe.

## Terminals used in this runbook

Every command block names where to run it.

| Label | Where | What it is |
|---|---|---|
| **Terminal A** | Your laptop, PowerShell | SSH into the VM, copy files |
| **Terminal B** | The VM, over SSH | Everything on the CloudPe server |
| **Terminal C** | Your laptop, WSL with the AWS CLI | AWS items (IAM, Route 53), and the tunnel to AWS staging's database |

Never paste passwords, access-key secrets or the SSH private key into a chat. Type them into the VM or the dashboard yourself.

---

## Part 1. Branches and releases

```
feat/leapswitch    <- all work happens here, deployed to CloudPe
        |
        |  git merge --ff-only   (when a batch has passed QA on CloudPe)
        v
feat/enhanced-ui   <- receives merges only, deployed to AWS
        |
        v  (later)
main               <- AWS production
```

**Rules**

1. All work (features, fixes, migrations, the CloudPe deploy files) happens on `feat/leapswitch`.
2. Never commit directly on `feat/enhanced-ui`. It only receives `git merge --ff-only feat/leapswitch`. If git refuses, someone broke this rule; fix it by merging the other way, not by forcing.
3. An urgent AWS fix is made on `feat/leapswitch` first, then merged across.
4. Merge at the end of each tested batch, and at least weekly. A long gap makes the merge a bulk move.
5. CloudPe-specific behaviour lives in settings, never in code branches. The new code switches (S3 endpoint and path-style, separate SES credentials, recompute mode) default to AWS behaviour, so AWS runs the same code with its normal settings.
6. `deploy/leapswitch/` is CloudPe-only. `infra/` is AWS-only. When you add infrastructure, make the matching change on both sides in the same pull request (a new scheduled job needs a Terraform entry for AWS and a systemd timer for CloudPe).
7. **Pin image tags.** Build one image per release, tag it with the git commit (for example `unifolio-backend:3f9a2c1`), and deploy that same tag to both clouds. Never deploy `latest`. (The AWS jobs currently use `image_tag = "latest"`; change this to a pinned tag the first time you touch the scheduler module.)
8. Each environment has its own database. Nothing syncs data between CloudPe and AWS.
9. Never edit files on the VM. If it isn't in git, it will be lost or will drift.

**Checklist for each AWS release**

1. CloudPe staging has run the change and QA passed.
2. Run the tests for the files the change touches, with AWS-style settings (ECS dispatcher, no CloudPe endpoint).
3. `git switch feat/enhanced-ui` then `git merge --ff-only feat/leapswitch`.
4. Build and push the commit-tagged image to ECR.
5. Apply any Terraform changes the batch needs.
6. Deploy to AWS and run the migrations (use the current AWS deploy guide, `2026-10-14-staging-deploy-guide-subproject-2.md`, as the template).
7. Check the AWS QA screens.

Creating the branch (one time, from `feat/enhanced-ui`): `git switch -c feat/leapswitch`. Do this before the deploy files are written.

---

## Part 2. Dashboard setup (about 1.5 hours)

Dashboard: https://cmp.dashboard.controlcloud.app. Region for everything: **Mumbai DC3 (IN-WEST3)**.

Before you start, on your laptop, **Terminal A**:

```powershell
ssh-keygen -t ed25519 -C "unifolio-staging"
Get-Content $HOME\.ssh\id_ed25519.pub
```

Press Enter through the prompts. Copy the single line the second command prints; that is the public key. Keep the private file `id_ed25519` private.

Also find your office and home public IPv4 addresses (search "what is my IP"). Every admin who needs SSH needs their IP in the security group, because rules cannot be edited later, only deleted and recreated.

**2.1 Project.** *Billing & Account -> Projects*. Make sure a project named `unifolio-staging` exists. KYC must show as verified, or provisioning is blocked.

**2.2 SSH key.** *Billing -> SSH Keys*. Add the public key from above, named `unifolio-admin`.

**2.3 Private network.** If none exists in IN-WEST3, create one. A single VM with the public toggle does not strictly need it, but keep one for later.

**2.4 Security group.** *Networks -> Security Groups -> Create Security Group*, named `unifolio-web`. Open it and add inbound rules (IPv4 only):

| Protocol | Port | Source | Why |
|---|---|---|---|
| TCP | 22 | each admin IP as `x.x.x.x/32` | SSH, admins only |
| TCP | 80 | `0.0.0.0/0` | Caddy needs it to issue certificates |
| TCP | 443 | `0.0.0.0/0` | HTTPS |

Leave outbound as allow-all. A new group denies all inbound by default. Do **not** use the project's `default` group, which allows everything.

**2.5 Object storage keys and buckets.** *Object Storage -> Access Keys -> Generate New Key*. Save the key ID and secret in your password manager now; the secret is shown once. Create two buckets:

- `unifolio-staging-cas-files`
- `unifolio-staging-disclosure-failed`

Endpoint: `https://s3.in-west3.purestore.io`, region `in-west3`.

**2.6 OpenStack credentials (optional, for scripts and Terraform later).** Profile icon -> *My Account -> OpenStack Credentials -> Generate Credentials*. Project `unifolio-staging`, region IN-WEST3, expiry about 60 days out. Save the Server URL, ID and secret, and put the expiry date in your calendar.

**2.7 Create the VM.** *Compute -> Virtual Machines -> + Create VM*.

| Field | Select |
|---|---|
| VM Name | `unifolio-staging-1` |
| Number of instances | 1 |
| Region | Mumbai DC3 (IN-WEST3) |
| Project | `unifolio-staging` |
| Size tab / tile | General Purpose, `a.gp1.12g` (3 vCPU, 12 GB) |
| Operating system | Ubuntu 24.04 LTS |
| Billing period | Hourly (same price as monthly at 24/7, no lock-in; cannot be changed after launch) |
| Storage policy | Standard NVMe |
| Boot volume | 30 GB |
| + Add Volume | 100 GB (or 50 GB if the AWS database is small), Standard, **Keep on termination** |
| Public Network | On (gives a direct public IP, no router needed) |
| Private Network | On (default) |
| Security group | `unifolio-web` |
| Root password | Click Generate and save it (shown once) |
| SSH key | `unifolio-admin` |
| Advanced -> User data | Leave empty |
| Advanced -> Tags | `env=staging` |

Check the pricing summary on the form. Expect about ₹2.23/hr (₹1,630/mo) for the VM. If it differs a lot, stop and ask CloudPe. Click **Create VM**. It goes Building -> Active in about 1 to 2 minutes, and the public IP appears once Active. Write the IP down.

**2.8 Note the trial expiry date** from the dashboard and set reminders for day 10 and day 13. Everything is deleted at day 20 of the trial unless you upgrade.

---

## Part 3. First login and VM hardening

**Terminal A:**

```powershell
ssh -i $HOME\.ssh\id_ed25519 root@<PUBLIC_IP>
```

CloudPe's guide shows `root`. If it refuses, try `ubuntu@<PUBLIC_IP>` and add `sudo` to the commands below. Type `yes` to accept the host fingerprint.

### 3.1 Create the admin user (Terminal B, as root)

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy
chmod 440 /etc/sudoers.d/deploy
```

**Open a second PowerShell window (Terminal A) and test the new user before going further:**

```powershell
ssh -i $HOME\.ssh\id_ed25519 deploy@<PUBLIC_IP>
```

Only continue from the `deploy` session if that works. If you disable root login first and the key does not work, your only way back in is the dashboard console (CloudPe has console access and Rescue Mode as a fallback).

### 3.2 Lock down SSH (Terminal B, as `deploy`)

```bash
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/; s/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sshd -t && sudo systemctl reload ssh
sudo sshd -T | grep -E 'permitrootlogin|passwordauthentication'
```

**Good looks like:** `permitrootlogin no` and `passwordauthentication no`. Ubuntu cloud images can ship a file in `/etc/ssh/sshd_config.d/` (often `50-cloud-init.conf`) that sets `PasswordAuthentication yes` and wins over the main file. If the last command still shows `yes`, edit that file in the same way and reload again.

### 3.3 Update, base packages, timezone (Terminal B)

```bash
sudo timedatectl set-timezone Asia/Kolkata
sudo apt-get update
sudo apt-get -y upgrade
sudo apt-get install -y unattended-upgrades fail2ban ufw ca-certificates curl gnupg
echo "unattended-upgrades unattended-upgrades/enable_auto_updates boolean true" | sudo debconf-set-selections
sudo dpkg-reconfigure -f noninteractive unattended-upgrades
date
```

**Good looks like:** `date` prints IST. If `apt` says a reboot is required (kernel upgrade), run `sudo reboot`, wait a minute and SSH back in.

### 3.4 Data volume (Terminal B)

First identify the disks. **Do not run `mkfs` until you have confirmed which disk is the empty 100 GB one**; it erases the disk.

```bash
lsblk -o NAME,SIZE,TYPE,MOUNTPOINT,FSTYPE
```

**Good looks like:** one disk of about 30 GB with a mounted partition (the boot disk) and one disk of about 100 GB with **no** filesystem and no mountpoint, typically `vdb`. Replace `/dev/vdb` below if yours differs.

```bash
sudo mkfs.ext4 -L unifolio-data /dev/vdb
sudo mkdir -p /srv/data
echo 'LABEL=unifolio-data /srv/data ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab
sudo mount -a
df -h /srv/data
```

**Good looks like:** `/srv/data` shows about 100 GB with the new filesystem.

### 3.5 Swap (Terminal B)

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

### 3.6 Firewall on the VM (Terminal B)

The CloudPe security group is the main firewall. `ufw` is a second layer.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
sudo systemctl enable --now fail2ban
```

**Important:** Docker edits the firewall rules directly, so a container port published with `-p 5432:5432` is reachable from the internet even though `ufw` does not list it. Never publish Postgres (or any internal service) to the host. In the compose file only Caddy publishes ports 80 and 443; the database stays on the internal Docker network.

### 3.7 Docker (Terminal B)

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker deploy
```

Log out and back in (so the `docker` group applies), then:

```bash
docker run --rm hello-world
docker compose version
```

**Good looks like:** "Hello from Docker!" and a Compose version number.

**Checkpoint:** you now have a hardened VM with a data volume, swap, firewall and Docker. Send the assistant the **public IP** and the **S3 endpoint** only.

---

## Part 4. Object storage test (Terminal B)

This proves the CloudPe storage works the way the backend needs it to, before any code depends on it.

```bash
sudo snap install aws-cli --classic
aws configure --profile cloudpe
```

Enter the Access Key ID and Secret from step 2.5 when prompted (typing them into the VM, not a chat). Default region: `in-west3`. Output format: `json`. Then:

```bash
aws configure set default.s3.addressing_style path --profile cloudpe
export AWS_PROFILE=cloudpe
EP=https://s3.in-west3.purestore.io

aws s3 ls --endpoint-url $EP
echo "hello" > /tmp/test.txt
aws s3 cp /tmp/test.txt s3://unifolio-staging-cas-files/test.txt --endpoint-url $EP
aws s3 cp s3://unifolio-staging-cas-files/test.txt /tmp/test-back.txt --endpoint-url $EP
cat /tmp/test-back.txt
aws s3 rm s3://unifolio-staging-cas-files/test.txt --endpoint-url $EP
```

**Good looks like:** both buckets listed, `hello` printed back, and the delete succeeds. Also try the lifecycle call to find out whether expiry rules are supported (the app deletes expired files itself, so this is not a blocker):

```bash
aws s3api get-bucket-lifecycle-configuration --bucket unifolio-staging-cas-files --endpoint-url $EP
```

An error such as `NotImplemented` or `NoSuchLifecycleConfiguration` is fine. Note which one you get.

---

## Part 5. AWS-side items and DNS (Terminal C)

These are additive only. Nothing existing is changed.

### 5.1 SES-only IAM user

Find your SES identity ARN (it is the `ses_identity_arn` value in `infra/envs/staging/terraform.tfvars`, or in the AWS console under SES -> Verified identities). Save this as `ses-policy.json`, replacing the placeholder:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": "<SES_IDENTITY_ARN>"
    }
  ]
}
```

```bash
aws iam create-user --user-name leapswitch-ses-sender
aws iam put-user-policy --user-name leapswitch-ses-sender --policy-name ses-send-only --policy-document file://ses-policy.json
aws iam create-access-key --user-name leapswitch-ses-sender
```

The last command prints the key pair once. Put it in your password manager; it goes into the VM's `.env` later (`SES_AWS_ACCESS_KEY_ID` and `SES_AWS_SECRET_ACCESS_KEY`, names to be fixed when the code change is written).

### 5.2 DNS records

```bash
aws route53 list-hosted-zones-by-name --dns-name unifolio.in. --query "HostedZones[0].Id" --output text
```

Save this as `dns.json`, replacing `<PUBLIC_IP>`:

```json
{
  "Changes": [
    {"Action": "UPSERT", "ResourceRecordSet": {"Name": "ls-staging.unifolio.in.", "Type": "A", "TTL": 60, "ResourceRecords": [{"Value": "<PUBLIC_IP>"}]}},
    {"Action": "UPSERT", "ResourceRecordSet": {"Name": "ls-staging-api.unifolio.in.", "Type": "A", "TTL": 60, "ResourceRecords": [{"Value": "<PUBLIC_IP>"}]}}
  ]
}
```

```bash
aws route53 change-resource-record-sets --hosted-zone-id <ZONE_ID_FROM_ABOVE> --change-batch file://dns.json
```

Leave the existing `staging` and `staging-api` records alone. They keep pointing at AWS until cutover.

### 5.3 Google OAuth origin (browser)

Google Cloud console -> APIs & Services -> Credentials -> your OAuth 2.0 client -> Authorized JavaScript origins -> **Add** `https://ls-staging.unifolio.in`. Do not remove the existing origins.

---

## Part 6. Deploy the application (outline, not yet runnable)

Blocked on: the `deploy/leapswitch/` folder (not yet written) and decision D2. The steps are fixed; the commands get filled in when the files exist.

1. **Secrets.** Create `/srv/unifolio/.env` on the VM, owned by root, mode 600. Contents: database password; `PAN_ENCRYPTION_KEY` and `PAN_LOOKUP_PEPPER` (per D3); the CloudPe S3 key pair, endpoint and region; the AWS SES key pair, `EMAIL_DELIVERY_MODE=ses`, `SES_FROM_EMAIL`, `AWS_REGION=ap-south-1`; `ALLOWED_ORIGINS=https://ls-staging.unifolio.in`; `FRONTEND_BASE_URL=https://ls-staging.unifolio.in`; `GOOGLE_OAUTH_CLIENT_ID`. Keep an encrypted copy off the VM.
2. **Get the code onto the VM.** Clone the repo (a read-only deploy key), check out `feat/leapswitch`.
3. **Start Postgres** on `/srv/data` (internal network only), run `alembic upgrade head`. Staging is on migration `0041` after Sub-project 2.
4. **Build and start the backend, the recompute worker and Caddy.** Caddy obtains the HTTPS certificate for `ls-staging-api.unifolio.in`; port 80 must be reachable for this.
5. **Frontend.** On your laptop build with `VITE_API_BASE_URL=https://ls-staging-api.unifolio.in` and the Google client ID, then copy `dist/` to the VM (Terminal A, `scp`/`rsync`). Caddy serves it at `https://ls-staging.unifolio.in`.
6. **Scheduled jobs.** Install the 11 systemd timers (times below, timezone Asia/Kolkata) and the nightly backup timer. Run one job by hand to confirm.

| Job | IST time | Memory |
|---|---|---|
| nav-daily, benchmark-daily | 06:00 | 1 GB each |
| scheme-master-daily | 06:15 | 1 GB |
| ter-daily | 06:20 | 1 GB |
| analytics-recompute-daily (all households) | 06:30 | 1 GB |
| portfolio-disclosures-daily (days 1 to 20) | 05:45, move to 05:55 | 2 GB |
| stock-fundamentals-daily | 05:45 | 2 GB |
| market-cap-half-yearly (days 1 to 15 of Jan, Jul) | 05:45 | 2 GB |
| fund-managers-monthly (10th) | 06:00 | 2 GB |
| aaum-quarterly (1 Jan, Apr, Jul, Oct) | 06:00 | 1 GB |
| account-deletion-daily | 08:00 | 1 GB |
| cas-file-expiry-daily | 19:00 | 1 GB |

Move one of the two 05:45 jobs to 05:55 so two 2 GB jobs do not start together.

---

## Part 7. Copy data from AWS (outline)

Do this off-hours. It is read-only on AWS.

1. **Start the AWS bastion** (it is kept stopped), open the SSM tunnel to staging RDS, and run the dump. Use the exact commands from Step 2 of `2026-10-14-staging-deploy-guide-subproject-2.md`. **Stop the bastion when finished.**
2. **Reference tables, always.** Everything not deleted by the user-domain section of `scripts/clean-staging-db.sh` is reference data. Dump those tables only, for example `pg_dump -Fc -t <table> ...` per table, and restore them into the VM's Postgres.
3. **User tables, only if** D3 is "reuse the staging keys" and D5 allows real data. The encrypted PANs only decrypt with the same keys.
4. **S3 files** (only alongside user data; CAS files expire after 30 days anyway): copy with `rclone`, keeping object keys identical so `imports.file_reference` rows still resolve.
5. Run the daily jobs once by hand to top the data up to today.

---

## Part 8. Test, upgrade, cut over, roll back

### 8.1 Test (about 3 days)

1. Sign up with email OTP (proves SES works from CloudPe).
2. Upload a **synthetic** CAS PDF (proves S3 save and, later, the expiry delete).
3. Check that analytics recompute after the import, and that PDF export works.
4. Run the portfolio-disclosure, stock-fundamentals and fund-manager jobs from this Indian IP and record which AMC sites respond. This is new evidence for the Priority 1 factsheet item.
5. **Restore test:** restore last night's `pg_dump` into a scratch database and check it.
6. Run Part 2 of the Sub-project 2 QA guide against `https://ls-staging.unifolio.in`.

### 8.2 Upgrade the trial (by trial day 12)

Go to signup.cloudpe.com/upgrade. No new KYC is needed. Pay by UPI or net banking. All resources stay intact. Before the day-14 deadline, make sure a database dump and a file export exist **outside** CloudPe.

Check *Billing History* weekly and download the CSV. CloudPe has no spending alerts.

### 8.3 Cut over

1. Lower the TTL of `staging` and `staging-api` to 60 seconds a day before.
2. Point `staging.unifolio.in` and `staging-api.unifolio.in` at the VM (same record format as step 5.2).
3. Add `https://staging.unifolio.in` to the Google OAuth origins; update `ALLOWED_ORIGINS` and `FRONTEND_BASE_URL` in the VM's `.env`; restart the backend.
4. Park AWS staging (leave it, do not delete it).

### 8.4 Roll back

Point `staging` and `staging-api` back at the AWS targets (the previous values, saved before step 8.3). With a 60-second TTL this takes effect within minutes. Nothing on AWS was changed, so it is still the previous version.

---

## If something goes wrong

| Symptom | Likely cause and fix |
|---|---|
| `Permission denied (publickey)` on SSH | The key was not selected on the VM form, or you are using the wrong user (`root`, `ubuntu`, `deploy`). Use the dashboard console to fix `authorized_keys`. |
| SSH times out | Your current IP is not in the `unifolio-web` rule. Delete the 22 rule and re-create it with the new IP (rules cannot be edited). |
| Caddy cannot get a certificate | Port 80 is not open to the internet, or the DNS record does not yet point at the VM. Check the security group and `dig ls-staging-api.unifolio.in`. |
| `lsblk` shows no second disk | The data volume was not attached. Dashboard -> Storage -> Volumes -> Actions -> Attach Volume. |
| S3 call returns a signature or host error | Path-style is not set. Re-run the `addressing_style path` line in Part 4. |
| Out-of-memory kills | Resize to `a.gp1.16g` (brief power-off), and check the two 05:45 jobs are staggered. |

**When to contact CloudPe:** the three emails in the artifact (support, billing, sales) cover the open platform questions. Technical problems after that go to `support@cloudpe.com`.
