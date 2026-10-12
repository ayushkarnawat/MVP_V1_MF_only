"""Mermaid sources for the Unifolio Backend Map page, rev 2 (2026-10-12).
Plain text here; build.py HTML-escapes them into <pre class="mermaid"> blocks.
No ':' inside a state-transition label (breaks stateDiagram parsing), no '#'.
"""

CLASSDEFS = """
    classDef db fill:#fff4d6,stroke:#b8860b,color:#000
    classDef read fill:#eef2f7,stroke:#64748b,color:#000
    classDef none fill:#ffd6d6,stroke:#c0392b,color:#000
    classDef aws fill:#ffe8cc,stroke:#d9730d,color:#000
    classDef popup fill:#e8e8ff,stroke:#5b5bd6,color:#000
    classDef browser fill:#e6f7ea,stroke:#2e8b57,color:#000
    classDef create fill:#fde68a,stroke:#b45309,color:#000,stroke-width:2px"""

AWS_ARCH = """flowchart LR
    U["User's browser"]
    subgraph EDGE["DNS and CDN"]
        R53["Route 53<br/>unifolio.in hosted zone"]
        CF["CloudFront<br/>staging.unifolio.in"]
    end
    S3F[("S3: frontend bucket<br/>built React app, private")]
    subgraph VPC["VPC 10.0.0.0/16 · ap-south-1 · 2 AZs"]
        subgraph PUB["Public subnets"]
            ALB["ALB :443<br/>staging-api.unifolio.in"]
            NAT["fck-nat EC2<br/>all outbound internet"]
            BAS["Bastion EC2<br/>SSM only, no SSH"]
        end
        subgraph APP["Private app subnets"]
            API["ECS Fargate: backend task<br/>FastAPI · exactly 1 task · 0.5 vCPU / 1 GB<br/>RAM holds the password-retry buffer<br/>and PDF-export payloads only now"]
            JOB["ECS Fargate: job tasks<br/>9 scheduled jobs + on-demand<br/>analytics recompute"]
        end
        subgraph DATA["Private data subnets"]
            RDS[("RDS PostgreSQL 16<br/>db.t4g.small · encrypted · 31 tables")]
        end
    end
    S3C[("S3: CAS files bucket<br/>SSE-KMS · deleted after 30 days")]
    SM["Secrets Manager<br/>DB password · PAN keys"]
    KMS["KMS key<br/>encrypts RDS, secrets, CAS bucket"]
    EB["EventBridge Scheduler<br/>cron in Asia/Kolkata<br/>+ 7 night-stop/start schedules 9PM-5AM"]
    SNS["SNS: ops-alerts topic<br/>2 email subscriptions"]
    SES["Amazon SES<br/>email OTP"]
    CW["CloudWatch Logs + Alarms"]
    EXT["External APIs<br/>mfapi.in · AMFI · NSE · Google"]
    U --> R53
    R53 --> CF --> S3F
    U -->|"API calls with Bearer token"| ALB --> API
    API -->|"SQL :5432"| RDS
    JOB -->|"SQL :5432"| RDS
    API -->|"PutObject"| S3C
    JOB -->|"DeleteObject"| S3C
    SM -.->|"injected as env vars at task start"| API
    SM -.-> JOB
    KMS -.-> RDS
    KMS -.-> S3C
    EB -->|"ecs:RunTask on schedule"| JOB
    EB -->|"direct AWS API calls, no RunTask<br/>stop/start ECS, RDS, fck-nat, bastion"| RDS
    API -->|"ecs:RunTask after a confirm"| JOB
    API -->|"SendEmail"| SES
    API --> NAT --> EXT
    JOB --> NAT
    API --> CW
    JOB --> CW
    RDS -.->|"availability/failure events"| SNS
    CW -.->|"fund-manager-alerts metric alarm"| SNS
    BAS -->|"psql / alembic"| RDS
    class ALB,NAT,BAS,API,JOB,S3C,SM,KMS,EB,SES,CW,SNS,R53,CF,S3F aws
    class RDS db""" + CLASSDEFS

AWS_TABLE_EXTRA_NOTE = (
    "Cost-reduction pass (1 Oct 2026): backend task memory 2048->1024MB, an ECR lifecycle rule "
    "(keep last 10 tagged images), and 7 night-stop/start schedules (ECS service to 0, RDS and "
    "fck-nat stopped 21:00-21:15 IST, started back 04:45-04:58 IST; the bastion only stops, no "
    "auto-start). Staging cost: $91.78/mo -> $68.46/mo."
)

