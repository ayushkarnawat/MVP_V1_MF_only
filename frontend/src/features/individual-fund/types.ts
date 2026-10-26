// Contract types for the Individual Fund page API (GET /fund-page/{scheme_id}/...).
// Source: Docs/orchestration/ui-redesign-IB-individual-fund-backend-handoff.md, Appendix A.1.
// SPEC FIXTURE STATUS: the backend is not built yet. These types and the JSON files in ./fixtures are
// written from the Appendix, not from real output. They are orchestrator-owned: never edit them. When the
// real golden fixtures (backend/tests/fixtures/fund/*.json) exist they replace the files here and
// fixtures/fixtures.test.ts is the guard that compares them against these types.
//
// Conventions: every ready body has status "ready"; an unavailable body is exactly
// { status: "unavailable", reason } (HTTP 200). Money, units, NAV and percent values are strings. Percent
// values are percent numbers ("18.2000" is 18.2 percent) except `xirr` fields, which are fractions
// ("0.185300" is 18.53 percent), exactly as the Dashboard serialises them. Dates are ISO text.

export type Tone = "pos" | "warn" | "neg" | "info" | "neu";

/** A scope is the word "combined" or a household member id. */
export type FundScope = string;

export interface Unavailable {
  status: "unavailable";
  reason: string;
}

export type PerformancePeriod = "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y" | "All";
export type ReturnsMode = "inception" | "current";
export type RollingWindow = 1 | 3 | 5;
export type PeriodReturnsPeriod = "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y" | "All";

export interface SeriesPoint {
  date: string;
  pct: string;
}

// ---- 1. summary ----------------------------------------------------------------------------------------

export interface SchemeInfo {
  id: string;
  name: string;
  plan: string;
  category: string;
  amc_name: string;
}

export interface MemberRef {
  id: string;
  name: string;
}

export interface FolioInfo {
  folio_id: string;
  member_id: string;
  member_name: string;
  folio_masked: string;
}

export interface ExpenseRatio {
  value: string;
  reference_period: string;
  plan: string;
}

export interface SummaryTiles {
  current_value: string | null;
  share_of_portfolio_pct: string | null;
  invested: string | null;
  total_gain: string | null;
  total_gain_pct: string | null;
  xirr: string | null;
  expense_ratio: ExpenseRatio | null;
}

export interface SummaryDetails {
  units: string | null;
  average_nav: string | null;
  current_nav: string | null;
  invested: string | null;
  current_value: string | null;
  gain: string | null;
  gain_pct: string | null;
  xirr: string | null;
  first_investment: string | null;
  last_investment: string | null;
  opening_lot: unknown;
  folios: FolioInfo[];
}

export interface SummaryResponse {
  status: "ready";
  scope: string;
  held: boolean;
  held_by_other_members: MemberRef[];
  nav_as_of: string;
  nav_stale: boolean;
  has_history: boolean;
  scheme: SchemeInfo;
  tiles: SummaryTiles;
  details: SummaryDetails;
}

// ---- 2. folio number -----------------------------------------------------------------------------------

export interface FolioNumberResponse {
  status: "ready";
  folio_id: string;
  folio_number: string;
}

// ---- 3. performance ------------------------------------------------------------------------------------

export interface PerformanceResponse {
  status: "ready";
  scheme_id: string;
  period: PerformancePeriod;
  start: string;
  end: string;
  clamped: boolean;
  since_launch: boolean;
  fund: SeriesPoint[];
  benchmark_index: string | null;
  benchmark_label: string | null;
  benchmark: SeriesPoint[] | null;
  benchmark_reason: string | null;
  period_returns: { fund: string | null; benchmark: string | null };
}

// ---- 4. returns ----------------------------------------------------------------------------------------

export type InceptionColumn = "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y" | "since_inception";
export type CurrentColumn = "1Y" | "3Y" | "5Y" | "since_first_investment";
export type InceptionCells = Record<InceptionColumn, string | null>;
export type CurrentCells = Record<CurrentColumn, string | null>;

export interface InceptionReturnsResponse {
  status: "ready";
  mode: "inception";
  columns: InceptionColumn[];
  rows: { fund: InceptionCells; benchmark: InceptionCells | null };
  benchmark_reason: string | null;
}

export interface CurrentReturnsResponse {
  status: "ready";
  mode: "current";
  columns: CurrentColumn[];
  rows: { holding_xirr: CurrentCells; benchmark_same_flows: CurrentCells | null };
  benchmark_reason: string | null;
}

export type ReturnsResponse = InceptionReturnsResponse | CurrentReturnsResponse;

