import enum

from sqlalchemy import Enum


class InvestorType(str, enum.Enum):
    SELF_DIRECTED = "self_directed"
    ADVISOR_ASSISTED = "advisor_assisted"
    MIXED = "mixed"
    BEGINNER = "beginner"


class PrimaryGoal(str, enum.Enum):
    CONSOLIDATED_VIEW = "consolidated_view"
    UNDERSTAND_HOLDINGS = "understand_holdings"
    FAMILY_MANAGEMENT = "family_management"
    PERFORMANCE_COMPARISON = "performance_comparison"


class Relationship(str, enum.Enum):
    SELF = "self"
    SPOUSE = "spouse"
    PARENT = "parent"
    CHILD = "child"
    SIBLING = "sibling"
    OTHER = "other"


class MemberOrigin(str, enum.Enum):
    ONBOARDING = "onboarding"
    MANUAL = "manual"
    CAS_DETECTED = "cas_detected"


class MemberNameSource(str, enum.Enum):
    USER_ENTERED = "user_entered"
    CAS = "cas"
    # Edited in the Complete profile popup; a later CAS applies the normal CAS
    # name rules (mismatch asks, longer variant updates), never the silent
    # replace used for user_entered.
    USER_EDITED = "user_edited"


class MemberPanSource(str, enum.Enum):
    CAS = "cas"
    USER_ENTERED = "user_entered"


class MemberPanConflict(str, enum.Enum):
    # The CAS (or a typed) PAN is held by another Unifolio account, so it
    # can't take the unique pan_lookup_hash here; kept in detected_pan_*.
    OTHER_ACCOUNT = "other_account"


class NameChangeReason(str, enum.Enum):
    CAS_VARIANT = "cas_variant"
    USER_CORRECTED_TO_CAS = "user_corrected_to_cas"
    USER_EDIT = "user_edit"


class ImportStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    FAILED = "failed"
    NOT_STARTED = "not_started"
    REQUESTING_CAS = "requesting_cas"
    WAITING_FOR_USER = "waiting_for_user"
    UPLOAD_STARTED = "upload_started"
    PASSWORD_REQUIRED = "password_required"
    VALIDATION_FAILED = "validation_failed"
    PROCESSING = "processing"
    RETRY_PENDING = "retry_pending"
    IMPORT_SUCCESSFUL = "import_successful"
    IMPORT_FAILED = "import_failed"
    EXPIRED = "expired"


class SourceCasType(str, enum.Enum):
    CAMS = "cams"
    KFINTECH = "kfintech"


class ImportErrorType(str, enum.Enum):
    WRONG_PASSWORD = "wrong_password"
    SCANNED_PDF = "scanned_pdf"
    WRONG_CAS_TYPE = "wrong_cas_type"
    GENERIC = "generic"


class PlanNameVariant(str, enum.Enum):
    DIRECT = "direct"
    REGULAR = "regular"
    UNRESOLVED = "unresolved"


class PlanType(str, enum.Enum):
    DIRECT = "direct"
    REGULAR = "regular"
    UNCLASSIFIED = "unclassified"


class TransactionType(str, enum.Enum):
    PURCHASE = "purchase"
    PURCHASE_SIP = "purchase_sip"
    REDEMPTION = "redemption"
    SWITCH_IN = "switch_in"
    SWITCH_OUT = "switch_out"
    DIVIDEND_PAYOUT = "dividend_payout"
    DIVIDEND_REINVEST = "dividend_reinvest"
    SEGREGATION = "segregation"
    STT = "stt"
    STAMP_DUTY = "stamp_duty"
    MISC = "misc"
    OPENING_BALANCE = "opening_balance"


class BenchmarkIndex(str, enum.Enum):
    NIFTY_50 = "nifty_50"
    NIFTY_500 = "nifty_500"
    NIFTY_LARGEMIDCAP_250 = "nifty_largemidcap_250"
    NIFTY_MIDCAP_150 = "nifty_midcap_150"


class ArnStatus(str, enum.Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    INVALID = "invalid"
    UNRESOLVED = "unresolved"


class AuthIdentityProvider(str, enum.Enum):
    PHONE_OTP = "phone_otp"
    EMAIL_OTP = "email_otp"
    GOOGLE = "google"
    EMAIL_PASSWORD = "email_password"  # kept, unused going forward — Postgres enums can't cheaply drop a value (remove-password-auth handoff spec §2)


class ConsentDocumentType(str, enum.Enum):
    TERMS_OF_SERVICE = "terms_of_service"
    PRIVACY_POLICY = "privacy_policy"
    PAN_DISCLAIMER = "pan_disclaimer"


class ConsentAction(str, enum.Enum):
    GIVEN = "given"
    WITHDRAWN = "withdrawn"


class ConsentPurpose(str, enum.Enum):
    SERVICE_AGREEMENT = "service_agreement"
    ACCOUNT_AND_AUTHENTICATION = "account_and_authentication"
    PORTFOLIO_TRACKING_ANALYTICS = "portfolio_tracking_analytics"
    CAS_PAN_PROCESSING = "cas_pan_processing"


def enum_column(enum_cls: type[enum.Enum]) -> Enum:
    """SQLAlchemy Enum that persists the member's lowercase ``.value``.

    Without ``values_callable`` SQLAlchemy stores the member NAME ('PURCHASE'),
    but the schema doc — and the raw partitioned-table CHECK constraint in
    migration 0001 — both specify lowercase values ('purchase').
    """
    return Enum(enum_cls, values_callable=lambda e: [m.value for m in e])
