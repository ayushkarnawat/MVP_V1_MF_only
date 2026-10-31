import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fc from "../fixtures/mfC";
import * as fo from "../fixtures/mfCother";
import { renderInShell } from "../../../shell/testing";
import { analyticsStore } from "../data/analyticsStore";
import OtherAnalyticsPage from "./OtherAnalyticsPage";

const mocks = vi.hoisted(() => ({ getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn() }));
vi.mock("../../auth/session", () => ({ getToken: () => "t1" }));
vi.mock("../api", () => mocks);
const members = [{ id: "m1", name: "Member" }];
const rank = (value: number | null, total: number, status = "ranked") => ({ rank: value, total, status });
function sample() {
  // Current fixture defaults; the old-payload test explicitly removes periods.
  const old = fo.fundRanking().funds[0];
  return { funds: [
    { ...old, scheme_id: "A", scheme_name: "HDFC Flexi Cap Fund", sebi_category: "Equity Scheme - Flexi Cap Fund", plan_type: "direct",
      periods: { "1Y": rank(4, 38), "3Y": rank(1, 10), "5Y": rank(10, 10) }, ranked_as: "HDFC Flexi Cap Growth Series", disclaimer_key: null },
    { ...old, scheme_id: "B", scheme_name: "Kotak Small Cap Fund", sebi_category: "Equity Scheme - Small Cap Fund", plan_type: "regular",
      periods: { "1Y": rank(38, 38), "3Y": rank(null, 8, "not_enough_history"), "5Y": rank(null, 4, "not_enough_history") }, ranked_as: null, disclaimer_key: null },
    { ...old, scheme_id: "C", scheme_name: "UTI Nifty 50 Index Fund", sebi_category: "Index Funds", plan_type: "direct",
      periods: { "1Y": rank(null, 0, "not_ranked_index_fund"), "3Y": rank(null, 0, "not_ranked_index_fund"), "5Y": rank(null, 0, "not_ranked_index_fund") },
      ranked_as: null, disclaimer_key: "index_fund_not_ranked" },
  ] };
}
function mount(payload: Record<string, unknown> = sample(), aggregate = true) {
  const response = aggregate ? fc.analyticsMfC() : fc.analyticsMfCMember();
  response.sections.ranking = { payload: aggregate ? { members: [], ranking: payload } : payload,
    computed_at: "2026-10-31T00:00:00Z", failed_at: null };
  mocks.getAnalyticsScope.mockResolvedValue(response);
  return renderInShell(<OtherAnalyticsPage />, { path: "/portfolio/mutual-funds/analytics",
    scope: { members, viewMode: aggregate ? "aggregate" : "member", memberId: aggregate ? null : "m1" } });
}
const ready = () => screen.findByRole("region", { name: "Rank in your fund's category" });
beforeEach(() => { analyticsStore.invalidate(); Object.values(mocks).forEach(mock => mock.mockReset()); });

describe("Performance Ranking", () => {
  it("rank_is_rendered_large_with_the_total_smaller_and_the_dot_position_follows_the_rank", async () => {
    mount(); await ready();
    expect(screen.getByTestId("rank-number-A-1Y")).toHaveTextContent("4");
    expect(screen.getByTestId("rank-number-A-1Y")).toHaveClass("text-2xl");
    expect(screen.getByTestId("rank-total-A-1Y")).toHaveTextContent("/38");
    expect(screen.getByTestId("rank-total-A-1Y")).toHaveClass("text-xs");
    expect(Number(screen.getByTestId("rank-dot-A-1Y").getAttribute("data-position"))).toBeCloseTo(3 / 37 * 100);
    expect(screen.getByTestId("rank-dot-A-3Y")).toHaveStyle({ left: "3%" });
    expect(screen.getByTestId("rank-dot-A-5Y")).toHaveStyle({ left: "97%" });
    expect(screen.getAllByTestId("performance-fund-logo")).toHaveLength(3);
    expect(within(screen.getByTestId("performance-row-A")).getByText("Direct")).toBeInTheDocument();
    expect(screen.getByText("Compared using HDFC Flexi Cap Growth Series.")).toBeInTheDocument();
  });
  it("heading_text_appears_once", async () => {
    mount(); await ready();
    expect(screen.getAllByRole("heading", { name: "Performance Ranking" })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { name: "Rank in your fund's category" })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Fund Leaderboard" })).not.toBeInTheDocument();
  });
  it("not_enough_history_state", async () => {
    mount(); await ready();
    const cell = screen.getByTestId("rank-cell-B-3Y");
    expect(cell).toHaveTextContent("—");
    expect(cell).toHaveTextContent("Not enough history for 3 years.");
    expect(within(cell).queryByTestId("rank-dot-B-3Y")).not.toBeInTheDocument();
  });
  it("index_fund_shows_the_disclaimer_and_no_rank", async () => {
    mount(); await ready();
    const row = screen.getByTestId("performance-row-C");
    expect(row).toHaveTextContent("Index funds are not ranked here. Their comparison with the index they track is shown in the benchmark comparison.");
    expect(within(row).queryByTestId("rank-dot-C-1Y")).not.toBeInTheDocument();
  });
  it.each([true, false])("old_composite_payload_renders_the_updating_state (aggregate=%s)", async aggregate => {
    const old = { funds: [{ scheme_id: "OLD", scheme_name: "Old Composite Fund", composite_score: "90", components: {}, neighbors: [] }] };
    const previous = { ...fo.fundRanking().funds[0] };
    delete previous.periods;
    mount({ funds: [{ ...previous, ...old.funds[0] }] }, aggregate);
    await ready();
    expect(screen.getByRole("status", { name: "Updating Performance Ranking" })).toHaveTextContent("Performance rankings are updating.");
    expect(screen.queryByText("Old Composite Fund")).not.toBeInTheDocument();
  });
  it("uses the exact banner and counts ranked fund-period comparisons only", async () => {
    mount(); const card = await ready();
    expect(card).toHaveTextContent("Your funds rank in the top quarter in 2 of 4 comparisons. A rank such as 4/38 means this fund is 4th best out of 38 funds in the same category. Lower is better. The dot shows where the fund sits, from best (left) to last (right); the green stretch is the top quarter.");
  });
  it("renders the exact new backend shape without composite fields", async () => {
    const data = sample();
    mount({ funds: data.funds.map(({ scheme_id, scheme_name, sebi_category, plan_type, periods, ranked_as, disclaimer_key }) => ({
      scheme_id, scheme_name, sebi_category, plan_type, periods, ranked_as, disclaimer_key,
    })) });
    await ready();
    expect(screen.getByTestId("rank-number-A-1Y")).toHaveTextContent("4");
  });
  it("handles one peer and empty results without a broken lane", async () => {
    const data = sample(); data.funds = data.funds.slice(0, 1);
    data.funds[0].periods = { "1Y": rank(1, 1), "3Y": rank(1, 1), "5Y": rank(1, 1) };
    const view = mount(data); await ready();
    expect(screen.getByTestId("rank-dot-A-1Y")).toHaveStyle({ left: "3%" });
    view.unmount(); analyticsStore.invalidate();
    mount({ funds: [] }); await ready();
    expect(screen.getByText("No funds to rank for this selection.")).toBeInTheDocument();
  });
});
