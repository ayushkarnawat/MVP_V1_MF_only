import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { invalidateApiCache } from "../lib/apiClient";
import { formatDataDate, formatDataDateParts } from "../lib/dataDates";
import { setTokenOverride } from "../features/auth/session";
import { analyticsStore, useMfAnalytics } from "../features/mutual-funds/data/analyticsStore";
import { aggregateHoldings } from "../features/mutual-funds/fixtures";
import { analyticsMfB, assetAllocation, capAllocation } from "../features/mutual-funds/fixtures/mfB";
import { PrintReport } from "./PrintReport";
import { PrintPlaceholder } from "./PrintPlaceholder";
import { PRINT_SECTIONS } from "./sectionRegistry";
import type { PrintOptions } from "./printFragment";
import { usePrintSettled } from "./usePrintSettled";

const original = { ...PRINT_SECTIONS };
const ids = ["overview-sips", "overview-mutual-funds", "performance-returns"];
const memberId = "11111111-1111-4111-8111-111111111111";
const defaults: PrintOptions = { scope: "family", sectionIds: ids, cover: true, dataDates: true, showFolios: "none", jobId: "demo-assembly", members: [{ id: memberId, name: "Demo Member" }], meta: { holderName: "Demo Holder", scopeName: "Your family", memberCount: 2 } };
const fetchSpy = vi.fn<typeof fetch>();
function open(change: Partial<PrintOptions> = {}) {
  const encoded = btoa(JSON.stringify({ ...defaults, ...change })).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  history.replaceState(null, "", `/print/report#pass=demo-assembly-pass&opts=${encoded}`);
}
function holdings() {
  const data = aggregateHoldings();
  data.holdings = [0, 1, 2].map(index => ({ ...data.holdings[0], scheme_id: index === 2 ? "demo-second" : "demo-first", current_nav_date: "2026-11-12", folios: [{ folio_id: index === 2 ? "demo-folio-b" : "demo-folio-a", folio_number: "90000011", folio_masked: "XXXX0011", units: "10", invested: "100.00", value: "120.00" }] }));
  return data;
}
function entries(container: HTMLElement) { return [...container.querySelectorAll("[data-contents-entry]")]; }
function contentsOnlyRule() {
  const css = readFileSync(resolve("src/print/print.css"), "utf8");
  const rule = css.match(/html\[data-print-contents-only="true"\][^{]*\{[^}]*\}/g);
  expect(rule).toHaveLength(1);
  return rule![0];
}
beforeEach(() => {
  invalidateApiCache(); analyticsStore.invalidate(); fetchSpy.mockReset();
  for (const [id, entry] of Object.entries(original)) PRINT_SECTIONS[id] = { ...entry, render: () => <PrintPlaceholder id={id} title={entry.title} /> };
  fetchSpy.mockImplementation(async () => new Response(JSON.stringify(holdings()), { status: 200 })); vi.stubGlobal("fetch", fetchSpy);
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } }); open();
});
afterEach(() => {
  cleanup(); Object.assign(PRINT_SECTIONS, original); analyticsStore.invalidate(); invalidateApiCache(); setTokenOverride(null);
  for (const key of ["print", "printReady", "printError", "theme"]) delete document.documentElement.dataset[key];
  document.documentElement.style.removeProperty("--print-header-scope"); document.documentElement.style.removeProperty("--print-footer-left");
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
it("cover on: renders the cover, then the contents, then tab headings and sections, then the notes", async () => {
  const view = render(<PrintReport />); await screen.findByRole("region", { name: "Report cover" });
  const order = [...view.container.querySelectorAll('.print-cover,.print-contents,.print-tab-heading,[data-print-section], [data-print-notes]')];
  expect(order.slice(0, 2).map(node => node.className)).toEqual(["print-cover", "print-contents"]);
  expect(order[2]).toHaveTextContent("Overview"); expect(order[3]).toHaveAttribute("data-print-section", ids[0]);
  expect(view.container.querySelector(".print-template [data-print-root]")).not.toBeNull();
  expect(view.container.querySelector("[data-print-root]")!.contains(screen.getByRole("region", { name: "Report cover" }))).toBe(false);
  expect(screen.getByRole("region", { name: "Notes" })).toBeInTheDocument();
});
it("cover off: no cover and no contents, tab headings and sections and the notes remain", async () => {
  open({ cover: false }); const view = render(<PrintReport />); await screen.findAllByText("SIPs"); // the contents list repeats the title
  expect(view.container.querySelector(".print-cover,.print-contents")).toBeNull(); expect(view.container.querySelectorAll("[data-print-section]")).toHaveLength(3); expect(screen.getByRole("region", { name: "Notes" })).toBeInTheDocument();
});
it("tab headings appear once per requested tab, in tab order, with the tab labels", async () => {
  open({ sectionIds: ["analytics-cost", "performance-returns", "overview-sips"] }); const view = render(<PrintReport />); await screen.findAllByText("SIPs"); // the contents list repeats the title
  expect([...view.container.querySelectorAll(".print-tab-title")].map(node => node.textContent)).toEqual(["Overview", "Performance", "Other Analytics", "Notes"]);
});
it("sections inside a tab follow its own order whatever the requested order", async () => {
  open({ sectionIds: [...ids].reverse() }); const view = render(<PrintReport />); await screen.findAllByText("SIPs");
  expect([...view.container.querySelectorAll("[data-print-section]")].map(node => node.getAttribute("data-print-section"))).toEqual(ids);
});
it("no SectionHeading is added around section cards", async () => {
  const view = render(<PrintReport />); await screen.findByRole("region", { name: "Notes" });
  expect(view.container.querySelectorAll(".print-section-heading")).toHaveLength(1);
  expect(screen.getByRole("region", { name: "Notes" }).querySelector(".print-section-heading")).not.toBeNull();
});
it("contents lists requested registry titles in their requested order and a final Notes entry", async () => {
  open({ sectionIds: [ids[1], ids[0], ids[2]] }); const view = render(<PrintReport />); await screen.findByRole("region", { name: "Contents" });
  expect(entries(view.container).map(node => node.querySelector(".print-contents-entry-title")?.textContent)).toEqual([PRINT_SECTIONS[ids[1]].title, PRINT_SECTIONS[ids[0]].title, PRINT_SECTIONS[ids[2]].title, "Notes"]);
});
it("contents pages are null initially and the page hook merges numbers without refetching", async () => {
  const view = render(<PrintReport />); await waitFor(() => expect(document.documentElement).toHaveAttribute("data-print-ready", "true"));
  expect(entries(view.container).map(node => node.querySelector("[data-contents-page]")?.textContent)).toEqual(["", "", "", ""]);
  const before = fetchSpy.mock.calls.length;
  await act(async () => { await window.__unifolioSetPrintPages!({ [ids[0]]: 4, notes: 9 }); });
  expect(entries(view.container).map(node => node.querySelector("[data-contents-page]")?.textContent)).toEqual(["4", "", "", "9"]);
  await act(async () => { await window.__unifolioSetPrintPages!({ [ids[1]]: 5 }); });
  expect(entries(view.container).map(node => node.querySelector("[data-contents-page]")?.textContent)).toEqual(["4", "5", "", "9"]); expect(fetchSpy).toHaveBeenCalledTimes(before);
  view.unmount(); expect(window.__unifolioSetPrintPages).toBeUndefined();
});
it("uses initial fragment pages and preserves them through the page hook", async () => {
  open({ pages: { [ids[0]]: 3, notes: 8 } }); const view = render(<PrintReport />); await screen.findByRole("region", { name: "Contents" });
  await act(async () => { await window.__unifolioSetPrintPages!({ [ids[1]]: 4 }); });
  expect(entries(view.container).map(node => node.querySelector("[data-contents-page]")?.textContent)).toEqual(["3", "4", "", "8"]);
});
it("the_hook_is_declared_and_sets_the_flag", async () => {
  const view = render(<PrintReport />); await screen.findByRole("region", { name: "Contents" });
  expect(window.__unifolioShowContentsOnly).toBeTypeOf("function");
  expect(document.documentElement.dataset.printContentsOnly).toBeUndefined();
  act(() => { window.__unifolioShowContentsOnly!(); window.__unifolioShowContentsOnly!(); });
  expect(document.documentElement.dataset.printContentsOnly).toBe("true");
  view.unmount();
  expect(window.__unifolioShowContentsOnly).toBeUndefined();
  expect(window.__unifolioSetPrintPages).toBeUndefined();
  expect(document.documentElement.dataset.printContentsOnly).toBeUndefined();
});
it("contents_only_mode_hides_sections_tab_headings_and_notes", async () => {
  const rule = contentsOnlyRule();
  expect(rule.slice(0, rule.indexOf("{")).split(",").map(selector => selector.trim())).toEqual([
    'html[data-print-contents-only="true"] .print-tab-heading',
    'html[data-print-contents-only="true"] [data-print-section]',
    'html[data-print-contents-only="true"] [data-print-notes]',
  ]);
  expect(rule).toMatch(/\{\s*display:\s*none\s*!important\s*;\s*\}/);
  const view = render(<PrintReport />); await screen.findByRole("region", { name: "Contents" });
  const selectors = [".print-tab-heading", "[data-print-section]", "[data-print-notes]"];
  const before = selectors.map(selector => [...view.container.querySelectorAll(selector)]);
  for (const nodes of before) expect(nodes.length).toBeGreaterThan(0);
  act(() => { window.__unifolioShowContentsOnly!(); });
  selectors.forEach((selector, index) => {
    const after = [...view.container.querySelectorAll(selector)];
    expect(after).toHaveLength(before[index].length);
    after.forEach((node, position) => expect(node).toBe(before[index][position]));
  });
});
it("contents_only_mode_keeps_cover_and_contents_unchanged", async () => {
  const view = render(<PrintReport />); await waitFor(() => expect(document.documentElement).toHaveAttribute("data-print-ready", "true"));
  await act(async () => { await window.__unifolioSetPrintPages!({ [ids[0]]: 3, [ids[1]]: 4, [ids[2]]: 5, notes: 6 }); });
  const roots = ["Report cover", "Contents"].map(name => screen.getByRole("region", { name }));
  const before = roots.map(node => node.outerHTML);
  act(() => { window.__unifolioShowContentsOnly!(); });
  expect(["Report cover", "Contents"].map(name => screen.getByRole("region", { name }).outerHTML)).toEqual(before);
  expect(entries(view.container).map(node => node.querySelector("[data-contents-page]")?.textContent)).toEqual(["3", "4", "5", "6"]);
  expect(contentsOnlyRule()).not.toMatch(/print-cover|print-contents\b(?!-only)/);
});
it.each([
  ["family with holder", "family", "Demo Holder", "Your family", "Demo Holder and family"],
  ["family without holder", "family", null, "Your family", "Your family"],
  ["member report", memberId, "Demo Holder", "Demo Member", "Demo Member"],
] as const)("%s: header and cover use the correct prepared name", async (_label, scope, holderName, scopeName, expected) => {
  open({ scope, meta: { holderName, scopeName, memberCount: 2 } }); const view = render(<PrintReport />); await screen.findByRole("region", { name: "Report cover" });
  expect(view.container.querySelector(".print-cover-name")).toHaveTextContent(expected); expect(view.container.querySelector(".print-running-header-scope")).toHaveTextContent(expected);
  if (scope !== "family") expect(view.container.querySelector(".print-cover-sub")).toHaveTextContent("Member report");
});
it("scopeLabel uses full report for all ids and a section count otherwise", async () => {
  open({ sectionIds: Object.keys(PRINT_SECTIONS) }); const view = render(<PrintReport />); expect(await screen.findByText("Family Combined, full report")).toBeInTheDocument(); view.unmount();
  open({ scope: memberId, sectionIds: Object.keys(PRINT_SECTIONS), meta: { ...defaults.meta, scopeName: "Demo Member" } }); const member = render(<PrintReport />); expect(await screen.findByText("Demo Member, full report")).toBeInTheDocument(); member.unmount();
  open(); render(<PrintReport />); expect(await screen.findByText("Your family, 3 sections")).toBeInTheDocument();
});
it("generated date uses the template's unpadded day in the cover and footer", async () => {
  vi.spyOn(Date.prototype, "toISOString").mockReturnValue("2026-11-05T12:00:00.000Z"); const view = render(<PrintReport />);
  expect(await screen.findByText("CONFIDENTIAL · PREPARED ON 5 NOV 2026")).toBeInTheDocument(); expect(view.container.querySelector(".print-running-footer")).toHaveTextContent("Generated 5 Nov 2026");
});
it("counts distinct scoped funds and folios, uses cached date parts and makes at most one template holdings request", async () => {
  setTokenOverride("demo-assembly-pass");
  fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify(analyticsMfB()), { status: 200 })); await analyticsStore.refresh("combined"); fetchSpy.mockClear();
  const view = render(<PrintReport />); await waitFor(() => expect(document.documentElement).toHaveAttribute("data-print-ready", "true"));
  expect(view.container.querySelector(".print-cover-sub")).toHaveTextContent("2 members · 2 funds · 2 folios");
  const prices = formatDataDateParts("prices", "2026-11-12")!; const disclosure = formatDataDateParts("holdings", assetAllocation().holdings_as_of)!;
  const cover = screen.getByRole("region", { name: "Report cover" });
  for (const part of [prices, disclosure]) { expect(within(cover).getByText(part.label)).toBeInTheDocument(); expect(within(cover).getByText(part.value)).toBeInTheDocument(); }
  expect(view.container.querySelector(".print-running-footer")).toHaveTextContent(formatDataDate("prices", "2026-11-12"));
  expect(screen.getByRole("region", { name: "Notes" }).textContent).toContain(formatDataDate("marketCapList", capAllocation().classification_as_of).replace(/^Market-cap list /, ""));
  expect(fetchSpy).toHaveBeenCalledTimes(1); expect(String(fetchSpy.mock.calls[0][0])).toContain("/household/aggregate/holdings");
});
it("updates cached analytics dates when a section settles without a template analytics read", async () => {
  function ReadSection() { const data = useMfAnalytics("asset_allocation"); usePrintSettled(ids[0], data.status !== "loading"); return null; }
  PRINT_SECTIONS[ids[0]] = { ...original[ids[0]], render: () => <ReadSection /> };
  fetchSpy.mockImplementation(async url => new Response(JSON.stringify(String(url).includes("/analytics/") ? analyticsMfB() : holdings()), { status: 200 }));
  render(<PrintReport />); await waitFor(() => expect(document.documentElement).toHaveAttribute("data-print-ready", "true"));
  const part = formatDataDateParts("holdings", assetAllocation().holdings_as_of)!; expect(within(screen.getByRole("region", { name: "Report cover" })).getByText(part.value)).toBeInTheDocument();
  expect(fetchSpy.mock.calls.filter(([url]) => String(url).includes("/analytics/"))).toHaveLength(1);
});
it("footer note is null and cover date columns are omitted when dataDates is false", async () => {
  open({ dataDates: false }); const view = render(<PrintReport />); await waitFor(() => expect(document.documentElement).toHaveAttribute("data-print-ready", "true"));
  expect(view.container.querySelectorAll(".print-cover-meta-label")).toHaveLength(1); expect(view.container.querySelector(".print-running-footer")).not.toHaveTextContent(formatDataDate("prices", "2026-11-12"));
});
it("every section starts with its invisible text marker and notes has its marker", async () => {
  const view = render(<PrintReport />); await screen.findByRole("region", { name: "Notes" });
  for (const node of view.container.querySelectorAll("[data-print-section],[data-print-notes]")) {
    const marker = node.firstElementChild!; expect(marker).toHaveAttribute("data-print-marker"); expect(marker).toHaveAttribute("aria-hidden", "true"); expect(marker).toHaveClass("print-section-marker");
    expect(marker.textContent).toBe(`[[sec:${node.getAttribute("data-print-section") ?? "notes"}]]`);
  }
  const css = readFileSync(resolve("src/print/print-markers.css"), "utf8");
  for (const rule of ["font-size: 1px", "line-height: 1px", "color: transparent", "height: 1px", "overflow: hidden", "margin: 0"]) expect(css).toContain(rule);
  expect(css).not.toMatch(/display:\s*none|visibility:\s*hidden/);
  expect(css).toContain("[data-print-notes]"); expect(css).toContain("break-before: page"); expect(css).toContain("break-before: auto");
});
it("the report is still ready only after all sections settled", async () => {
  let loaded = false;
  function Pending() { usePrintSettled(ids[0], loaded); return <p>Demo waiting section</p>; }
  PRINT_SECTIONS[ids[0]] = { ...original[ids[0]], render: () => <Pending /> }; const view = render(<PrintReport />); await screen.findByText("Demo waiting section");
  expect(document.documentElement).not.toHaveAttribute("data-print-ready"); loaded = true; view.rerender(<PrintReport />); await waitFor(() => expect(document.documentElement).toHaveAttribute("data-print-ready", "true"));
});
it.each(["loaded", "failed"])("the report waits for pending template data and becomes ready when it %s", async result => {
  let finish!: (response: Response) => void;
  let reject!: (reason: Error) => void; fetchSpy.mockImplementation(() => new Promise<Response>((success, failure) => { finish = success; reject = failure; }));
  const view = render(<PrintReport />); await screen.findByRole("region", { name: "Contents" }); expect(document.documentElement).not.toHaveAttribute("data-print-ready");
  await act(async () => { if (result === "failed") reject(new Error("Demo holdings failure")); else finish(new Response(JSON.stringify(holdings()), { status: 200 })); }); await waitFor(() => expect(document.documentElement).toHaveAttribute("data-print-ready", "true"));
  expect(view.container.querySelector(".print-cover-sub")).toHaveTextContent(result === "failed" ? "0 funds · 0 folios" : "2 funds · 2 folios"); expect(view.container.querySelectorAll(".print-cover-meta-label")).toHaveLength(result === "failed" ? 1 : 2);
});
