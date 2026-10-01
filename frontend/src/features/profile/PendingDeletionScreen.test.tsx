import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PendingDeletionScreen } from "./PendingDeletionScreen";
import { DOCS } from "../legal/testFixtures";

vi.mock("../legal/api", async () => {
  const actual = await vi.importActual<typeof import("../legal/api")>("../legal/api");
  return { ...actual, getLegalDocuments: vi.fn() };
});
import { getLegalDocuments } from "../legal/api";

const ACCEPTED = [
  { document_type: "terms_of_service", document_version: "tos-placeholder-2026-10-01" },
  { document_type: "privacy_policy", document_version: "privacy-placeholder-2026-10-01" },
];

async function tick() {
  fireEvent.click(await screen.findByRole("checkbox", { name: /I agree to the/ }));
}

describe("PendingDeletionScreen", () => {
  beforeEach(() => {
    vi.mocked(getLegalDocuments).mockResolvedValue(DOCS);
  });

  it("shows only the scheduled date and reactivation action; Reactivate is disabled until the box is ticked", async () => {
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
    expect(screen.getByRole("button", { name: "Reactivate" })).toBeDisabled();
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "Reactivate" }));
    await waitFor(() => expect(reactivate).toHaveBeenCalledWith(ACCEPTED));
  });

  it("shows a retryable error when reactivation fails", async () => {
    const reactivate = vi.fn().mockRejectedValue(new Error("network"));
    render(<PendingDeletionScreen deletionScheduledAt="2026-09-16T08:00:00+00:00" reactivate={reactivate} />);

    await tick();
    fireEvent.click(screen.getByRole("button", { name: "Reactivate" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reactivate your account. Please try again.");
    expect(screen.getByRole("button", { name: "Reactivate" })).toBeEnabled();
  });
});
