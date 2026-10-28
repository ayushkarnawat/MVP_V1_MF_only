import { describe, expect, it } from "vitest";
import type {
  AllocationSlice, AssetTypeSlice, CategoryReturnsResponse, CategorySeriesResponse, CompareCommonHolding, CompareFund,
  CompareMarketCap, CompareUniqueHolding, CompositionResponse, CurrentCells, CurrentReturnsResponse, EvidenceItem,
  ExpenseRatio, Fact, FolioInfo, FolioNumberResponse, HoldingRowOut, HoldingsListResponse, ImpactAmount, InceptionCells,
  InceptionReturnsResponse, InsightsResponse, ManagerOut, ManagerResponse, MemberRef, OverlapCommonHolding,
  OverlapCompareResponse, OverlapDistribution, OverlapFundRef, OverlapResponse, OverlapSector, OverlapSectorStock,
  OverlapTopFund, PerformanceResponse, PeriodBucket, PeriodReturnsResponse, RiskMetric, RiskResponse, RollingPoint,
  RollingResponse, SchemeInfo, ScatterPointOut, ScatterResponse, ScoreResponse, SeriesPoint, SummaryDetails,
  SummaryResponse, SummaryTiles, TopHolding, Unavailable,
} from "../types";
import { FIXTURE_NAMES, IDS, fixture } from "./index";
import { type Schema, anything, arr, bool, either, lit, nullable, num, obj, optional, str } from "./schema";

// The contract guard: every golden fixture (a byte-identical copy of the backend file) must match the contract types
// field for field. When the backend regenerates a golden, this test is what tells us the backend and types.ts still agree.
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
const holdingRow: Schema<HoldingRowOut> = obj<HoldingRowOut>({ name: str, isin: nstr, sector: str, asset_type: str, weight: str });
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

