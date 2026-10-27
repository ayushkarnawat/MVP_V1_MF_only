import { formatPercent } from "../../../lib/format";
import { AppLink } from "../../../shell/nav/AppLink";
import type { AnalyticsCardProps } from "../allocation/allocationLogic";
import { SectionCard } from "../common/SectionCard";
import { excludedFundCount } from "../mfCopy";
import type { OverlapSummary } from "../types";
import {
  allStocksPath,
  concentrationCurve,
  headlinePoint,
} from "./overlapLogic";

export function StockConcentration({
  state,
  data,
  onRetry,
}: AnalyticsCardProps<OverlapSummary>) {
  const to = allStocksPath();
  const TIP = "View the full ranked stock list on the Holdings page";

  const curve = data ? concentrationCurve(data.concentration) : { points: [], line: "" };
  const hp = data ? headlinePoint(data.concentration) : null;
  const excluded = data ? excludedFundCount(data.coverage) : 0;

  return (
    <SectionCard
      title="5. Stock Concentration"
      info="How much of your total portfolio sits in just your top few stocks by weight, cumulatively — a different lens from Common Holdings above, which only counts stocks shared across more than one fund."
      state={state}
      onRetry={onRetry}
    >
      {data && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--ui-text-muted)]">
            Click the headline, the chart, or any point below to see the full ranked stock list on the Holdings page.
          </p>

          {data.concentration.length === 0 ? (
            <p data-testid="conc-empty" className="text-sm text-[var(--ui-text-muted)]">
              No stock concentration data yet.
            </p>
          ) : (
            <>
              {!data.hide_headlines && hp !== null && (
                <div>
                  <AppLink to={to} className="inline-block hover:underline">
                    <span
                      data-testid="conc-headline"
                      data-clickable=""
                      data-effect="navigate"
                      title={TIP}
                      className="text-sm font-semibold text-[var(--ui-text)]"
                    >
                      Top {hp.stock_count} stocks represent {formatPercent(hp.exposure_pct, { digits: 1 })} of your total MF portfolio — view all stocks
                    </span>
                  </AppLink>
                </div>
              )}

              {data.hide_headlines && (
                <p data-testid="conc-hidden-note" className="text-xs text-[var(--ui-text-muted)]">
                  The headline figure is hidden while published holdings cover less than 50% of your portfolio.
                </p>
              )}

              <div className="w-full overflow-x-auto">
                <AppLink to={to} className="inline-block w-full">
                  <span
                    data-testid="conc-chart-link"
                    data-clickable=""
                    data-effect="navigate"
                    title={TIP}
                    className="block w-full"
                  >
                    <svg
                      viewBox="0 0 600 180"
                      role="img"
                      aria-label="Cumulative exposure of your largest stocks"
                      data-testid="conc-chart"
                      className="w-full h-auto max-h-48"
                    >
                      <line x1="40" x2="560" y1="160" y2="160" stroke="var(--ui-divider)" strokeWidth="1" />
                      <polyline
                        data-testid="conc-line"
                        points={curve.line}
                        fill="none"
                        stroke="var(--c1)"
                        strokeWidth="2"
                      />
                      {curve.points.map(p => (
                        <circle
                          key={p.n}
                          data-testid={`conc-point-${p.n}`}
                          cx={p.x}
                          cy={p.y}
                          r="4.5"
                          fill="var(--c1)"
                        >
                          <title>
                            {p.n} stocks: {formatPercent(p.pct, { digits: 1 })}
                          </title>
                        </circle>
                      ))}
                    </svg>
                  </span>
                </AppLink>
              </div>

              <ul aria-label="Concentration points" className="flex flex-wrap gap-2">
                {data.concentration.map(p => (
                  <li key={p.stock_count}>
                    <AppLink to={to}>
                      <span
                        data-testid={`conc-chip-${p.stock_count}`}
                        data-clickable=""
                        data-effect="navigate"
                        title={TIP}
                        className="inline-flex items-center rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-row-hover)]"
                      >
                        {p.stock_count} stocks: {formatPercent(p.exposure_pct, { digits: 1 })}
                      </span>
                    </AppLink>
                  </li>
                ))}
              </ul>

              <p data-testid="conc-basis" className="text-xs text-[var(--ui-text-muted)]">
                Based on {data.total_stock_count} distinct stocks held across your {data.total_fund_count} equity funds
                {excluded > 0 &&
                  ` (${excluded} ${excluded === 1 ? "fund has" : "funds have"} no stock holdings to look through)`}
                .
              </p>
            </>
          )}
        </div>
      )}
    </SectionCard>
  );
}
