import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

describe("Segmented: an info icon per option (UI round 2, task 1.5)", () => {
  const WITH_INFO = [
    { value: "a", label: "Alpha", info: "About alpha in plain words." },
    { value: "b", label: "Beta" },
  ] as const;
  const mount = (onChange = vi.fn()) => render(<Segmented label="Pick one" options={WITH_INFO} value="a" onChange={onChange} />);

  it("an option without info renders as before", () => {
    mount();
    expect(screen.queryByRole("button", { name: "About Beta" })).toBeNull();
    expect(screen.getByRole("button", { name: "Beta" })).toBeInTheDocument();
  });
  it("an option with info gets a separate info button named About {label}", () => {
    mount();
    expect(screen.getByRole("button", { name: "About Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alpha" })).toBeInTheDocument();
  });
  it("the tooltip opens on hover, on focus and on click, and shows the text", async () => {
    mount();
    const info = screen.getByRole("button", { name: "About Alpha" });
    fireEvent.mouseEnter(info);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("About alpha in plain words.");
    fireEvent.mouseLeave(info);
    fireEvent.focus(info);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("About alpha in plain words.");
    fireEvent.blur(info);
    fireEvent.click(info);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("About alpha in plain words.");
  });
  it("Esc closes the tooltip", async () => {
    mount();
    const info = screen.getByRole("button", { name: "About Alpha" });
    fireEvent.focus(info);
    await screen.findByRole("tooltip");
    fireEvent.keyDown(info, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  });
  it("clicking the info button never calls onChange", () => {
    const onChange = vi.fn();
    mount(onChange);
    fireEvent.click(screen.getByRole("button", { name: "About Alpha" }));
    expect(onChange).not.toHaveBeenCalled();
  });
  it("the label button still changes the value", () => {
    const onChange = vi.fn();
    mount(onChange);
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
