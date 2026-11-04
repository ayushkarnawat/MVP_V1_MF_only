import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SignupPhoneEntry } from "./SignupPhoneEntry";

function mount(over: Partial<Parameters<typeof SignupPhoneEntry>[0]> = {}) {
  const handlers = { onSubmit: vi.fn(), onLogin: vi.fn(), onLegalRetry: vi.fn() };
  render(<SignupPhoneEntry error={null} submitting={false} legalReady {...handlers} {...over} />);
  return handlers;
}
const type = (value: string) => fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value } });

describe("SignupPhoneEntry, sign-up screen 1 (task 6.8)", () => {
  it("has the step bar, the heading and the line under it", () => {
    mount();
    expect(screen.getByRole("group", { name: "Step 1 of 5" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Let's get started" })).toBeInTheDocument();
    expect(screen.getByText("Enter your mobile number to create your Unifolio account.")).toBeInTheDocument();
  });
  it("has the left panel: laptop sketch, the headline, the paragraph and the three rows", () => {
    mount();
    const left = screen.getByTestId("auth-left-text");
    expect(within(left).getByRole("heading", { level: 2 })).toHaveTextContent("One dashboard for your family's financial life");
    expect(within(left).getByText("Bring your family's investments together, uncover deeper insights, and make more informed financial decisions.")).toBeInTheDocument();
    for (const row of ["All your investments", "Insights that matter", "Your family's wealth, together"]) expect(within(left).getByText(row)).toBeInTheDocument();
    expect(screen.getByTestId("auth-sketch")).toHaveAttribute("src", "/illustrations/auth/laptop-assets.webp");
  });
  it("the country part is a fixed +91 with no drop-down", () => {
    mount();
    expect(screen.getByText("+91")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: /\+91/ })).toBeNull();
    expect(screen.getByLabelText("Mobile number")).toHaveAttribute("placeholder", "98765 43210");
  });
  it("shows the consent line once, linking the two public legal pages", () => {
    mount();
    expect(screen.getAllByText(/you agree to our/i)).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Terms & Conditions" })).toHaveAttribute("href", "/legal/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/legal/privacy");
  });
  it("Get OTP stays disabled until the documents have loaded", () => {
    mount({ legalReady: false });
    expect(screen.getByRole("button", { name: "Get OTP" })).toBeDisabled();
  });
  it("a load error for the documents offers Retry", () => {
    const { onLegalRetry } = mount({ legalReady: false, legalLoadError: true });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onLegalRetry).toHaveBeenCalledTimes(1);
  });
  it("submits the normalised number", () => {
    const { onSubmit } = mount();
    type("98765 43210");
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    expect(onSubmit).toHaveBeenCalledWith("+919876543210");
  });
  it("a bad number shows the validator's message under the field and sends nothing", () => {
    const { onSubmit } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter your mobile number.");
    type("12345");
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Mobile number")).toHaveAttribute("aria-invalid", "true");
  });
  it("an account-exists error shows the Log in instead shortcut", () => {
    const { onLogin } = mount({ error: "An account with this mobile number already exists." });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("already exists");
    fireEvent.click(within(alert).getByRole("button", { name: "Log in instead" }));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });
  it("any other server error has no shortcut", () => {
    mount({ error: "Couldn't send the code. Try again." });
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't send the code.");
    expect(screen.queryByRole("button", { name: "Log in instead" })).toBeNull();
  });
  it("has no Back, and Already have an account? Log in goes to login", () => {
    const { onLogin } = mount();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.getByText(/Already have an account\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });
  it("comes back filled when the number was typed before", () => {
    mount({ initialValue: "+919876543210" });
    expect((screen.getByLabelText("Mobile number") as HTMLInputElement).value).toBe("9876543210");
  });
  it("says Sending... and is disabled while sending", () => {
    mount({ submitting: true });
    expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
  });
});
