import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as fc from "../fixtures/mfCother";
import { expectInteractivity } from "../testing";
import type { ValuationSummary } from "../types";
import { ValuationSpectrum } from "./ValuationSpectrum";

const mount = (data: ValuationSummary = fc.valuationSummary()) => render(<ValuationSpectrum data={data} />);
const pin = (kind: string, key: string) => screen.getByTestId(`pin-${kind}-${key}`);
const radio = (name: string) => screen.getByRole("radio", { name });

describe("the card's frame", () => {
  it("states the dates, the full coverage banner and both thresholds", () => {
    mount();
    expect(screen.getByTestId("valuation-dates")).toHaveTextContent("Values as on 24 Oct 2026 · Holdings as on 30 Sep 2026.");
    const banner = screen.getByRole("complementary", { name: "Portfolio disclosure coverage" });
    expect(banner).toHaveTextContent("Based on 91.4% of your portfolio");
    expect(banner).toHaveTextContent("HDFC Overnight Fund");
    expect(banner).toHaveTextContent("Axis International Fund of Fund");
    expect(banner).toHaveTextContent("Axis Midcap Fund");
    expect(banner).toHaveTextContent("Derivative and other positions excluded from this view: 2.10% (net disclosed share).");
    expect(screen.getByTestId("valuation-thresholds")).toHaveTextContent('Ratios are hidden below 50% look-through coverage and flagged "not enough data" below 70% of equity exposure.');
    expect(screen.getByText("P/E from NSE (SYMBOL P/E, reported trailing earnings); P/B from Yahoo Finance. Portfolio ratios use a weighted harmonic mean of the equity holdings with usable data.")).toBeInTheDocument();
  });
  it("has two panels with their own coverage line and fundamentals date", () => {
    mount();
    expect(screen.getByRole("group", { name: "P/E valuation" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "P/B valuation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "P/E · earnings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "P/B · book value" })).toBeInTheDocument();
    expect(screen.getByTestId("coverage-pe")).toHaveTextContent("Ratio data cover 86.4% of equity exposure · Fundamentals as on 23 Oct 2026");
    expect(screen.getByTestId("coverage-pb")).toHaveTextContent("Ratio data cover 84.2% of equity exposure · Fundamentals as on 22 Oct 2026");
  });
});

