import { StrictMode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrintReport } from "./PrintReport";
import { PRINT_SECTIONS } from "./sectionRegistry";
import { usePrintSettled } from "./usePrintSettled";
import { SectionCard } from "../features/mutual-funds/common/SectionCard";
import { getToken, setTokenOverride } from "../features/auth/session";
import { useScope } from "../shell/scope/ScopeContext";
import { usePrintOptions } from "./printOptionsContext";
import { useMfAnalytics, analyticsStore } from "../features/mutual-funds/data/analyticsStore";
import { analyticsMfC } from "../features/mutual-funds/fixtures/mfC";

const ids = ["overview-sips", "performance-returns"];
const original = { ...PRINT_SECTIONS };
const fetchSpy = vi.fn<typeof fetch>();
const members = [{ id: "11111111-1111-4111-8111-111111111111", name: "Demo Member" }];
const meta = { holderName: "Demo Holder", scopeName: "Demo Family", memberCount: 1 };
function open(sectionIds = ids, scope = "family") {
  const opts = btoa(JSON.stringify({ scope, sectionIds, cover: false, dataDates: true, showFolios: "masked", jobId: "demo-job", members, meta })).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  history.replaceState(null, "", `/print/report#pass=demo-print-pass&opts=${opts}`);
}
function Pending({ settled, failed = false }: { settled: boolean; failed?: boolean }) {
  usePrintSettled(ids[0], settled);
  return <SectionCard title="Demo" info="Explanation" state={failed ? "failed" : "ready"} onRetry={() => {}}>Ready</SectionCard>;
}
beforeEach(() => {
  fetchSpy.mockReset();
  analyticsStore.invalidate();
  fetchSpy.mockImplementation(async () => new Response(JSON.stringify(analyticsMfC()), { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });
  open();
});
afterEach(() => {
  cleanup();
  analyticsStore.invalidate();
  Object.assign(PRINT_SECTIONS, original);
  setTokenOverride(null);
  for (const key of ["print", "printReady", "printError", "theme"]) delete document.documentElement.dataset[key];
  document.documentElement.classList.remove("dark");
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("waits for every section before setting the ready marker", async () => {
  let settled = false;
  PRINT_SECTIONS[ids[0]] = { ...original[ids[0]], render: () => <Pending settled={settled} /> };
  const view = render(<PrintReport />);
  await screen.findByText("Ready");
  expect(document.documentElement).not.toHaveAttribute("data-print-ready");
  settled = true;
  view.rerender(<PrintReport />);
  await waitFor(() => expect(document.documentElement).toHaveAttribute("data-print-ready", "true"));
});
it("a failed section prints its own failure text and the report is still ready", async () => {
  PRINT_SECTIONS[ids[0]] = { ...original[ids[0]], render: () => <Pending settled failed /> };
  render(<PrintReport />);
  expect(await screen.findByRole("alert")).toHaveTextContent("This section failed to load");
  await waitFor(() => expect(document.documentElement).toHaveAttribute("data-print-ready", "true"));
});
it("a total timeout sets the error marker and not the ready marker", async () => {
  vi.useFakeTimers();
  PRINT_SECTIONS[ids[0]] = { ...original[ids[0]], render: () => <Pending settled={false} /> };
  render(<PrintReport />);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(document.documentElement).toHaveAttribute("data-print-error", "true");
  expect(document.documentElement).not.toHaveAttribute("data-print-ready");
});
it("always light whatever the stored theme", async () => {
  localStorage.setItem("theme", "dark");
  document.documentElement.dataset.theme = "dark";
  document.documentElement.classList.add("dark");
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query }));
  const style = document.createElement("style");
  style.textContent = readFileSync(resolve("src/styles/palette-tokens.css"), "utf8");
  document.head.append(style);
  try {
    render(<PrintReport />);
    await screen.findByText("SIPs");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(getComputedStyle(document.documentElement).getPropertyValue("--ui-page").trim()).toBe(String.fromCharCode(35) + "FCFCFC");
    expect(document.querySelectorAll("style[data-print-runtime]")).toHaveLength(1);
  } finally { style.remove(); }
});
it("no sticky or fixed elements and no buttons in the rendered sections", async () => {
  open(Object.keys(PRINT_SECTIONS));
  PRINT_SECTIONS[ids[0]] = { ...original[ids[0]], render: () => <Pending settled failed /> };
  const { container } = render(<PrintReport />);
  await screen.findByRole("alert");
  expect(container.querySelectorAll("[data-print-section]")).toHaveLength(24);
  expect(container.querySelector("button")).toBeNull();
  for (const element of container.querySelectorAll("*")) expect(["sticky", "fixed"]).not.toContain(getComputedStyle(element).position);
  expect(container.querySelector("[data-print-root]")).toHaveStyle({ width: "680px", margin: "0 auto" });
  expect(container.textContent).not.toMatch(/\bPAN\b/);
});
it("uses only read requests", async () => {
  function ReadSection() {
    const result = useMfAnalytics("ter");
    usePrintSettled(ids[0], result.status !== "loading");
    return null;
  }
  PRINT_SECTIONS[ids[0]] = { ...original[ids[0]], render: () => <ReadSection /> };
  render(<PrintReport />);
  await waitFor(() => expect(document.documentElement).toHaveAttribute("data-print-ready", "true"));
  expect(fetchSpy).toHaveBeenCalled();
  for (const [url, init] of fetchSpy.mock.calls) {
    expect(["GET", "HEAD"]).toContain(init?.method ?? "GET");
    expect(String(url)).not.toMatch(/\/household-members(?:[/?]|$)/);
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer demo-print-pass");
  }
});
it("makes no request for the member list", async () => {
  open([], members[0].id);
  render(<PrintReport />);
  await waitFor(() => expect(document.documentElement).toHaveAttribute("data-print-ready", "true"));
  expect(fetchSpy).not.toHaveBeenCalled();
});
it("the scope provider exposes the members from the fragment", async () => {
  function MemberProbe() {
    const scope = useScope();
    usePrintSettled(ids[0], true);
    return <output data-testid="fragment-members">{JSON.stringify(scope.members)}</output>;
  }
  PRINT_SECTIONS[ids[0]] = { ...original[ids[0]], render: () => <MemberProbe /> };
  open([ids[0]]);
  render(<PrintReport />);
  expect(await screen.findByTestId("fragment-members")).toHaveTextContent(JSON.stringify(members));
  expect(fetchSpy).not.toHaveBeenCalled();
});
it("usePrintOptions returns the options including meta", async () => {
  function OptionsProbe() {
    const options = usePrintOptions();
    usePrintSettled(ids[0], true);
    return <output data-testid="print-options">{JSON.stringify(options)}</output>;
  }
  PRINT_SECTIONS[ids[0]] = { ...original[ids[0]], render: () => <OptionsProbe /> };
  open([ids[0]]);
  render(<PrintReport />);
  expect(JSON.parse((await screen.findByTestId("print-options")).textContent!)).toEqual({ scope: "family", sectionIds: [ids[0]], cover: false, dataDates: true, showFolios: "masked", jobId: "demo-job", members, meta });
  expect(fetchSpy).not.toHaveBeenCalled();
});
it("the pass is never written to localStorage, sessionStorage or document.cookie", async () => {
  const localWrite = vi.spyOn(localStorage, "setItem");
  const sessionWrite = vi.spyOn(sessionStorage, "setItem");
  const cookieWrite = vi.spyOn(document, "cookie", "set");
  render(<PrintReport />);
  await screen.findByText("SIPs");
  expect(getToken()).toBe("demo-print-pass");
  expect(localWrite).not.toHaveBeenCalled();
  expect(sessionWrite).not.toHaveBeenCalled();
  expect(cookieWrite).not.toHaveBeenCalled();
});
it("the fragment is cleared from the address after it is read", async () => {
  render(<StrictMode><PrintReport /></StrictMode>);
  await waitFor(() => expect(document.documentElement).toHaveAttribute("data-print-ready", "true"));
  expect(location.hash).toBe("");
  expect(location.search).toBe("");
  expect(document.documentElement).not.toHaveAttribute("data-print-error");
});
it("an unknown section id gives the error marker", () => {
  open(["unknown"]);
  render(<PrintReport />);
  expect(location.hash).toBe("");
  expect(document.documentElement).toHaveAttribute("data-print-error", "true");
  expect(document.documentElement).not.toHaveAttribute("data-print-ready");
  expect(fetchSpy).not.toHaveBeenCalled();
});
it("renders sections in the requested order", async () => {
  open([...ids].reverse());
  const { container } = render(<PrintReport />);
  await screen.findByText("SIPs");
  expect([...container.querySelectorAll("[data-print-section]")].map(node => node.getAttribute("data-print-section"))).toEqual([...ids].reverse());
});
it("renders no app shell (no sidebar, top bar, section rail, search box)", async () => {
  render(<PrintReport />);
  await screen.findByText("SIPs");
  for (const role of ["navigation", "banner", "searchbox", "complementary", "dialog"]) expect(screen.queryByRole(role)).toBeNull();
});
it("waits for fonts, images and two animation frames", async () => {
  let finishFonts!: () => void;
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready: new Promise<void>(resolve => { finishFonts = resolve; }) } });
  const image = document.createElement("img");
  let complete = false;
  Object.defineProperty(image, "complete", { get: () => complete });
  document.body.append(image);
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  try {
    render(<PrintReport />);
    await screen.findByText("SIPs");
    expect(document.documentElement).not.toHaveAttribute("data-print-ready");
    await act(async () => { finishFonts(); });
    expect(frames).toHaveLength(0);
    await act(async () => { complete = true; image.dispatchEvent(new Event("error")); });
    expect(frames).toHaveLength(1);
    await act(async () => { frames.shift()?.(0); });
    expect(document.documentElement).not.toHaveAttribute("data-print-ready");
    await act(async () => { frames.shift()?.(0); });
    expect(document.documentElement).toHaveAttribute("data-print-ready", "true");
  } finally { image.remove(); }
});
it("sets the requested member scope without writing the saved scope", async () => {
  function ScopeProbe() { const scope = useScope(); usePrintSettled(ids[0], true); return <output>{scope.viewMode}:{scope.memberId}:{scope.members[0]?.name}:{scope.scopeKey}</output>; }
  PRINT_SECTIONS[ids[0]] = { ...original[ids[0]], render: () => <ScopeProbe /> };
  open([ids[0]], members[0].id);
  render(<PrintReport />);
  expect(await screen.findByText(`member:${members[0].id}:Demo Member:member:${members[0].id}`)).toBeInTheDocument();
});
it("releases the memory-only override on unmount", async () => {
  const view = render(<PrintReport />);
  await screen.findByText("SIPs");
  view.unmount();
  expect(getToken()).toBeNull();
});
it("does not turn a completed report into a timeout error", async () => {
  vi.useFakeTimers();
  render(<PrintReport />);
  await act(async () => {});
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(document.documentElement).toHaveAttribute("data-print-ready", "true");
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(document.documentElement).toHaveAttribute("data-print-ready", "true");
  expect(document.documentElement).not.toHaveAttribute("data-print-error");
});