ER_FULL = """erDiagram
    users ||--o{ household_members : "owns"
    users ||--o{ auth_identities : "logs in with"
    users ||--o{ sessions : "has"
    users |o--o{ pending_identity_verifications : "matched_user_id (nullable)"
    users ||--o| analytics_recompute_status : "has"
    users ||--o{ analytics_sections : "has"
    household_members |o--o{ analytics_sections : "member scope (nullable)"
    household_members ||--o{ imports : "has"
    household_members ||--o{ folios : "holds"
    household_members ||--o{ portfolio_snapshots : "has"
    household_members ||--o{ household_member_name_changes : "audited by"
    schemes ||--o{ folios : "held as"
    folios ||--o{ transactions : "contains"
    imports ||--o{ transactions : "first-wrote"
    transactions ||--o{ transaction_imports : "touched by"
    imports ||--o{ transaction_imports : "touched"
    schemes ||--o{ nav_history : "has"
    schemes ||--o{ scheme_ter : "has"
    schemes ||--o{ scheme_aaum : "has"
    schemes ||--o{ fund_scores : "has"
    schemes ||--o{ scheme_rankings : "has"
    schemes ||--o{ scheme_fund_managers : "has"
    schemes ||--o{ scenario_scheme_results : "has"
    scenarios ||--o{ scenario_scheme_results : "has"
    scenarios ||--o{ scenario_category_averages : "has"
    scenarios ||--o{ scenario_hypothetical_assumptions : "has"

    users {
        uuid id PK
        string phone_number UK "NOT NULL"
        string email "nullable, copy of best identity email"
        timestamptz created_at
        string onboarding_step "landing..phone..otp..q1_name..q2_investing..q3_purpose..cas_upload..done"
        timestamptz onboarding_completed_at
        enum investor_type
        json primary_goals "multi-select, supersedes primary_goal"
        bool pending_deletion
        timestamptz deletion_scheduled_at
    }
    otp_requests {
        uuid id PK
        string phone_number "exactly one of phone/email"
        string email "exactly one of phone/email"
        string otp_hash "sha256 of the 6 digits"
        timestamptz expires_at "created + 5 min"
        timestamptz verified_at "NULL until correct code"
        int attempt_count "max 5"
        string ip_address "device/platform analytics, not fraud"
        string device_type "mobile/tablet/desktop/other"
        string os_family
        string browser_family
        json consent_snapshot "phone sign-up T and C + Privacy, captured at Get OTP click"
        timestamptz created_at
    }
    pending_identity_verifications {
        uuid id PK
        enum provider
        string provider_subject
        string email
        bool email_verified
        uuid matched_user_id FK "NULL = new signup"
        string token_hash "sha256 of browser token"
        json consent_snapshot "signup consent, turned into consent_records rows at account creation"
        timestamptz expires_at "created + 10 min"
        timestamptz created_at
    }
    auth_identities {
        uuid id PK
        uuid user_id FK
        enum provider "phone_otp, email_otp, google"
        string provider_subject "UK with provider"
        string email "denormalized claim"
        timestamptz identifier_verified_at
        timestamptz created_at
        timestamptz last_used_at
    }
    sessions {
        uuid id PK
        uuid user_id FK
        string session_token_hash "sha256 of bearer token"
        enum auth_method
        timestamptz created_at
        timestamptz expires_at "created + 30 days"
        timestamptz last_active_at
        string device_info "still always NULL today"
    }
    consent_records {
        uuid id PK
        uuid user_id "no FK on purpose, see Q-theory"
        enum action "given or withdrawn"
        enum purpose_code "service_agreement, account_and_authentication, portfolio_tracking_analytics, cas_pan_processing"
        enum document_type "terms_of_service, privacy_policy, pan_disclaimer"
        string document_version
        string document_sha256
        timestamptz recorded_at
        string surface "signup, reconsent, cas-upload"
        string ip_truncated "/24 or /48, never the full IP"
        string ip_hmac
        uuid related_import_id "no FK"
    }
    household_members {
        uuid id PK
        uuid user_id FK
        string name
        enum relationship "NULLABLE now - set later in Complete profile"
        string relationship_other_label
        string phone_number "unverified contact field, not unique"
        string email "unverified contact field, not unique"
        timestamptz created_at
        string pan_encrypted "AES-256-GCM"
        string pan_lookup_hash UK "HMAC-SHA256"
        timestamptz pan_pending_until "NULL = permanent"
        enum origin "onboarding, manual, cas_detected"
        enum name_source "user_entered, cas, user_edited"
        enum pan_source "cas, user_entered"
        enum pan_conflict "other_account - set, PAN still kept encrypted in detected_pan_*"
        string detected_pan_encrypted "shadow PAN when pan_conflict is set"
        uuid detected_from_import_id FK "which import first detected this person"
    }
    household_member_name_changes {
        uuid id PK
        uuid household_member_id FK
        string old_name
        string new_name
        enum reason "cas_variant, user_corrected_to_cas, user_edit"
        uuid import_id FK
    }
    household_member_merges {
        uuid id PK
        uuid user_id FK
        uuid kept_member_id "no FK, outlives a later delete"
        uuid removed_member_id "no FK"
        int folios_moved
        int transactions_dropped
    }
    imports {
        uuid id PK
        uuid household_member_id FK
        enum status "previewing, pending, confirmed, failed, ..."
        enum source_cas_type "cams or kfintech"
        json raw_parser_output "PAN removed"
        date statement_from_date
        date statement_to_date
        uuid upload_group_id "one CAS file -> many Import rows, one per detected person"
        text preview_state "AES-GCM encrypted review session, replaces the old in-RAM dict"
        timestamptz uploaded_at
        timestamptz confirmed_at
        string file_reference "S3 key"
        timestamptz file_expires_at "+30 days"
    }
    folios {
        uuid id PK
        uuid household_member_id FK "UK with scheme + folio_key"
        uuid scheme_id FK
        string folio_number "as first printed, display only"
        string folio_key "whitespace-stripped, the real matching key"
        enum plan_type "direct, regular, unclassified"
        bool plan_verified "AMFI master confirmed the plan"
        bool has_coverage_gap
    }
    transaction_imports {
        uuid transaction_id PK "composite PK with import_id"
        uuid import_id PK
        date transaction_date "partition key for the FK"
    }
    transactions {
        uuid id PK "PK is id + date"
        date date PK "yearly partition key"
        uuid folio_id FK
        uuid import_id FK "first writer only - see transaction_imports"
        enum type "16 types now, incl. reversal/gift_in/gift_out/bonus"
        numeric amount "14,2 unsigned"
        numeric units "14,3 unsigned"
        numeric nav "10,4"
        numeric stamp_duty "nullable, rows from before 0032 have none"
        enum origin "cas_row, cas_opening, manual"
        numeric balance_units "casparser's own running balance, for the dedupe key"
        int occurrence "disambiguates genuine same-day twins"
    }
    portfolio_snapshots {
        uuid household_member_id PK
        date snapshot_month PK "month-end date"
        numeric total_value "18,2"
        numeric invested_value
        bool is_partial "some scheme's NAV was unavailable"
    }
    schemes {
        uuid id PK
        string amfi_code UK "nullable now - CAS-only closed funds have none"
        string isin
        string base_name "AMFI base name, plan/option stripped"
        string name
        string amc_name
        string sebi_category
        enum plan_type "AMFI master's own direct/regular, when known"
        bool is_active
        enum source "amfi, casparser, cas_only"
        string ter_scheme_code "exact link into AMFI's TER feed"
    }
    nav_history {
        uuid scheme_id PK
        date date PK
        numeric nav "14,4 - widened for IL&FS high-face-value units"
    }
    scheme_ter {
        uuid scheme_id PK
        date reference_period PK
        numeric ter_value "NULL = checked, no match"
    }
    scheme_aaum {
        uuid scheme_id PK
        date reference_period PK
        numeric aaum_value "18,2"
    }
    fund_scores {
        uuid scheme_id PK
        timestamptz computed_at PK
        int risk_adjusted_tier
        numeric final_score
    }
    scheme_rankings {
        uuid scheme_id PK
        timestamptz computed_at PK
        numeric composite_score "5-factor, 25/25/20/15/15 weighting"
        int category_rank
        numeric percentile
    }
    ranking_weights {
        bool id PK "singleton row, id = true"
        numeric weight_return_3y "default 0.25"
        numeric weight_return_5y "default 0.25"
        numeric weight_category_relative "default 0.20"
        numeric weight_low_volatility "default 0.15"
        numeric weight_low_ter "default 0.15"
    }
    scheme_fund_managers {
        uuid id PK
        uuid scheme_id FK
        string manager_name
        string role "verbatim source label, never fabricated"
        date reference_period
        string match_method "ISIN, EXACT, FUZZY, MANUAL"
    }
    scenarios {
        uuid id PK
        string name
        enum scenario_type "CRASH, BULL_RUN, POLICY_RATE, HYPOTHETICAL"
        date start_date
        date end_date
        bool is_ongoing
    }
    scenario_scheme_results {
        uuid scenario_id PK
        uuid scheme_id PK
        numeric pct_change
        bool is_proxied
    }
    scenario_category_averages {
        uuid scenario_id PK
        string sebi_category PK
        numeric avg_pct_change
    }
    scenario_hypothetical_assumptions {
        uuid scenario_id PK
        string asset_class PK
        numeric assumed_pct_change
    }
    benchmark_index_history {
        enum index_name PK
        date date PK
        enum return_type PK "price or tri - PK since 0033"
        numeric value "12,2"
    }
    arn_directory {
        string arn_code PK
        string distributor_name
        enum status
    }
    analytics_sections {
        uuid user_id PK
        string scope_key PK "combined or member id"
        string section PK "10 names now"
        uuid household_member_id FK "NULL for combined"
        json payload
        timestamptz computed_at
        timestamptz failed_at
    }
    analytics_recompute_status {
        uuid user_id PK
        timestamptz started_at "NULL = idle"
        int generation "data version"
    }
    account_deletion_surveys {
        uuid id PK
        string reason
        string feedback
        timestamptz created_at "no FK, anonymous"
    }"""

