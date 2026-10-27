import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { paths } from "@/shell/nav/paths";
import { renderInShell } from "@/shell/testing";
import { liveFundRoutes } from "../__support__/liveRoutes";
import { deferred } from "../__support__/deferred";
import { formatRiskValue } from "../fundFormat";
import { IDS, fixture } from "../fixtures";
import type { RiskResponse, ScatterResponse, Unavailable } from "../types";
import { RiskReturnScatter } from "./RiskReturnScatter";

// jsdom cannot measure a width, so the kit scatter is a stub that records the props the card hands to it.
interface ScatterStubProps {
  points: { id: string; name: string; x: number; y: number; highlight?: boolean }[];
  xLabel: string;
  yLabel: string;
  ariaLabel: string;
  onPointClick?: (id: string) => void;
  height?: number;
}
const chart = vi.hoisted(() => ({ props: null as null | ScatterStubProps }));
vi.mock("@/components/ui/charts", () => ({
  ScatterChart: (props: ScatterStubProps) => {
    chart.props = props;
    return <div data-testid="scatter-chart" />;
  },
}));
const api = vi.hoisted(() => ({ scatter: vi.fn() }));
vi.mock("../api", () => ({ fundPageApi: api }));

const BETA = "8d1f0000-0000-4000-8000-000000000001";
const GAMMA = "8d1f0000-0000-4000-8000-000000000002";
const scatter = () => fixture<ScatterResponse>("scatter");

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}
function mount() {
  return renderInShell(
    <>
      <Routes>
        <Route path="/portfolio/mutual-funds/funds/:schemeId/insights" element={<RiskReturnScatter schemeId={IDS.scheme} />} />
        <Route path="/portfolio/mutual-funds/funds/:schemeId" element={<p>fund page</p>} />
      </Routes>
      <Location />
    </>,
    { path: paths.mutualFunds.fundInsights(IDS.scheme), routes: liveFundRoutes() },
  );
}
const click = (id: string) => act(() => { chart.props!.onPointClick!(id); });
const popup = (name: string) => screen.getByRole("dialog", { name });
const rows = (dialog: HTMLElement) => within(dialog).getAllByTestId("dot-popup-row").map(row => [within(row).getByRole("term").textContent, within(row).getByRole("definition").textContent]);

beforeEach(() => {
  vi.clearAllMocks();
  chart.props = null;
  api.scatter.mockImplementation(() => Promise.resolve(scatter()));
});

