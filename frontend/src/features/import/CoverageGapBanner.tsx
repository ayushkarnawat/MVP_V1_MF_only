import { Button } from "../../components/Button";
import { AlertTriangle } from "lucide-react";
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
      style={{
        background: "rgba(239, 68, 68, 0.08)",
        border: "1px solid rgba(239, 68, 68, 0.25)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-4)",
        marginBottom: "var(--space-4)",
      }}
      role="alert"
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <AlertTriangle className="h-6 w-6 text-[var(--color-negative)] flex-shrink-0" />
        <div>
          <div className="type-body-medium" style={{ color: "var(--color-negative)", fontWeight: 600 }}>
            Coverage Gap Detected ({count} {count === 1 ? "folio" : "folios"} missing earlier purchases)
          </div>
          <div className="type-caption" style={{ color: "var(--color-text-secondary)" }}>
            Some transactions include sales/switch-outs before known purchases. Set an opening balance to ensure accurate portfolio tracking.
          </div>
        </div>
      </div>

      <Button variant="secondary" size="sm" onClick={() => onResolveGap(firstGap)}>
        Resolve Gap →
      </Button>
    </div>
  );
}