ER_AUTH = """erDiagram
    users ||--o{ auth_identities : "user_id FK"
    users ||--o{ sessions : "user_id FK"
    users |o--o{ pending_identity_verifications : "matched_user_id FK, only when linking"
    otp_requests }o..o{ auth_identities : "no FK: same phone or email VALUE"
    otp_requests }o..o{ pending_identity_verifications : "no FK: same email VALUE"
    users }o..o{ consent_records : "no FK, by design: user_id VALUE only"

    otp_requests {
        uuid id PK
        string phone_number
        string email
        string otp_hash
        timestamptz expires_at
        timestamptz verified_at
        int attempt_count
        json consent_snapshot "phone sign-up only"
        string device_type
    }
    pending_identity_verifications {
        uuid id PK
        enum provider
        string provider_subject
        string email
        bool email_verified
        uuid matched_user_id FK
        string token_hash
        json consent_snapshot
        timestamptz expires_at
    }
    users {
        uuid id PK
        string phone_number UK
        string email
    }
    auth_identities {
        uuid id PK
        uuid user_id FK
        enum provider
        string provider_subject
        string email
    }
    sessions {
        uuid id PK
        uuid user_id FK
        string session_token_hash
        timestamptz expires_at
    }
    consent_records {
        uuid id PK
        uuid user_id "value match only"
        enum action
        enum document_type
        enum purpose_code
        timestamptz recorded_at
    }"""

SIGNUP = """flowchart TD
    A["Landing screen, signup mode:<br/>phone number input only<br/>no email, no Google button here"] -->|"Get OTP clicked = the T and C<br/>and Privacy agreement itself"| B["POST /auth/otp/request<br/>flow = signup, consent = accepted versions"]
    B --> C{"otp_requests row for this phone,<br/>unverified, under 60s old?"}
    C -->|Yes| C1["429 'Please wait Ns before requesting another code.'"]
    C -->|No| D[("INSERT otp_requests<br/>phone, otp_hash, expires_at = +5 min<br/>consent_snapshot = T and C + Privacy versions<br/>ip_address, device_type, os_family, browser_family")]
    D --> E["OTP screen: SMS is stub mode, code shown on screen"]
    E -->|"POST /auth/otp/verify<br/>flow = signup, consent = accepted"| F{"Code valid, under 5 attempts,<br/>under 5 min old?"}
    F -->|No| F1[("UPDATE otp_requests<br/>attempt_count + 1 · 401 'Incorrect OTP.'")]
    F -->|Yes| G[("UPDATE otp_requests.verified_at")]
    G --> H{"Phone already belongs<br/>to an account?"}
    H -->|Yes| H1["409 'An account with this phone number already exists.'"]
    H -->|No| I[("INSERT pending_identity_verifications<br/>phone verified, consent_snapshot carried over<br/>token_hash = sha256(random token), expires_at = +10 min")]
    I --> J["Mandatory email gate screen<br/>(reversed from the old design: email used to be first)"]
    J -->|"POST /auth/email-otp/request<br/>with the pending token"| K[("INSERT otp_requests (email)")]
    K --> L["Enter email code"]
    L -->|"POST /auth/email-otp/verify<br/>with the pending token"| M{"Code valid?"}
    M -->|No| F1
    M -->|Yes| N[("Commit 1: UPDATE otp_requests.verified_at (email)<br/>Commit 2, atomic, complete_gated_signup:<br/>INSERT users (phone + email)<br/>INSERT auth_identities phone_otp + email_otp<br/>INSERT consent_records GIVEN x2<br/>(terms_of_service, privacy_policy)<br/>DELETE the pending_identity_verifications row<br/>Commit 3: INSERT sessions")]
    N --> O["Onboarding: Q1 Name"]
    class D,G,K,N db
    class H1,F1 none
    class A browser""" + CLASSDEFS