describe("RiskReturnScatter", () => {
  it("asks for the scatter once with no scope, shows a loading status, and has the heading Risk-Return (3 Years)", async () => {
    const pending = deferred<ScatterResponse>();
    api.scatter.mockReturnValue(pending.promise);
    mount();
    expect(screen.getByRole("heading", { name: "Risk-Return (3 Years)" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading risk and return" })).toBeInTheDocument();
    await act(async () => { pending.resolve(scatter()); });
    expect(await screen.findByTestId("scatter-chart")).toBeInTheDocument();
    expect(api.scatter).toHaveBeenCalledTimes(1);
    expect(api.scatter).toHaveBeenCalledWith(IDS.scheme, expect.any(AbortSignal));
  });

  it("plots volatility across and return up, one dot per fund, with only this fund highlighted", async () => {
    mount();
    await screen.findByTestId("scatter-chart");
    const props = chart.props!;
    expect(props.points.map(p => [p.id, p.x, p.y, Boolean(p.highlight)])).toEqual([
      [IDS.scheme, 14.2, 19, true], [BETA, 13.5, 16, false], [GAMMA, 12.8, 14.2, false],
      ["8d1f0000-0000-4000-8000-000000000003", 15.6, 17.5, false], ["8d1f0000-0000-4000-8000-000000000004", 11.9, 12.1, false],
    ]);
    expect(props.points[0].name).toBe("Alpha Flexi Cap Fund - Direct Plan");
    expect(props.xLabel).toBe("Volatility (% a year)");
    expect(props.yLabel).toBe("3-year return (% a year)");
    expect(props.ariaLabel).toBe("Risk and return of funds in the category");
  });

  it("test_fund_dot_highlighted_and_matches_overview_volatility_value: this fund's popup prints the volatility exactly as the Risk Metrics card does, and has no link", async () => {
    mount();
    await screen.findByTestId("scatter-chart");
    expect(chart.props!.points.filter(p => p.highlight).map(p => p.id)).toEqual([IDS.scheme]);
    click(IDS.scheme);
    const dialog = popup("Alpha Flexi Cap Fund - Direct Plan (this fund)");
    const overviewVolatility = formatRiskValue("volatility", fixture<RiskResponse>("risk_equity").volatility.value);
    expect(overviewVolatility).toBe("14.2%");
    expect(rows(dialog)).toEqual([["3-year return", "19.0%"], ["Volatility", overviewVolatility], ["You hold it", "Yes"]]);
    expect(within(dialog).queryByRole("link")).toBeNull();
  });

  it("test_peer_dot_opens_card_and_held_peer_navigates: a held peer's card says Yes and links to its fund page, and the link goes there", async () => {
    mount();
    await screen.findByTestId("scatter-chart");
    click(BETA);
    const dialog = popup("Beta Flexi Cap Fund - Direct Plan");
    expect(rows(dialog)).toEqual([["3-year return", "16.0%"], ["Volatility", "13.5%"], ["You hold it", "Yes"]]);
    const link = within(dialog).getByRole("link", { name: "View fund page" });
    expect(link).toHaveAttribute("href", paths.mutualFunds.fund(BETA));
    fireEvent.click(link);
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(`/portfolio/mutual-funds/funds/${BETA}`));
    expect(screen.queryByTestId("scatter-chart")).toBeNull();
  });

  it("a peer the household does not hold says No and has no link", async () => {
    mount();
    await screen.findByTestId("scatter-chart");
    click(GAMMA);
    const dialog = popup("Gamma Flexi Cap Fund - Direct Plan");
    expect(rows(dialog)).toEqual([["3-year return", "14.2%"], ["Volatility", "12.8%"], ["You hold it", "No"]]);
    expect(within(dialog).queryByRole("link")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close modal" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a dot with no held flag (an older backend) has no You hold it row and no link", async () => {
    const body = scatter();
    for (const point of body.points) delete point.held;
    api.scatter.mockImplementation(() => Promise.resolve(body));
    mount();
    await screen.findByTestId("scatter-chart");
    click(BETA);
    const dialog = popup("Beta Flexi Cap Fund - Direct Plan");
    expect(rows(dialog)).toEqual([["3-year return", "16.0%"], ["Volatility", "13.5%"]]);
    expect(within(dialog).queryByRole("link")).toBeNull();
  });

  it("a click on an unknown dot does nothing", async () => {
    mount();
    await screen.findByTestId("scatter-chart");
    click("not-a-fund");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the category median volatility and the caption with the window and the number of funds", async () => {
    mount();
    await screen.findByTestId("scatter-chart");
    expect(screen.getByTestId("scatter-median")).toHaveTextContent("Category median volatility: 14.0%.");
    expect(screen.getByTestId("scatter-caption")).toHaveTextContent("Returns and volatility from 23 Oct 2023 to 23 Oct 2026. 5 funds compared, including this one.");
    expect(screen.queryByTestId("scatter-thin-note")).toBeNull();
  });

  it("test_thin_category_note: a thin category adds the rough-guide note and no median", async () => {
    api.scatter.mockImplementation(() => Promise.resolve(fixture<ScatterResponse>("scatter_thin")));
    mount();
    await screen.findByTestId("scatter-chart");
    expect(screen.getByTestId("scatter-thin-note")).toHaveTextContent("Few funds in this category, so this comparison is a rough guide.");
    expect(screen.queryByTestId("scatter-median")).toBeNull();
    expect(screen.getByTestId("scatter-caption")).toHaveTextContent("3 funds compared, including this one.");
    expect(chart.props!.points).toHaveLength(3);
  });

  it("test_unavailable_peers_state: peers_unavailable prints the shared wording and no chart", async () => {
    api.scatter.mockImplementation(() => Promise.resolve(fixture<Unavailable>("peers_unavailable")));
    mount();
    expect(await screen.findByTestId("section-unavailable")).toHaveTextContent("Category comparison is not available for this fund yet.");
    expect(screen.queryByTestId("scatter-chart")).toBeNull();
    expect(screen.getByRole("heading", { name: "Risk-Return (3 Years)" })).toBeInTheDocument();
  });

  it("a failed request shows the error with Retry, and Retry asks again", async () => {
    api.scatter.mockRejectedValueOnce(new Error("down")).mockImplementation(() => Promise.resolve(scatter()));
    mount();
    expect(await screen.findByText("Couldn't load risk and return.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("scatter-chart")).toBeInTheDocument();
    expect(api.scatter).toHaveBeenCalledTimes(2);
  });

  it("is a card with 20 px padding", async () => {
    mount();
    await screen.findByTestId("scatter-chart");
    expect(screen.getByRole("heading", { name: "Risk-Return (3 Years)" }).closest("section")!.className).toContain("p-5");
  });
});
