import { fireEvent, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/apiClient";
import { renderInShell } from "@/shell/testing";
import { ComparePage } from "./ComparePage";
import { IDS, fixture } from "./fixtures";
import type { OverlapCompareResponse, PerformanceResponse, SummaryResponse } from "./types";

// The kit charts cannot measure a width in jsdom, so they are stubs; everything else is the real page.
vi.mock("@/components/ui/charts", () => ({
  LineAreaChart: () => <div data-testid="line-chart" />,
  PieChart: ({ children }: { children?: ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  PieSlice: ({ index }: { index: number }) => <i data-testid={`pie-slice-${index}`} />,
}));
const api = vi.hoisted(() => ({ summary: vi.fn(), overlap: vi.fn(), overlapCompare: vi.fn(), performance: vi.fn() }));
vi.mock("./api", () => ({ fundPageApi: api }));

const PATH = `/portfolio/mutual-funds/overlap/compare/${IDS.scheme}/${IDS.peer1}`;
const NAME = "Alpha Flexi Cap Fund - Direct Plan";

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}
const mount = () => renderInShell(<><ComparePage fundA={IDS.scheme} fundB={IDS.peer1} /><Location /></>, { path: PATH });

beforeEach(() => {
  vi.clearAllMocks();
  api.summary.mockImplementation(() => Promise.resolve(fixture<SummaryResponse>("summary_family")));
  api.overlapCompare.mockImplementation(() => Promise.resolve(fixture<OverlapCompareResponse>("overlap_compare")));
  api.performance.mockImplementation(() => Promise.resolve(fixture<PerformanceResponse>("performance_1y_equity")));
});

describe("ComparePage (a pair from the portfolio overlap table)", () => {
  it("renders the comparison for two scheme ids inside the fund page frame of the first fund", async () => {
    mount();
    expect(await screen.findByRole("heading", { level: 1, name: NAME })).toBeInTheDocument();
    expect(await screen.findByRole("tablist", { name: "Comparison views" })).toBeInTheDocument();
    expect(api.overlapCompare).toHaveBeenCalledWith(IDS.scheme, IDS.peer1, expect.any(String), expect.any(AbortSignal));
  });

  it("Back says Back to Overlap and goes to the portfolio overlap page", async () => {
    mount();
    await screen.findByRole("tablist", { name: "Comparison views" });
    expect(screen.queryByRole("button", { name: `Back to ${NAME}'s overlap` })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to Overlap" }));
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/portfolio\/mutual-funds\/overlap$/);
  });

  it("a comparison that cannot load shows the existing error state with Retry", async () => {
    api.overlapCompare.mockRejectedValueOnce(new ApiError(404, { detail: "x" }));
    mount();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load comparison.");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await screen.findByRole("tablist", { name: "Comparison views" });
    expect(api.overlapCompare).toHaveBeenCalledTimes(2);
  });
});
