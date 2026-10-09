// frontend/src/components/ui/charts/bar-chart.tsx
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { Bar } from "@visx/shape";
import { useEffect, useRef, type KeyboardEvent } from "react";

export interface BarChartDatum {
  period: string;
  invested: number;
  withdrawn: number;
}

export interface BarChartProps {
  data: BarChartDatum[];
  selectedPeriod?: string | null;
  onBarClick?: (period: string) => void;
  /** Axis label and accessible name for a period; defaults to the period itself. */
  formatLabel?: (period: string) => string;
  /** Fixed width skips ParentSize (tests, fixed layouts). */
  width?: number;
  height?: number;
}

const MARGIN = { top: 8, right: 8, bottom: 8, left: 8 };
const GAP = 2;
const LABEL_BAND = 18; // room under the plot for period labels
const MIN_LABEL_SPACING = 48; // px per label before they start to collide
// Below this a period can't be tapped (20 years of months on a phone would be
// ~1px each), so the chart scrolls sideways instead of squeezing.
const MIN_SLOT = 12;

// Scales are two lines of arithmetic, so no d3-scale (not a direct dependency).
function BarChartSvg({ data, selectedPeriod, onBarClick, formatLabel = (p) => p, width, height }: BarChartProps & { width: number; height: number }) {
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = Math.max(0, height - MARGIN.top - MARGIN.bottom - LABEL_BAND);
  // Label every period when they fit, otherwise every Nth -- 20 years of months
  // on a phone would be an unreadable smear.
  const maxLabels = Math.max(1, Math.floor(plotWidth / MIN_LABEL_SPACING));
  const labelStep = Math.max(1, Math.ceil(data.length / maxLabels));
  const maxValue = Math.max(1, ...data.map((d) => Math.max(d.invested, d.withdrawn)));
  const slot = data.length ? plotWidth / data.length : 0;
  // Two bars and the gap always fit inside their slot.
  const barWidth = Math.max(0.5, Math.min(slot * 0.35, (slot - GAP) / 2));
  // A negative bucket (a bounced SIP's reversal posted in a later month) draws
  // as a zero-height bar on purpose; its transactions still show on tap.
  const barHeight = (value: number) => Math.round((Math.max(0, value) / maxValue) * plotHeight);

  return (
    // role="group", not "img": an image hides its children from assistive tech,
    // and each period inside is a button.
    <svg width={width} height={height} style={{ display: "block" }} role="group" aria-label="Invested and withdrawn by period">
      <Group left={MARGIN.left} top={MARGIN.top}>
        {data.map((d, i) => {
          const x = i * slot + (slot - (2 * barWidth + GAP)) / 2;
          const investedHeight = barHeight(d.invested);
          const withdrawnHeight = barHeight(d.withdrawn);
          const dimmed = !!selectedPeriod && selectedPeriod !== d.period;
          const label = formatLabel(d.period);
          return (
            <Group
              key={d.period}
              data-testid={`bar-group-${d.period}`}
              role={onBarClick ? "button" : undefined}
              tabIndex={onBarClick ? 0 : undefined}
              aria-label={label}
              aria-pressed={onBarClick ? selectedPeriod === d.period : undefined}
              onClick={() => onBarClick?.(d.period)}
              onKeyDown={(e: KeyboardEvent) => {
                if (onBarClick && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onBarClick(d.period);
                }
              }}
              style={{ cursor: onBarClick ? "pointer" : "default", opacity: dimmed ? 0.4 : 1 }}
            >
              {/* Full-height transparent hit area, so a zero-height period is still tappable. */}
              <rect x={i * slot} y={0} width={slot} height={plotHeight} fill="transparent" />
              <Bar
                data-testid={`bar-invested-${d.period}`}
                x={x}
                y={plotHeight - investedHeight}
                width={barWidth}
                height={investedHeight}
                fill="var(--color-positive)"
              />
              <Bar
                data-testid={`bar-withdrawn-${d.period}`}
                x={x + barWidth + GAP}
                y={plotHeight - withdrawnHeight}
                width={barWidth}
                height={withdrawnHeight}
                fill="var(--color-negative)"
              />
              {i % labelStep === 0 && (
                <text
                  x={i === 0 ? 0 : i * slot + slot / 2}
                  y={plotHeight + 13}
                  textAnchor={i === 0 ? "start" : "middle"}
                  fontSize={10}
                  fill="var(--color-text-secondary)"
                >
                  {label}
                </text>
              )}
            </Group>
          );
        })}
      </Group>
    </svg>
  );
}

/** Scrolls sideways when the periods need more room than `available`;
 * opens scrolled to the end, so the latest periods are in view. */
function ScrollingChart({ available, height, ...rest }: BarChartProps & { available: number; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const contentWidth = Math.max(available, rest.data.length * MIN_SLOT + MARGIN.left + MARGIN.right);
  useEffect(() => {
    if (ref.current) ref.current.scrollLeft = ref.current.scrollWidth;
  }, [contentWidth]);
  return (
    <div ref={ref} data-testid="bar-chart-scroll" style={{ overflowX: "auto", overflowY: "hidden" }}>
      <BarChartSvg {...rest} width={contentWidth} height={height} />
    </div>
  );
}

export function BarChart({ width, height = 200, ...rest }: BarChartProps) {
  if (width !== undefined) return <ScrollingChart {...rest} available={width} height={height} />;
  return (
    // minHeight, not height: a scrollbar adds to the chart instead of clipping its labels.
    <div style={{ minHeight: height }}>
      <ParentSize debounceTime={10}>
        {({ width: parentWidth }) => <ScrollingChart {...rest} available={parentWidth} height={height} />}
      </ParentSize>
    </div>
  );
}
