import { useState } from "react";
import { Clock, TriangleAlert, Wallet } from "lucide-react";
import { MeasureFlip } from "@/components/MeasureFlip";
import { Modal } from "@/components/Modal";
import { XirrCautionChip } from "@/components/XirrCautionChip";
import {
  SummaryBar,
  SummaryCell,
  SummaryErrorCard,
  SummaryFigure,
  SummaryLead,
  SummarySpark,
  SummarySwitch,
} from "@/components/summary-bar";
import disclaimerStyles from "@/components/summary-bar/summaryBar.module.css";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDataDate } from "@/lib/dataDates";
import { toPercentString } from "@/lib/decimal";
import { formatPercent, formatRupees } from "@/lib/format";
import { RETURNS_CAPTION, resolveFigures, XIRR_CAPTION } from "@/lib/xirrDisplay";
import { InfoMark } from "../common/SectionCard";
import {
  changeDirection,
  formatSignedPercent,
  formatSignedRupees,
  formatXirr,
  holdingTotals,
  sparkPoints,
  sparkTrend,
} from "../mfCopy";
import type { HistoryPoint, HoldingRow, Load, RealizedSummary, XirrBundle } from "../types";

export interface SummaryStripProps {
  holdings: Load<HoldingRow[]>;
  xirr: Load<XirrBundle>;
  realized: Load<RealizedSummary | null>;
  history: Load<HistoryPoint[]>;
  synopsis: string | null;
}

