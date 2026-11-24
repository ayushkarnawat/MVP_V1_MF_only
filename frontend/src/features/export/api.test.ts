import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cancelExport, createExport, downloadExportFile, ExportCooldownError, ExportFileGoneError, ExportInProgressError, getExportStatus } from "./api";
const fetchMock = vi.fn<typeof fetch>();
vi.mock("../auth/session", () => ({ getToken: () => "demo-session" }));
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());
const options = { scope: "family", section_ids: ["overview-sips"], cover: true, data_dates: true, show_folios: "masked" as const };
it("creates, polls, downloads and cancels with the bearer and uncached paths", async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ job_id: "demo-job", status: "preparing" })));
  expect(await createExport(options)).toEqual({ job_id: "demo-job", status: "preparing" });
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: "preparing", stage: "building" })));
  expect(await getExportStatus("demo-job")).toMatchObject({ stage: "building" });
  fetchMock.mockResolvedValueOnce(new Response("demo-pdf", { headers: { "Content-Disposition": 'attachment; filename="demo-report.pdf"' } }));
  const file = await downloadExportFile("demo-job"); expect(file.blob.size).toBe("demo-pdf".length); expect(file.fileName).toBe("demo-report.pdf");
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: "cancelled" }))); await cancelExport("demo-job");
  expect(fetchMock.mock.calls.map(([url, init]) => [String(url).split("/export/")[1], init?.method ?? "GET"])).toEqual([["report", "POST"], ["report/demo-job", "GET"], ["report/demo-job/file", "GET"], ["report/demo-job", "DELETE"]]);
  expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual(options);
  for (const [, init] of fetchMock.mock.calls) { expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer demo-session"); expect(init?.cache).toBe("no-store"); }
});
it("turns direct and wrapped 409 and 429 bodies into typed errors", async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ detail: { code: "export_in_progress", job_id: "demo-existing" } }), { status: 409 }));
  await expect(createExport(options)).rejects.toMatchObject({ constructor: ExportInProgressError, jobId: "demo-existing" });
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: "export_cooldown" }), { status: 429 })); await expect(createExport(options)).rejects.toBeInstanceOf(ExportCooldownError);
});
it("uses the fallback filename and reports a consumed or expired file", async () => {
  fetchMock.mockResolvedValueOnce(new Response("demo-pdf")); expect((await downloadExportFile("demo-job")).fileName).toBe("Unifolio-portfolio-report.pdf");
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 })); await expect(downloadExportFile("demo-job")).rejects.toBeInstanceOf(ExportFileGoneError);
});
