import { API_BASE_URL, ApiError, parseErrorDetail } from "../../lib/apiClient";
import { getToken } from "../auth/session";

export interface FolioHealth {
  folio_id: string; household_member_id: string; household_member_name: string;
  scheme_name: string; folio_number: string; plan_type: string;
  cas_close_units: string | null; cas_statement_to: string | null;
  fresh_units: string; cached_units: string | null;
  cas_nav: string | null; cas_nav_date: string | null; our_nav: string | null;
  status: "match" | "units_differ" | "cache_stale" | "no_cas_data";
  diff_units: string | null;
}
export interface ImportHealthResponse {
  folios: FolioHealth[];
  history: { household_member_id: string; latest_month: string | null; cached_value: string | null }[];
  warnings: string[]; last_import_at: string | null;
}
async function authFetch(path: string): Promise<Response> {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE_URL}${path}`, { headers, cache: "no-store" });
  if (!res.ok) throw new ApiError(res.status, await parseErrorDetail(res));
  return res;
}
export async function fetchDevStatus(): Promise<{ enabled: boolean }> {
  return (await authFetch("/dev/status")).json();
}
export async function fetchImportHealth(memberId?: string): Promise<ImportHealthResponse> {
  const query = memberId ? `?household_member_id=${encodeURIComponent(memberId)}` : "";
  return (await authFetch(`/dev/import-health${query}`)).json();
}
