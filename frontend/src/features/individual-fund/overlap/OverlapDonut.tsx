import { PieChart, PieSlice } from "@/components/ui/charts";
import { diffDecimalStrings } from "@/lib/decimal";
import { formatPercent } from "@/lib/format";

export interface OverlapDonutProps {
  pct: string;
  label: string;
  caption: string;
}

export function OverlapDonut({ pct, label, caption }: OverlapDonutProps) {
  const figure = formatPercent(pct, { digits: 1 });
  const rest = diffDecimalStrings("100", pct);
  const restNum = Number(rest);
  const restValue = Number.isFinite(restNum) && restNum > 0 ? restNum : 0;

  const data = [
    { label: "Overlap", value: Number(pct), color: "var(--c2)", formattedValue: pct },
    { label: "Not overlapping", value: restValue, color: "var(--ui-divider)", formattedValue: rest },
  ];

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div
        data-testid="overlap-donut"
        role="img"
        aria-label={`Overlap ${figure}`}
        className="relative h-40 w-40 shrink-0"
      >
        <PieChart data={data} size={160} innerRadius={56} padAngle={0.02} cornerRadius={3} className="h-full w-full">
          {data.map((slice, index) => (
            <PieSlice key={slice.label} index={index} />
          ))}
        </PieChart>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span data-testid="overlap-donut-figure" className="text-xl font-bold text-[var(--ui-text)]">
            {figure}
          </span>
        </div>
      </div>
      <div className="min-w-0 space-y-1 text-center sm:text-left">
        <p data-testid="overlap-donut-label" className="text-sm font-medium text-[var(--ui-text)]">
          {label}
        </p>
        <p data-testid="overlap-donut-caption" className="text-xs text-[var(--ui-text-muted)]">
          {caption}
        </p>
      </div>
    </div>
  );
}
