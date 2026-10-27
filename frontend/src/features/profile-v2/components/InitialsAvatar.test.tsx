import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InitialsAvatar } from "./InitialsAvatar";

describe("InitialsAvatar", () => {
  it.each([
    ["Siddharth Surve", "SS"],
    ["Siddharth Surve (Me)", "SS"],
    ["Aditi", "A"],
    ["siddharth@example.in", "S"],
    ["", "?"],
    [null, "?"],
    [undefined, "?"],
  ])("shows the initials of %j as %j", (name, initials) => {
    render(<InitialsAvatar name={name} />);
    expect(screen.getByTestId("initials-avatar")).toHaveTextContent(initials);
    expect(screen.getByTestId("initials-avatar").textContent).toBe(initials);
  });

  it("is hidden from assistive technology (the name is always written next to it)", () => {
    render(<InitialsAvatar name="Siddharth Surve" />);
    expect(screen.getByTestId("initials-avatar")).toHaveAttribute("aria-hidden", "true");
  });

  it("is 40 px by default and takes any other size in pixels", () => {
    const { rerender } = render(<InitialsAvatar name="Siddharth Surve" />);
    expect(screen.getByTestId("initials-avatar")).toHaveStyle({ width: "40px", height: "40px" });
    rerender(<InitialsAvatar name="Siddharth Surve" size={76} />);
    expect(screen.getByTestId("initials-avatar")).toHaveStyle({ width: "76px", height: "76px" });
  });

  it.each([
    [undefined, "0", "bg-[var(--c1)]"],
    [1, "1", "bg-[var(--c2)]"],
    [3, "3", "bg-[var(--c4)]"],
    [5, "1", "bg-[var(--c2)]"],
    [-1, "3", "bg-[var(--c4)]"],
  ])("tone %s is colour %s: %s", (tone, index, colour) => {
    render(<InitialsAvatar name="Siddharth Surve" tone={tone} />);
    const avatar = screen.getByTestId("initials-avatar");
    expect(avatar).toHaveAttribute("data-tone", index);
    expect(avatar.className).toContain(colour);
  });
});
