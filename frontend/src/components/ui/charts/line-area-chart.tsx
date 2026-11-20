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

export interface ChartBenchmarkLine {
  id: string;
  label: string;
  color: string;
  points: { date: string; pct: string }[];
}

export interface LineAreaChartProps {
  series: LineSeries[];
  secondSeries?: SecondSeries;
  benchmarkLines?: ChartBenchmarkLine[];
  dates?: string[];
  labels: (index: number) => string;
  tooltipLabel?: (index: number) => string;
  formatValue: (value: number) => string;
  formatPercent?: (value: number) => string;
  ariaLabel: string;
  height?: number;
  width?: number;
}

interface ResolvedBenchmarkPoint {
  chartIndex: number;
  value: number;
}

interface ResolvedBenchmarkLine {
  id: string;
  label: string;
  color: string;
  points: ResolvedBenchmarkPoint[];
  valueAtIndex: Map<number, number>;
}

interface EndLabelItem {
  id: string;
  label: string;
  color: string;
  endX: number;
  endY: number;
  y: number;
}

function resolveBenchmarkLines(
  benchmarkLines: ChartBenchmarkLine[] | undefined,
  dates: string[] | undefined,
  pointCount: number,
  labels: (index: number) => string,
  tooltipLabel?: (index: number) => string,
): ResolvedBenchmarkLine[] {
  if (!benchmarkLines || benchmarkLines.length === 0 || pointCount === 0) return [];

  const parsedLines = benchmarkLines.map(line => ({
    id: line.id,
    label: line.label,
    color: line.color,
    points: line.points
      .map(pt => ({ date: pt.date, value: Number(pt.pct) }))
      .filter(pt => Number.isFinite(pt.value)),
  }));

  const allPointDates = new Set<string>();
  for (const line of parsedLines) {
    for (const pt of line.points) allPointDates.add(pt.date);
  }
  if (allPointDates.size === 0) return [];

  let dateToIndex: Map<string, number> | null = null;
  let orderedChartDates: string[] | null = null;

  if (dates && dates.length > 0) {
    dateToIndex = new Map<string, number>();
    orderedChartDates = dates;
    dates.forEach((d, idx) => dateToIndex!.set(d, idx));
  } else {
    const labelMap = new Map<string, number>();
    let matchedLabel = false;
    for (let i = 0; i < pointCount; i++) {
      const lbl = labels(i);
      labelMap.set(lbl, i);
      if (allPointDates.has(lbl)) matchedLabel = true;
    }
    if (matchedLabel) {
      dateToIndex = labelMap;
    } else if (tooltipLabel) {
      const tipMap = new Map<string, number>();
      let matchedTip = false;
      for (let i = 0; i < pointCount; i++) {
        const lbl = tooltipLabel(i);
        tipMap.set(lbl, i);
        if (allPointDates.has(lbl)) matchedTip = true;
      }
      if (matchedTip) dateToIndex = tipMap;
    }
  }

  let fallbackIndexMap: Map<string, { chartIndex: number; tooltipIndex: number }> | null = null;
  if (!dateToIndex) {
    const sortedDates = Array.from(allPointDates).sort();
    fallbackIndexMap = new Map();
    if (sortedDates.length <= pointCount) {
      const offset = pointCount - sortedDates.length;
      sortedDates.forEach((d, k) => {
        fallbackIndexMap!.set(d, { chartIndex: offset + k, tooltipIndex: offset + k });
      });
    } else {
      sortedDates.forEach((d, k) => {
        const idx = pointCount === 1 ? 0 : (k * (pointCount - 1)) / (sortedDates.length - 1);
        fallbackIndexMap!.set(d, { chartIndex: idx, tooltipIndex: Math.round(idx) });
      });
    }
  }

  const resolved: ResolvedBenchmarkLine[] = [];
  for (const line of parsedLines) {
    const byChartIndex = new Map<number, number>();
    const valueAtIndex = new Map<number, number>();

    for (const pt of line.points) {
      if (dateToIndex) {
        const exact = dateToIndex.get(pt.date);
        if (exact !== undefined) {
          byChartIndex.set(exact, pt.value);
          valueAtIndex.set(exact, pt.value);
        } else if (
          orderedChartDates &&
          orderedChartDates.length >= 2 &&
          pt.date > orderedChartDates[0] &&
          pt.date < orderedChartDates[orderedChartDates.length - 1]
        ) {
          const targetTs = Date.parse(pt.date);
          for (let k = 0; k < orderedChartDates.length - 1; k++) {
            if (orderedChartDates[k] < pt.date && pt.date < orderedChartDates[k + 1]) {
              const t0 = Date.parse(orderedChartDates[k]);
              const t1 = Date.parse(orderedChartDates[k + 1]);
              const frac = Number.isFinite(targetTs) && Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0
                ? (targetTs - t0) / (t1 - t0)
                : 0.5;
              byChartIndex.set(k + frac, pt.value);
              break;
            }
          }
        }
      } else if (fallbackIndexMap) {
        const mapped = fallbackIndexMap.get(pt.date);
        if (mapped) {
          byChartIndex.set(mapped.chartIndex, pt.value);
          valueAtIndex.set(mapped.tooltipIndex, pt.value);
        }
      }
    }

    const points = Array.from(byChartIndex.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([chartIndex, value]) => ({ chartIndex, value }));

    if (points.length > 0) {
      resolved.push({
        id: line.id,
        label: line.label,
        color: line.color,
        points,
        valueAtIndex,
      });
    }
  }

  return resolved;
}

