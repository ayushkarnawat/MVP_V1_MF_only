import { describe, expect, it } from "vitest";
import type {
  AllocationSlice, AssetTypeSlice, CategoryReturnsResponse, CategorySeriesResponse, CompositionResponse, CurrentCells,
  CurrentReturnsResponse, EvidenceItem, ExpenseRatio, Fact, FolioInfo, FolioNumberResponse, HoldingRowOut,
  HoldingsListResponse, InceptionCells, InceptionReturnsResponse, InsightsResponse, ManagerOut, ManagerResponse,
  MemberRef, PerformanceResponse, PeriodBucket, PeriodReturnsResponse, RiskMetric, RiskResponse, RollingPoint,
  RollingResponse, SchemeInfo, ScatterPointOut, ScatterResponse, ScoreResponse, SeriesPoint, SummaryDetails,
  SummaryResponse, SummaryTiles, TopHolding, Unavailable,
} from "../types";
import { FIXTURE_NAMES, IDS, fixture } from "./index";
import { type Schema, anything, arr, bool, either, lit, nullable, num, obj, optional, str } from "./schema";

// The contract guard: every spec fixture must match the contract types field for field. When the real golden
// files replace these, this test is what tells us the backend and types.ts still agree.
const nstr = nullable(str);
const unavailable: Schema<Unavailable> = obj<Unavailable>({ status: lit("unavailable"), reason: str });
const tone = nullable(lit("pos", "warn", "neg", "info", "neu"));
const point: Schema<SeriesPoint> = obj<SeriesPoint>({ date: str, pct: str });
const memberRef: Schema<MemberRef> = obj<MemberRef>({ id: str, name: str });
const folio: Schema<FolioInfo> = obj<FolioInfo>({ folio_id: str, member_id: str, member_name: str, folio_masked: str });
const expense: Schema<ExpenseRatio> = obj<ExpenseRatio>({ value: str, reference_period: str, plan: str });
const scheme: Schema<SchemeInfo> = obj<SchemeInfo>({ id: str, name: str, plan: str, category: str, amc_name: str });
const tiles: Schema<SummaryTiles> = obj<SummaryTiles>({
  current_value: nstr, share_of_portfolio_pct: nstr, invested: nstr, total_gain: nstr, total_gain_pct: nstr, xirr: nstr,
  expense_ratio: nullable(expense),
});
const details: Schema<SummaryDetails> = obj<SummaryDetails>({
  units: nstr, average_nav: nstr, current_nav: nstr, invested: nstr, current_value: nstr, gain: nstr, gain_pct: nstr,
  xirr: nstr, first_investment: nstr, last_investment: nstr, opening_lot: anything, folios: arr(folio),
});
const summary: Schema<SummaryResponse> = obj<SummaryResponse>({
  status: lit("ready"), scope: str, held: bool, held_by_other_members: arr(memberRef), nav_as_of: str, nav_stale: bool,
  has_history: bool, scheme, tiles, details,
});
const folioNumber: Schema<FolioNumberResponse> = obj<FolioNumberResponse>({ status: lit("ready"), folio_id: str, folio_number: str });
const periods = lit("1M", "3M", "6M", "1Y", "3Y", "5Y", "All");
const performance: Schema<PerformanceResponse> = obj<PerformanceResponse>({
  status: lit("ready"), scheme_id: str, period: periods, start: str, end: str, clamped: bool, since_launch: bool, fund: arr(point),
  benchmark_index: nstr, benchmark_label: nstr, benchmark: nullable(arr(point)), benchmark_reason: nstr,
  period_returns: obj<{ fund: string | null; benchmark: string | null }>({ fund: nstr, benchmark: nstr }),
});
const inceptionCells: Schema<InceptionCells> = obj<InceptionCells>({
  "1M": nstr, "3M": nstr, "6M": nstr, "1Y": nstr, "3Y": nstr, "5Y": nstr, since_inception: nstr,
});
const currentCells: Schema<CurrentCells> = obj<CurrentCells>({ "1Y": nstr, "3Y": nstr, "5Y": nstr, since_first_investment: nstr });
const inceptionReturns: Schema<InceptionReturnsResponse> = obj<InceptionReturnsResponse>({
  status: lit("ready"), mode: lit("inception"), columns: arr(lit("1M", "3M", "6M", "1Y", "3Y", "5Y", "since_inception")),
  rows: obj<InceptionReturnsResponse["rows"]>({ fund: inceptionCells, benchmark: nullable(inceptionCells) }), benchmark_reason: nstr,
  benchmark_label: optional(nstr),
});
const currentReturns: Schema<CurrentReturnsResponse> = obj<CurrentReturnsResponse>({
  status: lit("ready"), mode: lit("current"), columns: arr(lit("1Y", "3Y", "5Y", "since_first_investment")),
  rows: obj<CurrentReturnsResponse["rows"]>({ holding_xirr: currentCells, benchmark_same_flows: nullable(currentCells) }), benchmark_reason: nstr,
  benchmark_label: optional(nstr),
});
const metric: Schema<RiskMetric> = obj<RiskMetric>({ value: nstr, band: nstr, tone });
const risk: Schema<RiskResponse> = obj<RiskResponse>({
  status: lit("ready"), scheme_id: str, window_start: str, window_end: str, points: num, life_window: bool, risk_free_rate: str,
  volatility: metric, max_drawdown: metric, sharpe: metric, beta: metric, beta_reason: nstr,
});
const top: Schema<TopHolding> = obj<TopHolding>({ name: str, isin: str, sector: str, weight: str });
const slice: Schema<AllocationSlice> = obj<AllocationSlice>({ label: str, pct: str });
const assetSlice: Schema<AssetTypeSlice> = obj<AssetTypeSlice>({ key: str, label: str, pct: str });
const composition: Schema<CompositionResponse> = obj<CompositionResponse>({
  status: lit("ready"), scheme_id: str, holdings_as_of: str, age_tag: nstr, stock_count: num, top10: arr(top),
  allocation: obj<CompositionResponse["allocation"]>({ market_cap: arr(slice), sector: arr(slice), asset_type: arr(assetSlice) }),
  unclassified_pct: str,
});
const holdingRow: Schema<HoldingRowOut> = obj<HoldingRowOut>({ name: str, isin: str, sector: str, asset_type: str, weight: str });
const holdings: Schema<HoldingsListResponse> = obj<HoldingsListResponse>({
  status: lit("ready"), scheme_id: str, holdings_as_of: str, age_tag: nstr, count: num, rows: arr(holdingRow),
});
const managerOut: Schema<ManagerOut> = obj<ManagerOut>({ name: str, role: str, managing_since: str, tenure_years: str });
const manager: Schema<ManagerResponse> = obj<ManagerResponse>({
  status: lit("ready"), scheme_id: str, reference_period: str, details_available: bool, managers: arr(managerOut),
});
const score: Schema<ScoreResponse> = obj<ScoreResponse>({
  status: lit("ready"), source: lit("stored", "computed"), computed_at: str, scheme_id: str, scheme_name: str,
  category_unavailable: bool, insufficient_history: bool, thin_category: bool, risk_adjusted_tier: nullable(num),
  cost_adjustment: nstr, final_score: nstr, return_percentile: nstr, risk_percentile: nstr, consistency_hit_rate: nstr,
  scheme_return: nstr, category_avg_return: nstr, downside_deviation: nstr, category_avg_downside_deviation: nstr,
  consistency_hits: nullable(num), consistency_total_windows: nullable(num),
});
const categorySeries: Schema<CategorySeriesResponse> = obj<CategorySeriesResponse>({
  status: lit("ready"), period: periods, granularity: lit("daily", "month_end"), category: str, peers_used: num,
  peers_total: num, thin_category: bool, points: arr(point),
});
const peersUsed = obj<CategoryReturnsResponse["peers_used"]>({
  "1M": num, "3M": num, "6M": num, "1Y": num, "3Y": num, "5Y": num, since_inception: num,
});
const categoryReturns: Schema<CategoryReturnsResponse> = obj<CategoryReturnsResponse>({
  status: lit("ready"), columns: arr(lit("1M", "3M", "6M", "1Y", "3Y", "5Y", "since_inception")), category: inceptionCells,
  peers_used: peersUsed, thin_category: bool,
});
const rollingPoint: Schema<RollingPoint> = obj<RollingPoint>({ date: str, fund: nstr, benchmark: nstr, category: nstr });
const rolling: Schema<RollingResponse> = obj<RollingResponse>({ status: lit("ready"), window_years: lit(1, 3, 5), points: arr(rollingPoint) });
const bucket: Schema<PeriodBucket> = obj<PeriodBucket>({ label: str, start: str, end: str, fund: nstr, benchmark: nstr, category: nstr });
const periodReturns: Schema<PeriodReturnsResponse> = obj<PeriodReturnsResponse>({
  status: lit("ready"), period: periods, bucket: lit("week", "month", "quarter", "year"), buckets: arr(bucket),
});
const scatterPoint: Schema<ScatterPointOut> = obj<ScatterPointOut>({ scheme_id: str, name: str, return_pct: str, volatility_pct: str, is_fund: bool, held: optional(bool) });
const scatter: Schema<ScatterResponse> = obj<ScatterResponse>({
  status: lit("ready"), window_start: str, window_end: str, thin_category: bool, peer_volatility_median: nstr, points: arr(scatterPoint),
});
const evidence: Schema<EvidenceItem> = obj<EvidenceItem>({ label: str, value: str });
const fact: Schema<Fact> = obj<Fact>({
  id: str, list: lit("key", "strength", "consideration"), tone: lit("pos", "warn", "neg", "info", "neu"), text: str, evidence: arr(evidence), priority: num,
});
const insights: Schema<InsightsResponse> = obj<InsightsResponse>({
  status: lit("ready"), key: arr(fact), strengths: arr(fact), considerations: arr(fact), top_three: arr(fact),
});

