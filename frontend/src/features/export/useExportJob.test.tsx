import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useExportJob, formatExportSize, EXPORT_LONG_NOTE } from "./useExportJob";
import { ExportCooldownError, ExportInProgressError } from "./api";
import type { ExportChoice } from "./exportTypes";
const api = vi.hoisted(() => ({ createExport: vi.fn(), getExportStatus: vi.fn(), downloadExportFile: vi.fn(), cancelExport: vi.fn() }));
vi.mock("./api", async original => ({ ...await original<typeof import("./api")>(), ...api }));
vi.mock("../../shell/scope/ScopeContext", () => ({ useScope: () => ({ members: [{ id: "demo-a" }, { id: "demo-b" }] }) }));
const choice: ExportChoice = { who: "family", sectionIds: ["overview-sips", "performance-returns"], cover: true, dataDates: true, showFolios: false };
const labels = { scopeLabel: "Family combined", presetLabel: "Custom" };
const click = vi.fn(); const revoke = vi.fn(); const blob = new Blob(["demo-pdf"]);
const status = (state = "preparing", stage = "collecting", code: string | null = null) => ({ job_id: "demo-job", status: state, stage, sections_total: 2, scope_kind: "family", error_code: code, pdf_bytes: 831488, created_at: new Date(Date.now() - 130000).toISOString() });
beforeEach(() => {
  vi.useFakeTimers(); Object.values(api).forEach(mock => mock.mockReset()); click.mockReset(); revoke.mockReset();
  api.createExport.mockResolvedValue({ job_id: "demo-job", status: "preparing" }); api.getExportStatus.mockResolvedValue(status()); api.downloadExportFile.mockResolvedValue({ blob, fileName: "demo.pdf" }); api.cancelExport.mockResolvedValue(undefined);
  vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => "blob:demo"), revokeObjectURL: revoke })); vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(2000); });
