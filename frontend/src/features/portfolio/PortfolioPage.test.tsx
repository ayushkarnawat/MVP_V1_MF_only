import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, invalidateApiCache } from "@/lib/apiClient";
import { renderInShell } from "@/shell/testing";
import { fixture } from "./fixtures";
import { fixture as insightsFixture } from "./fixtures/insights";
import PortfolioPage from "./PortfolioPage";
import type { PortfolioSummaryResponse } from "./types";

vi.mock("../auth/session", () => ({ getToken: () => "tok-123" }));

const ASHA = "81e5a369-bbd4-59f1-b480-8a5bbf1c74ef";
const DEV = "e6b4557c-b0e3-58f9-8642-54da2db3a27d";
const MEMBERS = [{ id: ASHA, name: "ASHARAO" }, { id: DEV, name: "DevRao" }];

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
    case `/household-members/${ASHA}/portfolio-summary`: return json(memberSummary(ASHA, "2200.00"));
    case "/household/aggregate/portfolio-insights": return json(insightsFixture("insights_family"));
    case `/household-members/${DEV}/portfolio-summary`: return json(memberSummary(DEV, "3012.00"));
    case `/household-members/${DEV}/portfolio-insights`: return json(insightsFixture("insights_member"));
    case `/household-members/${DEV}/portfolio-allocation`: return json(fixture("allocation_member"));
    case `/household-members/${DEV}/portfolio-value-series?days=30`: return json(fixture("series_member_30d"));
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

function renderPage(options: { members?: typeof MEMBERS; viewMode?: "aggregate" | "member"; memberId?: string; openImport?: (id?: string) => void } = {}) {
  const { members = MEMBERS, viewMode, memberId, openImport = vi.fn() } = options;
  const view = renderInShell(<PortfolioPage />, { path: "/portfolio", scope: { members, viewMode, memberId }, openImport });
  return { ...view, openImport };
}

beforeEach(() => invalidateApiCache());
afterEach(() => vi.unstubAllGlobals());

describe("PortfolioPage: the family view", () => {
  it("fetches the four sections for the family and one summary per member", async () => {
    serve();
    renderPage();
    await screen.findByTestId("value-total");
    await screen.findByTestId(`family-row-${ASHA}`);
    await screen.findByTestId("sparkline");
    expect(calls).toEqual(expect.arrayContaining([
      "/household/aggregate/portfolio-summary",
      "/household/aggregate/portfolio-allocation",
      "/household/aggregate/portfolio-value-series?days=30",
      "/household/aggregate/portfolio-insights",
      `/household-members/${ASHA}/portfolio-summary`,
      `/household-members/${DEV}/portfolio-summary`,
    ]));
    expect(calls).toHaveLength(6);
  });

  it("draws the header, the summary, the allocation and the family", async () => {
    serve();
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "All Investments" })).toBeInTheDocument();
    expect(screen.getByText("View and manage your complete family portfolio across asset classes.")).toBeInTheDocument();
    expect(await screen.findByTestId("value-total")).toHaveTextContent("₹5,212");
    expect(await screen.findByRole("region", { name: "Asset Allocation" })).toBeInTheDocument();
    expect(await screen.findByTestId("legend-mutual-funds")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Family Members" })).toBeInTheDocument();
    expect(await screen.findByTestId(`family-value-${ASHA}`)).toHaveTextContent("₹2,200 (42.2%)");
    expect(screen.getByTestId(`family-value-${DEV}`)).toHaveTextContent("₹3,012 (57.8%)");
    expect(screen.getByTestId(`family-row-${ASHA}`)).toHaveTextContent("Asharao");
  });

  it("flags partial data from the summary", async () => {
    serve(path => path === "/household/aggregate/portfolio-summary" ? json(fixture("summary_partial")) : undefined);
    renderPage();
    const note = await within(await screen.findByTestId("metric-total-value")).findByRole("note");
    expect(note).toHaveTextContent("1 on last known NAV");
  });

  it("opens the import for the family from Add Investment", async () => {
    serve();
    const { openImport } = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Add Investment" }));
    expect(openImport).toHaveBeenCalledTimes(1);
    expect(openImport).toHaveBeenCalledWith(undefined);
  });
});