SIGNUP_NOTE = (
    "Reversed 28-29 Sep 2026 (auth-flow-redesign): signup used to be email-or-Google first with phone "
    "as the mandatory gate. It is now phone-only on the signup screen itself, with email as the mandatory "
    "gate afterward. Google sign-in is still wired on the backend for a brand-new account (consent deferred "
    "until the account is confirmed new) but the signup screen no longer offers that button; the only place "
    "Google appears is the Login screen, where it doubles as sign-up for an unrecognized Google account - "
    "normal for a single Google button, not the login-side account-creation bug described below."
)

OTP_LIFECYCLE = """stateDiagram-v2
    [*] --> Waiting: request endpoint INSERTs the row
    Waiting: WAITING<br/>verified_at = NULL, attempt_count = 0
    Waiting --> Waiting: wrong code, attempt_count + 1
    Waiting --> Verified: right code within 5 minutes
    Verified: VERIFIED<br/>verified_at = time of success
    Waiting --> Expired: 5 minutes pass
    Expired: EXPIRED<br/>row unchanged, verify refuses it
    Waiting --> Locked: 5 wrong attempts
    Locked: LOCKED<br/>row unchanged, verify refuses it
    Waiting --> Superseded: Resend after 60 s adds a newer row
    Superseded: SUPERSEDED<br/>verify always reads the newest unverified row
    Verified --> [*]: row kept, no cleanup job
    Expired --> [*]: row kept, no cleanup job
    Locked --> [*]: row kept, no cleanup job
    Superseded --> [*]: row kept, no cleanup job"""

LOGIN = """flowchart TD
    A["Log in screen: Google, Email, or Phone"] --> P["Continue with Phone"]
    A --> E["Continue with Email"]
    A --> G["Continue with Google"]
    P -->|"POST /auth/otp/request, flow = login<br/>no consent sent"| P1[("INSERT otp_requests (phone)<br/>no account check at this step")]
    P1 -->|"POST /auth/otp/verify, flow = login"| P2{"Code valid?"}
    P2 -->|No| P2x[("UPDATE otp_requests attempt_count + 1<br/>401 shown under the code boxes")]
    P2 -->|Yes| P3[("UPDATE otp_requests.verified_at")]
    P3 --> P4{"auth_identities row with<br/>provider phone_otp, subject = phone?"}
    P4 -->|Yes| S
    P4 -->|"No, but users.phone_number matches"| P5[("INSERT auth_identities (self-heal for<br/>accounts created before migration 0005)")]
    P5 --> S
    P4 -->|"No account anywhere"| P6["401 'No account found for that<br/>phone number - sign up instead.'<br/>FIXED 30 Sep 2026: no account created"]
    E -->|"POST /auth/email-otp/request, flow = login"| E1["AWS: SES SendEmail via fck-nat"]
    E1 -->|"SES error"| E1x["502 'We couldn't send that email right now.'"]
    E1 -->|sent| E2[("INSERT otp_requests (email)")]
    E2 -->|"POST /auth/email-otp/verify, flow = login"| E3{"Code valid?"}
    E3 -->|No| P2x
    E3 -->|Yes| E4[("UPDATE otp_requests.verified_at")]
    E4 --> E5{"auth_identities email_otp row<br/>for this email?"}
    E5 -->|No| E5x["401 'No account found for that email — sign up instead.'"]
    E5 -->|Yes| S
    G -->|"POST /auth/oauth/google with ID token"| G1["AWS: task fetches Google's public certs<br/>through fck-nat and verifies the token"]
    G1 --> G2{"auth_identities google row<br/>for this Google sub?"}
    G2 -->|Yes| S
    G2 -->|"No, but the verified email matches<br/>another identity"| G3[("INSERT auth_identities (google)<br/>UPDATE users.email · auto-link")]
    G3 --> S
    G2 -->|"No match: a brand-new Google account"| G4[("Consent deferred until confirmed new<br/>then INSERT users + auth_identities + consent_records<br/>same as the phone-first signup's final commit")]
    S[("INSERT sessions<br/>session_token_hash = sha256(token)<br/>auth_method = method used<br/>expires_at = now + 30 days<br/>device_info = still always NULL")]
    S --> T["Browser stores token in localStorage<br/>GET /auth/me: SELECT sessions by hash, SELECT users<br/>onboarding done → dashboard, else resume at onboarding_step"]
    class P1,P2x,P3,P5,E2,E4,G3 db
    class S,G4 create
    class E1x,E5x,P6 none
    class E1,G1 aws
    class T browser""" + CLASSDEFS

