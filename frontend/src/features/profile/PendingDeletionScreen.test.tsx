import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PendingDeletionScreen } from "./PendingDeletionScreen";

describe("PendingDeletionScreen", () => {
  it("shows only the scheduled date and reactivation action", async () => {
    const reactivate = vi.fn().mockResolvedValue(undefined);
    render(
      <PendingDeletionScreen
        deletionScheduledAt="2026-09-16T08:00:00+00:00"
        reactivate={reactivate}
      />,
    );

    expect(screen.getByText(/scheduled for deletion on/i)).toHaveTextContent("16 September 2026");
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.queryByText("Analytics")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reactivate" }));
    await waitFor(() => expect(reactivate).toHaveBeenCalledOnce());
  });

  it("shows a retryable error when reactivation fails", async () => {
    const reactivate = vi.fn().mockRejectedValue(new Error("network"));
    render(<PendingDeletionScreen deletionScheduledAt="2026-09-16T08:00:00+00:00" reactivate={reactivate} />);

    fireEvent.click(screen.getByRole("button", { name: "Reactivate" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reactivate your account. Please try again.");
    expect(screen.getByRole("button", { name: "Reactivate" })).toBeEnabled();
  });
});
