import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NavigationShell } from "./NavigationShell";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

describe("NavigationShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleMembers = [
    { id: "m-1", name: "Alice (Self)", completion: 100 },
    { id: "m-2", name: "Bob (Spouse)", completion: 100 },
  ];

  it("renders header, logo mark, and enabled Analytics nav item", () => {
    render(
      <NavigationShell
        viewMode="aggregate"
        selectedMemberId={null}
        members={sampleMembers}
        onViewModeChange={vi.fn()}
        onMemberSelect={vi.fn()}
        onAddData={vi.fn()}
      >
        <div>Content</div>
      </NavigationShell>
    );

    expect(screen.getByText("Unifolio")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    const analyticsBtn = screen.getByRole("button", { name: "Analytics" });
    expect(analyticsBtn).not.toBeDisabled();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("triggers tab switch when Analytics button is clicked", () => {
    const handleTabChange = vi.fn();
    render(
      <NavigationShell
        viewMode="aggregate"
        selectedMemberId={null}
        members={sampleMembers}
        onViewModeChange={vi.fn()}
        onMemberSelect={vi.fn()}
        onAddData={vi.fn()}
        onTabChange={handleTabChange}
      >
        <div>Content</div>
      </NavigationShell>
    );

    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));
    expect(handleTabChange).toHaveBeenCalledWith("analytics");
  });

  it("switches view mode when toggle buttons are clicked", () => {
    const handleViewModeChange = vi.fn();
    render(
      <NavigationShell
        viewMode="aggregate"
        selectedMemberId={null}
        members={sampleMembers}
        onViewModeChange={handleViewModeChange}
        onMemberSelect={vi.fn()}
        onAddData={vi.fn()}
      >
        <div>Content</div>
      </NavigationShell>
    );

    fireEvent.click(screen.getByText("Per Member"));
    expect(handleViewModeChange).toHaveBeenCalledWith("member");
  });

  it("opens Profile from the header without rendering logout there", () => {
    const handleTabChange = vi.fn();
    render(
      <NavigationShell
        viewMode="aggregate"
        selectedMemberId={null}
        members={sampleMembers}
        onViewModeChange={vi.fn()}
        onMemberSelect={vi.fn()}
        onAddData={vi.fn()}
        onTabChange={handleTabChange}
      >
        <div>Content</div>
      </NavigationShell>
    );

    expect(screen.queryByRole("button", { name: /logout/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /profile/i }));
    expect(handleTabChange).toHaveBeenCalledWith("profile");
  });

  it("no member shows a lock icon; every pick calls onMemberSelect, with % shown while incomplete", async () => {
    const onMemberSelect = vi.fn();
    render(
      <NavigationShell
        viewMode="member"
        selectedMemberId="m-1"
        members={[
          { id: "m-1", name: "Alice (Me)", completion: 100 },
          { id: "m-3", name: "Ramesh Sharma", completion: 40 },
        ]}
        onViewModeChange={vi.fn()}
        onMemberSelect={onMemberSelect}
        onAddData={vi.fn()}
      >
        <div>Content</div>
      </NavigationShell>
    );

    fireEvent.keyDown(screen.getByLabelText("Select household member"), { key: "ArrowDown" });
    const option = await screen.findByRole("option", { name: /Ramesh Sharma/ });
    expect(option.querySelector("svg.lucide-lock")).toBeNull();
    expect(option).toHaveTextContent("40%");
    expect(screen.getByRole("option", { name: /Alice/ })).not.toHaveTextContent("%");
    fireEvent.click(option);
    expect(onMemberSelect).toHaveBeenCalledWith("m-3");
  });
});