ONBOARDING = """flowchart TD
    A["Account created (phone + email both verified)"] --> Q1["Q1 Name"]
    Q1 -->|"POST /household-members<br/>name, relationship = self"| W1[("INSERT household_members<br/>relationship = self, origin = onboarding<br/>name_source = user_entered<br/>name is PROVISIONAL until a CAS says otherwise<br/>all PAN columns NULL")]
    W1 --> Q2["Q2 Investing style"]
    Q2 -->|"PUT /auth/me"| W2[("UPDATE users.investor_type, onboarding_step")]
    W2 --> Q3["Q3 Purpose<br/>multi-select, or 'Why choose? All of it.'<br/>shortcut picks every option"]
    Q3 -->|"PUT /auth/me"| W3[("UPDATE users.primary_goals (JSON array), onboarding_step")]
    W3 --> C["CAS upload: one file, for Self"]
    C --> D{"Statement covers more<br/>than one person?"}
    D -->|"No - just Self"| Z
    D -->|"Yes - family members found<br/>in the SAME statement"| P["PeopleFoundDialog:<br/>name/PAN already read from the CAS<br/>user only types a name if the CAS couldn't read one"]
    P --> W4[("At Confirm: INSERT household_members per detected person<br/>relationship = NULL (picked later)<br/>origin = cas_detected, name_source = cas<br/>PAN made permanent immediately (store_detected_pan)")]
    W4 --> Z["onboarding_completed_at set, first time only"]
    Z --> D2["Main dashboard"]
    D2 -.->|"optional, any time later"| CP["Complete profile popup<br/>PUT /household-members/id/profile"]
    CP -.-> W5[("UPDATE household_members<br/>relationship, phone_number, email (unverified)<br/>name if the user edits it<br/>each field = 20% of profile_completion")]
    class W1,W2,W3,W4,W5 db
    class Q1 browser""" + CLASSDEFS

ONBOARDING_NOTE = (
    "The old Q4 Household screen, Add Family Members, and the whole family-CAS-queue flow were deleted "
    "30 Sep 2026. There is no longer a step where the user is asked up front how many people are in the "
    "household. Family members are now discovered from inside a single CAS file (one person's statement "
    "can legally list co-held or related folios), or added one at a time later from the dashboard."
)

UPLOAD = """flowchart TD
    A["Upload form: pick PDF, tick nothing -<br/>there is no tick box, just a notice"] --> B{"Browser checks: a .pdf chosen<br/>and under 25 MB?"}
    B -->|No| Bx["Red text under the file picker<br/>nothing sent"]
    B -->|Yes| C["'Parsing…' spinner<br/>POST /imports/parse, multipart: file, household_member_id<br/>HTTPS: Route 53 → ALB → backend task"]
    C --> D{"Valid session and<br/>account not pending deletion?"}
    D -->|No| Dx["401 or 403"]
    D -->|Yes| E{"Filename ends in .pdf?"}
    E -->|No| Ex["400 invalid_file 'Please upload a PDF file.'"]
    E -->|Yes| F{"household_member_id is<br/>one of this user's members?"}
    F -->|No| Fx["404 'Household member not found.'"]
    F -->|Yes| G{"Size under 25 MB and bytes<br/>start with the PDF magic bytes?"}
    G -->|"too big"| Gx1["413 file_too_large"]
    G -->|"not a PDF"| Gx2["400 invalid_file"]
    G -->|OK| PD{"PAN-disclaimer consent<br/>already on record?"}
    PD -->|No| PDx["422 consent_required<br/>'Tick the box to confirm you're<br/>authorised to share this statement.'"]
    PD -->|"Yes, or just given"| PW[("INSERT consent_records<br/>(PAN disclaimer) committed BEFORE<br/>the PDF is even opened, so it survives<br/>a parse failure further down")]
    PW --> H["Write bytes to a temp file on the task's disk<br/>casparser.read_cas_pdf(path)<br/>temp file deleted in finally"]
    H -->|"wrong/no password"| Hx1["422 wrong_password<br/>'That password didn't open the file.<br/>It's usually your PAN in capitals...'"]
    H -->|"scanned, no text layer"| Hx2["422 scanned_pdf"]
    H -->|"file truncated/corrupt"| Hx3["422 damaged_pdf<br/>'This file looks incomplete.'"]
    H -->|"not CAMS/KFintech"| Hx4["422 unknown_issuer"]
    H -->|"NSDL/CDSL demat"| Hx5["422 demat_cas"]
    Hx1 & Hx2 & Hx3 & Hx4 & Hx5 --> Q["'Import failed' with the message + Try again<br/>consent row already saved; nothing else written"]
    H -->|"Detailed CAMS / KFintech CAS"| I["Parse in task RAM: folios grouped into people<br/>(people.py), each fund identified against the<br/>local AMFI master with NAV verification (identify.py)<br/>opening balance captured from casparser's own total"]
    I --> K["Review session ENCRYPTED and written to<br/>imports.preview_state, status = previewing<br/>survives a crash or the 9PM stop, unlike the old RAM dict"]
    K --> L{"PAN check for Self's own claim<br/>against household_members.pan_lookup_hash"}
    L -->|"conflict with another account"| Lx["409 cross_account_pan_blocked, popup<br/>nothing written beyond the consent row"]
    L -->|OK| M[("UPDATE household_members (Self)<br/>pan_encrypted, pan_lookup_hash<br/>pan_pending_until = now + 65 min")]
    M --> N{"needs_review true?<br/>(an unidentified held fund, or a<br/>name the statement couldn't read)"}
    N -->|"No - the common case"| AUTO["Spinner stays on screen.<br/>Confirm fires AUTOMATICALLY, no review table"]
    N -->|"Yes"| PROMPT["A narrow dialog only, never a line-item table:<br/>PeopleFoundDialog / UnidentifiedFundsDialog"]
    class Bx browser
    class Dx,Ex,Fx,Gx1,Gx2,Hx1,Hx2,Hx3,Hx4,Hx5,Q,PDx,Lx none
    class PW,K,M db
    class AUTO create""" + CLASSDEFS

