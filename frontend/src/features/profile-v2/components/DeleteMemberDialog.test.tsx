import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteMemberPortfolio } from "@/features/import/api";
import { HOUSEHOLD_FIXTURE } from "../fixtures/members";
import { DeleteMemberDialog } from "./DeleteMemberDialog";

vi.mock("@/features/import/api", () => ({ deleteMemberPortfolio: vi.fn() }));

type Deleted = { deleted_transactions_count: number; removed_member_ids: string[]; deleted_file: boolean };
const DELETED: Deleted = { deleted_transactions_count: 3, removed_member_ids: ["m-spouse"], deleted_file: false };

const [SELF, SPOUSE] = HOUSEHOLD_FIXTURE;
const onClose = vi.fn();
const onDeleted = vi.fn();

function mount(member = SPOUSE) {
  return render(<DeleteMemberDialog member={member} onClose={onClose} onDeleted={onDeleted} />);
}

const confirm = () => screen.getByRole("button", { name: /^(Delete member|Deleting…)$/ });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(deleteMemberPortfolio).mockResolvedValue(DELETED);
});

describe("DeleteMemberDialog: what it says", () => {
  it("asks 'Delete <name> from your family?' in a dialog", () => {
    mount();
    expect(screen.getByRole("dialog", { name: "Delete Aditi Surve from your family?" })).toBeInTheDocument();
  });

  it("explains what goes and what stays, and that their details must be added again", () => {
    mount();
    expect(screen.getByText("This removes all of their funds from your statements and removes them from your family. Other people’s funds stay.")).toBeInTheDocument();
    expect(screen.getByText("If you upload a statement with them again, you will need to add their details again.")).toBeInTheDocument();
  });

  it("has Keep and Delete member, and Delete member is the destructive action (negative colours)", () => {
    mount();
    expect(screen.getByRole("button", { name: "Keep" })).toBeInTheDocument();
    expect(confirm()).toHaveClass("bg-[var(--neg-text)]");
  });
});

describe("DeleteMemberDialog: deleting", () => {
  it("calls the delete-portfolio request with the member's id and remove_member true, then onDeleted", async () => {
    mount();
    fireEvent.click(confirm());
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(deleteMemberPortfolio).toHaveBeenCalledTimes(1);
    expect(deleteMemberPortfolio).toHaveBeenCalledWith("m-spouse", true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("uses the id of whichever member it was given", async () => {
    mount(HOUSEHOLD_FIXTURE[2]);
    fireEvent.click(confirm());
    await waitFor(() => expect(deleteMemberPortfolio).toHaveBeenCalledWith("m-father", true));
  });

  it("while the request runs the button reads 'Deleting…', is disabled, and a second press sends nothing", async () => {
    let finish: (value: Deleted) => void = () => {};
    vi.mocked(deleteMemberPortfolio).mockReturnValue(new Promise<Deleted>(resolve => { finish = resolve; }));
    mount();
    fireEvent.click(confirm());
    expect(confirm()).toHaveTextContent("Deleting…");
    expect(confirm()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Keep" })).toBeEnabled();
    fireEvent.click(confirm());
    expect(deleteMemberPortfolio).toHaveBeenCalledTimes(1);
    await act(async () => { finish(DELETED); });
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("a failure shows the message, keeps the dialog, never calls onDeleted, and the button works again", async () => {
    vi.mocked(deleteMemberPortfolio).mockRejectedValueOnce(new Error("down"));
    mount();
    fireEvent.click(confirm());
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not delete this member. Please try again.");
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(confirm()).toBeEnabled();
    expect(confirm()).toHaveTextContent("Delete member");
    fireEvent.click(confirm());
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(deleteMemberPortfolio).toHaveBeenCalledTimes(2);
  });
});

describe("DeleteMemberDialog: leaving", () => {
  it("Keep, the close button and Escape call onClose and send nothing", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(deleteMemberPortfolio).not.toHaveBeenCalled();
  });

  it("a late answer after the dialog was closed changes nothing (no onDeleted)", async () => {
    let finish: (value: Deleted) => void = () => {};
    vi.mocked(deleteMemberPortfolio).mockReturnValue(new Promise<Deleted>(resolve => { finish = resolve; }));
    mount();
    fireEvent.click(confirm());
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    await act(async () => { finish(DELETED); });
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("a late failure after the dialog was closed shows no message", async () => {
    let fail: (reason: Error) => void = () => {};
    vi.mocked(deleteMemberPortfolio).mockReturnValue(new Promise<Deleted>((_resolve, reject) => { fail = reject; }));
    mount();
    fireEvent.click(confirm());
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    await act(async () => { fail(new Error("late")); });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("DeleteMemberDialog: the account holder is never removed", () => {
  it("renders nothing at all for the self member and never sends a request", () => {
    const view = mount(SELF);
    expect(view.container).toBeEmptyDOMElement();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteMemberPortfolio).not.toHaveBeenCalled();
  });
});
