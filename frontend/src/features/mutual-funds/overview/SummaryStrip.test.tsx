import { CAUTION_CHIP, RETURNS_CAPTION, XIRR_CAPTION } from "../../../lib/xirrDisplay";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as fx from "../fixtures";
import { expectInteractivity, failedLoad, loaded, loadingLoad, points } from "../testing";
import { formatXirr, sparkPoints } from "../mfCopy";
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

describe("SummaryStrip: XIRR return basis and price date", () => {
  const xirr: XirrBundle = { ...XIRR, disclaimers: { lifetime: null, current: null } };

  it("shows the XIRR price date on its own line in the tile", () => {
    const date = "2026-11-18";
    strip({ xirr: loaded<XirrBundle>({ ...xirr, xirr_as_of: date }) });
    expect(within(metric("xirr")).getByTestId("xirr-as-of").textContent).toBe("Prices as on 18 Nov 2026");
  });

  it.each([
    ["absent", {}],
    ["null", { xirr_as_of: null }],
  ] as const)("omits the XIRR price date line when the date is %s", (_, fields) => {
    strip({ xirr: loaded({ ...xirr, ...fields }) });
    expect(screen.queryByTestId("xirr-as-of")).not.toBeInTheDocument();
  });
});

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
    expect(screen.getByTestId("xirr-caption")).toHaveTextContent(XIRR_CAPTION);
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