describe("PortfolioPage: independent sections", () => {
  it("shows the others while the summary never arrives", async () => {
    serve(path => path === "/household/aggregate/portfolio-summary" ? never() : undefined);
    renderPage();
    expect(await screen.findByTestId("legend-mutual-funds")).toBeInTheDocument();
    expect(await screen.findByTestId(`family-row-${ASHA}`)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading summary" })).toBeInTheDocument();
  });

  it("shows the summary while the allocation never arrives", async () => {
    serve(path => path === "/household/aggregate/portfolio-allocation" ? never() : undefined);
    renderPage();
    expect(await screen.findByTestId("value-total")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading allocation" })).toBeInTheDocument();
  });

  it("shows the family while the member summaries never arrive as a placeholder, and the rest", async () => {
    serve(path => path.startsWith("/household-members/") ? never() : undefined);
    renderPage();
    expect(await screen.findByTestId("value-total")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading family members" })).toBeInTheDocument();
  });

  it("keeps the summary figures when only the trend fails, and retries only the trend", async () => {
    let failing = true;
    serve(path => path.includes("portfolio-value-series") && failing ? json({ detail: "boom" }, 500) : undefined);
    renderPage();
    expect(await screen.findByText("Couldn't load trend")).toBeInTheDocument();
    expect(screen.getByTestId("value-total")).toHaveTextContent("₹5,212");
    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("sparkline")).toBeInTheDocument();
    expect(count("/household/aggregate/portfolio-summary")).toBe(1);
    expect(count("/household/aggregate/portfolio-value-series?days=30")).toBe(2);
  });

  it("shows an allocation failure on its own and retries only the allocation", async () => {
    let failing = true;
    serve(path => path === "/household/aggregate/portfolio-allocation" && failing ? json({ detail: "boom" }, 500) : undefined);
    renderPage();
    expect(await screen.findByText("Couldn't load your asset allocation")).toBeInTheDocument();
    expect(screen.getByTestId("value-total")).toHaveTextContent("₹5,212");
    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("legend-mutual-funds")).toBeInTheDocument();
    expect(count("/household/aggregate/portfolio-allocation")).toBe(2);
    expect(count("/household/aggregate/portfolio-summary")).toBe(1);
  });

  it("shows a family failure on its own and retries all the member summaries", async () => {
    let failing = true;
    serve(path => path === `/household-members/${ASHA}/portfolio-summary` && failing ? json({ detail: "boom" }, 500) : undefined);
    renderPage();
    expect(await screen.findByText("Couldn't load family members")).toBeInTheDocument();
    expect(screen.getByTestId("value-total")).toHaveTextContent("₹5,212");
    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId(`family-row-${ASHA}`)).toBeInTheDocument();
  });
});