describe("the shared Racetrack | Bar Chart toggle", () => {
  it("starts on Racetrack with the three pins in each panel, in fixed series colours and exact positions", () => {
    mount();
    expect(screen.getByRole("radiogroup", { name: "Valuation view" })).toBeInTheDocument();
    expect(radio("Racetrack")).toHaveAttribute("aria-checked", "true");
    expect(radio("Bar Chart")).toHaveAttribute("aria-checked", "false");
    expect(pin("pe", "you")).toHaveTextContent("You 23.4x");
    expect(pin("pe", "nifty_50")).toHaveTextContent("N50 20.5x");
    expect(pin("pe", "nifty_500")).toHaveTextContent("N500 21.9x");
    expect(["you", "nifty_50", "nifty_500"].map(key => pin("pe", key).getAttribute("data-x"))).toEqual(["92", "8", "48.55"]);
    expect(["you", "nifty_50", "nifty_500"].map(key => pin("pb", key).getAttribute("data-x"))).toEqual(["92", "8", "41.6"]);
    expect(["you", "nifty_50", "nifty_500"].map(key => pin("pe", key).getAttribute("data-color"))).toEqual(["var(--pos)", "var(--c2)", "var(--c4)"]);
    expect(pin("pe", "nifty_500")).toHaveStyle({ left: "48.55%" });
    expect(pin("pe", "you")).toHaveAttribute("title", "You 23.4x");
    expect(pin("pe", "you")).toHaveAttribute("data-tooltip");
    expect(screen.queryByRole("list", { name: "P/E comparison bars" })).not.toBeInTheDocument();
  });
  it("switches both panels at once to bars, scaled to each panel's own largest ratio, with the same series colours", () => {
    mount();
    fireEvent.click(radio("Bar Chart"));
    expect(radio("Bar Chart")).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("pin-pe-you")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pin-pb-you")).not.toBeInTheDocument();
    expect(screen.getAllByRole("list", { name: /comparison bars$/ })).toHaveLength(2);
    const pe = within(screen.getByRole("list", { name: "P/E comparison bars" }));
    expect(pe.getAllByRole("listitem").map(item => item.textContent)).toEqual(["You23.4x", "Nifty 5020.5x", "Nifty 50021.9x"]);
    expect(["you", "nifty_50", "nifty_500"].map(key => screen.getByTestId(`vbar-fill-pe-${key}`).style.width)).toEqual(["100%", "87.61%", "93.59%"]);
    expect(["you", "nifty_50", "nifty_500"].map(key => screen.getByTestId(`vbar-fill-pb-${key}`).style.width)).toEqual(["100%", "87.8%", "92.68%"]);
    expect(["you", "nifty_50", "nifty_500"].map(key => screen.getByTestId(`vbar-pe-${key}`).getAttribute("data-color"))).toEqual(["var(--pos)", "var(--c2)", "var(--c4)"]);
    expect(screen.getByTestId("vbar-fill-pe-you")).toHaveStyle({ backgroundColor: "var(--pos)" });
    expect(screen.getByTestId("vbar-fill-pe-nifty_50")).toHaveStyle({ backgroundColor: "var(--c2)" });
  });
  it("goes back to the pins on the second toggle and keeps the narrative either way", () => {
    mount();
    fireEvent.click(radio("Bar Chart"));
    expect(screen.getByTestId("delta-pe")).toBeInTheDocument();
    fireEvent.click(radio("Racetrack"));
    expect(pin("pe", "you")).toBeInTheDocument();
    expect(screen.getByTestId("delta-pb")).toBeInTheDocument();
  });
});

