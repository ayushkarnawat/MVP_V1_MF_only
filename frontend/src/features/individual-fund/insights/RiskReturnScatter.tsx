import { useState } from "react";
import { Modal } from "@/components/Modal";
import { ScatterChart } from "@/components/ui/charts";
import { formatPercent } from "@/lib/format";
import { AppLink } from "@/shell/nav/AppLink";
import { paths } from "@/shell/nav/paths";
import { fundPageApi } from "../api";
import { SectionState } from "../components/SectionState";
import { SCATTER_THIN_NOTE, scatterCaption } from "../fundCopy";
import { formatDate, formatRiskValue } from "../fundFormat";
import type { ScatterPointOut, ScatterResponse } from "../types";
import { useFundSection } from "../useFundSection";

export interface RiskReturnScatterProps {
  schemeId: string;
}

export function RiskReturnScatter({ schemeId }: RiskReturnScatterProps) {
  const scatter = useFundSection<ScatterResponse>(
    (signal) => fundPageApi.scatter(schemeId, signal),
    [schemeId]
  );
  const [selected, setSelected] = useState<ScatterPointOut | null>(null);

  const data = scatter.data;

  return (
    <section
      aria-labelledby="scatter-title"
      className="space-y-4 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5"
    >
      <h3
        id="scatter-title"
        className="text-base font-semibold text-[var(--ui-text)]"
      >
        Risk-Return{" "}
        <span className="text-xs font-normal text-[var(--ui-text-muted)]">
          (3 Years)
        </span>
      </h3>

      <SectionState
        status={scatter.status}
        label="risk and return"
        reason={scatter.reason}
        onRetry={scatter.retry}
      >
        {data && (
          <div className="space-y-4">
            <div data-testid="scatter-wrap">
              <ScatterChart
                points={data.points.map((p) => ({
                  id: p.scheme_id,
                  name: p.name,
                  x: Number(p.volatility_pct),
                  y: Number(p.return_pct),
                  highlight: p.is_fund,
                }))}
                xLabel="Volatility (% a year)"
                yLabel="3-year return (% a year)"
                ariaLabel="Risk and return of funds in the category"
                onPointClick={(id) => {
                  setSelected(
                    data.points.find((p) => p.scheme_id === id) ?? null
                  );
                }}
                height={260}
              />
            </div>

            {data.thin_category && (
              <p
                data-testid="scatter-thin-note"
                className="text-xs text-[var(--ui-text-muted)]"
              >
                {SCATTER_THIN_NOTE}
              </p>
            )}

            {data.peer_volatility_median !== null && (
              <p
                data-testid="scatter-median"
                className="text-xs text-[var(--ui-text-muted)]"
              >
                {`Category median volatility: ${formatRiskValue(
                  "volatility",
                  data.peer_volatility_median
                )}.`}
              </p>
            )}

            <p
              data-testid="scatter-caption"
              className="text-xs text-[var(--ui-text-muted)]"
            >
              {scatterCaption(
                data.points.length,
                formatDate(data.window_start),
                formatDate(data.window_end)
              )}
            </p>
          </div>
        )}
      </SectionState>

      {selected !== null && (
        <Modal
          isOpen
          onClose={() => setSelected(null)}
          title={
            selected.is_fund
              ? `${selected.name} (this fund)`
              : selected.name
          }
        >
          <dl className="divide-y divide-[var(--ui-divider)]">
            <div
              data-testid="dot-popup-row"
              className="flex justify-between gap-3 py-2 text-sm"
            >
              <dt className="text-[var(--ui-text-muted)]">3-year return</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {formatPercent(selected.return_pct, { digits: 1 })}
              </dd>
            </div>
            <div
              data-testid="dot-popup-row"
              className="flex justify-between gap-3 py-2 text-sm"
            >
              <dt className="text-[var(--ui-text-muted)]">Volatility</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {formatRiskValue("volatility", selected.volatility_pct)}
              </dd>
            </div>
            {selected.held !== undefined && (
              <div
                data-testid="dot-popup-row"
                className="flex justify-between gap-3 py-2 text-sm"
              >
                <dt className="text-[var(--ui-text-muted)]">You hold it</dt>
                <dd className="font-semibold text-[var(--ui-text)]">
                  {selected.held ? "Yes" : "No"}
                </dd>
              </div>
            )}
          </dl>

          {!selected.is_fund && selected.held === true && (
            <p className="mt-3 text-sm">
              <AppLink
                to={paths.mutualFunds.fund(selected.scheme_id)}
                className="font-semibold text-[var(--c2)] hover:underline"
              >
                View fund page
              </AppLink>
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}
