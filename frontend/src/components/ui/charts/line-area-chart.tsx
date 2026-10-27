// frontend/src/components/ui/charts/line-area-chart.tsx
import { ParentSize } from "@visx/responsive";
import { area as d3Area, curveMonotoneX, line as d3Line } from "d3-shape";
import { useId, useState, type PointerEvent } from "react";
import { indexFromClientX } from "@/lib/chartPointer";
import { niceTicks, useMorph } from "./use-morph";

export interface LineSeries {
  key: string;
  name: string;
  color: string;
  values: number[];
  area?: boolean;
  visible?: boolean;
}

export interface SecondSeries {
  name: string;
  color: string;
  values: number[];
}

export interface LineAreaChartProps {
  series: LineSeries[];
  secondSeries?: SecondSeries;
  labels: (index: number) => string;
  tooltipLabel?: (index: number) => string;
  formatValue: (value: number) => string;
  formatPercent?: (value: number) => string;
  ariaLabel: string;
  height?: number;
  width?: number;
}

function LineAreaChartSvg({
  series,
  secondSeries,
  labels,
  tooltipLabel,
  formatValue,
  formatPercent = (v: number) => `${v}%`,
  ariaLabel,
  width,
  height,
}: LineAreaChartProps & { width: number; height: number }) {
  const uid = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const marginRight = secondSeries ? 52 : 12;
  const plotWidth = Math.max(0, width - 56 - marginRight);
  const plotHeight = Math.max(0, height - 12 - 24);

  const visibleSeries = series.filter(s => s.visible !== false);
  const pointCount = Math.max(
    0,
    ...visibleSeries.map(s => s.values.length),
    secondSeries ? secondSeries.values.length : 0,
  );

  const morphInput = [
    ...visibleSeries.map(s => s.values),
    ...(secondSeries ? [secondSeries.values] : []),
  ];
  const morphed = useMorph(morphInput);

  if (pointCount === 0 || visibleSeries.length === 0) {
    return (
      <div style={{ position: "relative", width, height }}>
        <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
          <rect
            data-testid="chart-frame"
            x={56}
            y={12}
            width={plotWidth}
            height={plotHeight}
            fill="none"
            stroke="var(--ui-divider)"
          />
        </svg>
      </div>
    );
  }

  const allVisibleValues = visibleSeries.flatMap(s => s.values);
  const yTicks = niceTicks(
    Math.min(...allVisibleValues),
    Math.max(...allVisibleValues),
  );
  const firstTick = yTicks[0];
  const lastTick = yTicks[yTicks.length - 1];
  const span = lastTick - firstTick || 1;

  const y = (v: number) => 12 + plotHeight * (1 - (v - firstTick) / span);
  const x = (i: number, n: number) => 56 + (n <= 1 ? plotWidth / 2 : (i * plotWidth) / (n - 1));

  const lineGen = d3Line<[number, number]>()
    .x(d => d[0])
    .y(d => d[1])
    .curve(curveMonotoneX);

  const areaGen = d3Area<[number, number]>()
    .x(d => d[0])
    .y0(12 + plotHeight)
    .y1(d => d[1])
    .curve(curveMonotoneX);

  let y2Ticks: number[] = [];
  let y2 = (_v: number) => 0;
  let secondMorphedValues: number[] = [];
  if (secondSeries && secondSeries.values.length > 0) {
    y2Ticks = niceTicks(Math.min(...secondSeries.values), Math.max(...secondSeries.values));
    const firstTick2 = y2Ticks[0];
    const lastTick2 = y2Ticks[y2Ticks.length - 1];
    const span2 = lastTick2 - firstTick2 || 1;
    y2 = (v: number) => 12 + plotHeight * (1 - (v - firstTick2) / span2);
    secondMorphedValues = morphed[visibleSeries.length] ?? secondSeries.values;
  }

  const labelStep = Math.max(1, Math.ceil(pointCount / 6));

  const handlePointerMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const idx = indexFromClientX(e.clientX, rect, pointCount, plotWidth, 0);
    setHoverIndex(idx);
  };

  const handlePointerLeave = () => {
    setHoverIndex(null);
  };

  const crosshairX = hoverIndex !== null ? x(hoverIndex, pointCount) : 0;
  const tooltipLeft = Math.min(Math.max(0, crosshairX + 10), width - 170);

  return (
    <div style={{ position: "relative", width, height }}>
      <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
        <defs>
          {visibleSeries.map(s => {
            if (!s.area) return null;
            return (
              <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            );
          })}
        </defs>

        {/* y-ticks & grid lines */}
        {yTicks.map(tick => {
          const yPos = y(tick);
          return (
            <g key={tick}>
              <line
                data-testid="grid-line"
                x1={56}
                x2={56 + plotWidth}
                y1={yPos}
                y2={yPos}
                stroke="var(--ui-divider)"
                strokeDasharray="3 3"
              />
              <text
                data-testid="y-tick"
                x={48}
                y={yPos}
                textAnchor="end"
                dominantBaseline="central"
                fill="var(--ui-text-muted)"
                fontSize={11}
              >
                {formatValue(tick)}
              </text>
            </g>
          );
        })}

        {/* secondSeries y2-ticks */}
        {secondSeries &&
          y2Ticks.map(tick => (
            <text
              key={tick}
              data-testid="y2-tick"
              x={56 + plotWidth + 8}
              y={y2(tick)}
              textAnchor="start"
              dominantBaseline="central"
              fill="var(--ui-text-muted)"
              fontSize={11}
            >
              {formatPercent(tick)}
            </text>
          ))}

        {/* x-labels */}
        {Array.from({ length: pointCount }, (_, i) => {
          if (i % labelStep !== 0) return null;
          return (
            <text
              key={i}
              data-testid="x-label"
              x={x(i, pointCount)}
              y={height - 6}
              textAnchor="middle"
              fill="var(--ui-text-muted)"
              fontSize={11}
            >
              {labels(i)}
            </text>
          );
        })}

        {/* series area & line / dots */}
        {visibleSeries.map((s, sIdx) => {
          const vals = morphed[sIdx] ?? s.values;
          if (vals.length === 1) {
            return (
              <circle
                key={s.key}
                data-testid={`series-dot-${s.key}`}
                cx={x(0, 1)}
                cy={y(vals[0])}
                r={4}
                fill={s.color}
              />
            );
          }
          if (vals.length > 1) {
            const points = vals.map((v, i) => [x(i, vals.length), y(v)] as [number, number]);
            return (
              <g key={s.key}>
                {s.area && (
                  <path
                    data-testid={`series-area-${s.key}`}
                    d={areaGen(points) ?? undefined}
                    fill={`url(#${uid}-${s.key})`}
                  />
                )}
                <path
                  data-testid={`series-line-${s.key}`}
                  d={lineGen(points) ?? undefined}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                />
              </g>
            );
          }
          return null;
        })}

        {/* secondSeries line */}
        {secondSeries && secondMorphedValues.length > 1 && (
          <path
            data-testid="series-line-second"
            d={
              lineGen(
                secondMorphedValues.map((v, i) => [x(i, secondMorphedValues.length), y2(v)] as [number, number]),
              ) ?? undefined
            }
            fill="none"
            stroke={secondSeries.color}
            strokeWidth={2}
          />
        )}

        {/* crosshair */}
        {hoverIndex !== null && (
          <line
            data-testid="crosshair"
            x1={crosshairX}
            x2={crosshairX}
            y1={12}
            y2={12 + plotHeight}
            stroke="var(--ui-divider)"
            strokeDasharray="3 3"
          />
        )}

        {/* interactive overlay */}
        <rect
          data-testid="chart-overlay"
          x={56}
          y={12}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          style={{ cursor: "crosshair" }}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        />
      </svg>

      {/* tooltip */}
      {hoverIndex !== null && (
        <div
          role="tooltip"
          data-testid="chart-tooltip"
          style={{
            position: "absolute",
            top: 8,
            left: tooltipLeft,
            pointerEvents: "none",
            background: "var(--ui-tooltip-bg)",
            color: "var(--ui-tooltip-text)",
            padding: "6px 10px",
            borderRadius: 4,
            fontSize: 12,
            lineHeight: 1.4,
            whiteSpace: "nowrap",
          }}
        >
          <div data-testid="tooltip-title">{(tooltipLabel ?? labels)(hoverIndex)}</div>
          {visibleSeries.map(s => {
            const val = s.values[hoverIndex];
            if (val === undefined) return null;
            return (
              <div key={s.key} data-testid="tooltip-row">
                {`${s.name}: ${formatValue(val)}`}
              </div>
            );
          })}
          {secondSeries && secondSeries.values[hoverIndex] !== undefined && (
            <div data-testid="tooltip-row">
              {`${secondSeries.name}: ${formatPercent(secondSeries.values[hoverIndex])}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function LineAreaChart({ width, height = 240, ...rest }: LineAreaChartProps) {
  if (width !== undefined) {
    return <LineAreaChartSvg {...rest} width={width} height={height} />;
  }
  return (
    <div style={{ width: "100%", height }}>
      <ParentSize debounceTime={10}>
        {({ width: parentWidth }) =>
          parentWidth > 0 ? <LineAreaChartSvg {...rest} width={parentWidth} height={height} /> : null
        }
      </ParentSize>
    </div>
  );
}