describe("the narrative, the exclusions and the footnotes", () => {
  it("writes each panel's narrative from the payload's deltas", () => {
    mount();
    expect(screen.getByTestId("delta-pe")).toHaveTextContent("Your portfolio is 14.2% more expensive on earnings than Nifty 50, and 6.9% more expensive than Nifty 500.");
    expect(screen.getByTestId("delta-pb")).toHaveTextContent("Your portfolio is 13.9% more expensive on book value than Nifty 50, and 7.9% more expensive than Nifty 500.");
  });
  it("lists every excluded holding with its share of equity and the reason", () => {
    mount();
    expect(within(screen.getByRole("list", { name: "Excluded from P/E" })).getAllByRole("listitem").map(item => item.textContent)).toEqual([
      "Zomato Ltd · 1.8% of equity — negative earnings (P/E not meaningful)",
    ]);
    expect(within(screen.getByRole("list", { name: "Excluded from P/B" })).getAllByRole("listitem").map(item => item.textContent)).toEqual([
      "Max Healthcare Institute Ltd · 2.4% of equity — no book value on file",
      "Unlisted Holding Co · 0.6% of equity — not matched to a listed stock",
    ]);
    expect(screen.getByRole("heading", { name: "Equity holdings excluded from P/E" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Equity holdings excluded from P/B" })).toBeInTheDocument();
  });
  it("shows no exclusion list for a panel with nothing excluded", () => {
    const data = fc.valuationSummary();
    data.pe.missing = [];
    mount(data);
    expect(screen.queryByTestId("excluded-pe")).not.toBeInTheDocument();
    expect(screen.getByTestId("excluded-pb")).toBeInTheDocument();
  });
  it("lists every footnote, in order, and none when there are none", () => {
    const { unmount } = mount();
    expect(within(screen.getByRole("list", { name: "Valuation footnotes" })).getAllByRole("listitem").map(item => item.textContent)).toEqual([
      "Valuation data for Max Healthcare Institute Ltd is 4 days stale (last refreshed 19 Oct 2026).",
      "Nifty 500 P/B is from the previous trading day.",
    ]);
    unmount();
    const data = fc.valuationSummary();
    data.footnotes = [];
    mount(data);
    expect(screen.queryByRole("list", { name: "Valuation footnotes" })).not.toBeInTheDocument();
  });
});

describe("the threshold states", () => {
  it("hides the portfolio's ratios below 50 percent coverage, keeps the indices and writes no narrative", () => {
    const data = fc.valuationSummary();
    data.hide_headlines = true;
    mount(data);
    for (const kind of ["pe", "pb"]) {
      expect(screen.getByTestId(`state-${kind}`)).toHaveAttribute("data-state", "hidden");
      expect(screen.getByTestId(`state-${kind}`)).toHaveTextContent("Portfolio ratio hidden while published holdings cover less than 50% of your portfolio.");
      expect(screen.queryByTestId(`pin-${kind}-you`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`pin-${kind}-nifty_50`)).toBeInTheDocument();
      expect(screen.queryByTestId(`delta-${kind}`)).not.toBeInTheDocument();
    }
    expect(screen.getByTestId("pin-pe-nifty_50")).toHaveAttribute("data-x", "8");
    expect(screen.getByTestId("pin-pe-nifty_500")).toHaveAttribute("data-x", "92");
    fireEvent.click(radio("Bar Chart"));
    expect(screen.getByTestId("vbar-pe-you")).toHaveTextContent("YouUnavailable");
    expect(screen.getByTestId("vbar-fill-pe-you").style.width).toBe("0%");
    expect(screen.getByTestId("vbar-fill-pe-nifty_500").style.width).toBe("100%");
  });
  it("flags not enough data for one ratio only, and leaves the other panel whole", () => {
    const data = fc.valuationSummary();
    data.pe.enough_data = false;
    mount(data);
    expect(screen.getByTestId("state-pe")).toHaveAttribute("data-state", "not_enough");
    expect(screen.getByTestId("state-pe")).toHaveTextContent("Not enough data for portfolio P/E — at least 70% of equity exposure needs a usable ratio.");
    expect(screen.queryByTestId("pin-pe-you")).not.toBeInTheDocument();
    expect(screen.queryByTestId("delta-pe")).not.toBeInTheDocument();
    expect(screen.queryByTestId("state-pb")).not.toBeInTheDocument();
    expect(screen.getByTestId("pin-pb-you")).toBeInTheDocument();
    expect(screen.getByTestId("delta-pb")).toBeInTheDocument();
  });
  it("uses the P/B wording for the P/B panel and treats a missing ratio as not enough data", () => {
    const data = fc.valuationSummary();
    data.pb.ratio = null;
    mount(data);
    expect(screen.getByTestId("state-pb")).toHaveTextContent("Not enough data for portfolio P/B — at least 70% of equity exposure needs a usable ratio.");
    expect(screen.queryByTestId("pin-pb-you")).not.toBeInTheDocument();
  });
  it("says hidden, not not-enough-data, when both rules apply", () => {
    const data = fc.valuationSummary();
    data.hide_headlines = true;
    data.pe.enough_data = false;
    mount(data);
    expect(screen.getByTestId("state-pe")).toHaveAttribute("data-state", "hidden");
  });
  it("shows an equity-free portfolio as such, with no panels and no toggle, keeping the footnotes", () => {
    const data = fc.valuationSummary();
    data.total_equity_value = "0.00";
    mount(data);
    expect(screen.getByTestId("valuation-no-equity")).toHaveTextContent("No equity holdings for this selection");
    expect(screen.queryByRole("group", { name: "P/E valuation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Valuation footnotes" })).toBeInTheDocument();
  });
});

describe("every control", () => {
  it("is marked with its effect and exposes its state", () => {
    const { container } = mount();
    fireEvent.click(radio("Bar Chart"));
    expectInteractivity(container, 2);
    expect(container.querySelectorAll("[data-clickable]")).toHaveLength(2);
  });
});
