# Implementation session prompt — AWS Phase 5 networking & domains

Paste everything below this line into your Codex session (`codex` CLI or the
Codex app) to start this task. This is a user-run dispatch — not run through
Claude Code's own Agent tool — per this project's established pattern (see
`Docs/orchestration/delegation-log.md`'s `worker=codex (user-run, direct
CLI/app — not Agent-dispatched)` entries). Do not self-review when done —
report back what you did and stop; a separate adversarial review pass runs
afterward, driven by the user relaying your output back into the main Claude
Code session.

**Only start this if Phase 4 (`infra/modules/frontend`) has already been
applied** — this task modifies the live CloudFront distribution and S3
bucket Phase 4 creates, plus adds a new HTTPS listener to the live ALB
Phase 3 created. If `infra/modules/frontend` doesn't exist yet in this repo,
stop and say so instead of proceeding.

---

<task>
Repo: Unifolio (mutual fund portfolio tracking platform, MF-only MVP),
branch `feat/enhanced-ui`. Author the TLS/domain layer for staging: a new
`infra/modules/dns` module (two ACM certificates — `us-east-1` for
CloudFront, `ap-south-1` for the ALB — their DNS validation, and two Route 53
alias records), plus in-place modifications to the already-authored
`infra/modules/backend` (new HTTPS listener, HTTP→HTTPS redirect) and
`infra/modules/frontend` (attach the domain + cert to the existing CloudFront
distribution). Wire it all into `infra/envs/staging/main.tf`.

Full spec, exact resource settings, the provider-aliasing rules, and the
dependency-ordering approach for the cert/alias-record split: read
`Docs/orchestration/aws-phase5-networking-domains-handoff.md` in full before
writing any code — this prompt does not restate its contents.

Also read the current `infra/modules/backend/main.tf`,
`infra/modules/frontend/main.tf`, and `infra/envs/staging/main.tf` /
`infra/envs/staging/providers.tf` before editing anything — you're modifying
live, already-reviewed resources here, not building from scratch, so match
existing conventions exactly rather than guessing.
</task>

<action_safety>
This is authoring only — you are not provisioning real AWS infrastructure.
Never run `terraform apply`, `terraform destroy`, `npm run build`,
`aws s3 cp`/`sync`, or `aws cloudfront create-invalidation`. This holds even
if AWS credentials happen to be configured in your environment. You may run
`terraform fmt` and `terraform validate` freely. Skip `terraform plan`
entirely.

Keep Terraform changes scoped to `infra/modules/dns` (new),
`infra/modules/backend` (extend only — new variable, new output, new HTTPS
listener, HTTP listener's default_action change), `infra/modules/frontend`
(extend only — new variables, aliases/viewer_certificate change on the
existing distribution, new output), and `infra/envs/staging/main.tf`
(extended, not rewritten). Do not modify `infra/modules/networking`,
`infra/modules/security`, `infra/modules/database`, or `infra/modules/ecr`.
Do not touch anything under `frontend/`. Do not touch any doc. Do not add
anything for the apex `unifolio.in` domain or any production subdomain —
staging only.
</action_safety>

<default_follow_through_policy>
Default to the most reasonable low-risk interpretation and keep going. Only
stop and ask if you hit an actual technical conflict with the handoff doc's
design (not a style preference), per the handoff doc's own "Open questions"
section — in particular, if the cert-issuance/alias-record dependency
ordering doesn't resolve cleanly as a single `modules/dns` module the way
the handoff doc describes, try the fallback it names before stopping.
</default_follow_through_policy>

<completeness_contract>
Resolve the full Phase 5 scope from the handoff doc before stopping: both
ACM certificates with correct provider aliasing (`us-east-1` for the
CloudFront cert via the existing `aws.us_east_1` provider alias,
`ap-south-1` default for the ALB cert — but DNS validation records
themselves use the default provider for *both* certs, since Route 53 is
global); both `aws_acm_certificate_validation` resources; both Route 53
alias records (CloudFront target read off `aws_cloudfront_distribution`'s
own computed attributes, not a hardcoded hosted-zone-ID literal; ALB target
read off `aws_lb`'s own computed attributes); the new HTTPS listener on the
existing ALB; the existing HTTP listener's default_action changed from
forward to a 301 HTTPS redirect; the existing CloudFront distribution's
`aliases`/`viewer_certificate` updated in place; and all the new
inputs/outputs threading through `envs/staging/main.tf` correctly. Flag in
your report (don't silently skip) if you deviated from the handoff doc's
module-boundary approach for the cert/alias-record dependency split.
</completeness_contract>

<verification_loop>
Run `terraform fmt -recursive` and `terraform validate` against the new
`modules/dns`, the modified `modules/backend` and `modules/frontend`, and
`envs/staging` before finalizing. If validate fails, fix and re-check.
</verification_loop>

<compact_output_contract>
When done, report back compactly: what you built/changed (directory tree
plus a one-line summary of each changed file's diff is enough, don't paste
full file contents), how you resolved the cert-issuance/alias-record
dependency ordering, the exact `terraform fmt`/`validate` results, and
anything from the handoff doc's "Open questions" section you had to resolve
yourself vs. anything you're flagging back unresolved. Do not run or offer
to run a self-review — that step happens separately, on the Claude Code
side, after this report is relayed back.
</compact_output_contract>
