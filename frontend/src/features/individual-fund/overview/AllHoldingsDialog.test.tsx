import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDS, fixture } from "../fixtures";
import type { HoldingsListResponse, Unavailable } from "../types";
import { AllHoldingsDialog } from "./AllHoldingsDialog";

const api = vi.hoisted(() => ({ holdings: vi.fn() }));
vi.mock("../api", () => ({ fundPageApi: api }));

const list = () => fixture<HoldingsListResponse>("holdings_all");

function mount(isOpen = true, onClose = vi.fn()) {
  const view = render(<AllHoldingsDialog schemeId={IDS.scheme} isOpen={isOpen} onClose={onClose} />);
  return { ...view, onClose, show: (open: boolean) => view.rerender(<AllHoldingsDialog schemeId={IDS.scheme} isOpen={open} onClose={onClose} />) };
}
const names = () => screen.getAllByTestId("all-row").map(row => within(row).getAllByRole("cell")[1].textContent);

beforeEach(() => {
  vi.clearAllMocks();
  api.holdings.mockImplementation(() => Promise.resolve(list()));
});

describe("AllHoldingsDialog", () => {
  it("renders nothing and fetches nothing while it is closed", () => {
    mount(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.holdings).not.toHaveBeenCalled();
  });

  it("fetches the list when it first opens, and titles the dialog with the disclosure date and the count", async () => {
    mount();
    expect(await screen.findByRole("dialog", { name: "All holdings, as of 30 Sep 2026" })).toBeInTheDocument();
    expect(api.holdings).toHaveBeenCalledTimes(1);
    expect(api.holdings).toHaveBeenCalledWith(IDS.scheme, expect.any(AbortSignal));
    expect(screen.getByTestId("all-count")).toHaveTextContent("14 holdings");
    expect(screen.getAllByTestId("all-row")).toHaveLength(14);
    // The golden's heaviest line is a government bond with no ISIN (12 percent): it ranks first, its sector is Sovereign.
    const first = within(screen.getAllByTestId("all-row")[0]).getAllByRole("cell").map(cell => cell.textContent);
    expect(first).toEqual(["1", "Government Bond", "Sovereign", "12.00%"]);
    const last = within(screen.getAllByTestId("all-row")[13]).getAllByRole("cell").map(cell => cell.textContent);
    expect(last).toEqual(["14", "Cash and equivalents", "Unclassified", "4.00%"]);
  });

  it("test_view_all_fetches_once: closing and opening again keeps the list and does not ask again", async () => {
    const view = mount();
    await screen.findByTestId("all-count");
    view.show(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    view.show(true);
    expect(await screen.findByTestId("all-count")).toBeInTheDocument();
    expect(api.holdings).toHaveBeenCalledTimes(1);
  });

  it("test_dialog_sortable_by_weight_and_name: weight high to low first, then each header sorts and toggles, and the ranks renumber", async () => {
    mount();
    await screen.findByTestId("all-count");
    const stock = screen.getByRole("columnheader", { name: "Stock" });
    const weight = screen.getByRole("columnheader", { name: "Weight" });
    expect(weight).toHaveAttribute("aria-sort", "descending");
    expect(stock).toHaveAttribute("aria-sort", "none");
    expect(names()[0]).toBe("Government Bond");
    // Equal weights keep the order the API gave: Golden Stock 4, 8 and 12 (all 8.0) stay in that order, ahead of the 7.0 group.
    expect(names().slice(1, 7)).toEqual(["Golden Stock 4", "Golden Stock 8", "Golden Stock 12", "Golden Stock 3", "Golden Stock 7", "Golden Stock 11"]);

    fireEvent.click(within(weight).getByRole("button", { name: "Weight" }));
    expect(weight).toHaveAttribute("aria-sort", "ascending");
    expect(names()[0]).toBe("Cash and equivalents");
    expect(names().at(-1)).toBe("Government Bond");
    // Ascending keeps the API order inside a tie too: the three 5.0 stocks come as Golden Stock 1, 5, 9.
    expect(names().slice(1, 4)).toEqual(["Golden Stock 1", "Golden Stock 5", "Golden Stock 9"]);
    fireEvent.click(within(weight).getByRole("button", { name: "Weight" }));
    expect(weight).toHaveAttribute("aria-sort", "descending");
    expect(names()[0]).toBe("Government Bond");

    fireEvent.click(within(stock).getByRole("button", { name: "Stock" }));
    expect(stock).toHaveAttribute("aria-sort", "ascending");
    expect(weight).toHaveAttribute("aria-sort", "none");
    // Plain text order: "Golden Stock 1" is before "Golden Stock 10", which is before "Golden Stock 2"; the bond is last.
    expect(names().slice(0, 5)).toEqual(["Cash and equivalents", "Golden Stock 1", "Golden Stock 10", "Golden Stock 11", "Golden Stock 12"]);
    expect(within(screen.getAllByTestId("all-row")[0]).getAllByRole("cell")[0]).toHaveTextContent("1");
    expect(within(screen.getAllByTestId("all-row")[13]).getAllByRole("cell")[0]).toHaveTextContent("14");
    fireEvent.click(within(stock).getByRole("button", { name: "Stock" }));
    expect(stock).toHaveAttribute("aria-sort", "descending");
    expect(names()[0]).toBe("Government Bond");
    expect(names().at(-1)).toBe("Cash and equivalents");

    fireEvent.click(within(weight).getByRole("button", { name: "Weight" }));
    expect(weight).toHaveAttribute("aria-sort", "descending");
    expect(names()[0]).toBe("Government Bond");
  });

  it("is singular for one holding and notes an old disclosure", async () => {
    const body = list();
    body.count = 1;
    body.rows = body.rows.slice(0, 1);
    body.age_tag = "older_than_60_days";
    api.holdings.mockResolvedValue(body);
    mount();
    expect(await screen.findByTestId("all-count")).toHaveTextContent("1 holding");
    expect(screen.getByTestId("all-age-note")).toHaveTextContent("This disclosure is more than 60 days older than the latest price, so the holdings may have changed.");
  });

  it("shows no note when the disclosure is recent", async () => {
    mount();
    await screen.findByTestId("all-count");
    expect(screen.queryByTestId("all-age-note")).toBeNull();
  });

  it("shows the reason when the fund house has no disclosure, and an error with Retry when the request fails", async () => {
    api.holdings.mockResolvedValueOnce(fixture<Unavailable>("composition_no_disclosure"));
    const view = mount();
    expect(await screen.findByTestId("section-unavailable")).toHaveTextContent("Holdings not available yet for this fund house.");
    view.unmount();
    api.holdings.mockReset();
    api.holdings.mockRejectedValueOnce(new Error("down")).mockImplementation(() => Promise.resolve(list()));
    mount();
    expect(await screen.findByText("Couldn't load holdings.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("all-count")).toBeInTheDocument();
    expect(api.holdings).toHaveBeenCalledTimes(2);
  });

  it("closes with the close button and with Escape", async () => {
    const { onClose } = mount();
    await screen.findByTestId("all-count");
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
