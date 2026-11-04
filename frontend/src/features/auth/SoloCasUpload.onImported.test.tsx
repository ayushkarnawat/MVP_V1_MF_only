import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SoloCasUpload } from "./SoloCasUpload";

vi.mock("../import/ImportFlow", () => ({
  ImportFlow: ({ onDone }: { onDone: () => void }) => <button type="button" onClick={onDone}>finish import</button>,
}));

const updateMe = vi.fn();
vi.mock("./AuthContext", () => ({ useAuth: () => ({ updateMe }) }));

vi.mock("./api", () => ({
  listHouseholdMembers: vi.fn(async () => [{ id: "self-1", relationship: "self" }]),
  createHouseholdMember: vi.fn(),
}));

describe("SoloCasUpload with onImported (desktop sign-up, task 6.14)", () => {
  it("tells the caller the import is done and does not mark onboarding complete itself", async () => {
    const onImported = vi.fn();
    render(<SoloCasUpload name="Asha" onImported={onImported} />);
    fireEvent.click(await screen.findByRole("button", { name: "finish import" }));
    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(updateMe).not.toHaveBeenCalled();
  });
  it("without onImported it still marks onboarding complete, as before", async () => {
    updateMe.mockResolvedValue(undefined);
    render(<SoloCasUpload name="Asha" />);
    fireEvent.click(await screen.findByRole("button", { name: "finish import" }));
    await waitFor(() => expect(updateMe).toHaveBeenCalledWith({ onboarding_completed: true }));
  });
});
