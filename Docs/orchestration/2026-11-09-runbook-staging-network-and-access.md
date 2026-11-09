# Runbook: staging VM network, access and the 9 Nov 2026 public-network detach

**Read this before every staging task** (deploy, restore, disk resize, any work on the LeapSwitch VM). It records (1) how the VM is wired to the internet today, (2) what went wrong on 9 Nov 2026 and exactly how it was fixed, (3) a pre-flight check to run before any staging task, and (4) a recovery procedure if the VM is ever unreachable again.

Everything here was verified live on 9 Nov 2026 (API read-outs, `dig`, SSH, HTTPS). No secret is written in this file; where a credential is needed it says where to get it.

---

## 1. The current, correct configuration (as of 9 Nov 2026)

### 1.1 The VM
| Item | Value |
|---|---|
| Provider / console | CloudPe (`https://app.cloudpe.com`), region Mumbai DC3 |
| VM name | `unifolio-staging-1` |
| VM id | `2b24c152-a16f-4af2-8af7-09e7754699d5` |
| Project | `2818-unifolio-staging` (id `061723ff-dc94-4b3b-86f9-b22a088e0eb7`) |
| Flavor | `a.gp1.16g` (4 vCPU, 16 GB), boot volume 30 GB (about 9.8 GB free on 9 Nov) |
| Dashboard page | `https://app.cloudpe.com/dashboard/vms/2b24c152-a16f-4af2-8af7-09e7754699d5#networking` |
| App folder on the VM | `/opt/unifolio-redesign`; compose and scripts in `/opt/unifolio-redesign/deploy/leapswitch` |
| Containers | `leapswitch-backend-1`, `-worker-1`, `-caddy-1`, `-postgres-1` |

### 1.2 Network interfaces: the VM must have exactly these two
| Interface | Network | Address | Port id | Security group on it |
|---|---|---|---|---|
| `unifolio-private` (primary) | private | `10.0.0.70` | `596089d0-cb35-4819-a9be-dc87d232153a` | `default` (6 rules) |
| `public` | public | **`45.64.107.180`** (and IPv6 `2405:7140:4::d1`) | `b74a0f87-2e45-4e2c-8e46-fe04e0bb7fee` | **`unifolio-web`** (17 rules) |

**The public interface is the VM's only route to the internet from outside. If it is detached, the VM is unreachable on every port (22, 80, 443) and the site is down, while the VM itself keeps running perfectly.** There is no reserved or floating IP: the public address belongs to the interface. **Detaching it releases the address for good.** The address you get when you attach the public network again is a different one.

### 1.3 Security group `unifolio-web` (id `0a67c32b-e96a-40b4-b0ec-1be86313495d`)
Created together with the VM on 30 Oct 2026. It must be attached to the **public** interface. Rules:
- Ingress TCP **80** and **443** from `0.0.0.0/0` (the web).
- Ingress TCP **22** only from an allowlist of owner IP addresses, all in `106.219.134.x` (single `/32` addresses, plus one `/22`, see the note below). Includes "Home IP - 9th November" = `106.219.134.137/32`.
- Egress: all IPv4 and IPv6 allowed.

**Why this matters:** SSH is allowed by *source IP*. When your home or office IP changes you get `Connection timed out` (a timeout, not a refusal). Fix: add a TCP 22 rule for the new `/32` **to `unifolio-web`** (not to `default`), and leave the old rules alone. Check your IP with `curl https://api.ipify.org` (from the same machine you will SSH from; the Windows side and WSL on this laptop share one IP).

Note for the owner, not changed: one of the SSH rules is `106.219.134.86/22`, which covers 1,024 addresses (`106.219.132.0` to `106.219.135.255`), not one. It looks unintentional (a `/22` instead of `/32`). Tighten it when convenient.

The group named `default` exists several times (one per project/network, 6 rules each, **allows all traffic from anywhere**). **Never put a VM interface on `default`.** `unifolio-private` sits on one because it has no public exposure.

