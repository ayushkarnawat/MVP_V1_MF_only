import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemberRibbonReview } from "./MemberRibbonReview";
import { familyPreview, person, scheme } from "./testFixtures";

// The panel stays mounted (hidden) so choices survive collapsing.
const collapsed = (el: HTMLElement) => el.closest("[hidden]") !== null;

const ribbon = (name: string, n: number) =>
  screen.getByRole("button", { name: new RegExp(`Click to review ${name}’s holdings \\(${n} unresolved holdings\\)`) });

async function pickDirect(index: number) {
  const combos = screen.getAllByRole("combobox", { name: /plan type/i });
  fireEvent.keyDown(combos[index], { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: /^direct$/i }));
}

function renderRibbons(props: Partial<React.ComponentProps<typeof MemberRibbonReview>> = {}) {
  const preview = familyPreview();
  const onConfirmImports = vi.fn();
  const onCancel = vi.fn();
  render(
    <MemberRibbonReview
      preview={preview}
      people={preview.people}
      onConfirmImports={onConfirmImports}
      onCancel={onCancel}
      confirming={false}
      {...props}
    />,
  );
  return { preview, onConfirmImports, onCancel };
}

describe("MemberRibbonReview", () => {
  it("starts collapsed with the ribbon copy and Confirm imports disabled", () => {
    renderRibbons();
    expect(screen.getByText("Review your import")).toBeInTheDocument();
    expect(ribbon("Aditi Sharma", 0)).toBeInTheDocument();
    expect(ribbon("Ramesh Sharma", 2)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm imports" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^confirm$/i })).not.toBeInTheDocument();
  });

  it("the unresolved count updates live as holdings are resolved", async () => {
    renderRibbons();
    fireEvent.click(ribbon("Ramesh Sharma", 2));
    await pickDirect(0);
    // The ribbon stays open, so read the count from its header button.
    expect(screen.getByRole("button", { name: /Click to review Ramesh Sharma’s holdings \(1 unresolved holdings\)/ })).toBeInTheDocument();
  });

  it("opens one ribbon at a time", () => {
    renderRibbons();
    fireEvent.click(ribbon("Aditi Sharma", 0));
    expect(screen.getByRole("button", { name: /^confirm$/i })).toBeInTheDocument();
    fireEvent.click(ribbon("Ramesh Sharma", 2));
    expect(screen.getAllByRole("button", { name: /^confirm$/i })).toHaveLength(1);
    expect(collapsed(screen.getByText("Fund m1"))).toBe(true);
    expect(collapsed(screen.getByText("Fund r1"))).toBe(false);
  });

  it("ribbon Confirm is disabled while holdings are unresolved", () => {
    renderRibbons();
    fireEvent.click(ribbon("Ramesh Sharma", 2));
    expect(screen.getByRole("button", { name: /^confirm$/i })).toBeDisabled();
  });

  it("enables Confirm imports only when every ribbon is reviewed, then sends one request", async () => {
    const { onConfirmImports } = renderRibbons();
    const confirmImports = screen.getByRole("button", { name: "Confirm imports" });

    fireEvent.click(ribbon("Aditi Sharma", 0));
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));
    expect(screen.getByText("Reviewed · 1 fund")).toBeInTheDocument();
    expect(confirmImports).toBeDisabled();

    fireEvent.click(ribbon("Ramesh Sharma", 2));
    await pickDirect(0);
    await pickDirect(1);
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));
    expect(screen.getByText("Reviewed · 2 funds · 1 matched by name")).toBeInTheDocument();
    expect(confirmImports).toBeEnabled();

    fireEvent.click(confirmImports);
    expect(onConfirmImports).toHaveBeenCalledTimes(1);
    const [people, moved] = onConfirmImports.mock.calls[0];
    expect(moved).toEqual({});
    expect(people).toEqual([
      { person_key: "me", scheme_confirmations: [] },
      {
        person_key: "ramesh",
        scheme_confirmations: [
          { temp_id: "r1", plan_type_override: "direct" },
          { temp_id: "r2", plan_type_override: "direct" },
        ],
      },
    ]);
  });

  it("reopening a ribbon keeps its choices", async () => {
    renderRibbons();
    fireEvent.click(ribbon("Ramesh Sharma", 2));
    await pickDirect(0);
    fireEvent.click(screen.getByRole("button", { name: /Click to review Ramesh Sharma’s holdings \(1 unresolved holdings\)/ }));
    expect(collapsed(screen.getByText("Fund r1"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Click to review Ramesh Sharma’s holdings \(1 unresolved holdings\)/ }));
    // The first fund's Direct choice is still there: the trigger shows it, not the placeholder.
    expect(screen.getAllByRole("combobox", { name: /plan type/i })[0]).toHaveTextContent(/direct/i);
  });

  it("a reviewed ribbon can be reopened to change it", () => {
    renderRibbons();
    fireEvent.click(ribbon("Aditi Sharma", 0));
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Aditi Sharma \(Me\)/ }));
    expect(collapsed(screen.getByText("Fund m1"))).toBe(false);
  });

  it("gives an excluded person no ribbon and sends include false for them", () => {
    const preview = familyPreview({
      people: [
        ...familyPreview().people.slice(0, 1),
        person("kiran", "Kiran Sharma", { status: "other_account", pan_masked: "DL******6N" }),
      ],
      schemes: [scheme("m1", { person_key: "me" }), scheme("k1", { person_key: "kiran" })],
    });
    const onConfirmImports = vi.fn();
    render(
      <MemberRibbonReview
        preview={preview} people={[preview.people[0]]} onConfirmImports={onConfirmImports}
        onCancel={vi.fn()} confirming={false}
      />,
    );
    expect(screen.queryByText(/Kiran/)).not.toBeInTheDocument();
    fireEvent.click(ribbon("Aditi Sharma", 0));
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm imports" }));
    expect(onConfirmImports.mock.calls[0][0]).toEqual([
      { person_key: "me", scheme_confirmations: [] },
      { person_key: "kiran", include: false, scheme_confirmations: [] },
    ]);
  });

  it("an included other-account person gets a ribbon and include true", () => {
    const preview = familyPreview({
      people: [
        familyPreview().people[0],
        person("kiran", "Kiran Sharma", { status: "other_account", pan_masked: "DL******6N" }),
      ],
      schemes: [scheme("m1", { person_key: "me" }), scheme("k1", { person_key: "kiran" })],
    });
    const onConfirmImports = vi.fn();
    render(
      <MemberRibbonReview
        preview={preview} people={preview.people} onConfirmImports={onConfirmImports}
        onCancel={vi.fn()} confirming={false}
      />,
    );
    for (const name of ["Aditi Sharma", "Kiran Sharma"]) {
      fireEvent.click(ribbon(name, 0));
      fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Confirm imports" }));
    expect(onConfirmImports.mock.calls[0][0][1]).toEqual({
      person_key: "kiran", include: true, scheme_confirmations: [],
    });
  });

  it("tags a fund matched by name and moves it with the Move to picker", () => {
    const { onConfirmImports } = renderRibbons();
    fireEvent.click(ribbon("Ramesh Sharma", 2));
    expect(screen.getByText("matched by name")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: /move fund r2 to/i }), { target: { value: "me" } });

    // Ramesh keeps r1 only; r2 now sits in Me's ribbon, tagged as assigned by you.
    expect(collapsed(screen.getByText("Fund r2"))).toBe(true);
    fireEvent.click(ribbon("Aditi Sharma", 1));
    expect(collapsed(screen.getByText("Fund r2"))).toBe(false);
    expect(screen.getByText("assigned by you")).toBeInTheDocument();
    expect(screen.queryByText("matched by name")).not.toBeInTheDocument();

    // A move invalidates both ribbons' review; resolve and confirm them again.
    expect(screen.getByRole("button", { name: "Confirm imports" })).toBeDisabled();
    expect(onConfirmImports).not.toHaveBeenCalled();
  });

  it("sends moves and popup owner picks as moved_funds", async () => {
    const preview = familyPreview({
      schemes: [
        scheme("m1", { person_key: "me" }),
        scheme("r1", { person_key: "ramesh" }),
        scheme("r2", { person_key: "ramesh" }),
        scheme("u1", { person_key: null, name: "UTI Nifty 50 Index" }),
      ],
      unassigned_temp_ids: ["u1"],
    });
    preview.people[1].unresolved_count = 0;
    const onConfirmImports = vi.fn();
    render(
      <MemberRibbonReview
        preview={preview} people={preview.people} onConfirmImports={onConfirmImports}
        onCancel={vi.fn()} confirming={false}
        edits={{ names: {}, includes: {}, owners: { u1: "ramesh" } }}
      />,
    );
    fireEvent.click(ribbon("Ramesh Sharma", 0));
    expect(screen.getByText("UTI Nifty 50 Index")).toBeInTheDocument();
    expect(screen.getByText("assigned by you")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: /move fund r2 to/i }), { target: { value: "me" } });
    for (const name of ["Aditi Sharma", "Ramesh Sharma"]) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`Click to review ${name}’s holdings`) }));
      fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Confirm imports" }));
    expect(onConfirmImports.mock.calls[0][1]).toEqual({ u1: "ramesh", r2: "me" });
  });

  it("sends an unassigned fund's owner explicitly even when nobody picked one", () => {
    const preview = familyPreview({
      schemes: [
        scheme("m1", { person_key: "me" }),
        scheme("r1", { person_key: "ramesh" }),
        scheme("u1", { person_key: null, name: "UTI Nifty 50 Index" }),
      ],
      unassigned_temp_ids: ["u1"],
    });
    preview.people[1].unresolved_count = 0;
    const onConfirmImports = vi.fn();
    render(
      <MemberRibbonReview
        preview={preview} people={preview.people} onConfirmImports={onConfirmImports}
        onCancel={vi.fn()} confirming={false}
      />,
    );
    for (const name of ["Aditi Sharma", "Ramesh Sharma"]) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`Click to review ${name}’s holdings`) }));
      fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Confirm imports" }));
    // The default owner (Me) is sent, so the server never has to guess its own default.
    expect(onConfirmImports.mock.calls[0][1]).toEqual({ u1: "me" });
  });

  it("carries edited names and name-notice answers into the confirmation", () => {
    const preview = familyPreview({
      schemes: [scheme("m1", { person_key: "me" }), scheme("r1", { person_key: "ramesh" })],
    });
    preview.people[1].unresolved_count = 0;
    const onConfirmImports = vi.fn();
    render(
      <MemberRibbonReview
        preview={preview} people={preview.people} onConfirmImports={onConfirmImports}
        onCancel={vi.fn()} confirming={false}
        edits={{ names: { ramesh: "Ramesh K Sharma" }, includes: {}, owners: {} }}
        nameAnswers={{ me: true }}
      />,
    );
    for (const name of ["Aditi Sharma", "Ramesh K Sharma"]) {
      fireEvent.click(ribbon(name, 0));
      fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Confirm imports" }));
    expect(onConfirmImports.mock.calls[0][0]).toEqual([
      { person_key: "me", accept_name_update: true, scheme_confirmations: [] },
      { person_key: "ramesh", name: "Ramesh K Sharma", scheme_confirmations: [] },
    ]);
  });

  it("Cancel calls onCancel and Confirm imports shows progress while confirming", () => {
    const { onCancel } = renderRibbons();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables Confirm imports while confirming", () => {
    renderRibbons({ confirming: true });
    const btn = screen.getByRole("button", { name: /confirming/i });
    expect(btn).toBeDisabled();
    expect(within(btn).getByText(/confirming/i)).toBeInTheDocument();
  });
});
