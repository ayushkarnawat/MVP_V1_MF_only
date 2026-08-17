import { useEffect, useState } from "react";
import { ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Fund Signal ring geometry (Design Brief's Signature Element / Design Schema
// §Fund Signal) — a ring-plus-arc, echoing the logomark's own arc motif,
// rather than a generic circular progress indicator.
const RING_SIZE = 168;
const RING_STROKE = 18;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
// Illustrative fill for this marketing panel's demo figures, not a literal
// mapping of the XIRR value below — the real per-holding Fund Signal ties
// its fill to that fund's actual performance.
const RING_FILL_FRACTION = 0.8;

export function AuthShowcasePanel() {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const dashOffset = revealed
    ? RING_CIRCUMFERENCE * (1 - RING_FILL_FRACTION)
    : RING_CIRCUMFERENCE;

  return (
    <div className="relative w-full h-full min-h-[580px] lg:min-h-[640px] rounded-3xl bg-[var(--color-bg)] border border-[var(--color-border)] p-8 sm:p-10 lg:p-12 flex flex-col justify-between overflow-hidden select-none text-[var(--color-ink)]">
      {/* 1. Headline */}
      <div className="space-y-3.5 text-left max-w-md">
        <Badge variant="accent" className="tracking-wide">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Wealth Intelligence Standard</span>
        </Badge>

        <div className="space-y-2">
          <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight leading-[1.15]">
            A unified view of everything you own.
          </h2>
          <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed font-body">
            Automated CAS ingestion across CAMS and KFintech with direct-plan alpha analysis and household wealth intelligence.
          </p>
        </div>
      </div>

      {/* 2. Fund Signal — the signature dial, plus supporting figures */}
      <div className="my-auto py-6 flex flex-col items-center gap-8 text-center">
        <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
          <svg
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            className="-rotate-90"
            aria-hidden="true"
          >
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth={RING_STROKE}
            />
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              style={{ transition: "stroke-dashoffset var(--motion-reveal)" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display font-bold text-3xl tracking-tight tabular-nums">
              +16.4%
            </span>
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)] font-body mt-0.5">
              XIRR
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] font-body">
            Consolidated Portfolio Value
          </div>
          <div className="font-display font-bold text-3xl sm:text-4xl tracking-tight tabular-nums">
            ₹84,29,400
          </div>
        </div>

        {/* Minimalist Key Metric Pillars */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[var(--color-border)] w-full max-w-sm">
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] font-medium font-body">
              Direct Alpha
            </div>
            <div className="text-sm sm:text-base font-bold text-[var(--color-positive)] font-body tabular-nums">
              +1.42% <span className="text-[10px] text-[var(--color-text-secondary)] font-normal">/yr</span>
            </div>
          </div>

          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] font-medium font-body">
              Coverage
            </div>
            <div className="text-sm sm:text-base font-bold font-body tabular-nums">
              100% <span className="text-[10px] text-[var(--color-text-secondary)] font-normal">Ingested</span>
            </div>
          </div>

          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] font-medium font-body">
              Household
            </div>
            <div className="text-sm sm:text-base font-bold font-body tabular-nums">
              Combined <span className="text-[10px] text-[var(--color-text-secondary)] font-normal">PAN</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Trust footnote */}
      <div className="pt-4 border-t border-[var(--color-border)] flex items-center justify-between text-[11px] text-[var(--color-text-secondary)] font-body">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-accent)]" />
          <span>Read-only CAS ingestion</span>
        </div>
        <div>
          Zero commission bias
        </div>
      </div>
    </div>
  );
}
