import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/apiClient";
import { DeleteAccountDialog } from "./DeleteAccountDialog";

const auth = vi.hoisted(() => ({ requestAccountDeletion: vi.fn() }));
vi.mock("@/features/auth/AuthContext", () => ({ useAuth: () => auth }));

const MESSAGE = "The Head of Family was changed in the last 24 hours. You can delete this account after the undo window closes on 6 Nov 2026, 3:33 PM IST.";
const REFUSAL = new ApiError(409, { code: "head_change_undo_window", message: MESSAGE, available_after: "2026-11-06T10:03:00+00:00" });
const onClose = vi.fn();

function toConfirm() {
  render(<DeleteAccountDialog onClose={onClose} />);
  fireEvent.click(screen.getByRole("radio", { name: "Data or trust concern" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm deletion" }));
}

beforeEach(() => { vi.clearAllMocks(); });

describe("DeleteAccountDialog: a refusal says why and when (QA fixes, C4)", () => {
  it("shows the server's sentence in a calm notice under a title that says the account cannot be deleted yet", async () => {
    auth.requestAccountDeletion.mockRejectedValue(REFUSAL);
    toConfirm();
    const dialog = await screen.findByRole("dialog", { name: "You can't delete this account yet" });
    expect(within(dialog).getByTestId("refusal-notice")).toHaveTextContent(MESSAGE);
    expect(within(dialog).getByTestId("refusal-notice")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Could not schedule account deletion. Please try again.")).toBeNull();
    expect(screen.queryByText(/permanently deleted in 30 days/)).toBeNull();
  });
  it("offers one OK, and no confirm button or Cancel", async () => {
    auth.requestAccountDeletion.mockRejectedValue(REFUSAL);
    toConfirm();
    await screen.findByTestId("refusal-notice");
    expect(screen.queryByRole("button", { name: /Confirm deletion|Scheduling…/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it("the close cross and Escape also close it", async () => {
    auth.requestAccountDeletion.mockRejectedValue(REFUSAL);
    toConfirm();
    await screen.findByTestId("refusal-notice");
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it("any other failure keeps today's message and the confirm button", async () => {
    auth.requestAccountDeletion.mockRejectedValue(new ApiError(500, "boom"));
    toConfirm();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not schedule account deletion. Please try again.");
    expect(screen.getByRole("button", { name: "Confirm deletion" })).toBeEnabled();
    expect(screen.queryByTestId("refusal-notice")).toBeNull();
  });
  it("a 409 'already scheduled' (a plain sentence) is an ordinary failure too", async () => {
    auth.requestAccountDeletion.mockRejectedValue(new ApiError(409, "Account deletion is already scheduled."));
    toConfirm();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not schedule account deletion. Please try again.");
  });
  it("a request that works still closes the dialog", async () => {
    auth.requestAccountDeletion.mockResolvedValue(undefined);
    toConfirm();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("refusal-notice")).toBeNull();
  });
});
