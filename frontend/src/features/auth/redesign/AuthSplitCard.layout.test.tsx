import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthSplitCard } from "./AuthSplitCard";

describe("AuthSplitCard on a tablet (UI round 2, S6 task 6.15)", () => {
  it("stacks the right panel above the sketch and headline below 1024 px, and puts them side by side from 1024 px", () => {
    render(<AuthSplitCard left={<p>left</p>} right={<p>right</p>} />);
    const left = screen.getByTestId("auth-left-slot");
    const right = screen.getByTestId("auth-right");
    expect(screen.getByTestId("auth-card")).toHaveClass("grid-cols-1");
    expect(right).toHaveClass("order-1", "lg:order-2");
    expect(left).toHaveClass("order-2", "lg:order-1");
  });
  it("keeps the reading order of the page: the left panel is still first in the markup", () => {
    render(<AuthSplitCard left={<p>left</p>} right={<p>right</p>} />);
    const left = screen.getByTestId("auth-left-slot");
    const right = screen.getByTestId("auth-right");
    expect(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
