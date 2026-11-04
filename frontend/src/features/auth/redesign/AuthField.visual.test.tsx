import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthField } from "./AuthField";

describe("AuthField (visual)", () => {
  it("renders an svg before the hint text by default", () => {
    render(<AuthField id="f1" label="Full name" hint="Exactly as on your PAN card." />);
    const hint = screen.getByText("Exactly as on your PAN card.");
    expect(hint).toHaveClass("auth-hint");
    const svg = hint.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("renders no svg when hintIcon is false", () => {
    render(<AuthField id="f2" label="Email" hint="We will use this for updates." hintIcon={false} />);
    const hint = screen.getByText("We will use this for updates.");
    expect(hint).toHaveClass("auth-hint");
    expect(hint.querySelector("svg")).toBeNull();
  });

  it("renders the shell with class auth-field and passes data-invalid on error", () => {
    const { rerender } = render(<AuthField id="f3" label="Phone" />);
    const input = screen.getByLabelText("Phone");
    const shell = input.parentElement;
    expect(shell).toHaveClass("auth-field");
    expect(shell).not.toHaveAttribute("data-invalid");

    rerender(<AuthField id="f3" label="Phone" error="Invalid phone number" />);
    expect(input.parentElement).toHaveAttribute("data-invalid", "true");
  });

  it("renders the leading icon inside the shell as its first child", () => {
    render(<AuthField id="f4" label="Email" icon={<span data-testid="field-icon">@</span>} />);
    const icon = screen.getByTestId("field-icon");
    const input = screen.getByLabelText("Email");
    const shell = input.parentElement;
    expect(shell).toHaveClass("auth-field");
    expect(shell?.firstElementChild).toBe(icon.parentElement ?? icon);
  });
});
