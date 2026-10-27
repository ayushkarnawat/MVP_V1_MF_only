import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemberSelect } from "./MemberSelect";

const MEMBERS = [{ id: "m-asha", name: "ASHA RAO" }, { id: "m-dev", name: "Dev Rao" }];

describe("MemberSelect", () => {
  it("is a labelled select with Family combined first and then each member, in title case", () => {
    render(<MemberSelect members={MEMBERS} value="family" onChange={() => {}} />);
    const select = screen.getByRole("combobox", { name: "Member" });
    const options = within(select).getAllByRole("option");
    expect(options.map(option => option.textContent)).toEqual(["Family combined", "Asha Rao", "Dev Rao"]);
    expect(options.map(option => (option as HTMLOptionElement).value)).toEqual(["family", "m-asha", "m-dev"]);
  });

  it("shows the chosen value", () => {
    const { rerender } = render(<MemberSelect members={MEMBERS} value="family" onChange={() => {}} />);
    expect(screen.getByRole("combobox", { name: "Member" })).toHaveValue("family");
    rerender(<MemberSelect members={MEMBERS} value="m-dev" onChange={() => {}} />);
    expect(screen.getByRole("combobox", { name: "Member" })).toHaveValue("m-dev");
  });

  it("reports the member id, or family, when the choice changes", () => {
    const onChange = vi.fn();
    const { rerender } = render(<MemberSelect members={MEMBERS} value="family" onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Member" }), { target: { value: "m-asha" } });
    expect(onChange).toHaveBeenLastCalledWith("m-asha");
    rerender(<MemberSelect members={MEMBERS} value="m-asha" onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Member" }), { target: { value: "family" } });
    expect(onChange).toHaveBeenLastCalledWith("family");
  });

  it("still renders for a one-member household and for none", () => {
    const { rerender } = render(<MemberSelect members={[MEMBERS[1]]} value="family" onChange={() => {}} />);
    expect(within(screen.getByRole("combobox", { name: "Member" })).getAllByRole("option")).toHaveLength(2);
    rerender(<MemberSelect members={[]} value="family" onChange={() => {}} />);
    expect(within(screen.getByRole("combobox", { name: "Member" })).getAllByRole("option")).toHaveLength(1);
  });

  it("keeps a very long name inside the control", () => {
    render(<MemberSelect members={[{ id: "x", name: "A".repeat(200) }]} value="family" onChange={() => {}} />);
    expect(screen.getByRole("combobox", { name: "Member" })).toHaveClass("w-full", "min-w-0", "max-w-full");
  });

  it("uses the shared surface and border tokens", () => {
    render(<MemberSelect members={MEMBERS} value="family" onChange={() => {}} />);
    expect(screen.getByRole("combobox", { name: "Member" })).toHaveClass("bg-[var(--ui-elevated)]", "border-[var(--ui-divider)]", "text-[var(--ui-text)]");
  });
});
