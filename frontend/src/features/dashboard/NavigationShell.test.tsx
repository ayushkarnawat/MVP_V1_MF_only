import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NavigationShell } from "./NavigationShell";

describe("NavigationShell", () => {
  const sampleMembers = [
    { id: "m-1", name: "Alice (Self)" },
    { id: "m-2", name: "Bob (Spouse)" },
  ];

  it("renders header, logo mark, and disabled Analytics nav item", () => {
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
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    const analyticsBtn = screen.getByRole("button", { name: /analytics/i });
    expect(analyticsBtn).toBeDisabled();
    expect(screen.getByText("Content")).toBeInTheDocument();
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
});
