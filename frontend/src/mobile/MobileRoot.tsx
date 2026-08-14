import { useState } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { MobileAppShell } from "./shell/MobileAppShell";
import type { MobileTab } from "./shell/MobileBottomNav";
import { MobileDashboardView } from "./features/dashboard/MobileDashboardView";
import { MobileAnalyticsView } from "./features/analytics/MobileAnalyticsView";
import { MobileImportView } from "./features/import/MobileImportView";
import { ThemeToggle } from "../components/ThemeToggle";
import { LogOut } from "lucide-react";

export function MobileRoot() {
  const { loading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<MobileTab>("dashboard");
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [importTargetMemberId, setImportTargetMemberId] = useState<string | undefined>(undefined);

  const headerAction = (
    <div className="flex items-center gap-1">
      <ThemeToggle className="h-9 w-9 rounded-xl" />
      <button
        onClick={logout}
        className="h-9 w-9 rounded-xl flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-negative)] hover:bg-[var(--color-bg)] active:scale-90 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-negative)]"
        aria-label="Logout"
        title="Logout"
        type="button"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );

  const handleTabChange = (tab: MobileTab) => {
    setIsDetailOpen(false);
    setActiveTab(tab);
  };

  const handleNavigateImport = (memberId?: string) => {
    setImportTargetMemberId(memberId);
    handleTabChange("import");
  };

  if (loading) {
    return (
      <MobileAppShell isLoading rightAction={headerAction}>
        <div />
      </MobileAppShell>
    );
  }

  return (
    <MobileAppShell
      activeTab={activeTab}
      onTabChange={handleTabChange}
      rightAction={headerAction}
      hideHeader={isDetailOpen}
    >
      {activeTab === "dashboard" && (
        <MobileDashboardView
          onNavigateImport={handleNavigateImport}
          onDetailViewToggle={setIsDetailOpen}
        />
      )}

      {activeTab === "analytics" && <MobileAnalyticsView />}

      {activeTab === "import" && (
        <MobileImportView
          onNavigateDashboard={() => handleTabChange("dashboard")}
          defaultMemberId={importTargetMemberId}
        />
      )}
    </MobileAppShell>
  );
}


