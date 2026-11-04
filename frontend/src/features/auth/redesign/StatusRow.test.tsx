import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusRow } from "./StatusRow";

describe("StatusRow", () => {
  it("shows the label, its line and the state", () => {
    render(<StatusRow label="Accounts connected" description="Your mutual funds are linked." state="done" />);
    expect(screen.getByText("Accounts connected")).toBeInTheDocument();
    expect(screen.getByText("Your mutual funds are linked.")).toBeInTheDocument();
    expect(screen.getByTestId("status-row")).toHaveAttribute("data-state", "done");
  });
  it("says the state in words for a screen reader", () => {
    const { rerender } = render(<StatusRow label="Preparing your dashboard" state="pending" />);
    expect(screen.getByText("Not started")).toHaveClass("sr-only");
    rerender(<StatusRow label="Preparing your dashboard" state="active" />);
    expect(screen.getByText("In progress")).toHaveClass("sr-only");
    rerender(<StatusRow label="Preparing your dashboard" state="done" />);
    expect(screen.getByText("Done")).toHaveClass("sr-only");
  });
});