// ---- 5. risk -------------------------------------------------------------------------------------------

export interface RiskMetric {
  value: string | null;
  band: string | null;
  tone: Tone | null;
}

export interface RiskResponse {
  status: "ready";
  scheme_id: string;
  window_start: string;
  window_end: string;
  points: number;
  life_window: boolean;
  risk_free_rate: string;
  volatility: RiskMetric;
  max_drawdown: RiskMetric;
  sharpe: RiskMetric;
  beta: RiskMetric;
  beta_reason: string | null;
}

// ---- 6 and 7. composition and all holdings ----------------------------------------------------------------

export interface TopHolding {
  name: string;
  isin: string;
  sector: string;
  weight: string;
}

export interface AllocationSlice {
  label: string;
  pct: string;
}

export interface AssetTypeSlice {
  key: string;
  label: string;
  pct: string;
}

export interface CompositionResponse {
  status: "ready";
  scheme_id: string;
  holdings_as_of: string;
  age_tag: string | null;
  stock_count: number;
  top10: TopHolding[];
  allocation: { market_cap: AllocationSlice[]; sector: AllocationSlice[]; asset_type: AssetTypeSlice[] };
  unclassified_pct: string;
}

export interface HoldingRowOut {
  name: string;
  isin: string;
  sector: string;
  asset_type: string;
  weight: string;
}

export interface HoldingsListResponse {
  status: "ready";
  scheme_id: string;
  holdings_as_of: string;
  age_tag: string | null;
  count: number;
  rows: HoldingRowOut[];
}

// ---- 8. manager ----------------------------------------------------------------------------------------

export interface ManagerOut {
  name: string;
  role: string;
  managing_since: string;
  tenure_years: string;
}

export interface ManagerResponse {
  status: "ready";
  scheme_id: string;
  reference_period: string;
  details_available: boolean;
  managers: ManagerOut[];
}

// ---- 9. score ------------------------------------------------------------------------------------------

export interface ScoreResponse {
  status: "ready";
  source: "stored" | "computed";
  computed_at: string;
  scheme_id: string;
  scheme_name: string;
  category_unavailable: boolean;
  insufficient_history: boolean;
  thin_category: boolean;
  risk_adjusted_tier: number | null;
  cost_adjustment: string | null;
  final_score: string | null;
  return_percentile: string | null;
  risk_percentile: string | null;
  consistency_hit_rate: string | null;
  scheme_return: string | null;
  category_avg_return: string | null;
  downside_deviation: string | null;
  category_avg_downside_deviation: string | null;
  consistency_hits: number | null;
  consistency_total_windows: number | null;
}

// ---- 10 to 14. peers (tier 3) ----------------------------------------------------------------------------

export interface CategorySeriesResponse {
  status: "ready";
  period: PerformancePeriod;
  granularity: "daily" | "month_end";
  category: string;
  peers_used: number;
  peers_total: number;
  thin_category: boolean;
  points: SeriesPoint[];
}

export interface CategoryReturnsResponse {
  status: "ready";
  columns: InceptionColumn[];
  category: InceptionCells;
  peers_used: Record<InceptionColumn, number>;
  thin_category: boolean;
}

export interface RollingPoint {
  date: string;
  fund: string | null;
  benchmark: string | null;
  category: string | null;
}

export interface RollingResponse {
  status: "ready";
  window_years: RollingWindow;
  points: RollingPoint[];
}

export interface PeriodBucket {
  label: string;
  start: string;
  end: string;
  fund: string | null;
  benchmark: string | null;
  category: string | null;
}

export interface PeriodReturnsResponse {
  status: "ready";
  period: PeriodReturnsPeriod;
  bucket: "week" | "month" | "quarter" | "year";
  buckets: PeriodBucket[];
}

export interface ScatterPointOut {
  scheme_id: string;
  name: string;
  return_pct: string;
  volatility_pct: string;
  is_fund: boolean;
}

export interface ScatterResponse {
  status: "ready";
  window_start: string;
  window_end: string;
  thin_category: boolean;
  peer_volatility_median: string | null;
  points: ScatterPointOut[];
}

// ---- 15. insights --------------------------------------------------------------------------------------

export interface EvidenceItem {
  label: string;
  value: string;
}

export interface Fact {
  id: string;
  list: "key" | "strength" | "consideration";
  tone: Tone;
  text: string;
  evidence: EvidenceItem[];
  priority: number;
}

export interface InsightsResponse {
  status: "ready";
  key: Fact[];
  strengths: Fact[];
  considerations: Fact[];
  top_three: Fact[];
}
