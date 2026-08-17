import { useMemo } from "react";
import { area as d3Area, curveMonotoneX, line as d3Line } from "d3-shape";
import { ShieldCheck, TrendingUp, Sparkles } from "lucide-react";

const SPARKLINE_POINTS = [42, 47, 45, 54, 50, 60, 57, 68, 64, 76, 72, 82, 78, 92];
const CHART_WIDTH = 380;
const CHART_HEIGHT = 100;

export function AuthShowcasePanel() {
  const { linePath, areaPath } = useMemo(() => {
    const minVal = Math.min(...SPARKLINE_POINTS);
    const maxVal = Math.max(...SPARKLINE_POINTS);
    const range = maxVal - minVal || 1;
    const coords = SPARKLINE_POINTS.map((val, idx) => ({
      x: (idx / (SPARKLINE_POINTS.length - 1)) * CHART_WIDTH,
      y: CHART_HEIGHT - ((val - minVal) / range) * (CHART_HEIGHT - 20) - 10,
    }));

    const lineGenerator = d3Line<{ x: number; y: number }>()
      .x((d) => d.x)
      .y((d) => d.y)
      .curve(curveMonotoneX);
    const areaGenerator = d3Area<{ x: number; y: number }>()
      .x((d) => d.x)
      .y0(CHART_HEIGHT)
      .y1((d) => d.y)
      .curve(curveMonotoneX);

    return { linePath: lineGenerator(coords) ?? "", areaPath: areaGenerator(coords) ?? "" };
  }, []);

  return (
    <div className="relative w-full h-full min-h-[580px] lg:min-h-[640px] rounded-3xl bg-gradient-to-b from-[#0D1814] via-[#0A1310] to-[#070E0C] p-8 sm:p-10 lg:p-12 flex flex-col justify-between overflow-hidden select-none text-white border border-emerald-950/40 shadow-xl">
      {/* Subtle Atmospheric Ambient Lighting */}
      <div
        className="absolute -top-32 -right-32 w-96 h-96 bg-[var(--color-accent)]/10 rounded-full blur-[120px] pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-32 -left-32 w-96 h-96 bg-emerald-600/8 rounded-full blur-[120px] pointer-events-none"
        aria-hidden="true"
      />

      {/* 1. Refined Editorial Headline */}
      <div className="relative z-10 space-y-3.5 text-left max-w-md">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 text-[var(--color-accent)] text-xs font-semibold tracking-wide">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Wealth Intelligence Standard</span>
        </div>

        <div className="space-y-2">
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-white tracking-tight leading-[1.15]">
            A unified view of everything you own.
          </h2>
          <p className="text-xs sm:text-sm text-stone-300/75 leading-relaxed font-body">
            Automated CAS ingestion across CAMS and KFintech with direct-plan alpha analysis and household wealth intelligence.
          </p>
        </div>
      </div>

      {/* 2. Restrained, Editorial Wealth Visualization */}
      <div className="relative z-10 space-y-6 my-auto py-6">
        {/* Main Growth Metric Display */}
        <div className="space-y-4 text-left">
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 font-body">
                Consolidated Portfolio Value
              </span>
              <div className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight">
                ₹84,29,400
              </div>
            </div>

            {/* XIRR Return Pill */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/30 text-[var(--color-accent)] text-xs font-bold font-mono shadow-xs mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>+16.4% XIRR</span>
            </div>
          </div>

          {/* D3 Smooth Performance Graph with Soft Area Glow */}
          <div className="pt-2">
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              className="w-full h-20 text-[var(--color-accent)] overflow-visible"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="editorialAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.28" />
                  <stop offset="70%" stopColor="var(--color-accent)" stopOpacity="0.05" />
                  <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#editorialAreaGrad)" stroke="none" />
              <path d={linePath} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        {/* Minimalist Key Metric Pillars */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/[0.08] text-left">
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wider text-stone-400 font-medium font-body">
              Direct Alpha
            </div>
            <div className="text-sm sm:text-base font-bold text-[var(--color-accent)] font-mono">
              +1.42% <span className="text-[10px] text-stone-400 font-normal">/yr</span>
            </div>
          </div>

          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wider text-stone-400 font-medium font-body">
              Coverage
            </div>
            <div className="text-sm sm:text-base font-bold text-white font-mono">
              100% <span className="text-[10px] text-stone-400 font-normal">Ingested</span>
            </div>
          </div>

          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wider text-stone-400 font-medium font-body">
              Household
            </div>
            <div className="text-sm sm:text-base font-bold text-white font-mono">
              Combined <span className="text-[10px] text-stone-400 font-normal">PAN</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Discreet Trust Footnote */}
      <div className="relative z-10 pt-4 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-stone-400 font-body">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-accent)]" />
          <span>Read-only CAS ingestion</span>
        </div>
        <div className="text-stone-400">
          Zero commission bias
        </div>
      </div>
    </div>
  );
}
