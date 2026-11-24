import { API_BASE_URL, cachedFetch } from "../../lib/apiClient";
import { getToken } from "../auth/session";

export interface ExportJobStatus {
  job_id: string;
  status: "preparing" | "ready" | "failed" | "cancelled";
  stage: "collecting" | "building" | "finishing";
  sections_total: number;
  scope_kind: "family" | "member";
  error_code: string | null;
  pdf_bytes: number | null;
}
// Own error base (not the shared ApiError): this module is imported by the top bar, so it must not touch an apiClient export at
// import time, or every test that mocks apiClient without ApiError would fail just by rendering the shell.
export class ExportApiError extends Error {
  status: number;
  payload: unknown;
  constructor(status: number, payload: unknown) {
    super(typeof payload === "string" ? payload : "Request failed");
    this.status = status;
    this.payload = payload;
  }
}
export class ExportInProgressError extends ExportApiError {
  jobId: string;
  constructor(jobId: string) { super(409, { code: "export_in_progress" }); this.jobId = jobId; }
}
export class ExportCooldownError extends ExportApiError { constructor() { super(429, { code: "export_cooldown" }); } }
export class ExportFileGoneError extends ExportApiError { constructor() { super(404, { code: "file_gone" }); } }

async function request(path: string, method = "GET", body?: unknown): Promise<Response> {
  const headers = new Headers(); const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  const response = await cachedFetch(`${API_BASE_URL}/export/report${path}`, { method, headers, cache: "no-store", ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  if (response.ok) return response;
  let payload: unknown = await response.json().catch(() => null);
  if (payload && typeof payload === "object" && "detail" in payload) payload = payload.detail;
  if (response.status === 409 && payload && typeof payload === "object" && "code" in payload && payload.code === "export_in_progress" && "job_id" in payload && typeof payload.job_id === "string") throw new ExportInProgressError(payload.job_id);
  if (response.status === 429) throw new ExportCooldownError();
  if (response.status === 404 && path.endsWith("/file")) throw new ExportFileGoneError();
  throw new ExportApiError(response.status, payload);
}
export async function createExport(options: { scope: string; section_ids: string[]; cover: boolean; data_dates: boolean; show_folios: "full" | "masked" | "none" }): Promise<{ job_id: string; status: string }> {
  return (await request("", "POST", options)).json();
}
export async function getExportStatus(jobId: string): Promise<ExportJobStatus> { return (await request(`/${encodeURIComponent(jobId)}`)).json(); }
export async function cancelExport(jobId: string): Promise<void> { await request(`/${encodeURIComponent(jobId)}`, "DELETE"); }
export async function downloadExportFile(jobId: string): Promise<{ blob: Blob; fileName: string }> {
  const response = await request(`/${encodeURIComponent(jobId)}/file`);
  const disposition = response.headers.get("Content-Disposition") ?? "";
  let name = disposition.match(/filename="([^"]+)"/i)?.[1] ?? disposition.match(/filename=([^;\s]+)/i)?.[1];
  const encoded = disposition.match(/filename\*=UTF-8''([^;\s]+)/i)?.[1];
  if (encoded) { try { name = decodeURIComponent(encoded); } catch { /* Use the ordinary filename. */ } }
  const fileName = name?.split(/[\\/]/).pop()?.replace(/[\r\n\u0000]/g, "").trim() || "Unifolio-portfolio-report.pdf";
  return { blob: await response.blob(), fileName };
}
