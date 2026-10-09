// frontend/src/features/analytics/InvestmentWithdrawalSection.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvestmentWithdrawalSection } from "./InvestmentWithdrawalSection";
import type { InvestmentWithdrawalResult } from "./types";

const entry = (over: Partial<InvestmentWithdrawalResult["monthly"][number]["entries"][number]> = {}) => ({
  transaction_id: "t1", date: "2026-01-05", type: "purchase_sip", amount: "5000.00", direction: "invested" as const,
  scheme_name: "Test Flexi Cap Fund", household_member_id: "m1", household_member_name: "Priya", ...over,
});

const baseResult: InvestmentWithdrawalResult = {
  total_invested: "3840000.00",
  total_withdrawn: "600000.00",
  net_invested: "3240000.00",
  current_value: "3500000.00",
  absolute_gain: "260000.00",
  monthly: [
    { period: "2026-01", invested: "5000.00", withdrawn: "0.00", entries: [entry()] },
    { period: "2026-02", invested: "0.00", withdrawn: "0.00", entries: [] },
  ],
  yearly: [{ period: "2026", invested: "5000.00", withdrawn: "0.00", entries: [entry()] }],
  sip_summary: { active_count: 2, total_monthly_amount: "15000.00", missed_count: 0 },
  gifts_net: "0.00",
};

describe("InvestmentWithdrawalSection", () => {
  it("says the section isn't available when it failed (no data, not loading), instead of a skeleton forever", () => {
    render(<InvestmentWithdrawalSection data={null} isLoading={false} />);
    expect(screen.getByText("Investment & withdrawal data isn’t available right now.")).toBeInTheDocument();
    expect(screen.queryByTestId("investment-withdrawal-skeleton")).not.toBeInTheDocument();
  });

  it("renders a loading skeleton while isLoading", () => {
    render(<InvestmentWithdrawalSection data={null} isLoading />);
    expect(screen.getByTestId("investment-withdrawal-skeleton")).toBeInTheDocument();
  });

  it("renders all 5 tiles with the worked-example values", () => {
    render(<InvestmentWithdrawalSection data={baseResult} />);
    expect(screen.getByText("₹38,40,000")).toBeInTheDocument();
    expect(screen.getByText("₹6,00,000")).toBeInTheDocument();
    expect(screen.getByText("₹32,40,000")).toBeInTheDocument();
    expect(screen.getByText("₹35,00,000")).toBeInTheDocument();
    expect(screen.getByText("₹2,60,000")).toBeInTheDocument();
  });

  it("shows a negative gain with a minus sign", () => {
    render(<InvestmentWithdrawalSection data={{ ...baseResult, absolute_gain: "-120000.00" }} />);
    expect(screen.getByText("−₹1,20,000")).toBeInTheDocument();
  });

  it("shows an empty-state message instead of a chart for a household with no transactions", () => {
    const empty = { ...baseResult, total_invested: "0.00", total_withdrawn: "0.00", net_invested: "0.00", current_value: "0.00", absolute_gain: "0.00", monthly: [], yearly: [] };
    render(<InvestmentWithdrawalSection data={empty} />);
    expect(screen.getByText("No transactions yet")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /invested and withdrawn/i })).not.toBeInTheDocument();
  });

  it("toggles between monthly and yearly periods", () => {
    render(<InvestmentWithdrawalSection data={baseResult} />);
    expect(screen.getByTestId("bar-group-2026-02")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yearly" }));
    expect(screen.getByTestId("bar-group-2026")).toBeInTheDocument();
    expect(screen.queryByTestId("bar-group-2026-02")).not.toBeInTheDocument();
  });

  it("tapping a period lists that period's transactions, and a quiet period says so", () => {
    render(<InvestmentWithdrawalSection data={baseResult} />);
    expect(screen.getByText("Jan ’26")).toBeInTheDocument(); // axis label
    fireEvent.click(screen.getByTestId("bar-group-2026-01"));
    expect(screen.getByText("Test Flexi Cap Fund")).toBeInTheDocument();
    expect(screen.getByText("January 2026")).toBeInTheDocument(); // drill-in heading, not "2026-01"
    fireEvent.click(screen.getByTestId("bar-group-2026-02"));
    expect(screen.getByText("No transactions in this period")).toBeInTheDocument();
  });

  it("labels a bounced SIP in the transaction list", () => {
    const withReversal = {
      ...baseResult,
      monthly: [{ period: "2026-01", invested: "0.00", withdrawn: "0.00", entries: [entry(), entry({ transaction_id: "t2", type: "reversal", direction: "reversal" as const })] }],
    };
    render(<InvestmentWithdrawalSection data={withReversal} />);
    fireEvent.click(screen.getByTestId("bar-group-2026-01"));
    expect(screen.getByText(/bounced sip/i)).toBeInTheDocument();
  });

  it("explains gifts under the tiles only when there are any", () => {
    const { rerender } = render(<InvestmentWithdrawalSection data={baseResult} />);
    expect(screen.queryByText(/gift/i)).not.toBeInTheDocument();
    rerender(<InvestmentWithdrawalSection data={{ ...baseResult, gifts_net: "5000.00" }} />);
    expect(screen.getByText("Gain excludes ₹5,000 of units received as gifts.")).toBeInTheDocument();
    rerender(<InvestmentWithdrawalSection data={{ ...baseResult, gifts_net: "-4000.00" }} />);
    expect(screen.getByText("Gain includes ₹4,000 of units given away as gifts.")).toBeInTheDocument();
  });

  it("shows 'No active SIPs' rather than omitting the SIP card", () => {
    render(<InvestmentWithdrawalSection data={{ ...baseResult, sip_summary: { active_count: 0, total_monthly_amount: "0.00", missed_count: 0 } }} />);
    expect(screen.getByText("No active SIPs")).toBeInTheDocument();
  });

  it("shows a missed-instalments badge when missed_count > 0", () => {
    render(<InvestmentWithdrawalSection data={{ ...baseResult, sip_summary: { active_count: 2, total_monthly_amount: "15000.00", missed_count: 3 } }} />);
    expect(screen.getByText("3 missed instalments")).toBeInTheDocument();
  });
});
