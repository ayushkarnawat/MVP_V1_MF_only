import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { MultiPhaseResultView } from "./MultiPhaseResultView";
import { historicalResult } from "./testFixtures";

it("keeps the whole-event headline, coverage and members apart from current-phase funds", () => {
  render(<MultiPhaseResultView result={{ ...historicalResult, scenario: { ...historicalResult.scenario, has_phases: true, is_ongoing: true, end_date: null }, portfolio_impact_pct: "-12.00", rupee_impact: "-240000.00", by_fund: [{ ...historicalResult.by_fund[0], pct: "-3.00" }], phases: [{ label: "Shock", order: 1, start_date: "2026-02-28", end_date: "2026-04-02", is_ongoing: false, pct: "-10.00" }, { label: "Relapse", order: 2, start_date: "2026-07-08", end_date: null, is_ongoing: true, pct: null }] }} />);
  expect(within(screen.getByLabelText("Cumulative portfolio impact")).getByText("-12.00%")).toBeInTheDocument();
  expect(within(screen.getByLabelText("Rupee impact")).getByText("₹-2,40,000")).toBeInTheDocument();
  expect(screen.getByText(/Based on ₹20,00,000/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Ayush/ })).toBeInTheDocument();
  expect(screen.getByText("Current phase")).toBeInTheDocument();
  expect(screen.getByText("-3.00%")).toBeInTheDocument();
  expect(screen.getByText("-10.00%")).toBeInTheDocument();
  expect(screen.getByText(/Numbers will update as the event continues/)).toBeInTheDocument();
  expect(screen.getByText("Not enough historical data to estimate")).toBeInTheDocument();
});
