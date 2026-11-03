import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderInShell } from "@/shell/testing";
import { deferred } from "../__support__/deferred";
import { IDS, fixture } from "../fixtures";
import type { CategoryReturnsResponse, InceptionReturnsResponse, ReturnsResponse, Unavailable } from "../types";
import type { FundSection } from "../useFundSection";
import { ReturnsTable } from "./ReturnsTable";

const api = vi.hoisted(() => ({ returns: vi.fn(), categoryReturns: vi.fn() }));
vi.mock("../api", () => ({ fundPageApi: api }));

const NAME = "Alpha Flexi Cap Fund - Direct Plan";
const inception = () => fixture<InceptionReturnsResponse>("returns_inception");
const current = () => fixture<ReturnsResponse>("returns_current");
const category = () => fixture<CategoryReturnsResponse>("peers_returns");
const members = [{ id: IDS.asha, name: "ASHA RAO" }, { id: IDS.dev, name: "Dev Rao" }];

// UI round 2 (task 4.3): the page owns the mode and the Current request; the table gets them as props.
const NO_CURRENT: FundSection<ReturnsResponse> = { status: "loading", data: null, reason: null, error: null, retry: () => {} };
const ready = (data: ReturnsResponse): FundSection<ReturnsResponse> => ({ status: "ready", data, reason: null, error: null, retry: vi.fn() });
const notHeld: FundSection<ReturnsResponse> = { status: "unavailable", data: null, reason: "not_held", error: null, retry: vi.fn() };

function mount(scope = "combined", options: Parameters<typeof renderInShell>[1] = {}, props: { mode?: "inception" | "current"; current?: FundSection<ReturnsResponse> } = {}) {
  return renderInShell(<ReturnsTable schemeId={IDS.scheme} scope={scope} fundName={NAME} mode={props.mode ?? "inception"} current={props.current ?? NO_CURRENT} />, options);
}
const cell = (id: string) => screen.getByTestId(id);

beforeEach(() => {
  vi.clearAllMocks();
  api.returns.mockImplementation((_id: string, mode: string) => Promise.resolve(mode === "current" ? current() : inception()));
  api.categoryReturns.mockImplementation(() => Promise.resolve(category()));
});

