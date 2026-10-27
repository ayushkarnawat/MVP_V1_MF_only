// frontend/src/components/ui/charts/scatter-chart.tsx
import { ParentSize } from "@visx/responsive";
import type { KeyboardEvent } from "react";
import { niceTicks } from "./use-morph";

export interface ScatterPoint {
  id: string;
  name: string;
  x: number;
  y: number;
  highlight?: boolean;
}

export interface ScatterChartProps {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  ariaLabel: string;
  onPointClick?: (id: string) => void;
  height?: number;
  width?: number;
}

function ScatterChartSvg({
  points,
  xLabel,
  yLabel,
  ariaLabel,
  onPointClick,
  width,
  height,
}: ScatterChartProps & { width: number; height: number }) {
  const plotWidth = Math.max(0, width - 56 - 16);
  const plotHeight = Math.max(0, height - 12 - 44);

  if (points.length === 0) {
    return (
      <svg role="group" aria-label={ariaLabel} viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
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
    );
  }

  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));

  const xTicks = niceTicks(minX, maxX);
  const yTicks = niceTicks(minY, maxY);

  const x0 = xTicks[0];
  const x1 = xTicks[xTicks.length - 1];
  const y0 = yTicks[0];
  const y1 = yTicks[yTicks.length - 1];

  const px = (v: number) => 56 + (plotWidth * (v - x0)) / (x1 - x0 || 1);
  const py = (v: number) => 12 + plotHeight * (1 - (v - y0) / (y1 - y0 || 1));

  const centerY = 12 + plotHeight / 2;
  const centerX = 56 + plotWidth / 2;

  return (
    <svg role="group" aria-label={ariaLabel} viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      {/* y-ticks and grid lines */}
      {yTicks.map(tick => {
        const yPos = py(tick);
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
              {tick}
            </text>
          </g>
        );
      })}

      {/* x-ticks */}
      {xTicks.map(tick => (
        <text
          key={tick}
          data-testid="x-tick"
          x={px(tick)}
          y={12 + plotHeight + 16}
          textAnchor="middle"
          fill="var(--ui-text-muted)"
          fontSize={11}
        >
          {tick}
        </text>
      ))}

      {/* x-axis title */}
      <text
        data-testid="x-axis-title"
        x={centerX}
        y={height - 6}
        textAnchor="middle"
        fill="var(--ui-text-muted)"
        fontSize={12}
      >
        {xLabel}
      </text>

      {/* y-axis title */}
      <text
        data-testid="y-axis-title"
        x={14}
        y={centerY}
        textAnchor="middle"
        transform={`rotate(-90, 14, ${centerY})`}
        fill="var(--ui-text-muted)"
        fontSize={12}
      >
        {yLabel}
      </text>

      {/* points */}
      {points.map(pt => {
        const isHighlighted = Boolean(pt.highlight);
        const cx = px(pt.x);
        const cy = py(pt.y);
        const r = isHighlighted ? 8 : 5;
        const fill = isHighlighted ? "var(--c2)" : "var(--c3)";
        const fillOpacity = isHighlighted ? 1 : 0.7;
        const stroke = isHighlighted ? "var(--ui-text)" : "none";
        const strokeWidth = isHighlighted ? 2 : 0;
        const ariaLabelText = `${pt.name}: ${xLabel} ${pt.x}, ${yLabel} ${pt.y}`;

        const handleClick = () => {
          onPointClick?.(pt.id);
        };

        const handleKeyDown = (e: KeyboardEvent<SVGGElement>) => {
          if (onPointClick && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onPointClick(pt.id);
          }
        };

        return (
          <g
            key={pt.id}
            data-testid={`point-${pt.id}`}
            data-highlight={isHighlighted ? "true" : "false"}
            role={onPointClick ? "button" : undefined}
            tabIndex={onPointClick ? 0 : undefined}
            aria-label={ariaLabelText}
            onClick={onPointClick ? handleClick : undefined}
            onKeyDown={onPointClick ? handleKeyDown : undefined}
            style={{ cursor: onPointClick ? "pointer" : "default" }}
          >
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={fill}
              fillOpacity={fillOpacity}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function ScatterChart({ width, height = 280, ...rest }: ScatterChartProps) {
  if (width !== undefined) {
    return <ScatterChartSvg {...rest} width={width} height={height} />;
  }
  return (
    <div style={{ width: "100%", height }}>
      <ParentSize debounceTime={10}>
        {({ width: parentWidth }) =>
          parentWidth > 0 ? <ScatterChartSvg {...rest} width={parentWidth} height={height} /> : null
        }
      </ParentSize>
    </div>
  );
}
