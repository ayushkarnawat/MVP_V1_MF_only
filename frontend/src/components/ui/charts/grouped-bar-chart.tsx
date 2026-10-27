// frontend/src/components/ui/charts/grouped-bar-chart.tsx
import { ParentSize } from "@visx/responsive";
import { useState, type KeyboardEvent } from "react";
import { niceTicks, useMorph } from "./use-morph";

export interface GroupedBucket {
  label: string;
  values: number[];
}

export interface GroupedBarChartProps {
  buckets: GroupedBucket[];
  seriesColors: string[];
  formatValue: (value: number) => string;
  ariaLabel: string;
  onBucketClick?: (index: number) => void;
  height?: number;
  width?: number;
}

function GroupedBarChartSvg({
  buckets,
  seriesColors,
  formatValue,
  ariaLabel,
  onBucketClick,
  width,
  height,
}: GroupedBarChartProps & { width: number; height: number }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const plotWidth = Math.max(0, width - 12 - 12);
  const plotHeight = Math.max(0, height - 12 - 26);
  const seriesCount = seriesColors.length;

  const seriesArrays: number[][] = [];
  if (seriesCount > 0) {
    for (let s = 0; s < seriesCount; s++) {
      seriesArrays.push(buckets.map(b => b.values[s] ?? 0));
    }
  }

  const morphedSeries = useMorph(seriesArrays);
  const count = morphedSeries[0]?.length ?? 0;

  if (buckets.length === 0 || seriesCount === 0 || count === 0) {
    return (
      <svg role="group" aria-label={ariaLabel} viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
        <rect
          data-testid="chart-frame"
          x={12}
          y={12}
          width={plotWidth}
          height={plotHeight}
          fill="none"
          stroke="var(--ui-divider)"
        />
      </svg>
    );
  }

  const allTargetValues = buckets.flatMap(b => b.values);
  const yTicks = niceTicks(
    Math.min(0, ...allTargetValues),
    Math.max(0, ...allTargetValues),
  );
  const firstTick = yTicks[0];
  const lastTick = yTicks[yTicks.length - 1];
  const span = lastTick - firstTick || 1;

  const y = (v: number) => 12 + plotHeight * (1 - (v - firstTick) / span);
  const baselineY = y(0);

  const slot = plotWidth / count;
  const barWidth = Math.max(1, Math.min(slot * 0.7, slot - 2) / seriesCount - 2);
  const groupWidth = seriesCount * (barWidth + 2) - 2;

  return (
    <svg role="group" aria-label={ariaLabel} viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      <line
        data-testid="bar-baseline"
        x1={12}
        x2={12 + plotWidth}
        y1={baselineY}
        y2={baselineY}
        stroke="var(--ui-divider)"
      />

      {Array.from({ length: count }, (_, gIdx) => {
        const bucket = buckets[gIdx];
        const isDimmed = hoveredIndex !== null && hoveredIndex !== gIdx;
        const hasAction = Boolean(onBucketClick && bucket);

        const slotLeft = 12 + gIdx * slot;
        const groupLeft = slotLeft + (slot - groupWidth) / 2;

        const handleClick = () => {
          if (hasAction) onBucketClick?.(gIdx);
        };

        const handleKeyDown = (e: KeyboardEvent<SVGGElement>) => {
          if (hasAction && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onBucketClick?.(gIdx);
          }
        };

        return (
          <g
            key={gIdx}
            data-testid={`bucket-${gIdx}`}
            data-dimmed={isDimmed ? "true" : "false"}
            opacity={isDimmed ? 0.4 : 1}
            role={hasAction ? "button" : undefined}
            tabIndex={hasAction ? 0 : undefined}
            aria-label={
              hasAction && bucket
                ? `${bucket.label}: ${bucket.values.map(formatValue).join(", ")}`
                : undefined
            }
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            onPointerEnter={() => setHoveredIndex(gIdx)}
            onPointerLeave={() => setHoveredIndex(null)}
            style={{ cursor: hasAction ? "pointer" : "default" }}
          >
            {/* full-slot hit area */}
            <rect x={slotLeft} y={12} width={slot} height={plotHeight} fill="transparent" />

            {/* bars */}
            {Array.from({ length: seriesCount }, (_, sIdx) => {
              const val = morphedSeries[sIdx]?.[gIdx] ?? 0;
              const barYVal = y(val);
              const barY = Math.min(barYVal, baselineY);
              const barHeight = Math.abs(barYVal - baselineY);
              const barX = groupLeft + sIdx * (barWidth + 2);

              return (
                <rect
                  key={sIdx}
                  data-testid={`bar-${gIdx}-${sIdx}`}
                  x={barX}
                  y={barY}
                  width={barWidth}
                  height={barHeight}
                  rx={2}
                  fill={seriesColors[sIdx]}
                />
              );
            })}

            {/* bucket label */}
            {bucket && (
              <text
                data-testid="bucket-label"
                x={slotLeft + slot / 2}
                y={height - 8}
                textAnchor="middle"
                fill="var(--ui-text-muted)"
                fontSize={11}
              >
                {bucket.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function GroupedBarChart({ width, height = 220, ...rest }: GroupedBarChartProps) {
  if (width !== undefined) {
    return <GroupedBarChartSvg {...rest} width={width} height={height} />;
  }
  return (
    <div style={{ width: "100%", height }}>
      <ParentSize debounceTime={10}>
        {({ width: parentWidth }) =>
          parentWidth > 0 ? <GroupedBarChartSvg {...rest} width={parentWidth} height={height} /> : null
        }
      </ParentSize>
    </div>
  );
}
