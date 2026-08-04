import enum


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


class ImportStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    FAILED = "failed"


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
