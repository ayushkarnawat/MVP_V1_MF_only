import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmailCode } from "./EmailCode";

function mount(over: Partial<Parameters<typeof EmailCode>[0]> = {}) {
  const handlers = { onSubmit: vi.fn(), onResend: vi.fn(), onBack: vi.fn(), onEditEmail: vi.fn() };
  render(<EmailCode email="siddharth@gmail.com" devOtp={null} error={null} submitting={false} {...handlers} {...over} />);
  return handlers;
}
const fill = (code: string) => {
  const cells = screen.getAllByRole("textbox");
  [...code].forEach((digit, index) => fireEvent.change(cells[index], { target: { value: digit } }));
};

describe("EmailCode, sign-up screen 3b (task 6.10)", () => {
  it("has the left panel with the masked address and Edit email address, and the envelope sketch", () => {
    mount();
    const left = screen.getByTestId("auth-left-text");
    expect(within(left).getByRole("heading", { level: 2, name: "Almost there." })).toBeInTheDocument();
    expect(within(left).getByText("Confirm your email so we can keep your account secure and send you important updates.")).toBeInTheDocument();
    expect(within(left).getByText("si••••••@gmail.com")).toBeInTheDocument();
    expect(within(left).getByRole("button", { name: "Edit email address" })).toBeInTheDocument();
    expect(screen.getByTestId("auth-sketch")).toHaveAttribute("src", "/illustrations/auth/envelope.svg");
  });
  it("still says Step 3 of 5, because the email check is a sub-step of step 3", () => {
    mount();
    expect(screen.getByRole("group", { name: "Step 3 of 5" })).toBeInTheDocument();
  });
  it("has the code panel, six cells, the countdown, and no Get code via call", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Verify your email address" })).toBeInTheDocument();
    expect(screen.getByText("Enter the 6-digit code sent to si••••••@gmail.com.")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Verify & Continue" })).toBeInTheDocument();
    expect(screen.getByText(/Resend code in 01:00/)).toBeInTheDocument();
    expect(screen.queryByText("Get code via call")).toBeNull();
  });
  it("Back and Edit email address both return to screen 3", () => {
    const { onBack, onEditEmail } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit email address" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onEditEmail).toHaveBeenCalledTimes(1);
  });
  it("submits a full code and shows a server error", () => {
    const { onSubmit } = mount({ error: "That code didn't work. Try again." });
    expect(screen.getByRole("alert")).toHaveTextContent("That code didn't work.");
    fill("123456");
    fireEvent.click(screen.getByRole("button", { name: "Verify & Continue" }));
    expect(onSubmit).toHaveBeenCalledWith("123456");
  });
  it("shows the test code strip when the backend returns one", () => {
    mount({ devOtp: "654321" });
    expect(screen.getByText(/654 321/)).toBeInTheDocument();
  });
});
