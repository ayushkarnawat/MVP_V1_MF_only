import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { SchemeLogo } from "../../../components/SchemeLogo";
import { formatCompactRupees, formatDate, formatRupees } from "../../../lib/format";
import type { CategoryRankingSummary, DirectRegularTerComparison, WeightedTerSummary } from "../types";
import {
  noTerNote,
  periodsFor,
  pinPercent,
  planState,
  rawPercent,
  savingsLine,
  terBadge,
  terLadderRows,
  terScaleMax,
  terText,
  terTotals,
} from "./otherLogic";

export interface TerLadderProps {
  ter: WeightedTerSummary;
  comparison: DirectRegularTerComparison | null;
  ranking: CategoryRankingSummary | null;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export function TerLadder({ ter, comparison, ranking }: TerLadderProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = terLadderRows(ter);
  const max = terScaleMax(ter, comparison);

  const circumference = 2 * Math.PI * 38;
  const length =
    ter.weighted_ter === null ? 0 : round2((pinPercent(ter.weighted_ter, max) / 100) * circumference);
  const dashRemain = round2(circumference - length);

  const heroTip = "Each fund's TER weighted by what you hold in it: the annual management fee across your portfolio.";

  const sLine = savingsLine(ter.funds);
  const totals = terTotals(ter);
  const noTer = noTerNote(ter.funds);

  return (
    <div data-testid="ter-body" className="space-y-6">
      <p className="text-xs text-[var(--ui-text-muted)]">
        Projected annual cost if your value and each fund's TER stay as they are today — not a forecast of returns.
        {ter.reference_period && (
          <span data-testid="ter-ref" className="ml-2 font-medium text-[var(--ui-text)]">
            Ref: {formatDate(ter.reference_period)}
          </span>
        )}
      </p>

      {/* Hero and Spectrum */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Hero gauge */}
        <div
          data-testid="ter-hero"
          tabIndex={0}
          title={heroTip}
          data-tooltip={heroTip}
          className="flex items-center gap-5 rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-5"
        >
          <div className="relative h-24 w-24 shrink-0">
            <svg viewBox="0 0 100 100" aria-hidden="true" className="h-full w-full">
              <circle
                cx="50"
                cy="50"
                r="38"
                strokeWidth="9"
                stroke="var(--ui-divider)"
                fill="none"
              />
              <circle
                data-testid="gauge-arc"
                data-length={length}
                stroke="var(--c3)"
                strokeLinecap="round"
                strokeDasharray={`${length} ${dashRemain}`}
                transform="rotate(-90 50 50)"
                cx="50"
                cy="50"
                r="38"
                strokeWidth="9"
                fill="none"
              />
            </svg>
          </div>
          <div className="space-y-1">
            {ter.weighted_ter !== null ? (
              <div className="flex items-baseline gap-2">
                <span data-testid="ter-weighted" className="text-2xl font-bold text-[var(--ui-text)]">
                  {terText(ter.weighted_ter)}
                </span>
                <span className="text-xs font-semibold text-[var(--ui-text-muted)]">AUM-Wtd TER</span>
              </div>
            ) : (
              <span data-testid="ter-unavailable" className="text-base font-semibold text-[var(--ui-text-muted)]">
                TER data unavailable
              </span>
            )}
            <p data-testid="ter-hero-sub" className="text-xs text-[var(--ui-text-muted)]">
              {ter.cost_1y !== null && `${formatRupees(ter.cost_1y)}/yr at today's value · `}
              covers {formatCompactRupees(ter.covered_value)} of {formatCompactRupees(ter.total_value)} portfolio value
            </p>
          </div>
        </div>

        {/* Spectrum */}
        {comparison !== null ? (
          <div data-testid="ter-spectrum" className="flex flex-col justify-center rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-5 space-y-4">
            <div className="relative h-2 rounded-full bg-[var(--ui-divider)] mx-2 my-2">
              {(["direct", "regular"] as const).map(plan => {
                const summary = comparison[plan];
                if (summary.weighted_ter === null) return null;
                const pct = pinPercent(summary.weighted_ter, max);
                return (
                  <span
                    key={plan}
                    data-testid={`dot-${plan}`}
                    style={{
                      left: `${pct}%`,
                      backgroundColor: plan === "direct" ? "var(--pos)" : "var(--warn-text)",
                    }}
                    className="absolute -top-1 h-4 w-4 -translate-x-1/2 rounded-full ring-2 ring-[var(--ui-card)]"
                  />
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-1">
              {(["direct", "regular"] as const).map(plan => {
                const summary = comparison[plan];
                const state = planState(summary);
                const Label = plan === "direct" ? "Direct" : "Regular";
                const tip = `${Label} plans: ${terText(summary.weighted_ter)} a year, weighted by value`;

                return (
                  <div key={plan} data-testid={`plan-${plan}`} data-state={state} className="space-y-1">
                    {state === "bar" ? (
                      <span
                        tabIndex={0}
                        title={tip}
                        data-tooltip={tip}
                        data-testid={`pin-${plan}`}
                        data-x={pinPercent(summary.weighted_ter!, max)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ui-text)]"
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: plan === "direct" ? "var(--pos)" : "var(--warn-text)" }}
                        />
                        {Label} {terText(summary.weighted_ter)}
                      </span>
                    ) : (
                      <p className="text-xs text-[var(--ui-text-muted)]">
                        {state === "none-held"
                          ? `No ${Label} plans in this portfolio, so there is nothing to compare against.`
                          : `No TER on record for the ${Label} plans you hold.`}
                      </p>
                    )}
                    <p data-testid={`value-${plan}`} className="text-xs text-[var(--ui-text-muted)]">
                      {state === "none-held"
                        ? `No ${Label} holdings`
                        : `${Label} value: ${formatCompactRupees(summary.total_value)}`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex items-center rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-5">
            <p data-testid="ter-comparison-missing" className="text-xs text-[var(--ui-text-muted)]">
              The Direct and Regular comparison is not available right now.
            </p>
          </div>
        )}
      </div>

      {sLine && (
        <p data-testid="ter-savings" className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3 text-xs text-[var(--ui-text)]">
          {sLine}
        </p>
      )}

      {/* Cost Ladder */}
      {rows.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-[var(--ui-text)]">
            Cost ladder — relative TER across your holdings · click a fund for its 1Y/3Y/5Y returns
          </h4>

          <ul aria-label="Cost ladder" className="space-y-2">
            {rows.map(row => {
              const { fund, hasTer, width, tone } = row;
              const isOpen = openId === fund.scheme_id;
              const badge = terBadge(fund);
              const periods = periodsFor(ranking, fund.scheme_id);

              return (
                <li
                  key={fund.scheme_id}
                  data-testid={`ladder-${fund.scheme_id}`}
                  data-muted={!hasTer}
                  className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3 transition-colors hover:bg-[var(--ui-row-hover)]"
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    data-testid={`ladder-toggle-${fund.scheme_id}`}
                    data-clickable=""
                    data-effect="expand"
                    onClick={() => setOpenId(isOpen ? null : fund.scheme_id)}
                    className="flex w-full flex-col gap-2 text-left"
                  >
                    <div className="flex w-full items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ChevronRight
                          className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                        />
                        <span data-testid="fund-logo" aria-hidden="true">
                          <SchemeLogo schemeName={fund.scheme_name} size="sm" />
                        </span>
                        <span title={fund.scheme_name} className="truncate text-xs font-semibold text-[var(--ui-text)]">
                          {fund.scheme_name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <span data-testid={`ladder-ter-${fund.scheme_id}`} className="text-xs font-bold text-[var(--ui-text)]">
                          {hasTer ? terText(fund.ter) : "—"}
                        </span>
                        {hasTer && badge && (
                          <span
                            data-testid={`ladder-badge-${fund.scheme_id}`}
                            className="inline-flex items-center rounded-md bg-[var(--ui-elevated)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ui-text-muted)] border border-[var(--ui-divider)]"
                          >
                            {badge}
                          </span>
                        )}
                      </div>
                    </div>

                    {hasTer && (
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ui-divider)]">
                        <span
                          data-testid={`ladder-bar-${fund.scheme_id}`}
                          data-tone={tone}
                          style={{
                            width: `${width}%`,
                            backgroundColor: tone === "below" ? "var(--pos)" : "var(--warn-text)",
                          }}
                          className="block h-full rounded-full transition-all"
                        />
                      </div>
                    )}

                    <span data-testid={`ladder-sub-${fund.scheme_id}`} className="text-[11px] text-[var(--ui-text-muted)]">
                      {hasTer
                        ? `Your value ${formatRupees(fund.value)} · projected cost 1yr ${formatRupees(fund.cost_1y)} · 3yr ${formatRupees(fund.cost_3y)} · 5yr ${formatRupees(fund.cost_5y)}`
                        : `Your value ${formatRupees(fund.value)} · no TER on file, excluded from totals below`}
                    </span>
                  </button>

                  {isOpen && (
                    <div data-testid={`ladder-detail-${fund.scheme_id}`} className="mt-3 border-t border-[var(--ui-divider)] pt-3">
                      {periods ? (
                        <div className="overflow-x-auto">
                          <table aria-label={`${fund.scheme_name} returns`} className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-[var(--ui-divider)] text-[var(--ui-text-muted)]">
                                <th scope="col" className="sr-only">Fund</th>
                                <th scope="col" className="py-1 px-3 font-medium">1Y</th>
                                <th scope="col" className="py-1 px-3 font-medium">3Y</th>
                                <th scope="col" className="py-1 px-3 font-medium">5Y</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <th scope="row" className="sr-only">{fund.scheme_name}</th>
                                <td data-testid={`ladder-return-${fund.scheme_id}-1y`} className="py-1.5 px-3 font-medium text-[var(--ui-text)]">
                                  {rawPercent(periods["1y"]?.fund_return)}
                                </td>
                                <td data-testid={`ladder-return-${fund.scheme_id}-3y`} className="py-1.5 px-3 font-medium text-[var(--ui-text)]">
                                  {rawPercent(periods["3y"]?.fund_return)}
                                </td>
                                <td data-testid={`ladder-return-${fund.scheme_id}-5y`} className="py-1.5 px-3 font-medium text-[var(--ui-text)]">
                                  {rawPercent(periods["5y"]?.fund_return)}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--ui-text-muted)]">
                          No return data on file for this fund.
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {totals && (
            <div data-testid="ladder-total" className="flex flex-wrap items-center justify-between rounded-xl bg-[var(--ui-elevated)] p-3 text-xs font-medium text-[var(--ui-text)]">
              <span>Total ({totals.count} {totals.count === 1 ? "fund" : "funds"} with a TER)</span>
              <span>
                {formatRupees(totals.value)} · 1yr {formatRupees(totals.cost1y)} · 3yr {formatRupees(totals.cost3y)} · 5yr {formatRupees(totals.cost5y)}
              </span>
            </div>
          )}

          {noTer && (
            <p data-testid="ladder-no-ter-note" className="text-xs text-[var(--ui-text-muted)]">
              {noTer}
            </p>
          )}

          {ter.uncovered_schemes && ter.uncovered_schemes.length > 0 && (
            <div role="note" data-testid="ter-exclusions" className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3 space-y-1 text-xs text-[var(--ui-text-muted)]">
              <p className="font-semibold text-[var(--ui-text)]">
                TER Exclusions ({ter.uncovered_schemes.length} {ter.uncovered_schemes.length === 1 ? "fund" : "funds"} excluded)
              </p>
              <p>
                The weighted TER calculation currently excludes {ter.uncovered_schemes.join(", ")} due to missing AMFI disclosures.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