### 1.4 The VM's own firewall (second layer, inside the VM)
`ufw` is active: default deny incoming, allow only 22, 80, 443 (IPv4 and IPv6). `fail2ban` is running for `sshd`. Postgres is **not** published to the host (container-internal port only). So even if a dashboard security group were wrong, only 22/80/443 are reachable. Do not rely on this alone.

### 1.5 DNS (stays on AWS Route 53)
Hosted zone `unifolio.in`, id `Z025892111H2UZC96MA2A`. Three A records, all to the public IP:

| Name | Type | TTL | Value |
|---|---|---|---|
| `ls-redesign.unifolio.in` | A | 300 | `45.64.107.180` |
| `ls-staging-api.unifolio.in` | A | 60 | `45.64.107.180` |
| `ls-staging.unifolio.in` | A | 60 | `45.64.107.180` |

Last change: `C10084822W6DTURZL3K8U`, 9 Nov 2026 (was `202.66.174.251`). Hostnames are what the app, `.env` and the guides use. **Use the hostnames in every command and doc; use the raw IP only for diagnosis**, because the IP can change again.

### 1.6 SSH access
- User `deploy`, key-only (no password). Command: `ssh deploy@ls-redesign.unifolio.in`.
- **Run it from the laptop's WSL**, not Windows. The registered private key lives in WSL (`~/.ssh/id_ed25519`); the Windows key is refused (`Permission denied (publickey)`).
- Host key (ED25519) fingerprint, to check before trusting any new address or hostname: `SHA256:J0nPZnfmglyvNnCqQZ1oDs3meaKxgYFJ7HGDwe6wyQ4`. Check with `ssh-keyscan -t ed25519 <host> | ssh-keygen -lf -`. The same fingerprint showed on the old IP and on the new one, which is how we proved it was the same machine.

### 1.7 Control tools and what works
| Tool | State on 9 Nov 2026 |
|---|---|
| CloudPe dashboard | Works (needs the owner's login). |
| CloudPe REST API `https://app.cloudpe.com/api/v1` with `Authorization: Bearer cpk_...` | **Works.** API keys are made in the dashboard (ACCOUNT, API Keys). Spec: `https://app.cloudpe.com/api/openapi.json` (needs the bearer token), docs at `/api/docs` and `/api/redoc`. **The key is not stored in the repo.** Ask the owner for it or for a new one. |
| OpenStack CLI (`~/.venvs/openstack-cli` in WSL, `~/.config/openstack/clouds.yaml`) | **Does not work**: the auth host in `clouds.yaml` (`cmp.dashboard.controlcloud.app`) no longer resolves. Use the REST API above instead. |
| AWS CLI in WSL (Route 53) | Works as `ayush-admim`. |

Useful API calls (set `K` to the key; never commit it):
```bash
B=https://app.cloudpe.com/api/v1; I=2b24c152-a16f-4af2-8af7-09e7754699d5
curl -s -H "Authorization: Bearer $K" $B/instances                       # VM status
curl -s -H "Authorization: Bearer $K" $B/instances/$I/interfaces         # interfaces, IPs, security groups
curl -s -H "Authorization: Bearer $K" $B/security-groups                 # all groups
curl -s -H "Authorization: Bearer $K" $B/security-groups/<sg_id>         # rules of one group
curl -s -H "Authorization: Bearer $K" $B/floating-ips                    # reserved IPs (empty today)
```
Other endpoints seen in the spec: `POST /instances/{id}/interfaces` (attach), `DELETE /instances/{id}/interfaces/{port_id}` (detach, returns 204, takes about 20 seconds), `POST/DELETE /instances/{id}/interfaces/{port_id}/security-groups[/{sg_openstack_id}]`, `POST /security-groups/{id}/rules`.

---

## 2. What happened on 9 Nov 2026

**Symptom.** Before a staging deploy, `ssh deploy@202.66.174.251` timed out. HTTPS on `ls-redesign`, `ls-staging` and `ls-staging-api` also failed (000), while the laptop's internet worked.

**Misleading first diagnosis.** A TCP 22 timeout normally means a security group IP allowlist problem (section 4 of the staging plan, "VM SSH access suddenly times out"). The owner added the home IP rule, which did nothing, because the problem was bigger: **ports 443 and 22 were both dead**, so it was not an SSH rule problem.

**Root cause.** The VM's `public` network interface had been **detached by mistake** in the CloudPe dashboard (the orange **Detach** button on the VM's Networking tab, right next to the one you want). The VM showed only `unifolio-private` (`10.0.0.70`). With no public interface the VM has no public address: nothing can reach it, and the address `202.66.174.251` went back to CloudPe's pool.