describe("ReturnsTable", () => {
  it("asks for the inception table for the scope and for the category returns once", async () => {
    mount("combined");
    await screen.findByTestId("row-fund");
    expect(api.returns).toHaveBeenCalledTimes(1);
    expect(api.returns).toHaveBeenCalledWith(IDS.scheme, "inception", "combined", expect.any(AbortSignal));
    expect(api.categoryReturns).toHaveBeenCalledTimes(1);
    expect(api.categoryReturns).toHaveBeenCalledWith(IDS.scheme, expect.any(AbortSignal));
  });

  it("has a Returns heading and no toggle of its own (the toggle moved into the performance card)", async () => {
    mount();
    await screen.findByTestId("row-fund");
    expect(screen.getByRole("heading", { name: "Returns" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Returns basis" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Actual XIRR" })).toBeNull();
  });

  it("shows a loading status, then the table", async () => {
    const pending = deferred<ReturnsResponse>();
    api.returns.mockReturnValue(pending.promise);
    mount();
    expect(screen.getByRole("status", { name: "Loading returns" })).toBeInTheDocument();
    await act(async () => { pending.resolve(inception()); });
    expect(screen.getByTestId("row-fund")).toBeInTheDocument();
  });

  it("test_inception_shows_fund_benchmark_category_rows_and_footnote", async () => {
    mount();
    await screen.findByTestId("row-fund");
    const headers = within(screen.getByRole("table")).getAllByRole("columnheader").map(h => h.textContent);
    expect(headers).toEqual(["Series", "1M", "3M", "6M", "1Y", "3Y", "5Y", "Since inception"]);
    expect(within(screen.getByTestId("row-fund")).getByRole("rowheader")).toHaveTextContent(NAME);
    // The golden now carries benchmark_label (backend task 4.1), so the row is named after the index.
    expect(within(screen.getByTestId("row-benchmark")).getByRole("rowheader")).toHaveTextContent("Nifty 500");
    expect(within(screen.getByTestId("row-category")).getByRole("rowheader")).toHaveTextContent("Category average");
    expect(screen.getByTestId("returns-note")).toHaveTextContent("Up to 1 year absolute; over 1 year annualised.");
    expect(cell("cell-fund-1M")).toHaveTextContent("0.8%");
    expect(cell("cell-fund-1Y")).toHaveTextContent("10.0%");
    expect(cell("cell-fund-since_inception")).toHaveTextContent("10.0%");
    expect(cell("cell-benchmark-1Y")).toHaveTextContent("12.0%");
  });

  it("a period with no figure is a dash with a tooltip", async () => {
    mount();
    await screen.findByTestId("row-fund");
    // The real golden has a figure for every period (5Y included: 10.0000 and 12.0000).
    expect(cell("cell-fund-5Y")).toHaveTextContent("10.0%");
    expect(cell("cell-benchmark-5Y")).toHaveTextContent("12.0%");
    expect(cell("cell-fund-5Y")).not.toHaveAttribute("title");
    cleanup();
    // A young fund has no 5Y figure: the contract sends null, the cell is a dash with a tooltip.
    const young = inception();
    young.rows.fund["5Y"] = null;
    young.rows.benchmark!["5Y"] = null;
    api.returns.mockImplementation(() => Promise.resolve(young));
    mount();
    await screen.findByTestId("row-fund");
    expect(cell("cell-fund-5Y")).toHaveTextContent("—");
    expect(cell("cell-fund-5Y")).toHaveAttribute("title", "No history for this period yet.");
    expect(cell("cell-benchmark-5Y")).toHaveTextContent("—");
  });

  it("only the fund row is coloured by sign; benchmark and category are plain", async () => {
    const body = inception();
    body.rows.fund["1M"] = "-1.2000";
    api.returns.mockImplementation(() => Promise.resolve(body));
    mount();
    await screen.findByTestId("row-fund");
    expect(cell("cell-fund-1M")).toHaveAttribute("data-direction", "down");
    expect(cell("cell-fund-1M").className).toContain("text-[var(--neg-text)]");
    expect(cell("cell-fund-1Y")).toHaveAttribute("data-direction", "up");
    expect(cell("cell-fund-1Y").className).toContain("text-[var(--pos-text)]");
    expect(cell("cell-benchmark-1Y")).not.toHaveAttribute("data-direction");
    expect(cell("cell-benchmark-1Y").className).not.toContain("pos-text");
  });

  it("test_category_cells_pending_then_filled", async () => {
    const slow = deferred<CategoryReturnsResponse>();
    api.categoryReturns.mockReturnValue(slow.promise);
    mount();
    await screen.findByTestId("row-fund");
    expect(cell("cell-category-1Y")).toHaveAttribute("data-state", "pending");
    expect(cell("cell-fund-1Y")).toHaveTextContent("10.0%");
    await act(async () => { slow.resolve(category()); });
    expect(cell("cell-category-1Y")).not.toHaveAttribute("data-state");
    // peers_returns: 1Y 10.8332, since inception 10.8333, 1M 0.8483.
    expect(cell("cell-category-1Y")).toHaveTextContent("10.8%");
    expect(cell("cell-category-since_inception")).toHaveTextContent("10.8%");
    expect(cell("cell-category-1M")).toHaveTextContent("0.8%");
  });

  it("unavailable category figures are dashes with the reason as a tooltip", async () => {
    api.categoryReturns.mockImplementation(() => Promise.resolve(fixture<Unavailable>("peers_unavailable")));
    mount();
    await screen.findByTestId("row-fund");
    await act(async () => {});
    expect(cell("cell-category-1Y")).toHaveTextContent("—");
    expect(cell("cell-category-1Y")).toHaveAttribute("title", "Category comparison is not available for this fund yet.");
  });

  it("a failed category row has its own Retry that refetches only the category", async () => {
    api.categoryReturns.mockRejectedValueOnce(new Error("slow")).mockImplementation(() => Promise.resolve(category()));
    mount();
    await screen.findByTestId("row-fund");
    await act(async () => {});
    expect(cell("cell-category-1Y")).toHaveAttribute("title", "Category figures could not be loaded");
    fireEvent.click(screen.getByRole("button", { name: "Retry category returns" }));
    await act(async () => {});
    expect(cell("cell-category-1Y")).toHaveTextContent("10.8%");
    expect(api.categoryReturns).toHaveBeenCalledTimes(2);
    expect(api.returns).toHaveBeenCalledTimes(1);
  });

  it("never asks for the Current returns itself: it reads them from props", async () => {
    mount("combined", {}, { mode: "current", current: ready(current()) });
    await screen.findByText("Your holding (XIRR)");
    expect(api.returns).not.toHaveBeenCalledWith(IDS.scheme, "current", expect.anything(), expect.anything());
  });

  it("Current mode shows your XIRR against the same cash flows, dashes the periods longer than the holding, and its footnote", async () => {
    mount("combined", {}, { mode: "current", current: ready(current()) });
    await screen.findByText("Your holding (XIRR)");
    const headers = within(screen.getByRole("table")).getAllByRole("columnheader").map(h => h.textContent);
    expect(headers).toEqual(["Series", "1Y", "3Y", "5Y", "Since first investment"]);
    expect(screen.getByText("Benchmark, same cash flows")).toBeInTheDocument();
    // returns_current: holding XIRR 9.9997 (1Y) and 22.8418 (since first investment); benchmark with the same flows 12.0000.
    expect(cell("cell-fund-1Y")).toHaveTextContent("10.0%");
    expect(cell("cell-fund-since_first_investment")).toHaveTextContent("22.8%");
    expect(cell("cell-benchmark-1Y")).toHaveTextContent("12.0%");
    expect(cell("cell-benchmark-since_first_investment")).toHaveTextContent("12.0%");
    expect(cell("cell-fund-3Y")).toHaveTextContent("—");
    expect(cell("cell-fund-3Y")).toHaveAttribute("title", "You have not held this fund for this long.");
    expect(cell("cell-benchmark-5Y")).toHaveTextContent("—");
    expect(screen.queryByTestId("row-category")).toBeNull();
    expect(screen.getByTestId("returns-note")).toHaveTextContent("Periods longer than you have held the fund are dashed.");
  });

  it("test_not_held_current_mode_shows_not_held_message", async () => {
    mount(IDS.dev, { scope: { members, viewMode: "member", memberId: IDS.dev } }, { mode: "current", current: notHeld });
    expect(await screen.findByTestId("returns-not-held")).toHaveTextContent("Not held by Dev Rao. Inception returns are still shown.");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("not held in the family view names no member even when one is stored", async () => {
    mount("combined", { scope: { members, viewMode: "aggregate", memberId: IDS.asha } }, { mode: "current", current: notHeld });
    expect(await screen.findByTestId("returns-not-held")).toHaveTextContent("Not held by anyone in your family. Inception returns are still shown.");
  });

  it("test_non_equity_has_no_benchmark_row, and says why", async () => {
    const body = inception();
    body.rows.benchmark = null;
    body.benchmark_reason = "no_benchmark";
    api.returns.mockImplementation(() => Promise.resolve(body));
    mount();
    await screen.findByTestId("row-fund");
    expect(screen.queryByTestId("row-benchmark")).toBeNull();
    expect(screen.getByTestId("returns-benchmark-note")).toHaveTextContent("No benchmark applies to this fund type.");
    expect(screen.getByTestId("row-category")).toBeInTheDocument();
  });

  it("a benchmark without TRI history gets its own note", async () => {
    const body = inception();
    body.rows.benchmark = null;
    body.benchmark_reason = "no_history";
    api.returns.mockImplementation(() => Promise.resolve(body));
    mount();
    await screen.findByTestId("row-fund");
    expect(screen.getByTestId("returns-benchmark-note")).toHaveTextContent("Benchmark history is not available yet.");
  });

  it("a failed table shows its own error and Retry refetches it", async () => {
    api.returns.mockRejectedValueOnce(new Error("down")).mockImplementation(() => Promise.resolve(inception()));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load returns.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByTestId("row-fund");
    expect(api.returns).toHaveBeenCalledTimes(2);
  });

  it("an unavailable table shows its reason", async () => {
    api.returns.mockImplementation(() => Promise.resolve({ status: "unavailable", reason: "no_history" }));
    mount();
    expect(await screen.findByTestId("section-unavailable")).toHaveTextContent("No price history yet for this fund.");
  });

  it("a new scope refetches the returns for it (and the category, which is fund-level, is not asked again)", async () => {
    const view = mount(IDS.asha);
    await screen.findByTestId("row-fund");
    view.rerender(<ReturnsTable schemeId={IDS.scheme} scope={IDS.dev} fundName={NAME} mode="inception" current={NO_CURRENT} />);
    await act(async () => {});
    expect(api.returns).toHaveBeenLastCalledWith(IDS.scheme, "inception", IDS.dev, expect.any(AbortSignal));
    expect(api.returns).toHaveBeenCalledTimes(2);
    expect(api.categoryReturns).toHaveBeenCalledTimes(1);
  });

  it("a late answer for the previous scope does not overwrite the current one", async () => {
    const first = deferred<ReturnsResponse>();
    const second = deferred<ReturnsResponse>();
    api.returns.mockImplementation((_id: string, _mode: string, scope: string) => (scope === IDS.asha ? first.promise : second.promise));
    const view = mount(IDS.asha);
    view.rerender(<ReturnsTable schemeId={IDS.scheme} scope={IDS.dev} fundName={NAME} mode="inception" current={NO_CURRENT} />);
    const newer = inception();
    newer.rows.fund["1Y"] = "21.0000";
    await act(async () => { second.resolve(newer); });
    await act(async () => { first.resolve(inception()); });
    expect(cell("cell-fund-1Y")).toHaveTextContent("21.0%");
  });

  it("a Current section still loading shows the loading status", async () => {
    mount("combined", {}, { mode: "current", current: NO_CURRENT });
    expect(await screen.findByRole("status", { name: "Loading returns" })).toBeInTheDocument();
    expect(screen.queryByTestId("row-fund")).toBeNull();
  });

  it("test_benchmark_row_uses_the_api_label_when_present_and_falls_back_to_Benchmark (additive field, register C124)", async () => {
    const labelled = inception();
    labelled.benchmark_label = "Nifty 500 TRI";
    api.returns.mockImplementation((_id: string, mode: string) => Promise.resolve(mode === "current" ? { ...current(), benchmark_label: "Nifty 500 TRI" } : labelled));
    mount();
    await screen.findByTestId("row-fund");
    expect(within(screen.getByTestId("row-benchmark")).getByRole("rowheader")).toHaveTextContent("Nifty 500 TRI");
    cleanup();
    // The Current table compares the same cash flows, so its row keeps its own wording.
    mount("combined", {}, { mode: "current", current: ready({ ...current(), benchmark_label: "Nifty 500 TRI" } as ReturnsResponse) });
    expect(await screen.findByText("Benchmark, same cash flows")).toBeInTheDocument();
    cleanup();
    const unlabelled = inception();
    unlabelled.benchmark_label = null;
    api.returns.mockImplementation(() => Promise.resolve(unlabelled));
    mount();
    await screen.findByTestId("row-fund");
    expect(within(screen.getByTestId("row-benchmark")).getByRole("rowheader").textContent).toBe("Benchmark");
  });
});


it("shows the source and backend note for a printed benchmark without changing its numbers", async () => {
  api.returns.mockResolvedValue(Object.assign(inception(), {
    benchmark_source: "factsheet", declared_benchmark_name: "Nifty 500 TRI",
    benchmark_note: "Printed in the factsheet as of 30 Sep 2026.", printed_as_of: "2026-09-30",
  }));
  mount(); await screen.findByTestId("row-fund");
  const details = screen.getByTestId("returns-benchmark-details");
  expect(details).toHaveTextContent("From the fund's factsheet");
  expect(details).toHaveTextContent("How this benchmark was chosen: From the fund's factsheet. This is the index named in the fund's own factsheet.");
  expect(details).toHaveTextContent("Printed in the factsheet as of 30 Sep 2026.");
  expect(details).not.toHaveTextContent("TRI");

  const infoBtn = screen.getByRole("button", { name: /benchmark note/i });
  expect(infoBtn).toBeInTheDocument();
  const tooltip = screen.getByTestId("benchmark-note-tooltip");
  expect(tooltip).not.toBeVisible();
  fireEvent.focus(infoBtn);
  expect(tooltip).toBeVisible();
  expect(tooltip).toHaveTextContent("Printed in the factsheet as of 30 Sep 2026.");
  fireEvent.blur(infoBtn);
  expect(tooltip).not.toBeVisible();
});


it("says printed figures are the fund house's, not 'No benchmark', when we hold no series", async () => {
  api.returns.mockResolvedValue(Object.assign(inception(), {
    benchmark_source: "none", declared_benchmark_name: "CRISIL Liquid Debt A-I Index", printed_as_of: "2026-09-30",
  }));
  mount(); await screen.findByTestId("row-fund");
  const details = screen.getByTestId("returns-benchmark-details");
  expect(details).toHaveTextContent("As printed in the fund house's factsheet");
  expect(details).toHaveTextContent("How this benchmark was chosen: As printed in the fund house's factsheet. We cannot build this index ourselves. These returns are printed in the fund house's factsheet.");
  expect(details).toHaveTextContent("CRISIL Liquid Debt A-I Index");
  expect(details).not.toHaveTextContent("No benchmark");
  expect(screen.queryByRole("button", { name: /benchmark note/i })).not.toBeInTheDocument();
});
