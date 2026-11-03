import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OtpPanel } from "./OtpPanel";

const base = { channel: "phone" as const, identity: "+91 98765 43210", submitLabel: "Verify & Continue", devOtp: null, error: null, onSubmit: vi.fn(), onResend: vi.fn() };

describe("OtpPanel, wording set by the screen (sign-up, task 6.9)", () => {
  it("keeps today's heading and description when nothing is set", () => {
    render(<OtpPanel {...base} />);
    expect(screen.getByRole("heading", { level: 1, name: "Verify your mobile number" })).toBeInTheDocument();
    expect(screen.getByText("Enter the 6-digit code sent to +91 98765 43210.")).toBeInTheDocument();
  });
  it("title and description replace them", () => {
    render(<OtpPanel {...base} title="Verify your number" description="Enter the 6-digit code we sent to your mobile number." />);
    expect(screen.getByRole("heading", { level: 1, name: "Verify your number" })).toBeInTheDocument();
    expect(screen.getByText("Enter the 6-digit code we sent to your mobile number.")).toBeInTheDocument();
    expect(screen.queryByText(/sent to \+91/)).toBeNull();
  });
  it("errorAction adds a shortcut under a server error", () => {
    const onClick = vi.fn();
    render(<OtpPanel {...base} error="An account with this mobile number already exists." errorAction={{ label: "Log in instead", onClick }} />);
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Log in instead" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it("the shortcut is not shown for the panel's own incomplete-code message", () => {
    render(<OtpPanel {...base} errorAction={{ label: "Log in instead", onClick: vi.fn() }} />);
    fireEvent.click(screen.getByRole("button", { name: "Verify & Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter the complete 6-digit verification code.");
    expect(screen.queryByRole("button", { name: "Log in instead" })).toBeNull();
  });
});
