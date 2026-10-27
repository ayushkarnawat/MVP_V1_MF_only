import { createRef } from "react";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildRegistry } from "@/shell/registry/buildRegistry";
import { renderInShell } from "@/shell/testing";
import { ASHA_ID, DEV_ID, FIVE_BENCHMARKS, freezeResult, makeSummary, memberDevResult, multiPhaseResult, noHoldingsResult, pre2006Result, standardResult } from "../testData";
import type { ScenarioResult } from "../types";
import { ScenarioDetail } from "./ScenarioDetail";
import type { ScenarioDetailProps } from "./ScenarioDetail";

const MEMBERS = [{ id: ASHA_ID, name: "ASHA RAO" }, { id: DEV_ID, name: "Dev Rao" }];
const LIVE_FUND_ROUTE = buildRegistry().map(route => route.id === "portfolio-mutual-funds-fund" ? { ...route, status: "live" as const } : route);

function show(result: ScenarioResult, over: Partial<ScenarioDetailProps> = {}) {
  const props: ScenarioDetailProps = {
    result, members: MEMBERS, selectedMemberId: "family", onMemberChange: vi.fn(), refreshing: false,
    onImport: vi.fn(), onLearnMore: vi.fn(), ...over,
  };
  const view = renderInShell(<ScenarioDetail {...props} />, { routes: LIVE_FUND_ROUTE });
  return { props, ...view };
}
const withScenario = (result: ScenarioResult, over: Partial<ScenarioResult["scenario"]>): ScenarioResult => ({ ...result, scenario: { ...result.scenario, ...over } });
const tileKeys = () => screen.queryAllByTestId(/^tile-[a-z]+$/).map(tile => tile.getAttribute("data-testid"));

