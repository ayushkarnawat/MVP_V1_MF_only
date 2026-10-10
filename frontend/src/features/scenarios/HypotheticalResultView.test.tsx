import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { HypotheticalResultView } from "./HypotheticalResultView";
import { historicalResult } from "./testFixtures";

it("renders the nullable assumptions-not-set contract without any figures", () => {
  const { container } = render(<HypotheticalResultView result={{ ...historicalResult, assumptions_not_set: true, portfolio_impact_pct: null, rupee_impact: null, covered_value: null, total_value: null, no_data_funds: null, benchmarks: [], by_fund: [], by_member: [], hypothetical_assumptions: [] }} />);
  expect(screen.getByText("We haven't set an assumption for this scenario yet — check back soon.")).toBeInTheDocument();
  expect(container.textContent).not.toMatch(/[₹%]/);
});

it("shows the hypothetical framing and verbatim assumptions, without historical breakdowns", () => {
  render(<HypotheticalResultView result={{ ...historicalResult, hypothetical_assumptions: [{ asset_class: "Silver", assumed_pct_change: "4.00", assumption_note: "A stated judgment about silver." }] }} />);
  expect(screen.getByText(/not a historical replay/)).toBeInTheDocument();
  expect(screen.getByText("Silver")).toBeInTheDocument();
  expect(screen.getByText("4.00%")).toBeInTheDocument();
  expect(screen.getByText("A stated judgment about silver.")).toBeInTheDocument();
  expect(screen.queryByText("By fund")).not.toBeInTheDocument();
  expect(screen.queryByText("By family member")).not.toBeInTheDocument();
});
