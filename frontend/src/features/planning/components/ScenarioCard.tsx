import { ChevronRight, Percent, Snowflake, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { formatDateRange } from "@/lib/dateRange";
import { resolveShape, signedPct, toneOf } from "../scenarioFormat";
import type { ScenarioSummary } from "../types";

export interface ScenarioCardProps {
  scenario: ScenarioSummary;
  selected: boolean;
  onSelect: (scenarioId: string) => void;
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]";
const BADGE = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold";

export function ScenarioCard({ scenario, selected, onSelect }: ScenarioCardProps) {
  const id = scenario.scenario_id;

  const iconConfig = {
    CRASH: {
      Icon: TrendingDown,
      tileClass: "bg-[var(--neg-bg)] text-[var(--neg)]",
    },
    BULL_RUN: {
      Icon: TrendingUp,
      tileClass: "bg-[color-mix(in_srgb,var(--c2)_14%,transparent)] text-[var(--c2)]",
    },
    POLICY_RATE: {
      Icon: Percent,
      tileClass: "bg-[color-mix(in_srgb,var(--c4)_14%,transparent)] text-[var(--c4)]",
    },
    HYPOTHETICAL: {
      Icon: Sparkles,
      tileClass: "bg-[color-mix(in_srgb,var(--c4)_14%,transparent)] text-[var(--c4)]",
    },
  }[scenario.scenario_type];

  const IconComponent = iconConfig.Icon;

  const hasFreeze = Boolean(scenario.had_redemption_freeze_schemes && scenario.had_redemption_freeze_schemes.length > 0);
  const hasOngoing = Boolean(scenario.is_ongoing);
  const isAssumption = scenario.scenario_type === "HYPOTHETICAL";
  const hasBadges = hasFreeze || hasOngoing || isAssumption;

  const dates = formatDateRange(scenario.start_date, scenario.end_date, scenario.is_ongoing);

  const showStat = resolveShape(scenario) === "standard" && scenario.quick_market_pct !== null;
  const tone = showStat ? toneOf(scenario.quick_market_pct) : "neutral";
  const statColor =
    tone === "gain"
      ? "text-[var(--pos-text)]"
      : tone === "loss"
        ? "text-[var(--neg-text)]"
        : "text-[var(--ui-text-muted)]";

  return (
    <button
      type="button"
      data-testid={`card-${id}`}
      aria-pressed={selected}
      onClick={() => onSelect(id)}
      className={`flex min-h-[150px] min-w-0 flex-col gap-1.5 rounded-xl text-left ${FOCUS} ${
        selected
          ? "border-2 border-[var(--pos)] bg-[var(--pos-bg)] p-[13px]"
          : "border border-[var(--ui-divider)] bg-[var(--ui-card)] p-[14px] hover:border-[var(--ui-border-hover)]"
      }`}
    >
      <span className="flex items-start gap-2.5">
        <span
          data-testid={`card-icon-${id}`}
          data-type={scenario.scenario_type}
          aria-hidden="true"
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${iconConfig.tileClass}`}
        >
          <IconComponent className="h-5 w-5" />
        </span>
        <span
          data-testid={`card-name-${id}`}
          className="line-clamp-2 min-w-0 break-words text-[13.5px] font-semibold leading-snug text-[var(--ui-text)]"
        >
          {scenario.name}
        </span>
      </span>

      {hasBadges && (
        <span className="flex flex-wrap gap-1.5">
          {hasFreeze && (
            <span
              data-testid={`card-badge-freeze-${id}`}
              className={`${BADGE} border-[var(--warn)] bg-[var(--warn-bg)] text-[var(--warn-text)]`}
            >
              <Snowflake aria-hidden="true" className="h-3 w-3" />
              Freeze
            </span>
          )}
          {hasOngoing && (
            <span
              data-testid={`card-badge-ongoing-${id}`}
              className={`${BADGE} border-[var(--ui-divider)] text-[var(--ui-text-muted)]`}
            >
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--neg)]" />
              ongoing
            </span>
          )}
          {isAssumption && (
            <span
              data-testid={`card-badge-assumption-${id}`}
              className={`${BADGE} border-[var(--c4)] bg-[color-mix(in_srgb,var(--c4)_14%,transparent)] text-[var(--c4)]`}
            >
              Assumption-based
            </span>
          )}
        </span>
      )}

      {dates !== null && (
        <span data-testid={`card-dates-${id}`} className="text-xs text-[var(--ui-text-muted)]">
          {dates}
        </span>
      )}

      {scenario.description !== "" && (
        <span
          data-testid={`card-desc-${id}`}
          title={scenario.description}
          className="line-clamp-2 text-[12.5px] text-[var(--ui-text)]"
        >
          {scenario.description}
        </span>
      )}

      <span className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs font-semibold">
        {showStat ? (
          <span data-testid={`card-stat-${id}`} data-tone={tone} className={statColor}>
            {`Nifty 50: ${signedPct(scenario.quick_market_pct)}`}
          </span>
        ) : (
          <span />
        )}
        <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--ui-text-muted)]" />
      </span>
    </button>
  );
}
