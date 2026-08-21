import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TransitionPanel } from "./transition-panel";

describe("TransitionPanel", () => {
  it("renders active element from an array of children", () => {
    const { rerender } = render(
      <TransitionPanel activeIndex={0}>
        <div key="c1">Child 1</div>
        <div key="c2">Child 2</div>
        <div key="c3">Child 3</div>
      </TransitionPanel>
    );

    expect(screen.getByText("Child 1")).toBeInTheDocument();

    rerender(
      <TransitionPanel activeIndex={1}>
        <div key="c1">Child 1</div>
        <div key="c2">Child 2</div>
        <div key="c3">Child 3</div>
      </TransitionPanel>
    );

    expect(screen.getByText("Child 2")).toBeInTheDocument();
  });

  it("renders single dynamic child with activeIndex key", () => {
    const { rerender } = render(
      <TransitionPanel activeIndex={0}>
        <div>Dynamic Content A</div>
      </TransitionPanel>
    );

    expect(screen.getByText("Dynamic Content A")).toBeInTheDocument();

    rerender(
      <TransitionPanel activeIndex={1}>
        <div>Dynamic Content B</div>
      </TransitionPanel>
    );

    expect(screen.getByText("Dynamic Content B")).toBeInTheDocument();
  });
});
