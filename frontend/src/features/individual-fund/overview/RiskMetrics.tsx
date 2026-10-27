import { useState } from "react";
import { Modal } from "@/components/Modal";
import { CLICK_ROW } from "@/lib/clickable";
import { toPercentString } from "@/lib/decimal";
import { formatDate, formatPercent } from "@/lib/format";
import { fundPageApi } from "../api";
import { SectionState } from "../components/SectionState";
import {
  BETA_DASH_NOTE,
  RISK_LIFE_WINDOW_NOTE,
  RISK_ROWS,
  riskUnavailableText,
  type RiskRowInfo,
} from "../fundCopy";
import {
  formatRiskValue,
  riskBarPercent,
  toneChipClass,
} from "../fundFormat";
import type { RiskResponse } from "../types";
import { useFundSection } from "../useFundSection";

export interface RiskMetricsProps {
  schemeId: string;
}

export function RiskMetrics({ schemeId }: RiskMetricsProps) {
  const risk = useFundSection<RiskResponse>(
    (signal) => fundPageApi.risk(schemeId, signal),
    [schemeId]
  );
  const [open, setOpen] = useState<RiskRowInfo | null>(null);

  const handleKeyDown = (e: React.KeyboardEvent, row: RiskRowInfo) => {
    if (e.key === "Enter") {
      setOpen(row);
    } else if (e.key === " ") {
      e.preventDefault();
      setOpen(row);
    }
  };

  const rows = risk.data
    ? RISK_ROWS.filter((row) => {
        if (
          row.key === "beta" &&
          risk.data!.beta.value === null &&
          risk.data!.beta_reason === "no_benchmark"
        ) {
          return false;
        }
        return true;
      })
    : [];

  return (
    <section
      aria-labelledby="risk-title"
      className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4"
    >
      <div className="flex items-center justify-between pb-3">
        <h3
          id="risk-title"
          className="text-base font-semibold text-[var(--ui-text)]"
        >
          Risk Metrics{" "}
          <span className="text-xs font-normal text-[var(--ui-text-muted)]">
            {risk.data?.life_window ? "(since launch)" : "(3Y)"}
          </span>
        </h3>
      </div>

      {risk.status === "unavailable" ? (
        <p
          data-testid="risk-unavailable"
          className="py-2 text-sm text-[var(--ui-text-muted)]"
        >
          {riskUnavailableText(risk.reason)}
        </p>
      ) : (
        <SectionState
          status={risk.status}
          label="risk metrics"
          reason={risk.reason}
          onRetry={risk.retry}
        >
          {risk.data ? (
            <div className="space-y-3">
              <div className="divide-y divide-[var(--ui-divider)]">
                {rows.map((row) => {
                  const metric = risk.data![row.key];
                  return (
                    <div
                      key={row.key}
                      role="button"
                      tabIndex={0}
                      aria-haspopup="dialog"
                      data-testid={`risk-row-${row.key}`}
                      onClick={() => setOpen(row)}
                      onKeyDown={(e) => handleKeyDown(e, row)}
                      className={`grid grid-cols-[minmax(0,1.3fr)_56px_minmax(60px,1fr)_84px] items-center gap-2 py-2 text-sm ${CLICK_ROW}`}
                    >
                      <span className="truncate text-[var(--ui-text-muted)]">
                        {row.label}
                      </span>
                      <b
                        data-testid={`risk-${row.key}-value`}
                        title={
                          row.key === "beta" && metric.value === null
                            ? BETA_DASH_NOTE
                            : undefined
                        }
                        className="text-right font-semibold text-[var(--ui-text)]"
                      >
                        {formatRiskValue(row.key, metric.value)}
                      </b>
                      <div aria-hidden="true" className="flex items-center">
                        <div className="h-[7px] w-full overflow-hidden rounded-full bg-[var(--ui-divider)]">
                          <i
                            data-testid={`risk-${row.key}-bar`}
                            className="block h-full rounded-full bg-[var(--c4)]"
                            style={{
                              width: `${riskBarPercent(row.key, metric.value)}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        {metric.band !== null ? (
                          <span
                            data-testid={`risk-${row.key}-chip`}
                            data-tone={metric.tone ?? "neu"}
                            className={toneChipClass(metric.tone)}
                          >
                            {metric.band}
                          </span>
                        ) : (
                          <span aria-hidden="true" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p
                data-testid="risk-footnote"
                className="text-xs text-[var(--ui-text-muted)]"
              >
                {`${formatDate(risk.data.window_start)} to ${formatDate(risk.data.window_end)}, ${risk.data.points} daily points. Risk-free rate ${formatPercent(toPercentString(risk.data.risk_free_rate), { digits: 1 })}.`}
              </p>

              {risk.data.life_window ? (
                <p
                  data-testid="risk-life-note"
                  className="text-xs text-[var(--ui-text-muted)]"
                >
                  {RISK_LIFE_WINDOW_NOTE}
                </p>
              ) : null}

              {open ? (
                <Modal
                  isOpen
                  onClose={() => setOpen(null)}
                  title={open.label}
                >
                  <p
                    data-testid="risk-definition"
                    className="mb-4 text-sm text-[var(--ui-text-muted)]"
                  >
                    {open.definition}
                  </p>
                  <dl className="divide-y divide-[var(--ui-divider)]">
                    <div className="flex justify-between gap-3 py-2 text-sm">
                      <dt className="text-[var(--ui-text-muted)]">Value</dt>
                      <dd className="font-semibold text-[var(--ui-text)]">
                        {formatRiskValue(open.key, risk.data[open.key].value)}
                      </dd>
                    </div>
                    {risk.data[open.key].band !== null ? (
                      <div className="flex justify-between gap-3 py-2 text-sm">
                        <dt className="text-[var(--ui-text-muted)]">Band</dt>
                        <dd className="font-semibold text-[var(--ui-text)]">
                          {risk.data[open.key].band}
                        </dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between gap-3 py-2 text-sm">
                      <dt className="text-[var(--ui-text-muted)]">Window</dt>
                      <dd className="font-semibold text-[var(--ui-text)]">
                        {`${formatDate(risk.data.window_start)} to ${formatDate(risk.data.window_end)}`}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3 py-2 text-sm">
                      <dt className="text-[var(--ui-text-muted)]">Daily points</dt>
                      <dd className="font-semibold text-[var(--ui-text)]">
                        {String(risk.data.points)}
                      </dd>
                    </div>
                  </dl>
                </Modal>
              ) : null}
            </div>
          ) : null}
        </SectionState>
      )}
    </section>
  );
}
