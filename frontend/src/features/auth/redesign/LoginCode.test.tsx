import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginCode } from "./LoginCode";

function mount(over: Partial<Parameters<typeof LoginCode>[0]> = {}) {
  const handlers = { onSubmit: vi.fn(), onResend: vi.fn(), onBack: vi.fn(), onEditIdentity: vi.fn() };
  render(<LoginCode channel="phone" identity="+919876543210" devOtp={null} error={null} submitting={false} {...handlers} {...over} />);
  return handlers;
}
const fill = (code: string) => {
  const cells = screen.getAllByRole("textbox");
  [...code].forEach((digit, index) => fireEvent.change(cells[index], { target: { value: digit } }));
};

describe("LoginCode, mobile", () => {
  it("has Welcome back and the masked number with Edit number in the left panel, with the phone sketch", () => {
    mount();
    const left = screen.getByTestId("auth-left-text");
    expect(within(left).getByRole("heading", { level: 2, name: "Welcome back." })).toBeInTheDocument();
    expect(within(left).getByText("Enter the code we sent to verify your identity and securely access your Unifolio account.")).toBeInTheDocument();
    expect(within(left).getByText("+91 ••••• 43210")).toBeInTheDocument();
    expect(within(left).getByRole("button", { name: "Edit number" })).toBeInTheDocument();
    expect(screen.getByTestId("auth-sketch")).toHaveAttribute("src", "/illustrations/auth/phone-code.webp");
  });
  it("has the code panel on the right with the design's words", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Verify your mobile number" })).toBeInTheDocument();
    expect(screen.getByText("Enter the 6-digit code sent to +91 ••••• 43210.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify and log in" })).toBeInTheDocument();
    expect(screen.getByText(/Resend code in 01:00/)).toBeInTheDocument();
    expect(screen.getByText("Get code via call")).toBeInTheDocument();
  });
  it("has no step bar, and the real Back is in the card's top bar", () => {
    const { onBack } = mount();
    expect(screen.queryByText(/Step \d of 5/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
  it("Edit number calls onEditIdentity", () => {
    const { onEditIdentity } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Edit number" }));
    expect(onEditIdentity).toHaveBeenCalledTimes(1);
  });
  it("submits the six digits", () => {
    const { onSubmit } = mount();
    fill("123456");
    fireEvent.click(screen.getByRole("button", { name: "Verify and log in" }));
    expect(onSubmit).toHaveBeenCalledWith("123456");
  });
  it("shows a wrong or expired code with the shared alert", () => {
    mount({ error: "That code didn't work. Try again." });
    expect(screen.getByRole("alert")).toHaveTextContent("That code didn't work. Try again.");
  });
  it("shows the dev code strip when the backend returns a code", () => {
    mount({ devOtp: "654321" });
    expect(screen.getByText(/654 321/)).toBeInTheDocument();
  });
});

describe("LoginCode, email", () => {
  it("has the envelope sketch, the masked address and Edit email address", () => {
    mount({ channel: "email", identity: "siddharth@gmail.com" });
    const left = screen.getByTestId("auth-left-text");
    expect(within(left).getByText("si••••••@gmail.com")).toBeInTheDocument();
    expect(within(left).getByRole("button", { name: "Edit email address" })).toBeInTheDocument();
    expect(screen.getByTestId("auth-sketch")).toHaveAttribute("src", "/illustrations/auth/envelope-code.webp");
  });
  it("has the email heading and sentence, and still draws Get code via call as in the mockup", () => {
    mount({ channel: "email", identity: "siddharth@gmail.com" });
    expect(screen.getByRole("heading", { level: 1, name: "Verify your email address" })).toBeInTheDocument();
    expect(screen.getByText("Enter the 6-digit code sent to si••••••@gmail.com.")).toBeInTheDocument();
    expect(screen.getByText("Get code via call")).toBeInTheDocument();
  });
});
