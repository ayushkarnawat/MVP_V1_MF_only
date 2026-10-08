import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SoloCasUpload } from "./SoloCasUpload";

// The import itself is ImportFlow's job; here it only needs to report success.
vi.mock("../import/ImportFlow", () => ({
  ImportFlow: ({ onDone }: { onDone: () => void }) => <button type="button" onClick={onDone}>finish import</button>,
}));

const updateMe = vi.fn();
vi.mock("./AuthContext", () => ({ useAuth: () => ({ updateMe }) }));

vi.mock("./api", () => ({
  listHouseholdMembers: vi.fn(async () => [{ id: "self-1", relationship: "self" }]),
  createHouseholdMember: vi.fn(),
}));

describe("SoloCasUpload finishing onboarding", () => {
  it("offers a retry when saving onboarding fails after the import", async () => {
    // Review 8 Oct: with the "Import complete" button gone, a failed save
    // used to leave the user on the spinner with no way forward.
    updateMe.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(undefined);
    render(<SoloCasUpload name="Ayush" />);

    fireEvent.click(await screen.findByRole("button", { name: "finish import" }));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    await waitFor(() => expect(updateMe).toHaveBeenCalledTimes(2));
    expect(updateMe).toHaveBeenLastCalledWith({ onboarding_completed: true });
  });
});
