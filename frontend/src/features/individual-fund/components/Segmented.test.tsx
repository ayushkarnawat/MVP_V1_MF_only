import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Segmented } from "./Segmented";

const OPTIONS = [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }, { value: "c", label: "Gamma" }] as const;

describe("Segmented", () => {
  it("is a named group of buttons in the given order", () => {
    render(<Segmented label="Pick one" options={OPTIONS} value="a" onChange={() => {}} />);
    const group = screen.getByRole("group", { name: "Pick one" });
    expect(within(group).getAllByRole("button").map(button => button.textContent)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("marks only the chosen button as pressed", () => {
    render(<Segmented label="Pick one" options={OPTIONS} value="b" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Alpha" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Beta" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Gamma" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onChange with the value of the clicked button", () => {
    const onChange = vi.fn();
    render(<Segmented label="Pick one" options={OPTIONS} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Gamma" }));
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("clicking the chosen button does nothing", () => {
    const onChange = vi.fn();
    render(<Segmented label="Pick one" options={OPTIONS} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("every button is type button, so it never submits a form", () => {
    render(<form onSubmit={e => e.preventDefault()}><Segmented label="Pick one" options={OPTIONS} value="a" onChange={() => {}} /></form>);
    expect(screen.getAllByRole("button").every(button => button.getAttribute("type") === "button")).toBe(true);
  });
});