function resolveEndLabelY(
  items: Omit<EndLabelItem, "y">[],
  minY: number,
  maxY: number,
  minGap = 20,
): EndLabelItem[] {
  if (items.length === 0) return [];

  const indexed = items
    .map((item, origIdx) => ({ ...item, origIdx }))
    .sort((a, b) => a.endY - b.endY || a.origIdx - b.origIdx);

  const n = indexed.length;
  const available = Math.max(0, maxY - minY);
  const gap = n > 1 ? Math.min(minGap, available / (n - 1)) : minGap;

  interface Cluster {
    indices: number[];
    center: number;
  }
  const clusters: Cluster[] = [];
  const clusterStart = (c: Cluster) => c.center - ((c.indices.length - 1) * gap) / 2;
  const clusterEnd = (c: Cluster) => c.center + ((c.indices.length - 1) * gap) / 2;

  for (let i = 0; i < n; i++) {
    const target = Math.min(maxY, Math.max(minY, indexed[i].endY));
    clusters.push({ indices: [i], center: target });

    while (clusters.length >= 2) {
      const prev = clusters[clusters.length - 2];
      const curr = clusters[clusters.length - 1];
      if (clusterEnd(prev) + gap <= clusterStart(curr) + 1e-6) break;
      const mergedIndices = [...prev.indices, ...curr.indices];
      const avg =
        mergedIndices.reduce(
          (sum, idx) => sum + Math.min(maxY, Math.max(minY, indexed[idx].endY)),
          0,
        ) / mergedIndices.length;
      clusters.splice(clusters.length - 2, 2, { indices: mergedIndices, center: avg });
    }
  }

  const ys = new Array<number>(n);
  for (const c of clusters) {
    let start = clusterStart(c);
    if (start < minY) start = minY;
    if (start + (c.indices.length - 1) * gap > maxY) {
      start = maxY - (c.indices.length - 1) * gap;
    }
    c.indices.forEach((idx, offset) => {
      ys[idx] = start + offset * gap;
    });
  }

  for (let i = 1; i < n; i++) {
    if (ys[i] < ys[i - 1] + gap) {
      ys[i] = ys[i - 1] + gap;
    }
  }
  if (ys[n - 1] > maxY) {
    ys[n - 1] = maxY;
    for (let i = n - 2; i >= 0; i--) {
      if (ys[i] > ys[i + 1] - gap) {
        ys[i] = ys[i + 1] - gap;
      }
    }
  }

  const resolved: EndLabelItem[] = new Array(n);
  indexed.forEach((item, sortedIdx) => {
    resolved[item.origIdx] = {
      id: item.id,
      label: item.label,
      color: item.color,
      endX: item.endX,
      endY: item.endY,
      y: Math.round(ys[sortedIdx] * 10) / 10,
    };
  });
  return resolved;
}

