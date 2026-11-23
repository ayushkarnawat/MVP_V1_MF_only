// The search index reply (Batch K, T01 contract). Mirrors `GET /household/search-index`
// (backend/app/api/search.py, built by the Codex task search-be-1). Names and values are fixed here so the
// front-end lanes can build against them before the endpoint exists. There are no amounts, units, prices or folios.

export type SearchPlanType = "direct" | "regular" | string;

export interface SearchSip {
  status: string; // "active" | "stopped" | ...
  next_due_date: string | null; // ISO calendar date
}

export interface SearchHolder {
  member_id: string;
  member_name: string;
  state: "open" | "sold";
  sip: SearchSip | null;
}

export interface SearchFund {
  scheme_id: string;
  name: string;
  amc_name: string;
  sebi_category: string | null;
  plan_type: SearchPlanType;
  main_manager: string | null;
  holders: SearchHolder[];
}

export interface SearchIndexResponse {
  generated_at: string; // ISO date-time with offset
  funds: SearchFund[];
}