const SCHEMAS: Record<string, Schema<unknown>> = {
  summary_family: summary, summary_member: summary, summary_not_held: summary, summary_cas_only: summary,
  folio_number: folioNumber,
  performance_1y_equity: performance, performance_1y_debt_no_benchmark: performance, performance_all_young_fund: performance,
  returns_inception: inceptionReturns, returns_current: currentReturns, returns_current_not_held: unavailable,
  risk_equity: risk, risk_life_window: risk, risk_no_history: unavailable,
  composition, composition_no_disclosure: unavailable, holdings_all: holdings,
  manager, manager_none: unavailable,
  score_stored: score, score_computed: score,
  peers_series_1y: categorySeries, peers_returns: categoryReturns, peers_unavailable: unavailable,
  rolling_3y: rolling, rolling_no_history: unavailable,
  period_returns_1y: periodReturns, period_returns_5y: periodReturns,
  scatter, scatter_thin: scatter,
  insights_full: insights, insights_sparse: insights,
};

describe("Individual Fund spec fixtures", () => {
  it("has the 32 files named in Appendix A.3 (the three Overlap-tab files excluded)", () => {
    expect(FIXTURE_NAMES).toHaveLength(32);
    expect(FIXTURE_NAMES).toEqual(Object.keys(SCHEMAS).sort());
    expect(FIXTURE_NAMES).not.toContain("overlap_fund");
  });

  it("throws for a name that does not exist", () => {
    expect(() => fixture("nope")).toThrow("unknown Individual Fund fixture: nope");
  });

  it("returns a copy, so a test can change it without affecting another", () => {
    const first = fixture<SummaryResponse>("summary_family");
    first.tiles.current_value = "changed";
    expect(fixture<SummaryResponse>("summary_family").tiles.current_value).toBe("2250.00");
  });

  it.each(FIXTURE_NAMES)("%s matches its contract type field for field", name => {
    expect(SCHEMAS[name].check(fixture(name), name)).toEqual([]);
  });

  it("the validator rejects a missing field, an extra field and a wrong type", () => {
    const body = fixture<Record<string, unknown>>("folio_number");
    const missing = { ...body } as Record<string, unknown>; delete missing.folio_number;
    expect(folioNumber.check(missing, "x")).toEqual(["x.folio_number: missing"]);
    expect(folioNumber.check({ ...body, extra: 1 }, "x")).toEqual(["x.extra: not in the contract"]);
    expect(folioNumber.check({ ...body, folio_number: 5 }, "x")).toEqual(["x.folio_number: expected string, got number"]);
    expect(either(folioNumber, unavailable).check({ status: "unavailable", reason: "x" }, "x")).toEqual([]);
  });

  it("every unavailable body is exactly status and reason, one of the stable reason codes", () => {
    const reasons: Record<string, string> = {
      returns_current_not_held: "not_held", risk_no_history: "no_history", composition_no_disclosure: "no_disclosure",
      manager_none: "no_manager_data", peers_unavailable: "peers_unavailable", rolling_no_history: "no_history",
    };
    for (const [name, reason] of Object.entries(reasons)) expect(fixture(name)).toEqual({ status: "unavailable", reason });
  });

  it("serialises money, units, NAV and percentages as strings and dates as ISO text", () => {
    const body = fixture<SummaryResponse>("summary_family");
    for (const value of [body.tiles.current_value, body.tiles.invested, body.tiles.total_gain, body.details.units, body.details.current_nav]) {
      expect(typeof value).toBe("string");
    }
    expect(body.nav_as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fixture<ScoreResponse>("score_stored").computed_at).toMatch(/Z$/);
  });

  it("the family summary is hand-checkable: 150 units, 1,600 in, 2,250 now, a 650 gain, the two folios named", () => {
    const body = fixture<SummaryResponse>("summary_family");
    expect(body.scheme.id).toBe(IDS.scheme);
    expect(body.tiles).toMatchObject({ current_value: "2250.00", invested: "1600.00", total_gain: "650.00", total_gain_pct: "40.6250", xirr: "0.185300" });
    expect(body.details.units).toBe("150.000");
    expect(body.details.folios.map(f => f.folio_masked)).toEqual(["XXXXX9183", "XXXXX5678"]);
    const member = fixture<SummaryResponse>("summary_member");
    expect(member.scope).toBe(IDS.asha);
    expect(member.tiles.current_value).toBe("1500.00");
    expect(member.details.folios).toHaveLength(1);
  });

  it("the not-held summary has every personal field null but keeps the scheme and the expense ratio", () => {
    const body = fixture<SummaryResponse>("summary_not_held");
    expect(body.held).toBe(false);
    expect(body.held_by_other_members.map(m => m.name)).toEqual(["ASHA RAO", "Dev Rao"]);
    expect(Object.entries(body.tiles).filter(([key]) => key !== "expense_ratio").every(([, value]) => value === null)).toBe(true);
    expect(body.tiles.expense_ratio?.value).toBe("0.62");
    expect(body.details.folios).toEqual([]);
    expect(body.details.units).toBeNull();
  });

  it("the series fixtures start at 0.0000 and end at the legend figure", () => {
    for (const name of ["performance_1y_equity", "performance_1y_debt_no_benchmark", "performance_all_young_fund"]) {
      const body = fixture<PerformanceResponse>(name);
      expect(body.fund[0].pct).toBe("0.0000");
      expect(body.fund.at(-1)!.pct).toBe(body.period_returns.fund);
      if (body.benchmark) expect(body.benchmark.at(-1)!.pct).toBe(body.period_returns.benchmark);
    }
    expect(fixture<PerformanceResponse>("performance_1y_debt_no_benchmark").benchmark_reason).toBe("no_benchmark");
    expect(fixture<PerformanceResponse>("performance_all_young_fund").since_launch).toBe(true);
    const peers = fixture<CategorySeriesResponse>("peers_series_1y");
    expect(peers.points.at(-1)!.pct).toBe("13.1000");
    expect(peers.points.map(p => p.date)).toEqual(fixture<PerformanceResponse>("performance_1y_equity").fund.map(p => p.date));
  });

  it("the insight lists never repeat an id inside one list and top_three is drawn from the lists", () => {
    const body = fixture<InsightsResponse>("insights_full");
    const known = new Set([...body.key, ...body.strengths, ...body.considerations].map(f => f.id));
    expect(body.top_three.every(f => known.has(f.id))).toBe(true);
    expect(new Set(body.key.map(f => f.id)).size).toBe(body.key.length);
    expect(fixture<InsightsResponse>("insights_sparse")).toMatchObject({ strengths: [], considerations: [] });
  });

  it("the composition weights add up: top 10 is in descending order and the asset types total 100", () => {
    const body = fixture<CompositionResponse>("composition");
    const weights = body.top10.map(h => Number(h.weight));
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
    expect(body.allocation.asset_type.reduce((sum, s) => sum + Number(s.pct), 0)).toBeCloseTo(100, 4);
    expect(body.allocation.market_cap.reduce((sum, s) => sum + Number(s.pct), 0)).toBeCloseTo(100, 4);
    const all = fixture<HoldingsListResponse>("holdings_all");
    expect(all.count).toBe(all.rows.length);
  });

  it("test_additive_fields_are_optional: the validator accepts a missing optional field, checks a present one, and the returns fixtures omit benchmark_label", () => {
    const point = obj<{ id: string; held?: boolean }>({ id: str, held: optional(bool) });
    expect(point.check({ id: "a" }, "p")).toEqual([]);
    expect(point.check({ id: "a", held: true }, "p")).toEqual([]);
    expect(point.check({ id: "a", held: "yes" }, "p")).toEqual(["p.held: expected boolean, got string"]);
    expect(point.check({ id: "a", other: 1 }, "p")).toEqual(["p.other: not in the contract"]);
    expect(fixture("returns_inception")).not.toHaveProperty("benchmark_label");
    expect(fixture("returns_current")).not.toHaveProperty("benchmark_label");
  });

  it("the scatter fixtures carry the additive held flag: the fund's own dot is held, exactly one peer is held, the others are not", () => {
    for (const name of ["scatter", "scatter_thin"]) {
      const body = fixture<ScatterResponse>(name);
      expect(body.points.every(p => typeof p.held === "boolean")).toBe(true);
      expect(body.points.filter(p => p.is_fund).every(p => p.held)).toBe(true);
      expect(body.points.filter(p => !p.is_fund && p.held)).toHaveLength(1);
    }
  });
});
