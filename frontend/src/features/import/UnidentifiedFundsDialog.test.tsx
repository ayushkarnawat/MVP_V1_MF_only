import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetFolioVisibilityForTests, useFolioVisibility } from "../../lib/folioVisibility";
import { UnidentifiedFundsDialog } from "./UnidentifiedFundsDialog";
import { scheme } from "./testFixtures";

const ask = scheme("t2", {
  name: "Mystery Fund", folio: "777/1", identification: "ask", match_status: "pending",
  candidates: [{ amfi_code: "1", name: "Mystery Fund - Direct" }, { amfi_code: "2", name: "Mystery Fund - Regular" }],
});

afterEach(() => resetFolioVisibilityForTests());

describe("UnidentifiedFundsDialog (Phase 7 fallback)", () => {
  it("lists only the funds we couldn’t identify, each with its candidates and Not listed", () => {
    render(<UnidentifiedFundsDialog schemes={[scheme("m1"), ask]} onContinue={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Mystery Fund")).toBeInTheDocument();
    expect(screen.queryByText("Fund m1")).not.toBeInTheDocument();
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.getByRole("option", { name: /Not listed/ })).toBeInTheDocument();
  });

  it("Continue needs an answer, then sends the picked code or Not listed", () => {
    const onContinue = vi.fn();
    render(<UnidentifiedFundsDialog schemes={[ask]} onContinue={onContinue} onCancel={vi.fn()} />);
    const go = screen.getByRole("button", { name: "Continue" });
    expect(go).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });
    fireEvent.click(go);
    expect(onContinue).toHaveBeenLastCalledWith([{ temp_id: "t2", amfi_code: "2" }]);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "__unlisted__" } });
    fireEvent.click(go);
    expect(onContinue).toHaveBeenLastCalledWith([{ temp_id: "t2", unlisted: true }]);
  });

  // Independent review of Batch C, finding M2: one click on the eye hides every folio number in the app, this dialog included.
  it("shows the folio in full by default and masked once the folio numbers are hidden, with no extra control of its own", () => {
    let toggle!: () => void;
    function Toggler() { toggle = useFolioVisibility().toggle; return null; }
    render(<><Toggler /><UnidentifiedFundsDialog schemes={[ask]} onContinue={vi.fn()} onCancel={vi.fn()} /></>);
    expect(screen.getByText("Folio 777/1")).toBeInTheDocument();
    act(() => toggle());
    expect(screen.getByText("Folio XXXX777/1")).toBeInTheDocument();
    expect(screen.queryByText("Folio 777/1")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /folio numbers/i })).not.toBeInTheDocument();
  });
});
