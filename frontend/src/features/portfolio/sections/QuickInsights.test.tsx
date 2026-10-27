import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures/insights";
import type { PortfolioInsightsResponse } from "../types";
import { QuickInsights, type QuickInsightsProps } from "./QuickInsights";

const get = (name: string) => fixture<PortfolioInsightsResponse>(name);

function setup(overrides: Partial<QuickInsightsProps> = {}) {
  const onRetry = vi.fn();
  const props: QuickInsightsProps = { status: "data", data: get("insights_family"), onRetry, ...overrides };
  const view = render(<QuickInsights {...props} />);
  return { ...view, onRetry };
}

const boldTexts = (item: HTMLElement) => Array.from(item.querySelectorAll("b")).map(node => node.textContent);

describe("QuickInsights: states", () => {
  it("shows a loading placeholder and nothing else", () => {
    setup({ status: "loading", data: null });
    expect(screen.getByRole("status", { name: "Loading quick insights" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Quick Insights" })).toBeNull();
    expect(screen.queryAllByTestId(/^insight-/)).toHaveLength(0);
  });

  it("shows a message and a retry button on an error, and treats data status without data the same", () => {
    const { onRetry, unmount } = setup({ status: "error", data: null });
    expect(screen.getByRole("heading", { level: 4, name: "Couldn't load your quick insights" })).toBeInTheDocument();
    expect(screen.getByText("This section failed to load, but the rest of the page is unaffected.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    unmount();
    setup({ status: "data", data: null });
    expect(screen.getByText("Couldn't load your quick insights")).toBeInTheDocument();
  });

  it("draws nothing at all when the scope is empty, whatever the reason", () => {
    for (const name of ["insights_empty", "insights_no_prices"]) {
      const { container, unmount } = setup({ data: get(name) });
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("draws nothing when no insight survives", () => {
    const body = get("insights_family");
    body.insights = {
      largest_holding: null,
      spread: { fund_count: 0, amc_count: 0 },
      plan_split: null,
      largest_amc: null,
      sips: { active_count: 0, monthly_total: "0.00" },
    };
    const { container } = setup({ data: body });
    expect(container).toBeEmptyDOMElement();
  });
});

describe("QuickInsights: the family insights", () => {
  it("is a region named Quick Insights with a heading and the signed-off subtitle", () => {
    setup();
    const region = screen.getByRole("region", { name: "Quick Insights" });
    expect(within(region).getByRole("heading", { level: 3, name: "Quick Insights" })).toBeInTheDocument();
    expect(within(region).getByText("From your current holdings")).toBeInTheDocument();
  });

  it("lists the five insights in order with the signed-off wording", () => {
    setup();
    const list = screen.getByRole("list", { name: "Quick insights" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map(item => item.getAttribute("data-testid"))).toEqual([
      "insight-largest-holding", "insight-spread", "insight-plan-split", "insight-largest-amc", "insight-sips",
    ]);
    expect(items.map(item => item.textContent)).toEqual([
      "Your largest holding is Dev Short Duration Debt — 38.6% of your total portfolio",
      "Spread across 1 AMC and 4 funds",
      "100% Direct, 0% Regular",
      "Your largest single AMC exposure is Home Test AMC at 100%",
      "₹9,000 in active SIPs scheduled this month",
    ]);
  });

  it("puts the key figure of each line in bold", () => {
    setup();
    expect(boldTexts(screen.getByTestId("insight-largest-holding"))).toEqual(["Dev Short Duration Debt"]);
    expect(boldTexts(screen.getByTestId("insight-spread"))).toEqual(["1 AMC", "4 funds"]);
    expect(boldTexts(screen.getByTestId("insight-plan-split"))).toEqual(["100% Direct"]);
    expect(boldTexts(screen.getByTestId("insight-largest-amc"))).toEqual(["Home Test AMC at 100%"]);
    expect(boldTexts(screen.getByTestId("insight-sips"))).toEqual(["₹9,000"]);
  });

  it("marks each line with a decorative check that screen readers skip", () => {
    setup();
    const item = screen.getByTestId("insight-spread");
    const marks = item.querySelectorAll("[data-testid='insight-check']");
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveAttribute("aria-hidden", "true");
    expect(marks[0].textContent).toBe("");
  });

  it("is plain text: no link, no button, nothing to click", () => {
    setup();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("renders the figures it is given, not a fixed set (member fixture)", () => {
    setup({ data: get("insights_member") });
    expect(screen.getByTestId("insight-spread")).toHaveTextContent("Spread across 1 AMC and 2 funds");
    expect(screen.getByTestId("insight-plan-split")).toHaveTextContent("100% Direct, 0% Regular");
    expect(screen.getByTestId("insight-sips")).toHaveTextContent("₹4,000 in active SIPs scheduled this month");
  });
});

describe("QuickInsights: partial data and missing lines", () => {
  it("still shows the insights of a partial response", () => {
    setup({ data: get("insights_partial") });
    expect(screen.getByTestId("insight-spread")).toHaveTextContent("Spread across 1 AMC and 3 funds");
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("leaves out the SIP line when no SIP is active and keeps the other four", () => {
    setup({ data: get("insights_no_sips") });
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.queryByTestId("insight-sips")).toBeNull();
    expect(screen.getByTestId("insight-largest-holding")).toBeInTheDocument();
  });

  it("leaves out a line whose insight is null", () => {
    const body = get("insights_family");
    body.insights.plan_split = null;
    body.insights.largest_amc = null;
    setup({ data: body });
    expect(screen.getAllByRole("listitem").map(item => item.getAttribute("data-testid"))).toEqual([
      "insight-largest-holding", "insight-spread", "insight-sips",
    ]);
  });

  it("adds the unclassified share when it is large enough to matter", () => {
    const body = get("insights_family");
    body.insights.plan_split = {
      direct: { value: "2570931.30", pct: "69.4091" },
      regular: { value: "1120750.35", pct: "30.2576" },
      unclassified: { value: "12345.67", pct: "12.5000" },
    };
    setup({ data: body });
    expect(screen.getByTestId("insight-plan-split")).toHaveTextContent("69% Direct, 30% Regular, 13% Unclassified");
    expect(boldTexts(screen.getByTestId("insight-plan-split"))).toEqual(["69% Direct"]);
  });
});
