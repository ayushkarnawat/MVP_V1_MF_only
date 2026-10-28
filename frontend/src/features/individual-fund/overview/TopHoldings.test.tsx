import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../__support__/deferred";
import { IDS, fixture } from "../fixtures";
import type { CompositionResponse, HoldingsListResponse } from "../types";
import type { FundSection } from "../useFundSection";
import { TopHoldings } from "./TopHoldings";

const api = vi.hoisted(() => ({ holdings: vi.fn() }));
vi.mock("../api", () => ({ fundPageApi: api }));

const section = (over: Partial<FundSection<CompositionResponse>> = {}): FundSection<CompositionResponse> => ({
  status: "ready", data: fixture<CompositionResponse>("composition"), reason: null, error: null, retry: vi.fn(), ...over,
});

function mount(composition: FundSection<CompositionResponse> = section()) {
  return render(<TopHoldings schemeId={IDS.scheme} composition={composition} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.holdings.mockImplementation(() => Promise.resolve(fixture<HoldingsListResponse>("holdings_all")));
});

describe("TopHoldings", () => {
  it("test_ten_rows_in_two_columns_with_stock_count_and_as_of_date: five and five, ranked 1 to 10, with the stock count in the heading and the disclosure date under the list", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Top 10 Holdings (12 stocks)" })).toBeInTheDocument();
    const left = screen.getByTestId("top-col-1");
    const right = screen.getByTestId("top-col-2");
    expect(within(left).getAllByRole("button").map(b => b.getAttribute("data-testid"))).toEqual(["top-row-1", "top-row-2", "top-row-3", "top-row-4", "top-row-5"]);
    expect(within(right).getAllByRole("button").map(b => b.getAttribute("data-testid"))).toEqual(["top-row-6", "top-row-7", "top-row-8", "top-row-9", "top-row-10"]);
    const first = screen.getByTestId("top-row-1");
    expect(first).toHaveTextContent("1");
    expect(first).toHaveTextContent("Golden Stock 4");
    expect(first).toHaveTextContent("Healthcare");
    expect(first).toHaveTextContent("8.0%");
    expect(screen.getByTestId("top-row-6")).toHaveTextContent("Golden Stock 11");
    expect(screen.getByTestId("top-row-6")).toHaveTextContent("Industrials");
    expect(screen.getByTestId("top-row-6")).toHaveTextContent("7.0%");
    expect(screen.getByTestId("top-row-10")).toHaveTextContent("Golden Stock 1");
    expect(screen.getByTestId("top-row-10")).toHaveTextContent("Financial Services");
    expect(screen.getByTestId("top-row-10")).toHaveTextContent("5.0%");
    expect(screen.getByTestId("top-asof")).toHaveTextContent("Disclosure as of 30 Sep 2026.");
    expect(screen.queryByTestId("top-age-note")).toBeNull();
  });

  it("the stock count is singular for one stock", () => {
    const data = fixture<CompositionResponse>("composition");
    data.stock_count = 1;
    mount(section({ data }));
    expect(screen.getByRole("heading", { name: "Top 10 Holdings (1 stock)" })).toBeInTheDocument();
  });

  it("fewer than ten holdings fill the left column first; none at all says so", () => {
    const data = fixture<CompositionResponse>("composition");
    data.top10 = data.top10.slice(0, 7);
    mount(section({ data }));
    expect(within(screen.getByTestId("top-col-1")).getAllByRole("button")).toHaveLength(5);
    expect(within(screen.getByTestId("top-col-2")).getAllByRole("button")).toHaveLength(2);
    const none = fixture<CompositionResponse>("composition");
    none.top10 = [];
    none.stock_count = 0;
    mount(section({ data: none }));
    expect(screen.getByTestId("top-empty")).toHaveTextContent("No stock holdings in this fund's disclosure.");
  });

  it("test_row_opens_stock_popup: click, Enter and Space open the stock's dialog with its weight, sector and ISIN; Escape closes it", () => {
    mount();
    fireEvent.click(screen.getByTestId("top-row-3"));
    // Rank 3 in the golden is "Golden Stock 12": 8.0000 percent, sector "Unclassified", ISIN INEGOLD00011.
    const dialog = screen.getByRole("dialog", { name: "Golden Stock 12" });
    const value = (label: string) => within(dialog).getByText(label, { selector: "dt" }).nextElementSibling!.textContent;
    expect(value("Weight in this fund")).toBe("8.00%");
    expect(value("Sector")).toBe("Unclassified");
    expect(value("ISIN")).toBe("INEGOLD00011");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(screen.getByTestId("top-row-1"), { key: "Enter" });
    expect(screen.getByRole("dialog", { name: "Golden Stock 4" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    fireEvent.keyDown(screen.getByTestId("top-row-7"), { key: " " });
    expect(screen.getByRole("dialog", { name: "Golden Stock 2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    fireEvent.keyDown(screen.getByTestId("top-row-7"), { key: "a" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("every row is a focusable button with a dialog popup", () => {
    mount();
    for (let rank = 1; rank <= 10; rank += 1) {
      const row = screen.getByTestId(`top-row-${rank}`);
      expect(row).toHaveAttribute("tabindex", "0");
      expect(row).toHaveAttribute("aria-haspopup", "dialog");
    }
  });

  it("test_age_tag_note_when_older_than_60_days: the note appears only for that tag", () => {
    const data = fixture<CompositionResponse>("composition");
    data.age_tag = "older_than_60_days";
    mount(section({ data }));
    expect(screen.getByTestId("top-age-note")).toHaveTextContent("This disclosure is more than 60 days older than the latest price, so the holdings may have changed.");
  });

  it("test_no_disclosure_state_with_reason_text: the heading stays without a count, the reason is printed and there is no View all button", () => {
    mount(section({ status: "unavailable", data: null, reason: "no_disclosure" }));
    expect(screen.getByRole("heading", { name: "Top 10 Holdings" })).toBeInTheDocument();
    expect(screen.getByTestId("section-unavailable")).toHaveTextContent("Holdings not available yet for this fund house.");
    expect(screen.queryByRole("button", { name: /View all holdings/ })).toBeNull();
    expect(screen.queryByTestId("top-row-1")).toBeNull();
  });

  it("shows a loading status and a failed load with its own Retry", () => {
    const { unmount } = mount(section({ status: "loading", data: null }));
    expect(screen.getByRole("status", { name: "Loading holdings" })).toBeInTheDocument();
    unmount();
    const retry = vi.fn();
    mount(section({ status: "error", data: null, error: new Error("down"), retry }));
    expect(screen.getByText("Couldn't load holdings.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("test_view_all_opens_dialog_and_fetches_once: nothing is fetched until the button is pressed; the list is fetched on the first open and not again on the second", async () => {
    mount();
    expect(api.holdings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "View all holdings" }));
    expect(await screen.findByRole("dialog", { name: "All holdings, as of 30 Sep 2026" })).toBeInTheDocument();
    expect(api.holdings).toHaveBeenCalledTimes(1);
    expect(api.holdings).toHaveBeenCalledWith(IDS.scheme, expect.any(AbortSignal));
    // holdings_all: 14 rows (12 stocks, a government bond line and the cash line).
    expect(screen.getAllByTestId("all-row")).toHaveLength(14);
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View all holdings" }));
    expect(await screen.findByRole("dialog", { name: "All holdings, as of 30 Sep 2026" })).toBeInTheDocument();
    expect(api.holdings).toHaveBeenCalledTimes(1);
  });

  it("while the list is loading the dialog shows a loading status", async () => {
    const pending = deferred<HoldingsListResponse>();
    api.holdings.mockReturnValue(pending.promise);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "View all holdings" }));
    const dialog = screen.getByRole("dialog", { name: "All holdings" });
    expect(within(dialog).getByRole("status", { name: "Loading holdings" })).toBeInTheDocument();
    await act(async () => { pending.resolve(fixture<HoldingsListResponse>("holdings_all")); });
    expect(within(screen.getByRole("dialog")).getAllByTestId("all-row")).toHaveLength(14);
  });
});
