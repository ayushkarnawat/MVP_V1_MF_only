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
const ASIT = "asit-bhandarkar-jm-financial-mf";

describe("the table", () => {
  it("shows the heading, the subtitle and one row per manager with the AMC, the value and the share of the whole portfolio", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Fund Manager Allocation" })).toBeInTheDocument();
    expect(screen.getByText("Who is actually running your money, aggregated across your whole portfolio.")).toBeInTheDocument();
    const table = within(screen.getByRole("table", { name: "Fund manager allocation" }));
    expect(table.getAllByRole("columnheader").map(header => header.textContent)).toEqual(["Fund manager", "AMC", "Current value", "% of overall portfolio"]);
    const rows = screen.getAllByTestId(/^manager-row-/);
    expect(rows.map(row => row.getAttribute("data-testid"))).toEqual([`manager-row-${KOTAK}`, `manager-row-${HDFC}`, `manager-row-${SATISH}`, `manager-row-${ASIT}`]);
    expect(rows[0]).toHaveTextContent("Harsha Upadhyaya");
    expect(rows[0]).toHaveTextContent("Kotak Mahindra MF");
    expect(rows[0]).toHaveTextContent("₹15,40,000");
    expect(rows[0]).toHaveTextContent("33.1%");
    expect(rows[2]).toHaveTextContent("₹4,90,000");
    expect(rows[2]).toHaveTextContent("10.5%");
    expect(screen.getByText("Funds with more than one manager are divided equally between them.")).toBeInTheDocument();
  });
  it("shows the covered total in the footer", () => {
    mount();
    expect(screen.getByTestId("covered-value")).toHaveTextContent("₹38,30,000");
    expect(screen.getByTestId("covered-pct")).toHaveTextContent("82.4%");
    expect(screen.getByRole("row", { name: /Covered by manager data/ })).toBeInTheDocument();
  });
  it("lists the schemes with no manager data", () => {
    mount();
    expect(screen.getByText("Fund manager data for these schemes isn't available yet.")).toBeInTheDocument();
    expect(screen.getByText("SBI Bluechip Fund (SBI Mutual Fund)")).toBeInTheDocument();
  });
  it("says so, with the explanation, when no manager data exists at all", () => {
    const data = fb.fundManager();
    data.manager_groups = [];
    data.unavailable_schemes = [];
    mount(data);
    expect(screen.getByText("No fund manager data available")).toBeInTheDocument();
    expect(screen.getByText("We haven't matched fund manager records for your current holdings yet.")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Chart type" })).not.toBeInTheDocument();
  });
  it("keeps the heading in the loading state and offers Retry when the section failed", () => {
    const retry = vi.fn();
    const { unmount } = mount(null, "loading");
    expect(screen.getByRole("status", { name: "Loading Fund Manager Allocation" })).toBeInTheDocument();
    unmount();
    mount(null, "error", retry);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("expanding a manager in place", () => {
  it("opens the schemes of the manager directly under the row, with the household value and the XIRR, one row at a time", () => {
    mount();
    const toggle = within(screen.getByTestId(`manager-row-${KOTAK}`)).getByRole("button", { name: "Harsha Upadhyaya" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId(`manager-detail-${KOTAK}`)).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId(`manager-fund-${KOTAK}-S-KOTAK`)).toHaveTextContent("Kotak Multi Cap Fund₹15,40,000 · XIRR 14.2%");
    const row = screen.getByTestId(`manager-row-${KOTAK}`);
    expect(row.nextElementSibling).toBe(screen.getByTestId(`manager-detail-${KOTAK}`));
    fireEvent.click(within(screen.getByTestId(`manager-row-${HDFC}`)).getByRole("button", { name: "Chirag Setalvad" }));
    expect(screen.queryByTestId(`manager-detail-${KOTAK}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`manager-fund-${HDFC}-S-HDFC`)).toHaveTextContent("₹13,10,000 · XIRR 21.3%");
    fireEvent.click(within(screen.getByTestId(`manager-row-${HDFC}`)).getByRole("button", { name: "Chirag Setalvad" }));
    expect(screen.queryByTestId(`manager-detail-${HDFC}`)).not.toBeInTheDocument();
  });
  it("shows a co-managed fund under each manager at its divided value", () => {
    mount();
    fireEvent.click(within(screen.getByTestId(`manager-row-${SATISH}`)).getByRole("button", { name: "Satish Ramanathan" }));
    expect(screen.getByTestId(`manager-fund-${SATISH}-S-JM`)).toHaveTextContent("JM Flexi Cap Fund₹4,90,000 · XIRR 18.6%");
    fireEvent.click(within(screen.getByTestId(`manager-row-${ASIT}`)).getByRole("button", { name: "Asit Bhandarkar" }));
    expect(screen.getByTestId(`manager-fund-${ASIT}-S-JM`)).toHaveTextContent("₹4,90,000");
  });
  it("shows a dash for a fund with no XIRR", () => {
    mount(fb.fundManager(), "ready", vi.fn(), {});
    fireEvent.click(within(screen.getByTestId(`manager-row-${KOTAK}`)).getByRole("button", { name: "Harsha Upadhyaya" }));
    expect(screen.getByTestId(`manager-fund-${KOTAK}-S-KOTAK`)).toHaveTextContent("XIRR —");
  });
});

describe("chart type", () => {
  it("offers Table, Donut and Bar Chart with the table first", () => {
    mount();
    expect(screen.getByRole("radiogroup", { name: "Chart type" })).toBeInTheDocument();
    expect(within(screen.getByRole("radiogroup", { name: "Chart type" })).getAllByRole("radio").map(radio => radio.textContent)).toEqual(["Table", "Donut", "Bar Chart"]);
    expect(screen.getByRole("radio", { name: "Table" })).toHaveAttribute("aria-checked", "true");
  });
  it("shows the managers as a donut with a legend, and opens a titled panel with their funds when one is clicked", () => {
    mount();
    fireEvent.click(screen.getByRole("radio", { name: "Donut" }));
    expect(screen.queryByRole("table", { name: "Fund manager allocation" })).not.toBeInTheDocument();
    const legend = within(screen.getByRole("list", { name: "Fund manager breakdown" }));
    expect(legend.getAllByRole("button").map(button => button.textContent)).toEqual(["Harsha Upadhyaya33.1%", "Chirag Setalvad28.2%", "Satish Ramanathan10.5%", "Asit Bhandarkar10.5%"]);
    expect(screen.getByTestId("donut-centre-value")).toHaveTextContent("₹38.30 L");
    fireEvent.click(legend.getByRole("button", { name: /Chirag Setalvad/ }));
    const panel = screen.getByRole("region", { name: "Chirag Setalvad — funds managed detail" });
    expect(within(panel).getByTestId("drill-fund-S-HDFC")).toHaveTextContent("₹13,10,000");
    expect(within(panel).getByTestId("drill-dot")).toHaveStyle({ backgroundColor: "var(--c2)" });
    expect(legend.getByRole("button", { name: /Chirag Setalvad/ })).toHaveAttribute("aria-pressed", "true");
    expect(scrollIntoView).toHaveBeenCalled();
  });
  it("keeps the selected manager and the panel when the donut becomes bars, and has no panel in the table", () => {
    mount();
    fireEvent.click(screen.getByRole("radio", { name: "Donut" }));
    fireEvent.click(screen.getByTestId("slice-harsha-upadhyaya-kotak-mahindra-mf"));
    fireEvent.click(screen.getByRole("radio", { name: "Bar Chart" }));
    const bars = within(screen.getByRole("list", { name: "Fund manager breakdown" }));
    expect(bars.getByRole("button", { name: /Harsha Upadhyaya/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "Harsha Upadhyaya — funds managed detail" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Table" }));
    expect(screen.queryByTestId("drill-panel")).not.toBeInTheDocument();
  });
});

describe("interactivity", () => {
  it("marks every control with its effect and its state", () => {
    const { container } = mount();
    fireEvent.click(within(screen.getByTestId(`manager-row-${KOTAK}`)).getByRole("button", { name: "Harsha Upadhyaya" }));
    expectInteractivity(container, 5);
    fireEvent.click(screen.getByRole("radio", { name: "Donut" }));
    fireEvent.click(within(screen.getByRole("list", { name: "Fund manager breakdown" })).getByRole("button", { name: /Harsha/ }));
    expectInteractivity(container, 8);
  });
});

describe("the managed funds open their fund page (IF-E)", () => {
  it("links the funds listed under an opened manager in the table", () => {
    mount();
    fireEvent.click(within(screen.getByTestId(`manager-row-${KOTAK}`)).getByRole("button", { name: "Harsha Upadhyaya" }));
    const row = screen.getByTestId(`manager-fund-${KOTAK}-S-KOTAK`);
    expect(within(row).getByRole("link", { name: "Kotak Multi Cap Fund" })).toHaveAttribute("href", "/portfolio/mutual-funds/funds/S-KOTAK");
    expect(row).toHaveTextContent("Kotak Multi Cap Fund₹15,40,000 · XIRR 14.2%");
  });
  it("links the funds in the donut's drill panel", () => {
    mount();
    fireEvent.click(screen.getByRole("radio", { name: "Donut" }));
    fireEvent.click(screen.getByTestId(`slice-${KOTAK}`));
    const panel = screen.getByRole("region", { name: "Harsha Upadhyaya — funds managed detail" });
    expect(within(panel).getByRole("link", { name: "Kotak Multi Cap Fund" })).toHaveAttribute("href", "/portfolio/mutual-funds/funds/S-KOTAK");
  });
  it("keeps the manager rows as buttons without a link inside", () => {
    mount();
    expect(document.querySelectorAll("button a")).toHaveLength(0);
  });
});
