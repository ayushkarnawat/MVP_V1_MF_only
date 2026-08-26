import { LayoutDashboard, PlusCircle, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import { isTestEnv } from "@/lib/motion";

export type MobileTab = "dashboard" | "analytics" | "import";

export interface MobileBottomNavProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  className?: string;
}

export function MobileBottomNav({
  activeTab,
  onTabChange,
  className,
}: MobileBottomNavProps) {
  const shouldReduceMotion = useReducedMotion() || isTestEnv;

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-surface)]/90 backdrop-blur-lg border-t border-[var(--color-border)] px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 transition-colors duration-200 select-none",
        className
      )}
      aria-label="Mobile Navigation"
    >
      <div className="max-w-md mx-auto flex items-center justify-around">
        {/* 1. Dashboard Tab (Left) */}
        <motion.button
          whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
          transition={{ duration: 0.1 }}
          onClick={() => onTabChange("dashboard")}
          className={cn(
            "group flex flex-col items-center justify-center min-w-[64px] min-h-[48px] py-1 px-3 rounded-2xl transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
            activeTab === "dashboard"
              ? "text-[var(--color-accent)]"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)]"
          )}
          aria-label="Dashboard"
          aria-current={activeTab === "dashboard" ? "page" : undefined}
          type="button"
        >
          <div className="relative flex items-center justify-center">
            <LayoutDashboard
              className={cn(
                "h-5 w-5 transition-transform duration-150",
                activeTab === "dashboard"
                  ? "scale-110 stroke-[2.2] text-[var(--color-accent)]"
                  : "stroke-[1.7] group-hover:scale-105"
              )}
            />
          </div>
          <span
            className={cn(
              "text-[10px] mt-1 tracking-tight transition-colors duration-150",
              activeTab === "dashboard"
                ? "font-bold text-[var(--color-ink)]"
                : "font-medium text-[var(--color-text-secondary)]"
            )}
          >
            Dashboard
          </span>
        </motion.button>

        {/* 2. Analytics Tab (Center) */}
        <motion.button
          whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
          transition={{ duration: 0.1 }}
          onClick={() => onTabChange("analytics")}
          className={cn(
            "group flex flex-col items-center justify-center min-w-[64px] min-h-[48px] py-1 px-3 rounded-2xl transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
            activeTab === "analytics"
              ? "text-[var(--color-accent)]"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)]"
          )}
          aria-label="Analytics"
          aria-current={activeTab === "analytics" ? "page" : undefined}
          type="button"
        >
          <div className="relative flex items-center justify-center">
            <BarChart2
              className={cn(
                "h-5 w-5 transition-transform duration-150",
                activeTab === "analytics"
                  ? "scale-110 stroke-[2.2] text-[var(--color-accent)]"
                  : "stroke-[1.7] group-hover:scale-105"
              )}
            />
          </div>
          <span
            className={cn(
              "text-[10px] mt-1 tracking-tight transition-colors duration-150",
              activeTab === "analytics"
                ? "font-bold text-[var(--color-ink)]"
                : "font-medium text-[var(--color-text-secondary)]"
            )}
          >
            Analytics
          </span>
        </motion.button>

        {/* 3. Import Tab (Right) */}
        <motion.button
          whileTap={shouldReduceMotion ? undefined : { scale: 0.92 }}
          transition={{ duration: 0.1 }}
          onClick={() => onTabChange("import")}
          className={cn(
            "group flex flex-col items-center justify-center min-w-[64px] min-h-[48px] py-1 px-3 rounded-2xl transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
            activeTab === "import"
              ? "text-[var(--color-accent)]"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-ink)]"
          )}
          aria-label="Import"
          aria-current={activeTab === "import" ? "page" : undefined}
          type="button"
        >
          <div className="relative flex items-center justify-center">
            <PlusCircle
              className={cn(
                "h-5 w-5 transition-transform duration-150",
                activeTab === "import"
                  ? "scale-110 stroke-[2.2] text-[var(--color-accent)]"
                  : "stroke-[1.7] group-hover:scale-105"
              )}
            />
          </div>
          <span
            className={cn(
              "text-[10px] mt-1 tracking-tight transition-colors duration-150",
              activeTab === "import"
                ? "font-bold text-[var(--color-ink)]"
                : "font-medium text-[var(--color-text-secondary)]"
            )}
          >
            Import
          </span>
        </motion.button>
      </div>
    </nav>
  );
}
