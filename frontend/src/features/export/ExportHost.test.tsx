import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderInShell } from "../../shell/testing";
import { ExportHost } from "./ExportHost";
import { parsePrintFragment } from "../../print/printFragment";
import { resetFolioVisibilityForTests } from "../../lib/folioVisibility";
const api = vi.hoisted(() => ({ createExport: vi.fn(), getExportStatus: vi.fn(), downloadExportFile: vi.fn(), cancelExport: vi.fn() }));
vi.mock("./api", async original => ({ ...await original<typeof import("./api")>(), ...api }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ me: { self_name: "Demo Holder" } }) }));
const members = [{ id: "11111111-1111-4111-8111-111111111111", name: "Demo Holder" }, { id: "22222222-2222-4222-8222-222222222222", name: "Demo Member" }];
function mount(path = "/portfolio/mutual-funds/performance", household = members) { return renderInShell(<ExportHost />, { path, scope: { members: household } }); }
function open() { fireEvent.click(screen.getByRole("button", { name: "Export PDF" })); return screen.getByRole("dialog"); }
async function start() { await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Export PDF" })); }); }
beforeEach(() => {
  resetFolioVisibilityForTests();
  vi.useFakeTimers(); Object.values(api).forEach(mock => mock.mockReset()); api.createExport.mockResolvedValue({ job_id: "demo-job", status: "preparing" }); api.getExportStatus.mockResolvedValue({ status: "ready", stage: "finishing", sections_total: 3, pdf_bytes: 1024, error_code: null }); api.downloadExportFile.mockResolvedValue({ blob: new Blob(["demo"]), fileName: "demo.pdf" }); api.cancelExport.mockResolvedValue(undefined);
  vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => "blob:demo"), revokeObjectURL: vi.fn() })); vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => { cleanup(); resetFolioVisibilityForTests(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("opens choose with This tab on a Mutual Funds tab and Full report elsewhere", () => {
  const view = mount(); const dialog = open(); expect(within(dialog).getByRole("radio", { name: "This tab" })).toBeChecked(); view.unmount();
  mount("/home"); expect(within(open()).getByRole("radio", { name: "Full report" })).toBeChecked();
});
it("starts the job, keeps working, reopens preparing, reaches ready and exports another", async () => {
  mount(); open(); await start(); expect(screen.getByRole("heading", { name: "Preparing your report" })).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Keep working" })); expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Preparing…" })).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "Preparing…" })); expect(screen.getByRole("heading", { name: "Preparing your report" })).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); }); expect(screen.getByRole("heading", { name: "Your report is ready" })).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: /Export something else/ })); expect(screen.getByRole("heading", { name: "Export a PDF report" })).toBeInTheDocument();
});
it("try again reuses the last choice and print instead opens a session-mode tab without a pass", async () => {
  api.createExport.mockRejectedValue(new Error("demo")); const opened = vi.spyOn(window, "open").mockImplementation(() => null); mount(); open(); await start(); fireEvent.click(screen.getByRole("button", { name: /Print it from your browser instead/ }));
  expect(opened).toHaveBeenCalledWith(expect.stringContaining("/print/report#mode=browser&opts="), "_blank", "noopener"); const url = String(opened.mock.calls[0][0]); expect(url).not.toContain("pass="); const options = parsePrintFragment(url.slice(url.indexOf("#")))!.options; expect(options.meta.holderName).toBe("Demo Holder"); expect(options.members).toEqual(members);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Try again/ })); }); expect(api.createExport.mock.calls[1][0]).toEqual(api.createExport.mock.calls[0][0]);
});
it("fewer sections and one member remount choose with the requested defaults", async () => {
  api.createExport.mockRejectedValue(new Error("demo")); mount(); open(); await start(); fireEvent.click(screen.getByRole("button", { name: /Export fewer sections/ })); expect(screen.getByRole("radio", { name: "This tab" })).toBeChecked(); await start(); fireEvent.click(screen.getByRole("button", { name: /Export one member/ })); expect(screen.getByRole("radio", { name: "Demo Holder" })).toBeChecked();
});
it("useHasFunds disables the button for an empty household", () => { mount("/home", []); expect(screen.getByRole("button", { name: "Export PDF" })).toHaveAttribute("aria-disabled", "true"); });
it("starts a download while closed and shows ready on the next open", async () => {
  mount(); open(); await start(); fireEvent.click(screen.getByRole("button", { name: "Keep working" })); await act(async () => { await vi.advanceTimersByTimeAsync(2000); }); expect(api.downloadExportFile).toHaveBeenCalledTimes(1); expect(screen.getByRole("button", { name: "Export PDF" })).toBeInTheDocument(); open(); expect(screen.getByRole("heading", { name: "Your report is ready" })).toBeInTheDocument();
});
it("uses the eye setting for the initial folio option", () => {
  localStorage.setItem("unifolio.folioNumbersHidden", "1"); resetFolioVisibilityForTests({ rereadStorage: true }); mount(); expect(within(open()).getByRole("checkbox", { name: /Show folio numbers/ })).not.toBeChecked();
});
