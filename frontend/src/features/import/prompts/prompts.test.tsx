import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CancelImportDialog } from "./CancelImportDialog";
import { ConfirmFailedDialog } from "./ConfirmFailedDialog";
import { MemberNotInFileDialog } from "./MemberNotInFileDialog";
import { NameMismatchDialog } from "./NameMismatchDialog";
import { NameVariantNotice } from "./NameVariantNotice";
import { PanMismatchDialog } from "./PanMismatchDialog";
import { PanOnOtherAccountDialog } from "./PanOnOtherAccountDialog";
import { PromptHost } from "./PromptHost";
import { SamePersonDialog } from "./SamePersonDialog";
import { SessionExpiredDialog } from "./SessionExpiredDialog";
import { WhichIsYouDialog } from "./WhichIsYouDialog";
import { OTHER_ACCOUNT_DASHBOARD_NOTE, uploadStatementShowingMessage } from "./copy";
import { CrossAccountBlockedDialog } from "../CrossAccountBlockedDialog";
import type { ImportPrompt } from "../types";

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const close = () => fireEvent.click(screen.getByRole("button", { name: /close/i }));

describe("U1 NameVariantNotice", () => {
  it("first upload: uses the You-entered variant, Continue accepts, × cancels", () => {
    const onAccept = vi.fn();
    const onCancel = vi.fn();
    render(
      <NameVariantNotice isOpen kind="update" firstUpload currentName="Ayush Karnawat"
        statementName="AYUSH KUMAR KARNAWAT" onAccept={onAccept} onKeep={vi.fn()} onCancel={onCancel} />,
    );
    expect(screen.getByText("The name on this statement is a little different")).toBeInTheDocument();
    expect(screen.getByText(
      "This statement says AYUSH KUMAR KARNAWAT. You entered Ayush Karnawat. We’ll update your name to match your statement.",
    )).toBeInTheDocument();
    click("Continue");
    expect(onAccept).toHaveBeenCalledTimes(1);
    close();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("later upload: uses the We-have variant", () => {
    render(
      <NameVariantNotice isOpen kind="update" firstUpload={false} currentName="Ayush Karnawat"
        statementName="AYUSH KUMAR KARNAWAT" onAccept={vi.fn()} onKeep={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText(
      "This statement says AYUSH KUMAR KARNAWAT. We have Ayush Karnawat. We’ll update the name to match your statement.",
    )).toBeInTheDocument();
  });

  it("ask mode (M8): Update / Keep mine", () => {
    const onAccept = vi.fn();
    const onKeep = vi.fn();
    render(
      <NameVariantNotice isOpen kind="ask" firstUpload={false} currentName="Priya Sharma"
        statementName="PRIYA KARNAWAT" onAccept={onAccept} onKeep={onKeep} onCancel={vi.fn()} />,
    );
    expect(screen.getByText("Update Priya Sharma to PRIYA KARNAWAT?")).toBeInTheDocument();
    click("Update");
    click("Keep mine");
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onKeep).toHaveBeenCalledTimes(1);
  });
});

describe("U2 NameMismatchDialog (UI round 2, change 5)", () => {
  const mountIt = (error: string | null = null) => {
    const onAddAsFamily = vi.fn();
    const onUploadDifferent = vi.fn();
    render(
      <NameMismatchDialog isOpen enteredName="Ayush Karnawat" statementName="Ramesh Sharma" error={error}
        onAddAsFamily={onAddAsFamily} onUploadDifferent={onUploadDifferent} />,
    );
    return { onAddAsFamily, onUploadDifferent };
  };
  it("shows the account holder's name in the title and the statement's name in the body", () => {
    mountIt();
    expect(screen.getByText("This is Ayush Karnawat’s account")).toBeInTheDocument();
    expect(screen.getByText("You uploaded Ramesh Sharma’s file. Do you want to add Ramesh Sharma as a family member, or upload a different file?")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("the primary button adds the person on the statement as a family member", () => {
    const { onAddAsFamily, onUploadDifferent } = mountIt();
    click("Add Ramesh Sharma as a family member");
    expect(onAddAsFamily).toHaveBeenCalledTimes(1);
    expect(onUploadDifferent).not.toHaveBeenCalled();
  });
  it("Upload a different file and the close button both discard", () => {
    const { onUploadDifferent, onAddAsFamily } = mountIt();
    click("Upload a different file");
    close();
    expect(onUploadDifferent).toHaveBeenCalledTimes(2);
    expect(onAddAsFamily).not.toHaveBeenCalled();
  });
  it("there is no Yes, that's me button, and nothing renames the account holder", () => {
    mountIt();
    expect(screen.queryByRole("button", { name: /that.s me/i })).toBeNull();
    expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual(
      expect.arrayContaining(["Add Ramesh Sharma as a family member", "Upload a different file"]));
  });
  it("an error from the server shows in the dialog", () => {
    mountIt("Something went wrong. Please try again.");
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });
});

describe("U3 WhichIsYouDialog", () => {
  const candidates = [
    { person_key: "a", name: "Aditi Sharma", pan_masked: "AB******4K" },
    { person_key: "b", name: "Arjun Sharma", pan_masked: "AR******2P" },
  ];
  it("lists candidates with masked PANs; Continue sends the pick; None of these sends null", () => {
    const onContinue = vi.fn();
    const onNone = vi.fn();
    render(<WhichIsYouDialog isOpen candidates={candidates} onContinue={onContinue} onNoneOfThese={onNone} />);
    expect(screen.getByText("Which one is you?")).toBeInTheDocument();
    expect(screen.getByText("Aditi Sharma · AB******4K")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Arjun Sharma · AR******2P"));
    click("Continue");
    expect(onContinue).toHaveBeenCalledWith("b");
    click("None of these");
    close();
    expect(onNone).toHaveBeenCalledTimes(2);
  });
  it("shows (PAN not on statement) for a candidate without a PAN", () => {
    render(<WhichIsYouDialog isOpen candidates={[{ person_key: "a", name: "Aditi", pan_masked: null }]}
      onContinue={vi.fn()} onNoneOfThese={vi.fn()} />);
    expect(screen.getByText("Aditi · (PAN not on statement)")).toBeInTheDocument();
  });
});

describe("U4 PanMismatchDialog", () => {
  it("shows both masked PANs; The one I entered is also the × action", () => {
    const onKeep = vi.fn();
    const onUse = vi.fn();
    render(<PanMismatchDialog isOpen memberName="Ramesh Sharma" enteredPanMasked="BX******8L"
      statementPanMasked="BX******9M" onKeepEntered={onKeep} onUseStatement={onUse} />);
    expect(screen.getByText("This PAN doesn’t match what you entered")).toBeInTheDocument();
    expect(screen.getByText(
      "You entered BX******8L for Ramesh Sharma earlier. This statement shows BX******9M. Which one is correct?",
    )).toBeInTheDocument();
    click("The one I entered (BX******8L)");
    close();
    expect(onKeep).toHaveBeenCalledTimes(2);
    click("The one on this statement (BX******9M)");
    expect(onUse).toHaveBeenCalledTimes(1);
  });
  it("orphan copy: the upload-form message after The one I entered", () => {
    expect(uploadStatementShowingMessage("BX******8L", "Ramesh Sharma")).toBe(
      "Upload a statement that shows BX******8L for Ramesh Sharma",
    );
    expect(OTHER_ACCOUNT_DASHBOARD_NOTE).toBe("Their own dashboard stays with their account");
  });
});

describe("U5 MemberNotInFileDialog", () => {
  it("names who is in the file", () => {
    const onImport = vi.fn();
    const onUpload = vi.fn();
    render(<MemberNotInFileDialog isOpen memberName="Ramesh Sharma" memberPanMasked="BX******8L"
      people={["Aditi Sharma", "Sunita Sharma"]} onImportForThese={onImport} onUploadDifferent={onUpload} />);
    expect(screen.getByText("Ramesh Sharma isn’t in this statement")).toBeInTheDocument();
    expect(screen.getByText(
      "This statement doesn’t show Ramesh Sharma’s PAN (BX******8L). It has Aditi Sharma and Sunita Sharma.",
    )).toBeInTheDocument();
    click("Import for these people");
    expect(onImport).toHaveBeenCalledTimes(1);
    click("Upload a different file");
    expect(onUpload).toHaveBeenCalledTimes(1);
  });
});

// Batch B item 2 (B-5): the amber "wrong person" warning. Design source: Docs/orchestration/2026-11-12-batch-b-planning-workbook.html,
// section 2 (the drawn strings, not the plan's placeholders). Red until B-6 builds the block.
describe("U5 MemberNotInFileDialog warning (Batch B, item 2)", () => {
  const MUTED = "A new family member is created if they are not already in your family.";
  const mount = (people: string[], handlers: { onImport?: () => void; onUpload?: () => void } = {}) =>
    render(<MemberNotInFileDialog isOpen memberName="Ramesh Sharma" memberPanMasked="BX******8L" people={people}
      onImportForThese={handlers.onImport ?? vi.fn()} onUploadDifferent={handlers.onUpload ?? vi.fn()} />);
  const warning = () => screen.getByTestId("import-for-warning");

  it("shows an amber warning with one bold line naming who the funds are imported for (one person)", () => {
    mount(["Aditi Sharma"]);
    const line = within(warning()).getByText("These funds will be imported for Aditi Sharma.");
    expect(line).toHaveClass("font-semibold");
  });

  it("names several people the same way the body does (two, then three)", () => {
    const { unmount } = mount(["Aditi Sharma", "Sunita Sharma"]);
    expect(within(warning()).getByText("These funds will be imported for Aditi Sharma and Sunita Sharma.")).toBeInTheDocument();
    unmount();
    mount(["Aditi Sharma", "Sunita Sharma", "Mohan Sharma"]);
    expect(within(warning()).getByText("These funds will be imported for Aditi Sharma, Sunita Sharma and Mohan Sharma.")).toBeInTheDocument();
  });

  it("with no names the warning still shows, with a fixed bold line and no blanks (the one string the workbook does not draw)", () => {
    mount([]);
    expect(within(warning()).getByText("These funds will be imported for the people in this statement.")).toBeInTheDocument();
    expect(within(warning()).getByText(MUTED)).toBeInTheDocument();
    expect(warning().textContent).not.toMatch(/undefined|null|\s{2,}/);
  });

  // Codex whole-batch review of B, findings 5 and 9.
  it("with no names the body does not end in 'It has .'", () => {
    mount([]);
    expect(screen.getByText("This statement doesn’t show Ramesh Sharma’s PAN (BX******8L).")).toBeInTheDocument();
    expect(screen.queryByText(/It has/)).toBeNull();
  });

  it("the muted line is readable in dark mode: a light grey there, the palette body grey in light mode", () => {
    mount(["Aditi Sharma"]);
    const muted = within(warning()).getByText(MUTED);
    expect(muted).toHaveClass("text-[#4B4B4B]");
    expect(muted).toHaveClass("dark:text-[#A3A3A3]");
  });

  it("the warning's border is not a fixed light tint in dark mode", () => {
    mount(["Aditi Sharma"]);
    expect(warning()).toHaveClass("border-[#FCE0B0]");
    expect(warning().className).toContain("dark:border-[rgba(251,191,36,0.35)]");
  });

  it("the muted line says a new family member is created if needed, and is a separate element from the bold line", () => {
    mount(["Aditi Sharma"]);
    const muted = within(warning()).getByText(MUTED);
    const bold = within(warning()).getByText("These funds will be imported for Aditi Sharma.");
    expect(muted).not.toBe(bold);
    expect(muted).not.toHaveClass("font-semibold");
    expect(muted.parentElement).toBe(bold.parentElement);
  });

  it("the warning is its own element: the dialog body stays one exact text and does not contain it", () => {
    mount(["Aditi Sharma"]);
    const body = screen.getByText(
      "This statement doesn’t show Ramesh Sharma’s PAN (BX******8L). It has Aditi Sharma.",
    );
    expect(body.contains(warning())).toBe(false);
    expect(warning().contains(body)).toBe(false);
  });

  it("sits between the body text and the buttons, in that order", () => {
    mount(["Aditi Sharma"]);
    const body = screen.getByText(/This statement doesn’t show/);
    const upload = screen.getByRole("button", { name: "Upload a different file" });
    expect(body.compareDocumentPosition(warning()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(warning().compareDocumentPosition(upload) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("names only people from the file: never the selected member or anyone's PAN", () => {
    mount(["Aditi Sharma"]);
    expect(warning()).not.toHaveTextContent("Ramesh Sharma");
    expect(warning()).not.toHaveTextContent("BX******8L");
  });

  it("the warning icon is decorative (hidden from screen readers) and the text is read as a note", () => {
    mount(["Aditi Sharma"]);
    expect(warning().querySelector("[aria-hidden='true']")).not.toBeNull();
    expect(warning()).toHaveAttribute("role", "note");
  });

  it("the dialog uses the roomier 20 px spacing (gap-5) only for this dialog", () => {
    mount(["Aditi Sharma"]);
    expect(screen.getByRole("dialog")).toHaveClass("gap-5");
    expect(screen.getByRole("dialog")).not.toHaveClass("gap-4");
  });

  it("closing, Escape and the buttons behave as before (the file is discarded or imported as today)", () => {
    const onUpload = vi.fn();
    const onImport = vi.fn();
    mount(["Aditi Sharma"], { onUpload, onImport });
    close();
    expect(onUpload).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onUpload.mock.calls.length).toBeGreaterThanOrEqual(2);
    click("Import for these people");
    expect(onImport).toHaveBeenCalledTimes(1);
  });
});

describe("other prompts keep their spacing", () => {
  it("a dialog that does not ask for the roomy layout keeps gap-4", () => {
    render(<SessionExpiredDialog isOpen onUploadAgain={vi.fn()} />);
    expect(screen.getByRole("dialog")).toHaveClass("gap-4");
  });
});

describe("U7 CrossAccountBlockedDialog with onInclude", () => {
  it("offers Include in family total and Upload a different file", () => {
    const onInclude = vi.fn();
    const onBack = vi.fn();
    render(<CrossAccountBlockedDialog isOpen message="m" people={["Kiran Sharma"]} onInclude={onInclude} onBack={onBack} />);
    expect(screen.getByText("This statement belongs to another Unifolio account")).toBeInTheDocument();
    expect(screen.getByText("Kiran Sharma already tracks these funds in their own Unifolio account.")).toBeInTheDocument();
    click("Include in family total");
    expect(onInclude).toHaveBeenCalledTimes(1);
    click("Upload a different file");
    expect(onBack).toHaveBeenCalledTimes(1);
  });
  it("legacy mode without onInclude is unchanged", () => {
    render(<CrossAccountBlockedDialog isOpen message="blocked" onBack={vi.fn()} />);
    expect(screen.getByText("Import blocked")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Include in family total" })).toBeNull();
  });
});

describe("U12 PanOnOtherAccountDialog", () => {
  it("both CTAs; × keeps the entered PAN", () => {
    const onKeep = vi.fn();
    const onUpload = vi.fn();
    render(<PanOnOtherAccountDialog isOpen memberName="Ramesh Sharma" enteredPanMasked="BX******8L"
      statementPanMasked="BX******9M" onKeepEntered={onKeep} onUploadDifferent={onUpload} />);
    expect(screen.getByText("We can’t switch Ramesh Sharma to this PAN")).toBeInTheDocument();
    expect(screen.getByText(
      "BX******9M is already on another Unifolio account, so we can’t move Ramesh Sharma to it. Keep BX******8L, or upload a different file.",
    )).toBeInTheDocument();
    click("Keep the one I entered");
    close();
    expect(onKeep).toHaveBeenCalledTimes(2);
    click("Upload a different file");
    expect(onUpload).toHaveBeenCalledTimes(1);
  });
});

describe("U13 SamePersonDialog", () => {
  it("Yes / No with the statement PAN in the label", () => {
    const onYes = vi.fn();
    const onNo = vi.fn();
    render(<SamePersonDialog isOpen memberName="Ramesh Sharma" enteredPanMasked="BX******8L"
      statementPanMasked="BX******9M" statementName="RAMESH SHARMA" onYes={onYes} onNo={onNo} />);
    expect(screen.getByText("Is this Ramesh Sharma?")).toBeInTheDocument();
    expect(screen.getByText(
      "You entered BX******8L for Ramesh Sharma. This statement shows RAMESH SHARMA with BX******9M.",
    )).toBeInTheDocument();
    click("Yes, use BX******9M");
    expect(onYes).toHaveBeenCalledTimes(1);
    click("No, this is someone else");
    close();
    expect(onNo).toHaveBeenCalledTimes(2);
  });
});

describe("C1 ConfirmFailedDialog", () => {
  it("Try again / Cancel import", () => {
    const onTry = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmFailedDialog isOpen onTryAgain={onTry} onCancelImport={onCancel} />);
    expect(screen.getByText("We couldn’t finish the import")).toBeInTheDocument();
    expect(screen.getByText("Nothing was saved. Your review choices are still here.")).toBeInTheDocument();
    click("Try again");
    click("Cancel import");
    expect(onTry).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("C2 SessionExpiredDialog", () => {
  it("Upload again", () => {
    const onAgain = vi.fn();
    render(<SessionExpiredDialog isOpen onUploadAgain={onAgain} />);
    expect(screen.getByText("This review has expired")).toBeInTheDocument();
    expect(screen.getByText(
      "Reviews stay open for 60 minutes. Nothing was saved. Upload the statement again to continue.",
    )).toBeInTheDocument();
    click("Upload again");
    expect(onAgain).toHaveBeenCalledTimes(1);
  });
});

describe("C3 CancelImportDialog", () => {
  it("counts people; Keep reviewing is the × action", () => {
    const onKeep = vi.fn();
    const onCancel = vi.fn();
    render(<CancelImportDialog isOpen peopleCount={4} onKeepReviewing={onKeep} onCancelImport={onCancel} />);
    expect(screen.getByText("Cancel this import?")).toBeInTheDocument();
    expect(screen.getByText("Your review choices for 4 people will be lost.")).toBeInTheDocument();
    click("Keep reviewing");
    close();
    expect(onKeep).toHaveBeenCalledTimes(2);
    click("Cancel import");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
  it("singular", () => {
    render(<CancelImportDialog isOpen peopleCount={1} onKeepReviewing={vi.fn()} onCancelImport={vi.fn()} />);
    expect(screen.getByText("Your review choices for 1 person will be lost.")).toBeInTheDocument();
  });
});

describe("PromptHost", () => {
  const p = (code: ImportPrompt["code"], details: Record<string, unknown> = {}, sessionId: string | null = "s1"): ImportPrompt => ({
    code, message: "m", sessionId, details,
  });

  it("member_pan_mismatch: entered discards with the upload-form message; statement resolves pan", () => {
    const onResolve = vi.fn();
    const prompt = p("member_pan_mismatch", {
      member_name: "Ramesh Sharma", entered_pan_masked: "BX******8L", statement_pan_masked: "BX******9M",
    });
    const { unmount } = render(<PromptHost prompt={prompt} onResolve={onResolve} />);
    click(/The one I entered/);
    expect(onResolve).toHaveBeenLastCalledWith({
      kind: "discard", uploadMessage: "Upload a statement that shows BX******8L for Ramesh Sharma",
    });
    click(/The one on this statement/);
    expect(onResolve).toHaveBeenLastCalledWith({ kind: "pan" });
    unmount();
  });

  it("self_name_mismatch and which_is_self map to addAsFamily / self actions", () => {
    const onResolve = vi.fn();
    const { rerender } = render(
      <PromptHost onResolve={onResolve}
        prompt={p("self_name_mismatch", { entered_name: "A B", statement_name: "C D" })} />,
    );
    click("Add C D as a family member");
    expect(onResolve).toHaveBeenLastCalledWith({ kind: "addAsFamily" });
    rerender(
      <PromptHost onResolve={onResolve}
        prompt={p("which_is_self", { candidates: [{ person_key: "k", name: "N", pan_masked: "AB******4K" }] })} />,
    );
    click("Continue");
    expect(onResolve).toHaveBeenLastCalledWith({ kind: "self", personKey: "k" });
    click("None of these");
    expect(onResolve).toHaveBeenLastCalledWith({ kind: "self", personKey: null });
  });

  it("acknowledge prompts and session_expired", () => {
    const onResolve = vi.fn();
    const { rerender } = render(
      <PromptHost onResolve={onResolve}
        prompt={p("cross_account_pan_blocked", { people: ["Kiran Sharma"] })} />,
    );
    click("Include in family total");
    expect(onResolve).toHaveBeenLastCalledWith({ kind: "acknowledge", code: "cross_account_pan_blocked" });
    rerender(<PromptHost onResolve={onResolve} prompt={p("member_not_in_file", { member_name: "R", people: ["A"] })} />);
    click("Import for these people");
    expect(onResolve).toHaveBeenLastCalledWith({ kind: "acknowledge", code: "member_not_in_file" });
    rerender(<PromptHost onResolve={onResolve} prompt={p("session_expired", {}, null)} />);
    click("Upload again");
    expect(onResolve).toHaveBeenLastCalledWith({ kind: "reupload" });
  });

  it("cross_account_pan_blocked with no session shows the legacy hard block (no Include)", () => {
    const onResolve = vi.fn();
    render(<PromptHost onResolve={onResolve} prompt={{ ...p("cross_account_pan_blocked", {}, null), message: "Already on another account." }} />);
    expect(screen.queryByRole("button", { name: "Include in family total" })).toBeNull();
    expect(screen.getByText("Already on another account.")).toBeInTheDocument();
  });

  it("statement_pan_on_other_account discards", () => {
    const onResolve = vi.fn();
    render(
      <PromptHost onResolve={onResolve}
        prompt={p("statement_pan_on_other_account", {
          member_name: "R", entered_pan_masked: "BX******8L", statement_pan_masked: "BX******9M",
        })} />,
    );
    click("Keep the one I entered");
    expect(onResolve).toHaveBeenLastCalledWith({ kind: "discard", uploadMessage: undefined });
  });

  it("shows the notice queue in order, then reports noticesDone with the answers", () => {
    const onResolve = vi.fn();
    const notices = [
      { person_key: "a", member_id: "1", current_name: "Ayush Karnawat", statement_name: "AYUSH KUMAR KARNAWAT", kind: "update" as const, first_upload: true },
      { person_key: "b", member_id: "2", current_name: "Priya Sharma", statement_name: "PRIYA KARNAWAT", kind: "ask" as const, first_upload: false },
    ];
    render(<PromptHost prompt={null} notices={notices} onResolve={onResolve} />);
    expect(screen.getByText("The name on this statement is a little different")).toBeInTheDocument();
    click("Continue");
    expect(screen.getByText("Update Priya Sharma to PRIYA KARNAWAT?")).toBeInTheDocument();
    expect(onResolve).not.toHaveBeenCalled();
    click("Keep mine");
    expect(onResolve).toHaveBeenCalledWith({ kind: "noticesDone", nameAnswers: { a: true, b: false } });
  });

  it("shows same-person prompts after notices and resolves them", () => {
    const onResolve = vi.fn();
    render(
      <PromptHost prompt={null} onResolve={onResolve}
        samePersonPrompts={[{ person_key: "k", member_id: "m", member_name: "Ramesh Sharma",
          entered_pan_masked: "BX******8L", statement_pan_masked: "BX******9M" }]}
        people={[{ person_key: "k", name: "RAMESH SHARMA" } as never]} />,
    );
    expect(screen.getByText(/RAMESH SHARMA with BX\*{6}9M/)).toBeInTheDocument();
    click("Yes, use BX******9M");
    expect(onResolve).toHaveBeenLastCalledWith({ kind: "samePerson", personKey: "k", memberId: "m", same: true });
  });

  it("renders nothing without a prompt or notices", () => {
    const { container } = render(<PromptHost prompt={null} onResolve={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
