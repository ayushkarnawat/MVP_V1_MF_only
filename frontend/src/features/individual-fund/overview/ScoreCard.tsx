import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Skeleton } from "@/components/ui/skeleton";
import { CLICK_CARD } from "@/lib/clickable";
import { formatDate, formatPercent, scoreBand } from "@/lib/format";
import { toPercentString } from "@/lib/decimal";
import type { ScoreResponse } from "../types";
import type { FundSection } from "../useFundSection";
import { scoreNoRingText, scoreSentence, unavailableText } from "../fundCopy";
import { formatWhole } from "../fundFormat";

export interface ScoreCardProps {
  score: FundSection<ScoreResponse>;
}

const CARD = "flex items-center gap-4 rounded-xl bg-[var(--ui-card)] p-4";

export function FundScoreRing({ score }: { score: number }) {
  const band = scoreBand(score);
  const clamped = Math.min(100, Math.max(0, score));
  const length = Math.round((clamped / 100) * 169.6 * 10) / 10;

  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg
        viewBox="0 0 64 64"
        width="64"
        height="64"
        role="img"
        aria-label={`Fund score ${formatWhole(String(score))} out of 100`}
      >
        <circle
          cx="32"
          cy="32"
          r="27"
          fill="none"
          stroke="var(--ui-divider)"
          strokeWidth="7"
        />
        <circle
          data-testid="score-ring-arc"
          cx="32"
          cy="32"
          r="27"
          fill="none"
          stroke={band.color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${length} 169.6`}
          transform="rotate(-90 32 32)"
        />
      </svg>
      <span
        data-testid="score-number"
        className="absolute inset-0 flex items-center justify-center font-display text-lg font-bold text-[var(--ui-text)]"
      >
        {formatWhole(String(score))}
      </span>
    </div>
  );
}

export function ScoreCard({ score }: ScoreCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (score.status === "loading") {
    return (
      <div role="status" aria-label="Loading score" className={CARD}>
        <Skeleton className="h-16 w-16 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
    );
  }

  if (score.status === "error") {
    return (
      <div role="alert" className={CARD}>
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium text-[var(--neg-text)]">
            Couldn't load the score.
          </p>
          {score.retry && (
            <button
              type="button"
              onClick={score.retry}
              className="rounded px-2.5 py-1 text-xs font-semibold bg-[var(--ui-card)] text-[var(--ui-text)] hover:opacity-90 transition-opacity border border-[var(--ui-divider)]"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  if (score.status === "unavailable" || !score.data) {
    return (
      <div data-testid="score-card" className={CARD}>
        <div>
          <span className="text-xs text-[var(--ui-text-muted)]">
            Unifolio Fund Score
          </span>
          <p className="text-sm text-[var(--ui-text-muted)] mt-1">
            {unavailableText(score.reason)}
          </p>
        </div>
      </div>
    );
  }

  const noRingText = scoreNoRingText(score.data);
  if (noRingText) {
    return (
      <div data-testid="score-card" className={CARD}>
        <div>
          <span className="text-xs text-[var(--ui-text-muted)]">
            Unifolio Fund Score
          </span>
          <p className="text-sm text-[var(--ui-text-muted)] mt-1">
            {noRingText}
          </p>
        </div>
      </div>
    );
  }

  const data = score.data;
  const finalScoreNum = Number(data.final_score);
  const band = scoreBand(finalScoreNum);

  const pct = (f: string | null | undefined): string => {
    if (f == null) return "—";
    return formatPercent(toPercentString(f), { digits: 1 });
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        data-testid="score-card"
        className={`${CARD} ${CLICK_CARD}`}
        onClick={() => setIsOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setIsOpen(true);
          } else if (e.key === " ") {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
      >
        <FundScoreRing score={finalScoreNum} />
        <div className="flex-1 min-w-0">
          <span className="text-xs text-[var(--ui-text-muted)]">
            Unifolio Fund Score
          </span>
          <p
            data-testid="score-band"
            className="text-base font-semibold leading-tight"
            style={{ color: band.color }}
          >
            {band.word}
          </p>
          <p className="text-xs text-[var(--ui-text-muted)] truncate mt-0.5">
            {scoreSentence(band.word)}
          </p>
        </div>
        <ChevronRight
          className="h-5 w-5 text-[var(--ui-text-muted)] shrink-0"
          aria-hidden="true"
        />
      </div>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Unifolio Fund Score"
      >
        <dl className="divide-y divide-[var(--ui-divider)]">
          <div className="flex justify-between py-2 text-sm">
            <dt className="text-[var(--ui-text-muted)]">Score</dt>
            <dd
              data-testid="score-value"
              className="font-semibold text-[var(--ui-text)]"
            >
              {`${formatWhole(data.final_score)} / 100`}
            </dd>
          </div>
          <div className="flex justify-between py-2 text-sm">
            <dt className="text-[var(--ui-text-muted)]">Rating</dt>
            <dd
              data-testid="score-rating"
              className="font-semibold text-[var(--ui-text)]"
            >
              {band.word}
            </dd>
          </div>
          <div className="flex justify-between py-2 text-sm">
            <dt className="text-[var(--ui-text-muted)]">Return vs category</dt>
            <dd
              data-testid="score-return"
              className="font-semibold text-[var(--ui-text)]"
            >
              {`${pct(data.scheme_return)} vs ${pct(data.category_avg_return)}`}
            </dd>
          </div>
          <div className="flex justify-between py-2 text-sm">
            <dt className="text-[var(--ui-text-muted)]">Return percentile</dt>
            <dd
              data-testid="score-return-pct"
              className="font-semibold text-[var(--ui-text)]"
            >
              {formatWhole(data.return_percentile)}
            </dd>
          </div>
          <div className="flex justify-between py-2 text-sm">
            <dt className="text-[var(--ui-text-muted)]">Risk percentile</dt>
            <dd
              data-testid="score-risk-pct"
              className="font-semibold text-[var(--ui-text)]"
            >
              {formatWhole(data.risk_percentile)}
            </dd>
          </div>
          <div className="flex justify-between py-2 text-sm">
            <dt className="text-[var(--ui-text-muted)]">Consistency</dt>
            <dd
              data-testid="score-consistency"
              className="font-semibold text-[var(--ui-text)]"
            >
              {data.consistency_hits == null ||
              data.consistency_total_windows == null
                ? "—"
                : `${data.consistency_hits} of ${data.consistency_total_windows} rolling windows`}
            </dd>
          </div>
          <div className="flex justify-between py-2 text-sm">
            <dt className="text-[var(--ui-text-muted)]">Updated</dt>
            <dd
              data-testid="score-updated"
              className="font-semibold text-[var(--ui-text)]"
            >
              {formatDate(data.computed_at)}
            </dd>
          </div>
        </dl>
      </Modal>
    </>
  );
}
