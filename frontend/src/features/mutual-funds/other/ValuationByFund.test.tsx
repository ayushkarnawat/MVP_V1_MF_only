import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { valuationSummary } from "../fixtures/mfCother";
import type { ValuationSummary, ValuationValue } from "../types";
import { CostValuationGroup } from "./CostValuationGroup";

const mock = vi.hoisted(() => ({ data: null as ValuationSummary | null }));
vi.mock("../data/analyticsStore", () => ({ useMfAnalytics: (section: string) => ({
  data: section === "valuation" ? mock.data : null, status: "ready", retry: vi.fn(),
}) }));
vi.mock("../../../components/SchemeLogo", () => ({
  SchemeLogo: ({ schemeName }: { schemeName: string }) => <span role="img" aria-label={`${schemeName} logo`} />,
}));

function sample() {
  const data = valuationSummary();
  const value = (ratio: string | null, source: "factsheet" | "computed" | "none", basis = "trailing", method = "harmonic"): ValuationValue => ({
    value: ratio, source, basis, method, as_of: "2026-10-12", coverage_pct: source === "computed" ? "100" : null, reason: null as string | null, unavailable_reason: null,
  });
  return { ...data, funds: [
    { scheme_id: "A", scheme_name: "Invesco India Midcap Fund", pe: value("30.6", "factsheet", "forward", "weighted_average"), pb: value("4.65", "factsheet") },
    { scheme_id: "B", scheme_name: "Kotak Flexicap Fund", pe: value("21.9", "computed"), pb: { ...value("3.6", "computed"), as_of: "2026-10-10" } },
    { scheme_id: "C", scheme_name: "HDFC Small Cap Fund", pe: { ...value(null, "none"), coverage_pct: "69", reason: "Less than 60% of this fund's equity has a usable P/E value." }, pb: value("3.1", "computed") },
  ], pe: { ...data.pe, overseas: [{ isin: "US-1", instrument_name: "Overseas Company", exposure_value: "100", percentage_equity: "2", reason: "No local ratio available" }] },
  };
}
function mount(data: ValuationSummary = sample()) {
  mock.data = data;
  return render(<CostValuationGroup />);
}
const card = () => screen.getByRole("region", { name: "Valuation by Fund" });
const fundRow = (name: string) => within(card()).getByRole("row", { name: new RegExp(name) });

describe("Valuation by Fund", () => {
  it("renders one row per fund with logo, P/E, P/B and as-on date", () => {
    mount();
    expect(within(card()).getAllByRole("row")).toHaveLength(4);
    const row = within(fundRow("Invesco India Midcap Fund"));
    expect(row.getByRole("img", { name: "Invesco India Midcap Fund logo" })).toBeInTheDocument();
    expect(row.getByText("30.6x")).toBeInTheDocument();
    expect(row.getByText("4.7x")).toBeInTheDocument();
    expect(row.getByText("12 Oct 2026")).toBeInTheDocument();
    expect(within(fundRow("Kotak Flexicap Fund")).getByText(/10 Oct 2026/)).toBeInTheDocument();
    expect(within(card()).getAllByLabelText(/Nifty 500 tick/)).toHaveLength(5);
  });
  it("label shows Factsheet, Factsheet fwd or NSE/BSE", () => {
    mount();
    expect(within(card()).getByRole("button", { name: "P/E source for Invesco India Midcap Fund" })).toHaveTextContent("Factsheet fwd");
    expect(within(card()).getByRole("button", { name: "P/B source for Invesco India Midcap Fund" })).toHaveTextContent("Factsheet");
    expect(within(card()).getByRole("button", { name: "P/E source for Kotak Flexicap Fund" })).toHaveTextContent("NSE/BSE");
  });
  it("hover note names basis and method, and tapping also opens it", () => {
    mount();
    const source = within(card()).getByRole("button", { name: "P/E source for Invesco India Midcap Fund" });
    fireEvent.mouseEnter(source);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Basis: forward earnings. Method: weighted average.");
    fireEvent.mouseLeave(source);
    fireEvent.focus(source);
    fireEvent.click(source);
    expect(source).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("tooltip")).toHaveTextContent("forward earnings");
  });
  it("fund without unavailable_reason keeps today's behaviour (shows 'Not enough data' with the reason)", () => {
    mount();
    const row = within(fundRow("HDFC Small Cap Fund"));
    expect(row.getByText("Not enough data")).toBeInTheDocument();
    expect(row.getByText("Less than 60% of this fund's equity has a usable P/E value.")).toBeInTheDocument();
    expect(row.getByText("3.1x")).toBeInTheDocument();
  });
  it("fund with unavailable_reason shows the reason instead of Not enough data or a bare dash", () => {
    const reason = "Not enough data: P/E is available for 52% of this fund's shares, and we need at least 60%.";
    const data = sample();
    data.funds![2].pe.unavailable_reason = reason;
    mount(data);
    const row = within(fundRow("HDFC Small Cap Fund"));
    expect(row.getByText(reason)).toBeInTheDocument();
    expect(row.queryByText("Not enough data")).not.toBeInTheDocument();
  });
  it("the two excluded lists are closed by default with a count and open on click", () => {
    mount();
    const missing = within(card()).getByRole("button", { name: "Stocks without ratios (3)" });
    const overseas = within(card()).getByRole("button", { name: "Overseas stocks without ratios (1)" });
    expect(missing).toHaveAttribute("aria-expanded", "false");
    expect(overseas).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Zomato Ltd")).not.toBeInTheDocument();
    expect(screen.queryByText("Overseas Company")).not.toBeInTheDocument();
    fireEvent.click(missing); fireEvent.click(overseas);
    expect(missing).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Zomato Ltd")).toBeInTheDocument();
    expect(screen.getByText("Overseas Company")).toBeInTheDocument();
    fireEvent.click(missing);
    expect(screen.queryByText("Zomato Ltd")).not.toBeInTheDocument();
  });
  it("info text explains why a harmonic mean is used", () => {
    mount();
    const info = within(card()).getByRole("button", { name: "How the portfolio average works" });
    expect(info).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(info);
    expect(screen.getByText(/earnings or book value behind each rupee/)).toHaveTextContent(/very high ratio does not dominate/);
  });
  it("payload without funds renders the existing section only", () => {
    const view = mount();
    expect(card()).toBeInTheDocument();
    mock.data = valuationSummary();
    view.rerender(<CostValuationGroup />);
    expect(screen.queryByRole("region", { name: "Valuation by Fund" })).not.toBeInTheDocument();
    expect(screen.getByTestId("valuation-body")).toBeInTheDocument();
  });
  it("counts strictly richer funds among those with a P/E, using the supplied Nifty 500 value", () => {
    const data = sample();
    data.indices.find(row => row.index_name === "nifty_500")!.pe_ratio = "21.900000";
    mount(data);
    expect(within(card()).getByText("1 of 2 funds trade richer than Nifty 500 on earnings")).toBeInTheDocument();
  });
  it("does not invent a comparison when Nifty 500 is unavailable", () => {
    const data = sample();
    data.indices = data.indices.filter(row => row.index_name !== "nifty_500");
    mount(data);
    expect(within(card()).getByText("Nifty 500 earnings comparison is unavailable.")).toBeInTheDocument();
    expect(within(card()).queryByText(/0 of/)).not.toBeInTheDocument();
    expect(within(card()).queryByLabelText(/Nifty 500 tick/)).not.toBeInTheDocument();
  });
});
