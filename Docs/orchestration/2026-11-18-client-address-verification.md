# Client address behind the proxy: checked at both levels (18 Nov 2026)

Why: Batch B's per-address guard (B-2) counts requests per client address and relies on `get_client_ip()` (`backend/app/services/auth/device_info.py`), which trusts the **last** entry of `X-Forwarded-For`. That is only safe if whatever sits in front of the backend either appends the real address last or replaces the header. Checked on both hosting setups the app runs behind.

## AWS staging (checked read-only against the live account, `ap-south-1`)
- A load balancer **does** exist: `unifolio-staging-alb`, internet-facing, type application, state active (created by Terraform, `infra/modules/backend/main.tf`, `aws_lb.this`; the earlier ADR text says "ECS Express Mode", but the code builds an explicit load balancer).
- Attribute `routing.http.xff_header_processing.mode = append`: a header the caller sends is kept and the real address is added **last**. So the last entry is the real client and a forged first entry is ignored. This is what `get_client_ip()` assumes.
- The backend tasks have no public address (`assign_public_ip = false`, private subnets) and the task security group `staging-ecs-sg` allows only port 8000 from one other security group (the load balancer's). Nothing can reach a task directly and write its own header.
- `routing.http.drop_invalid_header_fields.enabled = false` (the default): not a problem for this guard.
- Not checked: production AWS (does not exist yet; the production gate must repeat this check for whatever sits in front of it).

## LeapSwitch staging VM (`ls-redesign.unifolio.in`)
- The VM's proxy is Caddy: container `leapswitch-caddy-1`, image `caddy:2-alpine`, **v2.11.7** (read over SSH, read-only). The site blocks use a plain `reverse_proxy backend:8000` with no `trusted_proxies`, and the DNS A records point at the VM's own public address, so nothing sits in front of Caddy.
- Test (local, same image tag, **v2.11.9**, the same `reverse_proxy` directive, an echo site behind it): a request with no header, one with `X-Forwarded-For: 1.2.3.4` and one with `X-Forwarded-For: 1.2.3.4, 5.6.7.8` all reached the backend with a **single** entry, the real connecting address. Caddy **replaces** a header from an untrusted caller instead of appending. So the last (and only) entry is the real client and a forged header cannot frame or hide an address.
- Not tested: a live request through the VM's own Caddy (v2.11.7 against my v2.11.9 test); the behaviour is the documented default and the same in both versions, but the B-2 deploy check should send one forged-header request to staging and read the stored hash prefix in the guard log line to confirm.

## What B-2 must do because of this
1. Keep `get_client_ip()` as it is (last entry). Add tests for: one entry (Caddy), several entries with a forged first one (AWS append), no header (falls back to the socket address), garbage and over-long values (returns `None`, guard skips with a log line, never errors).
2. Update the `get_client_ip()` docstring so it names both set-ups (AWS load balancer in append mode; Caddy in replace mode) and the condition that makes the rule safe: "the app is never reachable except through one of these proxies".
3. The M1 deploy guide gets a one-line post-deploy check (above) and the production gate gets the line "re-verify the proxy's header mode".
