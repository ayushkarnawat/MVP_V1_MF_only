import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { RedemptionFreezeResultView } from "./RedemptionFreezeResultView";
import { historicalResult } from "./testFixtures";

it("shows the freeze headline when a held fund was frozen", () => {
  render(<RedemptionFreezeResultView result={{ ...historicalResult, by_fund: [{ ...historicalResult.by_fund[0], is_frozen: true }] }} />);
  expect(screen.getByText("Frozen, not %")).toBeInTheDocument();
});

it("shows a neutral headline when no held fund was frozen", () => {
  render(<RedemptionFreezeResultView result={{ ...historicalResult, by_fund: historicalResult.by_fund.map(fund => ({ ...fund, is_frozen: false })) }} />);
  expect(screen.getByText("None of your funds were frozen in this event")).toBeInTheDocument();
  expect(screen.queryByText("Frozen, not %")).toBeNull();
  expect(screen.getByText("Real Fund")).toBeInTheDocument();
  expect(screen.queryByLabelText("Portfolio impact")).toBeNull();
});

it("keeps the freeze headline when only some funds were frozen", () => {
  render(<RedemptionFreezeResultView result={{ ...historicalResult, by_fund: historicalResult.by_fund.map((fund, index) => ({ ...fund, is_frozen: index === 0 })) }} />);
  expect(screen.getByText("Frozen, not %")).toBeInTheDocument();
});

it("uses the neutral headline for an empty portfolio", () => {
  render(<RedemptionFreezeResultView result={{ ...historicalResult, by_fund: [], by_member: [] }} />);
  expect(screen.getByText("None of your funds were frozen in this event")).toBeInTheDocument();
  expect(screen.queryByLabelText("Portfolio impact")).toBeNull();
});

it("shows frozen holdings without a percentage alongside real and estimated non-frozen funds", () => {
  render(<RedemptionFreezeResultView result={{ ...historicalResult, by_fund: [{ ...historicalResult.by_fund[0], scheme_name: "Frozen Fund", is_frozen: true, pct: "-99.00" }, historicalResult.by_fund[1], historicalResult.by_fund[2], { ...historicalResult.by_fund[0], scheme_id: "other" }] }} />);
  expect(screen.getByText("Frozen, not %")).toBeInTheDocument();
  expect(screen.getByText("Redemptions frozen ~20mo")).toBeInTheDocument();
  expect(screen.queryByText("-99.00%")).not.toBeInTheDocument();
  expect(screen.getByText("~-20.00%")).toBeInTheDocument();
  expect(screen.getByText("Category average estimate")).toBeInTheDocument();
  expect(screen.getAllByText("Not frozen")).toHaveLength(3);
  expect(screen.getByText("Not enough historical data to estimate")).toBeInTheDocument();
  expect(screen.getByText(/not a prediction of future returns/)).toBeInTheDocument();
});
