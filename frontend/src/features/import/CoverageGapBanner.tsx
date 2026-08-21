import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { CoverageGapItem } from "./types";

interface CoverageGapBannerProps {
  gaps: CoverageGapItem[];
  onResolveGap: (gap: CoverageGapItem) => void;
}

export function CoverageGapBanner({ gaps, onResolveGap }: CoverageGapBannerProps) {
  if (!gaps || gaps.length === 0) return null;

  const count = gaps.length;
  const firstGap = gaps[0];

  return (
    <div
      role="alert"
      className="p-4 sm:p-5 rounded-2xl bg-[color-mix(in_srgb,var(--color-negative)_8%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_25%,transparent)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 text-left"
    >
      <div className="flex items-start sm:items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-[var(--color-negative)] flex-shrink-0 mt-0.5 sm:mt-0" />
        <div className="space-y-0.5">
          <div className="font-display font-semibold text-xs sm:text-sm text-[var(--color-negative)]">
            Coverage Gap Detected ({count} {count === 1 ? "folio" : "folios"} missing earlier purchases)
          </div>
          <div className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            Some transactions include sales/switch-outs before known purchases. Set an opening balance to ensure accurate portfolio tracking.
          </div>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => onResolveGap(firstGap)}
        className="w-full sm:w-auto h-9 px-3.5 rounded-xl border-[color-mix(in_srgb,var(--color-negative)_30%,transparent)] text-[var(--color-negative)] hover:bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] font-semibold text-xs gap-1.5 flex-shrink-0 cursor-pointer min-h-[36px]"
      >
        <span>Resolve Gap</span>
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