describe("XIRR and Returns faces", () => {
  function figures(fields: Partial<XirrBundle> = {}) {
    return strip({ xirr: loaded<XirrBundle>({ ...XIRR, disclaimers: { lifetime: null, current: null },
      lifetime: "0.418", lifetime_since_purchase: "0.065", lifetime_xirr_basis: "since_purchase",
      current: "-0.001", current_holdings_since_purchase: "0", lifetime_xirr_caution: "young",
      current_holdings_xirr_caution: "single_transaction", ...fields }) });
  }

  const figure = () => screen.getByTestId("value-xirr");
  const flip = () => fireEvent.click(screen.getByTestId("measure-flip"));
  function chip(kind: "young" | "single_transaction") {
    const node = screen.getByTestId("xirr-caution");
    expect(node.textContent).toBe(CAUTION_CHIP[kind].text);
    expect(node).toHaveAttribute("title", CAUTION_CHIP[kind].tip);
    expect(node).toHaveAttribute("aria-label", CAUTION_CHIP[kind].tip);
  }
  it("opens_on_xirr_with_the_annualised_caption", () => {
    figures();
    expect(screen.getByTestId("measure-title")).toHaveTextContent(/^XIRR$/);
    expect(figure().textContent).toBe(formatXirr("0.418"));
    expect(screen.getByTestId("xirr-caption").textContent).toBe(XIRR_CAPTION);
  });
  it("young_portfolio_shows_the_annualised_figure_and_the_held_under_1_yr_chip", () => {
    figures(); expect(figure().textContent).toBe(formatXirr("0.418")); chip("young");
  });
  it.each(["0.065", "-0.001", "0"])("flip_shows_returns_with_the_since_purchase_caption_and_no_chip", returns => {
    figures({ lifetime_since_purchase: returns }); flip();
    expect(screen.getByTestId("measure-title").textContent).toBe("Returns");
    expect(figure().textContent).toBe(formatXirr(returns));
    expect(screen.getByTestId("xirr-caption").textContent).toBe(RETURNS_CAPTION);
    expect(screen.queryByTestId("xirr-caution")).toBeNull();
    expect(screen.getByTestId("info-xirr")).toHaveAttribute("aria-label", "Total gain as a share of money paid in, not annualised.");
  });
  it("flip_back_returns_to_xirr", () => {
    const { unmount } = figures(); flip(); flip();
    expect(figure().textContent).toBe(formatXirr("0.418"));
    expect(screen.getByTestId("measure-title").textContent).toBe("XIRR"); chip("young");
    flip(); unmount(); figures();
    expect(screen.getByTestId("measure-title").textContent).toBe("XIRR");
  });
  it("face_survives_the_lifetime_current_toggle", () => {
    figures(); flip(); fireEvent.click(screen.getByRole("button", { name: "Current" }));
    expect(screen.getByTestId("measure-title").textContent).toBe("Returns");
    expect(figure().textContent).toBe(formatXirr("0"));
    fireEvent.click(screen.getByRole("button", { name: "Lifetime" }));
    expect(figure().textContent).toBe(formatXirr("0.065"));
    expect(screen.queryByTestId("xirr-caution")).toBeNull();
  });
  it("current_view_uses_its_own_figures_and_chip", () => {
    figures(); fireEvent.click(screen.getByRole("button", { name: "Current" }));
    expect(figure().textContent).toBe(formatXirr("-0.001")); chip("single_transaction");
    flip(); expect(figure().textContent).toBe(formatXirr("0"));
  });
  it("single_transaction_shows_the_one_transaction_chip", () => {
    figures({ lifetime_xirr_caution: "single_transaction" }); chip("single_transaction");
  });
  it("both_conditions_show_only_held_under_1_yr", () => {
    figures(); chip("young"); expect(screen.getAllByTestId("xirr-caution")).toHaveLength(1);
    expect(screen.queryByText("one transaction")).toBeNull();
  });
  it("mature_multiple_buys_have_no_chip", () => {
    figures({ lifetime_xirr_caution: null }); expect(screen.queryByTestId("xirr-caution")).toBeNull();
  });
  it("opening_balance_disclaimer_link_works_on_either_face", () => {
    figures({ disclaimers: XIRR.disclaimers });
    fireEvent.click(screen.getByRole("button", { name: /opening-balance disclaimer/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    flip();
    fireEvent.click(screen.getByRole("button", { name: /opening-balance disclaimer/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("not_computable_shows_a_dash_and_hides_the_flip_button", () => {
    figures({ lifetime: null, lifetime_since_purchase: null, lifetime_xirr_caution: null });
    expect(figure().textContent).toBe(formatXirr(null));
    expect(screen.queryByTestId("measure-flip")).toBeNull();
    expect(screen.queryByTestId("xirr-caution")).toBeNull();
  });
  it("missing_since_purchase_hides_the_flip_button_and_xirr_still_shows", () => {
    figures({ lifetime_since_purchase: undefined });
    expect(figure().textContent).toBe(formatXirr("0.418"));
    expect(screen.queryByTestId("measure-flip")).toBeNull();
  });
  it("loading_and_error_states_are_unchanged", () => {
    const { unmount } = strip({ xirr: loadingLoad() });
    expect(screen.queryByTestId("value-xirr")).toBeNull();
    expect(screen.queryByTestId("measure-flip")).toBeNull(); unmount();
    strip({ xirr: failedLoad() });
    expect(figure().textContent).toBe(formatXirr(null));
    expect(screen.queryByTestId("measure-flip")).toBeNull();
  });
  it("the_old_return_since_purchase_not_annualised_caption_is_gone_from_the_xirr_face", () => {
    figures(); expect(screen.queryByText("Return since purchase, not annualised")).toBeNull();
    expect(screen.getByTestId("xirr-caption").textContent).toBe(XIRR_CAPTION);
  });
  it("unrealised_percent_reads_return_on_invested_with_the_tooltip", () => {
    figures();
    expect(screen.getByTestId("delta-unrealised").textContent).toBe("+29.9% return on invested");
    const tip = "Unrealised gain as a share of what you currently have invested. Not annualised.";
    expect(screen.getByTestId("info-unrealised")).toHaveAttribute("aria-label", tip);
    expect(screen.getByTestId("info-unrealised")).toHaveAttribute("title", tip);
  });
  it("old_payload_without_the_new_keys_renders_as_a_mature_portfolio_without_a_chip", () => {
    strip({ xirr: loaded({ ...XIRR, disclaimers: { lifetime: null, current: null } }) });
    expect(figure().textContent).toBe(formatXirr(XIRR.lifetime));
    expect(screen.queryByTestId("xirr-caution")).toBeNull();
    expect(screen.queryByTestId("measure-flip")).toBeNull();
  });
});
