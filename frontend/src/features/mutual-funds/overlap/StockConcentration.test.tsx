import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as fc from "../fixtures/mfC";
import { renderInShell } from "../../../shell/testing";
import { expectInteractivity } from "../testing";
import type { OverlapSummary } from "../types";
import { StockConcentration } from "./StockConcentration";

const HREF = "/portfolio/mutual-funds/holdings#all-holdings";
const mount = (data: OverlapSummary | null = fc.overlapSummary(), state: "loading" | "ready" | "failed" | "error" = "ready", onRetry = vi.fn()) =>
  renderInShell(<StockConcentration state={state} data={data} onRetry={onRetry} />, { path: "/portfolio/mutual-funds/overlap" });
const link = (testId: string) => screen.getByTestId(testId).closest("a");

describe("the card", () => {
  it("has the numbered heading, the info mark and the line that says where the clicks go", () => {
    mount();
    expect(screen.getByRole("heading", { name: "5. Stock Concentration" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /a different lens from Common Holdings above/ })).toBeInTheDocument();
    expect(screen.getByText("Click the headline, the chart, or any point below to see the full ranked stock list on the Holdings page.")).toBeInTheDocument();
  });
  it("writes the headline from the largest point of ten stocks or fewer, one decimal", () => {
    mount();
    expect(screen.getByTestId("conc-headline")).toHaveTextContent("Top 10 stocks represent 29.7% of your total MF portfolio — view all stocks");
  });
  it("draws a chip for every concentration point with its stock count and exposure", () => {
    mount();
    const chips = within(screen.getByRole("list", { name: "Concentration points" })).getAllByRole("listitem");
    expect(chips.map(chip => chip.textContent)).toEqual(["5 stocks: 22.0%", "10 stocks: 29.7%", "20 stocks: 40.0%", "31 stocks: 47.6%"]);
  });
  it("draws the cumulative curve: one point per concentration point at its computed position, joined by a line", () => {
    mount();
    expect(screen.getByTestId("conc-line")).toHaveAttribute("points", "123.87,131.41 207.74,121.43 375.48,107.95 560,98.12");
    expect(screen.getByTestId("conc-point-5")).toHaveAttribute("cx", "123.87");
    expect(screen.getByTestId("conc-point-5")).toHaveAttribute("cy", "131.41");
    expect(screen.getByTestId("conc-point-31")).toHaveAttribute("cx", "560");
    expect(screen.getByTestId("conc-point-20").querySelector("title")).toHaveTextContent("20 stocks: 40.0%");
    expect(screen.getByRole("img", { name: "Cumulative exposure of your largest stocks" })).toBeInTheDocument();
  });
  it("says what the figures rest on, with the funds that have no stock holdings", () => {
    mount();
    expect(screen.getByTestId("conc-basis")).toHaveTextContent("Based on 31 distinct stocks held across your 4 equity funds (3 funds have no stock holdings to look through).");
    const data = fc.overlapSummary();
    data.coverage.not_available_from_amc = [];
    data.coverage.missing_value_schemes = [];
    const view = mount(data);
    expect(view.container.textContent).toContain("(1 fund has no stock holdings to look through)");
    data.coverage.not_published_yet = [];
    const none = mount(data);
    expect(none.container.textContent).toContain("held across your 4 equity funds.");
  });
});

describe("navigation: the headline, the chart and every chip lead to the all-holdings card", () => {
  it("links the headline, the chart and all four chips to the Holdings page anchor", () => {
    mount();
    expect(link("conc-headline")).toHaveAttribute("href", HREF);
    expect(link("conc-chart-link")).toHaveAttribute("href", HREF);
    for (const n of [5, 10, 20, 31]) expect(link(`conc-chip-${n}`)).toHaveAttribute("href", HREF);
  });
  it("marks each of them as a navigation control with a tooltip", () => {
    mount();
    for (const id of ["conc-headline", "conc-chart-link", "conc-chip-5", "conc-chip-31"]) {
      expect(screen.getByTestId(id)).toHaveAttribute("data-clickable");
      expect(screen.getByTestId(id)).toHaveAttribute("data-effect", "navigate");
      expect(screen.getByTestId(id)).toHaveAttribute("title", "View the full ranked stock list on the Holdings page");
    }
  });
});

describe("edge states", () => {
  it("hides the headline, and says why, when published holdings cover too little, but keeps the chart and chips", () => {
    const data = fc.overlapSummary();
    data.hide_headlines = true;
    mount(data);
    expect(screen.queryByTestId("conc-headline")).not.toBeInTheDocument();
    expect(screen.getByTestId("conc-hidden-note")).toHaveTextContent("The headline figure is hidden while published holdings cover less than 50% of your portfolio.");
    expect(screen.getByTestId("conc-chart")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^conc-chip-/)).toHaveLength(4);
  });
  it("has no headline when every point is above ten stocks", () => {
    const data = fc.overlapSummary();
    data.concentration = data.concentration.slice(2);
    mount(data);
    expect(screen.queryByTestId("conc-headline")).not.toBeInTheDocument();
    expect(screen.queryByTestId("conc-hidden-note")).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^conc-chip-/)).toHaveLength(2);
  });
  it("says there is no data yet when the section has no points", () => {
    const data = fc.overlapSummary();
    data.concentration = [];
    mount(data);
    expect(screen.getByTestId("conc-empty")).toHaveTextContent("No stock concentration data yet.");
    expect(screen.queryByTestId("conc-chart")).not.toBeInTheDocument();
  });
  it("keeps the heading while loading and offers Retry when the section failed", () => {
    const retry = vi.fn();
    const view = mount(null, "loading");
    expect(screen.getByRole("status", { name: "Loading 5. Stock Concentration" })).toBeInTheDocument();
    view.unmount();
    mount(null, "failed", retry);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it("marks every control with its effect (interactivity rule)", () => {
    const { container } = mount();
    expectInteractivity(container, 6);
  });
});
