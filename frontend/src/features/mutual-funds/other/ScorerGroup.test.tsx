import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fc from "../fixtures/mfC";
import * as fo from "../fixtures/mfCother";
import { renderInShell } from "../../../shell/testing";
import { expectInteractivity } from "../testing";
import type { PortfolioScoreSummary } from "../types";

const mocks = vi.hoisted(() => ({ getAnalyticsScope: vi.fn(), retryAnalyticsScope: vi.fn() }));
vi.mock("../../auth/session", () => ({ getToken: () => "t1" }));
vi.mock("../api", () => mocks);

import { analyticsStore } from "../data/analyticsStore";
import { ScorerBody, ScorerGroup } from "./ScorerGroup";

const mount = (data: PortfolioScoreSummary = fo.scoreSummary()) => render(<ScorerBody data={data} />);
const card = (id: string) => screen.getByTestId(`score-card-${id}`);
const title = () => screen.getByTestId("score-detail-title").textContent;

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  analyticsStore.invalidate();
  mocks.retryAnalyticsScope.mockResolvedValue({ dispatched: true });
});

describe("the portfolio hero", () => {
  it("shows the AUM-weighted score out of 100 with its verdict, the explanation and the value it covers", () => {
    mount();
    expect(screen.getByText(/Portfolio Weighted Score/)).toBeInTheDocument();
    expect(screen.getByText("AUM Weighted")).toBeInTheDocument();
    expect(screen.getByTestId("score-weighted").textContent).toBe("73.6");
    expect(screen.getByTestId("score-hero")).toHaveTextContent("/100");
    expect(screen.getByTestId("score-verdict")).toHaveTextContent("High Quality Portfolio");
    expect(screen.getByTestId("score-verdict")).toHaveAttribute("data-tone", "high");
    expect(screen.getByText("Blends every scored fund's score by its ₹ value in your portfolio — a big winning fund moves this more than a small one.")).toBeInTheDocument();
    expect(screen.getByTestId("score-coverage")).toHaveTextContent("Scored value coverage: ₹38,30,000 of ₹46,49,340");
  });
  it.each([["69.9", "Moderate Quality Portfolio", "mid"], ["70.0", "High Quality Portfolio", "high"], ["50.0", "Moderate Quality Portfolio", "mid"], ["49.9", "Needs Review", "low"]])(
    "labels a weighted score of %s as %s", (weighted, label, tone) => {
      mount({ ...fo.scoreSummary(), weighted_score: weighted });
      expect(screen.getByTestId("score-verdict")).toHaveTextContent(label);
      expect(screen.getByTestId("score-verdict")).toHaveAttribute("data-tone", tone);
    });
  it("says the score is unavailable when there is no weighted score", () => {
    mount({ ...fo.scoreSummary(), weighted_score: null });
    expect(screen.getByTestId("score-unavailable")).toHaveTextContent("Score unavailable — not enough history");
    expect(screen.queryByTestId("score-weighted")).not.toBeInTheDocument();
    expect(screen.queryByTestId("score-verdict")).not.toBeInTheDocument();
  });
  it("opens and closes the 'How is this calculated?' explainer", () => {
    mount();
    const button = screen.getByRole("button", { name: "How is this calculated?" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("explainer-body")).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "How the Unifolio Fund Score works" })).toHaveTextContent("Return (45%)");
    expect(screen.getByRole("region", { name: "How the Unifolio Fund Score works" })).toHaveTextContent("Portfolio label: 70 or more is High Quality Portfolio, 50 to 69 is Moderate Quality Portfolio, and below 50 is Needs Review.");
    fireEvent.click(button);
    expect(screen.queryByTestId("explainer-body")).not.toBeInTheDocument();
  });
});

