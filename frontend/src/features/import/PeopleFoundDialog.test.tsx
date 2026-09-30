import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PeopleFoundDialog } from "./PeopleFoundDialog";
import { person, scheme } from "./testFixtures";

const me = person("me", "Aditi Sharma", { is_me: true, status: "me", pan_masked: "AB******4K", fund_count: 3 });
const ramesh = person("ramesh", "Ramesh Sharma", { pan_masked: "BX******8L" });
const meera = person("meera", "Person 3", { needs_name: true, pan_masked: null, name_source: "placeholder" });
const kiran = person("kiran", "Kiran Sharma", { status: "other_account", pan_masked: "DL******6N" });

function renderDialog(props: Partial<React.ComponentProps<typeof PeopleFoundDialog>> = {}) {
  const onContinue = vi.fn();
  const onCancel = vi.fn();
  render(
    <PeopleFoundDialog people={[ramesh, me]} unassigned={[]} onContinue={onContinue} onCancel={onCancel} {...props} />,
  );
  return { onContinue, onCancel };
}

describe("PeopleFoundDialog", () => {
  it("lists Me first with (Me), masked PANs and fund counts", () => {
    renderDialog();
    expect(screen.getByText("We found 2 people in your statement")).toBeInTheDocument();
    expect(screen.getByText("We’ll sort the funds by each person’s PAN, so everyone gets their own portfolio.")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText(/Aditi Sharma/)).toBeInTheDocument();
    expect(within(rows[0]).getByText("(Me)")).toBeInTheDocument();
    expect(within(rows[0]).getByText("AB******4K")).toBeInTheDocument();
    expect(within(rows[0]).getByText("3 funds")).toBeInTheDocument();
    expect(within(rows[1]).getByText("1 fund")).toBeInTheDocument();
  });

  it("shows (PAN not on statement) for a person without a PAN", () => {
    renderDialog({ people: [me, meera] });
    expect(screen.getByText("(PAN not on statement)")).toBeInTheDocument();
  });

  it("tags existing members and locked members", () => {
    renderDialog({
      people: [me, person("a", "Existing One", { status: "existing_member" }), person("b", "Locked One", { status: "locked_member" })],
    });
    expect(screen.getByText("already in your family")).toBeInTheDocument();
    expect(screen.getByText("details needed")).toBeInTheDocument();
  });

  it("blocks Continue until a placeholder person is named (U9)", () => {
    const { onContinue } = renderDialog({ people: [me, meera] });
    const cont = screen.getByRole("button", { name: "Continue" });
    expect(screen.getByText("We couldn’t read this name from the statement.")).toBeInTheDocument();
    expect(cont).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Add a name"), { target: { value: "Meera Sharma" } });
    expect(cont).toBeEnabled();
    fireEvent.click(cont);
    expect(onContinue).toHaveBeenCalledWith({
      names: { meera: "Meera Sharma" }, includes: {}, owners: {},
    });
  });

  it("does not accept a whitespace-only placeholder name", () => {
    renderDialog({ people: [me, meera] });
    fireEvent.change(screen.getByPlaceholderText("Add a name"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("the pencil edits a name and reports only the edit", () => {
    const { onContinue } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /edit name for ramesh sharma/i }));
    const input = screen.getByRole("textbox", { name: /name for ramesh sharma/i });
    fireEvent.change(input, { target: { value: "Ramesh K Sharma" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledWith({ names: { ramesh: "Ramesh K Sharma" }, includes: {}, owners: {} });
  });

  it("has no pencil for Me or for a person on another account", () => {
    renderDialog({ people: [me, kiran] });
    expect(screen.queryByRole("button", { name: /edit name/i })).not.toBeInTheDocument();
  });

  it("greys out an other-account person and lets the user include them (U8)", () => {
    const { onContinue } = renderDialog({ people: [me, kiran] });
    expect(screen.getByText("(already on another Unifolio account)")).toBeInTheDocument();
    const toggle = screen.getByRole("checkbox", { name: /include in family total/i });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByText("Their own dashboard stays with their account")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText("Their own dashboard stays with their account")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledWith({ names: {}, includes: { kiran: true }, owners: {} });
  });

  it("reports an excluded other-account person as includes false", () => {
    const { onContinue } = renderDialog({ people: [me, kiran] });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledWith({ names: {}, includes: { kiran: false }, owners: {} });
  });

  it("owner pickers for unmatched funds default to Me and can be changed (U10)", () => {
    const { onContinue } = renderDialog({
      unassigned: [scheme("u1", { name: "UTI Nifty 50 Index" }), scheme("u2", { name: "HDFC Flexi Cap" })],
    });
    expect(screen.getByText("2 funds we couldn’t match to anyone")).toBeInTheDocument();
    const picker = screen.getByRole("combobox", { name: /owner of uti nifty 50 index/i }) as HTMLSelectElement;
    expect(picker.value).toBe("me");
    fireEvent.change(picker, { target: { value: "ramesh" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledWith({ names: {}, includes: {}, owners: { u1: "ramesh", u2: "me" } });
  });

  it("does not offer an excluded person as an owner", () => {
    renderDialog({ people: [me, kiran], unassigned: [scheme("u1", { name: "UTI Nifty 50 Index" })] });
    const picker = screen.getByRole("combobox", { name: /owner of uti nifty 50 index/i });
    expect(within(picker).queryByRole("option", { name: "Kiran Sharma" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /include in family total/i }));
    expect(within(picker).getByRole("option", { name: "Kiran Sharma" })).toBeInTheDocument();
  });

  it("closing the popup cancels (C3 is the parent's job)", () => {
    const { onCancel } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
