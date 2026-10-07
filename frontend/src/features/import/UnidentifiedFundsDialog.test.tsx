import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnidentifiedFundsDialog } from "./UnidentifiedFundsDialog";
import { scheme } from "./testFixtures";

const ask = scheme("t2", {
  name: "Mystery Fund", folio: "777/1", identification: "ask", match_status: "pending",
  candidates: [{ amfi_code: "1", name: "Mystery Fund - Direct" }, { amfi_code: "2", name: "Mystery Fund - Regular" }],
});

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
});
