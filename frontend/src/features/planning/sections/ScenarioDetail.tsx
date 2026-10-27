import { Info, Snowflake } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { formatDateRange } from "@/lib/dateRange";
import { compareDecimalStrings } from "@/lib/decimal";
import { AssetClassChart } from "../components/AssetClassChart";
import { BenchmarkChart } from "../components/BenchmarkChart";
import { MemberRows } from "../components/MemberRows";
import { MemberSelect } from "../components/MemberSelect";
import { MiraInsightsCard } from "../components/MiraInsightsCard";
import { StatTile } from "../components/StatTile";
import {
  COMPLIANCE_COPY,
  FREEZE_BIG,
  FREEZE_HEADLINE,
  IMPORT_LABEL,
  NO_DATA,
  NO_HOLDINGS_LINE,
  NO_HOLDINGS_TITLE,
  NONE_FROZEN,
  ONGOING_SUFFIX,
  PRE_2006_NOTE,
} from "../planningCopy";
import { resolveShape, signedPct, toneOf } from "../scenarioFormat";
import { buildTiles } from "../tiles";
import type { MemberChoice, ScenarioResult } from "../types";

export interface ScenarioDetailProps {
  result: ScenarioResult;
  members: { id: string; name: string }[];
  selectedMemberId: MemberChoice;
  resultMemberId?: MemberChoice;
  onMemberChange: (memberId: MemberChoice) => void;
  refreshing: boolean;
  onImport: () => void;
  onLearnMore: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]";
const NOTE_CARD = "flex items-start gap-2.5 rounded-[10px] border border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-3.5 py-3 text-sm text-[var(--ui-text-muted)]";

function Numbers({ refreshing, children }: { refreshing: boolean; children: ReactNode }) {
  return (
    <div
      data-testid="detail-numbers"
      aria-busy={refreshing}
      className={`space-y-4 transition-opacity ${refreshing ? "opacity-60" : ""}`}
    >
      {children}
    </div>
  );
}

function Tiles({ result }: { result: ScenarioResult }) {
  const tiles = buildTiles(result);
  if (tiles.length === 0) return null;
  return (
    <div data-testid="tiles" className="grid grid-cols-1 gap-3 sm:grid-cols-2 min-[1280px]:grid-cols-4">
      {tiles.map(tile => (
        <StatTile
          key={tile.key}
          tileKey={tile.key}
          caption={tile.caption}
          value={tile.value}
          tone={tile.tone}
          line={tile.line}
          lineTone={tile.lineTone}
          note={tile.note}
        />
      ))}
    </div>
  );
}

