import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { paths } from "@/shell/nav/paths";
import { renderInShell } from "@/shell/testing";
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

// The golden's peers: "Golden Peer 1 Fund" (IDS.peer1: return 7.5, volatility 0.0062) and "Golden Peer 2 Fund" (8.5001, 0.0056).
const BETA = IDS.peer1;
const GAMMA = "fbee647c-6841-5f4b-a95a-84b5ec599076";
const scatter = () => fixture<ScatterResponse>("scatter");
// The backend does not send the additive `held` flag yet (a backend ask, register C124), so the tests that need it set it by hand:
// the fund's own dot and Golden Peer 1 are held, every other peer is not.
function withHeld(body: ScatterResponse = scatter()): ScatterResponse {
  for (const point of body.points) point.held = point.is_fund || point.scheme_id === BETA;
  return body;
}

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
    { path: paths.mutualFunds.fundInsights(IDS.scheme) },
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
    // x is the volatility, y the return: the golden's seven dots, the fund first.
    expect(props.points.map(p => [p.id, p.x, p.y, Boolean(p.highlight)])).toEqual([
      [IDS.scheme, 0.005, 9.9999, true], [BETA, 0.0062, 7.5, false], [GAMMA, 0.0056, 8.5001, false],
      ["dc9e123e-d172-5ff3-a285-a2a8722e2ce5", 0.0054, 9.5, false], ["c3375419-68ea-5868-8df7-b3b52d19ffa9", 0.005, 10.5, false],
      ["5c2696ef-e123-52b2-9ff6-90062a0fd775", 0.0048, 11.5001, false], ["d946c7ce-f238-5571-be64-daf03ad1cdc1", 0.0046, 12.5, false],
    ]);
    expect(props.points[0].name).toBe("Alpha Flexi Cap Fund - Direct Plan");
    expect(props.xLabel).toBe("Volatility (% a year)");
    expect(props.yLabel).toBe("3-year return (% a year)");
    expect(props.ariaLabel).toBe("Risk and return of funds in the category");
  });

  it("test_fund_dot_highlighted_and_matches_overview_volatility_value: this fund's popup prints the volatility exactly as the Risk Metrics card does, and has no link", async () => {
    api.scatter.mockImplementation(() => Promise.resolve(withHeld()));
    mount();
    await screen.findByTestId("scatter-chart");
    expect(chart.props!.points.filter(p => p.highlight).map(p => p.id)).toEqual([IDS.scheme]);
    click(IDS.scheme);
    const dialog = popup("Alpha Flexi Cap Fund - Direct Plan (this fund)");
    const overviewVolatility = formatRiskValue("volatility", fixture<RiskResponse>("risk_equity").volatility.value);
    // The scatter's volatility for the fund (0.0050) is the same figure as risk_equity's, so both cards print "0.0%".
    expect(overviewVolatility).toBe("0.0%");
    expect(fixture<RiskResponse>("risk_equity").volatility.value).toBe(scatter().points[0].volatility_pct);
    expect(rows(dialog)).toEqual([["3-year return", "10.0%"], ["Volatility", overviewVolatility], ["You hold it", "Yes"]]);
    expect(within(dialog).queryByRole("link")).toBeNull();
  });

  it("test_peer_dot_opens_card_and_held_peer_navigates: a held peer's card says Yes and links to its fund page, and the link goes there", async () => {
    api.scatter.mockImplementation(() => Promise.resolve(withHeld()));
    mount();
    await screen.findByTestId("scatter-chart");
    click(BETA);
    const dialog = popup("Golden Peer 1 Fund");
    expect(rows(dialog)).toEqual([["3-year return", "7.5%"], ["Volatility", "0.0%"], ["You hold it", "Yes"]]);
    const link = within(dialog).getByRole("link", { name: "View fund page" });
    expect(link).toHaveAttribute("href", paths.mutualFunds.fund(BETA));
    fireEvent.click(link);
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(`/portfolio/mutual-funds/funds/${BETA}`));
    expect(screen.queryByTestId("scatter-chart")).toBeNull();
  });

  it("a peer the household does not hold says No and has no link", async () => {
    api.scatter.mockImplementation(() => Promise.resolve(withHeld()));
    mount();
    await screen.findByTestId("scatter-chart");
    click(GAMMA);
    const dialog = popup("Golden Peer 2 Fund");
    expect(rows(dialog)).toEqual([["3-year return", "8.5%"], ["Volatility", "0.0%"], ["You hold it", "No"]]);
    expect(within(dialog).queryByRole("link")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close modal" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a dot with no held flag (what the backend sends today: the golden has none) has no You hold it row and no link", async () => {
    mount();
    await screen.findByTestId("scatter-chart");
    expect(scatter().points.every(point => !("held" in point))).toBe(true);
    click(BETA);
    const dialog = popup("Golden Peer 1 Fund");
    expect(rows(dialog)).toEqual([["3-year return", "7.5%"], ["Volatility", "0.0%"]]);
    expect(within(dialog).queryByRole("link")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close modal" }));
    click(IDS.scheme);
    expect(rows(popup("Alpha Flexi Cap Fund - Direct Plan (this fund)"))).toEqual([["3-year return", "10.0%"], ["Volatility", "0.0%"]]);
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
    expect(screen.getByTestId("scatter-median")).toHaveTextContent("Category median volatility: 0.0%.");
    expect(screen.getByTestId("scatter-caption")).toHaveTextContent("Returns and volatility from 23 Oct 2023 to 23 Oct 2026. 7 funds compared, including this one.");
    expect(screen.queryByTestId("scatter-thin-note")).toBeNull();
  });

  it("test_thin_category_note: a thin category adds the rough-guide note and still shows the median the backend sends", async () => {
    api.scatter.mockImplementation(() => Promise.resolve(fixture<ScatterResponse>("scatter_thin")));
    mount();
    await screen.findByTestId("scatter-chart");
    expect(screen.getByTestId("scatter-thin-note")).toHaveTextContent("Few funds in this category, so this comparison is a rough guide.");
    // The real thin golden carries a median ("0.0048"), unlike the spec fixture, which had none: the card shows whatever median it is given.
    expect(screen.getByTestId("scatter-median")).toHaveTextContent("Category median volatility: 0.0%.");
    expect(screen.getByTestId("scatter-caption")).toHaveTextContent("2 funds compared, including this one.");
    expect(chart.props!.points).toHaveLength(2);
  });

  it("no median figure from the backend means no median line (hand-made)", async () => {
    const body = fixture<ScatterResponse>("scatter_thin");
    body.peer_volatility_median = null;
    api.scatter.mockImplementation(() => Promise.resolve(body));
    mount();
    await screen.findByTestId("scatter-chart");
    expect(screen.queryByTestId("scatter-median")).toBeNull();
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
