import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PeriodReturnsTable } from "./PeriodReturnsTable";
import type { PeriodReturn } from "./types";

const periods: Partial<Record<"1y" | "3y" | "5y", PeriodReturn>> = {
  "1y": { fund_return: "0.124", category_avg: "0.10", peers: 12 },
  "3y": { fund_return: "-0.02", category_avg: "0.03", peers: 10 },
  "5y": { fund_return: "0.08", category_avg: "0.08", peers: 7 },
};

describe("PeriodReturnsTable", () => {
  it("renders three period columns and Fund, Category average and Difference rows", () => {
    render(<PeriodReturnsTable periods={periods} />);
    for (const name of ["1Y", "3Y", "5Y"]) expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    const fund = screen.getByRole("row", { name: /^Fund / });
    expect(within(fund).getByText("+12.40%")).toBeInTheDocument();
    const difference = screen.getByRole("row", { name: /^Difference / });
    expect(within(difference).getByText("+2.40%")).toBeInTheDocument();
    expect(within(difference).getByText("-5.00%")).toBeInTheDocument();
    expect(within(difference).getByText("0.00%")).toBeInTheDocument();
    expect(screen.getByText("Category average covers 12 funds (1Y), 10 (3Y), 7 (5Y).")).toBeInTheDocument();
  });

  it("shows em dashes for a missing fund return and its difference, while keeping the average", () => {
    render(<PeriodReturnsTable periods={{ ...periods, "5y": { fund_return: null, category_avg: "0.08", peers: 7 } }} />);
    expect(within(screen.getByRole("row", { name: /^Fund / })).getByText("—")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /^Difference / })).getByText("—")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /^Category average / })).getByText("+8.00%")).toBeInTheDocument();
  });

  it("supports partial periods and a masked category average without NaN or undefined", () => {
    const { container } = render(<PeriodReturnsTable periods={{ "3y": { fund_return: "0.12", category_avg: null, peers: 2 } }} />);
    expect(screen.getByText("+12.00%")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /^Category average / })).getAllByText("—")).toHaveLength(3);
    expect(within(screen.getByRole("row", { name: /^Difference / })).getAllByText("—")).toHaveLength(3);
    expect(container.textContent).not.toMatch(/NaN|undefined/);
    expect(screen.getByText("Category average covers 0 funds (1Y), 2 (3Y), 0 (5Y).")).toBeInTheDocument();
  });

  it.each([undefined, {}])("renders nothing for an absent or empty payload", value => {
    const { container } = render(<PeriodReturnsTable periods={value} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the difference exact before percentage rounding", () => {
    render(<PeriodReturnsTable periods={{ "1y": { fund_return: "0.124949999999999999999999", category_avg: "0.1", peers: 1 } }} />);
    expect(within(screen.getByRole("row", { name: /^Difference / })).getByText("+2.49%")).toBeInTheDocument();
  });

  it("accepts zero and small Decimal values serialized in exponent notation", () => {
    render(<PeriodReturnsTable periods={{ "1y": { fund_return: "0E-27", category_avg: "1E-3", peers: 4 } }} />);
    expect(within(screen.getByRole("row", { name: /^Fund / })).getByText("0.00%")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /^Category average / })).getByText("+0.10%")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /^Difference / })).getByText("-0.10%")).toBeInTheDocument();
  });

  it("scrolls the table inside its container at phone width", () => {
    render(<PeriodReturnsTable periods={periods} />);
    expect(screen.getByRole("table").parentElement).toHaveClass("overflow-auto");
    expect(screen.getByRole("table").parentElement).toHaveClass("w-full");
  });
});