describe("the unscored funds", () => {
  it("calls out the funds that could not be scored, by name", () => {
    mount();
    const callout = screen.getByTestId("unscored-callout");
    expect(callout).toHaveAttribute("role", "note");
    expect(callout).toHaveTextContent("Unscored funds (1)");
    expect(callout).toHaveTextContent("SBI Bluechip Fund couldn't be scored — this fund doesn't have enough category or historical NAV data to evaluate downside risk and 12-month rolling consistency.");
  });
  it("shows no callout when every fund is scored", () => {
    mount({ ...fo.scoreSummary(), uncovered_schemes: [] });
    expect(screen.queryByTestId("unscored-callout")).not.toBeInTheDocument();
  });
  it("shows an unscored fund as a muted card with a tooltip and no button, with its reason as a badge", () => {
    mount();
    const sbi = card("S-SBI");
    expect(sbi.tagName).not.toBe("BUTTON");
    expect(sbi).toHaveAttribute("data-unscored", "true");
    expect(sbi).toHaveTextContent("Unscored");
    expect(sbi).toHaveTextContent("Insufficient History");
    expect(sbi).toHaveAttribute("title", "This fund does not have enough historical NAV data to evaluate downside risk and 12-month rolling consistency.");
    expect(sbi).toHaveAttribute("data-tooltip");
  });
  it("names a missing category as the reason", () => {
    const data = fo.scoreSummary();
    data.funds[3] = { ...data.funds[3], category_unavailable: true, insufficient_history: false };
    mount(data);
    expect(card("S-SBI")).toHaveTextContent("Category Unavailable");
    expect(card("S-SBI")).toHaveAttribute("title", "SEBI category data is not available for this fund.");
  });
  it("shows a message and no detail panel when there are no funds, and no detail when none is scored", () => {
    const { unmount } = mount({ ...fo.scoreSummary(), funds: [], uncovered_schemes: [] });
    expect(screen.getByText("No fund score data available")).toBeInTheDocument();
    unmount();
    const data = fo.scoreSummary();
    data.funds = data.funds.filter(fund => fund.scheme_id === "S-SBI");
    mount(data);
    expect(screen.queryByTestId("score-detail")).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^score-card-/)).toHaveLength(1);
  });
});

