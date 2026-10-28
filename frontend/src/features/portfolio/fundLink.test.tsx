import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";
import { fixture } from "./fixtures/insights";
import { insightLines, insightText } from "./quickInsightsCopy";
import { QuickInsights } from "./sections/QuickInsights";
import type { PortfolioInsightsResponse } from "./types";

// Entry point to the Individual Fund page from the Portfolio page (packet IF-E): the largest holding's name.
const DEBT = "cf09c887-92a1-5b49-a624-7f067ed6a2c8";
const NOT_LIVE = buildRegistry().map(route => (route.id === "portfolio-mutual-funds-fund" ? { ...route, status: "placeholder" as const } : route));
const family = () => fixture<PortfolioInsightsResponse>("insights_family");
const show = (data: PortfolioInsightsResponse, routes = buildRegistry()) =>
  renderInShell(<QuickInsights status="data" data={data} onRetry={vi.fn()} />, { routes });

describe("Quick Insights: the largest holding opens its fund page", () => {
  it("makes the fund's name in the first line a link to its page, in bold", () => {
    show(family());
    const line = screen.getByTestId("insight-largest-holding");
    const link = within(line).getByRole("link", { name: "Dev Short Duration Debt" });
    expect(link).toHaveAttribute("href", `/portfolio/mutual-funds/funds/${DEBT}`);
    expect(link.closest("b")).not.toBeNull();
  });

  it("changes no word of the line", () => {
    const data = family();
    show(data);
    expect(screen.getByTestId("insight-largest-holding").textContent).toBe(insightText(insightLines(data.insights)[0]));
    expect(screen.getByTestId("insight-largest-holding")).toHaveTextContent("Your largest holding is Dev Short Duration Debt — 38.6% of your total portfolio");
  });

  it("is the only link on the card: the other lines stay plain text", () => {
    show(family());
    expect(screen.getAllByRole("link")).toHaveLength(1);
    for (const id of ["spread", "plan-split", "largest-amc", "sips"]) {
      expect(within(screen.getByTestId(`insight-${id}`)).queryByRole("link")).toBeNull();
    }
  });

  it("takes the page from this response's scheme id and encodes it", () => {
    const data = family();
    data.insights.largest_holding!.scheme_id = "a b/c";
    show(data);
    expect(screen.getByRole("link", { name: "Dev Short Duration Debt" })).toHaveAttribute("href", "/portfolio/mutual-funds/funds/a%20b%2Fc");
  });

  it("can be reached with the keyboard", () => {
    show(family());
    const link = screen.getByRole("link", { name: "Dev Short Duration Debt" });
    link.focus();
    expect(link).toHaveFocus();
  });

  it("shows the name as plain bold text when the scheme id is empty", () => {
    const data = family();
    data.insights.largest_holding!.scheme_id = "";
    show(data);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(within(screen.getByTestId("insight-largest-holding")).getByText("Dev Short Duration Debt").tagName).toBe("B");
  });

  it("has no link and no line at all when there is no largest holding", () => {
    const data = family();
    data.insights.largest_holding = null;
    show(data);
    expect(screen.queryByTestId("insight-largest-holding")).toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("works for a single member's insights too", () => {
    const data = fixture<PortfolioInsightsResponse>("insights_member");
    show(data);
    const link = screen.getByRole("link", { name: data.insights.largest_holding!.fund_name });
    expect(link).toHaveAttribute("href", `/portfolio/mutual-funds/funds/${data.insights.largest_holding!.scheme_id}`);
  });

  it("is greyed and inert while the fund page is not live", () => {
    show(family(), NOT_LIVE);
    const link = screen.getByRole("link", { name: "Dev Short Duration Debt" });
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).not.toHaveAttribute("href");
  });
});

describe("insightLines: the fund name part carries its scheme id", () => {
  it("sets schemeId on the bold name of the largest holding only", () => {
    const lines = insightLines(family().insights);
    expect(lines[0].parts.map(part => part.schemeId)).toEqual([undefined, DEBT, undefined]);
    for (const line of lines.slice(1)) {
      expect(line.parts.every(part => part.schemeId === undefined)).toBe(true);
    }
  });
});