PARSER = """flowchart LR
    A["PDF bytes<br/>request memory"] --> B["NamedTemporaryFile<br/>on the task's ephemeral disk"]
    B --> C["casparser.read_cas_pdf<br/>decrypts, extracts text,<br/>detects statement type"]
    C --> D{"What came back?"}
    D -->|"exception type"| X0["classified by EXCEPTION TYPE now,<br/>not message keywords (old bug: any<br/>message containing 'text' -> scanned_pdf)"]
    D -->|"NSDLCASData"| X1["demat_cas"]
    D -->|"CASData, DETAILED"| E["people.py: group folios into people<br/>by holder name + PAN, one key per person (p1, p2...)"]
    E --> F["Each folio: opening balance captured<br/>from casparser's own 'open' units field<br/>(the old bug: this was silently discarded)"]
    F --> G["identify.py: match each fund against<br/>the local AMFI scheme master<br/>ISIN -> NAV fingerprint -> sibling NAV -> ask<br/>Direct/Regular from AMFI's own Plan column first,<br/>CAS name as fallback when AMFI's is blank"]
    G --> H["ParseResult + review session"]
    H --> I["Encrypted, written to imports.preview_state"]
    class X0,X1 none
    class G aws""" + CLASSDEFS

CONFIRM_SEQ = """sequenceDiagram
    autonumber
    actor U as User
    participant FE as Browser
    participant ALB as ALB
    participant API as ECS backend task
    participant DB as RDS PostgreSQL
    participant S3 as S3 CAS bucket
    participant JOB as ECS recompute task
    U->>FE: Choose CAS, Upload
    FE->>ALB: POST /imports/parse
    ALB->>API: forward to port 8000
    API->>DB: SELECT sessions, users, household_members (auth + ownership)
    API->>DB: INSERT consent_records (PAN disclaimer), COMMIT
    API->>API: validate, temp file, casparser, identify.py AMFI matching
    API->>DB: UPDATE household_members (Self) pan_* pending, COMMIT
    API->>DB: UPDATE imports preview_state = encrypted session, status = previewing
    API-->>FE: preview (masked PAN, needs_review flag)
    alt needs_review is false (the common case)
        FE->>FE: show the parsing spinner, no screen change
        FE->>ALB: POST /imports/confirm (fires automatically)
    else needs_review is true
        FE-->>U: a narrow dialog (people found / unidentified fund)
        U->>FE: resolve it
        FE->>ALB: POST /imports/confirm
    end
    ALB->>API: forward
    API->>DB: load preview_state, decrypt (same user, under 60 min)
    API->>DB: UPDATE household_members (Self) SET pan_pending_until = NULL
    API->>DB: for each detected person with no household_members row yet,<br/>INSERT household_members (origin cas_detected, PAN permanent at once)
    API->>DB: INSERT one imports row per included person, same upload_group_id
    API->>DB: INSERT transactions, incl. an OPENING_BALANCE row per scheme<br/>(earliest-statement-wins rule), INSERT transaction_imports links
    API->>S3: PutObject, one PDF shared by every person's imports row
    API->>DB: statement_from_date/to_date, counts, COMMIT
    API->>DB: upsert analytics_recompute_status.started_at (claim)
    API-->>FE: {added, skipped, import ids}
    FE-->>U: Back on the dashboard - no 'Import complete' review screen
    par background tasks after the response
        API->>JOB: ecs:RunTask run_analytics_recompute.py --household user_id
        JOB->>DB: UPSERT analytics_sections (10 sections x each scope)
        JOB->>DB: analytics_recompute_status.started_at = NULL
    end"""

PAN_GEN = """flowchart LR
    TF["Terraform variables<br/>TF_VAR_pan_encryption_key<br/>TF_VAR_pan_lookup_pepper<br/>32 random bytes each"] --> SM["Secrets Manager<br/>unifolio-staging-pan-keys<br/>KMS-encrypted"]
    SM -->|"ECS injects at container start"| ENV["Env vars in the backend task<br/>PAN_ENCRYPTION_KEY<br/>PAN_LOOKUP_PEPPER"]
    CAS["Raw PAN from casparser<br/>one per detected person"] --> N["normalize_pan:<br/>strip spaces, uppercase"]
    N --> ENC["encrypt_pan: AES-256-GCM<br/>fresh 12-byte nonce<br/>base64(nonce + ciphertext)"]
    N --> HASH["hash_pan: HMAC-SHA256<br/>keyed with the pepper<br/>same PAN -> same hex"]
    ENV --> ENC
    ENV --> HASH
    ENC --> C1[("household_members.pan_encrypted<br/>(Self, upload-time, pending then permanent)")]
    ENC --> C2[("household_members.detected_pan_encrypted<br/>(a detected person whose PAN collides<br/>with ANOTHER account - kept, not blocked)")]
    HASH --> C3[("household_members.pan_lookup_hash<br/>UNIQUE across all users")]
    class TF,SM,ENV aws
    class C1,C2,C3 db""" + CLASSDEFS

PAN_STATES = """stateDiagram-v2
    [*] --> Empty: member created, self at onboarding
    Empty: EMPTY<br/>pan_encrypted NULL - pan_lookup_hash NULL
    Pending: PENDING<br/>Self only - pan_pending_until = upload + 65 min
    Permanent: PERMANENT<br/>pan_pending_until NULL
    Conflict: CONFLICT<br/>detected person only - pan_conflict = other_account<br/>detected_pan_* holds the ciphertext instead
    Empty --> Pending: Self uploads, POST /imports/parse
    Pending --> Permanent: POST /imports/confirm
    Pending --> Empty: discard, or 65 min pass unconfirmed
    Empty --> Permanent: a CAS-DETECTED person's PAN is free<br/>store_detected_pan, no pending step at all
    Empty --> Conflict: a CAS-DETECTED person's PAN belongs<br/>to a different Unifolio account<br/>import still proceeds, nothing blocked
    Permanent --> Permanent: later imports of the same PAN"""

