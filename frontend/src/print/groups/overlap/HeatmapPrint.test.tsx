import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatPercent } from "../../../lib/format";
import type { OverlapFund, OverlapPair } from "../../../features/mutual-funds/types";
import { HeatmapPrint } from "./HeatmapPrint";

function makeFunds(count: number): OverlapFund[] {
  return Array.from({ length: count }, (_, i) => ({
    scheme_id: `F-${i + 1}`,
    scheme_name: `Alpha Growth Fund ${i + 1}`,
    current_value: String((count - i) * 100000),
  }));
}

function makePairs(funds: OverlapFund[], pctFor?: (i: number, j: number) => string): OverlapPair[] {
  const pairs: OverlapPair[] = [];
  for (let i = 0; i < funds.length; i += 1) {
    for (let j = i + 1; j < funds.length; j += 1) {
      const overlap_pct = pctFor ? pctFor(i, j) : "25.40";
      pairs.push({
        fund_a: funds[i],
        fund_b: funds[j],
        overlap_pct,
        common_stocks: [
          { isin: "INE001", instrument_name: "Beta Bank Ltd", weight_a: "5.25", weight_b: "4.10" },
        ],
        common_total: 1,
      });
    }
  }
  return pairs;
}

describe("HeatmapPrint", () => {
  it("shades each cell by the screen's band and shows its percent as text", () => {
    const funds = makeFunds(3);
    const pairs = makePairs(funds, (i, j) => {
      if (i === 0 && j === 1) return "12.40";
      if (i === 0 && j === 2) return "28.60";
      return "47.20";
    });
    render(<HeatmapPrint funds={funds} pairs={pairs} topPair={null} />);

    const lowCell = screen.getByTestId("print-hm-cell-F-1-F-2");
    expect(lowCell).toHaveAttribute("data-band", "low");
    expect(lowCell).toHaveTextContent(formatPercent("12.40", { digits: 0 }));

    const modCell = screen.getByTestId("print-hm-cell-F-1-F-3");
    expect(modCell).toHaveAttribute("data-band", "moderate");
    expect(modCell).toHaveTextContent(formatPercent("28.60", { digits: 0 }));

    const highCell = screen.getByTestId("print-hm-cell-F-2-F-3");
    expect(highCell).toHaveAttribute("data-band", "high");
    expect(highCell).toHaveTextContent(formatPercent("47.20", { digits: 0 }));
  });

  it("the diagonal shows a dash", () => {
    const funds = makeFunds(3);
    const pairs = makePairs(funds);
    render(<HeatmapPrint funds={funds} pairs={pairs} topPair={null} />);

    for (const f of funds) {
      expect(screen.getByTestId(`print-hm-cell-${f.scheme_id}-${f.scheme_id}`)).toHaveTextContent("–");
    }
  });

  it("with 6 or fewer funds the headers carry the full names", () => {
    const funds = makeFunds(6);
    const pairs = makePairs(funds);
    render(<HeatmapPrint funds={funds} pairs={pairs} topPair={null} />);

    const table = screen.getByRole("table", { name: "Pairwise overlap (%)" });
    const colHeaders = within(table).getAllByRole("columnheader").slice(1);
    expect(colHeaders.map(h => h.textContent)).toEqual(funds.map(f => f.scheme_name));

    const rowHeaders = within(table).getAllByRole("rowheader");
    expect(rowHeaders.map(h => h.textContent)).toEqual(funds.map(f => f.scheme_name));
  });

  it("with 12 funds the columns are numbered and the row labels carry the numbers and names", () => {
    const funds = makeFunds(12);
    const pairs = makePairs(funds);
    render(<HeatmapPrint funds={funds} pairs={pairs} topPair={null} />);

    const table = screen.getByRole("table", { name: "Pairwise overlap (%)" });
    const colHeaders = within(table).getAllByRole("columnheader").slice(1);
    expect(colHeaders.map(h => h.textContent)).toEqual(funds.map((_, i) => String(i + 1)));

    const rowHeaders = within(table).getAllByRole("rowheader");
    expect(rowHeaders.map(h => h.textContent)).toEqual(funds.map((f, i) => `${i + 1}  ${f.scheme_name}`));
  });

  it("the legend lists the bands", () => {
    const funds = makeFunds(3);
    const pairs = makePairs(funds);
    render(<HeatmapPrint funds={funds} pairs={pairs} topPair={null} />);

    expect(screen.getByTestId("print-hm-legend-low")).toHaveTextContent("Low < 20%");
    expect(screen.getByTestId("print-hm-legend-moderate")).toHaveTextContent("Moderate 20–40%");
    expect(screen.getByTestId("print-hm-legend-high")).toHaveTextContent("High ≥ 40%");
  });

  it("shows every shared stock of the strongest pair and the count line when truncated", () => {
    const funds = makeFunds(2);
    const topPair: OverlapPair = {
      fund_a: funds[0],
      fund_b: funds[1],
      overlap_pct: "53.40",
      common_stocks: [
        { isin: "INE001", instrument_name: "Beta Bank Ltd", weight_a: "8.15", weight_b: "6.40" },
        { isin: "INE002", instrument_name: "Gamma Motors Ltd", weight_a: "4.50", weight_b: "3.20" },
      ],
      common_total: 12,
    };
    render(<HeatmapPrint funds={funds} pairs={[topPair]} topPair={topPair} />);

    expect(screen.getByText(/Alpha Growth Fund 1 × Alpha Growth Fund 2/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(formatPercent("53.40", { digits: 2 })))).toBeInTheDocument();
    expect(screen.getByText("Beta Bank Ltd")).toBeInTheDocument();
    expect(screen.getByText("Gamma Motors Ltd")).toBeInTheDocument();
    expect(screen.getByText(formatPercent("8.15", { digits: 2 }))).toBeInTheDocument();
    expect(screen.getByText(formatPercent("6.40", { digits: 2 }))).toBeInTheDocument();
    expect(screen.getByText("Showing the largest 2 of 12 shared stocks.")).toBeInTheDocument();
  });

  it("shows the screen's message with fewer than two funds", () => {
    const oneFund = makeFunds(1);
    render(<HeatmapPrint funds={oneFund} pairs={[]} topPair={null} />);
    expect(screen.getByText("Overlap needs at least two funds with published holdings.")).toBeInTheDocument();
  });

  it("no button, no title attribute, no hex colour; the table is fixed layout and full width", () => {
    const funds = makeFunds(3);
    const pairs = makePairs(funds);
    const { container } = render(<HeatmapPrint funds={funds} pairs={pairs} topPair={pairs[0]} />);

    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("[role='button']")).toHaveLength(0);
    expect(container.querySelectorAll("[title]")).toHaveLength(0);

    const table = screen.getByRole("table", { name: "Pairwise overlap (%)" });
    expect(table.className).toContain("table-fixed");
    expect(table.className).toContain("w-full");

    const source = readFileSync(resolve(__dirname, "HeatmapPrint.tsx"), "utf8");
    expect(source).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(/i);
  });
});