it.each([["family", false, "masked"], ["demo-member", true, "full"]] as const)("maps scope %s and folio choice to the API body", async (who, showFolios, expected) => {
  const { result } = renderHook(() => useExportJob()); await act(async () => { await result.current.start({ ...choice, who, showFolios }, labels); });
  expect(api.createExport).toHaveBeenCalledWith({ scope: who, section_ids: choice.sectionIds, cover: true, data_dates: true, show_folios: expected });
});
it("polls at two seconds, follows progress, downloads once and retains the blob", async () => {
  api.getExportStatus.mockResolvedValueOnce(status()).mockResolvedValueOnce(status("preparing", "building")).mockResolvedValueOnce(status("preparing", "finishing")).mockResolvedValueOnce(status("ready"));
  const { result } = renderHook(() => useExportJob()); await act(async () => { await result.current.start(choice, labels); });
  expect(api.getExportStatus).not.toHaveBeenCalled(); expect(result.current.progress.subtitle).toBe("Family combined · Custom · 2 sections");
  await tick(); expect(result.current.progress.percent).toBe(15); expect(result.current.progress.rows[0].state).toBe("now");
  await tick(); expect(result.current.progress.percent).toBe(55); expect(result.current.progress.rows.map(row => row.state)).toEqual(["done", "done", "now", "todo", "todo"]); expect(result.current.progress.rows[2].note).toBe("2 sections");
  await tick(); expect(result.current.progress.percent).toBe(90); expect(result.current.progress.rows[3].state).toBe("now");
  await tick(); expect(result.current.state).toBe("ready"); expect(result.current.progress.percent).toBe(100); expect(result.current.ready).toEqual({ fileName: "demo.pdf", chips: ["812 KB", "Family combined", "Custom"] }); expect(click).toHaveBeenCalledTimes(1);
  act(() => result.current.downloadAgain()); expect(click).toHaveBeenCalledTimes(2); expect(api.downloadExportFile).toHaveBeenCalledTimes(1); await tick(); expect(api.getExportStatus).toHaveBeenCalledTimes(4); expect(revoke).toHaveBeenCalled();
});
it.each([["failed", "failed"], ["cancelled", "idle"]])("stops polling after %s", async (terminal, expected) => {
  api.getExportStatus.mockResolvedValue(status(terminal)); const { result } = renderHook(() => useExportJob()); await act(async () => { await result.current.start(choice, labels); }); await tick(); await tick(); expect(result.current.state).toBe(expected); expect(api.getExportStatus).toHaveBeenCalledTimes(1);
});
it("stops polling on unmount and cancel calls DELETE and returns to idle", async () => {
  const view = renderHook(() => useExportJob()); await act(async () => { await view.result.current.start(choice, labels); }); act(() => view.result.current.cancel()); expect(api.cancelExport).toHaveBeenCalledWith("demo-job"); expect(view.result.current.state).toBe("idle"); await tick(); expect(api.getExportStatus).not.toHaveBeenCalled();
  await act(async () => { await view.result.current.start(choice, labels); }); view.unmount(); await tick(); expect(api.getExportStatus).not.toHaveBeenCalled();
});
it("attaches on 409 and maps cooldown on 429", async () => {
  api.createExport.mockRejectedValueOnce(new ExportInProgressError("demo-existing")); const { result } = renderHook(() => useExportJob()); await act(async () => { await result.current.start(choice, labels); }); await tick(); expect(api.getExportStatus).toHaveBeenCalledWith("demo-existing");
  act(() => result.current.cancel()); api.createExport.mockRejectedValueOnce(new ExportCooldownError()); await act(async () => { await result.current.start(choice, labels); }); expect(result.current.failed.code).toBe("EXP-WAIT");
});
it.each([["busy", "EXP-BUSY"], ["timeout", "EXP-TIME"], ["too_large", "EXP-SIZE"], ["print_error", "EXP-PAGE"], ["internal", "EXP-FAIL"]])("maps %s to its display code", async (code, display) => {
  api.getExportStatus.mockResolvedValue(status("failed", "building", code)); const { result } = renderHook(() => useExportJob()); await act(async () => { await result.current.start(choice, labels); }); await tick(); expect(result.current.failed).toEqual({ code: display, canTryFewer: true, canExportMember: true });
});
it("retries a poll error three times then fails without exposing exception text", async () => {
  api.getExportStatus.mockRejectedValue(new Error("demo-private-error")); const { result } = renderHook(() => useExportJob()); await act(async () => { await result.current.start(choice, labels); }); for (let i = 0; i < 4; i++) await tick(); expect(api.getExportStatus).toHaveBeenCalledTimes(4); expect(result.current.state).toBe("failed"); expect(result.current.failed.code).toBeNull();
});
it("single-section member choices disable fewer-sections and member alternatives", async () => {
  api.createExport.mockRejectedValue(new Error("demo")); const { result } = renderHook(() => useExportJob()); await act(async () => { await result.current.start({ ...choice, who: "demo-a", sectionIds: [choice.sectionIds[0]] }, labels); }); expect(result.current.failed).toEqual({ code: null, canTryFewer: false, canExportMember: false });
});
it("does not retry a single-use file read", async () => {
  api.getExportStatus.mockResolvedValue(status("ready")); api.downloadExportFile.mockRejectedValue(new Error("demo-file-gone")); const view = renderHook(() => useExportJob()); await act(async () => { await view.result.current.start(choice, labels); }); await tick(); expect(view.result.current.state).toBe("failed"); await tick(); expect(api.downloadExportFile).toHaveBeenCalledTimes(1); expect(click).not.toHaveBeenCalled();
});
it("ignores a file that arrives after cancellation", async () => {
  api.getExportStatus.mockResolvedValue(status("ready")); let finish!: (value: { blob: Blob; fileName: string }) => void; api.downloadExportFile.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const { result } = renderHook(() => useExportJob()); await act(async () => { await result.current.start(choice, labels); }); await tick(); act(() => result.current.cancel()); await act(async () => { finish({ blob, fileName: "demo.pdf" }); }); expect(result.current.state).toBe("idle"); expect(click).not.toHaveBeenCalled();
});
it("cancels a job that finishes creating after cancel was pressed", async () => {
  let finish!: (value: { job_id: string; status: string }) => void; api.createExport.mockReturnValue(new Promise(resolve => { finish = resolve; })); const { result } = renderHook(() => useExportJob()); let started!: Promise<void>;
  act(() => { started = result.current.start(choice, labels); }); act(() => result.current.cancel()); await act(async () => { finish({ job_id: "demo-late", status: "preparing" }); await started; }); expect(api.cancelExport).toHaveBeenCalledWith("demo-late"); expect(result.current.state).toBe("idle"); await tick(); expect(api.getExportStatus).not.toHaveBeenCalled();
});
it.each([[0, "0 KB"], [831488, "812 KB"], [1048576, "1.0 MB"], [1572864, "1.5 MB"]] as const)("formats %s bytes using integer size units", (bytes, expected) => expect(formatExportSize(bytes)).toBe(expected));

