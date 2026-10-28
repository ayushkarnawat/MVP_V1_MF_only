import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import type { ScoreResponse } from "../types";
import type { FundSection } from "../useFundSection";
import { FundScoreRing, ScoreCard } from "./ScoreCard";

const score = (overrides: Partial<ScoreResponse> = {}): ScoreResponse => ({ ...fixture<ScoreResponse>("score_stored"), ...overrides });
const section = (over: Partial<FundSection<ScoreResponse>> = {}): FundSection<ScoreResponse> => ({
  status: "ready", data: score(), reason: null, error: null, retry: vi.fn(), ...over,
});

describe("FundScoreRing", () => {
  it.each([
    [90, "#15803D"], [85, "#15803D"], [72, "#22C55E"], [70, "#22C55E"], [60, "#65A30D"], [55, "#65A30D"],
    [45, "#CA8A04"], [40, "#CA8A04"], [30, "#EA580C"], [25, "#EA580C"], [10, "#C1272D"], [0, "#C1272D"],
  ])("a score of %s is drawn in %s", (value, colour) => {
    render(<FundScoreRing score={value} />);
    expect(screen.getByTestId("score-ring-arc")).toHaveAttribute("stroke", colour);
  });

  it("draws the arc in proportion: 72 of 100 is 122.1 of 169.6, and the number is shown", () => {
    render(<FundScoreRing score={72} />);
    expect(screen.getByTestId("score-ring-arc")).toHaveAttribute("stroke-dasharray", "122.1 169.6");
    expect(screen.getByTestId("score-number")).toHaveTextContent("72");
    expect(screen.getByRole("img", { name: "Fund score 72 out of 100" })).toBeInTheDocument();
  });
});

describe("ScoreCard", () => {
  it("shows a loading status while the score loads", () => {
    render(<ScoreCard score={section({ status: "loading", data: null })} />);
    expect(screen.getByRole("status", { name: "Loading score" })).toBeInTheDocument();
  });

  it("a ready score shows the label, the ring number, the band word and the band sentence", () => {
    render(<ScoreCard score={section()} />);
    const card = screen.getByTestId("score-card");
    expect(card).toHaveTextContent("Unifolio Fund Score");
    // The stored golden scores 78.50: the ring shows 79 (half up) and 78.5 is in the Strong band (70 to 84.99).
    expect(within(card).getByTestId("score-number")).toHaveTextContent("79");
    expect(within(card).getByTestId("score-band")).toHaveTextContent("Strong");
    expect(card).toHaveTextContent("Consistent performance, reasonable costs and strong portfolio quality.");
    expect(within(card).getByTestId("score-ring-arc")).toHaveAttribute("stroke", "#22C55E");
  });

  it.each([["88.00", "Excellent"], ["60.00", "Good"], ["45.00", "Average"], ["30.00", "Weak"], ["12.00", "Poor"]])(
    "a score of %s is called %s", (finalScore, word) => {
      render(<ScoreCard score={section({ data: score({ final_score: finalScore }) })} />);
      expect(screen.getByTestId("score-band")).toHaveTextContent(word);
    });

  it("rounds a fractional score half up for the ring number", () => {
    render(<ScoreCard score={section({ data: score({ final_score: "71.50" }) })} />);
    expect(screen.getByTestId("score-number")).toHaveTextContent("72");
  });

  it("test_score_unavailable_shows_reason_not_ring", () => {
    render(<ScoreCard score={section({ status: "unavailable", data: null, reason: "peers_unavailable" })} />);
    expect(screen.getByTestId("score-card")).toHaveTextContent("Category comparison is not available for this fund yet.");
    expect(screen.queryByTestId("score-ring-arc")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it.each([
    [{ insufficient_history: true }, "Not enough history to score this fund yet."],
    [{ thin_category: true }, "Too few funds in this category for a reliable score."],
    [{ category_unavailable: true }, "This fund has no category to compare it with."],
    [{ final_score: null }, "No score available yet."],
  ])("a score flagged %j shows its explanation and no ring", (flag, text) => {
    render(<ScoreCard score={section({ data: score(flag as Partial<ScoreResponse>) })} />);
    expect(screen.getByTestId("score-card")).toHaveTextContent(text);
    expect(screen.queryByTestId("score-ring-arc")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("an error shows its own message and Retry calls retry", () => {
    const retry = vi.fn();
    render(<ScoreCard score={section({ status: "error", data: null, retry })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the score.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("the card opens the breakdown on click, Enter and Space, and Escape closes it", () => {
    render(<ScoreCard score={section()} />);
    const card = screen.getByRole("button", { name: /Unifolio Fund Score/ });
    expect(card).toHaveAttribute("tabindex", "0");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(card);
    expect(screen.getByRole("dialog", { name: "Unifolio Fund Score" })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(card, { key: "Enter" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    fireEvent.keyDown(card, { key: " " });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("other keys do not open the breakdown", () => {
    render(<ScoreCard score={section()} />);
    fireEvent.keyDown(screen.getByTestId("score-card"), { key: "a" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the breakdown lists the factors from the stored row", () => {
    render(<ScoreCard score={section()} />);
    fireEvent.click(screen.getByTestId("score-card"));
    expect(screen.getByTestId("score-value")).toHaveTextContent("79 / 100");
    expect(screen.getByTestId("score-rating")).toHaveTextContent("Strong");
    // scheme_return "0.1150" and category_avg_return "0.0950" are fractions: 11.5% against 9.5%.
    expect(screen.getByTestId("score-return")).toHaveTextContent("11.5% vs 9.5%");
    expect(screen.getByTestId("score-return-pct")).toHaveTextContent("82");
    expect(screen.getByTestId("score-risk-pct")).toHaveTextContent("72");
    expect(screen.getByTestId("score-consistency")).toHaveTextContent("4 of 5 rolling windows");
    expect(screen.getByTestId("score-updated")).toHaveTextContent("23 Oct 2026");
  });

  it("a stored score and a computed score look the same: the breakdown never says which it is", () => {
    const view = render(<ScoreCard score={section({ data: fixture<ScoreResponse>("score_computed") })} />);
    fireEvent.click(screen.getByTestId("score-card"));
    expect(screen.getByRole("dialog")).not.toHaveTextContent(/stored|computed/i);
    // score_computed.json: final_score 57.39 (PENDING re-copy of the corrected golden: re-derive then).
    expect(screen.getByTestId("score-value")).toHaveTextContent("57 / 100");
    // Its fractions are long decimals ("0.0997813910184841955369313962" and "0.1080959623568836480857113976"): shown to one place.
    expect(screen.getByTestId("score-return")).toHaveTextContent("10.0% vs 10.8%");
    expect(screen.getByTestId("score-consistency")).toHaveTextContent("48 of 48 rolling windows");
    expect(screen.getByTestId("score-updated")).toHaveTextContent("23 Oct 2026");
    view.unmount();
  });
});