export function SummaryStrip({
  holdings,
  xirr,
  realized,
  history,
  synopsis,
}: SummaryStripProps) {
  const [basis, setBasis] = useState<"lifetime" | "current">("lifetime");
  const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);
  const [face, setFace] = useState<"xirr" | "returns">("xirr");

  if (holdings.status === "loading") {
    return <SummaryBar loading ariaLabel="Loading summary" />;
  }

  if (holdings.status === "error" || holdings.data === null) {
    return (
      <SummaryErrorCard
        title="Couldn't load your portfolio summary"
        body="This section failed to load, but the rest of the page is unaffected."
        onRetry={holdings.retry}
      />
    );
  }

  const totals = holdingTotals(holdings.data);

  const staleRows = holdings.data.filter((r) => !r.nav_unavailable && r.stale_nav);
  const unpricedRows = holdings.data.filter((r) => r.nav_unavailable);

  const unrealisedDir = changeDirection(totals.unrealised);
  const todayDir = changeDirection(totals.todayGain);

  const dirColor = (dir: "up" | "down" | "flat") => {
    if (dir === "up") return "text-[var(--pos-text)]";
    if (dir === "down") return "text-[var(--neg-text)]";
    return "text-[var(--ui-text-muted)]";
  };

  const figures =
    xirr.status === "data" && xirr.data !== null
      ? basis === "lifetime"
        ? resolveFigures(
            xirr.data.lifetime,
            xirr.data.lifetime_since_purchase,
            xirr.data.lifetime_xirr_caution,
          )
        : resolveFigures(
            xirr.data.current,
            xirr.data.current_holdings_since_purchase,
            xirr.data.current_holdings_xirr_caution,
          )
      : { xirr: null, returns: null, caution: null };

  const canFlip =
    xirr.status === "data" &&
    figures.xirr !== null &&
    figures.returns !== null;
  const shownFace = canFlip ? face : "xirr";
  const shownFigure = shownFace === "xirr" ? figures.xirr : figures.returns;

  const currentDisclaimer =
    xirr.data !== null
      ? basis === "lifetime"
        ? xirr.data.disclaimers.lifetime
        : xirr.data.disclaimers.current
      : null;

  const xirrAsOf =
    xirr.status === "data" &&
    xirr.data !== null &&
    typeof xirr.data.xirr_as_of === "string" &&
    xirr.data.xirr_as_of.trim() !== ""
      ? xirr.data.xirr_as_of
      : null;

  const renderSparkline = () => {
    if (history.status === "loading") {
      return (
        <span data-testid="sparkline-loading">
          <Skeleton className="h-[22px] w-[60px]" />
        </span>
      );
    }
    if (history.status === "error") {
      return (
        <div className="flex items-center gap-1.5 text-xs text-[var(--ui-text-muted)]">
          <span>Couldn't load trend</span>
          <button
            type="button"
            data-clickable=""
            data-effect="retry"
            onClick={history.retry}
            className="text-[var(--pos-text)] hover:underline"
          >
            Retry
          </button>
        </div>
      );
    }
    if (!history.data || history.data.length < 2) {
      return null;
    }

    return (
      <SummarySpark
        points={sparkPoints(history.data)}
        trend={sparkTrend(history.data)}
        ariaLabel={`Portfolio value, last ${history.data.length} months`}
      />
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <SummaryBar
        ariaLabel="Portfolio summary"
        lead={
          <SummaryLead
            testId="metric-total-value"
            label="Total Portfolio Value"
            icon={<Wallet className="h-3.5 w-3.5" aria-hidden="true" />}
            info={
              <InfoMark
                text="Sum of current value across all mutual fund holdings, family-combined or scoped to one member."
                testId="info-total-value"
              />
            }
            figure={
              <SummaryFigure
                testId="value-total"
                text={formatRupees(totals.value)}
              />
            }
            trend={renderSparkline()}
            caption={
              <div
                data-testid="today-gain"
                data-direction={todayDir}
                className={`text-xs ${dirColor(todayDir)}`}
              >
                Today: {formatSignedRupees(totals.todayGain)}
                {totals.todayPct !== null
                  ? ` (${formatPercent(totals.todayPct, { digits: 2 })})`
                  : ""}
              </div>
            }
            footer={
              totals.staleCount > 0 || totals.unpricedCount > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {totals.staleCount > 0 && (
                    <span
                      role="note"
                      title={`Based on the last known NAV for: ${staleRows.map((r) => r.scheme_name).join(", ")}`}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--warn-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--warn-text)]"
                    >
                      <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                      {totals.staleCount} on last known NAV
                    </span>
                  )}
                  {totals.unpricedCount > 0 && (
                    <span
                      role="note"
                      title={`No NAV yet, left out of every total: ${unpricedRows.map((r) => r.scheme_name).join(", ")}`}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--warn-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--warn-text)]"
                    >
                      {totals.unpricedCount} not priced yet
                    </span>
                  )}
                </div>
              ) : undefined
            }
          />
        }
        cells={[
          <SummaryCell
            key="invested"
            testId="metric-invested"
            label="Total Invested"
            figure={
              <SummaryFigure
                testId="value-invested"
                text={formatRupees(totals.invested)}
              />
            }
          />,
          <SummaryCell
            key="unrealised"
            testId="metric-unrealised"
            label="Unrealised Gain"
            wash={
              unrealisedDir === "up"
                ? "pos"
                : unrealisedDir === "down"
                  ? "neg"
                  : undefined
            }
            figure={
              <SummaryFigure
                testId="value-unrealised"
                direction={unrealisedDir}
                tone={
                  unrealisedDir === "up"
                    ? "pos"
                    : unrealisedDir === "down"
                      ? "neg"
                      : "default"
                }
                text={formatSignedRupees(totals.unrealised)}
              />
            }
            caption={
              totals.unrealisedPct !== null ? (
                <div className="flex items-center gap-1.5">
                  <div
                    data-testid="delta-unrealised"
                    className={dirColor(unrealisedDir)}
                  >
                    {`${formatSignedPercent(totals.unrealisedPct, 1)} return on invested`}
                  </div>
                  <InfoMark
                    text="Unrealised gain as a share of what you currently have invested. Not annualised."
                    testId="info-unrealised"
                  />
                </div>
              ) : undefined
            }
          />,
          <SummaryCell
            key="realised"
            testId="metric-realised"
            label="Realised Gain"
            figure={
              realized.status === "loading" ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <SummaryFigure
                  testId="value-realised"
                  text={
                    realized.status === "data" && realized.data !== null
                      ? formatRupees(realized.data.total)
                      : "—"
                  }
                />
              )
            }
          />,
          <SummaryCell
            key="xirr"
            testId="metric-xirr"
            label="XIRR"
            ariaLabel="XIRR"
          >
            <MeasureFlip
              face={shownFace}
              onFlip={() => setFace(shownFace === "xirr" ? "returns" : "xirr")}
              canFlip={canFlip}
              labelXirr="XIRR"
              labelReturns="Returns"
              titleExtra={
                <InfoMark
                  text={
                    shownFace === "xirr"
                      ? "Annualised return since inception. May include an opening balance from before you started tracking in Unifolio."
                      : "Total gain as a share of money paid in, not annualised."
                  }
                  testId="info-xirr"
                />
              }
            >
              <div className="flex h-[34px] mt-3 items-center justify-between gap-2 min-w-0">
                {xirr.status === "loading" ? (
                  <Skeleton className="h-7 w-20" />
                ) : (
                  <SummaryFigure
                    testId="value-xirr"
                    text={xirr.status === "error" ? "—" : formatXirr(shownFigure)}
                  />
                )}
                {shownFace === "xirr" && figures.caution !== null && (
                  <XirrCautionChip caution={figures.caution} />
                )}
              </div>
              <div className="mt-1.5 min-h-[34px]">
                {currentDisclaimer ? (
                  <button
                    type="button"
                    data-clickable=""
                    data-effect="open"
                    onClick={() => setIsDisclaimerOpen(true)}
                    className={disclaimerStyles.disclaimer}
                  >
                    {shownFace === "xirr"
                      ? `${basis === "lifetime" ? "Since inception" : "Current holdings"} — opening-balance disclaimer may apply ›`
                      : `${RETURNS_CAPTION} — opening-balance disclaimer may apply ›`}
                  </button>
                ) : (
                  <div
                    data-testid="xirr-caption"
                    className="text-xs text-[var(--ui-text-muted)]"
                  >
                    {shownFace === "xirr" ? XIRR_CAPTION : RETURNS_CAPTION}
                  </div>
                )}
              </div>
            </MeasureFlip>
          </SummaryCell>,
        ]}
        footerLeft={
          xirrAsOf !== null ? (
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--ui-text-muted)] whitespace-nowrap">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              <span data-testid="xirr-as-of">
                {formatDataDate("prices", xirrAsOf)}
              </span>
            </span>
          ) : undefined
        }
        footerRight={
          <SummarySwitch
            ariaLabel="XIRR basis"
            options={["Lifetime", "Current"]}
            value={basis === "lifetime" ? "Lifetime" : "Current"}
            onChange={(v) => {
              setBasis(v === "Lifetime" ? "lifetime" : "current");
              setIsDisclaimerOpen(false);
            }}
          />
        }
      />

      {synopsis !== null && (
        <p data-testid="synopsis" className="text-xs text-[var(--ui-text-muted)]">
          {synopsis}
        </p>
      )}

      {currentDisclaimer && (
        <Modal
          title="Why this return may be misleading"
          isOpen={isDisclaimerOpen}
          onClose={() => setIsDisclaimerOpen(false)}
        >
          <div className="flex flex-col gap-4 text-sm">
            <p className="text-[var(--ui-text)]">
              This comes from how your uploaded CAS statement reports old holdings, not from anything wrong with your investments or your account.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3">
                <div className="text-xs text-[var(--ui-text-muted)]">
                  Shown {basis === "lifetime" ? "Lifetime" : "Current"} XIRR
                </div>
                <div
                  data-testid="disclaimer-shown"
                  className="mt-1 text-lg font-semibold text-[var(--ui-text)]"
                >
                  {formatXirr(figures.xirr)}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3">
                <div className="text-xs text-[var(--ui-text-muted)]">
                  Without the undated portion
                </div>
                <div
                  data-testid="disclaimer-alt"
                  className="mt-1 text-lg font-semibold text-[var(--ui-text)]"
                >
                  {currentDisclaimer.alt_xirr != null
                    ? formatXirr(currentDisclaimer.alt_xirr)
                    : "Not enough dated activity left"}
                </div>
              </div>
            </div>
            <p className="text-[var(--ui-text-muted)]">
              <span
                data-testid="disclaimer-share"
                className="font-semibold text-[var(--ui-text)]"
              >
                {formatPercent(toPercentString(currentDisclaimer.opening_cost_share), {
                  digits: 0,
                })}
              </span>{" "}
              of the money behind this return came from an opening balance: units you already held before the period your statement covers. We use the earliest date it covers instead of the real purchase date, which can make an old holding look like it grew enormously in a few months.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
