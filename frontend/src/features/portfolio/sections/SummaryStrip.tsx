import { useState } from "react";
import { Clock, TriangleAlert, Wallet } from "lucide-react";
import { MeasureFlip } from "@/components/MeasureFlip";
import { Modal } from "@/components/Modal";
import { XirrCautionChip } from "@/components/XirrCautionChip";
import { InfoGlyph } from "@/components/info/InfoGlyph";
import {
  SummaryBar,
  SummaryBarSkeleton,
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
import { sparkPoints, sparkTrend } from "../portfolioCopy";
import {
  changeDirection,
  formatSignedPercent,
  formatSignedRupees,
  formatXirr,
  partialChipText,
  todayGainLine,
} from "../portfolioFormat";
import type {
  PortfolioSummaryResponse,
  PortfolioValueSeriesResponse,
} from "../types";

export interface SummaryStripProps {
  status: "loading" | "error" | "data";
  data: PortfolioSummaryResponse | null;
  seriesStatus: "loading" | "error" | "data";
  series: PortfolioValueSeriesResponse | null;
  onRetry: () => void;
  onRetrySeries: () => void;
}

function dirColorClass(dir: "up" | "down" | "flat"): string {
  if (dir === "up") return "text-[var(--pos-text)]";
  if (dir === "down") return "text-[var(--neg-text)]";
  return "text-[var(--ui-text-muted)]";
}

export function SummaryStrip({
  status,
  data,
  seriesStatus,
  series,
  onRetry,
  onRetrySeries,
}: SummaryStripProps) {
  const [basis, setBasis] = useState<"Lifetime" | "Current">("Lifetime");
  const [showExplanation, setShowExplanation] = useState(false);
  const [face, setFace] = useState<"xirr" | "returns">("xirr");

  if (status === "loading") {
    return <SummaryBarSkeleton ariaLabel="Loading summary" />;
  }

  if (status === "error" || !data) {
    return (
      <SummaryErrorCard
        title="Couldn't load your portfolio summary"
        body="This section failed to load, but the rest of the page is unaffected."
        onRetry={onRetry}
      />
    );
  }

  const figures =
    basis === "Lifetime"
      ? resolveFigures(
          data.lifetime_xirr,
          data.lifetime_since_purchase,
          data.lifetime_xirr_caution,
        )
      : resolveFigures(
          data.current_holdings_xirr,
          data.current_holdings_since_purchase,
          data.current_holdings_xirr_caution,
        );
  const canFlip = figures.xirr !== null && figures.returns !== null;
  const shownFace = canFlip ? face : "xirr";
  const shownFigure = shownFace === "xirr" ? figures.xirr : figures.returns;
  const disclaimer =
    basis === "Lifetime"
      ? data.lifetime_xirr_disclaimer
      : data.current_holdings_xirr_disclaimer;
  const xirrAsOf =
    typeof data.xirr_as_of === "string" && data.xirr_as_of.trim() !== ""
      ? data.xirr_as_of
      : null;

  const unrealisedDir = changeDirection(data.unrealized_gain);

  return (
    <>
      <SummaryBar
        ariaLabel="Portfolio summary"
        lead={
          <SummaryLead
            testId="metric-total-value"
            label="Total Portfolio Value"
            icon={<Wallet className="h-3.5 w-3.5" aria-hidden="true" />}
            info={
              <InfoGlyph
                testId="info-total-value"
                text="Sum of current value across all valued holdings, family-combined or scoped to one member."
              />
            }
            figure={
              <SummaryFigure
                testId="value-total"
                text={formatRupees(data.total_value)}
              />
            }
            trend={
              <>
                {seriesStatus === "loading" && (
                  <span data-testid="sparkline-loading">
                    <Skeleton className="h-[22px] w-[60px]" />
                  </span>
                )}
                {(seriesStatus === "error" ||
                  (seriesStatus === "data" && !series)) && (
                  <div className="flex items-center gap-1.5 text-xs text-[var(--ui-text-muted)]">
                    <span>Couldn't load trend</span>
                    <button
                      type="button"
                      onClick={onRetrySeries}
                      className="underline hover:text-[var(--ui-text)] cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                )}
                {seriesStatus === "data" &&
                  series &&
                  !series.empty &&
                  series.points.length >= 2 && (
                    <SummarySpark
                      points={sparkPoints(series.points)}
                      trend={sparkTrend(series.points)}
                      ariaLabel={`Portfolio value, last ${series.days} days`}
                    />
                  )}
              </>
            }
            caption={
              <div
                data-testid="today-gain"
                data-direction={changeDirection(data.today_gain)}
                className={dirColorClass(changeDirection(data.today_gain))}
              >
                {todayGainLine(data.today_gain, data.today_pct)}
              </div>
            }
            footer={
              partialChipText(data.missing_funds) !== "" ? (
                <span
                  role="note"
                  title={`Based on the last known NAV for: ${data.missing_funds.map((f) => f.name).join(", ")}`}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--warn-bg)] px-2 py-0.5 text-xs text-[var(--warn-text)]"
                >
                  <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{partialChipText(data.missing_funds)}</span>
                </span>
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
                text={formatRupees(data.total_invested)}
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
                text={formatSignedRupees(data.unrealized_gain)}
              />
            }
            caption={
              data.unrealized_pct !== null ? (
                <div className="flex items-center gap-1.5">
                  <div
                    data-testid="delta-unrealised"
                    className={dirColorClass(unrealisedDir)}
                  >
                    {`${formatSignedPercent(data.unrealized_pct, 1)} return on invested`}
                  </div>
                  <InfoGlyph
                    testId="info-unrealised"
                    text="Unrealised gain as a share of what you currently have invested. Not annualised."
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
              <SummaryFigure
                testId="value-realised"
                text={formatRupees(data.realized_gain)}
              />
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
                <InfoGlyph
                  testId="info-xirr"
                  text={
                    shownFace === "xirr"
                      ? "Annualised return since inception. May include an opening balance from before you started tracking in Unifolio."
                      : "Total gain as a share of money paid in, not annualised."
                  }
                />
              }
            >
              <div className="flex h-[34px] mt-3 items-center justify-between gap-2 min-w-0">
                <SummaryFigure
                  testId="value-xirr"
                  text={formatXirr(shownFigure)}
                />
                {shownFace === "xirr" && figures.caution !== null && (
                  <XirrCautionChip caution={figures.caution} />
                )}
              </div>
              <div className="mt-1.5 min-h-[34px]">
                {disclaimer !== null ? (
                  <button
                    type="button"
                    data-clickable=""
                    onClick={() => setShowExplanation(true)}
                    className={disclaimerStyles.disclaimer}
                  >
                    {shownFace === "xirr"
                      ? `${basis === "Lifetime" ? "Since inception" : "Current holdings"} — opening-balance disclaimer may apply ›`
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
            value={basis}
            onChange={(v) => setBasis(v as "Lifetime" | "Current")}
          />
        }
      />

      {disclaimer !== null && (
        <Modal
          isOpen={showExplanation}
          onClose={() => setShowExplanation(false)}
          title="Why this return may be misleading"
        >
          <div className="flex flex-col gap-4 text-sm">
            <p className="text-[var(--ui-text-muted)]">
              This comes from how your uploaded CAS statement reports old holdings, not from anything wrong with your investments or your account.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-surface)] p-3">
                <div className="text-xs text-[var(--ui-text-muted)]">
                  {`Shown ${basis} XIRR`}
                </div>
                <div
                  data-testid="disclaimer-shown"
                  className="text-xl font-bold tabular-nums text-[var(--ui-text-default)] mt-1"
                >
                  {formatXirr(figures.xirr)}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-surface)] p-3">
                <div className="text-xs text-[var(--ui-text-muted)]">
                  Without the undated portion
                </div>
                <div
                  data-testid="disclaimer-alt"
                  className="text-xl font-bold tabular-nums text-[var(--ui-text-default)] mt-1"
                >
                  {disclaimer.alt_xirr !== null && disclaimer.alt_xirr !== undefined
                    ? formatXirr(disclaimer.alt_xirr)
                    : "Not enough dated activity left"}
                </div>
              </div>
            </div>
            <p className="text-[var(--ui-text-muted)]">
              <span
                data-testid="disclaimer-share"
                className="font-semibold text-[var(--ui-text-default)]"
              >
                {formatPercent(toPercentString(disclaimer.opening_cost_share), {
                  digits: 0,
                })}
              </span>
              {" of the money behind this return came from an opening balance: units you already held before the period your statement covers. We use the earliest date it covers instead of the real purchase date, which can make an old holding look like it grew enormously in a few months."}
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
