import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FamilyMembers, type FamilyMembersProps } from "./FamilyMembers";

const ASHA = "81e5a369-bbd4-59f1-b480-8a5bbf1c74ef";
const DEV = "e6b4557c-b0e3-58f9-8642-54da2db3a27d";
const ROWS = [
  { id: ASHA, name: "ASHA RAO", value: "3000.00" },
  { id: DEV, name: "Dev Rao", value: "2000.00" },
];

function setup(overrides: Partial<FamilyMembersProps> = {}) {
  const handlers = { onSelectMember: vi.fn(), onShowFamily: vi.fn(), onRetry: vi.fn() };
  const props: FamilyMembersProps = { status: "data", rows: ROWS, selectedId: null, ...handlers, ...overrides };
  const view = render(<FamilyMembers {...props} />);
  return { ...view, handlers };
}

describe("FamilyMembers: states", () => {
  it("shows a loading placeholder", () => {
    setup({ status: "loading", rows: null });
    expect(screen.getByRole("status", { name: "Loading family members" })).toBeInTheDocument();
    expect(screen.queryByTestId("family-bar")).toBeNull();
  });

  it("shows a message and a retry button on an error, and treats data status without rows the same", () => {
    const { handlers, unmount } = setup({ status: "error", rows: null });
    expect(screen.getByText("Couldn't load family members")).toBeInTheDocument();
    expect(screen.getByText("This section failed to load, but the rest of the page is unaffected.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);
    unmount();
    setup({ status: "data", rows: null });
    expect(screen.getByText("Couldn't load family members")).toBeInTheDocument();
  });

  it("explains a household of one instead of drawing a comparison", () => {
    setup({ rows: [ROWS[0]] });
    expect(screen.getByRole("heading", { level: 3, name: "Family Members" })).toBeInTheDocument();
    expect(screen.getByText(
      "You're the only member in this household — nothing to compare yet. Add a family member from Profile to see a breakdown here.",
    )).toBeInTheDocument();
    expect(screen.queryByTestId("family-bar")).toBeNull();
    expect(screen.queryAllByTestId(/^family-row-/)).toHaveLength(0);
  });

  it("treats no rows like a household of one", () => {
    setup({ rows: [] });
    expect(screen.getByText(/You're the only member in this household/)).toBeInTheDocument();
  });
});

describe("FamilyMembers: the comparison", () => {
  it("has a heading, a description and a named region", () => {
    setup();
    expect(screen.getByRole("heading", { level: 3, name: "Family Members" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Family Members" })).toBeInTheDocument();
    expect(screen.getByText("Whole portfolio per member — click a row or bar segment to switch scope.")).toBeInTheDocument();
  });

  it("draws a stacked bar with one coloured segment per member, sized by exact share", () => {
    setup();
    const bar = screen.getByTestId("family-bar");
    expect(bar).toHaveAttribute("aria-hidden", "true");
    expect(within(bar).getAllByTestId(/^family-segment-/)).toHaveLength(2);
    expect(screen.getByTestId("family-segment-0")).toHaveStyle({ width: "60%" });
    expect(screen.getByTestId("family-segment-0")).toHaveAttribute("data-color", "var(--c1)");
    expect(screen.getByTestId("family-segment-1")).toHaveStyle({ width: "40%" });
    expect(screen.getByTestId("family-segment-1")).toHaveAttribute("data-color", "var(--c2)");
  });

  it("shows one row per member with an avatar, a title-cased name, the value and the share", () => {
    setup();
    const asha = screen.getByTestId(`family-row-${ASHA}`);
    expect(asha).toHaveAttribute("role", "button");
    expect(asha).toHaveAttribute("tabindex", "0");
    expect(within(asha).getByText("Asha Rao")).toBeInTheDocument();
    expect(screen.getByTestId(`family-avatar-${ASHA}`)).toHaveTextContent("AR");
    expect(screen.getByTestId(`family-avatar-${ASHA}`)).toHaveAttribute("data-color", "var(--c1)");
    expect(screen.getByTestId(`family-value-${ASHA}`)).toHaveTextContent("₹3,000 (60.0%)");
    expect(screen.getByTestId(`family-fill-${ASHA}`)).toHaveStyle({ width: "60%" });
    expect(screen.getByTestId(`family-avatar-${DEV}`)).toHaveTextContent("DR");
    expect(screen.getByTestId(`family-avatar-${DEV}`)).toHaveAttribute("data-color", "var(--c2)");
    expect(screen.getByTestId(`family-value-${DEV}`)).toHaveTextContent("₹2,000 (40.0%)");
  });

  it("keeps the given order", () => {
    setup({ rows: [ROWS[1], ROWS[0]] });
    expect(screen.getAllByTestId(/^family-row-/).map(row => row.getAttribute("data-testid"))).toEqual([
      `family-row-${DEV}`, `family-row-${ASHA}`,
    ]);
  });

  it("shares an awkward total exactly", () => {
    setup({ rows: [{ id: ASHA, name: "A", value: "1.00" }, { id: DEV, name: "B", value: "2.00" }] });
    expect(screen.getByTestId(`family-value-${ASHA}`)).toHaveTextContent("₹1 (33.3%)");
    expect(screen.getByTestId("family-segment-0")).toHaveStyle({ width: "33.3333%" });
    expect(screen.getByTestId(`family-value-${DEV}`)).toHaveTextContent("₹2 (66.7%)");
  });

  it("shows zero values without a share when nobody has holdings", () => {
    setup({ rows: [{ id: ASHA, name: "A", value: "0.00" }, { id: DEV, name: "B", value: "0.00" }] });
    expect(screen.getByTestId(`family-value-${ASHA}`)).toHaveTextContent("₹0");
    expect(screen.getByTestId(`family-value-${ASHA}`)).not.toHaveTextContent("%");
    expect(screen.getByTestId("family-segment-0")).toHaveStyle({ width: "0%" });
  });
});

describe("FamilyMembers: choosing a member", () => {
  it("selects on click, Enter and Space", () => {
    const { handlers } = setup();
    const row = screen.getByTestId(`family-row-${DEV}`);
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    fireEvent.keyDown(row, { key: "a" });
    expect(handlers.onSelectMember).toHaveBeenCalledTimes(3);
    expect(handlers.onSelectMember).toHaveBeenCalledWith(DEV);
  });

  it("selects from a bar segment", () => {
    const { handlers } = setup();
    fireEvent.click(screen.getByTestId("family-segment-1"));
    expect(handlers.onSelectMember).toHaveBeenCalledWith(DEV);
  });

  it("marks the selected member and offers the way back to the family", () => {
    const { handlers } = setup({ selectedId: DEV });
    expect(screen.getByTestId(`family-row-${DEV}`)).toHaveAttribute("aria-current", "true");
    expect(screen.getByTestId(`family-row-${ASHA}`)).not.toHaveAttribute("aria-current");
    fireEvent.click(screen.getByRole("button", { name: "Family combined" }));
    expect(handlers.onShowFamily).toHaveBeenCalledTimes(1);
  });

  it("offers no way back, and marks nobody, in the family view", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Family combined" })).toBeNull();
    expect(screen.getByTestId(`family-row-${ASHA}`)).not.toHaveAttribute("aria-current");
  });
});
