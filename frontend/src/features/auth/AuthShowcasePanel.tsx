import { useMemo } from "react";
import { area as d3Area, curveMonotoneX, line as d3Line } from "d3-shape";

const SPARKLINE_POINTS = [12, 14, 13, 17, 16, 20, 19, 23];
const CHART_WIDTH = 220;
const CHART_HEIGHT = 80;

/** Static, illustrative visual for the auth screen's right-hand panel —
 * a structural placeholder only. Exact content is pending details the
 * product owner will provide separately (Frontend Spec, Open Items). No
 * backend dependency, no real user data — built on the same @visx/
 * d3-shape primitives FundSignal.tsx already uses elsewhere in this repo,
 * not @bklit (which isn't an installed dependency — see Frontend Spec
 * §0). This shape (static asset, no network call) should hold regardless
 * of what the final content turns out to be. */
export function AuthShowcasePanel() {
  const { linePath, areaPath } = useMemo(() => {
    const minVal = Math.min(...SPARKLINE_POINTS);
    const maxVal = Math.max(...SPARKLINE_POINTS);
    const range = maxVal - minVal || 1;
    const coords = SPARKLINE_POINTS.map((val, idx) => ({
      x: (idx / (SPARKLINE_POINTS.length - 1)) * CHART_WIDTH,
      y: CHART_HEIGHT - ((val - minVal) / range) * CHART_HEIGHT,
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
    <div className="flex flex-col justify-between h-full w-full min-h-[420px] p-10 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)]/60 overflow-hidden">
      <div className="flex items-center gap-2">
        <svg
          viewBox="0 0 100 100"
          className="w-6 h-6 text-[var(--color-accent)] fill-none stroke-current stroke-[10] stroke-linecap-round"
          aria-hidden="true"
        >
          <path d="M 50 10 A 40 40 0 0 1 90 50" />
        </svg>
        <span className="font-display font-bold text-sm text-[var(--color-ink)]">Unifolio</span>
      </div>

      <div className="space-y-4">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="w-full text-[var(--color-accent)]"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d={areaPath} fill="currentColor" fillOpacity="0.12" stroke="none" />
          <path d={linePath} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="space-y-1">
          <h2 className="font-display font-bold text-lg text-[var(--color-ink)]">
            A unified view of everything you own
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed max-w-xs">
            Track every fund, every family member, in one restrained, trustworthy place.
          </p>
        </div>
      </div>
    </div>
  );
}
