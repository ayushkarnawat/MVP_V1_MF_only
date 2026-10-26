import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderInShell } from "@/shell/testing";
import { deferred } from "../__support__/deferred";
import { IDS, fixture } from "../fixtures";
import type { CategoryReturnsResponse, InceptionReturnsResponse, ReturnsResponse, Unavailable } from "../types";
import { ReturnsTable } from "./ReturnsTable";

const api = vi.hoisted(() => ({ returns: vi.fn(), categoryReturns: vi.fn() }));
vi.mock("../api", () => ({ fundPageApi: api }));

const NAME = "Alpha Flexi Cap Fund - Direct Plan";
const inception = () => fixture<InceptionReturnsResponse>("returns_inception");
const current = () => fixture<ReturnsResponse>("returns_current");
const category = () => fixture<CategoryReturnsResponse>("peers_returns");
const members = [{ id: IDS.asha, name: "ASHA RAO" }, { id: IDS.dev, name: "Dev Rao" }];

function mount(scope = "combined", options: Parameters<typeof renderInShell>[1] = {}) {
  return renderInShell(<ReturnsTable schemeId={IDS.scheme} scope={scope} fundName={NAME} />, options);
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

  it("has a heading and an Inception | Current toggle with Inception pressed", async () => {
    mount();
    await screen.findByTestId("row-fund");
    expect(screen.getByRole("heading", { name: "Returns" })).toBeInTheDocument();
    const toggle = screen.getByRole("group", { name: "Returns basis" });
    expect(within(toggle).getAllByRole("button").map(b => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([["Inception", "true"], ["Current", "false"]]);
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
    expect(within(screen.getByTestId("row-benchmark")).getByRole("rowheader")).toHaveTextContent("Benchmark");
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
    expect(cell("cell-category-1Y")).toHaveTextContent("13.1%");
    expect(cell("cell-category-since_inception")).toHaveTextContent("13.0%");
    expect(cell("cell-category-1M")).toHaveTextContent("0.7%");
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
    expect(cell("cell-category-1Y")).toHaveTextContent("13.1%");
    expect(api.categoryReturns).toHaveBeenCalledTimes(2);
    expect(api.returns).toHaveBeenCalledTimes(1);
  });

  it("test_toggle_to_current_fetches_once_and_keeps_result", async () => {
    mount();
    await screen.findByTestId("row-fund");
    fireEvent.click(screen.getByRole("button", { name: "Current" }));
    await screen.findByText("Your holding (XIRR)");
    expect(api.returns).toHaveBeenCalledTimes(2);
    expect(api.returns).toHaveBeenLastCalledWith(IDS.scheme, "current", "combined", expect.any(AbortSignal));
    fireEvent.click(screen.getByRole("button", { name: "Inception" }));
    await screen.findByTestId("cell-fund-1M");
    fireEvent.click(screen.getByRole("button", { name: "Current" }));
    await screen.findByText("Your holding (XIRR)");
    expect(api.returns).toHaveBeenCalledTimes(2);
  });

  it("Current mode shows your XIRR against the same cash flows, dashes the periods longer than the holding, and its footnote", async () => {
    mount();
    await screen.findByTestId("row-fund");
    fireEvent.click(screen.getByRole("button", { name: "Current" }));
    await screen.findByText("Your holding (XIRR)");
    const headers = within(screen.getByRole("table")).getAllByRole("columnheader").map(h => h.textContent);
    expect(headers).toEqual(["Series", "1Y", "3Y", "5Y", "Since first investment"]);
    expect(screen.getByText("Benchmark, same cash flows")).toBeInTheDocument();
    expect(cell("cell-fund-1Y")).toHaveTextContent("18.5%");
    expect(cell("cell-fund-since_first_investment")).toHaveTextContent("18.5%");
    expect(cell("cell-benchmark-1Y")).toHaveTextContent("15.0%");
    expect(cell("cell-fund-3Y")).toHaveTextContent("—");
    expect(cell("cell-fund-3Y")).toHaveAttribute("title", "You have not held this fund for this long.");
    expect(cell("cell-benchmark-5Y")).toHaveTextContent("—");
    expect(screen.queryByTestId("row-category")).toBeNull();
    expect(screen.getByTestId("returns-note")).toHaveTextContent("Periods longer than you have held the fund are dashed.");
  });

  it("test_not_held_current_mode_shows_not_held_message, and Inception still works", async () => {
    api.returns.mockImplementation((_id: string, mode: string) => Promise.resolve(mode === "current" ? fixture<Unavailable>("returns_current_not_held") : inception()));
    mount(IDS.dev, { scope: { members, viewMode: "member", memberId: IDS.dev } });
    await screen.findByTestId("row-fund");
    fireEvent.click(screen.getByRole("button", { name: "Current" }));
    expect(await screen.findByTestId("returns-not-held")).toHaveTextContent("Not held by Dev Rao. Inception returns are still shown.");
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Inception" }));
    expect(await screen.findByTestId("row-fund")).toBeInTheDocument();
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
    view.rerender(<ReturnsTable schemeId={IDS.scheme} scope={IDS.dev} fundName={NAME} />);
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
    view.rerender(<ReturnsTable schemeId={IDS.scheme} scope={IDS.dev} fundName={NAME} />);
    const newer = inception();
    newer.rows.fund["1Y"] = "21.0000";
    await act(async () => { second.resolve(newer); });
    await act(async () => { first.resolve(inception()); });
    expect(cell("cell-fund-1Y")).toHaveTextContent("21.0%");
  });

  it("the Current result is fetched for the scope it was chosen in and refetched when the scope changes", async () => {
    const view = mount(IDS.asha);
    await screen.findByTestId("row-fund");
    fireEvent.click(screen.getByRole("button", { name: "Current" }));
    await screen.findByText("Your holding (XIRR)");
    view.rerender(<ReturnsTable schemeId={IDS.scheme} scope={IDS.dev} fundName={NAME} />);
    await screen.findByText("Your holding (XIRR)");
    const calls = api.returns.mock.calls.map(call => `${call[1]}:${call[2]}`);
    expect(calls).toEqual([`inception:${IDS.asha}`, `current:${IDS.asha}`, `inception:${IDS.dev}`, `current:${IDS.dev}`]);
  });
});
