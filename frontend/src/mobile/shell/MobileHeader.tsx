import React from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MobileHeaderProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  className?: string;
}

export function MobileHeader({
  title = "Unifolio",
  showBack = false,
  onBack,
  rightAction,
  className,
}: MobileHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full h-14 bg-[var(--color-surface)]/85 backdrop-blur-md border-b border-[var(--color-border)] px-4 flex items-center justify-between transition-colors duration-200 select-none",
        className
      )}
    >
      {/* Left: Back button or Brand Logo */}
      <div className="flex items-center min-w-[44px]">
        {showBack ? (
          <button
            onClick={onBack}
            className="h-11 w-11 -ml-2 rounded-full flex items-center justify-center text-[var(--color-ink)] hover:bg-[var(--color-bg)] active:scale-90 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            aria-label="Go back"
            type="button"
          >
            <ChevronLeft className="h-6 w-6 stroke-[2.2]" />
          </button>
        ) : (
          <div
            className="flex items-center gap-1.5 font-display font-bold text-lg tracking-tight text-[var(--color-ink)]"
            aria-label="Unifolio Logo"
          >
            <span>Unifolio</span>
            <svg
              viewBox="0 0 100 100"
              className="w-3.5 h-3.5 text-[var(--color-accent)] fill-none stroke-current stroke-[14] stroke-linecap-round"
            >
              <path d="M 50 10 A 40 40 0 0 1 90 50" />
            </svg>
          </div>
        )}
      </div>

      {/* Center: Title (when showing back or specific sub-screen title) */}
      {showBack && title && (
        <div className="flex-1 px-2 text-center overflow-hidden">
          <h1 className="font-display font-semibold text-sm text-[var(--color-ink)] truncate tracking-tight">
            {title}
          </h1>
        </div>
      )}

      {/* Right: Action Slot (Theme toggle, Member Avatar, or CTA) */}
      <div className="flex items-center justify-end min-w-[44px]">
        {rightAction}
      </div>
    </header>
  );
}
