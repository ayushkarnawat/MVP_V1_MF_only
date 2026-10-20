import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { XirrDisclaimerModal } from "./XirrDisclaimerModal";

const disclaimer = { alt_xirr: "-0.0353", opening_cost_share: "0.9785" };

describe("XirrDisclaimerModal", () => {
  it("renders nothing when closed", () => {
    render(<XirrDisclaimerModal isOpen={false} onClose={() => {}} scopeLabel="Lifetime" xirr="1.9397" disclaimer={disclaimer} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the spec copy with the numbers filled in", () => {
    render(<XirrDisclaimerModal isOpen onClose={() => {}} scopeLabel="Lifetime" xirr="1.9397" disclaimer={disclaimer} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Why this return may be misleading")).toBeInTheDocument();
    expect(screen.getByText(/how your uploaded CAS statement reports old holdings/)).toBeInTheDocument();
    expect(screen.getByText("Shown Lifetime XIRR")).toBeInTheDocument();
    expect(screen.getByText("193.97%")).toBeInTheDocument();
    expect(screen.getByText("Without the undated portion")).toBeInTheDocument();
    expect(screen.getAllByText(/-3\.53%/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("What's driving this number")).toBeInTheDocument();
    expect(screen.getByText(/^98% of the money behind this return came from an opening balance/)).toBeInTheDocument();
    expect(screen.getByText("Why that matters here, specifically")).toBeInTheDocument();
    expect(screen.getByText("Why we're not guessing a date")).toBeInTheDocument();
    expect(screen.getByText("About the number on the right")).toBeInTheDocument();
    expect(screen.getByText(/is the annualized return on only the money with a verified date/)).toBeInTheDocument();
    expect(screen.getByText("A note on account aggregator / MF Central imports")).toBeInTheDocument();
    expect(screen.getByText(/we can't promise it disappears completely/)).toBeInTheDocument();
  });

  it("uses the Current Holdings label", () => {
    render(<XirrDisclaimerModal isOpen onClose={() => {}} scopeLabel="Current Holdings" xirr="0.5" disclaimer={disclaimer} />);
    expect(screen.getByText("Shown Current Holdings XIRR")).toBeInTheDocument();
    expect(screen.getByText("50.00%")).toBeInTheDocument();
  });

  it("handles alt_xirr null with the alternative copy", () => {
    render(<XirrDisclaimerModal isOpen onClose={() => {}} scopeLabel="Lifetime" xirr="1.9397" disclaimer={{ alt_xirr: null, opening_cost_share: "0.9785" }} />);
    expect(screen.getByText("Not enough dated activity left")).toBeInTheDocument();
    expect(screen.getByText(/There isn't enough dated activity left to calculate a return/)).toBeInTheDocument();
    expect(screen.queryByText(/is the annualized return on only the money/)).not.toBeInTheDocument();
  });

  it("has no fix-the-date call to action and a single Got it button", () => {
    render(<XirrDisclaimerModal isOpen onClose={() => {}} scopeLabel="Lifetime" xirr="1.9397" disclaimer={disclaimer} />);
    expect(screen.getAllByRole("button", { name: "Got it" })).toHaveLength(1);
    expect(screen.queryByText(/fix the date/i)).not.toBeInTheDocument();
  });

  it("closes via Got it and Escape", () => {
    const onClose = vi.fn();
    render(<XirrDisclaimerModal isOpen onClose={onClose} scopeLabel="Lifetime" xirr="1.9397" disclaimer={disclaimer} />);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
