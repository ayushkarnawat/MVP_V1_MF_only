import { formatPercent } from "@/lib/format";
import type { OverlapCommonHolding } from "../types";

export interface CommonHoldingsTableProps {
  holdings: OverlapCommonHolding[];
}

export function CommonHoldingsTable({ holdings }: CommonHoldingsTableProps) {
  if (holdings.length === 0) {
    return (
      <p data-testid="common-empty" className="text-sm text-[var(--ui-text-muted)]">
        None of this fund's stocks are held by your other funds.
      </p>
    );
  }

  return (
    <div className="max-h-96 overflow-auto">
      <table aria-label="Common holdings" className="w-full text-left text-xs">
        <thead className="sticky top-0 bg-[var(--ui-elevated)] border-b border-[var(--ui-divider)]">
          <tr className="text-[var(--ui-text-muted)] font-medium">
            <th scope="col" className="pb-2 pr-4 font-medium">Stock</th>
            <th scope="col" className="pb-2 pr-4 font-medium">Sector</th>
            <th scope="col" className="pb-2 pr-4 font-medium">In this fund</th>
            <th scope="col" className="pb-2 pr-4 font-medium text-right">Of your portfolio</th>
            <th scope="col" className="pb-2 pl-4 font-medium">Also held in</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--ui-divider)]">
          {holdings.map((h) => (
            <tr key={h.isin} data-testid={`common-row-${h.isin}`} className="hover:bg-[var(--ui-hover)]">
              <td className="py-2.5 pr-4 font-bold text-[var(--ui-text)]">{h.name}</td>
              <td className="py-2.5 pr-4 text-[var(--ui-text-muted)]">{h.sector}</td>
              <td className="py-2.5 pr-4 tabular-nums text-[var(--ui-text)]">
                {formatPercent(h.fund_weight, { digits: 1 })}
              </td>
              <td className="py-2.5 pr-4 tabular-nums text-right text-[var(--ui-text)]">
                {formatPercent(h.portfolio_weight, { digits: 1 })}
              </td>
              <td className="py-2.5 pl-4 text-[var(--ui-text-muted)]">
                {h.held_in_funds.map((f) => f.scheme_name).join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
