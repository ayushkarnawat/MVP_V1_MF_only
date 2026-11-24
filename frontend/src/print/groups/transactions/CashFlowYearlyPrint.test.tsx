import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { InvestmentWithdrawalBucket } from "../../../features/mutual-funds/types";
import { diffDecimalStrings, sumDecimalStrings } from "../../../lib/decimal";
import { formatCompactRupees, formatRupees } from "../../../lib/format";
import { CashFlowYearlyPrint } from "./CashFlowYearlyPrint";

const yearsInvestedOnly: InvestmentWithdrawalBucket[] = [
  {
    period: "2023",
    invested: "230000.00",
    withdrawn: "0",
    entries: [],
    switched_in: "50000.00",
    switched_out: "25000.00",
  },
  {
    period: "2024",
    invested: "660000.00",
    withdrawn: "0.00",
    entries: [],
  },
  {
    period: "2025",
    invested: "0",
    withdrawn: "0",
    entries: [],
  },
];

const yearsWithWithdrawal: InvestmentWithdrawalBucket[] = [
  {
    period: "2023",
    invested: "380000.00",
    withdrawn: "0",
    entries: [],
  },
  {
    period: "2024",
    invested: "480000.00",
    withdrawn: "150000.00",
    entries: [],
  },
];

describe("CashFlowYearlyPrint", () => {
  it("draws one labelled bar per year for invested and a second series only when something was withdrawn", () => {
    const { container, rerender } = render(<CashFlowYearlyPrint years={yearsInvestedOnly} />);
    expect(screen.getByRole("heading", { name: "Invested each year" })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-series="invested"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-series="withdrawn"]')).toHaveLength(0);
    expect(screen.queryByText("Withdrawn")).not.toBeInTheDocument();

    rerender(<CashFlowYearlyPrint years={yearsWithWithdrawal} />);
    expect(container.querySelectorAll('[data-series="invested"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-series="withdrawn"]')).toHaveLength(2);
    expect(screen.getByText("Invested")).toBeInTheDocument();
    expect(screen.getByText("Withdrawn")).toBeInTheDocument();
  });

  it("labels bars with the compact value", () => {
    const { container } = render(<CashFlowYearlyPrint years={yearsWithWithdrawal} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.textContent).toContain(formatCompactRupees("380000.00"));
    expect(svg?.textContent).toContain(formatCompactRupees("480000.00"));
    expect(svg?.textContent).toContain(formatCompactRupees("150000.00"));
  });

  it("the table has one row per year with money in, money out and net equal to invested minus withdrawn", () => {
    render(<CashFlowYearlyPrint years={yearsWithWithdrawal} />);
    expect(screen.getByRole("heading", { name: "By year" })).toBeInTheDocument();
    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader").map(h => h.textContent?.trim());
    expect(headers).toEqual(["Year", "Money in", "Money out", "Net"]);

    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("2023");
    expect(rows[1]).toHaveTextContent(formatRupees("380000.00"));
    expect(rows[1]).toHaveTextContent(formatRupees("0"));
    expect(rows[1]).toHaveTextContent(formatRupees(diffDecimalStrings("380000.00", "0")));

    expect(rows[2]).toHaveTextContent("2024");
    expect(rows[2]).toHaveTextContent(formatRupees("480000.00"));
    expect(rows[2]).toHaveTextContent(formatRupees("150000.00"));
    expect(rows[2]).toHaveTextContent(formatRupees(diffDecimalStrings("480000.00", "150000.00")));
  });

  it("the total row sums the years", () => {
    render(<CashFlowYearlyPrint years={yearsWithWithdrawal} />);
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    const totalRow = rows[rows.length - 1];
    const totalIn = sumDecimalStrings(yearsWithWithdrawal.map(y => y.invested));
    const totalOut = sumDecimalStrings(yearsWithWithdrawal.map(y => y.withdrawn));
    const totalNet = diffDecimalStrings(totalIn, totalOut);

    expect(totalRow).toHaveTextContent("Total");
    expect(totalRow).toHaveTextContent(formatRupees(totalIn));
    expect(totalRow).toHaveTextContent(formatRupees(totalOut));
    expect(totalRow).toHaveTextContent(formatRupees(totalNet));
  });

  it("ignores switch values", () => {
    render(<CashFlowYearlyPrint years={yearsInvestedOnly} />);
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent(formatRupees("230000.00"));
    expect(rows[1]).toHaveTextContent(formatRupees("0"));
    expect(rows[3]).toHaveTextContent("2025");
    expect(rows[3]).toHaveTextContent(formatRupees("0"));
  });

  it("shows the empty sentence", () => {
    render(<CashFlowYearlyPrint years={[]} />);
    expect(screen.getByText("No transactions yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("no button, no title attribute, no hex colour", () => {
    const { container } = render(<CashFlowYearlyPrint years={yearsWithWithdrawal} />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("[role='button']")).toHaveLength(0);
    expect(container.querySelectorAll("[title]")).toHaveLength(0);
    const src = readFileSync(resolve("src/print/groups/transactions/CashFlowYearlyPrint.tsx"), "utf8");
    expect(src).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(/i);
  });
});
