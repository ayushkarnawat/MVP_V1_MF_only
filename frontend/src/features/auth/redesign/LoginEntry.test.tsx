import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { validateEmail, validateIndianPhone } from "../validation";
import { LoginEntry } from "./LoginEntry";

vi.mock("../GoogleButton", () => ({
  GoogleButton: ({ onCredential }: { onCredential: (token: string) => void }) => (
    <button type="button" onClick={() => onCredential("google-token")}>Continue with Google</button>
  ),
}));

function mount(over: Partial<Parameters<typeof LoginEntry>[0]> = {}) {
  const handlers = { onSubmitEmail: vi.fn(), onSubmitPhone: vi.fn(), onSignUp: vi.fn() };
  render(<LoginEntry error={null} submitting={false} {...handlers} {...over} />);
  return handlers;
}
const email = () => screen.getByLabelText("Email address");
const phone = () => screen.getByLabelText("Mobile number");
const tab = (name: string) => screen.getByRole("tab", { name });
const getOtp = () => screen.getByRole("button", { name: "Get OTP" });

describe("LoginEntry: the right panel", () => {
  it("opens on the Email tab with the heading, the sub line, the field and Get OTP", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByText("Log in to continue to your Unifolio account.")).toBeInTheDocument();
    expect(tab("Email")).toHaveAttribute("aria-selected", "true");
    expect(tab("Mobile number")).toHaveAttribute("aria-selected", "false");
    expect(email()).toHaveAttribute("placeholder", "you@example.com");
    expect(getOtp()).toBeInTheDocument();
    expect(screen.getByText("OR")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign up →/ })).toBeInTheDocument();
  });
  it("has no step bar (login has none)", () => {
    mount();
    expect(screen.queryByText(/Step \d of 5/)).toBeNull();
  });
  it("submitting an email calls onSubmitEmail with the trimmed address", () => {
    const { onSubmitEmail, onSubmitPhone } = mount();
    fireEvent.change(email(), { target: { value: "  asha@example.com " } });
    fireEvent.click(getOtp());
    expect(onSubmitEmail).toHaveBeenCalledWith("asha@example.com");
    expect(onSubmitPhone).not.toHaveBeenCalled();
  });
  it("a bad email shows the validator's message inline and sends nothing", () => {
    const { onSubmitEmail } = mount();
    fireEvent.change(email(), { target: { value: "not-an-email" } });
    fireEvent.click(getOtp());
    expect(screen.getByRole("alert")).toHaveTextContent(validateEmail("not-an-email").error as string);
    expect(onSubmitEmail).not.toHaveBeenCalled();
  });
  it("the Mobile number tab asks for a number and submits the normalised phone", () => {
    const { onSubmitEmail, onSubmitPhone } = mount();
    fireEvent.click(tab("Mobile number"));
    expect(tab("Mobile number")).toHaveAttribute("aria-selected", "true");
    fireEvent.change(phone(), { target: { value: "98765 43210" } });
    fireEvent.click(getOtp());
    expect(onSubmitPhone).toHaveBeenCalledWith(validateIndianPhone("98765 43210").normalized);
    expect(onSubmitEmail).not.toHaveBeenCalled();
  });
  it("a bad number shows the validator's message inline and sends nothing", () => {
    const { onSubmitPhone } = mount();
    fireEvent.click(tab("Mobile number"));
    fireEvent.change(phone(), { target: { value: "123" } });
    fireEvent.click(getOtp());
    expect(screen.getByRole("alert")).toHaveTextContent(validateIndianPhone("123").error as string);
    expect(onSubmitPhone).not.toHaveBeenCalled();
  });
  it("switching tabs keeps what was typed in each and clears the inline error", () => {
    mount();
    fireEvent.change(email(), { target: { value: "x@y" } });
    fireEvent.click(getOtp());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(tab("Mobile number"));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.change(phone(), { target: { value: "98765 43210" } });
    fireEvent.click(tab("Email"));
    expect(email()).toHaveValue("x@y");
    fireEvent.click(tab("Mobile number"));
    expect(phone()).toHaveValue("98765 43210");
  });
  it("starts on the tab and value it is given (Edit from the code screen returns here)", () => {
    mount({ initialTab: "phone", initialValue: "+91 98765 43210" });
    expect(tab("Mobile number")).toHaveAttribute("aria-selected", "true");
    expect(phone()).toHaveValue("+91 98765 43210");
  });
  it("shows the server's message as an announced alert", () => {
    mount({ error: "Couldn't send the code. Try again." });
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't send the code. Try again.");
  });
  it("no account found shows the alert with a Sign up shortcut", () => {
    const { onSignUp } = mount({ error: "No account found for this email. Sign up instead." });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No account found for this email. Sign up instead.");
    fireEvent.click(within(alert).getByRole("button", { name: "Sign up" }));
    expect(onSignUp).toHaveBeenCalledTimes(1);
  });
  it("shows Sending... and disables Get OTP while submitting", () => {
    mount({ submitting: true });
    expect(screen.getByRole("button", { name: /Sending\.\.\./ })).toBeDisabled();
  });
  it("Back and the Sign up link both go to sign-up screen 1", () => {
    const { onSignUp } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: /Sign up →/ }));
    expect(onSignUp).toHaveBeenCalledTimes(2);
  });
  it("shows a sign-in notice (for example after being signed out) as a polite status", () => {
    mount({ notice: "You were signed out. Log in again to continue." });
    expect(screen.getByRole("status")).toHaveTextContent("You were signed out. Log in again to continue.");
  });
  it("has no Google button by default", () => {
    mount();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
  });
  it("draws the Google button only when the setting is on, and passes its token on", () => {
    const onGoogleCredential = vi.fn();
    mount({ showGoogle: true, onGoogleCredential });
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(onGoogleCredential).toHaveBeenCalledWith("google-token");
  });
});

describe("LoginEntry: the left panel (login 1 copy slide)", () => {
  it("has the headline, the paragraph and the three feature rows, left-aligned", () => {
    mount();
    const block = screen.getByTestId("auth-left-text");
    expect(block.className).toContain("text-left");
    expect(within(block).getByRole("heading", { level: 2 })).toHaveTextContent("One dashboard for your family's financial life");
    expect(within(block).getByText("financial life").tagName).toBe("SPAN");
    expect(within(block).getByText("Pick up where you left off.")).toBeInTheDocument();
    expect(within(block).getByText("All your investments")).toBeInTheDocument();
    expect(within(block).getByText("Mutual funds, stocks, PMS, real estate, gold and more.")).toBeInTheDocument();
    expect(within(block).getByText("Insights that matter")).toBeInTheDocument();
    expect(within(block).getByText("Understand performance, uncover overlap and spot potential risks.")).toBeInTheDocument();
    expect(within(block).getByText("Your family's wealth, together")).toBeInTheDocument();
    expect(within(block).getByText("See your family's investments in one place.")).toBeInTheDocument();
  });
  it("draws the laptop sketch", () => {
    mount();
    expect(screen.getByTestId("auth-sketch")).toHaveAttribute("src", "/illustrations/auth/laptop-assets.webp");
  });
});
