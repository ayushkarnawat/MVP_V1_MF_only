import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
const info = (name: string) => within(fundRow(name)).getByRole("button", { name: `P/E and P/B for ${name}` });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Valuation by Fund information", () => {
  it("no source pill remains", () => {
    mount();
    expect(within(card()).queryByRole("button", { name: /source for/ })).not.toBeInTheDocument();
  });

  it('each fund has one "i" right after its name', () => {
    const data = sample();
    mount(data);
    for (const fund of data.funds) {
      const heading = within(fundRow(fund.scheme_name)).getByRole("rowheader");
      const buttons = within(heading).getAllByRole("button", { name: `P/E and P/B for ${fund.scheme_name}` });
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveTextContent(/^i$/);
      expect(buttons[0].previousSibling?.textContent?.trim()).toBe(fund.scheme_name);
      const logo = within(heading).getByRole("img", { name: `${fund.scheme_name} logo` });
      expect(logo.compareDocumentPosition(buttons[0]) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    }
  });

  it("the popover shows the P/E part, the P/B part and the closing line", async () => {
    mount();
    const cases = [
      {
        name: "Invesco India Midcap Fund",
        pe: "Printed on the fund's factsheet for October 2026, based on forward earnings.",
        pb: "Printed on the fund's factsheet for October 2026, based on trailing book value.",
      },
      {
        name: "Kotak Flexicap Fund",
        pe: "Worked out from the fund's published holdings. Stock ratios come from NSE and BSE daily data, combined as a harmonic mean. Covers 100% of the fund's equity. Ratios as on 12 Oct 2026.",
        pb: "Worked out from the fund's published holdings. Stock ratios come from NSE and BSE daily data, combined as a harmonic mean. Covers 100% of the fund's equity. Ratios as on 10 Oct 2026.",
      },
    ];
    for (const fund of cases) {
      const trigger = info(fund.name);
      fireEvent.click(trigger);
      const dialog = await screen.findByRole("dialog", { name: fund.name });
      const parts = within(dialog).getAllByText(/^(P\/E: |P\/B: |Indicators, not a recommendation\.)/);
      expect(parts.map(part => part.textContent)).toEqual([`P/E: ${fund.pe}`, `P/B: ${fund.pb}`, "Indicators, not a recommendation."]);
      expect(parts[0].tagName).toBe("P");
      expect(parts[1].tagName).toBe("P");
      fireEvent.keyDown(trigger, { key: "Escape" });
      await waitFor(() => { expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); });
    }
  });

  it("a withheld figure shows its reason in the popover too", async () => {
    mount();
    fireEvent.click(info("HDFC Small Cap Fund"));
    const dialog = await screen.findByRole("dialog", { name: "HDFC Small Cap Fund" });
    expect(within(dialog).getByText("P/E: Not enough data. Less than 60% of this fund's equity has a usable P/E value.")).toBeInTheDocument();
  });

  it("the As on column and the footnote are gone", () => {
    mount();
    expect(within(card()).queryByRole("columnheader", { name: "As on" })).not.toBeInTheDocument();
    expect(within(card()).queryByRole("cell", { name: "12 Oct 2026" })).not.toBeInTheDocument();
    expect(within(card()).queryByText(/fwd means forward earnings/)).not.toBeInTheDocument();
  });

  it("range bars and the Nifty 500 tick stay", () => {
    mount();
    expect(info("Invesco India Midcap Fund")).toBeInTheDocument();
    expect(within(card()).getAllByLabelText(/Nifty 500 tick/)).toHaveLength(5);
    expect(within(card()).getAllByLabelText(/range for/)).toHaveLength(5);
    expect(within(card()).getByLabelText("P/E range for Invesco India Midcap Fund")).toBeInTheDocument();
    expect(within(card()).getByLabelText("P/B Nifty 500 tick for Kotak Flexicap Fund")).toBeInTheDocument();
  });

  it("keyboard and hover both open it", async () => {
    vi.useFakeTimers();
    mount();
    const trigger = info("Invesco India Midcap Fund");
    fireEvent.mouseEnter(trigger);
    act(() => { vi.advanceTimersByTime(249); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole("dialog", { name: "Invesco India Midcap Fund" })).toBeInTheDocument();
    fireEvent.mouseLeave(trigger);
    await act(async () => { vi.advanceTimersByTime(150); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => { trigger.focus(); });
    expect(trigger).toHaveFocus();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.mouseLeave(trigger);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: "Escape" });
    await act(async () => { vi.runOnlyPendingTimers(); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("the card keeps its own information button", async () => {
    mount();
    fireEvent.click(info("Invesco India Midcap Fund"));
    await screen.findByRole("dialog", { name: "Invesco India Midcap Fund" });
    const button = within(card()).getByRole("button", { name: "How the portfolio average works" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(within(card()).getByText(/earnings or book value behind each rupee/)).toHaveTextContent(/very high ratio does not dominate/);
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(within(card()).queryByText(/earnings or book value behind each rupee/)).not.toBeInTheDocument();
  });
});
