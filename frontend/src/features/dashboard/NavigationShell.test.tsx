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
    { id: "m-1", name: "Alice (Self)" },
    { id: "m-2", name: "Bob (Spouse)" },
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
});
