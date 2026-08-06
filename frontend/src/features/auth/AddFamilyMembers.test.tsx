import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddFamilyMembers } from "./AddFamilyMembers";
import * as api from "./api";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, createHouseholdMember: vi.fn() };
});

describe("AddFamilyMembers", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("adds a member and shows it in the list", async () => {
    vi.mocked(api.createHouseholdMember).mockResolvedValue({
      id: "m1", name: "Mom", relationship: "parent", relationship_other_label: null,
    });
    const onMembersChange = vi.fn();
    render(
      <AddFamilyMembers members={[]} onMembersChange={onMembersChange} onBack={vi.fn()} onContinue={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText(/member's name/i), { target: { value: "Mom" } });
    fireEvent.change(screen.getByLabelText(/relationship/i), { target: { value: "parent" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(api.createHouseholdMember).toHaveBeenCalledWith("Mom", "parent", undefined));
    await waitFor(() =>
      expect(onMembersChange).toHaveBeenCalledWith([
        { id: "m1", name: "Mom", relationship: "parent", relationship_other_label: null },
      ]),
    );
  });

  it("shows already-added members from props", () => {
    render(
      <AddFamilyMembers
        members={[{ id: "m1", name: "Dad", relationship: "parent", relationship_other_label: null }]}
        onMembersChange={vi.fn()}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    expect(screen.getByText("Dad")).toBeInTheDocument();
  });

  it("disables Continue until at least one member has been added", () => {
    render(<AddFamilyMembers members={[]} onMembersChange={vi.fn()} onBack={vi.fn()} onContinue={vi.fn()} />);

    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("calls onContinue when Continue is clicked with members present", () => {
    const onContinue = vi.fn();
    render(
      <AddFamilyMembers
        members={[{ id: "m1", name: "Dad", relationship: "parent", relationship_other_label: null }]}
        onMembersChange={vi.fn()}
        onBack={vi.fn()}
        onContinue={onContinue}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(onContinue).toHaveBeenCalled();
  });
});