export function ScenarioDetail({
  result,
  members,
  selectedMemberId,
  resultMemberId,
  onMemberChange,
  refreshing,
  onImport,
  onLearnMore,
  headingRef,
}: ScenarioDetailProps) {
  const shape = resolveShape(result.scenario);
  if (shape === "hypothetical") {
    return null;
  }

  const noHoldings =
    (result.total_value === null || compareDecimalStrings(result.total_value, "0") === 0) &&
    result.by_member.every(m => m.funds.length === 0);

  const pre2006 = result.funds_data_available === false;
  const dates = formatDateRange(result.scenario.start_date, result.scenario.end_date, result.scenario.is_ongoing);
  const effectiveMemberId = resultMemberId ?? selectedMemberId;

  return (
    <div data-testid="scenario-detail" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="break-words font-heading text-lg font-bold text-[var(--ui-text)] focus:outline-none"
          >
            {result.scenario.name}
          </h2>
          {dates !== null && (
            <p data-testid="detail-dates" className="text-xs text-[var(--ui-text-muted)]">
              {dates}
            </p>
          )}
          {result.scenario.description !== "" && (
            <p data-testid="detail-description" className="text-sm text-[var(--ui-text)]">
              {result.scenario.description}
            </p>
          )}
        </div>
        {!noHoldings && (
          <div className="w-full sm:w-56">
            <MemberSelect members={members} value={selectedMemberId} onChange={onMemberChange} />
          </div>
        )}
      </div>

      <p data-testid="detail-disclaimer" className="text-xs italic text-[var(--ui-text-muted)]">
        {COMPLIANCE_COPY}
        {result.scenario.is_ongoing ? ONGOING_SUFFIX : ""}
      </p>

      {noHoldings ? (
        <div data-testid="no-holdings" className={NOTE_CARD}>
          <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <b className="text-[var(--ui-text)]">{NO_HOLDINGS_TITLE}</b>
            <div>{NO_HOLDINGS_LINE}</div>
            <button
              type="button"
              onClick={onImport}
              className={`mt-2.5 rounded-lg bg-[var(--ui-text)] px-3.5 py-1.5 text-sm font-semibold text-[var(--ui-page)] ${FOCUS}`}
            >
              {IMPORT_LABEL}
            </button>
          </div>
        </div>
      ) : pre2006 ? (
        <Numbers refreshing={refreshing}>
          <Tiles result={result} />
          <div data-testid="pre-2006-note" className={NOTE_CARD}>
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{PRE_2006_NOTE}</div>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <BenchmarkChart portfolioPct={null} benchmarks={result.benchmarks} />
            <MiraInsightsCard onLearnMore={onLearnMore} />
          </div>
        </Numbers>
      ) : shape === "redemption_freeze" ? (
        <>
          <Numbers refreshing={refreshing}>
            {result.by_member.some(m => m.funds.some(f => f.is_frozen)) ? (
              <div
                data-testid="freeze-banner"
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--warn)] bg-[var(--warn-bg)] px-4 py-3 text-[var(--warn-text)]"
              >
                <b className="flex items-center gap-2">
                  <Snowflake aria-hidden="true" className="h-4 w-4" />
                  {FREEZE_HEADLINE}
                </b>
                <b className="font-heading text-lg">{FREEZE_BIG}</b>
              </div>
            ) : (
              <p data-testid="none-frozen" className={NOTE_CARD}>
                {NONE_FROZEN}
              </p>
            )}
          </Numbers>
          <MemberRows result={result} selectedMemberId={effectiveMemberId} />
        </>
      ) : shape === "multi_phase" ? (
        <>
          <Numbers refreshing={refreshing}>
            <Tiles result={result} />
            <ol aria-label="Phases" data-testid="phases" className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-3">
              {[...result.phases]
                .sort((a, b) => a.order - b.order)
                .map(phase => {
                  const isNull = phase.pct === null;
                  const tone = toneOf(phase.pct);
                  const color = isNull
                    ? "text-[var(--ui-text-muted)]"
                    : tone === "gain"
                      ? "text-[var(--pos-text)]"
                      : tone === "loss"
                        ? "text-[var(--neg-text)]"
                        : "text-[var(--ui-text)]";
                  const phaseDates = formatDateRange(phase.start_date, phase.end_date, phase.is_ongoing);
                  return (
                    <li
                      key={phase.order}
                      data-testid={`phase-${phase.order}`}
                      className="min-w-0 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] px-4 py-3.5"
                    >
                      <div className="flex items-center gap-1.5 text-sm text-[var(--ui-text-muted)]">
                        <span>{phase.label}</span>
                        {phase.is_ongoing && (
                          <span
                            data-testid={`phase-ongoing-${phase.order}`}
                            aria-hidden="true"
                            className="h-1.5 w-1.5 rounded-full bg-[var(--neg)]"
                          />
                        )}
                      </div>
                      {phaseDates !== null && (
                        <div className="text-xs text-[var(--ui-text-muted)]">{phaseDates}</div>
                      )}
                      <div
                        data-testid={`phase-pct-${phase.order}`}
                        data-tone={tone}
                        className={`mt-1 font-heading text-lg font-bold tabular-nums ${color}`}
                      >
                        {isNull ? NO_DATA : signedPct(phase.pct)}
                      </div>
                    </li>
                  );
                })}
            </ol>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <AssetClassChart
                rows={result.by_asset_class}
                coveredValue={result.covered_value}
                totalValue={result.total_value}
              />
              <MiraInsightsCard onLearnMore={onLearnMore} />
            </div>
          </Numbers>
          <MemberRows result={result} selectedMemberId={effectiveMemberId} />
        </>
      ) : (
        <>
          <Numbers refreshing={refreshing}>
            <Tiles result={result} />
            <div
              data-testid="charts"
              className="grid grid-cols-1 gap-3 lg:grid-cols-2 min-[1280px]:grid-cols-[5fr_6fr_4fr]"
            >
              <BenchmarkChart portfolioPct={result.portfolio_impact_pct} benchmarks={result.benchmarks} />
              <AssetClassChart
                rows={result.by_asset_class}
                coveredValue={result.covered_value}
                totalValue={result.total_value}
              />
              <div className="min-w-0 lg:col-span-2 min-[1280px]:col-span-1">
                <MiraInsightsCard onLearnMore={onLearnMore} />
              </div>
            </div>
          </Numbers>
          <MemberRows result={result} selectedMemberId={effectiveMemberId} />
        </>
      )}
    </div>
  );
}
