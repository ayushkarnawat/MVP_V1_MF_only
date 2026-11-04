import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SegmentedTabs } from "./SegmentedTabs";

const OPTIONS = [{ value: "email", label: "Email" }, { value: "phone", label: "Mobile number" }] as const;
const mount = (value: "email" | "phone" = "email", onChange = vi.fn()) => {
  render(<SegmentedTabs label="Log in with" options={OPTIONS} value={value} onChange={onChange} />);
  return onChange;
};

describe("SegmentedTabs", () => {
  it("is a tablist with the chosen tab selected", () => {
    mount("phone");
    expect(screen.getByRole("tablist", { name: "Log in with" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Email" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Mobile number" })).toHaveAttribute("aria-selected", "true");
  });
  it("only the selected tab is in the tab order", () => {
    mount("email");
    expect(screen.getByRole("tab", { name: "Email" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Mobile number" })).toHaveAttribute("tabindex", "-1");
  });
  it("a click changes the value", () => {
    const onChange = mount("email");
    fireEvent.click(screen.getByRole("tab", { name: "Mobile number" }));
    expect(onChange).toHaveBeenCalledWith("phone");
  });
  it("arrow keys move to the other tab and Home and End jump", () => {
    const onChange = mount("email");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Email" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("phone");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Email" }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("phone");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Email" }), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("phone");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Mobile number" }), { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("email");
  });
  it("renders an icon for tabs when provided", () => {
    const opts = [
      { value: "email", label: "Email", icon: <svg data-testid="icon-email" /> },
      { value: "phone", label: "Mobile number", icon: <svg data-testid="icon-phone" /> },
    ];
    render(<SegmentedTabs label="Log in with" options={opts} value="email" onChange={vi.fn()} />);
    expect(screen.getByTestId("icon-email")).toBeInTheDocument();
    expect(screen.getByTestId("icon-phone")).toBeInTheDocument();
  });
});
