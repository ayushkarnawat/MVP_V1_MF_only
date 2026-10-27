import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HouseholdMember } from "@/features/auth/types";
import { HOUSEHOLD_FIXTURE } from "../fixtures/members";
import { AddStatementDialog } from "./AddStatementDialog";

const onPick = vi.fn();
const onClose = vi.fn();

function mount(members: readonly HouseholdMember[] = HOUSEHOLD_FIXTURE) {
  return render(<AddStatementDialog members={members} onPick={onPick} onClose={onClose} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AddStatementDialog: what it shows", () => {
  it("is a dialog titled 'Add statement for whom?' with the one-line instruction", () => {
    mount();
    expect(screen.getByRole("dialog", { name: "Add statement for whom?" })).toBeInTheDocument();
    expect(screen.getByText("Choose the person this statement belongs to.")).toBeInTheDocument();
  });

  it("lists every household member, in the given order, by name (the self member without '(Me)'), each with the relationship on the right", () => {
    mount();
    const list = screen.getByRole("list", { name: "Household members" });
    const options = within(list).getAllByTestId("whom-option");
    expect(options.map(option => option.getAttribute("aria-label"))).toEqual(["Siddharth Surve", "Aditi Surve", "Ramesh Surve"]);
    expect(options.map(option => option.textContent)).toEqual(["SSSiddharth SurveMe", "ASAditi SurveSpouse", "RSRamesh SurveParent"]);
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  });

  it("shows the initials in an avatar, hidden from the accessibility tree", () => {
    mount();
    const avatars = screen.getAllByTestId("initials-avatar");
    expect(avatars.map(avatar => avatar.textContent)).toEqual(["SS", "AS", "RS"]);
    for (const avatar of avatars) expect(avatar).toHaveAttribute("aria-hidden", "true");
  });

  it("gives each person a different avatar colour by position", () => {
    mount();
    expect(screen.getAllByTestId("initials-avatar").map(avatar => avatar.getAttribute("data-tone"))).toEqual(["0", "1", "2"]);
  });

  it("has a Cancel button and no Add Member control", () => {
    mount();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByText(/add member/i)).not.toBeInTheDocument();
  });
});

describe("AddStatementDialog: choosing", () => {
  it("picking a person calls onPick with that very member and nothing else", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Aditi Surve" }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(HOUSEHOLD_FIXTURE[1]);
    expect(onPick.mock.calls[0][0]).toBe(HOUSEHOLD_FIXTURE[1]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("picking the account holder passes the self member", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Siddharth Surve" }));
    expect(onPick).toHaveBeenCalledWith(HOUSEHOLD_FIXTURE[0]);
  });

  it("Cancel, the close button and Escape all call onClose and never onPick", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("a member with a long name does not stretch the row (the name truncates)", () => {
    mount([{ ...HOUSEHOLD_FIXTURE[1], name: "A".repeat(120) }]);
    const option = screen.getByTestId("whom-option");
    expect(within(option).getByText("A".repeat(120))).toHaveClass("truncate");
  });
});
