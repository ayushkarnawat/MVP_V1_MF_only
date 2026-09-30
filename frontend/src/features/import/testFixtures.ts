import type { ImportPreviewResponse, PersonPreview, SchemeMatchPreview } from "./types";

export function scheme(temp_id: string, over: Partial<SchemeMatchPreview> = {}): SchemeMatchPreview {
  return {
    temp_id, name: `Fund ${temp_id}`, isin: null, amfi_code: "100", suggested_amfi_code: null,
    suggested_name: null, match_confidence: 1, match_status: "confirmed", folio: `F-${temp_id}`,
    amc: "AMC", transaction_count: 2, plan_type: "direct", category: null, ...over,
  };
}

export function person(person_key: string, name: string, over: Partial<PersonPreview> = {}): PersonPreview {
  return {
    person_key, name, name_source: "cas", needs_name: false, pan_masked: "AB******4K", is_me: false,
    status: "new", member_id: null, fund_count: 1, unresolved_count: 0, matched_by_name_temp_ids: [], ...over,
  };
}

export function preview(over: Partial<ImportPreviewResponse> = {}): ImportPreviewResponse {
  return {
    session_id: "s1", filename: "cas.pdf", investor_name: "Aditi Sharma", investor_email: null,
    pan_masked: "AB******4K", schemes: [], transactions: [], transaction_count: 0, parse_warnings: [],
    cas_type: "DETAILED", file_type: "FileType.CAMS",
    people: [person("me", "Aditi Sharma", { is_me: true, status: "me" })],
    unassigned_temp_ids: [], name_notices: [], same_person_prompts: [],
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), ...over,
  };
}

/** Me with one confirmed fund, plus Ramesh with two unclassified funds (one matched by name). */
export function familyPreview(over: Partial<ImportPreviewResponse> = {}): ImportPreviewResponse {
  return preview({
    schemes: [
      scheme("m1", { person_key: "me" }),
      scheme("r1", { person_key: "ramesh", plan_type: "unclassified" }),
      scheme("r2", { person_key: "ramesh", plan_type: "unclassified" }),
    ],
    people: [
      person("me", "Aditi Sharma", { is_me: true, status: "me", fund_count: 1 }),
      person("ramesh", "Ramesh Sharma", {
        pan_masked: "BX******8L", fund_count: 2, unresolved_count: 2, matched_by_name_temp_ids: ["r2"],
      }),
    ],
    ...over,
  });
}
