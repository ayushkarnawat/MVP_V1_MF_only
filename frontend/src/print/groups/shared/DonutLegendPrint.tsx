import { SlicedDonut } from "../../../features/mutual-funds/common/charts";
import type { Slice } from "../../../features/mutual-funds/types";
import { formatPercent, formatRupees } from "../../../lib/format";

export interface DonutLegendSlice {
  key: string;
  label: string;
  value: string;
  percent: string;
}

export interface DonutLegendPrintProps {
  slices: DonutLegendSlice[];
  centreLabel: string;
  centreValue: string;
}

const noop = () => {};

export function DonutLegendPrint({ slices, centreLabel, centreValue }: DonutLegendPrintProps) {
  if (slices.length === 0) return null;

  const donutSlices: Slice[] = slices.map((item, index) => ({
    key: item.key,
    label: item.label,
    value: item.value,
    pct: item.percent,
    color: `var(--c${(index % 8) + 1})`,
  }));

  return (
    <div className="flex items-center gap-8">
      <div className="shrink-0 max-w-full">
        <SlicedDonut
          slices={donutSlices}
          selectedKey={null}
          onSelect={noop}
          activeKey={null}
          onActiveChange={noop}
          centre={{ label: centreLabel, value: centreValue }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <table className="table-fixed w-full border-collapse text-xs">
          <tbody>
            {donutSlices.map(slice => (
              <tr key={slice.key} data-testid={`legend-${slice.key}`} className="break-inside-avoid">
                <td className="py-1.5 pr-3 align-top">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span
                      aria-hidden="true"
                      data-testid={`legend-dot-${slice.key}`}
                      style={{ backgroundColor: slice.color }}
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                    />
                    <span className="font-medium text-[var(--ui-text)] break-words">
                      {slice.label}
                    </span>
                  </div>
                </td>
                <td className="w-16 py-1.5 pr-3 text-right align-top font-semibold tabular-nums whitespace-nowrap text-[var(--ui-text)]">
                  {formatPercent(slice.pct, { digits: 1 })}
                </td>
                <td className="w-28 py-1.5 text-right align-top tabular-nums whitespace-nowrap text-[var(--ui-text-muted)]">
                  {formatRupees(slice.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
