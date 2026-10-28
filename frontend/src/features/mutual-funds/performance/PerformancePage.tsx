import { useCallback, useMemo, useState } from "react";
import { Modal } from "../../../components/Modal";
import { Skeleton } from "../../../components/ui/skeleton";
import { diffDecimalStrings, formatDecimal, toPercentString } from "../../../lib/decimal";
import { formatDate, formatPercent, formatRupees } from "../../../lib/format";
import { useScope } from "../../../shell/scope/ScopeContext";
import { getMonthDetail } from "../api";
import { FundLink } from "../common/FundLink";
import { InfoMark } from "../common/SectionCard";
import { useMfAnalytics } from "../data/analyticsStore";
import { useMfHistory, useMfHoldings, useMfSection } from "../data/useMfDashboard";
import { MutualFundsFrame } from "../frame/MutualFundsFrame";
import { BenchmarkBlock } from "./BenchmarkBlock";
import {
  changeDirection,
  formatSignedPercent,
  formatSignedRupees,
  formatUnits,
  formatXirr,
  monthLabel,
  monthName,
  percentOf,
} from "../mfCopy";
import type { HistoryPoint, MonthDetail, MonthFundRow } from "../types";

function dirColor(dir: "up" | "down" | "flat"): string {
  if (dir === "up") return "text-[var(--pos-text)]";
  if (dir === "down") return "text-[var(--neg-text)]";
  return "text-[var(--ui-text-muted)]";
}

