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
  MobileDashboardView: ({ onDetailViewToggle }: { onDetailViewToggle?: (isOpen: boolean) => void }) => (
    <div data-testid="mobile-dashboard-view">
      <span>Dashboard View Content</span>
      <button onClick={() => onDetailViewToggle?.(true)}>Open Details</button>
      <button onClick={() => onDetailViewToggle?.(false)}>Close Details</button>
    </div>
  ),
}));

vi.mock("./features/analytics/MobileAnalyticsView", () => ({
  MobileAnalyticsView: () => (
    <div data-testid="mobile-analytics-view">
      <span>Mobile Analytics Content</span>
    </div>
  ),
}));

vi.mock("./features/import/MobileImportView", () => ({
  MobileImportView: () => (
    <div data-testid="mobile-import-view">
      <span>Import View Content</span>
    </div>
  ),
}));

describe("MobileAppShell & MobileRoot", () => {
  it("renders mobile header, brand logo, theme toggle, and bottom navigation tabs (Dashboard, Analytics, Import)", () => {
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
    const analyticsBtn = screen.getByRole("button", { name: "Analytics" });
    expect(analyticsBtn).toBeInTheDocument();
    expect(analyticsBtn).not.toBeDisabled();
    expect(screen.queryByRole("button", { name: "Holdings" })).not.toBeInTheDocument();
    expect(screen.getByTestId("mobile-dashboard-view")).toBeInTheDocument();
  });

  it("switches active tab between Dashboard, Analytics, and Import", () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      token: null,
      me: null,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      updateMe: vi.fn(),
    });

    render(<MobileRoot />);

    const analyticsTab = screen.getByRole("button", { name: "Analytics" });
    fireEvent.click(analyticsTab);
    expect(screen.getByTestId("mobile-analytics-view")).toBeInTheDocument();

    const importTab = screen.getByRole("button", { name: "Import" });
    fireEvent.click(importTab);
    expect(screen.getByTestId("mobile-import-view")).toBeInTheDocument();

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

  it("hides shell header when detail view is open to prevent duplicate headers and theme toggles", () => {
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

    // Initially shell header and theme toggle are present
    expect(screen.getByText("Unifolio")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Toggle theme")).toHaveLength(1);

    // Open detail view
    const openBtn = screen.getByRole("button", { name: "Open Details" });
    fireEvent.click(openBtn);

    // Shell header is hidden
    expect(screen.queryByText("Unifolio")).not.toBeInTheDocument();

    // Close detail view
    const closeBtn = screen.getByRole("button", { name: "Close Details" });
    fireEvent.click(closeBtn);

    // Shell header restored
    expect(screen.getByText("Unifolio")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Toggle theme")).toHaveLength(1);
  });

  it("renders mobile logout button and triggers logout on click", () => {
    const mockLogout = vi.fn();
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
      logout: mockLogout,
      updateMe: vi.fn(),
    });

    render(<MobileRoot />);

    const logoutBtn = screen.getByRole("button", { name: "Logout" });
    expect(logoutBtn).toBeInTheDocument();

    fireEvent.click(logoutBtn);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
