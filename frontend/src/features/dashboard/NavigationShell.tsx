import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";
import { ThemeToggle } from "../../components/ThemeToggle";
import { useAuth } from "../auth/AuthContext";

export interface MemberOption {
  id: string;
  name: string;
}

export interface NavigationShellProps {
  viewMode: "aggregate" | "member";
  selectedMemberId: string | null;
  members: MemberOption[];
  onViewModeChange: (mode: "aggregate" | "member") => void;
  onMemberSelect: (memberId: string) => void;
  onAddData: () => void;
  activeTab?: "dashboard" | "analytics";
  onTabChange?: (tab: "dashboard" | "analytics") => void;
  children: React.ReactNode;
}

export function NavigationShell({
  viewMode,
  selectedMemberId,
  members,
  onViewModeChange,
  onMemberSelect,
  onAddData,
  activeTab = "dashboard",
  onTabChange,
  children,
}: NavigationShellProps) {
  const { logout } = useAuth();
  const hasFamily = members.length > 1;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-bg)] text-[var(--color-ink)] transition-colors duration-300">
      {/* Sticky Frosted Header */}
      <header className="sticky top-0 z-50 w-full border-b border-[var(--color-border)] bg-[var(--color-surface)]/85 backdrop-blur-md transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 lg:gap-4 py-2.5 lg:py-0 lg:h-16">
            {/* Top Bar on Mobile / Left Section on Desktop: Brand Logo & Navigation */}
            <div className="flex items-center justify-between lg:justify-start gap-4 sm:gap-6 lg:gap-8">
              <div
                className="flex items-center gap-2 font-display font-bold text-lg sm:text-xl tracking-tight text-[var(--color-ink)] select-none cursor-pointer flex-shrink-0"
                aria-label="Unifolio Logo"
                onClick={() => onTabChange?.("dashboard")}
              >
                <span>Unifolio</span>
                <svg
                  viewBox="0 0 100 100"
                  className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--color-accent)] fill-none stroke-current stroke-[14] stroke-linecap-round"
                >
                  <path d="M 50 10 A 40 40 0 0 1 90 50" />
                </svg>
              </div>

              <nav className="flex items-center gap-1 sm:gap-1.5" aria-label="Main Navigation">
                <button
                  className={cn(
                    "inline-flex items-center px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer",
                    activeTab === "dashboard"
                      ? "bg-[var(--color-bg)] text-[var(--color-ink)] border border-[var(--color-border)] shadow-xs font-semibold"
                      : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] border border-transparent"
                  )}
                  type="button"
                  onClick={() => onTabChange?.("dashboard")}
                >
                  Dashboard
                </button>

                <button
                  className={cn(
                    "inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer",
                    activeTab === "analytics"
                      ? "bg-[var(--color-bg)] text-[var(--color-ink)] border border-[var(--color-border)] shadow-xs font-semibold"
                      : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] border border-transparent"
                  )}
                  type="button"
                  onClick={() => onTabChange?.("analytics")}
                >
                  Analytics
                </button>
              </nav>
            </div>

            {/* Bottom Bar on Mobile / Right Section on Desktop: Controls */}
            <div className="flex items-center justify-between lg:justify-end gap-2.5 sm:gap-3 flex-wrap lg:flex-nowrap pt-1 lg:pt-0 border-t lg:border-t-0 border-[var(--color-border)]/60">
              {/* Family vs Member Segmented Switcher */}
              {hasFamily && (
                <div className="inline-flex items-center p-0.5 sm:p-1 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] shadow-2xs">
                  <button
                    className={cn(
                      "px-2.5 sm:px-3 py-1 text-xs font-medium rounded-lg transition-colors duration-150 cursor-pointer",
                      viewMode === "aggregate"
                        ? "bg-[var(--color-surface)] text-[var(--color-ink)] font-semibold shadow-xs"
                        : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)]"
                    )}
                    onClick={() => onViewModeChange("aggregate")}
                    type="button"
                  >
                    Family Combined
                  </button>
                  <button
                    className={cn(
                      "px-2.5 sm:px-3 py-1 text-xs font-medium rounded-lg transition-colors duration-150 cursor-pointer",
                      viewMode === "member"
                        ? "bg-[var(--color-surface)] text-[var(--color-ink)] font-semibold shadow-xs"
                        : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)]"
                    )}
                    onClick={() => onViewModeChange("member")}
                    type="button"
                  >
                    Per Member
                  </button>
                </div>
              )}

              {/* Member Dropdown Selector (when in member view) */}
              {viewMode === "member" && members.length > 0 && (
                <div className="flex-1 sm:flex-initial min-w-[130px]">
                  <Select
                    value={selectedMemberId || undefined}
                    onValueChange={onMemberSelect}
                  >
                    <SelectTrigger
                      className="h-8 w-full sm:w-auto min-w-[130px] gap-1.5 rounded-full border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)] [&>span]:line-clamp-1"
                      aria-label="Select household member"
                    >
                      <SelectValue placeholder="Select member" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Action Buttons: Add Data, Theme & Logout */}
              <div className="flex items-center gap-2 ml-auto lg:ml-0">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onAddData}
                  className="gap-1 shadow-2xs font-semibold h-8 sm:h-9 px-3 text-xs"
                >
                  + Add Data
                </Button>

                <ThemeToggle className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg" />

                <button
                  onClick={logout}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-negative)] hover:bg-[var(--color-bg)] border border-transparent hover:border-[var(--color-border)] transition-colors cursor-pointer"
                  aria-label="Logout"
                  type="button"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow w-full max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-5 sm:py-8 animate-in fade-in duration-200">
        {children}
      </main>
    </div>
  );
}
