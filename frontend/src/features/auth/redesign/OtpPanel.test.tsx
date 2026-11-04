import { fireEvent, render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OtpPanel } from "./OtpPanel";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const mount = (over: Partial<Parameters<typeof OtpPanel>[0]> = {}) => {
  const handlers = { onSubmit: vi.fn(), onResend: vi.fn(), onBack: vi.fn(), onEditIdentity: vi.fn() };
  render(<OtpPanel channel="phone" identity="+91 98765 43210" submitLabel="Verify and log in" devOtp={null} error={null} {...handlers} {...over} />);
  return handlers;
};
const fill = (code: string) => {
  const cells = screen.getAllByRole("textbox");
  [...code].forEach((digit, index) => fireEvent.change(cells[index], { target: { value: digit } }));
};

describe("OtpPanel", () => {
  it("has the phone heading, six labelled cells and the submit label of the screen", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Verify your mobile number" })).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(6);
    expect(screen.getByLabelText("Verification code")).toBeInTheDocument();
    expect(screen.getByLabelText("Digit 6 of 6")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify and log in" })).toBeInTheDocument();
  });
  it("has the email heading for the email channel", () => {
    mount({ channel: "email", identity: "si••••••@gmail.com" });
    expect(screen.getByRole("heading", { name: "Verify your email address" })).toBeInTheDocument();
  });
  it("submits the six digits, and does not submit fewer", () => {
    const { onSubmit } = mount();
    fill("123");
    fireEvent.click(screen.getByRole("button", { name: "Verify and log in" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter the complete 6-digit verification code.");
    fill("123456");
    fireEvent.click(screen.getByRole("button", { name: "Verify and log in" }));
    expect(onSubmit).toHaveBeenCalledWith("123456");
  });
  it("counts down from 01:00 and enables Resend at 0, then restarts after a resend", () => {
    const { onResend } = mount();
    const resend = () => screen.getByRole("button", { name: /resend/i });
    expect(screen.getByText(/01:00/)).toBeInTheDocument();
    expect(resend()).toBeDisabled();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(resend()).toBeEnabled();
    fireEvent.click(resend());
    expect(onResend).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/01:00/)).toBeInTheDocument();
    expect(resend()).toBeDisabled();
  });
  it("shows the server's message, such as a 429 wait", () => {
    mount({ error: "Please wait 45s before requesting another code." });
    expect(screen.getByRole("alert")).toHaveTextContent("Please wait 45s before requesting another code.");
  });
  it("shows Get code via call, and it does nothing and is not a trap", () => {
    const handlers = mount();
    const call = screen.getByText("Get code via call");
    expect(screen.getByText("OR")).toBeInTheDocument();
    const control = call.closest("[aria-disabled]") as HTMLElement;
    expect(control).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(call);
    expect(handlers.onSubmit).not.toHaveBeenCalled();
    expect(handlers.onResend).not.toHaveBeenCalled();
    expect(control.tagName).not.toBe("BUTTON");
  });
  it("can leave Get code via call out", () => {
    mount({ showCall: false });
    expect(screen.queryByText("Get code via call")).toBeNull();
    expect(screen.queryByText("OR")).toBeNull();
  });
  it("shows the dev code strip only when a code is given", () => {
    const { unmount } = render(<OtpPanel channel="phone" identity="x" submitLabel="Go" devOtp="123456" error={null} onSubmit={() => {}} onResend={() => {}} />);
    expect(screen.getByText(/123 456/)).toBeInTheDocument();
    unmount();
    mount();
    expect(screen.queryByText(/Test mode/)).toBeNull();
  });
  it("Edit and Back call their handlers", () => {
    const handlers = mount({ editLabel: "Edit number" });
    fireEvent.click(screen.getByRole("button", { name: "Edit number" }));
    expect(handlers.onEditIdentity).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(handlers.onBack).toHaveBeenCalledTimes(1);
  });
  it("shows Verifying code... and disables the button while submitting", () => {
    mount({ submitting: true });
    expect(screen.getByRole("button", { name: /Verifying code/ })).toBeDisabled();
  });
  it("shows the arrow button, one auth-or, phone icon in the call line, and one resend sequence", () => {
    mount();
    expect(screen.getByTestId("auth-btn-arrow")).toBeInTheDocument();
    expect(document.querySelectorAll(".auth-or")).toHaveLength(1);
    const call = screen.getByText("Get code via call");
    const callControl = call.closest("[aria-disabled='true']");
    expect(callControl).toBeInTheDocument();
    expect(callControl?.querySelector("svg")).toBeInTheDocument();
    const resendContainer = screen.getByText(/Didn't receive the code\?/).parentElement;
    expect(resendContainer).toHaveTextContent("Didn't receive the code? Resend code in 01:00");
  });
});
