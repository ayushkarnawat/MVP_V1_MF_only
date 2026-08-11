import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileRoot } from "./MobileRoot";
import { MobileAppShell } from "./shell/MobileAppShell";
import * as authContext from "../features/auth/AuthContext";

vi.mock("../features/auth/AuthContext", () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("./features/dashboard/MobileDashboardView", () => ({
  MobileDashboardView: () => (
    <div data-testid="mobile-dashboard-view">
      <span>Dashboard View Content</span>
    </div>
  ),
}));

describe("MobileAppShell & MobileRoot", () => {
  it("renders mobile header, brand logo, theme toggle, and bottom navigation tabs (Dashboard, Import, Analytics)", () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      token: "mock-token",
      me: {
        user_id: "u-1",
        phone_number: "+91 9209298772",
        email: null,
        onboarding_step: null,
        onboarding_completed: true,
        investor_type: null,
        primary_goal: null,
      },
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      updateMe: vi.fn(),
    });

    render(<MobileRoot />);

    expect(screen.getByText("Unifolio")).toBeInTheDocument();
    expect(screen.getByLabelText("Toggle theme")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analytics/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analytics/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Holdings" })).not.toBeInTheDocument();
    expect(screen.getByTestId("mobile-dashboard-view")).toBeInTheDocument();
  });

  it("switches active tab between Dashboard and Import", () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      token: null,
      me: null,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      updateMe: vi.fn(),
    });

    render(<MobileRoot />);

    const importTab = screen.getByRole("button", { name: "Import" });
    fireEvent.click(importTab);
    expect(screen.getByText("Import CAS Statements")).toBeInTheDocument();

    const dashboardTab = screen.getByRole("button", { name: "Dashboard" });
    fireEvent.click(dashboardTab);
    expect(screen.getByTestId("mobile-dashboard-view")).toBeInTheDocument();
  });

  it("renders loading skeleton in MobileAppShell when isLoading is true", () => {
    render(
      <MobileAppShell isLoading>
        <div>Content</div>
      </MobileAppShell>
    );

    expect(screen.getByLabelText("Loading content")).toBeInTheDocument();
  });

  it("renders error state with retry button in MobileAppShell when error is present", () => {
    const handleRetry = vi.fn();
    render(
      <MobileAppShell error="Failed to fetch data" onRetry={handleRetry}>
        <div>Content</div>
      </MobileAppShell>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Failed to fetch data")).toBeInTheDocument();

    const retryBtn = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it("renders empty state in MobileAppShell when isEmpty is true", () => {
    const handleEmptyAction = vi.fn();
    render(
      <MobileAppShell
        isEmpty
        emptyTitle="No investments yet"
        emptyDescription="Upload your first CAS to see holdings"
        emptyActionLabel="Upload CAS"
        onEmptyAction={handleEmptyAction}
      >
        <div>Content</div>
      </MobileAppShell>
    );

    expect(screen.getByText("No investments yet")).toBeInTheDocument();
    expect(screen.getByText("Upload your first CAS to see holdings")).toBeInTheDocument();

    const actionBtn = screen.getByRole("button", { name: /upload cas/i });
    fireEvent.click(actionBtn);
    expect(handleEmptyAction).toHaveBeenCalledTimes(1);
  });
});