describe("ScenarioDetail: heading row and disclaimer", () => {
  it("shows the name as a focusable h2, the dates and the description", () => {
    show(standardResult());
    const heading = screen.getByRole("heading", { level: 2, name: "Fixture scenario A" });
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(screen.getByTestId("detail-dates")).toHaveTextContent("3 November 2025 – 31 December 2025");
    expect(screen.getByTestId("detail-description")).toHaveTextContent("Fixture description for scenario a.");
  });

  it("hands the heading element to a ref so the flow can focus and scroll to it", () => {
    const headingRef = createRef<HTMLHeadingElement>();
    show(standardResult(), { headingRef });
    expect(headingRef.current).toBe(screen.getByRole("heading", { level: 2 }));
  });

  it("omits the description line when the description is empty", () => {
    show(withScenario(standardResult(), { description: "" }));
    expect(screen.queryByTestId("detail-description")).toBeNull();
  });

  it("wraps a 200-character name instead of overflowing", () => {
    show(withScenario(standardResult(), { name: "N".repeat(200) }));
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("N".repeat(200));
    expect(heading).toHaveClass("break-words");
  });

  it("states the compliance line right under the heading in italic secondary text", () => {
    show(standardResult());
    const note = screen.getByTestId("detail-disclaimer");
    expect(note).toHaveTextContent("Here's what this portfolio would have captured during this period, based on actual historical fund performance — not a prediction of future returns.");
    expect(note).not.toHaveTextContent("Numbers will update");
    expect(note).toHaveClass("italic", "text-[var(--ui-text-muted)]");
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("adds the update sentence for an ongoing event", () => {
    show(withScenario(standardResult(), { is_ongoing: true, end_date: null }));
    expect(screen.getByTestId("detail-disclaimer")).toHaveTextContent("not a prediction of future returns. Numbers will update as the event continues.");
    expect(screen.getByTestId("detail-dates")).toHaveTextContent("3 November 2025 – ongoing");
  });
});

describe("ScenarioDetail: member dropdown", () => {
  it("offers Family combined and each member by name and reports a change", () => {
    const { props } = show(standardResult());
    const select = screen.getByLabelText("Member");
    expect(within(select).getAllByRole("option").map(option => option.textContent)).toEqual(["Family combined", "Asha Rao", "Dev Rao"]);
    expect(select).toHaveValue("family");
    fireEvent.change(select, { target: { value: DEV_ID } });
    expect(props.onMemberChange).toHaveBeenCalledWith(DEV_ID);
  });

  it("shows the chosen member", () => {
    show(memberDevResult(), { selectedMemberId: DEV_ID });
    expect(screen.getByLabelText("Member")).toHaveValue(DEV_ID);
  });

  it("still renders the dropdown for a household with one member", () => {
    show(standardResult(), { members: [{ id: ASHA_ID, name: "ASHA RAO" }] });
    expect(within(screen.getByLabelText("Member")).getAllByRole("option")).toHaveLength(2);
  });
});

describe("ScenarioDetail: standard result", () => {
  it("shows the four tiles in order with the figures from the result", () => {
    show(standardResult());
    expect(tileKeys()).toEqual(["tile-return", "tile-rupees", "tile-benchmark", "tile-coverage"]);
    expect(screen.getByTestId("tile-return-value")).toHaveTextContent("−12.6%");
    expect(screen.getByTestId("tile-rupees-value")).toHaveTextContent("−₹656");
    expect(screen.getByTestId("tile-benchmark-value")).toHaveTextContent("+0.4%");
    expect(screen.getByTestId("tile-benchmark-line")).toHaveTextContent("Behind by 13.0 percentage points");
    expect(screen.getByTestId("tile-coverage-value")).toHaveTextContent("Based on ₹5,212");
  });

  it("shows both charts and the Mira card, in that order, in a three-column row from 1280 px", () => {
    show({ ...standardResult(), benchmarks: FIVE_BENCHMARKS });
    const charts = screen.getByTestId("charts");
    expect(charts).toHaveClass("grid-cols-1", "lg:grid-cols-2", "min-[1280px]:grid-cols-[5fr_6fr_4fr]");
    expect(within(charts).getAllByRole("heading", { level: 3 }).map(heading => heading.textContent)).toEqual(["Benchmark comparison", "Impact by asset class", "Insights from Mira"]);
    expect(screen.getByTestId("bar-portfolio")).toBeInTheDocument();
    expect(screen.getByTestId("bar-nifty_50")).toBeInTheDocument();
    expect(screen.getByTestId("bar-equity")).toBeInTheDocument();
  });

  it("shows the family member rows under the charts", () => {
    show(standardResult());
    const rows = screen.getByRole("heading", { level: 3, name: "By family member" });
    expect(screen.getByTestId("charts").compareDocumentPosition(rows) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId(`member-total-${ASHA_ID}`)).toBeInTheDocument();
  });

  it("opens the Mira dialog through onLearnMore", () => {
    const { props } = show(standardResult());
    fireEvent.click(screen.getByRole("button", { name: "Learn more" }));
    expect(props.onLearnMore).toHaveBeenCalledTimes(1);
  });

  it("leaves a chart out instead of drawing it empty when its data is missing", () => {
    show({ ...standardResult(), benchmarks: [], by_asset_class: [] });
    expect(screen.queryByRole("heading", { name: "Benchmark comparison" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Impact by asset class" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Insights from Mira" })).toBeInTheDocument();
  });

  it("shows a single member's own funds when that member's result is shown", () => {
    show(memberDevResult(), { selectedMemberId: DEV_ID });
    expect(screen.getByRole("heading", { level: 3, name: "Funds for Dev Rao" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "By family member" })).toBeNull();
  });
});

describe("ScenarioDetail: refreshing", () => {
  it("dims the tiles and charts while keeping their content", () => {
    show(standardResult(), { refreshing: true });
    const numbers = screen.getByTestId("detail-numbers");
    expect(numbers).toHaveClass("opacity-60");
    expect(numbers).toHaveAttribute("aria-busy", "true");
    expect(within(numbers).getByTestId("tile-return-value")).toHaveTextContent("−12.6%");
    expect(within(numbers).getByRole("heading", { name: "Impact by asset class" })).toBeInTheDocument();
  });

  it("is not dimmed when nothing is loading", () => {
    show(standardResult());
    const numbers = screen.getByTestId("detail-numbers");
    expect(numbers).not.toHaveClass("opacity-60");
    expect(numbers).toHaveAttribute("aria-busy", "false");
  });

  it("keeps the member rows of the numbers on screen while another member loads", () => {
    show(standardResult(), { refreshing: true, selectedMemberId: DEV_ID, resultMemberId: "family" });
    expect(screen.getByLabelText("Member")).toHaveValue(DEV_ID);
    expect(screen.getByRole("heading", { level: 3, name: "By family member" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Funds for/ })).toBeNull();
  });
});

describe("ScenarioDetail: multi-phase result", () => {
  const result = () => multiPhaseResult();

  it("has no benchmark tile and no benchmark chart, and calls the return cumulative", () => {
    show(result());
    expect(tileKeys()).toEqual(["tile-return", "tile-rupees", "tile-coverage"]);
    expect(screen.getByTestId("tile-return-line")).toHaveTextContent("Cumulative over all phases");
    expect(screen.queryByRole("heading", { name: "Benchmark comparison" })).toBeNull();
  });

  it("lists the phases in order with label, dates and a coloured percent", () => {
    const shuffled = result();
    shuffled.phases = [shuffled.phases[1], shuffled.phases[0]];
    show(shuffled);
    const list = screen.getByRole("list", { name: "Phases" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map(item => item.getAttribute("data-testid"))).toEqual(["phase-1", "phase-2"]);
    expect(items[0]).toHaveTextContent("Fall");
    expect(items[0]).toHaveTextContent("3 November 2025 – 28 November 2025");
    expect(screen.getByTestId("phase-pct-1")).toHaveTextContent("−4.3%");
    expect(screen.getByTestId("phase-pct-1")).toHaveClass("text-[var(--neg-text)]");
    expect(screen.getByTestId("phase-pct-2")).toHaveTextContent("−0.7%");
  });

  it("says there is not enough data for a phase without a figure, never NaN or null", () => {
    const missing = result();
    missing.phases[0].pct = null;
    show(missing);
    expect(screen.getByTestId("phase-pct-1")).toHaveTextContent("Not enough historical data to estimate");
    expect(screen.getByTestId("scenario-detail").textContent).not.toMatch(/NaN|null|undefined/);
  });

  it("marks an ongoing phase with a dot and 'ongoing' in its dates", () => {
    const open = result();
    open.phases[1].is_ongoing = true;
    open.phases[1].end_date = null;
    show(open);
    expect(screen.getByTestId("phase-ongoing-2")).toBeInTheDocument();
    expect(screen.getByTestId("phase-2")).toHaveTextContent("1 December 2025 – ongoing");
    expect(screen.queryByTestId("phase-ongoing-1")).toBeNull();
  });

  it("shows the asset-class chart, the Mira card and the member rows", () => {
    show(result());
    expect(screen.getByRole("heading", { name: "Impact by asset class" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Insights from Mira" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "By family member" })).toBeInTheDocument();
  });
});

describe("ScenarioDetail: redemption-freeze result", () => {
  it("shows the freeze banner, no tiles and no charts, then the member rows", () => {
    show(freezeResult());
    const banner = screen.getByTestId("freeze-banner");
    expect(banner).toHaveTextContent("This wasn't a price fall — a ~20-month liquidity freeze");
    expect(banner).toHaveTextContent("Frozen, not %");
    expect(banner).toHaveClass("border-[var(--warn)]", "bg-[var(--warn-bg)]", "text-[var(--warn-text)]");
    expect(tileKeys()).toEqual([]);
    expect(screen.queryByRole("heading", { name: "Benchmark comparison" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Insights from Mira" })).toBeNull();
    expect(screen.getByRole("heading", { name: "By family member" })).toBeInTheDocument();
    expect(screen.getByTestId(`member-total-${DEV_ID}`)).toBeInTheDocument();
  });

  it("says none of the funds were frozen when no member fund is frozen", () => {
    const result = freezeResult();
    for (const member of result.by_member) for (const fund of member.funds) fund.is_frozen = false;
    show(result);
    expect(screen.queryByTestId("freeze-banner")).toBeNull();
    expect(screen.getByTestId("none-frozen")).toHaveTextContent("None of your funds were frozen in this event");
    expect(screen.getByRole("heading", { name: "By family member" })).toBeInTheDocument();
  });
});

describe("ScenarioDetail: event before 2006", () => {
  it("shows only the Nifty 50 tile, the note, the index bars without a portfolio bar, and Mira", () => {
    show(pre2006Result());
    expect(tileKeys()).toEqual(["tile-benchmark"]);
    expect(screen.getByTestId("tile-benchmark-value")).toHaveTextContent("+12.5%");
    expect(screen.getByTestId("pre-2006-note")).toHaveTextContent("Fund prices were not reported before 2006, so only the index is shown for this event.");
    expect(screen.getByTestId("bar-nifty_50")).toBeInTheDocument();
    expect(screen.queryByTestId("bar-portfolio")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Impact by asset class" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Insights from Mira" })).toBeInTheDocument();
  });

  it("shows no member rows but keeps the dropdown", () => {
    show(pre2006Result());
    expect(screen.queryByRole("heading", { name: /By family member|Funds for/ })).toBeNull();
    expect(screen.getByLabelText("Member")).toBeInTheDocument();
  });

  it("still explains itself when the response carries no index (no tile, no chart, no crash)", () => {
    show({ ...pre2006Result(), benchmarks: [] });
    expect(tileKeys()).toEqual([]);
    expect(screen.getByTestId("pre-2006-note")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Benchmark comparison" })).toBeNull();
  });
});

describe("ScenarioDetail: household with no holdings", () => {
  it("explains, offers the import button and shows no tiles, charts, member rows or dropdown", () => {
    const { props } = show(noHoldingsResult());
    const note = screen.getByTestId("no-holdings");
    expect(within(note).getByText("You have no funds to replay yet.").tagName).toBe("B");
    expect(note).toHaveTextContent("Import a statement to see how your funds would have done.");
    fireEvent.click(within(note).getByRole("button", { name: "Import a statement" }));
    expect(props.onImport).toHaveBeenCalledTimes(1);
    expect(tileKeys()).toEqual([]);
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
    expect(screen.queryByLabelText("Member")).toBeNull();
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
    expect(screen.getByTestId("detail-disclaimer")).toBeInTheDocument();
  });

  it("treats a missing total value the same way", () => {
    show({ ...noHoldingsResult(), total_value: null });
    expect(screen.getByTestId("no-holdings")).toBeInTheDocument();
  });

  it("is not a no-holdings result when the funds exist, even if a total is zero", () => {
    show({ ...standardResult(), total_value: "0.00" });
    expect(screen.queryByTestId("no-holdings")).toBeNull();
    expect(screen.getByTestId("tile-return")).toBeInTheDocument();
  });
});

describe("ScenarioDetail: other cases", () => {
  it("renders nothing for a hypothetical scenario (the list never offers one while the flag is off)", () => {
    const { container } = show(withScenario(standardResult(), { scenario_type: "HYPOTHETICAL" }));
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["standard", () => standardResult()],
    ["multi-phase", () => multiPhaseResult()],
    ["freeze", () => freezeResult()],
    ["pre-2006", () => pre2006Result()],
    ["no holdings", () => noHoldingsResult()],
    ["empty percentages", () => ({ ...standardResult(), portfolio_impact_pct: null, rupee_impact: null, covered_value: null, by_asset_class: [], benchmarks: [] })],
  ])("never prints NaN, null or undefined (%s)", (_label, build) => {
    show(build());
    expect(screen.getByTestId("scenario-detail").textContent).not.toMatch(/NaN|null|undefined/);
  });

  it("works for any scenario summary built by hand", () => {
    const result = { ...standardResult(), scenario: makeSummary({ scenario_id: "x", name: "Hand made" }) };
    show(result);
    expect(screen.getByRole("heading", { level: 2, name: "Hand made" })).toBeInTheDocument();
  });
});
