import { ChevronLeft } from "lucide-react";
import { HistoryView } from "@/features/history/HistoryView";

export interface MobileHistoryViewProps {
  viewMode: "aggregate" | "member";
  memberId: string | null;
  memberName?: string;
  onBack: () => void;
}

/** #12: full-screen Portfolio history, opened from the dashboard value card.
 * The bottom bar stays at three tabs, so this is a sub-screen, not a tab. */
export function MobileHistoryView({ viewMode, memberId, memberName, onBack }: MobileHistoryViewProps) {
  return (
    <div className="flex flex-col min-h-dvh bg-[var(--color-bg)] pb-12">
      <header className="sticky top-0 z-30 w-full h-14 bg-[var(--color-surface)]/85 backdrop-blur-md border-b border-[var(--color-border)] px-4 flex items-center gap-1 select-none">
        <button
          onClick={onBack}
          className="h-11 w-11 -ml-2 rounded-full flex items-center justify-center text-[var(--color-ink)] hover:bg-[var(--color-bg)] active:scale-90 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          type="button"
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6 stroke-[2.2]" />
        </button>
        <span className="text-sm font-semibold text-[var(--color-ink)]">Portfolio history</span>
      </header>
      <div className="p-4">
        <HistoryView viewMode={viewMode} memberId={memberId} memberName={memberName} ranges={["1Y", "5Y", "All"]} />
      </div>
    </div>
  );
}