const fundRef: Schema<OverlapFundRef> = obj<OverlapFundRef>({ scheme_id: str, scheme_name: str });
const distribution: Schema<OverlapDistribution> = obj<OverlapDistribution>({
  unique_to_fund_count: num, common_count: num, unique_to_others_count: num, unique_to_fund_pct: str, common_pct: str, unique_to_others_pct: str,
});
const overlapCommon: Schema<OverlapCommonHolding> = obj<OverlapCommonHolding>({
  isin: str, name: str, sector: str, fund_weight: str, portfolio_weight: str, held_in_funds: arr(fundRef),
});
const sectorStock: Schema<OverlapSectorStock> = obj<OverlapSectorStock>({ isin: str, name: str, weight: str });
const overlapSector: Schema<OverlapSector> = obj<OverlapSector>({ sector: str, pct: str, stocks: arr(sectorStock) });
const topFund: Schema<OverlapTopFund> = obj<OverlapTopFund>({ scheme_id: str, scheme_name: str, overlap_pct: str, common_stock_count: num });
const overlap: Schema<OverlapResponse> = obj<OverlapResponse>({
  status: lit("ready"), scheme_id: str, holdings_as_of: str, overlap_pct: str, common_stock_count: num, total_stock_count: num,
  distribution, common_holdings: arr(overlapCommon), by_sector: arr(overlapSector), top_overlap_funds: arr(topFund),
  coverage: obj<OverlapResponse["coverage"]>({ covered_value_pct: str, funds_without_disclosure: arr(fundRef) }),
});
const compareFund: Schema<CompareFund> = obj<CompareFund>({ scheme_id: str, scheme_name: str, holdings_as_of: str, current_value: str });
const impactAmount: Schema<ImpactAmount> = obj<ImpactAmount>({ amount: str, pct: str });
const compareCommon: Schema<CompareCommonHolding> = obj<CompareCommonHolding>({
  isin: str, name: str, sector: str, weight_a: str, weight_b: str, combined: str,
});
const compareUnique: Schema<CompareUniqueHolding> = obj<CompareUniqueHolding>({ isin: str, name: str, sector: str, weight: str });
const compareCap: Schema<CompareMarketCap> = obj<CompareMarketCap>({ large: str, mid: str, small: str, other: str });
const compare: Schema<OverlapCompareResponse> = obj<OverlapCompareResponse>({
  status: lit("ready"), fund_a: compareFund, fund_b: compareFund, overlap_pct: str,
  counts: obj<OverlapCompareResponse["counts"]>({ unique_a: num, common: num, unique_b: num }),
  impact: obj<OverlapCompareResponse["impact"]>({ common_both: impactAmount, unique_a: impactAmount, unique_b: impactAmount, other_funds: impactAmount }),
  sector_comparison: arr(obj<OverlapCompareResponse["sector_comparison"][number]>({ sector: str, common: str, a: str, b: str })),
  common_holdings: arr(compareCommon),
  unique_holdings: obj<OverlapCompareResponse["unique_holdings"]>({ a: arr(compareUnique), b: arr(compareUnique) }),
  market_cap: obj<OverlapCompareResponse["market_cap"]>({ a: compareCap, b: compareCap }),
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
  overlap_fund: overlap, overlap_compare: compare, overlap_unavailable: unavailable,
};

describe("Individual Fund golden fixtures", () => {
  it("has the 35 files of the backend golden folder (Appendix A.3), the three Overlap-tab files included", () => {
    expect(FIXTURE_NAMES).toHaveLength(35);
    expect(FIXTURE_NAMES).toEqual(Object.keys(SCHEMAS).sort());
    expect(FIXTURE_NAMES).toEqual(expect.arrayContaining(["overlap_fund", "overlap_unavailable", "overlap_compare"]));
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
      overlap_unavailable: "no_disclosure",
    };
    for (const [name, reason] of Object.entries(reasons)) expect(fixture(name)).toEqual({ status: "unavailable", reason });
  });

  it("serialises money, units, NAV and percentages as strings and dates as ISO text", () => {
    const body = fixture<SummaryResponse>("summary_family");
    for (const value of [body.tiles.current_value, body.tiles.invested, body.tiles.total_gain, body.details.units, body.details.current_nav]) {
      expect(typeof value).toBe("string");
    }
    expect(body.nav_as_of).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The stored score carries a UTC "Z" stamp; the computed one carries an explicit +05:30 offset (a real difference between the two).
    expect(fixture<ScoreResponse>("score_stored").computed_at).toMatch(/Z$/);
    expect(fixture<ScoreResponse>("score_computed").computed_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/);
  });

  it("the golden ids are the ones IDS names, so a test can use them without reading a file", () => {
    expect(fixture<SummaryResponse>("summary_family").scheme.id).toBe(IDS.scheme);
    expect(fixture<SummaryResponse>("summary_family").details.folios.map(f => f.folio_id)).toEqual([IDS.folioAsha, IDS.folioDev]);
    expect(fixture<SummaryResponse>("summary_family").details.folios.map(f => f.member_id)).toEqual([IDS.asha, IDS.dev]);
    expect(fixture<SummaryResponse>("summary_cas_only").scheme.id).toBe(IDS.casScheme);
    expect(fixture<FolioNumberResponse>("folio_number").folio_id).toBe(IDS.folioAsha);
    expect(fixture<PerformanceResponse>("performance_1y_equity").scheme_id).toBe(IDS.scheme);
    expect(fixture<PerformanceResponse>("performance_1y_debt_no_benchmark").scheme_id).toBe(IDS.debtScheme);
    expect(fixture<PerformanceResponse>("performance_all_young_fund").scheme_id).toBe(IDS.youngScheme);
    expect(fixture<RiskResponse>("risk_life_window").scheme_id).toBe(IDS.debtScheme);
    expect(fixture<OverlapResponse>("overlap_fund").top_overlap_funds[0].scheme_id).toBe(IDS.peer1);
  });

  it("the family summary is hand-checkable: 150 units, 1,600 in, 2,250 now, a 650 gain, the two folios named and masked", () => {
    const body = fixture<SummaryResponse>("summary_family");
    expect(body.scope).toBe("combined");
    expect(body.tiles).toMatchObject({
      current_value: "2250.00", invested: "1600.00", total_gain: "650.00", total_gain_pct: "40.6250", xirr: "0.1234",
      share_of_portfolio_pct: "94.5378", expense_ratio: { value: "0.70", reference_period: "2026-09-30", plan: "Direct" },
    });
    expect(body.details).toMatchObject({ units: "150.000", average_nav: "10.6667", current_nav: "15.0000", first_investment: "2025-01-01", last_investment: "2025-06-01" });
    expect(body.details.folios.map(f => [f.member_name, f.folio_masked])).toEqual([["ASHA RAO", "XXXXX9183"], ["Dev Rao", "XXXXX5678"]]);
    // 1,600 / 150 units = 10.6667 average NAV; 2,250 / 150 = 15.0000 current NAV; 650 / 1,600 = 40.6250 percent.
    const member = fixture<SummaryResponse>("summary_member");
    expect(member.scope).toBe(IDS.dev);
    expect(member.held_by_other_members).toEqual([{ id: IDS.asha, name: "ASHA RAO" }]);
    expect(member.tiles).toMatchObject({ current_value: "750.00", invested: "600.00", total_gain: "150.00", total_gain_pct: "25.0000", share_of_portfolio_pct: null });
    expect(member.tiles.xirr).toBe("0.1735279232884757158275261014");
    expect(member.details).toMatchObject({ units: "50.000", average_nav: "12.0000", current_nav: "15.0000" });
    expect(member.details.folios).toHaveLength(1);
  });

  it("the CAS-only summary has no history and no expense ratio, and its folio mask keeps the last four characters", () => {
    const body = fixture<SummaryResponse>("summary_cas_only");
    expect(body.has_history).toBe(false);
    expect(body.tiles.expense_ratio).toBeNull();
    expect(body.nav_as_of).toBe("2026-10-15");
    expect(body.details.folios[0].folio_masked).toBe("XXXXXNLY1");
    expect(body.tiles).toMatchObject({ current_value: "1060.00", invested: "1000.00", total_gain: "60.00", total_gain_pct: "6.0000", xirr: "0.1292258326537757773518355219" });
  });

  it("the not-held summary has every personal field null but keeps the scheme and the expense ratio", () => {
    const body = fixture<SummaryResponse>("summary_not_held");
    expect(body.held).toBe(false);
    expect(body.scope).toBe(IDS.dev);
    expect(body.held_by_other_members).toEqual([{ id: IDS.asha, name: "ASHA RAO" }]);
    expect(Object.entries(body.tiles).filter(([key]) => key !== "expense_ratio").every(([, value]) => value === null)).toBe(true);
    expect(body.tiles.expense_ratio?.value).toBe("0.70");
    expect(body.details.folios).toEqual([]);
    expect(Object.values(body.details).filter(value => !Array.isArray(value)).every(value => value === null)).toBe(true);
  });

  it("the series fixtures start at 0.0000 and end at the legend figure", () => {
    for (const name of ["performance_1y_equity", "performance_1y_debt_no_benchmark", "performance_all_young_fund"]) {
      const body = fixture<PerformanceResponse>(name);
      expect(body.fund[0].pct).toBe("0.0000");
      expect(body.fund.at(-1)!.pct).toBe(body.period_returns.fund);
      if (body.benchmark) expect(body.benchmark.at(-1)!.pct).toBe(body.period_returns.benchmark);
    }
    expect(fixture<PerformanceResponse>("performance_1y_equity").fund).toHaveLength(260);
    expect(fixture<PerformanceResponse>("performance_1y_equity").benchmark_label).toBe("Nifty 500");
    expect(fixture<PerformanceResponse>("performance_1y_debt_no_benchmark").benchmark_reason).toBe("no_benchmark");
    expect(fixture<PerformanceResponse>("performance_all_young_fund").since_launch).toBe(true);
    const peers = fixture<CategorySeriesResponse>("peers_series_1y");
    expect(peers.points).toHaveLength(366);
    expect(peers.points.at(-1)!.pct).toBe("10.8332");
    expect([peers.peers_used, peers.peers_total]).toEqual([7, 9]);
  });

  it("the insight lists never repeat an id inside one list and top_three is drawn from the lists", () => {
    for (const name of ["insights_full", "insights_sparse"]) {
      const body = fixture<InsightsResponse>(name);
      const known = new Set([...body.key, ...body.strengths, ...body.considerations].map(f => f.id));
      expect(body.top_three.every(f => known.has(f.id))).toBe(true);
      expect(new Set(body.key.map(f => f.id)).size).toBe(body.key.length);
      expect(body.top_three.length).toBeLessThanOrEqual(3);
    }
    expect(fixture<InsightsResponse>("insights_full").top_three.map(f => f.id)).toEqual(["long_term_vs_category", "overlap", "manager_tenure"]);
  });

  it("the composition weights add up: top 10 is in descending order, the asset types total 94 (the golden is a partial portfolio) and the sectors 78", () => {
    const body = fixture<CompositionResponse>("composition");
    const weights = body.top10.map(h => Number(h.weight));
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
    expect(body.allocation.asset_type.reduce((sum, s) => sum + Number(s.pct), 0)).toBeCloseTo(94, 4);
    expect(body.allocation.sector.reduce((sum, s) => sum + Number(s.pct), 0)).toBeCloseTo(78, 4);
    expect(body.allocation.market_cap.reduce((sum, s) => sum + Number(s.pct), 0)).toBeCloseTo(100, 3);
    expect(body.unclassified_pct).toBe("16.0000");
    const all = fixture<HoldingsListResponse>("holdings_all");
    expect(all.count).toBe(all.rows.length);
    expect(all.rows.filter(row => row.isin === null).map(row => row.name)).toEqual(["Government Bond", "Cash and equivalents"]);
    expect(body.stock_count).toBe(12);
  });

  it("test_additive_fields_are_optional: the validator accepts a missing optional field, checks a present one, and the goldens omit benchmark_label", () => {
    const point = obj<{ id: string; held?: boolean }>({ id: str, held: optional(bool) });
    expect(point.check({ id: "a" }, "p")).toEqual([]);
    expect(point.check({ id: "a", held: true }, "p")).toEqual([]);
    expect(point.check({ id: "a", held: "yes" }, "p")).toEqual(["p.held: expected boolean, got string"]);
    expect(point.check({ id: "a", other: 1 }, "p")).toEqual(["p.other: not in the contract"]);
    expect(fixture("returns_inception")).not.toHaveProperty("benchmark_label");
    expect(fixture("returns_current")).not.toHaveProperty("benchmark_label");
  });

  it("the scatter goldens do not carry the additive held flag (a backend ask): no point has it, exactly one dot is the fund", () => {
    for (const name of ["scatter", "scatter_thin"]) {
      const body = fixture<ScatterResponse>(name);
      expect(body.points.every(p => !("held" in p))).toBe(true);
      expect(body.points.filter(p => p.is_fund)).toHaveLength(1);
      expect(body.points.find(p => p.is_fund)!.scheme_id).toBe(IDS.scheme);
    }
    expect(fixture<ScatterResponse>("scatter").points).toHaveLength(7);
    expect(fixture<ScatterResponse>("scatter_thin")).toMatchObject({ thin_category: true });
    expect(fixture<ScatterResponse>("scatter_thin").points).toHaveLength(2);
  });

  it("the risk goldens: an equity fund has bands and a beta, the debt fund has none of them and says why", () => {
    const equity = fixture<RiskResponse>("risk_equity");
    expect(equity.volatility).toEqual({ value: "0.0050", band: "Low", tone: "pos" });
    expect(equity.beta).toEqual({ value: "0.7407", band: "Lower risk", tone: "pos" });
    expect(equity.beta_reason).toBeNull();
    const debt = fixture<RiskResponse>("risk_life_window");
    expect([debt.volatility.band, debt.max_drawdown.band, debt.sharpe.band, debt.beta.value, debt.beta.band]).toEqual([null, null, null, null, null]);
    expect(debt.beta_reason).toBe("no_benchmark");
    expect(debt.life_window).toBe(false);
  });

  it("the overlap goldens agree with each other: the same 18 percent, three shared stocks, the same peer", () => {
    const fundBody = fixture<OverlapResponse>("overlap_fund");
    const compareBody = fixture<OverlapCompareResponse>("overlap_compare");
    expect(fundBody.overlap_pct).toBe("18.0000");
    expect(compareBody.overlap_pct).toBe("18.0000");
    expect(fundBody.common_stock_count).toBe(3);
    expect(compareBody.counts.common).toBe(3);
    expect(compareBody.fund_b.scheme_id).toBe(IDS.peer1);
    expect(compareBody.fund_a.scheme_id).toBe(IDS.scheme);
  });
});
