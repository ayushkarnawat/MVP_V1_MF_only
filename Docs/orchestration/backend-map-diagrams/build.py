"""Builds unifolio-backend-map.html (artifact body) and a standalone copy. Rev 2, 2026-10-12."""
import html
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import diagrams as D  # noqa: E402

OUT = Path(__file__).parent


def dia(src: str) -> str:
    return f'<div class="diagram"><pre class="mermaid">{html.escape(src, quote=False)}</pre></div>'


def table(headers, rows, cls=""):
    th = "".join(f"<th>{h}</th>" for h in headers)
    body = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f'<div class="tbl-wrap {cls}"><table><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table></div>'


def qtags(*qs):
    return '<div class="qtags">' + "".join(f'<span class="qtag">Q{q}</span>' for q in qs) + "</div>"


def head(title, lede, *qs):
    return f'<div class="section-head">{qtags(*qs)}<h2>{title}</h2><p>{lede}</p></div>'


LEGEND = """<div class="legend">
  <span><i class="lg-db"></i>Database write</span>
  <span><i class="lg-create"></i>Key write (row created)</span>
  <span><i class="lg-none"></i>Error / nothing written</span>
  <span><i class="lg-aws"></i>AWS service involved</span>
  <span><i class="lg-pop"></i>Popup</span>
  <span><i class="lg-br"></i>Browser only</span>
</div>"""

CSS = """
:root {
  --bg: #FCFCFC; --surface: #FFFFFF; --ink: #111111; --muted: #5C5C5C; --border: #E5E5E5;
  --accent: #22C55E; --accent-ink: #15803D;
  --warn: #B45309; --warn-bg: #FEF3C7;
  --good: #15803D; --good-bg: #DCFCE7;
  --bad: #B42318; --bad-bg: #FEE4E2;
  --aws: #B45309; --aws-bg: #FFEDD5;
  --code-bg: #F4F6F5;
  --diagram-bg: #FFFFFF;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #0F0F0F; --surface: #1A1A1A; --ink: #F5F5F5; --muted: #A3A3A3; --border: #2A2A2A;
    --accent: #22C55E; --accent-ink: #4ADE80;
    --warn: #FCD34D; --warn-bg: #3A2A0A;
    --good: #86EFAC; --good-bg: #0F2E1A;
    --bad: #FDA29B; --bad-bg: #3B1512;
    --aws: #FDBA74; --aws-bg: #3A230C;
    --code-bg: #202322;
    --diagram-bg: #161616;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0F0F0F; --surface: #1A1A1A; --ink: #F5F5F5; --muted: #A3A3A3; --border: #2A2A2A;
  --accent: #22C55E; --accent-ink: #4ADE80;
  --warn: #FCD34D; --warn-bg: #3A2A0A;
  --good: #86EFAC; --good-bg: #0F2E1A;
  --bad: #FDA29B; --bad-bg: #3B1512;
  --aws: #FDBA74; --aws-bg: #3A230C;
  --code-bg: #202322;
  --diagram-bg: #161616;
}
* { box-sizing: border-box; }
body {
  background: var(--bg); color: var(--ink);
  font: 400 15px/1.6 "Manrope", system-ui, -apple-system, "Segoe UI", sans-serif;
  padding-inline: 20px; padding-block: 40px 72px;
}
.wrap { max-width: 1080px; margin: 0 auto; display: flex; flex-direction: column; gap: 64px; }
h1, h2, h3 { font-family: "DM Sans", system-ui, sans-serif; text-wrap: balance; margin: 0; letter-spacing: -0.01em; }
h1 { font-size: clamp(28px, 4.2vw, 38px); font-weight: 700; line-height: 1.15; }
h2 { font-size: 22px; font-weight: 700; line-height: 1.3; }
h3 { font-size: 16px; font-weight: 600; }
p { margin: 0; max-width: 72ch; }
ul, ol { margin: 0; padding-left: 20px; max-width: 72ch; display: flex; flex-direction: column; gap: 6px; }
code, .mono { font-family: "JetBrains Mono", ui-monospace, "SFMono-Regular", Consolas, monospace; font-size: 0.86em; }
code { background: var(--code-bg); padding: 1px 6px; border-radius: 4px; overflow-wrap: anywhere; }
a { color: var(--accent-ink); }
.eyebrow { font: 600 12px/1 "Manrope", sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent-ink); }
header { display: flex; flex-direction: column; gap: 14px; }
header .lede { font-size: 17px; color: var(--muted); }
nav { display: flex; flex-direction: column; gap: 10px; }
.navrow { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.navrow b { font: 600 11px/1 "Manrope", sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); min-width: 92px; }
nav a {
  color: var(--ink); text-decoration: none; font-size: 13px; font-weight: 500;
  border: 1px solid var(--border); border-radius: 999px; padding: 5px 12px; background: var(--surface);
}
nav a:hover { border-color: var(--accent); }
a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
section { display: flex; flex-direction: column; gap: 18px; scroll-margin-top: 16px; }
.section-head { display: flex; flex-direction: column; gap: 6px; }
.section-head p { color: var(--muted); }
.qtags { display: flex; flex-wrap: wrap; gap: 6px; }
.qtag { font: 600 11px/1 "JetBrains Mono", monospace; color: var(--accent-ink); background: var(--good-bg); border-radius: 4px; padding: 4px 7px; }
.sub { display: flex; flex-direction: column; gap: 12px; }
.answer { border-left: 3px solid var(--accent); padding: 2px 0 2px 16px; display: flex; flex-direction: column; gap: 10px; }
.answer > strong { font-family: "DM Sans", sans-serif; font-size: 16px; font-weight: 600; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 14px; }
.fact { border-left: 3px solid var(--accent); padding: 4px 0 4px 14px; display: flex; flex-direction: column; gap: 4px; }
.fact strong { font-family: "DM Sans", sans-serif; font-weight: 600; font-size: 15px; }
.fact span { color: var(--muted); font-size: 14px; }
.legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 13px; color: var(--muted); }
.legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; border: 1px solid; }
.lg-db { background: #fff4d6; border-color: #b8860b !important; }
.lg-create { background: #fde68a; border-color: #b45309 !important; }
.lg-none { background: #ffd6d6; border-color: #c0392b !important; }
.lg-aws { background: #ffe8cc; border-color: #d9730d !important; }
.lg-pop { background: #e8e8ff; border-color: #5b5bd6 !important; }
.lg-br { background: #e6f7ea; border-color: #2e8b57 !important; }
.diagram { background: var(--diagram-bg); border: 1px solid var(--border); border-radius: 14px; padding: 20px; overflow-x: auto; }
.diagram pre.mermaid { margin: 0; background: transparent; display: flex; justify-content: center; min-width: min-content; }
.callout { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; font-size: 14px; color: var(--muted); max-width: none; }
.callout b { color: var(--ink); }
.callout.warn { border-color: var(--warn); background: var(--warn-bg); color: var(--ink); }
.tbl-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid var(--border); vertical-align: top; }
tr:last-child td { border-bottom: 0; }
th { font: 600 12px/1.3 "Manrope", sans-serif; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); background: var(--bg); white-space: nowrap; }
td { min-width: 120px; }
.wide td:first-child { min-width: 150px; }
.pill { display: inline-block; font: 600 11px/1.4 "Manrope", sans-serif; padding: 1px 8px; border-radius: 999px; white-space: nowrap; }
.p-w { color: var(--warn); background: var(--warn-bg); }
.p-g { color: var(--good); background: var(--good-bg); }
.p-b { color: var(--bad); background: var(--bad-bg); }
.p-a { color: var(--aws); background: var(--aws-bg); }
.num { font-variant-numeric: tabular-nums; }
footer { font-size: 13px; color: var(--muted); border-top: 1px solid var(--border); padding-top: 18px; display: flex; flex-direction: column; gap: 6px; }
@media (max-width: 640px) { .navrow b { min-width: 100%; } }
"""

