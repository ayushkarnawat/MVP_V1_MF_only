import React from "react";
import { useMfAnalytics } from "../data/analyticsStore";
import { MutualFundsFrame } from "../frame/MutualFundsFrame";
import { CategoryRankingGroup } from "./CategoryRankingGroup";
import { CostValuationGroup } from "./CostValuationGroup";
import { FundRankingGroup } from "./FundRankingGroup";
import { GROUP_TITLES } from "./otherLogic";
import { ScorerGroup } from "./ScorerGroup";

interface GroupProps {
  id: string;
  index: number;
  title: string;
  description: string;
  children: React.ReactNode;
}

function Group({ id, index, title, description, children }: GroupProps) {
  return (
    <section
      data-testid={`group-${id}`}
      aria-labelledby={`heading-${id}`}
      className="space-y-3"
    >
      <div className="space-y-1">
        <h2 id={`heading-${id}`} className="flex items-center gap-2 text-base font-semibold text-[var(--ui-text)]">
          <span
            aria-hidden="true"
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ui-divider)] text-xs font-bold text-[var(--ui-text-muted)]"
          >
            {index + 1}
          </span>
          <span>{title}</span>
        </h2>
        <p className="text-sm text-[var(--ui-text-muted)]">{description}</p>
      </div>
      {children}
    </section>
  );
}

function OtherAnalyticsBody() {
  const ter = useMfAnalytics("ter");

  if (ter.status === "error") {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-6 text-center space-y-3"
      >
        <h3 className="text-base font-semibold text-[var(--ui-text)]">
          Couldn't load your analytics
        </h3>
        <p className="text-sm text-[var(--ui-text-muted)]">
          There was a problem reaching our servers. Your data is safe — this is just a connection issue.
        </p>
        <button
          type="button"
          onClick={ter.retry}
          data-clickable=""
          data-effect="retry"
          className="inline-flex items-center justify-center rounded-xl bg-[var(--pos-bg)] px-4 py-2 text-xs font-semibold text-[var(--pos-text)] hover:opacity-90"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div data-testid="analytics-groups" className="flex flex-col gap-6">
      <Group
        id="cost"
        index={0}
        title={GROUP_TITLES.cost}
        description="How expensive your funds are to hold, and how richly their holdings are priced."
      >
        <CostValuationGroup />
      </Group>

      <Group
        id="scorer"
        index={1}
        title={GROUP_TITLES.scorer}
        description="Unifolio's proprietary score — 45% Return, 30% Downside Risk, 25% Consistency vs. SEBI category peers, with a small TER cost nudge. Click a fund for its full breakdown."
      >
        <ScorerGroup />
      </Group>

      <Group
        id="category"
        index={2}
        title={GROUP_TITLES.category}
        description="Where each fund sits among every other fund SEBI classifies in the same category."
      >
        <CategoryRankingGroup />
      </Group>

      <Group
        id="ranking"
        index={3}
        title={GROUP_TITLES.ranking}
        description="A transparent, formula-only composite — 3Y return 25% / 5Y return 25% / category-relative 20% / low volatility 15% / low TER 15%. Distinct from the Fund Quality Scorer above, which is proprietary."
      >
        <FundRankingGroup />
      </Group>
    </div>
  );
}

export default function OtherAnalyticsPage() {
  return (
    <MutualFundsFrame tab="analytics">
      <OtherAnalyticsBody />
    </MutualFundsFrame>
  );
}
