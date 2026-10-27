import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as fx from "../fixtures";
import { expectInteractivity, failedLoad, loaded, loadingLoad, points } from "../testing";
import { sparkPoints } from "../mfCopy";
import { SummaryStrip } from "./SummaryStrip";
import type { XirrBundle } from "../types";

const XIRR: XirrBundle = { lifetime: "0.1612", current: "0.1480", disclaimers: { lifetime: { alt_xirr: "0.1105", opening_cost_share: "0.3800" }, current: null } };
const HISTORY = points([100, 150, 200, 210, 260]);
const SYNOPSIS = "Spread across 4 AMCs and 5 funds — 82% in Direct plans.";

function strip(over: Partial<Parameters<typeof SummaryStrip>[0]> = {}) {
  const props = { holdings: loaded(fx.holdings()), xirr: loaded(XIRR), realized: loaded(fx.aggregateHoldings().realized_summary!), history: loaded(HISTORY), synopsis: SYNOPSIS, ...over };
  return { props, ...render(<SummaryStrip {...props} />) };
}
const metric = (id: string) => screen.getByTestId(`metric-${id}`);

describe("SummaryStrip", () => {
  it("shows the five metrics with exact figures from the holdings", () => {
    strip();
    const labels = ["Total Portfolio Value", "Total Invested", "Unrealised Gain", "Realised Gain", "XIRR"];
    for (const label of labels) expect(screen.getByRole("group", { name: label })).toBeInTheDocument();
    expect(screen.getByTestId("value-total")).toHaveTextContent("₹46,49,340");
    expect(screen.getByTestId("value-invested")).toHaveTextContent("₹35,78,000");
    expect(screen.getByTestId("value-unrealised")).toHaveTextContent("+₹10,71,340");
    expect(screen.getByTestId("value-unrealised")).toHaveAttribute("data-direction", "up");
    expect(screen.getByTestId("delta-unrealised")).toHaveTextContent("+29.9%");
    expect(screen.getByTestId("value-realised")).toHaveTextContent("₹2,10,000");
    expect(screen.getByTestId("value-xirr")).toHaveTextContent("16.1%");
  });
  it("shows today's change on valued, non-stale funds only", () => {
    strip();
    expect(screen.getByTestId("today-gain")).toHaveTextContent("Today: +₹9,210 (0.24%)");
    expect(screen.getByTestId("today-gain")).toHaveAttribute("data-direction", "up");
  });
  it("has no comparison with a date line", () => {
    strip();
    expect(screen.queryByText(/vs 1 Jan/i)).not.toBeInTheDocument();
  });
  it("explains the value and XIRR in hoverable info marks", () => {
    strip();
    expect(within(metric("total-value")).getByTestId("info-total-value")).toHaveAttribute("title", "Sum of current value across all mutual fund holdings, family-combined or scoped to one member.");
    expect(within(metric("xirr")).getByTestId("info-xirr")).toHaveAttribute("title", "Annualised return since inception. May include an opening balance from before you started tracking in Unifolio.");
  });
  it("switches the XIRR between Lifetime and Current holdings", () => {
    strip();
    expect(screen.getByRole("button", { name: "Lifetime" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Current" }));
    expect(screen.getByRole("button", { name: "Current" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("value-xirr")).toHaveTextContent("14.8%");
    expect(screen.getByTestId("xirr-caption")).toHaveTextContent("Current holdings");
    expect(screen.queryByRole("button", { name: /opening-balance disclaimer/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lifetime" }));
    expect(screen.getByTestId("value-xirr")).toHaveTextContent("16.1%");
  });
  it("opens the opening-balance explanation from the Lifetime note", () => {
    strip();
    fireEvent.click(screen.getByRole("button", { name: "Since inception — opening-balance disclaimer may apply ›" }));
    const dialog = screen.getByRole("dialog", { name: "Why this return may be misleading" });
    expect(within(dialog).getByText(/This comes from how your uploaded CAS statement reports old holdings/)).toBeInTheDocument();
    expect(within(dialog).getByTestId("disclaimer-shown")).toHaveTextContent("16.1%");
    expect(within(dialog).getByTestId("disclaimer-alt")).toHaveTextContent("11.1%");
    expect(within(dialog).getByTestId("disclaimer-share")).toHaveTextContent("38%");
    expect(within(dialog).getByText(/of the money behind this return came from an opening balance/)).toBeInTheDocument();
  });
  it("says so when no dated activity is left for the alternative XIRR", () => {
    strip({ xirr: loaded({ ...XIRR, disclaimers: { lifetime: { alt_xirr: null, opening_cost_share: "0.9000" }, current: null } }) });
    fireEvent.click(screen.getByRole("button", { name: /opening-balance disclaimer/ }));
    expect(screen.getByTestId("disclaimer-alt")).toHaveTextContent("Not enough dated activity left");
    expect(screen.getByTestId("disclaimer-share")).toHaveTextContent("90%");
  });
  it("puts the stale-NAV and unpriced caveats on the value metric only", () => {
    strip();
    const notes = within(metric("total-value")).getAllByRole("note");
    expect(notes.map(note => note.textContent)).toEqual(["1 on last known NAV", "1 not priced yet"]);
    expect(notes[0]).toHaveAttribute("title", "Based on the last known NAV for: SBI Bluechip Fund");
    expect(notes[1]).toHaveAttribute("title", "No NAV yet, left out of every total: Axis Midcap Fund");
    for (const id of ["invested", "unrealised", "realised", "xirr"]) expect(within(metric(id)).queryByRole("note")).not.toBeInTheDocument();
  });
  it("shows no caveat when every fund is priced", () => {
    strip({ holdings: loaded(fx.holdings().slice(0, 3)) });
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
  it("draws the trend line from the month-end values, green when it rose", () => {
    strip();
    const svg = screen.getByTestId("sparkline");
    expect(svg).toHaveAttribute("aria-label", "Portfolio value, last 5 months");
    const line = svg.querySelector("polyline")!;
    expect(line.getAttribute("points")).toBe(sparkPoints(HISTORY));
    expect(line.getAttribute("stroke")).toBe("var(--pos)");
  });
  it("draws a falling trend in the negative colour", () => {
    strip({ history: loaded(points([300, 200])) });
    expect(screen.getByTestId("sparkline").querySelector("polyline")!.getAttribute("stroke")).toBe("var(--neg)");
  });
  it("keeps every metric when the trend fails, with its own Retry", () => {
    const history = failedLoad<ReturnType<typeof points>>();
    strip({ history });
    expect(screen.getByText("Couldn't load trend")).toBeInTheDocument();
    expect(screen.getByTestId("value-total")).toHaveTextContent("₹46,49,340");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(history.retry).toHaveBeenCalledTimes(1);
  });
  it("shows a small skeleton while the trend loads and nothing when there is no history", () => {
    const { unmount } = strip({ history: loadingLoad() });
    expect(screen.getByTestId("sparkline-loading")).toBeInTheDocument();
    unmount();
    strip({ history: loaded(points([5])) });
    expect(screen.queryByTestId("sparkline")).not.toBeInTheDocument();
    expect(screen.queryByText("Couldn't load trend")).not.toBeInTheDocument();
  });
  it("shows the synopsis sentence under the strip and omits it when there is none", () => {
    const { unmount } = strip();
    expect(screen.getByTestId("synopsis")).toHaveTextContent(SYNOPSIS);
    unmount();
    strip({ synopsis: null });
    expect(screen.queryByTestId("synopsis")).not.toBeInTheDocument();
  });
  it("shows a loading state, and a failure card with Retry that leaves the page alone", () => {
    const { unmount } = strip({ holdings: loadingLoad() });
    expect(screen.getByRole("status", { name: "Loading summary" })).toBeInTheDocument();
    unmount();
    const holdings = failedLoad<ReturnType<typeof fx.holdings>>();
    strip({ holdings });
    expect(screen.getByRole("heading", { name: "Couldn't load your portfolio summary" })).toBeInTheDocument();
    expect(screen.getByText("This section failed to load, but the rest of the page is unaffected.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(holdings.retry).toHaveBeenCalledTimes(1);
  });
  it("lets the XIRR and realised metrics load or fail on their own", () => {
    const { unmount } = strip({ xirr: loadingLoad(), realized: failedLoad() });
    expect(screen.queryByTestId("value-xirr")).not.toBeInTheDocument();
    expect(screen.getByTestId("value-total")).toHaveTextContent("₹46,49,340");
    expect(screen.getByTestId("value-realised")).toHaveTextContent("—");
    unmount();
    strip({ xirr: failedLoad(), realized: loaded(null) });
    expect(screen.getByTestId("value-xirr")).toHaveTextContent("—");
    expect(screen.getByTestId("value-realised")).toHaveTextContent("—");
  });
  it("shows zeros and no percentage for a portfolio with no priced funds", () => {
    strip({ holdings: loaded([fx.holdings()[4]]) });
    expect(screen.getByTestId("value-total")).toHaveTextContent("₹0");
    expect(screen.getByTestId("value-invested")).toHaveTextContent("₹0");
    expect(screen.queryByTestId("delta-unrealised")).not.toBeInTheDocument();
    expect(screen.getByTestId("value-unrealised")).toHaveAttribute("data-direction", "flat");
  });
  it("marks every control with its effect (interactivity rule)", () => {
    const { container } = strip();
    expectInteractivity(container, 3);
  });
});
