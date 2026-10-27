import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import { sparkPoints, sparkTrend } from "../portfolioCopy";
import type { PortfolioSummaryResponse, PortfolioValueSeriesResponse } from "../types";
import { SummaryStrip, type SummaryStripProps } from "./SummaryStrip";

function setup(overrides: Partial<SummaryStripProps> = {}) {
  const handlers = { onRetry: vi.fn(), onRetrySeries: vi.fn() };
  const props: SummaryStripProps = {
    status: "data",
    data: fixture<PortfolioSummaryResponse>("summary_family"),
    seriesStatus: "data",
    series: fixture<PortfolioValueSeriesResponse>("series_family_30d"),
    ...handlers,
    ...overrides,
  };
  const view = render(<SummaryStrip {...props} />);
  return { ...view, handlers };
}

const text = (id: string) => screen.getByTestId(id).textContent;

describe("SummaryStrip: states", () => {
  it("shows a loading placeholder with no figures", () => {
    setup({ status: "loading", data: null });
    expect(screen.getByRole("status", { name: "Loading summary" })).toBeInTheDocument();
    expect(screen.queryByText("Total Portfolio Value")).toBeNull();
  });

  it("shows a message and a retry button on an error, and treats data status without data the same", () => {
    const { handlers, unmount } = setup({ status: "error", data: null });
    expect(screen.getByText("Couldn't load your portfolio summary")).toBeInTheDocument();
    expect(screen.getByText("This section failed to load, but the rest of the page is unaffected.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);
    unmount();
    setup({ status: "data", data: null });
    expect(screen.getByText("Couldn't load your portfolio summary")).toBeInTheDocument();
  });
});

describe("SummaryStrip: the five metrics", () => {
  it("is a named region with five named groups", () => {
    setup();
    expect(screen.getByRole("region", { name: "Portfolio summary" })).toBeInTheDocument();
    for (const name of ["Total Portfolio Value", "Total Invested", "Unrealised Gain", "Realised Gain", "XIRR"]) {
      expect(screen.getByRole("group", { name })).toBeInTheDocument();
    }
    for (const id of ["total-value", "invested", "unrealised", "realised", "xirr"]) {
      expect(screen.getByTestId(`metric-${id}`)).toBeInTheDocument();
    }
  });

  it("shows the family figures to the rupee, from exact strings", () => {
    setup();
    expect(text("value-total")).toBe("₹5,212");
    expect(text("value-invested")).toBe("₹5,000");
    expect(text("value-unrealised")).toBe("+₹212");
    expect(text("delta-unrealised")).toBe("+4.2%");
    expect(text("value-realised")).toBe("₹0");
    expect(text("value-xirr")).toBe("34.9%");
    expect(text("today-gain")).toBe("Today's Gain: +₹12 (0.23%)");
    expect(screen.getByTestId("today-gain")).toHaveAttribute("data-direction", "up");
  });

  it("shows a member's figures", () => {
    setup({ data: fixture<PortfolioSummaryResponse>("summary_member") });
    expect(text("value-total")).toBe("₹3,012");
    expect(text("delta-unrealised")).toBe("+0.4%");
    expect(text("value-xirr")).toBe("2.5%");
  });

  it("shows a loss with its minus sign and the down direction", () => {
    const data = fixture<PortfolioSummaryResponse>("summary_family");
    data.today_gain = "-41230.40";
    data.today_pct = "-0.2900";
    data.unrealized_gain = "-1500.60";
    data.unrealized_pct = "-2.5000";
    data.realized_gain = "-300.00";
    setup({ data });
    expect(text("today-gain")).toBe("Today's Gain: -₹41,230 (-0.29%)");
    expect(screen.getByTestId("today-gain")).toHaveAttribute("data-direction", "down");
    expect(text("value-unrealised")).toBe("-₹1,501");
    expect(text("delta-unrealised")).toBe("-2.5%");
    expect(screen.getByTestId("value-unrealised")).toHaveAttribute("data-direction", "down");
    expect(text("value-realised")).toBe("-₹300");
  });

  it("never prints a negative zero", () => {
    const data = fixture<PortfolioSummaryResponse>("summary_family");
    data.today_gain = "-0.00";
    data.today_pct = "-0.0004";
    data.unrealized_gain = "-0.00";
    data.unrealized_pct = "-0.0004";
    data.realized_gain = "-0.00";
    setup({ data });
    expect(text("today-gain")).toBe("Today's Gain: ₹0 (0.00%)");
    expect(screen.getByTestId("today-gain")).toHaveAttribute("data-direction", "flat");
    expect(text("value-unrealised")).toBe("₹0");
    expect(screen.getByTestId("value-unrealised")).toHaveAttribute("data-direction", "flat");
    expect(text("delta-unrealised")).toBe("0.0%");
    expect(text("value-realised")).toBe("₹0");
  });

  it("leaves out a percentage the backend could not compute", () => {
    const data = fixture<PortfolioSummaryResponse>("summary_family");
    data.today_pct = null;
    data.unrealized_pct = null;
    setup({ data });
    expect(text("today-gain")).toBe("Today's Gain: +₹12");
    expect(screen.queryByTestId("delta-unrealised")).toBeNull();
  });

  it("shows zeros and a dash for an empty portfolio", () => {
    setup({ data: fixture<PortfolioSummaryResponse>("summary_empty") });
    expect(text("value-total")).toBe("₹0");
    expect(text("value-invested")).toBe("₹0");
    expect(text("value-xirr")).toBe("—");
    expect(text("today-gain")).toBe("Today's Gain: ₹0");
  });

  it("shows the explanations as tooltips on the two info marks", () => {
    setup();
    expect(screen.getByTestId("info-total-value")).toHaveAttribute(
      "title", "Sum of current value across all valued holdings, family-combined or scoped to one member.",
    );
    expect(screen.getByTestId("info-xirr")).toHaveAttribute(
      "title", "Annualised return since inception. May include an opening balance from before you started tracking in Unifolio.",
    );
  });

  it("flags partial data on the value card, naming the funds in a tooltip", () => {
    setup({ data: fixture<PortfolioSummaryResponse>("summary_partial") });
    const note = within(screen.getByTestId("metric-total-value")).getByRole("note");
    expect(note).toHaveTextContent("1 on last known NAV");
    expect(note.getAttribute("title")).toContain("Dev Gold Fund");
  });

  it("shows no note when the data is complete", () => {
    setup();
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("SummaryStrip: the value trend", () => {
  it("draws the series as a small line coloured by its direction", () => {
    const series = fixture<PortfolioValueSeriesResponse>("series_family_30d");
    setup({ series });
    const spark = screen.getByTestId("sparkline");
    expect(spark).toHaveAttribute("viewBox", "0 0 72 26");
    expect(spark).toHaveAttribute("role", "img");
    expect(spark).toHaveAttribute("aria-label", "Portfolio value, last 30 days");
    const line = spark.querySelector("polyline")!;
    expect(line).toHaveAttribute("points", sparkPoints(series.points));
    const stroke = { up: "var(--pos)", down: "var(--neg)", flat: "var(--ui-text-muted)" }[sparkTrend(series.points)];
    expect(line).toHaveAttribute("stroke", stroke);
  });

  it("uses the series' own day count in its name", () => {
    const series = fixture<PortfolioValueSeriesResponse>("series_family_30d");
    series.days = 90;
    setup({ series });
    expect(screen.getByTestId("sparkline")).toHaveAttribute("aria-label", "Portfolio value, last 90 days");
  });

  it("shows a placeholder while the series loads and keeps the figures", () => {
    setup({ seriesStatus: "loading", series: null });
    expect(screen.getByTestId("sparkline-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("sparkline")).toBeNull();
    expect(text("value-total")).toBe("₹5,212");
  });

  it("says the trend failed, offers a retry, and keeps the figures", () => {
    const { handlers } = setup({ seriesStatus: "error", series: null });
    expect(screen.getByText("Couldn't load trend")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(handlers.onRetrySeries).toHaveBeenCalledTimes(1);
    expect(handlers.onRetry).not.toHaveBeenCalled();
    expect(text("value-total")).toBe("₹5,212");
  });

  it("draws nothing, and says nothing, for an empty series", () => {
    setup({ series: fixture<PortfolioValueSeriesResponse>("series_empty") });
    expect(screen.queryByTestId("sparkline")).toBeNull();
    expect(screen.queryByTestId("sparkline-loading")).toBeNull();
    expect(screen.queryByText("Couldn't load trend")).toBeNull();
  });

  it("draws nothing for a series of a single point", () => {
    const series = fixture<PortfolioValueSeriesResponse>("series_family_30d");
    series.points = series.points.slice(-1);
    setup({ series });
    expect(screen.queryByTestId("sparkline")).toBeNull();
  });
});

describe("SummaryStrip: the XIRR basis and its disclaimer", () => {
  function withDisclaimers() {
    const data = fixture<PortfolioSummaryResponse>("summary_family");
    data.lifetime_xirr = "0.1480";
    data.current_holdings_xirr = "0.2100";
    data.lifetime_xirr_disclaimer = { alt_xirr: "0.0900", opening_cost_share: "0.9800" };
    return data;
  }

  it("switches between Lifetime and Current with a tab list", () => {
    setup({ data: withDisclaimers() });
    const tabs = screen.getByRole("tablist", { name: "XIRR basis" });
    const lifetime = within(tabs).getByRole("tab", { name: "Lifetime" });
    const current = within(tabs).getByRole("tab", { name: "Current" });
    expect(lifetime).toHaveAttribute("aria-selected", "true");
    expect(current).toHaveAttribute("aria-selected", "false");
    expect(text("value-xirr")).toBe("14.8%");
    fireEvent.click(current);
    expect(current).toHaveAttribute("aria-selected", "true");
    expect(lifetime).toHaveAttribute("aria-selected", "false");
    expect(text("value-xirr")).toBe("21.0%");
    fireEvent.click(lifetime);
    expect(text("value-xirr")).toBe("14.8%");
  });

  it("offers the disclaimer only for the basis that has one", () => {
    setup({ data: withDisclaimers() });
    expect(screen.getByRole("button", { name: "Since inception — opening-balance disclaimer may apply ›" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Current" }));
    expect(screen.queryByRole("button", { name: /opening-balance/ })).toBeNull();
    expect(screen.getByTestId("xirr-caption")).toHaveTextContent("Current holdings");
  });

  it("says plainly what the basis is when there is no disclaimer", () => {
    setup();
    expect(screen.queryByRole("button", { name: /opening-balance/ })).toBeNull();
    expect(screen.getByTestId("xirr-caption")).toHaveTextContent("Since inception");
  });

  it("opens the explanation with the shown and the adjusted rate, and closes it again", () => {
    setup({ data: withDisclaimers() });
    fireEvent.click(screen.getByRole("button", { name: /opening-balance/ }));
    expect(screen.getByText("Why this return may be misleading")).toBeInTheDocument();
    expect(screen.getByText("Shown Lifetime XIRR")).toBeInTheDocument();
    expect(screen.getByText("Without the undated portion")).toBeInTheDocument();
    expect(screen.getByTestId("disclaimer-shown")).toHaveTextContent("14.8%");
    expect(screen.getByTestId("disclaimer-alt")).toHaveTextContent("9.0%");
    expect(screen.getByTestId("disclaimer-share")).toHaveTextContent("98%");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Why this return may be misleading")).toBeNull();
  });

  it("says so when no adjusted rate can be computed", () => {
    const data = withDisclaimers();
    data.lifetime_xirr_disclaimer = { alt_xirr: null, opening_cost_share: "1.0000" };
    setup({ data });
    fireEvent.click(screen.getByRole("button", { name: /opening-balance/ }));
    expect(screen.getByTestId("disclaimer-alt")).toHaveTextContent("Not enough dated activity left");
    expect(screen.getByTestId("disclaimer-share")).toHaveTextContent("100%");
  });

  it("names the Current basis in its own explanation", () => {
    const data = withDisclaimers();
    data.current_holdings_xirr_disclaimer = { alt_xirr: "0.1900", opening_cost_share: "0.5000" };
    setup({ data });
    fireEvent.click(screen.getByRole("tab", { name: "Current" }));
    fireEvent.click(screen.getByRole("button", { name: "Current holdings — opening-balance disclaimer may apply ›" }));
    expect(screen.getByText("Shown Current XIRR")).toBeInTheDocument();
    expect(screen.getByTestId("disclaimer-shown")).toHaveTextContent("21.0%");
    expect(screen.getByTestId("disclaimer-alt")).toHaveTextContent("19.0%");
  });
});
