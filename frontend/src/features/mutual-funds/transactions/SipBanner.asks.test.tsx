import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as fa from "../fixtures/mfAsks";
import { expectInteractivity } from "../testing";
import { SipBanner } from "./SipBanner";

const TIP = "HDFC Mid-Cap Opportunities Fund — SIP due 05 Oct 2026 was not debited";
const GENERIC = "A scheduled SIP instalment did not appear on the latest statement.";
const summary = () => fa.investmentWithdrawalWithDetail().sip_summary;

describe("the missed-instalment badge with the fund and the date", () => {
  it("names the fund and the due date in its tooltip and keeps its text", () => {
    render(<SipBanner summary={summary()} />);
    const badge = screen.getByTestId("sip-missed");
    expect(badge).toHaveTextContent("1 missed instalment");
    expect(badge).toHaveAttribute("title", TIP);
    expect(badge).toHaveAttribute("data-tooltip", TIP);
    expect(badge).toHaveAttribute("role", "note");
  });
  it("uses the same tooltip when several instalments are missed", () => {
    render(<SipBanner summary={{ ...summary(), missed_count: 3 }} />);
    expect(screen.getByTestId("sip-missed")).toHaveTextContent("3 missed instalments");
    expect(screen.getByTestId("sip-missed")).toHaveAttribute("title", TIP);
  });
  it("falls back to the generic tooltip when the fund or the date is missing or null", () => {
    const { rerender } = render(<SipBanner summary={{ ...summary(), missed_sip_fund: null, missed_sip_date: null }} />);
    expect(screen.getByTestId("sip-missed")).toHaveAttribute("title", GENERIC);
    rerender(<SipBanner summary={{ ...summary(), missed_sip_date: undefined }} />);
    expect(screen.getByTestId("sip-missed")).toHaveAttribute("title", GENERIC);
    rerender(<SipBanner summary={{ ...summary(), missed_sip_fund: undefined }} />);
    expect(screen.getByTestId("sip-missed")).toHaveAttribute("data-tooltip", GENERIC);
  });
  it("shows no badge when nothing is missed, even if a stale fund is present", () => {
    render(<SipBanner summary={{ ...summary(), missed_count: 0 }} />);
    expect(screen.queryByTestId("sip-missed")).not.toBeInTheDocument();
  });
  it("keeps the tooltip rule and has no controls", () => {
    const { container } = render(<SipBanner summary={summary()} />);
    expectInteractivity(container, 0);
  });
});
