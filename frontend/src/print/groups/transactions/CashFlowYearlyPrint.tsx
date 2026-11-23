import type { InvestmentWithdrawalBucket } from "../../../features/mutual-funds/types";
import {
  compareDecimalStrings,
  diffDecimalStrings,
  sumDecimalStrings,
} from "../../../lib/decimal";
import { formatCompactRupees, formatRupees } from "../../../lib/format";

export interface CashFlowYearlyPrintProps {
  years: InvestmentWithdrawalBucket[];
}

function roundedTopBarPath(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return "";
  const radius = Math.min(r, w / 2, h);
  const right = x + w;
  const bottom = y + h;
  return [
    `M ${x} ${bottom}`,
    `L ${x} ${y + radius}`,
    `Q ${x} ${y} ${x + radius} ${y}`,
    `L ${right - radius} ${y}`,
    `Q ${right} ${y} ${right} ${y + radius}`,
    `L ${right} ${bottom}`,
    "Z",
  ].join(" ");
}

export function CashFlowYearlyPrint({ years }: CashFlowYearlyPrintProps) {
  if (years.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
        <p className="text-sm text-[var(--ui-text-muted)]">No transactions yet</p>
      </div>
    );
  }

  const hasWithdrawn = years.some(y => compareDecimalStrings(y.withdrawn, "0") > 0);

  let maxAmount = 0;
  for (const y of years) {
    const inv = Math.max(0, Number(y.invested));
    const out = hasWithdrawn ? Math.max(0, Number(y.withdrawn)) : 0;
    if (inv > maxAmount) maxAmount = inv;
    if (out > maxAmount) maxAmount = out;
  }

  const svgWidth = 640;
  const svgHeight = 170;
  const padLeft = 16;
  const padRight = 16;
  const padTop = 20;
  const padBottom = 22;
  const plotWidth = svgWidth - padLeft - padRight;
  const baselineY = svgHeight - padBottom;
  const plotHeight = baselineY - padTop;
  const groupWidth = plotWidth / years.length;

  const totalIn = sumDecimalStrings(years.map(y => y.invested));
  const totalOut = sumDecimalStrings(years.map(y => y.withdrawn));
  const totalNet = diffDecimalStrings(totalIn, totalOut);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-base font-semibold text-[var(--ui-text)]">
            Invested each year
          </h4>
          {hasWithdrawn && (
            <div className="flex items-center gap-4 text-xs text-[var(--ui-text-muted)]">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[var(--pos)]" />
                <span>Invested</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[var(--neg)]" />
                <span>Withdrawn</span>
              </div>
            </div>
          )}
        </div>

        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          width="100%"
          role="img"
          aria-label="Invested each year"
          className="block"
        >
          <line
            x1={padLeft}
            y1={baselineY}
            x2={svgWidth - padRight}
            y2={baselineY}
            stroke="var(--ui-divider)"
            strokeWidth={1}
          />

          {years.map((y, index) => {
            const groupCenter = padLeft + groupWidth * (index + 0.5);
            const invVal = Math.max(0, Number(y.invested));
            const outVal = Math.max(0, Number(y.withdrawn));
            const invH = maxAmount > 0 ? (invVal / maxAmount) * plotHeight : 0;
            const outH = maxAmount > 0 ? (outVal / maxAmount) * plotHeight : 0;

            if (!hasWithdrawn) {
              const barW = Math.min(34, Math.max(8, groupWidth * 0.68));
              const barX = groupCenter - barW / 2;
              const barY = baselineY - invH;
              return (
                <g key={y.period}>
                  {invH > 0 && (
                    <path
                      data-series="invested"
                      d={roundedTopBarPath(barX, barY, barW, invH, 3)}
                      fill="var(--pos)"
                    />
                  )}
                  {invH === 0 && (
                    <rect
                      data-series="invested"
                      x={barX}
                      y={baselineY}
                      width={barW}
                      height={0}
                      fill="var(--pos)"
                    />
                  )}
                  <text
                    x={groupCenter}
                    y={Math.max(10, barY - 4)}
                    textAnchor="middle"
                    fontSize={8}
                    fill="var(--ui-text-muted)"
                  >
                    {formatCompactRupees(y.invested)}
                  </text>
                  <text
                    x={groupCenter}
                    y={svgHeight - 6}
                    textAnchor="middle"
                    fontSize={8}
                    fill="var(--ui-text-muted)"
                  >
                    {y.period}
                  </text>
                </g>
              );
            }

            const gap = 3;
            const barW = Math.min(20, Math.max(6, (groupWidth * 0.7 - gap) / 2));
            const invX = groupCenter - barW - gap / 2;
            const outX = groupCenter + gap / 2;
            const invY = baselineY - invH;
            const outY = baselineY - outH;

            return (
              <g key={y.period}>
                {invH > 0 ? (
                  <path
                    data-series="invested"
                    d={roundedTopBarPath(invX, invY, barW, invH, 3)}
                    fill="var(--pos)"
                  />
                ) : (
                  <rect
                    data-series="invested"
                    x={invX}
                    y={baselineY}
                    width={barW}
                    height={0}
                    fill="var(--pos)"
                  />
                )}
                <text
                  x={invX + barW / 2}
                  y={Math.max(10, invY - 4)}
                  textAnchor="middle"
                  fontSize={7.5}
                  fill="var(--ui-text-muted)"
                >
                  {formatCompactRupees(y.invested)}
                </text>

                {outH > 0 ? (
                  <path
                    data-series="withdrawn"
                    d={roundedTopBarPath(outX, outY, barW, outH, 3)}
                    fill="var(--neg)"
                  />
                ) : (
                  <rect
                    data-series="withdrawn"
                    x={outX}
                    y={baselineY}
                    width={barW}
                    height={0}
                    fill="var(--neg)"
                  />
                )}
                {outH > 0 && (
                  // A label only on a drawn bar: a "₹0" over every empty withdrawn bar is noise on paper.
                  <text
                    x={outX + barW / 2}
                    y={Math.max(10, outY - 4)}
                    textAnchor="middle"
                    fontSize={7.5}
                    fill="var(--ui-text-muted)"
                  >
                    {formatCompactRupees(y.withdrawn)}
                  </text>
                )}

                <text
                  x={groupCenter}
                  y={svgHeight - 6}
                  textAnchor="middle"
                  fontSize={8}
                  fill="var(--ui-text-muted)"
                >
                  {y.period}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
        <h4 className="mb-3 text-base font-semibold text-[var(--ui-text)]">By year</h4>
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--ui-divider)] text-[11px] font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">
              <th className="w-[22%] py-2 pr-3 font-semibold">Year</th>
              <th className="w-[26%] py-2 px-2 text-right font-semibold">Money in</th>
              <th className="w-[26%] py-2 px-2 text-right font-semibold">Money out</th>
              <th className="w-[26%] py-2 pl-2 text-right font-semibold">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ui-divider)]">
            {years.map(y => {
              const net = diffDecimalStrings(y.invested, y.withdrawn);
              return (
                <tr key={y.period} className="break-inside-avoid">
                  <td className="py-2 pr-3 tabular-nums text-[var(--ui-text)]">
                    {y.period}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-[var(--ui-text)]">
                    {formatRupees(y.invested)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-[var(--ui-text)]">
                    {formatRupees(y.withdrawn)}
                  </td>
                  <td className="py-2 pl-2 text-right tabular-nums text-[var(--ui-text)]">
                    {formatRupees(net)}
                  </td>
                </tr>
              );
            })}
            <tr className="break-inside-avoid border-t-2 border-[var(--ui-text)] font-semibold text-[var(--ui-text)]">
              <td className="py-2.5 pr-3">Total</td>
              <td className="py-2.5 px-2 text-right tabular-nums">
                {formatRupees(totalIn)}
              </td>
              <td className="py-2.5 px-2 text-right tabular-nums">
                {formatRupees(totalOut)}
              </td>
              <td className="py-2.5 pl-2 text-right tabular-nums">
                {formatRupees(totalNet)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
