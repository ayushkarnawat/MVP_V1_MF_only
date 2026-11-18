import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
  it("done row has green check circle, active row has spinner, pending has neither", () => {
    const { rerender } = render(<StatusRow label="Item" state="done" />);
    const doneRow = screen.getByTestId("status-row");
    expect(doneRow.querySelector("svg")).toBeInTheDocument();
    expect(doneRow.querySelector(".animate-spin")).toBeNull();

    rerender(<StatusRow label="Item" state="active" />);
    const activeRow = screen.getByTestId("status-row");
    expect(activeRow.querySelector(".animate-spin")).toBeInTheDocument();

    rerender(<StatusRow label="Item" state="pending" />);
    const pendingRow = screen.getByTestId("status-row");
    expect(pendingRow.querySelector("svg")).toBeNull();
    expect(pendingRow.querySelector(".animate-spin")).toBeNull();
  });
});

// Batch B item 6 (B-10): a row that has just turned done gets a one-off pop on its check circle (class auth-tick-pop, keyframe in
// auth-tokens.css). A row that is done from the start does not pop, and nothing pops when the person asked for reduced motion.
describe("StatusRow: the pop when a row turns done (Batch B, item 6)", () => {
  const reduce = (on: boolean) => Object.defineProperty(window, "matchMedia", {
    configurable: true, writable: true,
    value: (query: string) => ({ matches: on && query.includes("prefers-reduced-motion"), media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }),
  });
  afterEach(() => { Reflect.deleteProperty(window, "matchMedia"); });
  const pop = () => screen.getByTestId("status-row").querySelector(".auth-tick-pop");

  it("a row that turns from active to done pops, on the circle that holds the check", () => {
    const { rerender } = render(<StatusRow label="Item" state="active" />);
    expect(pop()).toBeNull();
    rerender(<StatusRow label="Item" state="done" />);
    expect(pop()).not.toBeNull();
    expect(pop()!.querySelector("svg")).not.toBeNull();
  });
  it("a row that is done from the first draw does not pop", () => {
    render(<StatusRow label="Item" state="done" />);
    expect(pop()).toBeNull();
  });
  it("a row that stays done does not pop again on later redraws", () => {
    const { rerender } = render(<StatusRow label="Item" state="active" />);
    rerender(<StatusRow label="Item" state="done" />);
    rerender(<StatusRow label="Item" description="changed text" state="done" />);
    expect(pop()).not.toBeNull(); // the class stays on the same circle; it is the animation that runs once
    expect(screen.getByTestId("status-row")).toHaveAttribute("data-state", "done");
  });
  it("a pending row that turns done pops too", () => {
    const { rerender } = render(<StatusRow label="Item" state="pending" />);
    rerender(<StatusRow label="Item" state="done" />);
    expect(pop()).not.toBeNull();
  });
  it("with reduced motion on the row turns done with no pop", () => {
    reduce(true);
    const { rerender } = render(<StatusRow label="Item" state="active" />);
    rerender(<StatusRow label="Item" state="done" />);
    expect(screen.getByTestId("status-row")).toHaveAttribute("data-state", "done");
    expect(pop()).toBeNull();
  });
  it("the spinner under reduced motion is still the static ring (the existing motion-reduce rule stays)", () => {
    render(<StatusRow label="Item" state="active" />);
    expect(screen.getByTestId("status-row").querySelector(".animate-spin")).toHaveClass("motion-reduce:animate-none");
  });
});