INDEX_ROWS = [
    (1, "OTP request table workflow, flow by flow, with ER", "signup"),
    (2, "User leaves right after an OTP is generated", "signup"),
    (3, "How the pending verification row is deleted, and how the backend finds it", "signup"),
    (4, "Why users.phone_number is unique and NOT NULL, and email is not", "theory"),
    (5, "How every table connects", "schema"),
    (6, "auth_identities.provider_subject and email", "theory"),
    (7, "users ↔ household_members at signup and afterwards", "onboarding"),
    (8, "Where pan_encrypted / pan_lookup_hash are generated; pending PAN ↔ household_members", "pan"),
    (9, "Upload CAS → auto-confirm → done: DB + AWS", "confirm"),
    (10, "Login only: tables hit, data touched", "login"),
    (11, "sessions.device_info", "theory"),
    (12, "analytics_recompute_status in full", "analytics"),
    (13, "analytics_sections.scope_key", "analytics"),
    (14, "Family view → one member's view: what triggers the switch", "switch"),
    (15, "Multiple household members from one CAS: rows, links, S3", "family"),
    (16, "The imports table", "theory"),
    (17, "How transactions are calculated / detected per folio", "portfolio"),
    (18, "portfolio_snapshots and household_members", "portfolio"),
    (19, "When benchmark_index_history is filled", "jobs"),
    (20, "household_members → folios → schemes", "portfolio"),
    (21, "Direct / Regular classification, AMFI master, fallback", "plans"),
    (22, "EventBridge flow for nav_history, scheme_ter, scheme_aaum", "jobs"),
    (23, "pan_pending_until", "pan"),
    (24, "CAS upload + consent: where it goes, CAS check, wrong password", "upload"),
    (25, "PDF parsing system flow", "upload"),
    (26, "Where the raw PAN lives before anything is written", "theory"),
    (27, "External APIs: which, when, where their data is kept", "apis"),
    (28, "Every error: message, where shown, next step", "errors"),
]


