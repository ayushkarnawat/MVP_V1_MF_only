import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HouseholdMember } from "../../features/auth/types";
import type { ScopeMember } from "../scope/scopeTypes";
import { MemberPickerDialog } from "./MemberPickerDialog";

const profile = (over: Partial<HouseholdMember>): HouseholdMember => ({
  id: "x", name: "x", relationship: null, relationship_other_label: null, origin: "manual", pan_masked: null,
  phone_number: null, email: null, name_from_statement: false, pan_conflict: null, pan_editable: false,
  profile_completion: 0, missing_fields: [], ...over,
} as HouseholdMember);

const MEMBERS: ScopeMember[] = [
  { id: "a", name: "Asha Rao", profile: profile({ id: "a", name: "Asha Rao", relationship: "self" }) },
  { id: "b", name: "Dev Rao", profile: profile({ id: "b", name: "Dev Rao", relationship: "spouse" }) },
  { id: "c", name: "Mira Rao", profile: profile({ id: "c", name: "Mira Rao", relationship: "other", relationship_other_label: "Cousin" }) },
  { id: "d", name: "Kabir Rao" },
];

function mount(over: Partial<Parameters<typeof MemberPickerDialog>[0]> = {}) {
  const props = { members: MEMBERS, open: true, onCancel: vi.fn(), onContinue: vi.fn(), ...over };
  const view = render(<MemberPickerDialog {...props} />);
  return { props, ...view };
}
const dialog = () => screen.getByRole("dialog", { name: "Whose data are you adding?" });
const cont = () => within(dialog()).getByRole("button", { name: "Continue" });

describe("MemberPickerDialog", () => {
  it("lists every member as one choice with nobody pre-selected", () => {
    mount();
    const choices = within(dialog()).getAllByRole("radio");
    expect(choices.map(choice => choice.getAttribute("aria-checked"))).toEqual(["false", "false", "false", "false"]);
    expect(within(dialog()).getByRole("radio", { name: /Asha Rao/ })).toBeInTheDocument();
    expect(within(dialog()).getByRole("radio", { name: /Kabir Rao/ })).toBeInTheDocument();
  });

  it("shows initials and the relationship when the member has one", () => {
    mount();
    const asha = within(dialog()).getByRole("radio", { name: /Asha Rao/ }).closest("label, [role=radio]") as HTMLElement;
    expect(asha).toHaveTextContent("AR");
    expect(asha).toHaveTextContent("Self");
    expect(within(dialog()).getByRole("radio", { name: /Dev Rao/ }).closest("label, [role=radio]")).toHaveTextContent("Spouse");
    expect(within(dialog()).getByRole("radio", { name: /Mira Rao/ }).closest("label, [role=radio]")).toHaveTextContent("Cousin");
  });

  it("shows no relationship text for a member without a profile", () => {
    mount();
    const kabir = within(dialog()).getByRole("radio", { name: /Kabir Rao/ }).closest("label, [role=radio]") as HTMLElement;
    expect(kabir).toHaveTextContent("KR");
    expect(kabir.textContent).toBe("KRKabir Rao");
  });

  it("keeps Continue disabled until a member is chosen", () => {
    mount();
    expect(cont()).toBeDisabled();
    fireEvent.click(within(dialog()).getByRole("radio", { name: /Dev Rao/ }));
    expect(cont()).toBeEnabled();
  });

  it("Continue passes the chosen member's id", () => {
    const { props } = mount();
    fireEvent.click(within(dialog()).getByRole("radio", { name: /Mira Rao/ }));
    fireEvent.click(cont());
    expect(props.onContinue).toHaveBeenCalledTimes(1);
    expect(props.onContinue).toHaveBeenCalledWith("c");
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it("Cancel closes without continuing", () => {
    const { props } = mount();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onContinue).not.toHaveBeenCalled();
  });

  it("Esc closes without continuing", () => {
    const { props } = mount();
    fireEvent.keyDown(dialog(), { key: "Escape" });
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onContinue).not.toHaveBeenCalled();
  });

  it("renders nothing when it is not open", () => {
    mount({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("forgets the choice when it is closed and opened again", () => {
    const { props, rerender } = mount();
    fireEvent.click(within(dialog()).getByRole("radio", { name: /Dev Rao/ }));
    rerender(<MemberPickerDialog {...props} open={false} />);
    rerender(<MemberPickerDialog {...props} open />);
    expect(cont()).toBeDisabled();
  });
});
