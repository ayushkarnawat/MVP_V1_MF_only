import { formatPercent } from "@/lib/format";
import type { OverlapCompareResponse } from "../types";
import { barWidth, maxDecimal } from "./overlapLogic";

interface FigureProps {
  value: string;
  widest: string;
  tone: string;
  testId: string;
}

function Figure({ value, widest, tone, testId }: FigureProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 tabular-nums text-xs text-[var(--ui-text)]">
        {formatPercent(value, { digits: 1 })}
      </span>
      <span aria-hidden="true" className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--ui-divider)]">
        <span
          data-testid={testId}
          style={{ width: `${barWidth(value, widest)}%`, background: tone }}
          className="block h-full"
        />
      </span>
    </div>
  );
}

export interface BarPanelsProps {
  data: OverlapCompareResponse;
}

export function SectorComparisonPanel({ data }: BarPanelsProps) {
  if (data.sector_comparison.length === 0) {
    return (
      <p data-testid="compare-sector-empty" className="text-sm text-[var(--ui-text-muted)]">
        No sector breakdown is available for these funds.
      </p>
    );
  }

  const nameA = data.fund_a.scheme_name;
  const nameB = data.fund_b.scheme_name;
  const allValues = data.sector_comparison.flatMap((s) => [s.common, s.a, s.b]);
  const widest = maxDecimal(allValues);

  return (
    <div className="max-h-96 overflow-auto">
      <table aria-label="Sector comparison" className="w-full text-left text-xs">
        <thead className="sticky top-0 border-b border-[var(--ui-divider)] bg-[var(--ui-elevated)]">
          <tr className="font-medium text-[var(--ui-text-muted)]">
            <th scope="col" className="pb-2 pr-4 font-medium">Sector</th>
            <th scope="col" className="pb-2 pr-4 font-medium">Common to both</th>
            <th scope="col" className="pb-2 pr-4 font-medium">{nameA}</th>
            <th scope="col" className="pb-2 pl-4 font-medium">{nameB}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--ui-divider)]">
          {data.sector_comparison.map((row) => {
            const commonFmt = formatPercent(row.common, { digits: 1 });
            const aFmt = formatPercent(row.a, { digits: 1 });
            const bFmt = formatPercent(row.b, { digits: 1 });
            const title = `${row.sector}: ${commonFmt} common to both, ${aFmt} of ${nameA}, ${bFmt} of ${nameB}`;

            return (
              <tr
                key={row.sector}
                data-testid={`sector-compare-${row.sector}`}
                title={title}
                className="hover:bg-[var(--ui-hover)]"
              >
                <th scope="row" className="py-2.5 pr-4 font-medium text-[var(--ui-text)]">
                  {row.sector}
                </th>
                <td className="py-2.5 pr-4">
                  <Figure
                    value={row.common}
                    widest={widest}
                    tone="var(--c2)"
                    testId={`sector-bar-common-${row.sector}`}
                  />
                </td>
                <td className="py-2.5 pr-4">
                  <Figure
                    value={row.a}
                    widest={widest}
                    tone="var(--c3)"
                    testId={`sector-bar-a-${row.sector}`}
                  />
                </td>
                <td className="py-2.5 pl-4">
                  <Figure
                    value={row.b}
                    widest={widest}
                    tone="var(--c4)"
                    testId={`sector-bar-b-${row.sector}`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const MARKET_CAP_ROWS: readonly {
  key: "large" | "mid" | "small" | "other";
  label: string;
}[] = [
  { key: "large", label: "Large Cap" },
  { key: "mid", label: "Mid Cap" },
  { key: "small", label: "Small Cap" },
  { key: "other", label: "Other" },
];

export function MarketCapPanel({ data }: BarPanelsProps) {
  const nameA = data.fund_a.scheme_name;
  const nameB = data.fund_b.scheme_name;

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--ui-text-muted)]">
        Share of each fund's stocks by company size.
      </p>

      <table aria-label="Market cap comparison" className="w-full text-left text-xs">
        <thead className="border-b border-[var(--ui-divider)]">
          <tr className="font-medium text-[var(--ui-text-muted)]">
            <th scope="col" className="pb-2 pr-4 font-medium">Size</th>
            <th scope="col" className="pb-2 pr-4 font-medium">{nameA}</th>
            <th scope="col" className="pb-2 pl-4 font-medium">{nameB}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--ui-divider)]">
          {MARKET_CAP_ROWS.map(({ key, label }) => {
            const valA = data.market_cap.a[key];
            const valB = data.market_cap.b[key];
            const aFmt = formatPercent(valA, { digits: 1 });
            const bFmt = formatPercent(valB, { digits: 1 });
            const title = `${label}: ${aFmt} of ${nameA}, ${bFmt} of ${nameB}`;

            return (
              <tr
                key={key}
                data-testid={`marketcap-${key}`}
                title={title}
                className="hover:bg-[var(--ui-hover)]"
              >
                <th scope="row" className="py-2.5 pr-4 font-medium text-[var(--ui-text)]">
                  {label}
                </th>
                <td className="py-2.5 pr-4">
                  <Figure
                    value={valA}
                    widest="100"
                    tone="var(--c3)"
                    testId={`marketcap-bar-a-${key}`}
                  />
                </td>
                <td className="py-2.5 pl-4">
                  <Figure
                    value={valB}
                    widest="100"
                    tone="var(--c4)"
                    testId={`marketcap-bar-b-${key}`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