function LineAreaChartSvg({
  series,
  secondSeries,
  benchmarkLines,
  dates,
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

  const visibleSeries = series.filter(s => s.visible !== false);
  const pointCount = Math.max(
    0,
    ...visibleSeries.map(s => s.values.length),
    secondSeries ? secondSeries.values.length : 0,
  );

  const resolvedBenchmarkLines = resolveBenchmarkLines(
    benchmarkLines,
    dates,
    pointCount,
    labels,
    tooltipLabel,
  );
  const hasBenchmarkLines = resolvedBenchmarkLines.length > 0;

  const marginRight = hasBenchmarkLines ? 56 : secondSeries ? 52 : 12;
  const plotWidth = Math.max(0, width - 56 - marginRight);
  const plotHeight = Math.max(0, height - 12 - 24);

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
  if (hasBenchmarkLines) {
    const allRightValues = [
      ...resolvedBenchmarkLines.flatMap(line => line.points.map(pt => pt.value)),
      ...(secondSeries ? secondSeries.values : []),
    ];
    y2Ticks = niceTicks(Math.min(0, ...allRightValues), Math.max(0, ...allRightValues));
    const firstTick2 = y2Ticks[0];
    const lastTick2 = y2Ticks[y2Ticks.length - 1];
    const span2 = lastTick2 - firstTick2 || 1;
    y2 = (v: number) => 12 + plotHeight * (1 - (v - firstTick2) / span2);
    if (secondSeries && secondSeries.values.length > 0) {
      secondMorphedValues = morphed[visibleSeries.length] ?? secondSeries.values;
    }
  } else if (secondSeries && secondSeries.values.length > 0) {
    y2Ticks = niceTicks(Math.min(...secondSeries.values), Math.max(...secondSeries.values));
    const firstTick2 = y2Ticks[0];
    const lastTick2 = y2Ticks[y2Ticks.length - 1];
    const span2 = lastTick2 - firstTick2 || 1;
    y2 = (v: number) => 12 + plotHeight * (1 - (v - firstTick2) / span2);
    secondMorphedValues = morphed[visibleSeries.length] ?? secondSeries.values;
  }

  const benchmarkDrawings = resolvedBenchmarkLines.map(line => {
    const coords = line.points.map(pt => [x(pt.chartIndex, pointCount), y2(pt.value)] as [number, number]);
    const lastCoord = coords[coords.length - 1];
    return {
      line,
      coords,
      endX: lastCoord[0],
      endY: lastCoord[1],
    };
  });

  const endLabels = hasBenchmarkLines
    ? resolveEndLabelY(
        benchmarkDrawings.map(d => ({
          id: d.line.id,
          label: d.line.label,
          color: d.line.color,
          endX: d.endX,
          endY: d.endY,
        })),
        12 + 10,
        12 + plotHeight - 10,
        20,
      )
    : [];

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
  const tooltipLeft = Math.max(
    0,
    Math.min(crosshairX + 10, width - (hasBenchmarkLines ? 220 : 170)),
  );

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

        {/* right-hand percent y2-ticks */}
        {(secondSeries || hasBenchmarkLines) &&
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

        {/* benchmarkLines */}
        {benchmarkDrawings.map(({ line, coords, endX, endY }) => {
          if (coords.length === 1) {
            return (
              <circle
                key={line.id}
                data-testid={`benchmark-dot-${line.id}`}
                cx={endX}
                cy={endY}
                r={3.5}
                fill={line.color}
              />
            );
          }
          return (
            <g key={line.id}>
              <path
                data-testid={`benchmark-line-${line.id}`}
                d={lineGen(coords) ?? undefined}
                fill="none"
                stroke={line.color}
                strokeWidth={2}
              />
              <circle
                data-testid={`benchmark-end-dot-${line.id}`}
                cx={endX}
                cy={endY}
                r={3.5}
                fill={line.color}
              />
            </g>
          );
        })}

        {/* subtle leader lines when end labels are nudged apart */}
        {endLabels.map(item => {
          if (Math.abs(item.y - item.endY) <= 2) return null;
          const alignRight = item.endX >= 56 + 130;
          const anchorX = alignRight ? item.endX - 8 : item.endX + 8;
          return (
            <line
              key={`leader-${item.id}`}
              x1={anchorX}
              y1={item.y}
              x2={item.endX}
              y2={item.endY}
              stroke={item.color}
              strokeWidth={1}
              strokeOpacity={0.6}
            />
          );
        })}

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

      {/* benchmark end labels (real text outside svg role="img") */}
      {endLabels.map(item => {
        const alignRight = item.endX >= 56 + 130;
        return (
          <span
            key={item.id}
            data-testid={`end-label-${item.id}`}
            style={{
              position: "absolute",
              top: item.y,
              ...(alignRight
                ? { right: Math.max(4, width - (item.endX - 8)) }
                : { left: item.endX + 8 }),
              transform: "translateY(-50%)",
              pointerEvents: "none",
              color: item.color,
              background: "var(--ui-elevated)",
              border: "1px solid var(--ui-divider)",
              borderRadius: 4,
              padding: "1px 5px",
              fontSize: 11,
              fontWeight: 600,
              lineHeight: "14px",
              whiteSpace: "nowrap",
              zIndex: 1,
            }}
          >
            {item.label}
          </span>
        );
      })}

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
            zIndex: 2,
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
          {resolvedBenchmarkLines.map(line => {
            const val = line.valueAtIndex.get(hoverIndex);
            if (val === undefined) return null;
            return (
              <div
                key={line.id}
                data-testid="tooltip-row"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: line.color,
                    flexShrink: 0,
                  }}
                />
                <span>{`${line.label}: ${formatPercent(val)}`}</span>
              </div>
            );
          })}
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
