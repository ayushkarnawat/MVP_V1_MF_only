// Home API contract (orchestrator-owned: do not edit). Mirrors backend/app/services/home/schemas.py
// (HB5 handoff, Task 0). Money and percentages are decimal STRINGS; dates are ISO "YYYY-MM-DD";
// instants are ISO UTC. Formatting is the front end's job (format.ts, homeFormat.ts).

export type HomeScopeKind = "aggregate" | "member";
export type HomePeriod = "1D" | "1W" | "1M" | "1Y" | "custom";
export type MoversView = "sector" | "category" | "fund";
export type HomeSectionName = "summary" | "wealth-series" | "allocation" | "movers" | "worth-a-look" | "benchmarks" | "news";

export interface HomeScopeArg {
  viewMode: HomeScopeKind;
  memberId: string | null;
}

export interface MissingFund { scheme_id: string; name: string }

export interface Envelope {
  scope: HomeScopeKind;
  member_id: string | null;
  nav_as_of: string | null;
  partial: boolean;
  missing_funds: MissingFund[];
  computed_at: string;
}

export interface MemberOut { id: string; name: string; has_data: boolean }

export interface SummaryResponse extends Envelope {
  display_name: string;
  greeting: "morning" | "afternoon" | "evening";
  scope_label: string;
  change_amount: string;
  change_pct: string | null;
  direction: "up" | "down" | "flat";
  status_phrase: string;
  since_label: string;
  since_date: string | null;
  top_contributor: string | null;
  top_contributor_scheme_id?: string | null;
  members_connected: number;
  members_total: number;
  data_line: string | null;
  has_holdings: boolean;
  total_value: string;
  members: MemberOut[];
}

export interface PointOut { date: string; value: string }
export interface BenchmarkPointOut { date: string; pct: string }
export interface BenchmarkSeriesOut {
  index: string;
  label: string;
  available: boolean;
  pct: string | null;
  effective_start: string | null;
  clipped: boolean;
  points: BenchmarkPointOut[];
}
export interface WealthSeriesResponse extends Envelope {
  period: HomePeriod;
  start: string;
  end: string;
  clamped: boolean;
  empty: boolean;
  points: PointOut[];
  start_value: string;
  end_value: string;
  net_contributions: string;
  change_amount: string;
  change_pct: string | null;
  change_method: "price_only" | "modified_dietz";
  benchmark: BenchmarkSeriesOut | null;
}

export interface ClassRowOut {
  key: string;
  label: string;
  status: "live" | "coming_soon";
  value: string | null;
  percentage: string | null;
}
export interface MemberShareOut { id: string; name: string; value: string; percentage: string }
export interface AllocationResponse extends Envelope {
  source: "analytics" | "dashboard_buckets";
  approximate: boolean;
  total_value: string;
  classes: ClassRowOut[];
  covered_pct: string | null;
  mix_as_of: string | null;
  members: MemberShareOut[] | null;
}

export interface MoverFundOut { scheme_id: string; name: string; change: string | null }
export interface MoverBarOut { key: string; label: string; change: string; funds: MoverFundOut[] }
export interface MoversResponse extends Envelope {
  requested_view: MoversView;
  view: MoversView;
  fell_back: boolean;
  estimated: boolean;
  coverage_pct: string | null;
  net_change: string;
  net_pct: string | null;
  previous_value: string;
  previous_nav_date: string | null;
  gains: MoverBarOut[];
  losses: MoverBarOut[];
  others_count: number;
  others_change: string;
}

export interface WorthCardOut {
  kind: "weak_fund" | "underperforming" | "high_expense" | "concentration";
  rank: number;
  scheme_id: string | null;
  scheme_name: string | null;
  evidence: Record<string, unknown>;
}
export interface WorthResponse extends Envelope {
  cards: WorthCardOut[];
  unavailable: string[];
  state: "cards" | "nothing_flagged" | "unavailable";
}

export interface BenchmarkOptionOut { index: string; label: string; recommended: boolean }
export interface BenchmarksResponse extends Envelope {
  options: BenchmarkOptionOut[];
  recommended_index: string;
  reason: string;
}

export interface WealthSeriesQuery {
  period: HomePeriod;
  from?: string;
  to?: string;
  benchmark?: string;
}

// News (backend/app/services/news/schemas.py, merged on leapswitch-redesign). Copy for the card comes from `texts`.
export type NewsKind = "stock" | "fund_category" | "fund_house" | "asset_class" | "sector" | "rates_macro" | "general";
export type NewsIconKey =
  | "banks_financials" | "it_tech" | "pharma_health" | "auto_ev" | "consumer_fmcg" | "energy" | "metals_mining"
  | "realty_infra" | "gold_silver" | "rates_rbi" | "funds_amc" | "markets" | "regulation" | "general";

export interface NewsFundOut { scheme_id: string; name: string; weight_pct?: string | null }
export interface NewsItemOut {
  id: string;
  kind: NewsKind;
  tier: number;
  specific: boolean;
  source: string;
  headline: string;
  url: string;
  published_at: string;
  icon_key: NewsIconKey;
  entity_label: string | null;
  reason: string;
  exposure_pct: string | null;
  exposure_text: string | null;
  exposure_as_of: string | null;
  funds: NewsFundOut[];
}
export interface NewsTextsOut {
  title: string;
  subtext: string;
  disclaimer: string;
  about_credit_text: string;
  about_credit_url: string;
}
export interface NewsResponse extends Envelope {
  enabled: boolean;
  state: "items" | "empty" | "hidden" | "disabled";
  feed_as_of: string | null;
  stale: boolean;
  hidden: boolean;
  texts: NewsTextsOut;
  items: NewsItemOut[];
}