describe("PortfolioPage: page-level states", () => {
  it("shows one page error when both the summary and the allocation fail, and retries both", async () => {
    let failing = true;
    serve(path => failing && (path.endsWith("portfolio-summary") || path.endsWith("portfolio-allocation")) && path.startsWith("/household/aggregate")
      ? json({ detail: "boom" }, 500) : undefined);
    renderPage();
    expect(await screen.findByText("Couldn't load your portfolio")).toBeInTheDocument();
    expect(screen.getByText("There was a problem reaching our servers. Your data is safe — this is just a connection issue.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Asset Allocation" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Family Members" })).toBeNull();
    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("value-total")).toHaveTextContent("₹5,212");
    expect(await screen.findByTestId("legend-mutual-funds")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load your portfolio")).toBeNull();
  });

  it("invites the first import instead of showing zeros when nothing is held", async () => {
    serve(path => {
      if (path === "/household/aggregate/portfolio-summary") return json(fixture("summary_empty"));
      if (path === "/household/aggregate/portfolio-allocation") return json(fixture("allocation_empty"));
      if (path === "/household/aggregate/portfolio-value-series?days=30") return json(fixture("series_empty"));
      return undefined;
    });
    const { openImport } = renderPage();
    expect(await screen.findByText("Nothing here yet")).toBeInTheDocument();
    expect(screen.getByText(
      "Import your first CAS statement and your family's portfolio will show up here — total value, allocation, and gains, all in one place.",
    )).toBeInTheDocument();
    expect(screen.queryByTestId("value-total")).toBeNull();
    expect(screen.queryByRole("region", { name: "Asset Allocation" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Family Members" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add your first investment" }));
    expect(openImport).toHaveBeenCalledWith(undefined);
  });
});

describe("PortfolioPage: member scope and the member switch", () => {
  it("fetches the member's own sections", async () => {
    serve();
    renderPage({ viewMode: "member", memberId: DEV });
    expect(await screen.findByTestId("value-total")).toHaveTextContent("₹3,012");
    await screen.findByTestId("sparkline");
    expect(calls).toEqual(expect.arrayContaining([
      `/household-members/${DEV}/portfolio-summary`,
      `/household-members/${DEV}/portfolio-allocation`,
      `/household-members/${DEV}/portfolio-value-series?days=30`,
    ]));
    expect(calls.some(call => call.startsWith("/household/aggregate"))).toBe(false);
  });

  it("names the member in the subtitle and marks them in the family card", async () => {
    serve();
    renderPage({ viewMode: "member", memberId: DEV });
    expect(screen.getByText("View and manage DevRao's portfolio across asset classes.")).toBeInTheDocument();
    expect(await screen.findByTestId(`family-row-${DEV}`)).toHaveAttribute("aria-current", "true");
    expect(screen.getByTestId(`family-row-${ASHA}`)).not.toHaveAttribute("aria-current");
  });

  it("opens the import for the member from Add Investment", async () => {
    serve();
    const { openImport } = renderPage({ viewMode: "member", memberId: DEV });
    fireEvent.click(screen.getByRole("button", { name: "Add Investment" }));
    expect(openImport).toHaveBeenCalledWith(DEV);
  });

  it("switches to a member from the family card without refetching the family", async () => {
    serve();
    renderPage();
    expect(await screen.findByTestId("value-total")).toHaveTextContent("₹5,212");
    fireEvent.click(await screen.findByTestId(`family-row-${DEV}`));
    // The family card keeps its rows through the switch (its data does not depend on the scope).
    expect(screen.queryByRole("status", { name: "Loading family members" })).toBeNull();
    expect(screen.getByTestId(`family-row-${ASHA}`)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("value-total")).toHaveTextContent("₹3,012"));
    expect(screen.queryByRole("status", { name: "Loading family members" })).toBeNull();
    expect(calls).toEqual(expect.arrayContaining([
      `/household-members/${DEV}/portfolio-allocation`,
      `/household-members/${DEV}/portfolio-value-series?days=30`,
    ]));
    expect(screen.getByTestId(`family-row-${DEV}`)).toHaveAttribute("aria-current", "true");
  });

  it("shows no stale figures while a switched scope loads", async () => {
    serve();
    renderPage();
    await screen.findByTestId("value-total");
    serve(path => path === `/household-members/${DEV}/portfolio-summary` ? never() : undefined);
    fireEvent.click(await screen.findByTestId(`family-row-${DEV}`));
    expect(await screen.findByRole("status", { name: "Loading summary" })).toBeInTheDocument();
    expect(screen.queryByText("₹5,212")).toBeNull();
  });

  it("returns to the family from the family card", async () => {
    serve();
    renderPage({ viewMode: "member", memberId: DEV });
    await screen.findByTestId("value-total");
    fireEvent.click(await screen.findByRole("button", { name: "Family combined" }));
    await waitFor(() => expect(screen.getByTestId("value-total")).toHaveTextContent("₹5,212"));
    expect(calls).toContain("/household/aggregate/portfolio-summary");
  });
});

describe("PortfolioPage: a household of one", () => {
  it("explains there is nothing to compare and fetches no extra member summary", async () => {
    serve();
    renderPage({ members: [MEMBERS[1]] });
    expect(await screen.findByTestId("value-total")).toHaveTextContent("₹3,012");
    expect(await screen.findByText(/You're the only member in this household/)).toBeInTheDocument();
    expect(count(`/household-members/${DEV}/portfolio-summary`)).toBe(1);
  });
});
