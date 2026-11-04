import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountDetails } from "./AccountDetails";

function mount(over: Partial<Parameters<typeof AccountDetails>[0]> = {}) {
  const handlers = { onSubmit: vi.fn(), onBack: vi.fn() };
  render(<AccountDetails {...handlers} {...over} />);
  return handlers;
}
const name = () => screen.getByLabelText("Full name (as per PAN card)") as HTMLInputElement;
const email = () => screen.getByLabelText("Email address") as HTMLInputElement;
const fillBoth = (n = "Asha Rao", e = "asha@example.com") => {
  fireEvent.change(name(), { target: { value: n } });
  fireEvent.change(email(), { target: { value: e } });
};
const continueButton = () => screen.getByRole("button", { name: "Continue" });

describe("AccountDetails, sign-up screen 3 (task 6.10)", () => {
  it("has the step bar, the heading, the sub-line and the id card sketch", () => {
    mount();
    expect(screen.getByRole("group", { name: "Step 3 of 5" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByText("Tell us a few basic details to get started.")).toBeInTheDocument();
    expect(screen.getByTestId("auth-sketch")).toHaveAttribute("src", "/illustrations/auth/id-card.svg");
  });
  it("has the left headline with the accent and the PAN info card instead of a paragraph", () => {
    mount();
    const left = screen.getByTestId("auth-left-text");
    expect(within(left).getByRole("heading", { level: 2 })).toHaveTextContent("Let's start with the basics.");
    expect(within(left).getByRole("heading", { level: 3, name: "Why do we need your PAN name?" })).toBeInTheDocument();
    expect(within(left).getByText("It helps us correctly match your investments across your accounts and avoid duplicates.")).toBeInTheDocument();
  });
  it("has both fields with the designed placeholders and hints, and the email is not optional", () => {
    mount();
    expect(name()).toHaveAttribute("placeholder", "e.g. Siddharth Surve");
    expect(screen.getByText("Enter your name exactly as it appears on your PAN card.")).toBeInTheDocument();
    expect(email()).toHaveAttribute("placeholder", "e.g. siddharth@gmail.com");
    expect(screen.getByText("We'll use this for important updates about your account.")).toBeInTheDocument();
    expect(screen.queryByText(/optional/i)).toBeNull();
  });
  it("shows the encryption line and does not repeat the consent line", () => {
    mount();
    expect(screen.getByText("Your data is encrypted and protected.")).toBeInTheDocument();
    expect(screen.queryByText(/you agree to our/i)).toBeNull();
  });
  it("validates the name and the email, shows each message under its field and sends nothing", () => {
    const { onSubmit } = mount();
    fireEvent.click(continueButton());
    expect(screen.getByText("Enter your name as per PAN.")).toBeInTheDocument();
    expect(screen.getByText("Please enter your email address.")).toBeInTheDocument();
    fillBoth("A1!", "not-an-email");
    fireEvent.click(continueButton());
    expect(screen.getByText("Use letters, spaces, dots and apostrophes only.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(name()).toHaveAttribute("aria-invalid", "true");
  });
  it("submits the cleaned name and the trimmed email", async () => {
    const { onSubmit } = mount();
    fillBoth("  Asha   Rao ", "  asha@example.com ");
    fireEvent.click(continueButton());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: "Asha Rao", email: "asha@example.com" }));
  });
  it("comes back filled with the values typed before", () => {
    mount({ initialName: "Asha Rao", initialEmail: "asha@example.com" });
    expect(name().value).toBe("Asha Rao");
    expect(email().value).toBe("asha@example.com");
  });
  it("Back is in the top bar and calls onBack; leave onBack out and there is no Back", () => {
    const { onBack } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
  it("shows a server error from the flow", () => {
    mount({ error: "That email address is already in use." });
    expect(screen.getByRole("alert")).toHaveTextContent("That email address is already in use.");
  });
  it("name only (email already verified): the email is read-only and not validated, only the name is asked", async () => {
    const { onSubmit } = mount({ emailLocked: true, initialEmail: "asha@example.com", onBack: undefined });
    expect(email()).toHaveAttribute("readonly");
    expect(email().value).toBe("asha@example.com");
    expect(screen.getByText("This email address is verified.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    fireEvent.click(continueButton());
    expect(screen.getByText("Enter your name as per PAN.")).toBeInTheDocument();
    fireEvent.change(name(), { target: { value: "Asha Rao" } });
    fireEvent.click(continueButton());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: "Asha Rao", email: "asha@example.com" }));
  });
  it("a rejected save shows its message and lets the person try again", async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error("Name could not be saved.")).mockResolvedValue(undefined);
    mount({ onSubmit, emailLocked: true, initialEmail: "asha@example.com" });
    fireEvent.change(name(), { target: { value: "Asha Rao" } });
    fireEvent.click(continueButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Name could not be saved.");
    fireEvent.click(continueButton());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
  });
  it("a double click while saving sends one request", async () => {
    let finish: () => void = () => {};
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    mount({ onSubmit });
    fillBoth();
    fireEvent.click(continueButton());
    await waitFor(() => expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Saving..." }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    finish();
  });
});
