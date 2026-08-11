import React from "react";
import { MobileHeader } from "./MobileHeader";
import { MobileBottomNav, type MobileTab } from "./MobileBottomNav";
import { MobileDeviceFrame } from "./MobileDeviceFrame";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

export interface MobileAppShellProps {
  activeTab?: MobileTab;
  onTabChange?: (tab: MobileTab) => void;
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  children: React.ReactNode;
}

export function MobileAppShell({
  activeTab,
  onTabChange,
  title,
  showBack,
  onBack,
  rightAction,
  isLoading = false,
  error = null,
  onRetry,
  isEmpty = false,
  emptyTitle = "No data found",
  emptyDescription = "There are no items to display at this time.",
  emptyActionLabel,
  onEmptyAction,
  children,
}: MobileAppShellProps) {
  return (
    <MobileDeviceFrame>
      {/* Mobile Top Header */}
      <MobileHeader
        title={title}
        showBack={showBack}
        onBack={onBack}
        rightAction={rightAction}
      />

      {/* Mobile Main Content Scroll Container */}
      <main className="flex-1 min-h-0 w-full overflow-y-auto px-4 py-4 pb-28 overscroll-contain animate-in fade-in duration-200">
        {isLoading ? (
          <div className="flex flex-col space-y-4 py-6 animate-pulse" aria-label="Loading content">
            {/* Header skeleton */}
            <div className="h-6 w-36 bg-[var(--color-border)] rounded-lg" />
            <div className="h-28 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 flex flex-col justify-between">
              <div className="h-4 w-24 bg-[var(--color-border)] rounded" />
              <div className="h-8 w-44 bg-[var(--color-border)] rounded-lg" />
            </div>
            {/* List items skeleton */}
            <div className="space-y-3 pt-2">
              <div className="h-20 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl" />
              <div className="h-20 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl" />
              <div className="h-20 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl" />
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 space-y-4">
            <div className="h-12 w-12 rounded-full bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] text-[var(--color-negative)] flex items-center justify-center">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1 max-w-xs">
              <h2 className="font-display font-bold text-base text-[var(--color-ink)]">
                Something went wrong
              </h2>
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                {error}
              </p>
            </div>
            {onRetry && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onRetry}
                className="gap-2 font-semibold h-10 px-4 rounded-xl active:scale-95"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Try Again</span>
              </Button>
            )}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6 space-y-4">
            <div className="h-12 w-12 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] flex items-center justify-center">
              <span className="font-display font-bold text-lg">0</span>
            </div>
            <div className="space-y-1 max-w-xs">
              <h2 className="font-display font-bold text-base text-[var(--color-ink)]">
                {emptyTitle}
              </h2>
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                {emptyDescription}
              </p>
            </div>
            {emptyActionLabel && onEmptyAction && (
              <Button
                variant="default"
                size="sm"
                onClick={onEmptyAction}
                className="font-semibold h-10 px-5 rounded-xl active:scale-95 bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90"
              >
                {emptyActionLabel}
              </Button>
            )}
          </div>
        ) : (
          children
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      {onTabChange && (
        <MobileBottomNav activeTab={activeTab || "dashboard"} onTabChange={onTabChange} />
      )}
    </MobileDeviceFrame>
  );
}