function MonthModal({
  month,
  isOpen,
  onClose,
}: {
  month: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { viewMode, memberId } = useScope();
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const detailLoad = useMfSection(
    useCallback(
      (signal: AbortSignal) => getMonthDetail({ viewMode, memberId }, month, signal),
      [viewMode, memberId, month]
    ),
    [viewMode, memberId, month]
  );

  const detail: MonthDetail | null = detailLoad.data;

  const distinctMembers = useMemo(() => {
    if (!detail?.funds) return [];
    const map = new Map<string, string>();
    for (const f of detail.funds) {
      if (!map.has(f.household_member_id)) {
        map.set(f.household_member_id, f.household_member_name);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [detail]);

  const filteredFunds: MonthFundRow[] = useMemo(() => {
    if (!detail?.funds) return [];
    if (selectedMemberId === null) return detail.funds;
    return detail.funds.filter(f => f.household_member_id === selectedMemberId);
  }, [detail, selectedMemberId]);

  return (
    <Modal title={monthName(month)} isOpen={isOpen} onClose={onClose}>
      {detailLoad.status === "loading" && (
        <div role="status" aria-label="Loading month detail" className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {detailLoad.status === "error" && (
        <div role="alert" className="flex flex-col gap-2 p-4">
          <p className="text-sm text-[var(--ui-text-muted)]">Couldn't load this month. Try again.</p>
          <button
            type="button"
            data-clickable=""
            data-effect="retry"
            onClick={detailLoad.retry}
            className="self-start text-sm font-medium text-[var(--pos-text)] hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {detailLoad.status === "data" && detail && (
        <div className="flex flex-col gap-4 text-sm">
          {/* Member chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              aria-pressed={selectedMemberId === null}
              data-clickable=""
              data-effect="select"
              onClick={() => setSelectedMemberId(null)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedMemberId === null
                  ? "bg-[var(--pos-bg)] text-[var(--pos-text)]"
                  : "bg-[var(--ui-card)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] border border-[var(--ui-divider)]"
              }`}
            >
              All
            </button>
            {distinctMembers.map(m => (
              <button
                key={m.id}
                type="button"
                aria-pressed={selectedMemberId === m.id}
                data-clickable=""
                data-effect="select"
                onClick={() => setSelectedMemberId(m.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedMemberId === m.id
                    ? "bg-[var(--pos-bg)] text-[var(--pos-text)]"
                    : "bg-[var(--ui-card)] text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] border border-[var(--ui-divider)]"
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>

          {detail.is_partial && (
            <p className="rounded-lg bg-[var(--warn-bg)] p-2.5 text-xs text-[var(--warn-text)]">
              Incomplete prices: {detail.missing_scheme_names.join(", ")}. Change and market movement are unavailable.
            </p>
          )}

          {/* Four tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3">
              <span className="text-xs text-[var(--ui-text-muted)]">Portfolio value</span>
              <p data-testid="tile-portfolio-value" className="mt-1 font-semibold text-[var(--ui-text)]">
                {formatRupees(detail.total_value)}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3">
              <span className="text-xs text-[var(--ui-text-muted)]">Change this month</span>
              <p data-testid="tile-change" className="mt-1 font-semibold text-[var(--ui-text)]">
                {detail.change !== null ? formatSignedRupees(detail.change) : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3">
              <span className="text-xs text-[var(--ui-text-muted)]">New money</span>
              <p data-testid="tile-new-money" className="mt-1 font-semibold text-[var(--ui-text)]">
                {formatRupees(detail.new_money)}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3">
              <span className="text-xs text-[var(--ui-text-muted)]">Market movement</span>
              <p data-testid="tile-market-movement" className="mt-1 font-semibold text-[var(--ui-text)]">
                {detail.market_movement !== null ? formatSignedRupees(detail.market_movement) : "—"}
              </p>
            </div>
          </div>

          {selectedMemberId !== null && (
            <p data-testid="tiles-scope-note" className="text-xs text-[var(--ui-text-muted)]">
              The four tiles above are totals for All members; the table below shows only {distinctMembers.find(m => m.id === selectedMemberId)?.name ?? "the selected member"}.
            </p>
          )}

          <p className="text-xs text-[var(--ui-text-muted)]">
            Market movement is what is left after new money, opening holdings, switches and gifted units.
          </p>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--ui-divider)] text-[var(--ui-text-muted)]">
                  <th className="py-2 pr-3 font-medium">Fund</th>
                  <th className="py-2 px-3 font-medium">Units</th>
                  <th className="py-2 px-3 font-medium">NAV (date)</th>
                  <th className="py-2 px-3 font-medium">Value</th>
                  <th className="py-2 px-3 font-medium">Cost</th>
                  <th className="py-2 px-3 font-medium">Change</th>
                  <th className="py-2 pl-3 font-medium">Market movement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ui-divider)]">
                {filteredFunds.map(f => (
                  <tr
                    key={`${f.scheme_id}:${f.household_member_id}`}
                    data-testid={`month-row-${f.scheme_id}:${f.household_member_id}`}
                  >
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-[var(--ui-text)]">
                          <FundLink schemeId={f.scheme_id}>{f.scheme_name}</FundLink>
                        </span>
                        <span className="text-[11px] text-[var(--ui-text-muted)]">{f.household_member_name}</span>
                        {!f.priced && (
                          <span className="text-[11px] text-[var(--warn-text)]">No price for this month</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">{formatUnits(f.units)}</td>
                    <td className="py-2.5 px-3">
                      {f.nav !== null ? (
                        <div className="flex flex-col">
                          <span>₹{formatDecimal(f.nav)}</span>
                          <span className="text-[11px] text-[var(--ui-text-muted)]">{formatDate(f.nav_date)}</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-[var(--ui-text)]">
                      {f.priced && f.value !== null ? formatRupees(f.value) : "—"}
                    </td>
                    <td className="py-2.5 px-3">
                      {f.priced && f.cost !== null ? formatRupees(f.cost) : "—"}
                    </td>
                    <td className="py-2.5 px-3 font-medium">
                      {f.priced && f.change_in_value !== null ? formatSignedRupees(f.change_in_value) : "—"}
                    </td>
                    <td className="py-2.5 pl-3 font-medium">
                      {f.priced && f.market_movement !== null ? formatSignedRupees(f.market_movement) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ReturnsBlock({
  holdings,
  money,
  funds,
}: {
  holdings: ReturnType<typeof useMfHoldings>;
  money: ReturnType<typeof useMfAnalytics<"investment_withdrawal">>;
  funds: ReturnType<typeof useMfAnalytics<"benchmark_funds">>;
}) {
  const [basis, setBasis] = useState<"lifetime" | "current">("lifetime");
  const [disclaimerPanelOpen, setDisclaimerPanelOpen] = useState(false);

  const xirrVal =
    holdings.xirr.data !== null
      ? basis === "lifetime"
        ? holdings.xirr.data.lifetime
        : holdings.xirr.data.current
      : null;

  const disclaimer =
    holdings.xirr.data !== null
      ? basis === "lifetime"
        ? holdings.xirr.data.disclaimers.lifetime
        : holdings.xirr.data.disclaimers.current
      : null;

  const basisWord = basis === "lifetime" ? "lifetime" : "current-holdings";

  return (
    <section
      data-testid="block-returns"
      className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 flex flex-col gap-6"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-[var(--ui-text)]">Returns</h3>
          <InfoMark text="Your annualised and absolute returns, computed from every cash flow across all your mutual fund holdings." />
        </div>

        <div
          role="group"
          aria-label="XIRR basis"
          className="inline-flex self-start rounded-xl border border-[var(--ui-divider)] p-1"
        >
          <button
            type="button"
            aria-pressed={basis === "lifetime"}
            data-clickable=""
            data-effect="switch"
            onClick={() => {
              setBasis("lifetime");
              setDisclaimerPanelOpen(false);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              basis === "lifetime"
                ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
                : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
            }`}
          >
            Lifetime
          </button>
          <button
            type="button"
            aria-pressed={basis === "current"}
            data-clickable=""
            data-effect="switch"
            onClick={() => {
              setBasis("current");
              setDisclaimerPanelOpen(false);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              basis === "current"
                ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
                : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
            }`}
          >
            Current Holdings
          </button>
        </div>

        {holdings.xirr.status === "loading" && <Skeleton className="h-10 w-36" />}

        {holdings.xirr.status === "error" && (
          <div role="alert" className="flex flex-col gap-2">
            <p className="text-sm text-[var(--ui-text-muted)]">Couldn't load XIRR</p>
            <button
              type="button"
              data-clickable=""
              data-effect="retry"
              onClick={holdings.xirr.retry}
              className="self-start text-sm font-medium text-[var(--pos-text)] hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {holdings.xirr.status === "data" && (
          <div>
            {xirrVal === null ? (
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-[var(--ui-text)]">
                  Insufficient Transaction History for XIRR
                </p>
                <p className="text-sm text-[var(--ui-text-muted)]">
                  XIRR needs transaction dates spread over a multi-month window. Yours all fall on the same day — absolute return is shown instead.
                </p>
              </div>
            ) : (
              <div className="flex items-baseline gap-1.5">
                <span data-testid="xirr-value" className="text-3xl font-bold text-[var(--ui-text)]">
                  {formatPercent(toPercentString(xirrVal), { digits: 1, signed: true })}
                </span>
                <span className="text-sm font-medium text-[var(--ui-text-muted)]">p.a.</span>
              </div>
            )}

            {disclaimer && (
              <div className="mt-2">
                <button
                  type="button"
                  data-testid="disclaimer-button"
                  aria-expanded={disclaimerPanelOpen}
                  data-clickable=""
                  data-effect="expand"
                  onClick={() => setDisclaimerPanelOpen(o => !o)}
                  className="text-left text-xs text-[var(--ui-text-muted)] hover:underline"
                >
                  {formatPercent(toPercentString(disclaimer.opening_cost_share), { digits: 0 })} of this return is based on an undated opening balance — may be inflated. Tap to see why.
                </button>

                {disclaimerPanelOpen && (
                  <div
                    data-testid="disclaimer-panel"
                    className="mt-2 flex flex-col gap-2 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3 text-xs text-[var(--ui-text-muted)]"
                  >
                    <p>
                      Your CAS statement's earliest entry already showed a holding with no transaction date — Unifolio treats it as invested on the day the statement starts, which compresses its real holding period and can inflate the annualised return.
                    </p>
                    {disclaimer.alt_xirr != null ? (
                      <p>Without the undated portion, the {basisWord} XIRR would be {formatXirr(disclaimer.alt_xirr)}.</p>
                    ) : (
                      <p>There is not enough dated activity left to compute one.</p>
                    )}
                    {basis === "lifetime" && (
                      <p>Switch to Current Holdings above to see the XIRR computed only from funds you still hold.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Absolute return tiles */}
      <div>
        {money.status === "loading" && <Skeleton className="h-24 w-full rounded-xl" />}
        {(money.status === "failed" || money.status === "error") && (
          <div role="alert" className="flex flex-col gap-2">
            <p className="text-sm text-[var(--ui-text-muted)]">Couldn't load absolute return</p>
            <button
              type="button"
              data-clickable=""
              data-effect="retry"
              onClick={money.retry}
              className="self-start text-sm font-medium text-[var(--pos-text)] hover:underline"
            >
              Retry
            </button>
          </div>
        )}
        {money.status === "ready" && money.data && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3.5">
              <span className="text-xs font-medium text-[var(--ui-text-muted)]">Total Invested</span>
              <p data-testid="abs-invested" className="mt-1 text-base font-semibold text-[var(--ui-text)]">
                {formatRupees(money.data.net_invested)}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3.5">
              <span className="text-xs font-medium text-[var(--ui-text-muted)]">Current Value</span>
              <p data-testid="abs-value" className="mt-1 text-base font-semibold text-[var(--ui-text)]">
                {formatRupees(money.data.current_value)}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3.5">
              <span className="text-xs font-medium text-[var(--ui-text-muted)]">Absolute Gain</span>
              <p
                data-testid="abs-gain"
                data-direction={changeDirection(money.data.absolute_gain)}
                className={`mt-1 text-base font-semibold ${dirColor(changeDirection(money.data.absolute_gain))}`}
              >
                {formatSignedRupees(money.data.absolute_gain)}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3.5">
              <span className="text-xs font-medium text-[var(--ui-text-muted)]">Absolute Return</span>
              <p
                data-testid="abs-return"
                data-direction={changeDirection(money.data.absolute_gain)}
                className={`mt-1 text-base font-semibold ${dirColor(changeDirection(money.data.absolute_gain))}`}
              >
                {formatSignedPercent(percentOf(money.data.absolute_gain, money.data.net_invested), 1)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Fund XIRR at a glance */}
      <div className="flex flex-col gap-3">
        <h4 className="text-sm font-semibold text-[var(--ui-text)]">Fund XIRR at a glance</h4>
        {funds.status === "loading" && <Skeleton className="h-32 w-full rounded-xl" />}
        {(funds.status === "failed" || funds.status === "error") && (
          <div role="alert" className="flex flex-col gap-2">
            <p className="text-sm text-[var(--ui-text-muted)]">Per-fund XIRR isn't available right now.</p>
            <button
              type="button"
              data-clickable=""
              data-effect="retry"
              onClick={funds.retry}
              className="self-start text-sm font-medium text-[var(--pos-text)] hover:underline"
            >
              Retry
            </button>
          </div>
        )}
        {funds.status === "ready" && funds.data && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--ui-divider)] text-xs font-medium text-[var(--ui-text-muted)]">
                  <th className="py-2.5 pr-4 font-medium">Fund</th>
                  <th className="py-2.5 px-4 font-medium">XIRR</th>
                  <th className="py-2.5 pl-4 font-medium">vs Benchmark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ui-divider)]">
                {funds.data.funds
                  .filter(f => f.fund_xirr !== null)
                  .map(f => {
                    const diff =
                      f.benchmark_xirr != null
                        ? diffDecimalStrings(toPercentString(f.fund_xirr!), toPercentString(f.benchmark_xirr))
                        : null;
                    const diffDir = changeDirection(diff);
                    return (
                      <tr key={f.scheme_id} data-testid={`fxirr-${f.scheme_id}`}>
                        <td className="py-2.5 pr-4 font-medium text-[var(--ui-text)]">
                          <FundLink schemeId={f.scheme_id}>{f.scheme_name}</FundLink>
                        </td>
                        <td className="py-2.5 px-4 font-medium text-[var(--ui-text)]">
                          {formatPercent(toPercentString(f.fund_xirr!), { digits: 1, signed: true })}
                        </td>
                        <td data-direction={diffDir} className={`py-2.5 pl-4 font-medium ${dirColor(diffDir)}`}>
                          {diff !== null ? formatSignedPercent(diff, 1) : "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

const EMPTY_HISTORY_POINTS: HistoryPoint[] = [];

function HistoryBlock({ history }: { history: ReturnType<typeof useMfHistory> }) {
  const [range, setRange] = useState<"1Y" | "3Y" | "5Y" | "All">("All");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const allPoints: HistoryPoint[] = history.data ?? EMPTY_HISTORY_POINTS;

  const shownPoints = useMemo(() => {
    const pts = history.data ?? [];
    const months = range === "1Y" ? 12 : range === "3Y" ? 36 : range === "5Y" ? 60 : null;
    if (months === null || pts.length === 0) return pts;
    // Filter by calendar month so a gap in the series does not stretch "1Y" back over older years.
    const latest = pts[pts.length - 1].month;
    const latestIndex = Number(latest.slice(0, 4)) * 12 + Number(latest.slice(5, 7)) - 1;
    const cutoff = latestIndex - (months - 1);
    return pts.filter(p => Number(p.month.slice(0, 4)) * 12 + Number(p.month.slice(5, 7)) - 1 >= cutoff);
  }, [history.data, range]);

  const selectedPoint = allPoints.find(p => p.month === selectedMonth) ?? null;
  const firstMonth = allPoints[0]?.month ?? null;

  return (
    <section
      data-testid="block-history"
      className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-[var(--ui-text)]">Portfolio History</h3>
          <InfoMark text="Month-end portfolio value since your earliest uploaded statement, for Family Combined or one member." />
        </div>

        {allPoints.length > 0 && (
          <div role="group" aria-label="Range" className="inline-flex rounded-xl border border-[var(--ui-divider)] p-1">
            {(["1Y", "3Y", "5Y", "All"] as const).map(r => (
              <button
                key={r}
                type="button"
                aria-pressed={range === r}
                data-clickable=""
                data-effect="select"
                onClick={() => setRange(r)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  range === r
                    ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
                    : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {history.status === "loading" && (
        <div role="status" aria-label="Loading history">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      )}

      {history.status === "error" && (
        <div role="alert" className="flex flex-col gap-2 p-4">
          <p className="text-sm text-[var(--ui-text-muted)]">History couldn't be loaded. Please try again.</p>
          <button
            type="button"
            data-clickable=""
            data-effect="retry"
            onClick={history.retry}
            className="self-start text-sm font-medium text-[var(--pos-text)] hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {history.status === "data" && allPoints.length === 0 && (
        <div className="py-8 text-center">
          <p className="font-semibold text-[var(--ui-text)]">No history yet</p>
          <p className="text-sm text-[var(--ui-text-muted)]">
            Upload a statement to see your portfolio month by month.
          </p>
        </div>
      )}

      {history.status === "data" && allPoints.length > 0 && (
        <div className="flex flex-col gap-4">
          {/* Chart SVG */}
          {(() => {
            const vals = shownPoints.flatMap(p => [p.value, ...(p.invested !== null ? [p.invested] : [])]);
            const minY = Math.min(...vals);
            const maxY = Math.max(...vals);

            const n = shownPoints.length;
            const getX = (i: number) => (n === 1 ? 360 : 40 + (i * 640) / (n - 1));
            const getY = (val: number) => (maxY === minY ? 110 : 180 - ((val - minY) / (maxY - minY)) * 140);

            const valueLinePoints = shownPoints.map((p, i) => `${getX(i)},${getY(p.value)}`).join(" ");
            const costPoints = shownPoints
              .map((p, i) => (p.invested !== null ? `${getX(i)},${getY(p.invested)}` : null))
              .filter(Boolean)
              .join(" ");

            return (
              <svg
                viewBox="0 0 720 220"
                role="img"
                aria-label="Portfolio value by month"
                className="w-full h-auto overflow-visible"
              >
                {costPoints && (
                  <polyline
                    points={costPoints}
                    fill="none"
                    stroke="var(--ui-text-muted)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="4 4"
                  />
                )}
                <polyline
                  points={valueLinePoints}
                  fill="none"
                  stroke="var(--pos)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {shownPoints.map((point, index) => {
                  const cx = getX(index);
                  const cy = getY(point.value);
                  const isSelected = selectedMonth === point.month;
                  return (
                    <circle
                      key={point.month}
                      cx={cx}
                      cy={cy}
                      r={isSelected ? 6 : 4.5}
                      data-testid={`point-${point.month}`}
                      data-hollow={point.partial}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      aria-label={`Select ${monthLabel(point.month)}`}
                      data-clickable=""
                      data-effect="select"
                      onClick={() => setSelectedMonth(point.month)}
                      onMouseEnter={() => setSelectedMonth(point.month)}
                      onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") {
                          if (e.key === " ") e.preventDefault();
                          setSelectedMonth(point.month);
                        }
                      }}
                      fill={point.partial ? "var(--ui-elevated)" : "var(--pos)"}
                      stroke="var(--pos)"
                      strokeWidth="2"
                      className="cursor-pointer transition-all"
                    />
                  );
                })}
              </svg>
            );
          })()}

          {/* Legend & caption */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ui-text-muted)] border-t border-[var(--ui-divider)] pt-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[var(--pos)]" />
                <span>Portfolio value</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[var(--ui-text-muted)]" />
                <span>Cost of holdings</span>
              </div>
            </div>
            {firstMonth && (
              <p>
                History starts {monthLabel(firstMonth)} (earliest statement uploaded). Hollow dot = a fund had no price that month.
              </p>
            )}
          </div>

          {/* Month card */}
          {selectedPoint && (
            <div
              data-testid="history-tooltip"
              className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-4 flex flex-col gap-2 text-xs"
            >
              <div className="text-sm font-bold text-[var(--ui-text)]">
                {monthLabel(selectedPoint.month)}
              </div>
              <div className="text-[var(--ui-text)]">
                Portfolio value {formatRupees(selectedPoint.valueText)}
              </div>
              {selectedPoint.investedText !== null && (
                <>
                  <div className="text-[var(--ui-text-muted)]">
                    Cost of holdings {formatRupees(selectedPoint.investedText)}
                  </div>
                  <div className="text-[var(--ui-text-muted)]">
                    Gain {formatRupees(diffDecimalStrings(selectedPoint.valueText, selectedPoint.investedText))}
                  </div>
                </>
              )}
              {selectedPoint.partial && selectedPoint.missing.length > 0 && (
                <div className="text-[var(--warn-text)]">
                  No price for this month: {selectedPoint.missing.join(", ")}
                </div>
              )}
              <button
                type="button"
                data-clickable=""
                data-effect="open"
                onClick={() => setIsModalOpen(true)}
                className="self-start font-medium text-[var(--pos-text)] hover:underline mt-1"
              >
                See details
              </button>
            </div>
          )}

          {isModalOpen && selectedPoint && (
            <MonthModal
              month={selectedPoint.month}
              isOpen={isModalOpen}
              onClose={() => setIsModalOpen(false)}
            />
          )}
        </div>
      )}
    </section>
  );
}

function PerformanceBody() {
  const holdings = useMfHoldings();
  const history = useMfHistory();
  const money = useMfAnalytics("investment_withdrawal");
  const funds = useMfAnalytics("benchmark_funds");

  const allErrored =
    holdings.xirr.status === "error" &&
    history.status === "error" &&
    money.status === "error" &&
    funds.status === "error";

  if (allErrored) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-8 text-center flex flex-col items-center gap-3"
      >
        <h3 className="text-lg font-semibold text-[var(--ui-text)]">
          Couldn't load your performance data
        </h3>
        <p className="text-sm text-[var(--ui-text-muted)] max-w-md">
          There was a problem reaching our servers. Your data is safe — this is just a connection issue.
        </p>
        <button
          type="button"
          data-clickable=""
          data-effect="retry"
          onClick={() => {
            holdings.xirr.retry();
            history.retry();
            money.retry();
          }}
          className="mt-2 inline-flex items-center justify-center rounded-xl bg-[var(--pos)] px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div data-testid="performance-blocks" className="flex flex-col gap-[18px]">
      <ReturnsBlock holdings={holdings} money={money} funds={funds} />
      <HistoryBlock history={history} />
      <BenchmarkBlock />
    </div>
  );
}

export default function PerformancePage() {
  return (
    <MutualFundsFrame tab="performance">
      <PerformanceBody />
    </MutualFundsFrame>
  );
}