**Wrong turns worth remembering.**
1. Re-attaching the public network **twice** left two public interfaces (`45.64.107.180` and `188.241.61.246`). The second one never worked: the VM never configured the extra interface (no answer on port 22), and it would have been billed.
2. The new interfaces were put on the group `default` (**allow all traffic**), not `unifolio-web`. `unifolio-web` still existed (detaching an interface does not delete a security group) but was attached to nothing.
3. The owner's new "Home IP - 9th November" SSH rule had been added to `unifolio-web`, which was not attached, so it had no effect.

**Fix, in order (all verified):**
1. Attached the `public` network once (new IP `45.64.107.180`). Proved it was the same machine by comparing the SSH host key fingerprint with the one saved for the old IP (identical).
2. Pointed the three Route 53 A records at the new IP (change `C10084822W6DTURZL3K8U`). `dig @8.8.8.8` returned the new IP; the three health URLs returned 200.
3. Attached `unifolio-web` to the `public` interface and removed `default` from it (the owner did this in the dashboard; verified by API: `public -> [unifolio-web 17 rules]`).
4. Detached the spare `188.241.61.246` interface (API `DELETE .../interfaces/fb3524cc-2e56-4009-9603-5d4b0de68cb5`, 204).
5. Verified: SSH works by hostname with the right host key; commit `39a67410` and all four containers were intact (the containers never restarted: `Up` for hours across the outage).

**Impact.** Staging unreachable from the detach until DNS changed. No data, volume, commit or container was lost. Old IP not recoverable (no floating IP). No code or `.env` depended on the IP; only documents mentioned it (now updated).

---

## 3. Rules so this does not happen again
1. **Never click Detach on the VM's Networking tab** unless this runbook says to. The only detach that is ever correct: a duplicate or unused public interface, after the real one works.
2. **Never attach a second public network "to try".** One public interface only. Check first (`GET .../interfaces`), then act.
3. **Always attach `unifolio-web` to the public interface, never `default`.**
4. **Add SSH allowlist rules to `unifolio-web`**, and make sure that group is the one on the public interface.
5. **Use hostnames, not IPs**, in guides, scripts and `.env`.
6. If the public IP ever changes, **update the three Route 53 records** (section 5.2) and record it here.

## 4. Pre-flight check before ANY staging task
Run from the laptop's WSL, one at a time. All must pass before the task starts.
```bash
# 1. The site answers (needs DNS + public interface + 80/443 rule)
for u in https://ls-staging-api.unifolio.in/health https://ls-redesign.unifolio.in/ https://ls-staging.unifolio.in/; do curl -s -o /dev/null -w "%{http_code} $u\n" --max-time 15 "$u"; done   # expect 200 200 200

# 2. DNS matches the VM's public interface
dig +short ls-redesign.unifolio.in @8.8.8.8      # expect 45.64.107.180 (or the IP in section 1.2 if it was updated)

# 3. SSH works, same host key
ssh-keyscan -t ed25519 ls-redesign.unifolio.in 2>/dev/null | ssh-keygen -lf -    # expect SHA256:J0nPZnfmglyvNnCqQZ1oDs3meaKxgYFJ7HGDwe6wyQ4
ssh deploy@ls-redesign.unifolio.in 'hostname; git -C /opt/unifolio-redesign log -1 --format=%h'

# 4. The VM has exactly two interfaces and the right group (API key needed)
curl -s -H "Authorization: Bearer $K" https://app.cloudpe.com/api/v1/instances/2b24c152-a16f-4af2-8af7-09e7754699d5/interfaces | python3 -c "import sys,json; [print(x['network_name'],[i['ip_address'] for i in x['fixed_ips'] if i['version']==4],[s['name'] for s in x['security_groups']]) for x in json.load(sys.stdin)]"
#   expect: unifolio-private ['10.0.0.70'] ['default']   and   public ['45.64.107.180'] ['unifolio-web']
```
If anything differs, stop and use section 5.

