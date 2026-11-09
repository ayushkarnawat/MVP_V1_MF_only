import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteMemberPortfolio } from "@/features/import/api";
import { ApiError } from "@/lib/apiClient";
import { HOUSEHOLD_FIXTURE } from "../fixtures/members";
import { DeleteMemberDialog } from "./DeleteMemberDialog";

vi.mock("@/features/import/api", () => ({ deleteMemberPortfolio: vi.fn() }));

const SPOUSE = HOUSEHOLD_FIXTURE[1];
const MESSAGE = "This person was part of a recent Head of Family change, so they cannot be removed yet. You can remove them on 12 Nov 2026.";
const REFUSAL = new ApiError(409, { code: "member_in_recent_head_change", message: MESSAGE, available_after: "2026-11-11T19:00:00+00:00" });
const onClose = vi.fn();
const onDeleted = vi.fn();
const mount = () => render(<DeleteMemberDialog member={SPOUSE} onClose={onClose} onDeleted={onDeleted} />);
const press = () => fireEvent.click(screen.getByRole("button", { name: "Delete member" }));

beforeEach(() => { vi.clearAllMocks(); });

describe("DeleteMemberDialog: a refusal says why and when (QA fixes, C4)", () => {
  it("shows the server's sentence in a calm notice under a title that says the person cannot be removed yet", async () => {
    vi.mocked(deleteMemberPortfolio).mockRejectedValue(REFUSAL);
    mount();
    press();
    const dialog = await screen.findByRole("dialog", { name: "Aditi Surve can't be removed yet" });
    expect(within(dialog).getByTestId("refusal-notice")).toHaveTextContent(MESSAGE);
    expect(within(dialog).getByTestId("refusal-notice")).toHaveAttribute("role", "status");
    expect(within(dialog).getByTestId("refusal-notice").querySelector("svg")).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Could not delete this member. Please try again.")).toBeNull();
  });
  it("offers one OK and no way to try again", async () => {
    vi.mocked(deleteMemberPortfolio).mockRejectedValue(REFUSAL);
    mount();
    press();
    await screen.findByTestId("refusal-notice");
    expect(screen.queryByRole("button", { name: "Delete member" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Deleting…" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Keep" })).toBeNull();
    expect(screen.queryByText(/This removes all of their funds/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDeleted).not.toHaveBeenCalled();
  });
  it("the close cross and Escape also close it, and nothing was deleted", async () => {
    vi.mocked(deleteMemberPortfolio).mockRejectedValue(REFUSAL);
    mount();
    press();
    await screen.findByTestId("refusal-notice");
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onDeleted).not.toHaveBeenCalled();
    expect(deleteMemberPortfolio).toHaveBeenCalledTimes(1);
  });
  it("any other failure keeps today's message and today's buttons", async () => {
    vi.mocked(deleteMemberPortfolio).mockRejectedValue(new ApiError(500, "boom"));
    mount();
    press();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not delete this member. Please try again.");
    expect(screen.getByRole("button", { name: "Delete member" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Keep" })).toBeInTheDocument();
    expect(screen.queryByTestId("refusal-notice")).toBeNull();
  });
  it("a 409 with another code is also treated as an ordinary failure", async () => {
    vi.mocked(deleteMemberPortfolio).mockRejectedValue(new ApiError(409, { code: "other", message: "Something else." }));
    mount();
    press();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not delete this member. Please try again.");
  });
  it("a delete that works still calls onDeleted", async () => {
    vi.mocked(deleteMemberPortfolio).mockResolvedValue({ deleted_transactions_count: 1, removed_member_ids: ["m-spouse"], deleted_file: false });
    mount();
    press();
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("refusal-notice")).toBeNull();
  });
});
