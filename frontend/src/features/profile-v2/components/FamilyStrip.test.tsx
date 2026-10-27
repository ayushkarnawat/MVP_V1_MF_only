import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HouseholdMember } from "@/features/auth/types";
import { HOUSEHOLD_FIXTURE, HOUSEHOLD_SOLO_FIXTURE } from "../fixtures/members";
import { FamilyStrip } from "./FamilyStrip";

const onManage = vi.fn();
const onAddStatement = vi.fn();
const onSelect = vi.fn();

function mount(members: readonly HouseholdMember[] = HOUSEHOLD_FIXTURE) {
  return render(<FamilyStrip members={members} onManage={onManage} onAddStatement={onAddStatement} onSelect={onSelect} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FamilyStrip: the heading", () => {
  it("is a card titled 'Family Account' with its one-line sub-title", () => {
    mount();
    const strip = screen.getByTestId("family-strip");
    expect(within(strip).getByRole("heading", { level: 2, name: "Family Account" })).toBeInTheDocument();
    expect(within(strip).getByText("Manage family members and their access")).toBeInTheDocument();
  });

  it("has a Manage Members button that calls onManage", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Manage Members" }));
    expect(onManage).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onAddStatement).not.toHaveBeenCalled();
  });
});

describe("FamilyStrip: the people", () => {
  it("shows one tile per member, in order, with the first name and no '(Me)'", () => {
    mount();
    const list = screen.getByRole("list", { name: "Family members" });
    expect(within(list).getAllByTestId("strip-name").map(name => name.textContent)).toEqual(["Siddharth", "Aditi", "Ramesh"]);
  });

  it("labels the self member Admin and the others Member, the Admin in the brand green text", () => {
    mount();
    const labels = screen.getAllByTestId("strip-label");
    expect(labels.map(label => label.textContent)).toEqual(["Admin", "Member", "Member"]);
    expect(labels[0]).toHaveClass("text-[var(--pos-text)]");
    expect(labels[1]).toHaveClass("text-[var(--ui-text-muted)]");
    expect(labels[2]).toHaveClass("text-[var(--ui-text-muted)]");
  });

  it("labels by relationship, not by position: a self member in the middle is still the only Admin", () => {
    mount([HOUSEHOLD_FIXTURE[1], HOUSEHOLD_FIXTURE[0], HOUSEHOLD_FIXTURE[2]]);
    expect(screen.getAllByTestId("strip-label").map(label => label.textContent)).toEqual(["Member", "Admin", "Member"]);
  });

  it("draws an initials avatar per person, hidden from assistive technology, each in its own colour by position", () => {
    mount();
    const list = screen.getByRole("list", { name: "Family members" });
    const avatars = within(list).getAllByTestId("initials-avatar");
    expect(avatars.map(avatar => avatar.textContent)).toEqual(["SS", "AS", "RS"]);
    expect(avatars.map(avatar => avatar.getAttribute("data-tone"))).toEqual(["0", "1", "2"]);
    for (const avatar of avatars) expect(avatar).toHaveAttribute("aria-hidden", "true");
  });

  it("each person is a button named 'Show <name> in the list' that calls onSelect with that member's id", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Show Aditi Surve in the list" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("m-spouse");
    fireEvent.click(screen.getByRole("button", { name: "Show Siddharth Surve in the list" }));
    expect(onSelect).toHaveBeenLastCalledWith("m-self");
    expect(screen.getAllByTestId("strip-member")).toHaveLength(3);
  });

  it("a one-person household shows that person and the Add statement tile", () => {
    mount(HOUSEHOLD_SOLO_FIXTURE);
    expect(screen.getAllByTestId("strip-member")).toHaveLength(1);
    expect(screen.getByTestId("add-statement-tile")).toBeInTheDocument();
  });
});

describe("FamilyStrip: the Add statement tile", () => {
  it("is the last tile, dashed, a button named 'Add statement' with the caption 'For a family member'", () => {
    mount();
    const tile = screen.getByTestId("add-statement-tile");
    expect(tile.tagName).toBe("BUTTON");
    expect(tile).toHaveAccessibleName("Add statement");
    expect(tile).toHaveTextContent("Add statement");
    expect(tile).toHaveTextContent("For a family member");
    expect(tile.innerHTML).toContain("border-dashed");
    const items = within(screen.getByRole("list", { name: "Family members" })).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[3]).toContainElement(tile);
  });

  it("calls onAddStatement when pressed", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Add statement" }));
    expect(onAddStatement).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("is the only tile with no members: the strip never offers Add Member", () => {
    mount([]);
    expect(screen.queryAllByTestId("strip-member")).toHaveLength(0);
    expect(screen.getByTestId("add-statement-tile")).toBeInTheDocument();
    expect(screen.queryByText(/add member/i)).not.toBeInTheDocument();
  });

  it("its icon is hidden from assistive technology", () => {
    mount();
    for (const icon of screen.getByTestId("add-statement-tile").querySelectorAll("svg")) expect(icon).toHaveAttribute("aria-hidden", "true");
  });
});