## 5. Recovery: the VM is unreachable
### 5.1 Diagnose in this order
1. `curl -I https://ls-redesign.unifolio.in/` and an `ssh`. **Both time out** means the problem is the network path, not an SSH rule. **Only SSH times out, HTTPS works** means the `unifolio-web` SSH allowlist (add your `curl https://api.ipify.org` address as TCP 22 /32 to `unifolio-web`, takes effect at once).
2. Dashboard or `GET /instances`: is the VM `ACTIVE` and `running`?
3. `GET /instances/{id}/interfaces`: is there a `public` interface with an IPv4 address? If not, **the public network was detached (this incident).**
4. Does that IP equal what `dig` returns for the three names? If not, DNS is stale.
5. Is `unifolio-web` on the public interface? If it is `default`, the web is open to the world and your SSH rule is not applied.

### 5.2 Fix: the public interface is missing or the IP changed
1. Attach the **public** network **once** (dashboard: VM, Networking, **Attach Network**, choose `public`). Note the new IPv4.
2. Prove it is the same VM: `ssh-keyscan -t ed25519 <new-ip> | ssh-keygen -lf -` must equal the fingerprint in section 1.6.
3. Attach `unifolio-web` to that interface and remove `default` from it (dashboard: the interface's Security Groups box, **+ Add**, then remove `default`).
4. Update Route 53 (AWS CLI in WSL, three records, keep the TTLs):
```bash
cat > /tmp/dns.json <<EOF
{"Comment":"public IP changed","Changes":[
 {"Action":"UPSERT","ResourceRecordSet":{"Name":"ls-redesign.unifolio.in.","Type":"A","TTL":300,"ResourceRecords":[{"Value":"<NEW-IP>"}]}},
 {"Action":"UPSERT","ResourceRecordSet":{"Name":"ls-staging-api.unifolio.in.","Type":"A","TTL":60,"ResourceRecords":[{"Value":"<NEW-IP>"}]}},
 {"Action":"UPSERT","ResourceRecordSet":{"Name":"ls-staging.unifolio.in.","Type":"A","TTL":60,"ResourceRecords":[{"Value":"<NEW-IP>"}]}}]}
EOF
aws route53 change-resource-record-sets --hosted-zone-id Z025892111H2UZC96MA2A --change-batch file:///tmp/dns.json
```
5. Wait about a minute, run section 4. Update section 1.2 and 1.5 of this file.
6. If you attached more than one public interface by mistake: keep the one that answers on port 22 and detach the others only after steps 3 to 5 pass.

## 6. Known facts and open items (9 Nov 2026)
- The SSH `/22` rule in `unifolio-web` is wider than it looks (section 1.3).
- The OpenStack CLI auth URL is dead; replace the credential in `~/.config/openstack/clouds.yaml` only if you need the CLI. The REST API is enough.
- The full-access CloudPe API key given in chat on 9 Nov 2026 is the owner's choice for this staging environment. It is not in the repo. Rotate it if it ever leaves the owner's control.
- Earlier records and guides that say `202.66.174.251` are historical and were left as written.
