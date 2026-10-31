import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fb from "../fixtures/mfB";
import { expectInteractivity } from "../testing";
import type { FundManagerAllocationSummary } from "../types";
import { FundManagerCard } from "./FundManagerCard";
import { renderInShell as render } from "@/shell/testing";

const scrollIntoView = vi.fn();
beforeEach(() => {
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  delete (Element.prototype as Partial<Element>).scrollIntoView;
});

const XIRR = { "S-KOTAK": "0.1420", "S-JM": "0.1860", "S-HDFC": "0.2130" };
function mount(data: FundManagerAllocationSummary | null = fb.fundManager(), state: "loading" | "ready" | "failed" | "error" = "ready", onRetry = vi.fn(), xirr: Record<string, string | null> = XIRR) {
  return render(<FundManagerCard state={state} data={data} onRetry={onRetry} xirrByScheme={xirr} />);
}
const KOTAK = "harsha-upadhyaya-kotak-mahindra-mf";
const HDFC = "chirag-setalvad-hdfc-mf";
const SATISH = "satish-ramanathan-jm-financial-mf";


describe("manager cards and table detail", () => {
  it("shows manager names, fund houses, whole values and portfolio shares", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Fund Manager Allocation" })).toBeInTheDocument();
    const rows = screen.getAllByTestId(/^manager-row-/);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Harsha Upadhyaya");
    expect(rows[0]).toHaveTextContent("Kotak Mahindra MF");
    expect(rows[0]).toHaveTextContent("₹15,40,000");
    expect(rows[0]).toHaveTextContent("33.1%");
    expect(rows[2]).toHaveTextContent("₹9,80,000");
    expect(screen.queryByText("Asit Bhandarkar")).not.toBeInTheDocument();
  });
  it("shows the covered totals in both views", () => {
    mount();
    expect(screen.getByTestId("covered-value")).toHaveTextContent("₹38,30,000");
    expect(screen.getByTestId("covered-pct")).toHaveTextContent("82.4%");
    fireEvent.click(screen.getByRole("radio", { name: "Table" }));
    expect(screen.getByRole("row", { name: /Covered by manager data/ })).toBeInTheDocument();
    expect(screen.getByTestId("covered-value")).toHaveTextContent("₹38,30,000");
  });
  it("counts and lists funds with no manager data", () => {
    mount();
    expect(screen.getByText("1 fund has no manager data yet.")).toBeInTheDocument();
    expect(screen.getByText("SBI Bluechip Fund (SBI Mutual Fund)")).toBeInTheDocument();
  });
  it("keeps a portfolio containing only unavailable funds visible", () => {
    const data = fb.fundManager();
    data.manager_groups = [];
    mount(data);
    expect(screen.getByText("1 fund has no manager data yet.")).toBeInTheDocument();
    expect(screen.queryByText("No fund manager data available")).not.toBeInTheDocument();
  });
  it("shows the empty, loading and failure states", () => {
    const { unmount } = mount(null);
    expect(screen.getByText("No fund manager data available")).toBeInTheDocument();
    unmount();
    const loading = mount(null, "loading");
    expect(screen.getByRole("status", { name: "Loading Fund Manager Allocation" })).toBeInTheDocument();
    loading.unmount();
    const retry = vi.fn();
    mount(null, "failed", retry);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it("expands fund links and XIRR in Cards and preserves the open manager in Table", () => {
    mount();
    fireEvent.click(within(screen.getByTestId(`manager-row-${KOTAK}`)).getByRole("button", { name: "Harsha Upadhyaya" }));
    expect(screen.getByTestId(`manager-fund-${KOTAK}-S-KOTAK`)).toHaveTextContent("₹15,40,000 · XIRR 14.2%");
    expect(screen.getByRole("link", { name: "Kotak Multi Cap Fund" })).toHaveAttribute("href", "/portfolio/mutual-funds/funds/S-KOTAK");
    fireEvent.click(screen.getByRole("radio", { name: "Table" }));
    const row = screen.getByTestId(`manager-row-${KOTAK}`);
    expect(row.nextElementSibling).toBe(screen.getByTestId(`manager-detail-${KOTAK}`));
    fireEvent.click(within(screen.getByTestId(`manager-row-${SATISH}`)).getByRole("button", { name: "Satish Ramanathan" }));
    expect(screen.queryByTestId(`manager-detail-${KOTAK}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`manager-fund-${SATISH}-S-JM`)).toHaveTextContent("₹9,80,000 · XIRR 18.6%");
    expect(document.querySelectorAll("button a")).toHaveLength(0);
  });
  it("shows a dash for a missing XIRR and toggles detail closed", () => {
    mount(fb.fundManager(), "ready", vi.fn(), {});
    const button = within(screen.getByTestId(`manager-row-${KOTAK}`)).getByRole("button", { name: "Harsha Upadhyaya" });
    fireEvent.click(button);
    expect(screen.getByTestId(`manager-fund-${KOTAK}-S-KOTAK`)).toHaveTextContent("XIRR —");
    fireEvent.click(button);
    expect(screen.queryByTestId(`manager-detail-${KOTAK}`)).not.toBeInTheDocument();
  });
  it("marks every control in both views", () => {
    const { container } = mount();
    expectInteractivity(container, 5);
    fireEvent.click(screen.getByRole("radio", { name: "Table" }));
    expectInteractivity(container, 5);
  });
});

function mainManagers() {
  const data = fb.fundManager();
  data.manager_groups.forEach(group => Object.assign(group, { main_source: "assumed" }));
  return data;
}

describe("T1.3 main manager", () => {
  it("opens on Cards", () => {
    mount(mainManagers());
    expect(screen.getByRole("radio", { name: "Cards" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("list", { name: "Fund manager cards" })).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Fund manager allocation" })).not.toBeInTheDocument();
  });
  it("Table view is today's table", () => {
    mount(mainManagers());
    expect(screen.getByRole("radio", { name: "Cards" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Table" }));
    const table = within(screen.getByRole("table", { name: "Fund manager allocation" }));
    expect(table.getAllByRole("columnheader").map(header => header.textContent)).toEqual(["Fund manager", "AMC", "Current value", "% of overall portfolio"]);
    expect(table.getByRole("row", { name: /Covered by manager data/ })).toBeInTheDocument();
  });
  it("no Donut or Bar Chart option exists", () => {
    mount(mainManagers());
    expect(screen.queryByRole("radio", { name: "Donut" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Bar Chart" })).not.toBeInTheDocument();
  });
  it("the sentence about funds divided equally is gone", () => {
    mount(mainManagers());
    expect(screen.queryByText(/divided equally/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Table" }));
    expect(screen.queryByText(/divided equally/i)).not.toBeInTheDocument();
  });
  it("shows an assumed marker on assumed managers", () => {
    const data = mainManagers();
    Object.assign(data.manager_groups[1], { main_source: "marked" });
    mount(data);
    expect(within(screen.getByTestId(`manager-row-${KOTAK}`)).getByText(/Assumed main manager/)).toBeInTheDocument();
    expect(within(screen.getByTestId(`manager-row-${HDFC}`)).queryByText(/Assumed main manager/)).not.toBeInTheDocument();
  });
  it("no LinkedIn icon renders", () => {
    const { container } = mount(mainManagers());
    expect(screen.getByRole("radio", { name: "Cards" })).toBeInTheDocument();
    expect(container.querySelector('[class*="linkedin"], a[href*="linkedin"]')).toBeNull();
    expect(screen.queryByLabelText(/linkedin/i)).not.toBeInTheDocument();
  });
  it("a stored payload without main_source renders as updating", () => {
    const old = fb.fundManager();
    old.manager_groups.forEach(group => { delete group.main_source; });
    mount(old);
    expect(screen.getByRole("status")).toHaveTextContent(/updating/i);
    expect(screen.getByRole("heading", { name: "Fund Manager Allocation" })).toBeInTheDocument();
  });
});


describe("single-manager fund groups", () => {
  it("shows no assumed marker for a group made only of single-manager funds", () => {
    const data = fb.fundManager();
    const group = data.manager_groups[0];
    data.manager_groups = [{
      ...group,
      main_source: "marked",
      total_household_value: "300.00",
      percentage: "100.00",
      funds: [
        { ...group.funds[0], scheme_id: "single-a", scheme_name: "Single A", household_value: "100.00", role: null },
        { ...group.funds[0], scheme_id: "single-b", scheme_name: "Single B", household_value: "200.00", role: "Debt Portion" },
      ],
    }];
    data.unavailable_schemes = [];
    data.portfolio_value = data.covered_value = "300.00";
    data.covered_percentage = "100.00";
    mount(data);
    expect(screen.getByRole("list", { name: "Fund manager cards" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: group.manager_name }));
    expect(screen.getByRole("link", { name: "Single A" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Single B" })).toBeInTheDocument();
    expect(screen.queryByText(/Assumed main manager/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Table" }));
    expect(screen.queryByText(/Assumed main manager/)).not.toBeInTheDocument();
  });
});
