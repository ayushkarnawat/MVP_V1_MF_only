import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatRupees } from "../../../lib/format";
import * as fx from "../fixtures";
import * as fb from "../fixtures/mfB";
import { monthlySipTotal } from "../mfCopy";
import { expectInteractivity } from "../testing";
import { SipBanner } from "./SipBanner";

const summary = () => fb.investmentWithdrawal().sip_summary;

describe("SipBanner", () => {
  it("shows the active count, the monthly amount and the missed instalments", () => {
    render(<SipBanner summary={summary()} />);
    expect(screen.getByTestId("sip-count")).toHaveTextContent("5 active SIPs");
    expect(screen.getByTestId("sip-monthly")).toHaveTextContent("₹50,575/month");
    expect(screen.getByTestId("sip-missed")).toHaveTextContent("1 missed instalment");
  });
  it("shows the same monthly figure as the Overview SIP timeline", () => {
    render(<SipBanner summary={summary()} />);
    expect(screen.getByTestId("sip-monthly")).toHaveTextContent(`${formatRupees(monthlySipTotal(fx.sips().sips))}/month`);
  });
  it("gives the missed badge a tooltip and says it in the plural", () => {
    render(<SipBanner summary={{ ...summary(), missed_count: 3 }} />);
    const badge = screen.getByTestId("sip-missed");
    expect(badge).toHaveTextContent("3 missed instalments");
    expect(badge).toHaveAttribute("title", "A scheduled SIP instalment did not appear on the latest statement.");
    expect(badge).toHaveAttribute("data-tooltip", "A scheduled SIP instalment did not appear on the latest statement.");
  });
  it("leaves out the badge when nothing was missed, and says 'SIP' for one", () => {
    render(<SipBanner summary={{ active_count: 1, total_monthly_amount: "3336.00", missed_count: 0 }} />);
    expect(screen.getByTestId("sip-count")).toHaveTextContent("1 active SIP");
    expect(screen.queryByTestId("sip-missed")).not.toBeInTheDocument();
  });
  it("says there are no active SIPs", () => {
    render(<SipBanner summary={{ active_count: 0, total_monthly_amount: "0.00", missed_count: 0 }} />);
    expect(screen.getByText("No active SIPs")).toBeInTheDocument();
    expect(screen.queryByTestId("sip-monthly")).not.toBeInTheDocument();
  });
  it("has no controls to mark", () => {
    const { container } = render(<SipBanner summary={summary()} />);
    expectInteractivity(container, 0);
  });
});
