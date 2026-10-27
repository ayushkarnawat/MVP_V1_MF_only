import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteAccountDialog } from "./DeleteAccountDialog";

const auth = vi.hoisted(() => ({ requestAccountDeletion: vi.fn() }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));

const onClose = vi.fn();

function mount() {
  return render(<DeleteAccountDialog onClose={onClose} />);
}

const reason = (name: string) => screen.getByRole("radio", { name });
const next = () => screen.getByRole("button", { name: "Continue" });
const confirm = () => screen.getByRole("button", { name: /^(Confirm deletion|Scheduling…)$/ });

function toConfirmStep(choice = "Data or trust concern", note?: string) {
  fireEvent.click(reason(choice));
  if (note !== undefined) fireEvent.change(screen.getByLabelText(/Anything else/), { target: { value: note } });
  fireEvent.click(next());
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.requestAccountDeletion.mockResolvedValue(undefined);
});

describe("DeleteAccountDialog: step one, the reason", () => {
  it("is a dialog titled 'Why are you leaving?' with the five reasons in order, none chosen", () => {
    mount();
    expect(screen.getByRole("dialog", { name: "Why are you leaving?" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Choose one reason" })).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios.map(radio => radio.closest("label")?.textContent)).toEqual([
      "Not using it enough", "Missing a feature", "Found an alternative", "Data or trust concern", "Other",
    ]);
    for (const radio of radios) expect(radio).not.toBeChecked();
  });

  it("Continue is disabled until a reason is chosen, then enabled", () => {
    mount();
    expect(next()).toBeDisabled();
    fireEvent.click(reason("Other"));
    expect(next()).toBeEnabled();
  });

  it("only one reason can be chosen, and the last one wins", () => {
    mount();
    fireEvent.click(reason("Other"));
    fireEvent.click(reason("Missing a feature"));
    expect(reason("Missing a feature")).toBeChecked();
    expect(reason("Other")).not.toBeChecked();
  });

  it("has an optional note box labelled 'Anything else? Optional'", () => {
    mount();
    const note = screen.getByLabelText(/Anything else/);
    expect(note.tagName).toBe("TEXTAREA");
    expect(note).toHaveValue("");
    expect(screen.getByText("Optional")).toBeInTheDocument();
  });

  it("has Cancel, which closes the dialog and sends nothing", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(auth.requestAccountDeletion).not.toHaveBeenCalled();
  });

  it("Continue does not delete anything yet", () => {
    mount();
    toConfirmStep();
    expect(auth.requestAccountDeletion).not.toHaveBeenCalled();
  });
});

describe("DeleteAccountDialog: step two, the confirmation", () => {
  it("is titled 'Confirm account deletion' and states the 30-day wording exactly", () => {
    mount();
    toConfirmStep();
    expect(screen.getByRole("dialog", { name: "Confirm account deletion" })).toBeInTheDocument();
    expect(screen.getByText("Your account and all household data will be permanently deleted in 30 days. You can cancel anytime before then.")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("has Cancel and a Confirm deletion button in the negative colour", () => {
    mount();
    toConfirmStep();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(confirm()).toHaveClass("bg-[var(--neg-text)]");
  });

  it("Confirm deletion sends the reason code and the note exactly as typed, then closes the dialog", async () => {
    mount();
    toConfirmStep("Data or trust concern", "Too many emails");
    fireEvent.click(confirm());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(auth.requestAccountDeletion).toHaveBeenCalledTimes(1);
    expect(auth.requestAccountDeletion).toHaveBeenCalledWith("data_or_trust_concern", "Too many emails");
  });

  it.each([
    ["Not using it enough", "not_using_enough"],
    ["Missing a feature", "missing_feature"],
    ["Found an alternative", "found_alternative"],
    ["Data or trust concern", "data_or_trust_concern"],
    ["Other", "other"],
  ])("reason %j is sent as the code %j, with an empty note when none was typed", async (label, code) => {
    mount();
    toConfirmStep(label);
    fireEvent.click(confirm());
    await waitFor(() => expect(auth.requestAccountDeletion).toHaveBeenCalledWith(code, ""));
  });

  it("while it runs the button reads 'Scheduling…', is disabled, and a second press sends nothing", async () => {
    let finish: () => void = () => {};
    auth.requestAccountDeletion.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    mount();
    toConfirmStep();
    fireEvent.click(confirm());
    expect(confirm()).toHaveTextContent("Scheduling…");
    expect(confirm()).toBeDisabled();
    fireEvent.click(confirm());
    expect(auth.requestAccountDeletion).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a failure shows the message, keeps the dialog open on this step, does not close it, and Confirm works again", async () => {
    auth.requestAccountDeletion.mockRejectedValueOnce(new Error("down"));
    mount();
    toConfirmStep();
    fireEvent.click(confirm());
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not schedule account deletion. Please try again.");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Confirm account deletion" })).toBeInTheDocument();
    expect(confirm()).toBeEnabled();
    expect(confirm()).toHaveTextContent("Confirm deletion");
    fireEvent.click(confirm());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(auth.requestAccountDeletion).toHaveBeenCalledTimes(2);
  });

  it("Cancel on this step closes the dialog and sends nothing", () => {
    mount();
    toConfirmStep();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(auth.requestAccountDeletion).not.toHaveBeenCalled();
  });
});

describe("DeleteAccountDialog: leaving at any time", () => {
  it("the close button and Escape close it on both steps", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    toConfirmStep();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(auth.requestAccountDeletion).not.toHaveBeenCalled();
  });

  it("a late success after the dialog was closed does not call onClose a second time", async () => {
    let finish: () => void = () => {};
    auth.requestAccountDeletion.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    mount();
    toConfirmStep();
    fireEvent.click(confirm());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a late failure after the dialog was closed shows no message", async () => {
    let fail: (reason: Error) => void = () => {};
    auth.requestAccountDeletion.mockReturnValue(new Promise<void>((_resolve, reject) => { fail = reject; }));
    mount();
    toConfirmStep();
    fireEvent.click(confirm());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => { fail(new Error("late")); });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
