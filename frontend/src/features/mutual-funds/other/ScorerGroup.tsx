import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { formatPercent as formatLookthroughPercent } from "../../../components/mf/lookthroughDisplay";
import { formatRupees } from "../../../lib/format";
import { SectionCard } from "../common/SectionCard";
import { useMfAnalytics } from "../data/analyticsStore";
import type { PortfolioScoreSummary } from "../types";
import {
  assessFactor,
  costLine,
  displayTier,
  FACTOR_KEYS,
  FACTOR_LABELS,
  factorPercentiles,
  isScored,
  portfolioVerdict,
  rawPercent,
  SCORE_EXPLAINER,
  tierCaption,
  TIER_STYLE,
  tierTone,
  unscoredReason,
  VERDICT_LABEL,
  whatThisMeans,
  whySentence,
} from "./otherLogic";

export function ScorerBody({ data }: { data: PortfolioScoreSummary }) {
  const [explainerOpen, setExplainerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState<{ evidence: boolean; methodology: boolean }>({
    evidence: false,
    methodology: false,
  });

  const scored = data.funds.filter(isScored);
  const selected =
    (selectedId ? scored.find(f => f.scheme_id === selectedId) : null) ?? scored[0] ?? null;

  const weightedVerdict = data.weighted_score ? portfolioVerdict(data.weighted_score) : null;

  return (
    <div data-testid="scorer-body" className="space-y-6">
      {/* Explainer */}
      <div className="space-y-2">
        <button
          type="button"
          aria-expanded={explainerOpen}
          data-testid="explainer-toggle"
          data-clickable=""
          data-effect="expand"
          onClick={() => setExplainerOpen(!explainerOpen)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--pos-text)] hover:underline"
        >
          <span>How is this calculated?</span>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${explainerOpen ? "rotate-180" : ""}`}
          />
        </button>

        {explainerOpen && (
          <div
            role="region"
            aria-label="How the Unifolio Fund Score works"
            data-testid="explainer-body"
            className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-4 space-y-2 text-xs text-[var(--ui-text-muted)]"
          >
            <h5 className="font-semibold text-[var(--ui-text)]">How the Unifolio Fund Score works</h5>
            {SCORE_EXPLAINER.map((text, idx) => (
              <p key={idx}>{text}</p>
            ))}
          </div>
        )}
      </div>

      {/* Hero */}
      <div
        data-testid="score-hero"
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-5 space-y-3"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--ui-text-muted)]">Portfolio Weighted Score</span>
          <span className="rounded bg-[var(--ui-elevated)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ui-text-muted)] border border-[var(--ui-divider)]">
            AUM Weighted
          </span>
        </div>

        {data.weighted_score !== null && weightedVerdict ? (
          <div className="flex flex-wrap items-baseline gap-2">
            <span data-testid="score-weighted" className="text-3xl font-extrabold text-[var(--ui-text)]">
              {formatLookthroughPercent(data.weighted_score, 1)}
            </span>
            <span className="text-sm font-semibold text-[var(--ui-text-muted)]">/100</span>
            <span
              data-testid="score-verdict"
              data-tone={weightedVerdict.tone}
              style={{ color: TIER_STYLE[weightedVerdict.tone].text }}
              className="ml-2 text-sm font-bold"
            >
              {weightedVerdict.label}
            </span>
          </div>
        ) : (
          <span data-testid="score-unavailable" className="text-base font-semibold text-[var(--ui-text-muted)]">
            Score unavailable — not enough history
          </span>
        )}

        <p className="text-xs text-[var(--ui-text-muted)]">
          Blends every scored fund's score by its ₹ value in your portfolio — a big winning fund moves this more than a small one.
        </p>

        <p data-testid="score-coverage" className="text-xs text-[var(--ui-text-muted)]">
          Scored value coverage: {formatRupees(data.covered_value)} of {formatRupees(data.total_value)}
        </p>
      </div>

      {/* Unscored callout */}
      {data.uncovered_schemes && data.uncovered_schemes.length > 0 && (
        <div
          role="note"
          data-testid="unscored-callout"
          className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-4 space-y-2 text-xs text-[var(--ui-text-muted)]"
        >
          <p className="font-semibold text-[var(--ui-text)]">
            Unscored funds ({data.uncovered_schemes.length})
          </p>
          <ul className="list-disc pl-4 space-y-1">
            {data.uncovered_schemes.map((name, idx) => (
              <li key={idx}>
                {name} couldn't be scored — this fund doesn't have enough category or historical NAV data to evaluate downside risk and 12-month rolling consistency.
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Card Grid */}
      {data.funds.length === 0 ? (
        <p className="text-sm text-[var(--ui-text-muted)]">No fund score data available</p>
      ) : (
        <div role="group" aria-label="Fund quality scores" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.funds.map(fund => {
            const scoredFund = isScored(fund);
            if (scoredFund) {
              const isSelected = selected?.scheme_id === fund.scheme_id;
              const tier = displayTier(fund.risk_adjusted_tier!);
              const tone = tierTone(tier);

              return (
                <button
                  key={fund.scheme_id}
                  type="button"
                  aria-pressed={isSelected}
                  data-testid={`score-card-${fund.scheme_id}`}
                  data-selected={isSelected}
                  data-clickable=""
                  data-effect="select"
                  onClick={() => setSelectedId(fund.scheme_id)}
                  className={`flex flex-col gap-2 rounded-2xl border p-4 text-left transition-all ${
                    isSelected
                      ? "border-[var(--ui-text)] bg-[var(--ui-card)] shadow-sm ring-1 ring-[var(--ui-text)]"
                      : "border-[var(--ui-divider)] bg-[var(--ui-card)] hover:bg-[var(--ui-row-hover)]"
                  }`}
                >
                  <span className="truncate text-xs font-semibold text-[var(--ui-text)]">
                    {fund.scheme_name}
                  </span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span
                      data-testid={`score-value-${fund.scheme_id}`}
                      className="text-xl font-bold text-[var(--ui-text)]"
                    >
                      {formatLookthroughPercent(fund.final_score!, 1)}
                    </span>
                    <span
                      data-testid={`score-tier-${fund.scheme_id}`}
                      data-tone={tone}
                      style={{ color: TIER_STYLE[tone].text }}
                      className="text-xs font-bold"
                    >
                      Tier {tier}
                    </span>
                  </div>
                </button>
              );
            }

            const reason = unscoredReason(fund);
            return (
              <div
                key={fund.scheme_id}
                data-testid={`score-card-${fund.scheme_id}`}
                data-unscored="true"
                tabIndex={0}
                title={reason}
                data-tooltip={reason}
                className="flex flex-col gap-2 rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4 opacity-75"
              >
                <span className="truncate text-xs font-semibold text-[var(--ui-text-muted)]">
                  {fund.scheme_name}
                </span>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-sm font-semibold text-[var(--ui-text-muted)]">Unscored</span>
                  <span className="rounded bg-[var(--ui-card)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ui-text-muted)] border border-[var(--ui-divider)]">
                    {fund.category_unavailable ? "Category Unavailable" : "Insufficient History"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail panel */}
      {selected !== null && (
        <section
          data-testid="score-detail"
          data-fund={selected.scheme_id}
          aria-label={`${selected.scheme_name} score breakdown`}
          className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-5 space-y-5"
        >
          {(() => {
            const tier = displayTier(selected.risk_adjusted_tier!);
            const tone = tierTone(tier);
            const why = whySentence(selected);
            const pctMap = factorPercentiles(selected);

            return (
              <>
                <div className="flex items-center gap-3">
                  <span
                    data-testid="score-detail-dot"
                    data-tone={tone}
                    aria-hidden="true"
                    style={{ backgroundColor: TIER_STYLE[tone].fill }}
                    className="h-3.5 w-3.5 shrink-0 rounded-full"
                  />
                  <h4 data-testid="score-detail-title" className="text-base font-bold text-[var(--ui-text)]">
                    {selected.scheme_name} — {formatLookthroughPercent(selected.final_score!, 1)}/100
                  </h4>
                </div>

                {/* Tier bar */}
                <div data-testid="tier-bar" data-tier={tier} className="space-y-2">
                  <div className="flex justify-between text-xs font-medium text-[var(--ui-text-muted)]">
                    <span>Tier 1 (Top 20%)</span>
                    <span>Tier 3</span>
                    <span>Tier 5 (Lower)</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5 h-2">
                    {[1, 2, 3, 4, 5].map(t => {
                      const state = t === tier ? "active" : tier <= t ? "passed" : "off";
                      const fill = tier <= t ? TIER_STYLE[tone].fill : "var(--ui-divider)";
                      const opacity = t === tier ? 1 : 0.55;
                      return (
                        <span
                          key={t}
                          data-testid={`tier-seg-${t}`}
                          data-state={state}
                          style={{ backgroundColor: fill, opacity }}
                          className="h-full rounded-full transition-all"
                        />
                      );
                    })}
                  </div>
                  <span data-testid="tier-caption" className="block text-xs font-semibold text-[var(--ui-text)]">
                    Tier {tier} of 5 · {tierCaption(tier)}
                  </span>
                </div>

                {why && (
                  <p data-testid="score-why" className="text-xs text-[var(--ui-text)]">
                    <b>Why this tier:</b> {why}
                  </p>
                )}

                {pctMap && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div
                      data-testid="break-return"
                      className="flex items-baseline justify-between rounded-xl bg-[var(--ui-elevated)] p-3 text-xs"
                    >
                      <span className="text-[var(--ui-text-muted)]">Return (45%)</span>
                      <span className="font-semibold text-[var(--ui-text)]">
                        {formatLookthroughPercent(pctMap.return, 1)}%ile
                      </span>
                    </div>
                    <div
                      data-testid="break-risk"
                      className="flex items-baseline justify-between rounded-xl bg-[var(--ui-elevated)] p-3 text-xs"
                    >
                      <span className="text-[var(--ui-text-muted)]">Downside Risk (30%)</span>
                      <span className="font-semibold text-[var(--ui-text)]">
                        {formatLookthroughPercent(pctMap.risk, 1)}%ile
                      </span>
                    </div>
                    <div
                      data-testid="break-consistency"
                      className="flex items-baseline justify-between rounded-xl bg-[var(--ui-elevated)] p-3 text-xs"
                    >
                      <span className="text-[var(--ui-text-muted)]">12M Consistency (25%)</span>
                      <span className="font-semibold text-[var(--ui-text)]">
                        {formatLookthroughPercent(pctMap.consistency, 1)}%
                      </span>
                    </div>
                  </div>
                )}

                {pctMap &&
                  (() => {
                    const factors = FACTOR_KEYS.map(k => assessFactor(k, pctMap[k]));
                    const strengths = factors.filter(f => f.bucket === "strength");
                    const watchouts = factors.filter(f => f.bucket === "watchout");

                    return (
                      <div className="space-y-4">
                        {strengths.length > 0 && (
                          <div className="space-y-2">
                            <h5 className="text-xs font-semibold text-[var(--ui-text)]">Strengths</h5>
                            <ul aria-label="Strengths" className="space-y-2">
                              {strengths.map(f => (
                                <li
                                  key={f.key}
                                  data-testid={`factor-${f.key}`}
                                  data-dot={f.dot}
                                  className="text-xs text-[var(--ui-text)]"
                                >
                                  <b>{FACTOR_LABELS[f.key]}</b>{" "}
                                  <span>
                                    {VERDICT_LABEL[f.verdict]} — {f.sentence}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {watchouts.length > 0 && (
                          <div className="space-y-2">
                            <h5 className="text-xs font-semibold text-[var(--ui-text)]">Watch-outs</h5>
                            <ul aria-label="Watch-outs" className="space-y-2">
                              {watchouts.map(f => (
                                <li
                                  key={f.key}
                                  data-testid={`factor-${f.key}`}
                                  data-dot={f.dot}
                                  className="text-xs text-[var(--ui-text)]"
                                >
                                  <b>{FACTOR_LABELS[f.key]}</b>{" "}
                                  <span>
                                    {VERDICT_LABEL[f.verdict]} — {f.sentence}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                <div className="space-y-1">
                  <p className="text-xs font-semibold text-[var(--ui-text)]">What this means for you</p>
                  <p data-testid="score-means" className="text-xs text-[var(--ui-text-muted)]">
                    {whatThisMeans(tier)}
                  </p>
                </div>

                {/* Accordions */}
                <div className="space-y-2 border-t border-[var(--ui-divider)] pt-4">
                  {/* Evidence Accordion */}
                  <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-3">
                    <button
                      type="button"
                      aria-expanded={open.evidence}
                      data-testid="acc-evidence"
                      data-clickable=""
                      data-effect="expand"
                      onClick={() => setOpen(prev => ({ ...prev, evidence: !prev.evidence }))}
                      className="flex w-full items-center justify-between text-xs font-semibold text-[var(--ui-text)]"
                    >
                      <span>Evidence</span>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${open.evidence ? "rotate-180" : ""}`}
                      />
                    </button>
                    {open.evidence && (
                      <div data-testid="acc-evidence-body" className="mt-3 space-y-2 border-t border-[var(--ui-divider)] pt-3 text-xs">
                        <div className="flex justify-between">
                          <span className="text-[var(--ui-text-muted)]">Return — this fund</span>
                          <span data-testid="ev-return-fund" className="font-medium text-[var(--ui-text)]">
                            {rawPercent(selected.scheme_return, { signed: true })}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--ui-text-muted)]">Return — category average</span>
                          <span data-testid="ev-return-category" className="font-medium text-[var(--ui-text)]">
                            {rawPercent(selected.category_avg_return, { signed: true })}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--ui-text-muted)]">Downside deviation (monthly) — this fund</span>
                          <span data-testid="ev-down-fund" className="font-medium text-[var(--ui-text)]">
                            {rawPercent(selected.downside_deviation, { digits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--ui-text-muted)]">Downside deviation (monthly) — category average</span>
                          <span data-testid="ev-down-category" className="font-medium text-[var(--ui-text)]">
                            {rawPercent(selected.category_avg_downside_deviation, { digits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[var(--ui-text-muted)]">Rolling 12-month periods beaten</span>
                          <span data-testid="ev-consistency" className="font-medium text-[var(--ui-text)]">
                            {selected.consistency_hits !== null &&
                            selected.consistency_hits !== undefined &&
                            selected.consistency_total_windows !== null &&
                            selected.consistency_total_windows !== undefined
                              ? `${selected.consistency_hits} of ${selected.consistency_total_windows}`
                              : "—"}
                          </span>
                        </div>
                        <p data-testid="ev-cost" className="text-[var(--ui-text-muted)] pt-1">
                          {costLine(selected.cost_adjustment)}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Methodology Accordion */}
                  <div className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-3">
                    <button
                      type="button"
                      aria-expanded={open.methodology}
                      data-testid="acc-methodology"
                      data-clickable=""
                      data-effect="expand"
                      onClick={() => setOpen(prev => ({ ...prev, methodology: !prev.methodology }))}
                      className="flex w-full items-center justify-between text-xs font-semibold text-[var(--ui-text)]"
                    >
                      <span>Methodology</span>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${open.methodology ? "rotate-180" : ""}`}
                      />
                    </button>
                    {open.methodology && (
                      <div data-testid="acc-methodology-body" className="mt-3 border-t border-[var(--ui-divider)] pt-3 text-xs text-[var(--ui-text-muted)]">
                        <p>
                          The Unifolio Score combines three weighted components, ranked against every fund in the same SEBI category: Return (45% of score), Downside protection (30%) and Consistency (25%). A cost adjustment of up to 0.25 points is then applied from the fund's expense ratio against the category average, with a 0.05 percentage-point dead zone where no adjustment is made.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </section>
      )}
    </div>
  );
}

export function ScorerGroup() {
  const score = useMfAnalytics("score");

  return (
    <SectionCard
      title="Fund Quality Scores"
      info="Unifolio's own score for each fund you hold, against the other funds in its SEBI category."
      state={score.status}
      onRetry={score.retry}
    >
      {score.data && <ScorerBody data={score.data} />}
    </SectionCard>
  );
}
