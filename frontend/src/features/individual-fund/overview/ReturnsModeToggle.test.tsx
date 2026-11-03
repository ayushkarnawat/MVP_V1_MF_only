import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReturnsModeToggle } from "./ReturnsModeToggle";

const MODEL_INFO = "The fund's own track record, the same for every investor. It shows how the fund did against its benchmark and similar funds over each period.";
const ACTUAL_INFO = "How your own money in this fund has done, based on when and how much you invested. It only shows if you hold the fund, and is compared with the benchmark on the same dates.";

describe("ReturnsModeToggle (UI round 2, tasks 1.5 and 4.3)", () => {
  it("is the Returns basis group with the two new names, and the old names are gone", () => {
    render(<ReturnsModeToggle mode="inception" onChange={() => {}} />);
    expect(screen.getByRole("group", { name: "Returns basis" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Model Portfolio Returns" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Actual XIRR" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "Inception" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Current" })).toBeNull();
  });
  it("calls onChange with inception or current (the API's mode values)", () => {
    const onChange = vi.fn();
    render(<ReturnsModeToggle mode="inception" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Actual XIRR" }));
    expect(onChange).toHaveBeenCalledWith("current");
  });
  it("each name has an info icon with its own plain text", async () => {
    render(<ReturnsModeToggle mode="inception" onChange={() => {}} />);
    fireEvent.focus(screen.getByRole("button", { name: "About Model Portfolio Returns" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(MODEL_INFO);
    fireEvent.blur(screen.getByRole("button", { name: "About Model Portfolio Returns" }));
    fireEvent.focus(screen.getByRole("button", { name: "About Actual XIRR" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(ACTUAL_INFO);
  });
  it("clicking an info icon does not change the mode", () => {
    const onChange = vi.fn();
    render(<ReturnsModeToggle mode="inception" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "About Actual XIRR" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
