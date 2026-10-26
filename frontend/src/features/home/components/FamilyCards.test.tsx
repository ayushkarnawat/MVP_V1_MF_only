import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../fixtures";
import type { AllocationResponse } from "../types";
import { FamilyCards } from "./FamilyCards";

const members = () => fixture<AllocationResponse>("allocation_family").members!;
const ASHA = "81e5a369-bbd4-59f1-b480-8a5bbf1c74ef";
const DEV = "e6b4557c-b0e3-58f9-8642-54da2db3a27d";

describe("FamilyCards", () => {
  it("shows the caption and the hint", () => {
    render(<FamilyCards members={members()} onSelectMember={() => {}} />);
    expect(screen.getByText("By family member")).toBeInTheDocument();
    expect(screen.getByText("Tap a member to view their portfolio")).toBeInTheDocument();
  });

  it("draws a stacked bar with one segment per member, as wide as the member's share", () => {
    render(<FamilyCards members={members()} onSelectMember={() => {}} />);
    const bar = screen.getByTestId("family-bar");
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    const first = screen.getByTestId("family-segment-0");
    const second = screen.getByTestId("family-segment-1");
    expect(first.style.width).toBe("42.21%");
    expect(second.style.width).toBe("57.79%");
    expect(first.getAttribute("data-color")).toBe("var(--c1)");
    expect(second.getAttribute("data-color")).toBe("var(--c2)");
  });

  it("has one row per member with an avatar, a title-case name, the value and the share", () => {
    render(<FamilyCards members={members()} onSelectMember={() => {}} />);
    const asha = screen.getByTestId(`family-row-${ASHA}`);
    expect(within(asha).getByTestId(`family-avatar-${ASHA}`).textContent).toBe("A");
    expect(asha.textContent).toContain("Asha Rao");
    expect(asha.textContent).toContain("₹2,200");
    expect(asha.textContent).toContain("42.2% of family");
    const dev = screen.getByTestId(`family-row-${DEV}`);
    expect(within(dev).getByTestId(`family-avatar-${DEV}`).textContent).toBe("D");
    expect(dev.textContent).toContain("Dev Rao");
    expect(dev.textContent).toContain("₹3,012");
    expect(dev.textContent).toContain("57.8% of family");
  });

  it("colours each avatar like its bar segment", () => {
    render(<FamilyCards members={members()} onSelectMember={() => {}} />);
    expect(screen.getByTestId(`family-avatar-${ASHA}`).getAttribute("data-color")).toBe("var(--c1)");
    expect(screen.getByTestId(`family-avatar-${DEV}`).getAttribute("data-color")).toBe("var(--c2)");
  });

  it("keeps the members in the order given", () => {
    render(<FamilyCards members={[...members()].reverse()} onSelectMember={() => {}} />);
    const rows = screen.getAllByTestId(/^family-row-/);
    expect(rows[0].getAttribute("data-testid")).toBe(`family-row-${DEV}`);
  });

  it("selects a member on click, Enter and Space, and says 'View' on the row", () => {
    const onSelectMember = vi.fn();
    render(<FamilyCards members={members()} onSelectMember={onSelectMember} />);
    const row = screen.getByTestId(`family-row-${DEV}`);
    expect(row.getAttribute("role")).toBe("button");
    expect(row.getAttribute("tabindex")).toBe("0");
    expect(row.textContent).toContain("View");
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: "Enter" });
    const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    row.dispatchEvent(space);
    expect(onSelectMember).toHaveBeenCalledTimes(3);
    expect(onSelectMember).toHaveBeenLastCalledWith(DEV);
    expect(space.defaultPrevented).toBe(true);
    fireEvent.keyDown(row, { key: "x" });
    expect(onSelectMember).toHaveBeenCalledTimes(3);
  });

  it("gives every row an accessible name with the member and the share", () => {
    render(<FamilyCards members={members()} onSelectMember={() => {}} />);
    expect(screen.getByRole("button", { name: /Dev Rao/ })).toBeInTheDocument();
  });

  it("handles zero value members (a household with nothing imported yet)", () => {
    const zero = fixture<AllocationResponse>("allocation_empty").members!;
    render(<FamilyCards members={zero} onSelectMember={() => {}} />);
    expect(screen.getByTestId("family-segment-0").style.width).toBe("0%");
    expect(screen.getByTestId(`family-row-${ASHA}`).textContent).toContain("₹0");
    expect(screen.getByTestId(`family-row-${ASHA}`).textContent).toContain("0.0% of family");
  });

  it("uses palette variables only", () => {
    const { container } = render(<FamilyCards members={members()} onSelectMember={() => {}} />);
    expect(container.innerHTML).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
  });
});