describe("the score cards", () => {
  it("shows each scored fund's score and display tier, with Tier 1 the best", () => {
    mount();
    expect(screen.getAllByTestId(/^score-card-/)).toHaveLength(4);
    expect(screen.getByTestId("score-value-S-KOTAK").textContent).toBe("84.2");
    expect(screen.getByTestId("score-tier-S-KOTAK")).toHaveTextContent("Tier 1");
    expect(screen.getByTestId("score-tier-S-JM")).toHaveTextContent("Tier 2");
    expect(screen.getByTestId("score-tier-S-HDFC")).toHaveTextContent("Tier 3");
    expect(screen.getByTestId("score-value-S-HDFC").textContent).toBe("62.9");
    expect(screen.getByTestId("score-tier-S-HDFC")).toHaveAttribute("data-tone", "mid");
  });
  it("starts with the first scored fund selected and its detail open", () => {
    mount();
    expect(card("S-KOTAK")).toHaveAttribute("aria-pressed", "true");
    expect(card("S-JM")).toHaveAttribute("aria-pressed", "false");
    expect(title()).toBe("Kotak Multi Cap Fund — 84.2/100");
  });
  it("selects a card persistently and opens the detail under it, titled with that fund and tied to it by the tier dot", () => {
    mount();
    fireEvent.click(card("S-HDFC"));
    fireEvent.mouseLeave(card("S-HDFC"));
    expect(card("S-HDFC")).toHaveAttribute("aria-pressed", "true");
    expect(card("S-HDFC")).toHaveAttribute("data-selected", "true");
    expect(card("S-KOTAK")).toHaveAttribute("aria-pressed", "false");
    expect(title()).toBe("HDFC Mid-Cap Opportunities Fund — 62.9/100");
    expect(screen.getByTestId("score-detail")).toHaveAttribute("data-fund", "S-HDFC");
    expect(screen.getByRole("region", { name: "HDFC Mid-Cap Opportunities Fund score breakdown" })).toBeInTheDocument();
    const dot = screen.getByTestId("score-detail-dot");
    expect(dot).toHaveAttribute("data-tone", screen.getByTestId("score-tier-S-HDFC").getAttribute("data-tone"));
    expect(dot).toHaveStyle({ backgroundColor: "var(--warn-text)" });
    fireEvent.click(card("S-KOTAK"));
    expect(screen.getByTestId("score-detail-dot")).toHaveStyle({ backgroundColor: "var(--pos)" });
    expect(screen.getByTestId("score-detail-dot")).toHaveAttribute("data-tone", "high");
  });
  it("falls back to the first scored fund when the selected one leaves the data", () => {
    const { rerender } = mount();
    fireEvent.click(card("S-HDFC"));
    const data = fo.scoreSummary();
    data.funds = data.funds.filter(fund => fund.scheme_id !== "S-HDFC");
    rerender(<ScorerBody data={data} />);
    expect(title()).toBe("Kotak Multi Cap Fund — 84.2/100");
    expect(card("S-KOTAK")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("the detail panel", () => {
  it("draws the five-tier bar with the fund's tier active and the weaker tiers filled", () => {
    mount();
    const states = () => [1, 2, 3, 4, 5].map(t => screen.getByTestId(`tier-seg-${t}`).getAttribute("data-state"));
    expect(screen.getByTestId("tier-bar")).toHaveAttribute("data-tier", "1");
    expect(states()).toEqual(["active", "passed", "passed", "passed", "passed"]);
    expect(screen.getByTestId("tier-caption")).toHaveTextContent("Tier 1 of 5 · Top Tier Performer");
    expect(screen.getByText("Tier 1 (Top 20%)")).toBeInTheDocument();
    expect(screen.getByText("Tier 5 (Lower)")).toBeInTheDocument();
    fireEvent.click(card("S-HDFC"));
    expect(states()).toEqual(["off", "off", "active", "passed", "passed"]);
    expect(screen.getByTestId("tier-caption")).toHaveTextContent("Tier 3 of 5 · Average Category Rank");
  });
  it("says why the fund has this tier and what it means for the investor", () => {
    mount();
    expect(screen.getByTestId("score-why")).toHaveTextContent("Why this tier: Scores well mainly due to strong long-term performance and low cost.");
    expect(screen.getByTestId("score-means")).toHaveTextContent("A strong choice within its category based on historical data — suitable if you're comfortable with typical risk for this fund type.");
    fireEvent.click(card("S-HDFC"));
    expect(screen.getByTestId("score-why")).toHaveTextContent("Performs roughly in line with similar funds, with strength in consistent outperformance of peers balanced by weaker downside protection.");
    expect(screen.getByTestId("score-means")).toHaveTextContent("An average performer within its category — worth comparing against a few alternatives before deciding.");
  });
  it("shows the three weighted components with their percentile or hit rate", () => {
    mount();
    expect(screen.getByTestId("break-return")).toHaveTextContent("Return (45%)88.0%ile");
    expect(screen.getByTestId("break-risk")).toHaveTextContent("Downside Risk (30%)79.0%ile");
    expect(screen.getByTestId("break-consistency")).toHaveTextContent("12M Consistency (25%)85.0%");
  });
  it("lists the factors as strengths, each with its verdict, sentence and a green dot", () => {
    mount();
    const strengths = within(screen.getByRole("list", { name: "Strengths" }));
    expect(strengths.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByTestId("factor-return")).toHaveTextContent("Return Excellent — Strong long-term performance — has consistently outperformed similar funds.");
    expect(screen.getByTestId("factor-risk")).toHaveTextContent("Downside protection Strong — Reasonable downside protection compared to similar funds.");
    expect(screen.getByTestId("factor-consistency")).toHaveTextContent("Consistency of outperformance Excellent — Very consistent — has beaten its category median in most 12-month periods.");
    expect(["return", "risk", "consistency"].map(key => screen.getByTestId(`factor-${key}`).getAttribute("data-dot"))).toEqual(["green", "green", "green"]);
    expect(screen.queryByRole("list", { name: "Watch-outs" })).not.toBeInTheDocument();
  });
  it("lists the weak factors as watch-outs with orange and red dots", () => {
    const data = fo.scoreSummary();
    data.funds[0] = { ...data.funds[0], return_percentile: "10.0", risk_percentile: "35.0" };
    mount(data);
    expect(within(screen.getByRole("list", { name: "Watch-outs" })).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByTestId("factor-return")).toHaveAttribute("data-dot", "red");
    expect(screen.getByTestId("factor-risk")).toHaveAttribute("data-dot", "orange");
    expect(screen.getByTestId("factor-return")).toHaveTextContent("Poor — Long-term performance has lagged most similar funds.");
    expect(within(screen.getByRole("list", { name: "Strengths" })).getAllByRole("listitem")).toHaveLength(1);
  });
  it("leaves out the breakdown, factors and why-sentence for a fund missing a percentile", () => {
    const data = fo.scoreSummary();
    data.funds[0] = { ...data.funds[0], risk_percentile: null };
    mount(data);
    expect(screen.queryByTestId("break-return")).not.toBeInTheDocument();
    expect(screen.queryByTestId("score-why")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Strengths" })).not.toBeInTheDocument();
    expect(screen.getByTestId("score-means")).toBeInTheDocument();
  });
});

describe("the Evidence and Methodology accordions", () => {
  const evidence = () => screen.getByTestId("acc-evidence");
  const methodology = () => screen.getByTestId("acc-methodology");
  it("start closed with their state exposed", () => {
    mount();
    expect(evidence()).toHaveAttribute("aria-expanded", "false");
    expect(methodology()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("acc-evidence-body")).not.toBeInTheDocument();
    expect(screen.queryByTestId("acc-methodology-body")).not.toBeInTheDocument();
  });
  it("toggle independently: opening one never closes the other", () => {
    mount();
    fireEvent.click(evidence());
    expect(evidence()).toHaveAttribute("aria-expanded", "true");
    expect(methodology()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(methodology());
    expect(evidence()).toHaveAttribute("aria-expanded", "true");
    expect(methodology()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("acc-evidence-body")).toBeInTheDocument();
    expect(screen.getByTestId("acc-methodology-body")).toBeInTheDocument();
    fireEvent.click(evidence());
    expect(screen.queryByTestId("acc-evidence-body")).not.toBeInTheDocument();
    expect(screen.getByTestId("acc-methodology-body")).toBeInTheDocument();
  });
  it("stay as they are when another fund is selected", () => {
    mount();
    fireEvent.click(methodology());
    fireEvent.click(card("S-JM"));
    expect(methodology()).toHaveAttribute("aria-expanded", "true");
    expect(evidence()).toHaveAttribute("aria-expanded", "false");
  });
  it("show the evidence behind the score for the selected fund", () => {
    mount();
    fireEvent.click(evidence());
    expect(screen.getByTestId("ev-return-fund").textContent).toBe("+15.1%");
    expect(screen.getByTestId("ev-return-category").textContent).toBe("+13.0%");
    expect(screen.getByTestId("ev-down-fund").textContent).toBe("2.84%");
    expect(screen.getByTestId("ev-down-category").textContent).toBe("3.30%");
    expect(screen.getByTestId("ev-consistency").textContent).toBe("51 of 60");
    expect(screen.getByTestId("ev-cost")).toHaveTextContent("Cost bonus: +0.25 for a below-category expense ratio.");
    fireEvent.click(card("S-JM"));
    expect(screen.getByTestId("ev-return-fund").textContent).toBe("+10.8%");
    expect(screen.getByTestId("ev-consistency")).toHaveTextContent("43 of 60");
    expect(screen.getByTestId("ev-cost")).toHaveTextContent("Cost: category-median TER, no adjustment.");
    fireEvent.click(card("S-HDFC"));
    expect(screen.getByTestId("ev-cost")).toHaveTextContent("Cost penalty: -0.25 for an above-category expense ratio.");
  });
  it("show a dash for any evidence the row does not carry", () => {
    const data = fo.scoreSummary();
    data.funds[0] = { ...data.funds[0], scheme_return: null, downside_deviation: null, consistency_hits: null };
    mount(data);
    fireEvent.click(evidence());
    expect(screen.getByTestId("ev-return-fund")).toHaveTextContent("—");
    expect(screen.getByTestId("ev-down-fund")).toHaveTextContent("—");
    expect(screen.getByTestId("ev-consistency")).toHaveTextContent("—");
  });
  it("explain the method in the Methodology body", () => {
    mount();
    fireEvent.click(methodology());
    expect(screen.getByTestId("acc-methodology-body")).toHaveTextContent("Return (45% of score), Downside protection (30%) and Consistency (25%)");
    expect(screen.getByTestId("acc-methodology-body")).toHaveTextContent("0.05 percentage-point dead zone");
  });
});

describe("the group", () => {
  const response = (mutate?: (r: ReturnType<typeof fc.analyticsMfC>) => void) => {
    const r = fc.analyticsMfC();
    mutate?.(r);
    return r;
  };
  it("loads its own section, draws the card, and asks for the analytics once", async () => {
    mocks.getAnalyticsScope.mockResolvedValue(response());
    renderInShell(<ScorerGroup />, { path: "/portfolio/mutual-funds/analytics", scope: { members: [{ id: "m1", name: "A" }, { id: "m2", name: "B" }] } });
    expect(await screen.findByTestId("score-weighted")).toHaveTextContent("73.6");
    expect(screen.getByRole("heading", { name: "Fund Quality Scores" })).toBeInTheDocument();
    fireEvent.click(card("S-JM"));
    expect(mocks.getAnalyticsScope).toHaveBeenCalledTimes(1);
  });
  it("fails on its own with a Retry that asks for a recompute", async () => {
    mocks.getAnalyticsScope.mockResolvedValue(response(r => { r.sections.score = { payload: null, computed_at: null, failed_at: "2026-10-26T00:00:00Z" }; }));
    renderInShell(<ScorerGroup />, { path: "/portfolio/mutual-funds/analytics", scope: { members: [{ id: "m1", name: "A" }, { id: "m2", name: "B" }] } });
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(screen.getByRole("heading", { name: "Fund Quality Scores" })).toBeInTheDocument();
    expect(mocks.retryAnalyticsScope).toHaveBeenCalledWith("combined");
  });
  it("shows a loading status while its section is not settled", async () => {
    mocks.getAnalyticsScope.mockResolvedValue(response(r => { r.sections.score = { payload: null, computed_at: null, failed_at: null }; }));
    renderInShell(<ScorerGroup />, { path: "/portfolio/mutual-funds/analytics", scope: { members: [{ id: "m1", name: "A" }, { id: "m2", name: "B" }] } });
    expect(await screen.findByRole("status", { name: "Loading Fund Quality Scores" })).toBeInTheDocument();
  });
});

describe("every control", () => {
  it("is marked with its effect and exposes its state", () => {
    const { container } = mount();
    fireEvent.click(screen.getByTestId("acc-evidence"));
    fireEvent.click(screen.getByRole("button", { name: "How is this calculated?" }));
    expectInteractivity(container, 6);
    expect(container.querySelectorAll("[data-clickable]")).toHaveLength(6);
    expect(container.querySelectorAll("[data-tooltip]")).toHaveLength(1);
  });
});
