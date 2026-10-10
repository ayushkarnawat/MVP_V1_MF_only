import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { RedemptionFreezeResultView } from "./RedemptionFreezeResultView";
import { historicalResult } from "./testFixtures";

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
