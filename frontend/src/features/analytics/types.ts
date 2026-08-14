export interface AllocationBucket {
  label: string;
  current_value: string;
  percentage: string;
}

export interface AnalyticsAllocationSummary {
  by_category: AllocationBucket[];
  by_amc: AllocationBucket[];
  total_value: string;
}

export interface MemberStatus {
  id: string;
  name: string;
  has_data: boolean;
}

export interface AggregateAnalyticsAllocationResponse {
  members: MemberStatus[];
  allocation: AnalyticsAllocationSummary;
}

export interface WeightedTerSummary {
  weighted_ter: string | null;
  covered_value: string;
  total_value: string;
  reference_period: string | null;
  uncovered_schemes: string[];
}

export interface DirectRegularTerComparison {
  direct: WeightedTerSummary;
  regular: WeightedTerSummary;
}

export interface AggregateWeightedTerResponse {
  members: MemberStatus[];
  ter: WeightedTerSummary;
}

export interface AggregateDirectRegularTerResponse {
  members: MemberStatus[];
  ter: DirectRegularTerComparison;
}

export interface CategoryRankRow {
  scheme_id: string;
  scheme_name: string;
  sebi_category: string | null;
  category_unavailable: boolean;
  insufficient_history: boolean;
  scheme_return: string | null;
  category_rank: number | null;
  category_size: number;
  percentile: string | null;
  category_avg_return: string | null;
  thin_category: boolean;
}

export interface CategoryRankingSummary {
  funds: CategoryRankRow[];
}

export interface AggregateCategoryRankingResponse {
  members: MemberStatus[];
  ranking: CategoryRankingSummary;
}
