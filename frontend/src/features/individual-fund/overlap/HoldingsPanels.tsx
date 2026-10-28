import { formatPercent, formatRupees } from "@/lib/format";
import type { OverlapCompareResponse } from "../types";

export interface HoldingsPanelsProps {
  data: OverlapCompareResponse;
}

export function CommonHoldingsPanel({ data }: HoldingsPanelsProps) {
  if (data.common_holdings.length === 0) {
    return (
      <p data-testid="compare-common-empty" className="text-sm text-[var(--ui-text-muted)]">
        These two funds hold no stock in common.
      </p>
    );
  }

  const nameA = data.fund_a.scheme_name;
  const nameB = data.fund_b.scheme_name;

  return (
    <div className="max-h-96 overflow-auto">
      <table aria-label="Common holdings of the two funds" className="w-full text-left text-xs">
        <thead className="sticky top-0 border-b border-[var(--ui-divider)] bg-[var(--ui-elevated)]">
          <tr className="font-medium text-[var(--ui-text-muted)]">
            <th scope="col" className="pb-2 pr-4 font-medium">Stock</th>
            <th scope="col" className="pb-2 pr-4 font-medium">Sector</th>
            <th scope="col" className="pb-2 pr-4 font-medium">{nameA}</th>
            <th scope="col" className="pb-2 pr-4 font-medium">{nameB}</th>
            <th scope="col" className="pb-2 pl-4 font-medium">Combined</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--ui-divider)]">
          {data.common_holdings.map((h) => {
            const wA = formatPercent(h.weight_a, { digits: 1 });
            const wB = formatPercent(h.weight_b, { digits: 1 });
            const rupees = formatRupees(h.combined);
            const title = `${h.name}: ${wA} of ${nameA}, ${wB} of ${nameB}, ${rupees} combined`;

            return (
              <tr
                key={h.isin}
                data-testid={`compare-common-${h.isin}`}
                title={title}
                className="hover:bg-[var(--ui-hover)]"
              >
                <td className="py-2.5 pr-4 font-medium text-[var(--ui-text)]">{h.name}</td>
                <td className="py-2.5 pr-4 text-[var(--ui-text-muted)]">{h.sector}</td>
                <td className="py-2.5 pr-4 tabular-nums text-[var(--ui-text)]">{wA}</td>
                <td className="py-2.5 pr-4 tabular-nums text-[var(--ui-text)]">{wB}</td>
                <td className="py-2.5 pl-4 tabular-nums text-[var(--ui-text)]">{rupees}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function UniqueHoldingsPanel({ data }: HoldingsPanelsProps) {
  const nameA = data.fund_a.scheme_name;
  const nameB = data.fund_b.scheme_name;

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--ui-text-muted)]">
        The five largest stocks only one of the two funds holds.
      </p>

      <div className="grid gap-6 min-[900px]:grid-cols-2">
        <section
          aria-labelledby="unique-a"
          className="space-y-3 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4"
        >
          <h4 id="unique-a" className="text-sm font-semibold text-[var(--ui-text)]">
            {`Unique to ${nameA}`}
          </h4>
          {data.unique_holdings.a.length === 0 ? (
            <p data-testid="unique-a-empty" className="text-xs text-[var(--ui-text-muted)]">
              {`Every stock ${nameA} holds is also in ${nameB}.`}
            </p>
          ) : (
            <ul className="space-y-2">
              {data.unique_holdings.a.map((stock) => (
                <li
                  key={stock.isin}
                  title={`${stock.name} (${stock.sector}): ${formatPercent(stock.weight, { digits: 1 })} of the fund`}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-[var(--ui-text)]">
                    {stock.name} <span className="text-[var(--ui-text-muted)]">{stock.sector}</span>
                  </span>
                  <span className="tabular-nums text-[var(--ui-text)]">
                    {formatPercent(stock.weight, { digits: 1 })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="unique-b"
          className="space-y-3 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4"
        >
          <h4 id="unique-b" className="text-sm font-semibold text-[var(--ui-text)]">
            {`Unique to ${nameB}`}
          </h4>
          {data.unique_holdings.b.length === 0 ? (
            <p data-testid="unique-b-empty" className="text-xs text-[var(--ui-text-muted)]">
              {`Every stock ${nameB} holds is also in ${nameA}.`}
            </p>
          ) : (
            <ul className="space-y-2">
              {data.unique_holdings.b.map((stock) => (
                <li
                  key={stock.isin}
                  title={`${stock.name} (${stock.sector}): ${formatPercent(stock.weight, { digits: 1 })} of the fund`}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-[var(--ui-text)]">
                    {stock.name} <span className="text-[var(--ui-text-muted)]">{stock.sector}</span>
                  </span>
                  <span className="tabular-nums text-[var(--ui-text)]">
                    {formatPercent(stock.weight, { digits: 1 })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
