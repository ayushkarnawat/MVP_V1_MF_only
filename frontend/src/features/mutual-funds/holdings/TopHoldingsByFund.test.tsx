import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as fb from "../fixtures/mfB";
import { expectInteractivity } from "../testing";
import type { StockHoldingsSummary } from "../types";
import { TopHoldingsByFund } from "./TopHoldingsByFund";

const mount = (data: StockHoldingsSummary | null = fb.stockHoldings(), state: "loading" | "ready" | "failed" | "error" = "ready", onRetry = vi.fn()) =>
  render(<TopHoldingsByFund state={state} data={data} onRetry={onRetry} />);
const chips = () => within(screen.getByRole("group", { name: "Funds" })).getAllByRole("button");

describe("the fund chips", () => {
  it("shows the heading, the info mark, the prompt and one chip per fund, heaviest first, the first one selected", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Top Holdings by Fund" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Each fund's top 10 stock positions by weight/ })).toBeInTheDocument();
    expect(screen.getByText("Pick a fund to see its 10 largest stock positions.")).toBeInTheDocument();
    expect(chips().map(chip => chip.textContent)).toEqual(["Kotak Multi Cap Fund", "HDFC Mid-Cap Opportunities Fund", "JM Flexi Cap Fund", "SBI Bluechip Fund"]);
    expect(chips().map(chip => chip.getAttribute("aria-pressed"))).toEqual(["true", "false", "false", "false"]);
  });
  it("selects a fund on click, keeps the selected fill after the mouse leaves, and shows only that fund's table", () => {
    mount();
    fireEvent.click(screen.getByTestId("chip-S-JM"));
    fireEvent.mouseLeave(screen.getByTestId("chip-S-JM"));
    expect(screen.getByTestId("chip-S-JM")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("chip-S-KOTAK")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("chip-S-JM")).toHaveStyle({ backgroundColor: "var(--c3)" });
    expect(screen.getByTestId("fund-strip")).toHaveTextContent("JM Flexi Cap Fund");
    expect(within(screen.getByTestId("top-row-1")).getByText("ICICI Bank Ltd")).toBeInTheDocument();
  });
});

describe("the heading strip and the list", () => {
  it("shows the fund's name, a dot in its colour, and the share of the fund held in the listed names", () => {
    mount();
    expect(screen.getByTestId("fund-strip")).toHaveTextContent("Kotak Multi Cap Fund");
    expect(screen.getByTestId("strip-dot")).toHaveStyle({ backgroundColor: "var(--c1)" });
    expect(screen.getByTestId("strip-total")).toHaveTextContent("47.2% in these 10 names");
  });
  it("makes the stated share equal the sum of the listed weights", () => {
    mount();
    fireEvent.click(screen.getByTestId("chip-S-HDFC"));
    const listed = within(screen.getByRole("list", { name: "Top holdings" })).getAllByRole("listitem");
    expect(listed).toHaveLength(9);
    const weights = listed.map(item => Number(/(\d+\.\d\d)%/.exec(item.textContent ?? "")?.[1]));
    expect(weights.reduce((a, b) => a + b, 0).toFixed(1)).toBe("33.8");
    expect(screen.getByTestId("strip-total")).toHaveTextContent("33.8% in these 9 names");
  });
  it("lists ten names at most, largest weight inside the fund first, with two-place weights", () => {
    mount();
    const list = within(screen.getByRole("list", { name: "Top holdings" }));
    expect(list.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByTestId("top-row-1")).toHaveTextContent("HDFC Bank Ltd");
    expect(screen.getByTestId("top-row-1")).toHaveTextContent("7.80%");
    expect(screen.getByTestId("top-row-10")).toHaveTextContent("Tata Consultancy Services Ltd");
    expect(screen.queryByText("Mahindra & Mahindra Ltd")).not.toBeInTheDocument();
  });
  it("gives gold, silver and bronze to the first three ranks only", () => {
    mount();
    expect([1, 2, 3, 4].map(rank => screen.getByTestId(`rank-${rank}`).getAttribute("data-medal"))).toEqual(["gold", "silver", "bronze", null]);
  });
  it("gives each name a two-letter avatar and a bar in proportion to its weight, in the fund's colour", () => {
    mount();
    expect(screen.getByTestId("avatar-1")).toHaveTextContent("HB");
    expect(screen.getByTestId("avatar-2")).toHaveTextContent("IB");
    expect(screen.getByTestId("top-bar-1")).toHaveStyle({ width: "100%", backgroundColor: "var(--c1)" });
    expect(screen.getByTestId("top-bar-2")).toHaveStyle({ width: "88.46%" });
    expect(screen.getByTestId("top-bar-10")).toHaveStyle({ width: "38.46%" });
  });
  it("does not ask for anything when a chip is clicked: it re-sorts what it already has", () => {
    const data = fb.stockHoldings();
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    mount(data);
    fireEvent.click(screen.getByTestId("chip-S-SBI"));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("says when the list is the largest part of a longer portfolio", () => {
    mount();
    expect(screen.getByTestId("top-note")).toHaveTextContent("Based on the largest 24 of 31 stocks held across your portfolio.");
    const data = fb.stockHoldings();
    data.truncated = false;
    cleanup();
    mount(data);
    expect(screen.queryByTestId("top-note")).not.toBeInTheDocument();
  });
});

describe("states", () => {
  it("shows an empty message when there are no equity stocks", () => {
    const data = fb.stockHoldings();
    data.rows = [];
    mount(data);
    expect(screen.getByText("No stock holdings to show yet")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Top Holdings by Fund" })).toBeInTheDocument();
  });
  it("keeps the heading in the loading state and offers Retry when the section failed", () => {
    const retry = vi.fn();
    const { unmount } = mount(null, "loading");
    expect(screen.getByRole("status", { name: "Loading Top Holdings by Fund" })).toBeInTheDocument();
    unmount();
    mount(null, "failed", retry);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it("marks every control with its effect and its state", () => {
    const { container } = mount();
    fireEvent.click(screen.getByTestId("chip-S-HDFC"));
    expectInteractivity(container, 4);
  });
});
