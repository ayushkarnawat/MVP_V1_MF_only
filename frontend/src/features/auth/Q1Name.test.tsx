import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Q1Name } from "./Q1Name";

describe.each([
  ["desktop", false],
  ["mobile", true],
])("Q1Name (%s)", (_label, isMobile) => {
  it("shows the PAN copy and not the old subtext", () => {
    render(<Q1Name value="" onSubmit={vi.fn()} isMobile={isMobile} />);
    expect(screen.getByText("What should we call you?")).toBeInTheDocument();
    expect(screen.getByText("Type your name exactly as it is printed on your PAN card.")).toBeInTheDocument();
    expect(screen.getByLabelText("Full name as per PAN")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Full name as per PAN")).toBeInTheDocument();
    expect(screen.getByText("Initials are fine if your PAN card uses them.")).toBeInTheDocument();
    expect(screen.queryByText(/personalize your mutual fund summaries/i)).not.toBeInTheDocument();
  });

  it("blocks an invalid name with the validation message", () => {
    const onSubmit = vi.fn();
    render(<Q1Name value="" onSubmit={onSubmit} isMobile={isMobile} />);
    fireEvent.change(screen.getByLabelText("Full name as per PAN"), { target: { value: "Ayush 123" } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.getByRole("alert")).toHaveTextContent("Use letters, spaces, dots and apostrophes only.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a valid name", () => {
    const onSubmit = vi.fn();
    render(<Q1Name value="" onSubmit={onSubmit} isMobile={isMobile} />);
    fireEvent.change(screen.getByLabelText("Full name as per PAN"), { target: { value: "  D’Souza  " } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    expect(onSubmit).toHaveBeenCalledWith("D’Souza");
  });

  it("submits the collapsed-space name", () => {
    const onSubmit = vi.fn();
    render(<Q1Name value="" onSubmit={onSubmit} isMobile={isMobile} />);
    fireEvent.change(screen.getByLabelText("Full name as per PAN"), { target: { value: "Ramesh   K  Sharma" } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    expect(onSubmit).toHaveBeenCalledWith("Ramesh K Sharma");
  });

});