def build_body() -> str:
    parts = []
    parts.append('<title>Unifolio Backend Map</title>')
    parts.append('<link rel="preconnect" href="https://fonts.googleapis.com">')
    parts.append('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;600;700&family=Manrope:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">')
    parts.append(f"<style>{CSS}</style>")
    parts.append('<div class="wrap">')

    # ---------- header ----------
    parts.append("""
<header>
  <span class="eyebrow">Unifolio · MF MVP · backend, database and AWS</span>
  <h1>Unifolio Backend Map</h1>
  <p class="lede">Every user journey traced through the real code: which endpoint runs, which rows change, and what AWS is doing at that moment. Staging on AWS <code>ap-south-1</code> is the reference environment; production is planned on the same modules and not yet built.</p>
  <nav aria-label="Sections">
    <div class="navrow"><b>Start</b><a href="#index">Question index</a><a href="#aws">AWS at a glance</a><a href="#schema">Full ER diagram</a></div>
    <div class="navrow"><b>Journeys</b><a href="#signup">Signup and OTP</a><a href="#login">Login</a><a href="#onboarding">Onboarding</a><a href="#upload">CAS upload + parsing</a><a href="#confirm">Upload → auto-confirm</a><a href="#family">Multi-person CAS</a><a href="#switch">Family ↔ member view</a></div>
    <div class="navrow"><b>Data</b><a href="#pan">PAN columns</a><a href="#portfolio">Folios and holdings</a><a href="#plans">Direct / Regular</a><a href="#analytics">Analytics tables</a><a href="#jobs">Background jobs</a><a href="#apis">External APIs</a></div>
    <div class="navrow"><b>Reference</b><a href="#errors">Errors</a><a href="#theory">Theory answers</a><a href="#gaps">Gaps found while tracing</a></div>
  </nav>
  <p class="callout warn"><b>Updated 12 Oct 2026</b> — a large amount shipped since the first pass (26 Sep): phone-first signup with reversed email gate, consent/legal gating, device-analytics capture, the old manual family-CAS-queue flow deleted and replaced by single-file multi-person detection, the Import Review screen removed (auto-confirm), opening-balance/AMFI-master-driven fund identification, 3 new analytics sections (ranking, investment/withdrawal, fund manager), a scenario/stress-test engine, and AWS cost-reduction changes. Schema grew from 20 to 31 tables. Every fact below was re-verified against the current code, not the old version of this page.</p>
</header>""")

    # ---------- index ----------
    rows = [(f'<span class="mono">Q{n}</span>', q, f'<a href="#{a}">{a}</a>') for n, q, a in INDEX_ROWS]
    parts.append(f"""
<section id="index">
  {head("Question index", "All 28 questions, and the section that answers each. Journey questions get a diagram; the theory questions are answered in prose near the end.")}
  {table(["#", "Question", "Answered in"], rows)}
</section>""")

    # ---------- AWS ----------
    aws_rows = [
        ("Route 53", "DNS for <code>unifolio.in</code>. <code>staging.unifolio.in</code> → CloudFront, <code>staging-api.unifolio.in</code> → ALB.", "Every visit"),
        ("CloudFront + S3 (frontend)", "Serves the built React app from a private bucket.", "Page load only. The API never goes through CloudFront."),
        ("ALB", "HTTPS on 443, health-checks <code>/health</code>, forwards to the one backend task on port 8000.", "Every API call"),
        ("ECS Fargate backend task", "The FastAPI app, <b>0.5 vCPU / 1 GB</b> (down from 2 GB, 1 Oct cost pass). <b>Exactly one task</b> (desired count 1) because the password-retry buffer and PDF-export payloads still live in its RAM. Review sessions no longer need this: they're now encrypted and persisted to <code>imports.preview_state</code>.", "Every API call"),
        ("ECS Fargate job tasks", "Short-lived containers from the same image: 9 scheduled jobs (the fund-manager one gets 2 GB for PDF parsing), plus the analytics recompute the backend launches with <code>ecs:RunTask</code>.", "Schedules and after each confirm"),
        ("RDS PostgreSQL 16", "All 31 tables. Private data subnets, encrypted with the KMS key, reachable only from ECS and the bastion. Also stopped nightly 21:00–04:45 IST to save cost.", "Every read and write"),
        ("S3 CAS bucket", "Uploaded CAS PDFs at <code>{user_id}/{import_id}.pdf</code> — one object now shared by every person an upload detects, SSE-KMS, lifecycle rule deletes after 30 days.", "Confirm; daily expiry job"),
        ("Secrets Manager", "RDS password and the two PAN keys, injected into the containers as environment variables when a task starts.", "Task start"),
        ("KMS", "One customer key encrypting RDS storage, the secrets and the CAS bucket.", "Implicit on every encrypted read/write"),
        ("EventBridge Scheduler", "Cron schedules in <code>Asia/Kolkata</code> that launch the job tasks, plus 7 night-stop/start schedules that call AWS APIs directly (no Fargate task) to stop/start ECS, RDS, fck-nat and the bastion.", "06:00–19:00 IST jobs; 21:00–21:15 and 04:45–04:58 IST stop/start"),
        ("SNS ops-alerts topic", "Two email subscriptions. Fed by an RDS event subscription (availability/failure) and a CloudWatch alarm on <code>FUND_MANAGER_ALERT</code> log lines.", "RDS incidents; a failed fund-manager factsheet fetch"),
        ("SES", "Sends email OTPs when <code>EMAIL_DELIVERY_MODE=ses</code>. SMS is still stub mode: the phone code is returned on screen.", "Email OTP request"),
        ("fck-nat (EC2)", "Self-hosted NAT. Every outbound call from the private subnets leaves through it: mfapi.in, AMFI (scheme master, TER, AAUM, factsheets), NSE, Google, and AWS APIs (there are no VPC endpoints).", "Any external or AWS API call"),
        ("CloudWatch Logs + Alarms", "stdout of each task, plus the fund-manager-alerts metric filter/alarm.", "Always"),
        ("Bastion (SSM)", "Operator access to RDS for <code>alembic upgrade</code> and <code>psql</code>, over an SSM port-forward. No SSH. Stops nightly, does not auto-start.", "Deploys and debugging"),
    ]
    parts.append(f"""
<section id="aws">
  {head("The system at a glance", "One browser, one API task, one database. Everything else is either a scheduled job, a file store, or an outbound call.")}
  {LEGEND}
  {dia(D.AWS_ARCH)}
  {table(["AWS piece", "What it does for Unifolio", "When it is involved"], aws_rows, "wide")}
  <p class="callout">{D.AWS_TABLE_EXTRA_NOTE}</p>
  <p class="callout"><b>Request path used everywhere below:</b> browser → Route 53 (<code>staging-api.unifolio.in</code>) → ALB :443 → ECS backend task :8000 → RDS :5432 inside the VPC. The session token is sent as <code>Authorization: Bearer …</code>; the backend hashes it and looks it up in <code>sessions</code> on every authenticated request. When a step below says “AWS: standard path”, this is what it means.</p>
</section>""")

    # ---------- schema ----------
    connect_rows = [
        ("Identity", "<code>users</code>, <code>auth_identities</code>, <code>sessions</code>", "<code>auth_identities.user_id</code> and <code>sessions.user_id</code> → <code>users.id</code>. One user, many login methods, many sessions."),
        ("Before an account exists", "<code>otp_requests</code>, <code>pending_identity_verifications</code>", "<code>otp_requests</code> has <b>no foreign key</b>; it is matched by the phone or email value. <code>pending_identity_verifications.matched_user_id</code> points at <code>users</code> only when linking a new login method to an existing account. Both now carry a <code>consent_snapshot</code> JSON blob captured at the moment of agreement."),
        ("Consent", "<code>consent_records</code>", "Deliberately <b>no FK at all</b>, not even to <code>users</code> — see the theory answer on why. Matched by the <code>user_id</code> value, append-only via a database trigger."),
        ("Household", "<code>household_members</code>", "<code>user_id</code> → <code>users.id</code>. Every portfolio row hangs off a member, never directly off the user. PAN lives here, now alongside <code>phone_number</code>/<code>email</code> contact fields, <code>origin</code>, <code>name_source</code> and the detected-PAN shadow columns."),
        ("Portfolio", "<code>imports</code>, <code>folios</code>, <code>transactions</code>, <code>transaction_imports</code>, <code>portfolio_snapshots</code>", "<code>imports</code>, <code>folios</code> and <code>portfolio_snapshots</code> → <code>household_members.id</code>. <code>transactions</code> → <code>folios.id</code> and → <code>imports.id</code> (whichever import wrote it first). <code>transaction_imports</code> is the new many-to-many: every import that ever touched a transaction, so deleting one overlapping import doesn't remove a row another import still needs. <code>folios.scheme_id</code> → <code>schemes.id</code>."),
        ("Audit", "<code>household_member_name_changes</code>, <code>household_member_merges</code>", "New tables behind CAS member detection: every rename (CAS variant, user correction, manual edit) and every merge of two detected duplicates is recorded, independent of whether the member row itself still exists."),
        ("Reference data, shared by everyone", "<code>schemes</code>, <code>nav_history</code>, <code>scheme_ter</code>, <code>scheme_aaum</code>, <code>fund_scores</code>, <code>scheme_rankings</code>, <code>ranking_weights</code>, <code>scheme_fund_managers</code>, <code>benchmark_index_history</code>, <code>arn_directory</code>, <code>scenarios</code> + 3 scenario tables", "No user or member column at all. All the per-scheme tables → <code>schemes.id</code>. <code>arn_directory</code> is looked up by <code>folios.arn_code</code> text, no FK. The scenario tables form their own small graph off <code>scenarios.id</code>."),
        ("Analytics output", "<code>analytics_sections</code>, <code>analytics_recompute_status</code>", "Both keyed by <code>user_id</code> → <code>users.id</code>. <code>analytics_sections.household_member_id</code> is filled for member scopes, NULL for the combined scope. 10 sections now, not 7."),
        ("Anonymous", "<code>account_deletion_surveys</code>", "Deliberately no FK, so exit feedback survives the account being deleted."),
    ]
    parts.append(f"""
<section id="schema">
  {head("Full ER diagram: all 31 tables", "Built from the SQLAlchemy models in <code>backend/app/models/</code> at migration 0038 (11 new tables since the schema was last traced). Dashed line = related by value, no foreign key.", 5)}
  {dia(D.ER_FULL)}
  <h3>How the tables connect</h3>
  {table(["Group", "Tables", "How they connect"], connect_rows, "wide")}
  <div class="facts">
    <div class="fact"><strong>The spine, unchanged</strong><span><code>users</code> → <code>household_members</code> → <code>folios</code> → <code>transactions</code>, with <code>schemes</code> joining from the side.</span></div>
    <div class="fact"><strong>User data vs market data</strong><span>Deleting an account deletes the spine. It never touches <code>schemes</code>, rankings, fund managers, NAVs, TER, AAUM, scenarios or benchmarks, which every user shares.</span></div>
    <div class="fact"><strong>Partitioned ledger</strong><span><code>transactions</code> is partitioned by year on Postgres, so its primary key is <code>(id, date)</code>.</span></div>
    <div class="fact"><strong>Two layers of duplicate guard</strong><span>The unique key on <code>transactions</code> now includes <code>occurrence</code>, so two genuinely identical same-day rows both save; <code>transaction_imports</code> tracks every import that touched a row, so a safe delete only removes rows no other import still needs.</span></div>
  </div>
</section>""")

    # ---------- signup ----------
    parts.append(f"""
<section id="signup">
  {head("Signup and the OTP tables", "Phone-first now, not email-first: the signup screen offers only a phone number, and the T&C/Privacy agreement is the Get OTP click itself.", 1, 2, 3)}
  {LEGEND}
  {dia(D.SIGNUP)}
  <p class="callout"><b>Reversed since the first pass of this doc:</b> {D.SIGNUP_NOTE}</p>
  <div class="sub">
    <h3>The two holding tables and how they relate</h3>
    {dia(D.ER_AUTH)}
    <div class="facts">
      <div class="fact"><strong>otp_requests: one row per code sent</strong><span>Phone and email share the table. Every row now also captures IP, device type, OS and browser family — for product analytics, not fraud checks — and a phone sign-up's row carries the consent snapshot too.</span></div>
      <div class="fact"><strong>pending_identity_verifications: one row per signup attempt</strong><span>Now created once PHONE is verified (not email, as before), holding the agreed consent until the mandatory email step completes it.</span></div>
      <div class="fact"><strong>Rules in code</strong><span>Code: 6 digits, 5 min life, 5 attempts, 60 s resend gap. Pending token: 10 min life. Unchanged.</span></div>
    </div>
  </div>
  <div class="sub">
    <h3>Lifecycle of one otp_requests row (Q1)</h3>
    {dia(D.OTP_LIFECYCLE)}
    <p>Verification always reads the <b>newest unverified</b> row for that phone or email. A resend therefore makes older codes useless even if they have not expired. Rows are only ever deleted by the account hard-delete job.</p>
  </div>
  <div class="answer"><strong>Q2 · The user generates an OTP and leaves</strong>
    <p>Nothing is rolled back and nothing is cleaned up — unchanged from before. The phone <code>otp_requests</code> row (with its consent snapshot and device fields) sits unusable after 5 minutes; no <code>users</code> row was ever created. There is still no scheduled job that deletes expired <code>otp_requests</code> or <code>pending_identity_verifications</code> rows.</p>
  </div>
  <div class="answer"><strong>Q3 · How the pending row is deleted after the email gate is verified</strong>
    <p>Same token mechanism as before, just the other way round: the phone-verify step mints the token and the <code>pending_identity_verifications</code> row (hashed token only, raw token returned once to the browser). The browser carries it through the email-gate screens. On a correct email code, <code>complete_gated_signup()</code> hashes the token, finds the matching pending row, and in one commit: INSERTs <code>users</code>, INSERTs both <code>auth_identities</code> rows, INSERTs 2 <code>consent_records</code> rows (GIVEN, using the carried-over snapshot), and DELETEs that pending row.</p>
  </div>
</section>""")

    # ---------- login ----------
    login_rows = [
        ("<code>otp_requests</code>", "INSERT (code sent, no consent); UPDATE <code>attempt_count</code> on a wrong code; UPDATE <code>verified_at</code> on success", "Phone and email login"),
        ("<code>auth_identities</code>", "SELECT by <code>(provider, provider_subject)</code>. INSERT only in two edge cases: the pre-0005 self-heal, or Google auto-link", "All methods"),
        ("<code>users</code>", "SELECT (for <code>/auth/me</code> and onboarding state). No longer ever INSERTed from a bare phone login", "All methods"),
        ("<code>sessions</code>", "INSERT one row per login: token hash, method, 30-day expiry", "All methods"),
        ("<code>pending_identity_verifications</code>", "INSERT only when a Google login turns out to be a new person", "Google"),
        ("Not touched", "<code>auth_identities.last_used_at</code> is not updated on login; <code>sessions.device_info</code> stays NULL (the richer device capture lives on <code>otp_requests</code> instead, and isn't copied across)", "—"),
    ]
    parts.append(f"""
<section id="login">
  {head("Login only", "Three entry points, unchanged in shape. The phone bug this doc previously flagged is now fixed.", 10)}
  {LEGEND}
  {dia(D.LOGIN)}
  {table(["Table", "What login does to it", "Which method"], login_rows, "wide")}
  <p class="callout"><b>Fixed, 30 Sep 2026:</b> a login request now carries an explicit <code>flow</code> field (<code>"login"</code> or <code>"signup"</code>). An unrecognized phone number on the Login screen gets 401 <i>"No account found for that phone number — sign up instead."</i>, the same as email always did — it no longer silently creates an account. A <code>legacy_unflowed_phone_signup</code> setting that would restore the old create-on-login behavior exists only for test fixtures and defaults to off everywhere real.</p>
</section>""")

    # ---------- onboarding ----------
    parts.append(f"""
<section id="onboarding">
  {head("Onboarding: users and household_members", "The account exists once phone and email are both verified. Onboarding is now just three questions and a CAS upload — the whole manual family-member step is gone.", 7)}
  {LEGEND}
  {dia(D.ONBOARDING)}
  <p class="callout">{D.ONBOARDING_NOTE}</p>
  <div class="answer"><strong>Q7 · users and household_members</strong>
    <ul>
      <li><b>One to many, unchanged.</b> <code>household_members.user_id</code> → <code>users.id</code>.</li>
      <li><b>Q1 Name still writes immediately</b> — <code>POST /household-members</code> fires right from the Q1 screen, same as before, with <code>relationship = self</code>. What's new: this name is explicitly <b>provisional</b>. If the CAS uploaded later carries a different investor name, the member row is silently corrected to the CAS's name (<code>NameChangeReason.USER_CORRECTED_TO_CAS</code>), with the old name kept in <code>household_member_name_changes</code>.</li>
      <li><b>relationship is nullable now.</b> A CAS-detected family member is created with <code>relationship = NULL</code> and <code>name</code>/PAN already filled from the statement — the user only ever has to pick the relationship afterward, in the Complete-profile popup. Each of name/PAN/relationship/phone/email contributes a fifth of a "profile completion" score shown as a nudge.</li>
      <li><b>"Why choose? All of it."</b> on Q3 Purpose is a pure UI shortcut — it ticks every real goal value, there is no separate "all" value in the database.</li>
      <li><b>No more Q4 Household.</b> The old screen that asked up front how many family members there are, and the queue that followed it, was deleted outright.</li>
    </ul>
  </div>
</section>""")

    # ---------- upload ----------
    cas_check_rows = [
        ("Browser", "File type is .pdf and size ≤ 25 MB", "Inline red text under the picker; nothing sent"),
        ("API", "Filename ends in <code>.pdf</code>", "400 <code>invalid_file</code>"),
        ("API", "Member belongs to the caller", "404"),
        ("API", "≤ 25 MB and first bytes are the PDF magic bytes", "413 / 400"),
        ("API", "PAN-disclaimer consent already given (or given with this request)", "422 <code>consent_required</code>, recorded before the PDF is even opened"),
        ("casparser, by exception type now", "Password decrypts the PDF", "422 <code>wrong_password</code>"),
        ("casparser, by exception type", "PDF has a text layer", "422 <code>scanned_pdf</code>"),
        ("casparser, by exception type", "File isn't truncated/corrupt", "422 <code>damaged_pdf</code>"),
        ("Unifolio", "Is a CAMS/KFintech statement", "422 <code>unknown_issuer</code>"),
        ("Unifolio", "Not an NSDL/CDSL demat CAS", "422 <code>demat_cas</code>"),
    ]
    parts.append(f"""
<section id="upload">
  {head("CAS upload, consent, and parsing", "The whole of <code>POST /imports/parse</code>. There is still a two-step API (parse, then confirm) — what's gone is the user-facing review screen in between.", 24, 25)}
  {LEGEND}
  {dia(D.UPLOAD)}
  <div class="answer"><strong>Q24 · Consent, not a password-security check</strong>
    <p>There is no tick box anymore — a notice is shown, and the act of continuing records consent. For CAS upload specifically it's the <b>PAN disclaimer</b> document, checked and <b>committed before the PDF is even opened</b>, deliberately: if parsing then fails (wrong password, scanned file), the consent row must still survive for audit purposes. Message shown on a missing consent: <i>"Tick the box to confirm you're authorised to share this statement."</i></p>
  </div>
  <div class="answer"><strong>Q24 · How we know it is a CAS and not any PDF</strong>
    {table(["Where", "Check", "If it fails"], cas_check_rows)}
  </div>
  <div class="answer"><strong>Q24 · Wrong password</strong>
    <p>422 <code>wrong_password</code>: <i>"That password didn't open the file. It's usually your PAN in capitals, or the password you set when requesting the CAS."</i> Classification changed 1 Oct 2026 from matching keywords in the error message to matching the actual Python exception type casparser raises — the old rule misfired on any message that merely contained the word "text". Still: nothing is written to the database beyond the already-saved consent row, and the temp file on disk is deleted.</p>
  </div>
  <div class="sub">
    <h3>Q25 · Inside the parser</h3>
    {dia(D.PARSER)}
    <p>Two changes from before: the opening balance casparser itself reports is now captured (it used to be silently discarded, which is the actual root cause of the old "10-year CAS totals don't match" investigation — not a <code>casparser</code> bug), and fund identification runs against a daily-refreshed local AMFI scheme master instead of live calls to mfapi.in for matching.</p>
  </div>
</section>""")

    # ---------- confirm ----------
    confirm_rows = [
        ("Upload accepted", "<code>consent_records</code>", "INSERT (PAN disclaimer, GIVEN)", "Standard path"),
        ("Upload accepted", "<code>household_members</code> (Self)", "UPDATE <code>pan_encrypted</code>, <code>pan_lookup_hash</code>, <code>pan_pending_until = now + 65 min</code>", "—"),
        ("Upload accepted", "<code>imports</code>", "UPDATE <code>preview_state</code> = AES-GCM-encrypted session JSON, <code>status = previewing</code>", "—"),
        ("Auto-confirm (or after a narrow prompt)", "<code>household_members</code> (Self)", "UPDATE <code>pan_pending_until = NULL</code> (permanent)", "—"),
        ("Auto-confirm", "<code>household_members</code> (new people)", "INSERT one row per newly detected person, <code>origin = cas_detected</code>, PAN made permanent at once or flagged <code>pan_conflict</code>", "—"),
        ("Auto-confirm", "<code>imports</code>", "INSERT one row per included person, all sharing one <code>upload_group_id</code>; <code>statement_from_date</code>/<code>to_date</code> now reliably set", "S3 PutObject (SSE-KMS) once, shared by every person"),
        ("Auto-confirm", "<code>schemes</code>", "INSERT only for a fund not identified before (AMFI master match, or <code>cas_only</code> if the fund has closed)", "—"),
        ("Auto-confirm", "<code>folios</code>, <code>transactions</code>, <code>transaction_imports</code>", "INSERT per person; an <code>OPENING_BALANCE</code> row per scheme from casparser's own total (earliest-statement-wins rule)", "—"),
        ("Auto-confirm (same request)", "<code>analytics_recompute_status</code>", "Upsert <code>started_at = now</code> if no recompute is running", "—"),
        ("After the response", "<code>analytics_sections</code>", "Recompute task UPSERTs 10 rows per scope, then clears <code>started_at</code>", "<code>ecs:RunTask</code>"),
    ]
    parts.append(f"""
<section id="confirm">
  {head("Upload CAS → auto-confirm", "The review screen is gone (8 Oct 2026). The two backend endpoints are unchanged; the frontend now calls Confirm itself the moment a preview needs no human judgment call.", 9)}
  {dia(D.CONFIRM_SEQ)}
  {table(["Moment", "Table", "Change", "AWS"], confirm_rows, "wide")}
  <div class="facts">
    <div class="fact"><strong>When a prompt still appears</strong><span>Only for genuine ambiguity: more than one person detected, a name the CAS couldn't read, or a fund with no owner. A narrow dialog, never a line-item table of every transaction.</span></div>
    <div class="fact"><strong>Why the task can now restart safely</strong><span>The review session used to live only in one task's RAM, so a redeploy or the 9PM nightly stop would silently lose it. It's now encrypted and persisted in <code>imports.preview_state</code>, so it survives.</span></div>
    <div class="fact"><strong>Safe delete</strong><span>Deleting one of two overlapping imports now only removes transaction rows no other import still claims (via <code>transaction_imports</code>), then re-runs the opening-balance rule — not a blanket delete-everything.</span></div>
  </div>
</section>""")

    # ---------- PAN ----------
    parts.append(f"""
<section id="pan">
  {head("PAN columns on household_members", "Still the same three columns for Self's own claim. What's new: a parallel set of shadow columns for a CAS-detected family member whose PAN belongs to someone else's account.", 8, 23)}
  {dia(D.PAN_GEN)}
  <div class="answer"><strong>Q8 · Where they are generated, and the new conflict path</strong>
    <p>Unchanged for Self: computed in <code>crypto.py</code>, called by <code>claim_pan_for_member()</code> during <code>/imports/parse</code>, always written together in one UPDATE.</p>
    <p><b>New since 1 Oct 2026:</b> when the CAS detects a family member whose PAN already belongs to a <i>different</i> Unifolio account, the import is <b>no longer blocked</b>. <code>store_detected_pan()</code> keeps that PAN encrypted in <code>detected_pan_encrypted</code>/<code>detected_pan_hash</code> instead of the main columns, sets <code>pan_conflict = other_account</code>, and the rest of that person's data (name, folios, transactions) is saved normally. The hard block (<code>CrossAccountPanBlockedError</code>, a popup, nothing written) still applies, but only to <b>Self's own</b> upload-time claim — not to a detected family member found inside the same statement.</p>
  </div>
  {dia(D.PAN_STATES)}
  <div class="answer"><strong>Q23 · pan_pending_until</strong>
    <p>Unchanged in mechanism: set to upload time + 65 minutes for Self's claim, cleared to NULL by Confirm. The 5-minute margin over the review session's own 60-minute life is still why it's 65, not 60. <b>It never applies to a CAS-detected person</b> — their PAN (or its conflict marker) is made permanent in the same transaction that creates their row, with no pending step at all, since there's no separate review screen left to wait on.</p>
  </div>
</section>""")

    # ---------- family ----------
    fam_rows = [
        ("<code>household_members</code>", "1 per detected person", "Self already existed; each new person gets a fresh row, <code>origin = cas_detected</code>, relationship NULL until Complete profile"),
        ("<code>imports</code>", "1 per person, same <code>upload_group_id</code>", "One statement, several import rows, so each person's history still lists independently"),
        ("<code>folios</code>, <code>transactions</code>, <code>transaction_imports</code>", "per person", "Same mechanics as a single-person import, just run once per detected person in the same transaction"),
        ("S3 CAS bucket", "1 object", "Every person's <code>imports</code> row points at the <b>same</b> PDF key — the file isn't duplicated per person"),
        ("<code>schemes</code>", "shared", "Identified once per fund, reused across every person who holds it"),
        ("<code>analytics_sections</code>", "10 × (combined + each member)", "Recomputed once the confirm's claim succeeds"),
    ]
    parts.append(f"""
<section id="family">
  {head("Multiple household members from one CAS statement", "No more sequential queue. One file, one confirm call, every detected person written in the same transaction.", 15)}
  {LEGEND}
  {dia(D.FAMILY)}
  {table(["Table / store", "Rows per import", "Note"], fam_rows, "wide")}
  <p class="callout">{D.FAMILY_NOTE}</p>
</section>""")

    # ---------- portfolio ----------
    ex_rows = [
        ("HDFC Flexi Cap – Direct – Growth", "Opening balance 40 units (from casparser's own total) + 3 × SIP ₹5,000", "40 + 50 + 40 + 40 = 170 units", "NAV 150 → ₹25,500", "The opening row is what the old code silently dropped"),
        ("Axis Bluechip – Regular – Growth", "Buy ₹10,000 at 50; redeem 50 units at 60", "FIFO: realised gain 50 × (60 − 50) = ₹500; units left, cost reduced", "At current NAV", "Classified Regular from AMFI's own Plan column"),
    ]
    parts.append(f"""
<section id="portfolio">
  {head("household_members → folios → schemes → transactions", "Still calculated from the ledger at read time. What changed: how a fund is identified, how the dedupe key works, and that an opening balance is now captured.", 17, 18, 20)}
  {dia(D.ER_PORTFOLIO)}
  <div class="answer"><strong>Q20 · How the three connect</strong>
    <p>Unchanged: a <b>scheme</b> is a fund, a <b>folio</b> is one member's account in one scheme at one AMC. Folios now match by <code>folio_key</code> (the folio number with whitespace stripped), since CAMS/KFintech print the same folio both with and without spaces around the slash.</p>
  </div>
  <div class="answer"><strong>Q17 · How transactions are "calculated"</strong>
    <p>Still read off the CAS, never calculated from the folio table. What's different:</p>
    <ol>
      <li><b>Opening balance:</b> casparser's own running total for each scheme at the start of the statement is now saved as an <code>OPENING_BALANCE</code> transaction, with an "earliest statement wins" rule — a longer-lookback statement uploaded later replaces a shorter one's opening row.</li>
      <li><b>Identify, not resolve-by-fuzzy-name:</b> each fund is matched against a locally-refreshed AMFI scheme master (ISIN → NAV fingerprint → sibling NAV → ask), not a live fuzzy match against mfapi.in.</li>
      <li><b>Dedupe key widened:</b> now <code>(folio, date, amount, units, type, occurrence)</code> — two genuinely identical same-day rows (two identical SIP installments) both save, where the old 5-column key would have silently dropped one.</li>
      <li><b>4 new transaction types:</b> <code>reversal</code>, <code>gift_in</code>, <code>gift_out</code>, <code>bonus</code> — these used to fall through to <code>misc</code> and were effectively ignored.</li>
    </ol>
    <p><b>Illustrative example</b> (made-up numbers):</p>
    {table(["Folio", "Transactions", "Worked out", "Value", "Note"], ex_rows, "wide")}
  </div>
  <div class="answer"><strong>Q18 · portfolio_snapshots</strong>
    <p>Still one row per member per month-end. New columns: <code>invested_value</code> (alongside <code>total_value</code>) and <code>is_partial</code> (a month where some scheme's NAV genuinely couldn't be fetched is now marked partial rather than silently skipped or guessed).</p>
  </div>
</section>""")

    # ---------- plans ----------
    parts.append(f"""
<section id="plans">
  {head("Direct and Regular plans", "Replaced, not patched: a new AMFI-master-driven classifier (<code>identify.py</code>) is now the primary signal, with the old name/ARN logic surviving only as a fallback.", 21)}
  {dia(D.PLAN)}
  <div class="answer"><strong>Q21 · Answers</strong>
    <ul>
      <li><b>Primary signal, since 7 Oct 2026:</b> AMFI's own master data. If the master's Plan column says Direct or Regular, that wins outright.</li>
      <li><b>When AMFI's Plan column is blank</b> (a real, confirmed case: all four Motilal Oswal Midcap Fund rows) — fixed 8 Oct 2026: fall back to AMFI's own scheme name, then to a sibling scheme's differing NAV, then to the <b>statement's own</b> scheme name as a last resort (treated as verified when it works). Before this fix, those schemes landed unclassified even when the CAS statement itself clearly said Direct or Regular.</li>
      <li><b>plan_verified</b> is a new boolean on <code>folios</code>, separate from <code>plan_type</code> itself — true whenever one of the signals above actually confirmed the plan, false for the last-resort guess.</li>
      <li><b>The old name/ARN classifier survives</b> in <code>parser.py</code>, but demoted to feeding the pre-match <code>ParsedScheme</code> and the 8 Oct fallback — it is no longer the primary signal once a fund is matched against the AMFI master.</li>
    </ul>
  </div>
</section>""")

    # ---------- switch ----------
    parts.append(f"""
<section id="switch">
  {head("Switching from the family view to one member", "Mechanically unchanged: a browser-only toggle, the same compute functions, the same precomputed analytics rows — now 10 sections instead of 7.", 14)}
  {dia(D.SWITCH)}
  <div class="answer"><strong>Q14 · What triggers the shift</strong>
    <p>Same as before: <code>viewMode</code>/<code>selectedMemberId</code> in React state, no database write on switch itself. Family view reads <code>/household/aggregate/...</code> and <code>/analytics/combined</code>; member view reads the member-scoped equivalents. The only change worth noting: a member with <code>relationship = NULL</code> (not yet completed) still shows up in both views normally — nothing here depends on relationship being set.</p>
  </div>
</section>""")

    # ---------- analytics ----------
    sec_rows = [
        ("allocation", "SEBI category and AMC split"),
        ("ter", "Holding-weighted expense ratio"),
        ("ter_direct_regular", "Cost of Regular plans vs their Direct twins"),
        ("benchmark", "Portfolio XIRR vs 4 Nifty indices (now TRI, not price, data)"),
        ("benchmark_funds", "Each fund vs its category's index"),
        ("category_ranking", "Each fund's rank within its SEBI category"),
        ("ranking", "<b>New (A09)</b> — a separate 5-factor composite fund ranking (25/25/20/15/15 weighted), a deliberately different formula from Scorer"),
        ("score", "Unifolio fund scores rolled up — untouched by the new ranking/fund-manager work"),
        ("investment_withdrawal", "<b>New (A14)</b> — invested vs withdrawn breakdown, SIP continuity, no new table"),
        ("fund_manager", "<b>New (A04)</b> — manager name/role/tenure per held scheme, from each AMC's own monthly factsheet"),
    ]
    parts.append(f"""
<section id="analytics">
  {head("The analytics tables", "Still the same precompute architecture. The section list grew from 7 to 10; the recompute mechanism itself (claim, generation, 2-hour staleness) is untouched.", 12, 13)}
  <div class="answer"><strong>Q12 · analytics_recompute_status, fully</strong>
    <p>Unchanged: one row per user, three columns (<code>user_id</code>, <code>started_at</code>, <code>generation</code>), the same 2-hour staleness ceiling, the same atomic claim through <code>try_claim_recompute()</code>.</p>
  </div>
  {dia(D.RECOMPUTE_STATES)}
  <div class="answer"><strong>Q13 · scope_key</strong>
    <p>Unchanged mechanically. Rows per household = <b>10</b> sections × (1 + number of members), up from 7. The new <code>ranking</code> section sits deliberately apart from <code>score</code> (Scorer) — confirmed in the migration's own docstring and in <code>scorer.py</code>, which has zero references to the new ranking or fund-manager tables; they're separate formulas, separate tables, never merged.</p>
    {table(["section", "What it holds"], [(f"<code>{a}</code>", b) for a, b in sec_rows])}
  </div>
</section>""")

    # ---------- jobs ----------
    trig_rows = [
        ("<code>schemes</code> (AMFI master)", "<b>New: 06:15 IST daily</b> job, full <code>NAVAll.txt</code> dump", "None — this is now the source of truth for fund identification, not an on-demand call"),
        ("<code>nav_history</code>", "06:00 IST daily job (held schemes only)", "After every confirm; dashboard reads; snapshots; analytics recompute"),
        ("<code>benchmark_index_history</code>", "06:00 IST daily job, now TRI not price data", "Inside the analytics recompute task, when stored dates don't cover what's needed"),
        ("<code>scheme_ter</code>", "<b>Changed: now 06:20 IST daily</b> (was monthly on the 1st)", "Inside the analytics recompute task, as before"),
        ("<code>scheme_aaum</code>", "06:00 IST on 1 Jan / Apr / Jul / Oct", "None: job only"),
        ("<code>scheme_fund_managers</code>", "<b>New: 06:00 IST, 10th of the month</b>, 2 GB task", "None — 10 of 55 AMCs still need a manual run, see the note below"),
    ]
    parts.append(f"""
<section id="jobs">
  {head("Background jobs: EventBridge → ECS → reference tables", "Nine scheduled jobs now (was 7), plus 7 night-stop/start schedules that call AWS APIs directly instead of launching a task.", 19, 22)}
  {LEGEND}
  {dia(D.JOBS)}
  {dia(D.ER_REFERENCE)}
  {table(["Table", "Scheduled refresh", "Also refreshed on demand by"], trig_rows, "wide")}
  <p class="callout warn">{D.JOBS_NOTE}</p>
  <div class="answer"><strong>Q19 · Is benchmark_index_history filled when the user opens Analytics, or by AWS jobs?</strong>
    <p>Unchanged answer: by AWS, never by opening the page — only now the daily job fetches Total Returns Index data from niftyindices.com, not plain price data, per the 7 Oct TRI-sourcing change.</p>
  </div>
  <div class="answer"><strong>Q22 · The reference refreshes in AWS terms</strong>
    <ol>
      <li>EventBridge Scheduler fires at the cron time using its own IAM role, scoped to <code>ecs:RunTask</code> on these task definitions.</li>
      <li>ECS starts a Fargate task (0.5 vCPU / 1 GB, or 2 GB for the fund-manager job) in a private app subnet; the execution role pulls the image and the DB password.</li>
      <li>The script calls the external source through fck-nat: AMFI's own scheme-master dump, mfapi.in for NAV, AMFI's TER/AAUM feeds, niftyindices.com, or each AMC's own factsheet page.</li>
      <li>A fetch failure for the fund-manager job logs <code>FUND_MANAGER_ALERT</code>, which a CloudWatch metric alarm turns into an SNS email — the only job with alerting wired up so far.</li>
    </ol>
  </div>
</section>""")

    # ---------- apis ----------
    api_rows = [
        ("AMFI NAVAll.txt (full scheme master)", "<b>New:</b> 06:15 IST daily job", "<code>schemes</code> — now the primary source for fund identification, not mfapi.in"),
        ("mfapi.in <code>/mf/{code}</code> (full NAV history)", "After confirm; dashboard reads; snapshots; fund graph; analytics recompute; 06:00 job", "<code>nav_history</code>, shared by all users"),
        ("AMFI TER feed", "<b>Changed:</b> now a daily job (was monthly); recompute when current-month TER is missing", "<code>scheme_ter</code>, now exact-linked by <code>ter_scheme_code</code> for schemes it's been matched to once"),
        ("AMFI AAUM feed", "Quarterly job only", "<code>scheme_aaum</code>"),
        ("AMFI distributor search (ARN)", "Distributor comparison on the dashboard, once per ARN ever", "<code>arn_directory</code>, never re-fetched once stored"),
        ("niftyindices.com history", "<b>Changed:</b> now fetches TRI, not price, data; 06:00 job; recompute when dates aren't covered", "<code>benchmark_index_history</code>"),
        ("<b>New:</b> each AMC's own factsheet PDF", "Monthly job, 10th; 40 of 55 fund houses automatically, 10 by a manual CLI run, 5 not available", "<code>scheme_fund_managers</code>"),
        ("Google certificates", "<code>/auth/oauth/google</code>", "Nothing; used to verify the ID token in memory"),
        ("Amazon SES", "Email OTP request (signup gate, login, contact change)", "Nothing; only the code's hash in <code>otp_requests</code>"),
        ("CAMS portal", "“Request from CAMS” opens CAMS in the user's browser", "No server call, and — since 7 Oct 2026 — no PAN consent required at this step either, only at the actual upload later"),
    ]
    parts.append(f"""
<section id="apis">
  {head("External APIs", "Every outbound call leaves the private subnet through fck-nat. mfapi.in's role shrank: it's now NAV history only, not fund matching.", 27)}
  {table(["API", "Triggered when", "Where the result is kept"], api_rows, "wide")}
  <p class="callout"><b>"Stored in that session":</b> the review session itself is no longer process RAM — it's encrypted and written to <code>imports.preview_state</code>, so it survives a redeploy or the nightly stop. Everything else still lands in shared reference tables, so the second user who holds a fund gets it from the database without another call.</p>
</section>""")

    # ---------- errors ----------
    auth_err = [
        ("422", "Agree to the Terms &amp; Conditions and Privacy Policy to create your account.", "Phone signup screen, if consent is somehow missing", "Accept and retry"),
        ("422", "Agree to the latest Terms &amp; Conditions and Privacy Policy to continue.", "Reactivation, after a Terms version bump", "Accept and retry"),
        ("409", "An account with this phone number already exists.", "Phone signup, code already correct", "“Log in” shortcut"),
        ("401", "No account found for that phone number — sign up instead.", "Phone login, FIXED 30 Sep 2026", "Switch to sign up"),
        ("401", "No account found for that email — sign up instead.", "Email login", "Switch to sign up"),
        ("429", "Please wait Ns before requesting another code.", "Under the field / code screen", "Wait, then resend"),
        ("502", "We couldn't send that email right now.", "Email or code screen", "Try again later"),
        ("401", "Incorrect OTP.", "Code screen", "Retype"),
        ("401", "OTP has expired. Request a new one.", "Code screen", "Resend"),
        ("401", "Too many incorrect attempts. Request a new OTP.", "Code screen", "Resend"),
        ("401", "This verification has expired. Please start over.", "Signup steps", "Restart signup"),
        ("401", "This Google account isn't linked yet.", "Link-account prompt", "Use the existing method"),
        ("client", "Something unexpected happened. Please try again.", "Auth screens", "Retry"),
        ("5xx", "Something went wrong on our servers. Please try again in a moment.", "Auth screens (when no detail text)", "Retry"),
        ("403", "Account is pending deletion. Reactivate it to continue.", "Pending-deletion screen", "Reactivate button"),
        ("409", "That email / phone is already linked to another account.", "Contact change in Profile", "Use another"),
    ]
    import_err = [
        ("client", "Please choose a valid PDF file (.pdf) · This file is too large.", "Under the file picker", "Pick another file"),
        ("400", "Please upload a PDF file.", "“Import failed” card", "Try again"),
        ("413", "File too large. Maximum supported file size is 25MB.", "“Import failed” card", "Try again"),
        ("422", "consent_required — Tick the box to confirm you're authorised to share this statement.", "On the upload form itself", "Agree and retry"),
        ("422", "That password didn't open the file. It's usually your PAN in capitals, or the password you set when requesting the CAS.", "“Import failed” card", "Try again"),
        ("422", "scanned_pdf / damaged_pdf / unknown_issuer — each with its own plain-language message", "“Import failed” card", "Try again, or get a readable file"),
        ("422", "demat_cas — this appears to be an NSDL/CDSL demat CAS", "“Import failed” card", "Use the CAMS/KFintech CAS"),
        ("409", "cross_account_pan_blocked — Self's own PAN is already tracked under a different Unifolio account", "Popup", "Back — only for Self's own upload now, not a detected family member"),
        ("—", "A detected family member's PAN colliding with another account no longer errors at all", "Nothing shown; saved as pan_conflict metadata", "Resolved later via support, if ever"),
        ("—", "Line-item review errors (AMFI code override, plan-type override) are gone with the review screen", "A narrow PeopleFoundDialog / UnidentifiedFundsDialog only for genuine ambiguity", "Resolve the one specific prompt"),
        ("410", "session_expired", "A narrow dialog, if the user takes over an hour to resolve a prompt", "Upload again"),
    ]
    dash_err = [
        ("any", "Dashboard Unavailable + the error text", "Main dashboard empty state", "Try Again reloads the page"),
        ("data", "Excludes N holdings with unavailable NAV", "Under the allocation chart", "Resolves when mfapi.in has the NAV"),
        ("any", "Unable to load Analytics Dashboard + the error text", "Analytics page", "Reload"),
        ("data", "Some sections failed to compute.", "Banner on Analytics", "Retry (<code>POST /analytics/{scope}/retry</code>)"),
        ("data", "Category Unavailable · Insufficient Track Record", "Badges on ranking and score cards — now also on the new Ranking section", "None; data-driven"),
        ("data", "not available yet (fund manager)", "Fund Manager analytics section, for an AMC with no usable factsheet", "None; resolved only by the manual-upload gap getting closed"),
        ("500", "Failed to generate PDF export.", "Under Download PDF", "Try again"),
        ("404", "Household member not found. / Scheme not found.", "Member-scoped views", "Back"),
    ]
    parts.append(f"""
<section id="errors">
  {head("Every error the user can hit", "Text is quoted from the code where available. Several old CAS-review-screen errors no longer exist; several new consent/flow errors do.", 28)}
  <h3>Signup, login, account</h3>
  {table(["Status", "Message", "Where it shows", "Next step"], auth_err, "wide")}
  <h3>CAS upload and parsing</h3>
  {table(["Status", "Message", "Where it shows", "Next step"], import_err, "wide")}
  <h3>Dashboard and Analytics</h3>
  {table(["Status", "Message", "Where it shows", "Next step"], dash_err, "wide")}
  <p class="callout"><b>Common rule, unchanged:</b> every error on an upload leaves the database untouched except the already-saved PAN-disclaimer consent row. The removal of the review screen also removed every error that used to come from the review table (scheme confidence, AMFI code override, plan-type override) — those judgment calls now only ever surface as one of the two narrow dialogs.</p>
</section>""")

    # ---------- theory ----------
    imp_rows = [
        ("Single-person CAS", "<code>/imports/parse</code> → auto <code>/imports/confirm</code>", "<code>status = confirmed</code>, set the moment confirm runs — automatically now, no click needed"),
        ("Multi-person CAS", "Same two endpoints, one <code>/imports/confirm</code> call for every detected person", "One <code>imports</code> row per person, all sharing <code>upload_group_id</code> and one S3 object"),
        ("Request from CAMS", "<code>/cas-imports/request</code>", "<code>waiting_for_user</code>, no PAN consent required at this step (decided 7 Oct 2026 — it's required only once the statement actually arrives at upload)"),
        ("Opening balance (manual fix-up)", "<code>POST /folios/{id}/opening-balance</code>", "Still exists for the rare remaining gap; most of what used to need this is now filled automatically at confirm"),
    ]
    parts.append(f"""
<section id="theory">
  {head("Theory answers", "The questions that are about design choices rather than a flow.", 4, 6, 11, 16, 26)}
  <div class="answer"><strong>Q4 · Why users.phone_number is unique and NOT NULL, and email is nullable and not unique</strong>
    <ul>
      <li><b>Phone is still the account's root identity</b> — more so now, since signup starts and ends with phone verification, and email is the gate, not the other way round. A <code>users</code> row without a phone still can't exist.</li>
      <li><b>Unique</b> still makes "one account per phone number" a database rule, not just an app check.</li>
      <li><b>Email is still optional</b> — a Google account whose own email isn't verified is stored with none — but the login-side "phone with no account" path that used to create one is now fixed: it 401s instead, so there's no longer any real path that creates a phone-only account outside the intended signup flow.</li>
      <li><b><code>users.email</code> is still a copy</b>, refreshed from the highest-priority verified identity, never the source of truth.</li>
    </ul>
  </div>
  <div class="answer"><strong>Q6 · auth_identities.provider_subject and email</strong>
    <p>Unchanged: the identifier the login method vouches for (phone number, email, or Google's <code>sub</code>), plus a denormalized, verified-only email used for collision detection. Nothing here changed with the auth-flow reversal — only the order in which <code>phone_otp</code> and <code>email_otp</code> rows get created flipped.</p>
  </div>
  <div class="answer"><strong>Q11 · sessions.device_info</strong>
    <p><b>Still always NULL</b> — <code>create_session()</code> is never actually called with a value for it, confirmed by reading every call site directly. What's new is a <i>separate, genuinely used</i> mechanism one table over: <code>otp_requests</code> now captures IP (the real client IP, parsed correctly out of <code>X-Forwarded-For</code> behind the ALB), device type, OS family/version and browser family/version on every OTP request — explicitly for product analytics ("what are people signing up on"), not fraud prevention, and explicitly not copied forward into <code>sessions</code>.</p>
  </div>
  <div class="answer"><strong>Q16 · The imports table</strong>
    <p>Same purpose as before — one row per import event — but now: <code>upload_group_id</code> links every person's row that came from the same physical CAS file and S3 object; <code>preview_state</code> holds the encrypted, in-progress review session (replacing the old in-process RAM dictionary); <code>statement_from_date</code>/<code>statement_to_date</code> are reliably set at confirm now, for every path, which an earlier version of this investigation had flagged as broken.</p>
  </div>
  <div class="answer"><strong>Q26 · Where the raw PAN is while the CAS is only in memory</strong>
    <p>Changed in an important way: it's no longer purely RAM. Between parse and confirm, each detected person's raw PAN lives inside the review session, which is now <b>encrypted and written to <code>imports.preview_state</code> in the database</b>, not kept only in the serving task's process memory. It's still never written in plaintext anywhere, never logged, and the decrypted PAN only ever exists in memory for the moment it's being used — but the durability story changed from "lost if the task restarts" to "survives a restart, decryptable only with the same PAN keys."</p>
    {table(["Path", "Endpoints", "Status flow"], imp_rows, "wide")}
  </div>
</section>""")

    # ---------- gaps ----------
    gap_rows = [
        ("10 of 55 fund houses need a person to download and run a CLI import every month; no alert yet if that's skipped for a month", "<code>scheme_fund_managers</code> pipeline, <code>DEFERRED_FEATURES.md</code> PRIORITY 1", "Funds silently show \"not available yet\" after 3 months with no warning to anyone"),
        ("5 fund houses (33 funds) have no usable factsheet at all", "same", "Those funds' Fund Manager section is permanently empty"),
        ("The 40 \"automatic\" fund houses were only verified from a normal network, not yet from inside AWS", "same", "First real test is the 10 Nov 2026 staging run"),
        ("HDFC's passive-fund factsheet reader is untested on a real file", "fund_manager_layouts.py", "Only the active-fund reader (53/53) has been verified"),
        ("Ops-alerts email subscriptions have been \"PendingConfirmation\" since 1 Oct 2026", "SNS topic", "No alert reaches anyone until confirmed"),
        ("The scenario simulator's percentage figures and SEBI disclaimer need expert/compliance review before full release", "<code>scenarios</code> tables, <code>backend/app/api/scenarios.py</code>", "Explicitly release-gated, not a bug — noted so it isn't mistaken for finished"),
        ("No scheduled cleanup of expired <code>otp_requests</code>/<code>pending_identity_verifications</code>", "no job exists", "Rows grow forever — unchanged from before"),
        ("<code>auth_identities.last_used_at</code> never updated on login", "login paths", "Column is misleading — unchanged from before"),
        ("A confirm during a running recompute doesn't queue another", "<code>try_claim_recompute</code>", "Combined analytics can lag until the daily backstop or Retry — unchanged from before"),
    ]
    parts.append(f"""
<section id="gaps">
  {head("Gaps found while tracing", "Not fixed, not part of the questions. Several items from the last pass are resolved and dropped; new ones from the current build are added.")}
  {table(["What", "Where", "Effect"], gap_rows, "wide")}
  <p class="callout"><b>Resolved since the last pass, dropped from this list:</b> the phone-login account-creation bug (fixed 30 Sep); the FamilyImportFlow confirm-dead-end bug (moot — the whole component was deleted); the 10-year CAS value discrepancy (root-caused and fixed by the opening-balance work); the two-step confirm not setting statement dates (fixed).</p>
</section>""")

    parts.append("""
<footer>
  <span>Traced from the code on branch <span class="mono">feat/enhanced-ui</span> (HEAD at <span class="mono">0723a91</span>, 12 Oct 2026): <span class="mono">backend/app/models</span>, <span class="mono">api/</span>, <span class="mono">services/</span>, <span class="mono">scripts/</span>, <span class="mono">infra/</span> (staging env), and the frontend auth, import, dashboard and analytics features.</span>
  <span>Supersedes the 26 Sep 2026 version of this page. Companion pages: PAN Storage Map, and <span class="mono">Docs/analytics/artifacts/subproject1-execution/</span> for the new fund-ranking/fund-manager/scenario work in depth.</span>
</footer>""")
    parts.append("</div>")
    return "\n".join(parts)


if __name__ == "__main__":
    body = build_body()
    (OUT / "unifolio-backend-map.html").write_text(body, encoding="utf-8")
    standalone = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        + body.split('<div class="wrap">', 1)[0]
        + "\n</head>\n<body>\n"
        + '<div class="wrap">' + body.split('<div class="wrap">', 1)[1]
        + '\n<!-- Standalone copy: the claude.ai viewer draws Mermaid itself; a plain browser needs the library. -->\n'
        '<script src="https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"></script>\n'
        '<script>\n  var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;\n'
        '  mermaid.initialize({ startOnLoad: true, securityLevel: "strict", theme: dark ? "dark" : "default",\n'
        '    flowchart: { useMaxWidth: false }, sequence: { useMaxWidth: false }, er: { useMaxWidth: false }, state: { useMaxWidth: false } });\n'
        "</script>\n</body>\n</html>\n"
    )
    (OUT / "unifolio-backend-map.standalone.html").write_text(standalone, encoding="utf-8")
    print(len(body), "bytes")