FAMILY = """flowchart TD
    A["One CAS statement, uploaded for Self"] --> B["people.py groups every folio<br/>by holder name + PAN into people:<br/>p1 (me), p2, p3..."]
    B --> C{"More than one person,<br/>or a name the statement couldn't read,<br/>or an unassigned fund?"}
    C -->|"No - a single-person file"| D1["Confirm fires automatically,<br/>no dialog shown at all"]
    C -->|Yes| D2["PeopleFoundDialog:<br/>each person's CAS name + masked PAN already shown<br/>user only types a name where the CAS has none,<br/>and assigns any unowned fund to a person"]
    D1 --> E
    D2 -->|Confirm| E["POST /imports/confirm, ONE call, ALL people"]
    E --> F[("For each NEW person: INSERT household_members<br/>origin = cas_detected, relationship = NULL<br/>PAN made permanent at once (store_detected_pan) -<br/>or marked pan_conflict if another account holds it")]
    F --> G[("INSERT one imports row per person,<br/>SAME upload_group_id, SAME S3 PDF")]
    G --> H[("INSERT folios + transactions per person,<br/>incl. opening-balance rows")]
    H --> I["S3: ONE PutObject for the whole file"]
    I --> J["Back on the dashboard.<br/>Each detected person shows a<br/>Complete profile nudge for relationship"]
    J -.->|"a family member's OWN separate file,<br/>added later, one at a time"| K["Dashboard: pick that member as the target,<br/>POST /imports/parse with their household_member_id<br/>no ordering, no queue - this is just an ordinary upload"]
    class B browser
    class F,G,H db
    class I aws""" + CLASSDEFS

FAMILY_NOTE = (
    "The old 'three household members imported one by one, Self last' flow (FamilyImportFlow.tsx, deleted "
    "30 Sep 2026) no longer exists in any form. Multiple people now come from ONE statement in ONE confirm "
    "call, not a sequential queue - the only 'order' left is p1/p2/p3 inside that single statement, which the "
    "user never queues or re-orders themselves."
)

ER_PORTFOLIO = """erDiagram
    household_members ||--o{ folios : "household_member_id"
    schemes ||--o{ folios : "scheme_id"
    folios ||--o{ transactions : "folio_id"
    imports ||--o{ transactions : "import_id (first writer)"
    transactions ||--o{ transaction_imports : "every import that touched it"
    household_members ||--o{ imports : "household_member_id"
    household_members ||--o{ portfolio_snapshots : "household_member_id"
    schemes ||--o{ nav_history : "scheme_id"

    household_members {
        uuid id PK
        uuid user_id FK
        string name
        enum relationship "nullable"
    }
    folios {
        uuid id PK
        uuid household_member_id FK
        uuid scheme_id FK
        string folio_key "whitespace-stripped match key"
        enum plan_type
        bool plan_verified
        bool has_coverage_gap
    }
    schemes {
        uuid id PK
        string amfi_code UK "nullable"
        string name
        string sebi_category
        enum plan_type "AMFI master's own"
        enum source "amfi, casparser, cas_only"
    }
    transactions {
        uuid id PK
        date date PK
        uuid folio_id FK
        uuid import_id FK
        enum type "16 types"
        numeric amount
        numeric units
        numeric nav
        enum origin "cas_row, cas_opening, manual"
    }
    portfolio_snapshots {
        uuid household_member_id PK
        date snapshot_month PK
        numeric total_value
        bool is_partial
    }
    nav_history {
        uuid scheme_id PK
        date date PK
        numeric nav
    }"""

PLAN = """flowchart TD
    A["A fund held in the statement"] --> B{"AMFI scheme master has<br/>this scheme's Plan column filled?"}
    B -->|"Yes: Direct or Regular"| V1["Verified true - AMFI's own answer wins"]
    B -->|"No: AMFI leaves it blank<br/>(real example: all 4 Motilal Oswal<br/>Midcap Fund rows, 8 Oct 2026)"| C{"AMFI's own NAME says<br/>Direct/Dir or Regular/Reg?"}
    C -->|Yes| V1
    C -->|"No"| D{"A Direct sibling scheme exists<br/>with a DIFFERENT NAV that day?"}
    D -->|Yes| V2["Regular, verified true<br/>(the NAV difference proves it)"]
    D -->|"No"| E{"Blank-AMFI-plan fallback (8 Oct 2026 fix):<br/>does the STATEMENT'S OWN scheme name<br/>already say Direct or Regular?"}
    E -->|Yes| V3["That value, verified true -<br/>falls back to the statement when AMFI can't say"]
    E -->|No| V4["Regular, verified FALSE<br/>(best guess, flagged unverified)"]
    V1 & V2 & V3 & V4 --> F[("folios.plan_type + folios.plan_verified")]
    class F db""" + CLASSDEFS

PLAN_NOTE = (
    "This replaces the old name-regex-plus-ARN classifier as the PRIMARY signal once a fund is matched "
    "against the AMFI master (identify.py, Phase 5, 7 Oct 2026). The old parser-level classify_folio_plan_type "
    "(name + ARN) still exists, but now only feeds the 8 Oct fallback above and the pre-match ParsedScheme."
)

SWITCH = """sequenceDiagram
    actor U as User
    participant FE as Browser (MainDashboardFlow state)
    participant API as ECS backend task
    participant DB as RDS
    Note over FE: viewMode = aggregate (Family view)
    FE->>API: GET /household/aggregate/holdings (+ allocation, sips, cash-flow, snapshots)
    API->>DB: SELECT household_members WHERE user_id = me
    API->>DB: SELECT folios + transactions for every member id
    API-->>FE: combined holdings + members[] with has_data flags
    FE->>API: GET /analytics/combined
    API->>DB: SELECT analytics_sections WHERE user_id = me AND scope_key = 'combined'
    API-->>FE: 10 precomputed sections
    U->>FE: Per Member -> pick one
    Note over FE: viewMode = member, selectedMemberId = that member's id<br/>React state only, nothing is saved
    FE->>API: GET /household-members/{id}/holdings (+ allocation, sips, cash-flow, snapshots)
    API->>DB: SELECT household_members WHERE id = member_id AND user_id = me (ownership)
    API->>DB: SELECT folios + transactions for [member_id]
    API-->>FE: that member's holdings only
    FE->>API: GET /analytics/{member_id}
    API->>DB: ownership check, then SELECT analytics_sections WHERE scope_key = member_id
    API-->>FE: 10 sections (browser polls every 3 s until all have settled)"""

