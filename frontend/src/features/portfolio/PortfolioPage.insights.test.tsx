import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, invalidateApiCache } from "@/lib/apiClient";
import { renderInShell } from "@/shell/testing";
import { fixture } from "./fixtures";
import { fixture as insightsFixture } from "./fixtures/insights";
import PortfolioPage from "./PortfolioPage";
import type { PortfolioInsightsResponse, PortfolioSummaryResponse } from "./types";

// The Quick Insights card on the Portfolio page: its own request, its own states, its place under Family Members.
vi.mock("../auth/session", () => ({ getToken: () => "tok-123" }));

const ASHA = "81e5a369-bbd4-59f1-b480-8a5bbf1c74ef";
const DEV = "e6b4557c-b0e3-58f9-8642-54da2db3a27d";
const MEMBERS = [{ id: ASHA, name: "ASHARAO" }, { id: DEV, name: "DevRao" }];
const FAMILY_INSIGHTS = "/household/aggregate/portfolio-insights";
const DEV_INSIGHTS = `/household-members/${DEV}/portfolio-insights`;

type Responder = (path: string) => Response | Promise<Response> | undefined;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function memberSummary(id: string, totalValue: string) {
  return { ...fixture<PortfolioSummaryResponse>("summary_member"), member_id: id, total_value: totalValue };
}

function defaultResponse(path: string): Response {
  switch (path) {
    case "/household/aggregate/portfolio-summary": return json(fixture("summary_family"));
    case "/household/aggregate/portfolio-allocation": return json(fixture("allocation_family"));
    case "/household/aggregate/portfolio-value-series?days=30": return json(fixture("series_family_30d"));
    case FAMILY_INSIGHTS: return json(insightsFixture("insights_family"));
    case `/household-members/${ASHA}/portfolio-summary`: return json(memberSummary(ASHA, "2200.00"));
    case `/household-members/${DEV}/portfolio-summary`: return json(memberSummary(DEV, "3012.00"));
    case `/household-members/${DEV}/portfolio-allocation`: return json(fixture("allocation_member"));
    case `/household-members/${DEV}/portfolio-value-series?days=30`: return json(fixture("series_member_30d"));
    case DEV_INSIGHTS: return json(insightsFixture("insights_member"));
    default: return json({ detail: `unexpected ${path}` }, 404);
  }
}

let calls: string[] = [];
const count = (path: string) => calls.filter(call => call === path).length;
const never = () => new Promise<Response>(() => {});

function serve(responder: Responder = () => undefined) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    const path = String(url).slice(API_BASE_URL.length);
    calls.push(path);
    return responder(path) ?? defaultResponse(path);
  }));
}

function renderPage(options: { members?: typeof MEMBERS; viewMode?: "aggregate" | "member"; memberId?: string } = {}) {
  const { members = MEMBERS, viewMode, memberId } = options;
  return renderInShell(<PortfolioPage />, { path: "/portfolio", scope: { members, viewMode, memberId } });
}

beforeEach(() => invalidateApiCache());
afterEach(() => vi.unstubAllGlobals());

