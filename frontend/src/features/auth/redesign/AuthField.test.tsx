import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthField } from "./AuthField";

describe("AuthField", () => {
  it("puts the label above and ties it to the input", () => {
    render(<AuthField id="name" label="Full name" />);
    expect(screen.getByLabelText("Full name")).toHaveAttribute("id", "name");
  });
  it("links the hint to the input", () => {
    render(<AuthField id="name" label="Full name" hint="Exactly as on your PAN card." />);
    expect(screen.getByLabelText("Full name")).toHaveAttribute("aria-describedby", "name-hint");
    expect(screen.getByText("Exactly as on your PAN card.")).toHaveAttribute("id", "name-hint");
  });
  it("shows an error as an announced alert, marks the input invalid and links both", () => {
    render(<AuthField id="email" label="Email" hint="We never share it." error="Enter a valid email." />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBe("email-error email-hint");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email.");
  });
  it("draws the shell with auth-field and passes input props through", () => {
    const onChange = vi.fn();
    render(<AuthField id="p" label="Mobile" placeholder="98765 43210" onChange={onChange} />);
    const input = screen.getByLabelText("Mobile");
    const shell = input.parentElement;
    expect(shell).toHaveClass("auth-field");
    fireEvent.change(input, { target: { value: "9" } });
    expect(onChange).toHaveBeenCalled();
    expect(input).toHaveAttribute("placeholder", "98765 43210");
  });
  it("draws an optional leading icon without changing the label", () => {
    render(<AuthField id="x" label="Email" icon={<i data-testid="icon" />} />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
});
