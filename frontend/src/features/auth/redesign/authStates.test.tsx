import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountDetails } from "./AccountDetails";
import { LoginCode } from "./LoginCode";
import { LoginEntry } from "./LoginEntry";
import { SegmentedTabs } from "./SegmentedTabs";
import { SignupPhoneEntry } from "./SignupPhoneEntry";

const noop = vi.fn();

describe("focus goes to the first invalid field on submit (UI round 2, S6 task 6.15)", () => {
  it("login, Email tab", () => {
    render(<LoginEntry error={null} submitting={false} onSubmitEmail={noop} onSubmitPhone={noop} onSignUp={noop} />);
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Email address"));
    expect(screen.getByLabelText("Email address")).toHaveAttribute("aria-invalid", "true");
  });
  it("login, Mobile number tab", () => {
    render(<LoginEntry error={null} submitting={false} initialTab="phone" onSubmitEmail={noop} onSubmitPhone={noop} onSignUp={noop} />);
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Mobile number"));
  });
  it("sign-up screen 1", () => {
    render(<SignupPhoneEntry error={null} submitting={false} legalReady onSubmit={noop} onLogin={noop} />);
    fireEvent.click(screen.getByRole("button", { name: "Get OTP" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Mobile number"));
  });
  it("screen 3: the name first, then the email", () => {
    render(<AccountDetails onSubmit={noop} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Full name (as per PAN card)"));
    fireEvent.change(screen.getByLabelText("Full name (as per PAN card)"), { target: { value: "Asha Rao" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Email address"));
  });
});

describe("the tabs know their panel (UI round 2, S6 task 6.15)", () => {
  it("the selected tab points to the panel and every tab has an id", () => {
    render(
      <>
        <SegmentedTabs label="Log in with" panelId="p" options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} value="a" onChange={noop} />
        <div id="p" role="tabpanel" />
      </>,
    );
    const [first, second] = screen.getAllByRole("tab");
    expect(first).toHaveAttribute("id", "p-tab-a");
    expect(second).toHaveAttribute("id", "p-tab-b");
    expect(first).toHaveAttribute("aria-controls", "p");
    expect(second).not.toHaveAttribute("aria-controls");
  });
  it("without a panelId nothing changes", () => {
    render(<SegmentedTabs label="x" options={[{ value: "a", label: "A" }]} value="a" onChange={noop} />);
    expect(screen.getByRole("tab")).not.toHaveAttribute("id");
    expect(screen.getByRole("tab")).not.toHaveAttribute("aria-controls");
  });
  it("on the login screen the field sits inside the panel the selected tab controls", () => {
    render(<LoginEntry error={null} submitting={false} onSubmitEmail={noop} onSubmitPhone={noop} onSignUp={noop} />);
    const tab = screen.getByRole("tab", { name: "Email" });
    const panel = document.getElementById(tab.getAttribute("aria-controls")!)!;
    expect(panel).toHaveAttribute("role", "tabpanel");
    expect(within(panel).getByLabelText("Email address")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Mobile number" }));
    expect(within(document.getElementById("login-panel")!).getByLabelText("Mobile number")).toBeInTheDocument();
  });
});

describe("states use the shared alert and the same words (UI round 2, S6 task 6.15)", () => {
  it("screen 3 says Sending... while a code is being requested, and Saving... while a name is being saved", () => {
    render(<AccountDetails onSubmit={noop} submitting />);
    expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
  });
  it.each([
    ["wrong code", "That code didn't work. Try again."],
    ["expired code", "That code has expired. Request a new one."],
    ["too many attempts", "Too many attempts. Try again in a few minutes."],
    ["resend too soon", "Please wait 60 seconds before asking for another code."],
    ["send failed", "Couldn't send the code. Try again."],
  ])("a server error on a code screen (%s) is one announced alert with the server's words", (_name, message) => {
    render(<LoginCode channel="email" identity="siddharth@gmail.com" devOtp={null} error={message} submitting={false} onSubmit={noop} onResend={noop} onBack={noop} onEditIdentity={noop} />);
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(message);
  });
  it("the verify button says Verifying code... while submitting", () => {
    render(<LoginCode channel="phone" identity="+919876543210" devOtp={null} error={null} submitting onSubmit={noop} onResend={noop} onBack={noop} onEditIdentity={noop} />);
    expect(screen.getByRole("button", { name: "Verifying code..." })).toBeDisabled();
  });
  it("no account found on login is an alert with a Sign up shortcut", () => {
    const onSignUp = vi.fn();
    render(<LoginEntry error="No account found for this email. Sign up instead." submitting={false} onSubmitEmail={noop} onSubmitPhone={noop} onSignUp={onSignUp} />);
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Sign up" }));
    expect(onSignUp).toHaveBeenCalledTimes(1);
  });
});
