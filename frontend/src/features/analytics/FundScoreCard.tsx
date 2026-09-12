import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { FundScoreRow } from "./types";
import { ShieldAlert, Info, Sparkles, CheckCircle2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toPercentString } from "@/lib/decimal";
import {
  FACTOR_KEYS,
  FACTOR_LABELS,
  assessFactor,
  buildWhySentence,
  displayTierFromBackendTier,
  whatThisMeansForYou,
  type FactorKey,
} from "./fundScoreVerdicts";

export interface FundScoreCardProps {
  data: FundScoreRow;
  /** A static PDF export can't click to expand an accordion — force both open. */
  printMode?: boolean;
}

function parseNum(val: string | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

function formatRawFractionPercent(val: string | null | undefined): string {
  return val == null ? "N/A" : `${toPercentString(val)}%`;
}

const DOT_CLASS: Record<string, string> = {
  green: "bg-[var(--color-positive)]",
  orange: "bg-[var(--color-warning)]",
  red: "bg-[var(--color-negative)]",
};

function UnavailableNotice({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 p-4 flex items-center gap-3">
      {icon}
      <div className="text-xs">
        <p className="font-bold text-[var(--color-ink)]">{title}</p>
        <p className="text-[var(--color-text-secondary)]">{body}</p>
      </div>
    </div>
  );
}

interface AssessedFactor {
  key: FactorKey;
  dotColor: "green" | "orange" | "red";
  sentence: string;
}

function FactorGroup({ title, items }: { title: string; items: AssessedFactor[] }) {
  return (
    <div className="space-y-2">
      <span
        className={cn(
          "text-[10px] font-bold uppercase tracking-wider block",
          title === "Strengths" ? "text-[var(--color-positive)]" : "text-[var(--color-warning)]"
        )}
      >
        {title}
      </span>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.key}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 flex items-start gap-3 shadow-2xs"
          >
            <span className={cn("h-2.5 w-2.5 rounded-full mt-1.5 flex-shrink-0", DOT_CLASS[item.dotColor])} />
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-[var(--color-ink)]">{FACTOR_LABELS[item.key]}</span>
              <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">{item.sentence}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Accordion({
  open,
  onToggle,
  title,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  children: ReactNode;
}) {
  const panelId = `fund-score-accordion-${title.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center justify-between p-3.5 text-xs font-semibold text-[var(--color-ink)] bg-[var(--color-bg)]/40 hover:bg-[var(--color-bg)]/70 transition-colors"
      >
        <span>{title}</span>
        <ChevronDown
          className={cn("h-4 w-4 text-[var(--color-text-secondary)] transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div id={panelId} className="p-3.5 pt-3 text-xs space-y-2.5 border-t border-[var(--color-border)]">
          {children}
        </div>
      )}
    </div>
  );
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-text-secondary)]">{label}</span>
      <span className="font-semibold text-[var(--color-ink)] tabular-nums">{value}</span>
    </div>
  );
}

function EvidenceSection({ data }: { data: FundScoreRow }) {
  const downside = parseNum(data.downside_deviation);
  const categoryAvgDownside = parseNum(data.category_avg_downside_deviation);
  // Annualized (x sqrt(12)) purely for a more legible on-screen number --
  // risk_metrics.py's docstring notes this is a constant scalar that
  // doesn't change relative ranking, so it's safe as a display-only
  // transform without touching the backend's ranking computation.
  const annualizedDownside = downside !== null ? downside * Math.sqrt(12) * 100 : null;
  const annualizedCategoryDownside =
    categoryAvgDownside !== null ? categoryAvgDownside * Math.sqrt(12) * 100 : null;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="font-semibold text-[var(--color-ink)]">Return</p>
        <EvidenceRow label="This fund" value={formatRawFractionPercent(data.scheme_return)} />
        <EvidenceRow label="Category average" value={formatRawFractionPercent(data.category_avg_return)} />
      </div>
      <div className="space-y-1.5">
        <p className="font-semibold text-[var(--color-ink)]">Downside protection (annualized downside deviation)</p>
        <EvidenceRow label="This fund" value={annualizedDownside !== null ? `${annualizedDownside.toFixed(2)}%` : "N/A"} />
        <EvidenceRow
          label="Category average"
          value={annualizedCategoryDownside !== null ? `${annualizedCategoryDownside.toFixed(2)}%` : "N/A"}
        />
      </div>
      <div className="space-y-1.5">
        <p className="font-semibold text-[var(--color-ink)]">Consistency</p>
        <EvidenceRow
          label="Rolling 12-month periods beaten"
          value={
            data.consistency_hits != null && data.consistency_total_windows != null
              ? `${data.consistency_hits} of ${data.consistency_total_windows}`
              : "N/A"
          }
        />
      </div>
    </div>
  );
}

function MethodologySection({ costAdjNum }: { costAdjNum: number | null }) {
  return (
    <div className="space-y-2 text-[var(--color-text-secondary)] leading-relaxed">
      <p>
        The Unifolio Score combines three weighted components, ranked against every fund in the same SEBI
        category:
      </p>
      <ul className="list-disc pl-4 space-y-1">
        <li>
          <span className="font-semibold text-[var(--color-ink)]">Return — 45% of score:</span> medium/long-term
          CAGR growth vs. category peers.
        </li>
        <li>
          <span className="font-semibold text-[var(--color-ink)]">Downside protection — 30% of score:</span>{" "}
          downside-only volatility (losses in bad months only) vs. category peers.
        </li>
        <li>
          <span className="font-semibold text-[var(--color-ink)]">Consistency — 25% of score:</span> how often
          the fund beat its category's median return over rolling 12-month periods.
        </li>
      </ul>
      <p>
        A cost adjustment of up to ±0.25 points is then applied based on this fund's expense ratio (TER) versus
        the AUM-weighted category average, with a 0.05 percentage-point dead zone where no adjustment is made.
        {costAdjNum !== null && (
          <span className="block mt-1 font-medium text-[var(--color-ink)]">
            {costAdjNum > 0
              ? `This fund received a +${costAdjNum.toFixed(2)} point low-fee bonus.`
              : costAdjNum < 0
                ? `This fund received a ${costAdjNum.toFixed(2)} point high-fee penalty.`
                : "This fund's fee is close enough to the category average — no adjustment applied."}
          </span>
        )}
      </p>
    </div>
  );
}

export function FundScoreCard({ data, printMode = false }: FundScoreCardProps) {
  const [evidenceOpen, setEvidenceOpen] = useState(printMode);
  const [methodologyOpen, setMethodologyOpen] = useState(printMode);

  if (data.category_unavailable) {
    return (
      <div className="space-y-6 pt-2">
        <UnavailableNotice
          icon={<ShieldAlert className="h-5 w-5 text-[var(--color-warning)] flex-shrink-0" />}
          title="Category Data Unavailable"
          body="This scheme cannot be scored because SEBI category classification data is not available."
        />
      </div>
    );
  }
  if (data.insufficient_history) {
    return (
      <div className="space-y-6 pt-2">
        <UnavailableNotice
          icon={<Info className="h-5 w-5 text-[var(--color-warning)] flex-shrink-0" />}
          title="Insufficient Track Record"
          body="This fund does not have enough historical NAV data to evaluate downside risk and 12-month rolling consistency."
        />
      </div>
    );
  }

  const finalScoreNum = parseNum(data.final_score);
  const displayScore = finalScoreNum !== null ? finalScoreNum / 10 : null;
  const returnPct = parseNum(data.return_percentile);
  const riskPct = parseNum(data.risk_percentile);
  const consistencyPct = parseNum(data.consistency_hit_rate);
  const costAdjNum = parseNum(data.cost_adjustment);
  const displayTier = data.risk_adjusted_tier !== null ? displayTierFromBackendTier(data.risk_adjusted_tier) : null;

  const factorPct: Record<FactorKey, number | null> = {
    return: returnPct,
    risk: riskPct,
    consistency: consistencyPct,
  };
  const fullyScored = returnPct !== null && riskPct !== null && consistencyPct !== null;
  const assessments = fullyScored
    ? FACTOR_KEYS.map((key) => ({ key, ...assessFactor(key, factorPct[key]!) }))
    : [];
  const strengths = assessments.filter((a) => a.bucket === "strength");
  const watchouts = assessments.filter((a) => a.bucket === "watchout");

  const whySentence =
    fullyScored && displayTier !== null
      ? buildWhySentence({
          returnPct: returnPct!,
          riskPct: riskPct!,
          consistencyPct: consistencyPct!,
          displayTier,
          costAdjustment: costAdjNum,
        })
      : null;

  return (
    <div className="space-y-6 pt-2">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/60 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-[var(--color-text-secondary)] uppercase tracking-wider block">
              Unifolio Score
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="font-display text-3xl font-bold text-[var(--color-ink)] tabular-nums type-display">
                {displayScore !== null ? displayScore.toFixed(1) : "N/A"}
              </span>
              <span className="text-xs font-semibold text-[var(--color-text-secondary)]">/ 10</span>
            </div>
          </div>
          {displayTier !== null && (
            <div className="text-right">
              <Badge className="bg-[var(--color-accent)] text-white font-bold text-xs px-3 py-1 shadow-xs">
                Tier {displayTier} of 5
              </Badge>
              <span className="text-[10px] text-[var(--color-text-secondary)] block mt-1">
                {displayTier <= 2
                  ? "Top Tier Performer"
                  : displayTier === 3
                    ? "Average Category Rank"
                    : "Below Category Average"}
              </span>
            </div>
          )}
        </div>
        {whySentence && (
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed border-t border-[var(--color-border)]/60 pt-2.5">
            {whySentence}
          </p>
        )}
      </div>

      {fullyScored && (
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)] flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)]" />
            <span>What's driving your score</span>
          </h4>
          {strengths.length > 0 && <FactorGroup title="Strengths" items={strengths} />}
          {watchouts.length > 0 && <FactorGroup title="Watch-outs" items={watchouts} />}
        </div>
      )}

      {displayTier !== null && (
        <div className="rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 p-4 text-xs">
          <p className="font-bold text-[var(--color-ink)] mb-1">What this means for you</p>
          <p className="text-[var(--color-text-secondary)] leading-relaxed">{whatThisMeansForYou(displayTier)}</p>
        </div>
      )}

      <Accordion open={evidenceOpen} onToggle={() => setEvidenceOpen((v) => !v)} title="See the evidence">
        <EvidenceSection data={data} />
      </Accordion>

      <Accordion
        open={methodologyOpen}
        onToggle={() => setMethodologyOpen((v) => !v)}
        title="How we calculate this score"
      >
        <MethodologySection costAdjNum={costAdjNum} />
      </Accordion>

      <div className="rounded-xl border border-[var(--color-border)]/80 bg-[var(--color-bg)]/30 p-3.5 text-[11px] text-[var(--color-text-secondary)] space-y-1">
        <p className="font-bold text-[var(--color-ink)] flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-positive)]" />
          <span>Transparent Methodology Commitment</span>
        </p>
        <p className="leading-relaxed">
          Unifolio Fund Scores are modeling judgments built on historical data using a fixed 45% Return / 30%
          Downside Risk / 25% Consistency formula with TER fee nudges. They are comparative analytical insights,
          not regulated investment advice or guarantees.
        </p>
      </div>
    </div>
  );
}
