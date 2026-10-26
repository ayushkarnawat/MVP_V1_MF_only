// Contract file for the Portfolio page. Orchestrator-owned: mirrors the pydantic models in
// backend/app/services/dashboard/portfolio_schemas.py (and the Home envelope in app/services/home/schemas.py).
// Every amount and percentage is a plain decimal string, every date is ISO text. The golden JSON responses in
// ./fixtures are the real backend output; fixtures.test.ts fails if a backend field moves.

export interface MissingFund {
  scheme_id: string;
  name: string;
}

export interface MemberOut {
  id: string;
  name: string;
  has_data: boolean;
}

export interface Envelope {
  scope: "aggregate" | "member";
  member_id: string | null;
  nav_as_of: string | null;
  partial: boolean;
  missing_funds: MissingFund[];
  computed_at: string;
}

export interface XirrDisclaimerOut {
  alt_xirr: string | null;
  opening_cost_share: string;
}

export interface InstrumentBucket {
  label: string;
  status: "live" | "coming_soon";
  current_value: string | null;
  percentage: string | null;
  invested: string | null;
  gain_loss: string | null;
  /** A decimal fraction ("0.3489" is 34.89 percent), not a percentage. */
  xirr: string | null;
}

export interface PortfolioAllocationResponse extends Envelope {
  members: MemberOut[] | null;
  buckets: InstrumentBucket[];
}

export interface PortfolioSummaryResponse extends Envelope {
  members: MemberOut[] | null;
  total_value: string;
  total_invested: string;
  unrealized_gain: string;
  unrealized_pct: string | null;
  realized_gain: string;
  today_gain: string;
  today_pct: string | null;
  previous_nav_date: string | null;
  /** Decimal fractions, like InstrumentBucket.xirr. */
  lifetime_xirr: string | null;
  current_holdings_xirr: string | null;
  lifetime_xirr_disclaimer: XirrDisclaimerOut | null;
  current_holdings_xirr_disclaimer: XirrDisclaimerOut | null;
}

export interface ValuePoint {
  date: string;
  value: string;
}

export interface PortfolioValueSeriesResponse extends Envelope {
  members: MemberOut[] | null;
  days: number;
  start: string;
  end: string;
  empty: boolean;
  points: ValuePoint[];
}

export type PortfolioSectionName = "portfolio-summary" | "portfolio-allocation" | "portfolio-value-series";

export interface PortfolioScopeArg {
  viewMode: "aggregate" | "member";
  memberId: string | null;
}

/** One row of the Family Members card: a household member and the total value of that member's portfolio. */
export interface MemberValue {
  id: string;
  name: string;
  value: string;
}
