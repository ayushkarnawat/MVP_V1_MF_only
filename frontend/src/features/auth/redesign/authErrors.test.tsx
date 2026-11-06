import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import authTokensCss from "@/styles/auth-tokens.css?raw";
import alertSource from "./AuthAlert.tsx?raw";
import fieldSource from "./AuthField.tsx?raw";
import profileSource from "./InvestorProfile.tsx?raw";
import phoneSource from "./SignupPhoneEntry.tsx?raw";
import { AuthAlert } from "./AuthAlert";
import { AuthField } from "./AuthField";
import { AuthInlineError } from "./AuthInlineError";
import { InvestorProfile } from "./InvestorProfile";

const options = () => within(screen.getByRole("radiogroup", { name: "How do you usually invest?" })).getAllByRole("radio");
const goalBoxes = () => within(screen.getByRole("group", { name: "What are you working towards?" })).getAllByRole("checkbox");
const next = () => fireEvent.click(screen.getByRole("button", { name: "Continue" }));
const mount = () => render(<InvestorProfile onSubmit={vi.fn()} onBack={vi.fn()} />);
const invalid = (nodes: HTMLElement[]) => nodes.map((node) => node.getAttribute("data-invalid"));

describe("auth error colours do not depend on the app theme (QA fixes, B1)", () => {
  it("auth-tokens.css defines the three error tokens once, in the light root block", () => {
    expect(authTokensCss).toMatch(/--auth-error:\s*#B42318/i);
    expect(authTokensCss).toMatch(/--auth-error-bg:\s*#FEF3F2/i);
    expect(authTokensCss).toMatch(/--auth-error-line:\s*#FDA29B/i);
    expect(authTokensCss.match(/--auth-error:/g)).toHaveLength(1);
    expect(authTokensCss).not.toMatch(/prefers-color-scheme[^{]*\{[^}]*--auth-error/);
  });
  it("the invalid field border and the invalid choice outline use them", () => {
    expect(authTokensCss).toMatch(/\.auth-field\[data-invalid="true"\]\s*\{[^}]*var\(--auth-error\)/);
    expect(authTokensCss).toMatch(/\.auth-choice\[data-invalid="true"\]\s*\{[^}]*var\(--auth-error-line\)/);
    expect(authTokensCss).toMatch(/\.auth-inline-error\s*\{[^}]*var\(--auth-error\)[^}]*\}/);
    expect(authTokensCss).toMatch(/\.auth-inline-error\s*\{[^}]*var\(--auth-error-bg\)/);
    expect(authTokensCss).toMatch(/\.auth-inline-error\s*\{[^}]*var\(--auth-error-line\)/);
  });
  it("no sign-up or sign-in error component reads the app's --neg-text any more", () => {
    for (const source of [alertSource, fieldSource, profileSource, phoneSource, authTokensCss]) expect(source).not.toContain("--neg-text");
  });
});

describe("AuthInlineError", () => {
  it("is an announced alert with an icon, the message as its only text, and the id it is given", () => {
    render(<AuthInlineError id="x-error">Choose one.</AuthInlineError>);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("id", "x-error");
    expect(alert).toHaveAttribute("data-testid", "auth-inline-error");
    expect(alert.className).toContain("auth-inline-error");
    expect(alert.textContent).toBe("Choose one.");
    expect(alert.querySelector("svg")).not.toBeNull();
    expect(alert.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("AuthAlert and AuthField use the auth error tokens", () => {
  it("the error tone reads the three tokens, the info tone is unchanged", () => {
    const { container, rerender } = render(<AuthAlert tone="error">No account found.</AuthAlert>);
    const errorClass = (container.firstElementChild as HTMLElement).className;
    expect(errorClass).toContain("var(--auth-error-line)");
    expect(errorClass).toContain("var(--auth-error-bg)");
    expect(errorClass).toContain("var(--auth-error)");
    rerender(<AuthAlert tone="info">Code sent.</AuthAlert>);
    expect((container.firstElementChild as HTMLElement).className).toContain("var(--auth-step-on)");
  });
  it("a field error is an inline error that keeps its id and the description link", () => {
    render(<AuthField id="name" label="Full name" error="Enter your name." />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("id", "name-error");
    expect(alert.className).toContain("auth-inline-error");
    expect(alert.textContent).toBe("Enter your name.");
    expect(screen.getByLabelText("Full name")).toHaveAttribute("aria-describedby", "name-error");
    expect(screen.getByLabelText("Full name")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("InvestorProfile errors (QA fixes, B1)", () => {
  it("both errors are inline alerts with an icon, in order, and the first question still takes focus", () => {
    mount();
    next();
    const alerts = screen.getAllByTestId("auth-inline-error");
    expect(alerts.map((alert) => alert.textContent)).toEqual(["Choose how you usually invest.", "Choose at least one goal."]);
    for (const alert of alerts) {
      expect(alert).toHaveAttribute("role", "alert");
      expect(alert.querySelector("svg")).not.toBeNull();
    }
    expect(document.activeElement).toBe(options()[0]);
  });
  it("outlines every answer of a group that is missing an answer, and only that group", () => {
    mount();
    expect(invalid(options())).toEqual([null, null, null, null]);
    next();
    expect(invalid(options())).toEqual(["true", "true", "true", "true"]);
    expect(invalid(goalBoxes())).toEqual(["true", "true", "true", "true", "true", "true"]);
  });
  it("a group that is answered is not outlined", () => {
    mount();
    fireEvent.click(options()[1]);
    next();
    expect(invalid(options())).toEqual([null, null, null, null]);
    expect(invalid(goalBoxes())).toEqual(["true", "true", "true", "true", "true", "true"]);
    expect(document.activeElement).toBe(goalBoxes()[0]);
  });
  it("answering clears that group's error and its outline, and leaves the other group's", () => {
    mount();
    next();
    fireEvent.click(options()[0]);
    expect(invalid(options())).toEqual([null, null, null, null]);
    expect(screen.queryByText("Choose how you usually invest.")).toBeNull();
    expect(invalid(goalBoxes())[0]).toBe("true");
    fireEvent.click(goalBoxes()[0]);
    expect(invalid(goalBoxes())).toEqual([null, null, null, null, null, null]);
    expect(screen.queryByText("Choose at least one goal.")).toBeNull();
  });
  it("Select all also clears the goals error", () => {
    mount();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.queryByText("Choose at least one goal.")).toBeNull();
    expect(invalid(goalBoxes())).toEqual([null, null, null, null, null, null]);
  });
});