it("shows_the_elapsed_time_while_preparing", async () => {
  vi.setSystemTime(new Date("2026-11-26T10:00:00Z"));
  const { result } = renderHook(() => useExportJob());
  await act(async () => { await result.current.start(choice, labels); });
  expect(result.current.progress.elapsed).toBe("0 s so far");
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(result.current.progress.elapsed).toBe("1 s so far");
  api.getExportStatus.mockImplementationOnce(async () => status());
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(result.current.progress.elapsed).toBe("2 min 10 s so far");
  api.getExportStatus.mockResolvedValue({ ...status(), created_at: new Date(Date.now()).toISOString() });
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(result.current.progress.elapsed).toBe("2 min 15 s so far");
});

it("elapsed_time_keeps_counting_after_the_dialog_is_reopened", async () => {
  api.createExport.mockRejectedValueOnce(new ExportInProgressError("demo-existing"));
  const view = renderHook(({ open }) => {
    const job = useExportJob();
    return { job, visibleProgress: open ? job.progress : null };
  }, { initialProps: { open: true } });
  await act(async () => { await view.result.current.job.start(choice, labels); });
  await tick();
  expect(view.result.current.visibleProgress?.elapsed).toBe("2 min 12 s so far");
  view.rerender({ open: false });
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(view.result.current.visibleProgress).toBeNull();
  act(() => view.result.current.job.reopen());
  view.rerender({ open: true });
  expect(view.result.current.visibleProgress?.elapsed).toBe("2 min 17 s so far");
});

it("stage_line_names_the_finishing_stage_only_while_finishing", async () => {
  const { result } = renderHook(() => useExportJob());
  expect(result.current.progress.stageLine).toBeNull();
  await act(async () => { await result.current.start(choice, labels); });
  for (const stage of ["collecting", "building", "finishing"]) {
    api.getExportStatus.mockResolvedValue(status("preparing", stage));
    await tick();
    expect(result.current.progress.stageLine).toBe(stage === "finishing" ? "Finishing the PDF" : null);
  }
  api.getExportStatus.mockResolvedValue(status("ready", "finishing"));
  await tick();
  expect(result.current.progress.stageLine).toBeNull();
});

it("long_note_only_for_large_reports_and_only_while_preparing", async () => {
  const { result } = renderHook(() => useExportJob());
  expect(result.current.progress.longNote).toBeNull();
  await act(async () => { await result.current.start(choice, labels); });
  for (const total of [24, 5, 19, 20]) {
    api.getExportStatus.mockResolvedValue({ ...status(), sections_total: total });
    await tick();
    expect(result.current.progress.longNote).toBe(total >= 20 ? EXPORT_LONG_NOTE : null);
  }
  api.getExportStatus.mockResolvedValue({ ...status("ready"), sections_total: 24 });
  await tick();
  expect(result.current.progress.longNote).toBeNull();
  await act(async () => { await result.current.start(choice, labels); });
  api.getExportStatus.mockResolvedValue({ ...status("failed"), sections_total: 24 });
  await tick();
  expect(result.current.progress.longNote).toBeNull();
});

it.each(["ready", "failed", "cancelled", "cancel", "unmount"])("elapsed_clears_when_ready_failed_or_cancelled: %s", async terminal => {
  const view = renderHook(() => useExportJob());
  await act(async () => { await view.result.current.start(choice, labels); });
  await tick();
  expect(view.result.current.progress.elapsed).toBe("2 min 12 s so far");
  if (terminal === "unmount") view.unmount();
  else if (terminal === "cancel") act(() => view.result.current.cancel());
  else { api.getExportStatus.mockResolvedValue(status(terminal)); await tick(); }
  if (terminal !== "unmount") expect(view.result.current.progress.elapsed).toBeUndefined();
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(vi.getTimerCount()).toBe(0);
});
