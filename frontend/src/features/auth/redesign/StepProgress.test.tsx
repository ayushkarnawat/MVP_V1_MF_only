import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StepProgress } from "./StepProgress";

const filled = () => screen.getAllByTestId("step-segment").filter(segment => segment.getAttribute("data-filled") === "true").length;

describe("StepProgress", () => {
  it("shows Step 2 of 5 with two filled segments out of five", () => {
    render(<StepProgress step={2} />);
    expect(screen.getByText("Step 2 of 5")).toBeInTheDocument();
    expect(screen.getAllByTestId("step-segment")).toHaveLength(5);
    expect(filled()).toBe(2);
  });
  it("shows Done with all five segments full", () => {
    render(<StepProgress step={5} done />);
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.queryByText(/Step/)).toBeNull();
    expect(filled()).toBe(5);
  });
  it("never says of 6", () => {
    for (const step of [1, 2, 3, 4, 5]) {
      const { unmount } = render(<StepProgress step={step} />);
      expect(screen.queryByText(/of 6/)).toBeNull();
      unmount();
    }
  });
  it("keeps the step inside 1 to 5", () => {
    const { unmount } = render(<StepProgress step={9} />);
    expect(screen.getByText("Step 5 of 5")).toBeInTheDocument();
    unmount();
    render(<StepProgress step={0} />);
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
  });
  it("has an accessible name for the whole bar", () => {
    render(<StepProgress step={3} />);
    expect(screen.getByRole("group", { name: "Step 3 of 5" })).toBeInTheDocument();
  });
});