describe("PortfolioPage: the Quick Insights card, family view", () => {
  it("loads the family insights once, with its own request", async () => {
    serve();
    renderPage();
    const region = await screen.findByRole("region", { name: "Quick Insights" });
    expect(within(region).getByTestId("insight-spread")).toHaveTextContent("Spread across 5 AMCs and 6 funds");
    expect(count(FAMILY_INSIGHTS)).toBe(1);
  });

  it("draws all five insights of the fixture", async () => {
    serve();
    renderPage();
    await screen.findByRole("region", { name: "Quick Insights" });
    expect(screen.getByTestId("insight-largest-holding")).toHaveTextContent("— 33.0% of your total portfolio");
    expect(screen.getByTestId("insight-plan-split")).toHaveTextContent("69% Direct, 30% Regular");
    expect(screen.getByTestId("insight-largest-amc")).toHaveTextContent("HDFC Mutual Fund at 46%");
    expect(screen.getByTestId("insight-sips")).toHaveTextContent("₹17,000 in active SIPs scheduled this month");
  });

  it("sits directly under the Family Members card, last on the page", async () => {
    serve();
    renderPage();
    const insights = await screen.findByRole("region", { name: "Quick Insights" });
    const family = screen.getByRole("region", { name: "Family Members" });
    const allocation = await screen.findByRole("region", { name: "Asset Allocation" });
    expect(family.compareDocumentPosition(insights) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(allocation.compareDocumentPosition(family) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(insights.nextElementSibling).toBeNull();
  });

  it("shows its loading state while the others are already there", async () => {
    serve(path => path === FAMILY_INSIGHTS ? never() : undefined);
    renderPage();
    expect(await screen.findByTestId("value-total")).toBeInTheDocument();
    expect(await screen.findByTestId("legend-mutual-funds")).toBeInTheDocument();
    expect(await screen.findByTestId(`family-row-${ASHA}`)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading quick insights" })).toBeInTheDocument();
  });

  it("shows the insights while the summary never arrives", async () => {
    serve(path => path === "/household/aggregate/portfolio-summary" ? never() : undefined);
    renderPage();
    expect(await screen.findByRole("region", { name: "Quick Insights" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading summary" })).toBeInTheDocument();
  });

  it("fails on its own and retries only the insights", async () => {
    let failing = true;
    serve(path => path === FAMILY_INSIGHTS && failing ? json({ detail: "boom" }, 500) : undefined);
    renderPage();
    expect(await screen.findByText("Couldn't load your quick insights")).toBeInTheDocument();
    expect(screen.getByTestId("value-total")).toHaveTextContent("₹5,212");
    expect(await screen.findByTestId(`family-row-${ASHA}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("region", { name: "Quick Insights" })).toBeInTheDocument();
    expect(count(FAMILY_INSIGHTS)).toBe(2);
    expect(count("/household/aggregate/portfolio-summary")).toBe(1);
    expect(count("/household/aggregate/portfolio-allocation")).toBe(1);
  });

  it("does not disturb the other sections when only the insights fail", async () => {
    serve(path => path === FAMILY_INSIGHTS ? json({ detail: "boom" }, 500) : undefined);
    renderPage();
    await screen.findByText("Couldn't load your quick insights");
    expect(screen.queryByText("Couldn't load your portfolio")).toBeNull();
    expect(screen.getByRole("region", { name: "Asset Allocation" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Family Members" })).toBeInTheDocument();
  });
});

describe("PortfolioPage: the Quick Insights card, empty and partial answers", () => {
  it("leaves the card out when the backend says there is nothing to summarise", async () => {
    serve(path => path === FAMILY_INSIGHTS ? json(insightsFixture("insights_empty")) : undefined);
    renderPage();
    await screen.findByTestId("value-total");
    await screen.findByTestId(`family-row-${ASHA}`);
    await waitFor(() => expect(screen.queryByRole("status", { name: "Loading quick insights" })).toBeNull());
    expect(screen.queryByRole("region", { name: "Quick Insights" })).toBeNull();
    expect(screen.queryByText("Couldn't load your quick insights")).toBeNull();
  });

  it("leaves the card out when holdings exist but none has a price", async () => {
    serve(path => path === FAMILY_INSIGHTS ? json(insightsFixture("insights_no_prices")) : undefined);
    renderPage();
    await screen.findByTestId("value-total");
    await waitFor(() => expect(screen.queryByRole("status", { name: "Loading quick insights" })).toBeNull());
    expect(screen.queryByRole("region", { name: "Quick Insights" })).toBeNull();
  });

  it("shows a partial answer like any other", async () => {
    serve(path => path === FAMILY_INSIGHTS ? json(insightsFixture("insights_partial")) : undefined);
    renderPage();
    expect(await screen.findByTestId("insight-spread")).toHaveTextContent("Spread across 4 AMCs and 5 funds");
  });

  it("leaves out the SIP line when no SIP is active", async () => {
    serve(path => path === FAMILY_INSIGHTS ? json(insightsFixture("insights_no_sips")) : undefined);
    renderPage();
    await screen.findByTestId("insight-largest-amc");
    expect(screen.queryByTestId("insight-sips")).toBeNull();
  });
});

describe("PortfolioPage: the Quick Insights card, page-level states", () => {
  it("does not draw the card on the empty-portfolio page", async () => {
    serve(path => {
      if (path === "/household/aggregate/portfolio-summary") return json(fixture("summary_empty"));
      if (path === "/household/aggregate/portfolio-allocation") return json(fixture("allocation_empty"));
      if (path === "/household/aggregate/portfolio-value-series?days=30") return json(fixture("series_empty"));
      if (path === FAMILY_INSIGHTS) return json(insightsFixture("insights_empty"));
      return undefined;
    });
    renderPage();
    expect(await screen.findByText("Nothing here yet")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Quick Insights" })).toBeNull();
    expect(screen.queryByRole("status", { name: "Loading quick insights" })).toBeNull();
  });

  it("does not draw the card on the page error, and the page retry does not reload the insights", async () => {
    let failing = true;
    serve(path => failing && (path.endsWith("portfolio-summary") || path.endsWith("portfolio-allocation")) && path.startsWith("/household/aggregate")
      ? json({ detail: "boom" }, 500) : undefined);
    renderPage();
    expect(await screen.findByText("Couldn't load your portfolio")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Quick Insights" })).toBeNull();
    expect(screen.queryByText("Couldn't load your quick insights")).toBeNull();
    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("region", { name: "Quick Insights" })).toBeInTheDocument();
    expect(count(FAMILY_INSIGHTS)).toBe(1);
  });
});

describe("PortfolioPage: the Quick Insights card, member scope", () => {
  it("fetches the member's own insights and none for the family", async () => {
    serve();
    renderPage({ viewMode: "member", memberId: DEV });
    const region = await screen.findByRole("region", { name: "Quick Insights" });
    expect(within(region).getByTestId("insight-spread")).toHaveTextContent("Spread across 3 AMCs and 3 funds");
    expect(within(region).getByTestId("insight-sips")).toHaveTextContent("₹5,000");
    expect(calls).toContain(DEV_INSIGHTS);
    expect(calls).not.toContain(FAMILY_INSIGHTS);
  });

  it("reloads for the member after a switch, showing its loading state and no stale figures", async () => {
    serve();
    renderPage();
    const family = await screen.findByRole("region", { name: "Quick Insights" });
    expect(within(family).getByTestId("insight-spread")).toHaveTextContent("5 AMCs and 6 funds");
    serve(path => path === DEV_INSIGHTS ? never() : undefined);
    fireEvent.click(await screen.findByTestId(`family-row-${DEV}`));
    expect(await screen.findByRole("status", { name: "Loading quick insights" })).toBeInTheDocument();
    expect(screen.queryByTestId("insight-spread")).toBeNull();
    expect(screen.queryByRole("region", { name: "Quick Insights" })).toBeNull();
    expect(count(DEV_INSIGHTS)).toBe(1);
  });

  it("reloads when one member is swapped for another, although the view mode stays the same", async () => {
    const ashaInsights = insightsFixture<PortfolioInsightsResponse>("insights_member");
    ashaInsights.member_id = ASHA;
    ashaInsights.insights.spread = { fund_count: 2, amc_count: 2 };
    const ASHA_INSIGHTS = `/household-members/${ASHA}/portfolio-insights`;
    serve(path => {
      if (path === ASHA_INSIGHTS) return json(ashaInsights);
      if (path === `/household-members/${ASHA}/portfolio-allocation`) return json(fixture("allocation_member"));
      if (path === `/household-members/${ASHA}/portfolio-value-series?days=30`) return json(fixture("series_member_30d"));
      return undefined;
    });
    renderPage({ viewMode: "member", memberId: ASHA });
    expect(await screen.findByTestId("insight-spread")).toHaveTextContent("Spread across 2 AMCs and 2 funds");
    fireEvent.click(await screen.findByTestId(`family-row-${DEV}`));
    await waitFor(() => expect(screen.getByTestId("insight-spread")).toHaveTextContent("Spread across 3 AMCs and 3 funds"));
    expect(count(ASHA_INSIGHTS)).toBe(1);
    expect(count(DEV_INSIGHTS)).toBe(1);
  });

  it("shows the member's insights after the switch, and the family's again after returning", async () => {
    serve();
    renderPage();
    await screen.findByRole("region", { name: "Quick Insights" });
    fireEvent.click(await screen.findByTestId(`family-row-${DEV}`));
    await waitFor(() => expect(screen.getByTestId("insight-spread")).toHaveTextContent("Spread across 3 AMCs and 3 funds"));
    fireEvent.click(await screen.findByRole("button", { name: "Family combined" }));
    await waitFor(() => expect(screen.getByTestId("insight-spread")).toHaveTextContent("Spread across 5 AMCs and 6 funds"));
  });
});

describe("PortfolioPage: the Quick Insights card, a household of one", () => {
  it("still shows the insights under the single-member note", async () => {
    serve();
    renderPage({ members: [MEMBERS[1]] });
    expect(await screen.findByText(/You're the only member in this household/)).toBeInTheDocument();
    const region = await screen.findByRole("region", { name: "Quick Insights" });
    expect(within(region).getByTestId("insight-spread")).toHaveTextContent("Spread across 3 AMCs and 3 funds");
  });
});
