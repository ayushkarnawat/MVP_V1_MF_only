import { useState, useEffect } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { MobileAppShell } from "./shell/MobileAppShell";
import type { MobileTab } from "./shell/MobileBottomNav";
import { MobileDashboardView } from "./features/dashboard/MobileDashboardView";
import { Moon, Sun, UploadCloud } from "lucide-react";

export function MobileRoot() {
  const { loading } = useAuth();
  const [activeTab, setActiveTab] = useState<MobileTab>("dashboard");
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (
      (localStorage.getItem("unifolio_theme") as "light" | "dark") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light")
    );
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("unifolio_theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const themeAction = (
    <button
      className="h-10 w-10 rounded-full flex items-center justify-center text-[var(--color-ink)] hover:bg-[var(--color-bg)] active:scale-90 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      onClick={toggleTheme}
      title={`Switch to ${theme === "light" ? "Dark" : "Light"} mode`}
      type="button"
      aria-label="Toggle theme"
    >
      {theme === "light" ? (
        <Moon className="h-4 w-4 text-[var(--color-text-secondary)]" />
      ) : (
        <Sun className="h-4 w-4 text-[var(--color-accent)]" />
      )}
    </button>
  );

  if (loading) {
    return (
      <MobileAppShell isLoading rightAction={themeAction}>
        <div />
      </MobileAppShell>
    );
  }

  return (
    <MobileAppShell
      activeTab={activeTab}
      onTabChange={setActiveTab}
      rightAction={themeAction}
    >
      {activeTab === "dashboard" && (
        <MobileDashboardView
          onNavigateImport={() => setActiveTab("import")}
        />
      )}

      {activeTab === "import" && (
        <div className="flex flex-col space-y-4">
          <div className="p-6 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs text-center space-y-3">
            <div className="h-12 w-12 mx-auto rounded-full bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-accent)] flex items-center justify-center">
              <UploadCloud className="h-6 w-6" />
            </div>
            <h2 className="font-display font-bold text-base text-[var(--color-ink)]">
              Import CAS Statements
            </h2>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Upload PDF CAS files or initiate automated CAS fetch requests for all household members.
            </p>
          </div>
        </div>
      )}
    </MobileAppShell>
  );
}
