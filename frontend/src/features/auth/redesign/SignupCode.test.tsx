import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SignupCode } from "./SignupCode";

function mount(over: Partial<Parameters<typeof SignupCode>[0]> = {}) {
  const handlers = { onSubmit: vi.fn(), onResend: vi.fn(), onBack: vi.fn(), onEditNumber: vi.fn(), onLogin: vi.fn() };
  render(<SignupCode phone="+919876543210" devOtp={null} error={null} submitting={false} {...handlers} {...over} />);
  return handlers;
}
const fill = (code: string) => {
  const cells = screen.getAllByRole("textbox");
  [...code].forEach((digit, index) => fireEvent.change(cells[index], { target: { value: digit } }));
};

describe("SignupCode, sign-up screen 2 (task 6.9)", () => {
  it("has the left panel with the number in full and Edit number, and the phone sketch", () => {
    mount();
    const left = screen.getByTestId("auth-left-text");
    expect(within(left).getByRole("heading", { level: 2, name: "Quick and secure." })).toBeInTheDocument();
    expect(within(left).getByText("We've sent a 6-digit verification code to")).toBeInTheDocument();
    expect(within(left).getByText("+91 98765 43210")).toBeInTheDocument();
    expect(within(left).getByRole("button", { name: "Edit number" })).toBeInTheDocument();
    expect(screen.getByTestId("auth-sketch")).toHaveAttribute("src", "/illustrations/auth/phone.svg");
  });
  it("has the step bar and the code panel with the design's words and six cells", () => {
    mount();
    expect(screen.getByRole("group", { name: "Step 2 of 5" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Verify your number" })).toBeInTheDocument();
    expect(screen.getByText("Enter the 6-digit code we sent to your mobile number.")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Verify & Continue" })).toBeInTheDocument();
    expect(screen.getByText(/Resend code in 01:00/)).toBeInTheDocument();
    expect(screen.getByText("Get code via call")).toHaveAttribute("aria-disabled", "true");
  });
  it("Back and Edit number both return to screen 1", () => {
    const { onBack, onEditNumber } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit number" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onEditNumber).toHaveBeenCalledTimes(1);
  });
  it("a full code is submitted; a short one is refused with a message and no shortcut", () => {
    const { onSubmit } = mount({ error: null });
    fill("123");
    fireEvent.click(screen.getByRole("button", { name: "Verify & Continue" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter the complete 6-digit verification code.");
    fill("123456");
    fireEvent.click(screen.getByRole("button", { name: "Verify & Continue" }));
    expect(onSubmit).toHaveBeenCalledWith("123456");
  });
  it("shows the test code strip when the backend returns one", () => {
    mount({ devOtp: "654321" });
    expect(screen.getByText(/654 321/)).toBeInTheDocument();
  });
  it("an account-exists error shows Log in instead; another error does not", () => {
    const { onLogin } = mount({ error: "An account with this mobile number already exists." });
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Log in instead" }));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });
  it("a wrong code shows the message with no shortcut", () => {
    mount({ error: "That code didn't work. Try again." });
    expect(screen.getByRole("alert")).toHaveTextContent("That code didn't work.");
    expect(screen.queryByRole("button", { name: "Log in instead" })).toBeNull();
  });
});
