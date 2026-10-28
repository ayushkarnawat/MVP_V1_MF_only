import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sumDecimalStrings } from "@/lib/decimal";
import { fixture } from "../fixtures";
import type { OverlapCompareResponse } from "../types";
import { ComparisonOverview } from "./ComparisonOverview";

interface PieStubProps { data: { label: string; value: number; color?: string; formattedValue?: string }[]; children?: ReactNode }
const pie = vi.hoisted(() => ({ props: null as null | PieStubProps }));
vi.mock("@/components/ui/charts", () => ({
  PieChart: (props: PieStubProps) => {
    pie.props = props;
    return <div data-testid="pie-chart">{props.children}</div>;
  },
  PieSlice: ({ index }: { index: number }) => <i data-testid={`pie-slice-${index}`} />,
}));

const A = "Alpha Flexi Cap Fund - Direct Plan";
const B = "Golden Peer 1 Fund";
const golden = () => fixture<OverlapCompareResponse>("overlap_compare");
const row = (key: string) => screen.getByTestId(`impact-row-${key}`);
const legend = () => screen.getByRole("list", { name: "Impact on your portfolio" });

beforeEach(() => {
  pie.props = null;
});

describe("ComparisonOverview", () => {
  it("shows the three counts: unique to A, common, unique to B", () => {
    render(<ComparisonOverview data={golden()} />);
    expect(within(screen.getByTestId("count-unique-a")).getByText(`Unique to ${A}`)).toBeInTheDocument();
    expect(screen.getByTestId("count-unique-a")).toHaveTextContent("9");
    expect(screen.getByTestId("count-common")).toHaveTextContent("Common holdings3");
    expect(screen.getByTestId("count-unique-b")).toHaveTextContent(`Unique to ${B}0`);
  });

  it("the legend has four rows with the rupee amount and the share of the portfolio, and the four shares add to 100", () => {
    const data = golden();
    render(<ComparisonOverview data={data} />);
    expect(within(legend()).getAllByRole("button").map(button => button.textContent)).toEqual([
      "Common to both funds₹441 · 18.6%", `Only in ${A}₹1,350 · 57.0%`, `Only in ${B}₹0 · 0.0%`, "Your other funds₹579 · 24.4%",
    ]);
    expect(sumDecimalStrings(Object.values(data.impact).map(slice => slice.pct))).toBe("100.0000");
  });

  it("the donut draws the slices that have a size (a zero slice is left out), centre = the common holdings' combined weight", () => {
    render(<ComparisonOverview data={golden()} />);
    expect(pie.props!.data.map(slice => [slice.label, slice.value])).toEqual([
      ["Common to both funds", 18.6076], [`Only in ${A}`, 56.962], ["Your other funds", 24.4304],
    ]);
    expect(screen.getAllByTestId(/^pie-slice-/)).toHaveLength(3);
    expect(screen.getByTestId("impact-centre-figure")).toHaveTextContent("18.6%");
    expect(screen.getByTestId("impact-centre-label")).toHaveTextContent("combined weight of common holdings");
  });

  it("test_impact_donut_isolates_on_click: a legend row isolates its slice (others are muted), the centre shows it, a second click restores", () => {
    render(<ComparisonOverview data={golden()} />);
    fireEvent.click(row("unique_a"));
    expect(row("unique_a")).toHaveAttribute("aria-pressed", "true");
    expect(row("common_both")).toHaveAttribute("data-dimmed", "true");
    expect(row("unique_a")).toHaveAttribute("data-dimmed", "false");
    expect(pie.props!.data.map(slice => slice.color)).toEqual(["var(--ui-divider)", "var(--c3)", "var(--ui-divider)"]);
    expect(screen.getByTestId("impact-centre-figure")).toHaveTextContent("57.0%");
    expect(screen.getByTestId("impact-centre-label")).toHaveTextContent(`Only in ${A}`);
    fireEvent.click(row("other_funds"));
    expect(row("other_funds")).toHaveAttribute("aria-pressed", "true");
    expect(row("unique_a")).toHaveAttribute("aria-pressed", "false");
    expect(pie.props!.data.map(slice => slice.color)).toEqual(["var(--ui-divider)", "var(--ui-divider)", "var(--c6)"]);
    fireEvent.click(row("other_funds"));
    expect(row("other_funds")).toHaveAttribute("aria-pressed", "false");
    expect(pie.props!.data.map(slice => slice.color)).toEqual(["var(--c2)", "var(--c3)", "var(--c6)"]);
    expect(screen.getByTestId("impact-centre-figure")).toHaveTextContent("18.6%");
  });

  it("uses the response's own numbers (the backend handoff's F against G example), not the golden's", () => {
    const data = golden();
    data.impact = {
      common_both: { amount: "315.00", pct: "31.5000" }, unique_a: { amount: "180.00", pct: "18.0000" },
      unique_b: { amount: "60.00", pct: "6.0000" }, other_funds: { amount: "445.00", pct: "44.5000" },
    };
    data.counts = { unique_a: 1, common: 2, unique_b: 1 };
    render(<ComparisonOverview data={data} />);
    expect(within(legend()).getAllByRole("button").map(button => button.textContent)).toEqual([
      "Common to both funds₹315 · 31.5%", `Only in ${A}₹180 · 18.0%`, `Only in ${B}₹60 · 6.0%`, "Your other funds₹445 · 44.5%",
    ]);
    expect(pie.props!.data.map(slice => slice.value)).toEqual([31.5, 18, 6, 44.5]);
    expect(screen.getByTestId("impact-centre-figure")).toHaveTextContent("31.5%");
    expect(screen.getByTestId("count-unique-a")).toHaveTextContent("1");
    expect(screen.getByTestId("count-common")).toHaveTextContent("2");
    expect(screen.getByTestId("count-unique-b")).toHaveTextContent("1");
  });

  it("selecting the zero slice isolates nothing on the pie but still marks the row and the centre", () => {
    render(<ComparisonOverview data={golden()} />);
    fireEvent.click(row("unique_b"));
    expect(row("unique_b")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("impact-centre-figure")).toHaveTextContent("0.0%");
    expect(pie.props!.data.every(slice => slice.color === "var(--ui-divider)")).toBe(true);
  });
});