RECOMPUTE_STATES = """stateDiagram-v2
    [*] --> NoRow
    NoRow: NO ROW<br/>user has never triggered a recompute
    Idle: IDLE<br/>started_at = NULL
    Running: RUNNING<br/>started_at = claim time
    NoRow --> Running: first claim INSERTs the row
    NoRow --> Idle: generation bump INSERTs with started_at NULL
    Idle --> Running: claim, via GET with no rows, Retry, import confirm, or the daily backstop
    Running --> Running: another claim is refused while under 2 h old
    Running --> Idle: worker finishes, finally sets started_at NULL
    Running --> Idle: RunTask could not place a task, claim released
    Running --> Running: crashed worker, a new claim wins once 2 h have passed
    Idle --> Idle: import deleted or account deleted, generation + 1
    Running --> Running: import deleted mid-run, generation + 1, worker stops writing"""

JOBS = """flowchart LR
    EB["EventBridge Scheduler<br/>timezone Asia/Kolkata<br/>each job = 1 Fargate task, 0.5 vCPU / 1 GB"]
    EB -->|"06:00 daily"| J1["refresh_nav_daily.py"]
    EB -->|"06:15 daily"| J1b["refresh_scheme_master_daily.py"]
    EB -->|"06:00 daily"| J2["refresh_benchmark_daily.py"]
    EB -->|"06:20 daily (was monthly)"| J3["refresh_ter_daily.py"]
    EB -->|"06:00, 10th of month, 2 GB"| J9["refresh_fund_managers_monthly.py"]
    EB -->|"06:00 on 1 Jan/Apr/Jul/Oct"| J4["refresh_aaum_quarterly.py"]
    EB -->|"06:30 daily"| J5["run_analytics_recompute.py --all"]
    EB -->|"08:00 daily"| J6["delete_expired_accounts_daily.py"]
    EB -->|"19:00 daily"| J7["app.scripts.expire_cas_files"]
    EB -->|"21:00-21:15 daily"| NS["stop_backend, stop_rds,<br/>stop_fck_nat, stop_bastion"]
    EB -->|"04:45-04:58 daily"| ST["start_rds, start_fck_nat,<br/>start_backend (bastion: manual only)"]
    J1b -->|"AMFI NAVAll.txt, full daily dump"| X1b["amfiindia.com"]
    J1b --> T1b[("schemes<br/>amfi_code, isin, base_name, plan_type, is_active")]
    J1 -->|"GET /mf/{amfi_code} for each held scheme"| X1["api.mfapi.in"]
    J1 --> T1[("nav_history")]
    J2 --> X2["niftyindices.com (now TRI, not price)"]
    J2 --> T2[("benchmark_index_history")]
    J3 --> X3["amfiindia.com TER API"]
    J3 --> T3[("scheme_ter")]
    J9 -->|"55 AMCs: 40 automatic,<br/>10 by hand monthly, 5 unavailable"| X9["each AMC's own factsheet PDF"]
    J9 --> T9[("scheme_fund_managers")]
    J9 -.->|"on failure, FUND_MANAGER_ALERT log line"| ALM["CloudWatch metric alarm -> SNS ops-alerts"]
    J4 --> X4["amfiindia.com AAUM API"]
    J4 --> T4[("scheme_aaum")]
    J5 --> T5[("analytics_sections (10 sections)<br/>analytics_recompute_status")]
    J6 --> T6[("hard-delete users 5 days after they asked")]
    J7 --> T7[("imports.file_reference = NULL")]
    J7 --> S3["S3 DeleteObject"]
    NS --> AWSAPI["ecs:UpdateService, rds:StopDBInstance,<br/>ec2:StopInstances - direct, no RunTask"]
    class EB,J1,J1b,J2,J3,J4,J5,J6,J7,J9,S3,NS,ST,AWSAPI,ALM aws
    class T1,T1b,T2,T3,T4,T5,T6,T7,T9 db""" + CLASSDEFS

JOBS_NOTE = (
    "The fund-manager job is deliberately not fully automatic: 10 of the 55 fund houses (689 live funds) "
    "need a person to download the factsheet by hand every month (a CLI script, import_manual_fund_managers.py, "
    "not an admin screen yet), and 5 (33 funds) publish no usable factsheet at all and are shown as "
    "'not available yet'. First scheduled run: 10 Nov 2026."
)

ER_REFERENCE = """erDiagram
    schemes ||--o{ nav_history : "scheme_id"
    schemes ||--o{ scheme_ter : "scheme_id"
    schemes ||--o{ scheme_aaum : "scheme_id"
    schemes ||--o{ scheme_rankings : "scheme_id"
    schemes ||--o{ scheme_fund_managers : "scheme_id"
    schemes ||--o{ folios : "scheme_id"
    schemes {
        uuid id PK
        string amfi_code UK "join key for AAUM, nullable"
        string ter_scheme_code "exact join key for TER"
        string base_name "AMFI plan-stripped name"
        enum plan_type "AMFI master's own Direct/Regular"
    }
    nav_history {
        uuid scheme_id PK
        date date PK
        numeric nav
    }
    scheme_ter {
        uuid scheme_id PK
        date reference_period PK
        numeric ter_value "NULL = no usable TER"
    }
    scheme_aaum {
        uuid scheme_id PK
        date reference_period PK
        numeric aaum_value
    }
    scheme_rankings {
        uuid scheme_id PK
        timestamptz computed_at PK
        numeric composite_score
        int category_rank
    }
    scheme_fund_managers {
        uuid id PK
        uuid scheme_id FK
        string manager_name
        date reference_period
    }
    folios {
        uuid id PK
        uuid scheme_id FK "decides which schemes are 'held'"
    }
    benchmark_index_history {
        enum index_name PK
        date date PK
        enum return_type PK "price or tri"
        numeric value
    }"""
