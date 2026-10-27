import { ArrowRight, ChartColumn, ChevronLeft, Sprout } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { PageLayout } from "@/shell/layout/PageLayout";
import { MiraComingSoonDialog } from "@/shell/mira/MiraComingSoonDialog";
import { useImport } from "@/shell/scope/ScopeContext";
import {
  BACK_LABEL,
  COMING_SOON_LINE,
  COMING_SOON_TITLE,
  EXPLORE_LINE,
  EXPLORE_TITLE,
  MARKET_SUBTITLE,
  PLAN_FUTURE_LINE,
  PLAN_FUTURE_TITLE,
  SUBTITLE,
  TITLE,
} from "./planningCopy";
import {
  pushPlanningState,
  readPlanningState,
  replacePlanningState,
  type PlanningHistoryState,
} from "./planningHistory";
import { PlanningScenarios } from "./sections/PlanningScenarios";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]";
const LANDING: PlanningHistoryState = { planning: "landing", scenarioId: null };

interface ChoiceCardProps {
  title: string;
  line: string;
  icon: ReactNode;
  tint: string;
  onClick: () => void;
}

function ChoiceCard({ title, line, icon, tint, onClick }: ChoiceCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[112px] w-full items-center gap-4 rounded-[14px] border border-[var(--ui-divider)] bg-[var(--ui-card)] p-5 text-left hover:border-[var(--ui-border-hover)] hover:bg-[var(--ui-elevated)] ${FOCUS}`}
    >
      <span
        aria-hidden="true"
        className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tint}`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-[17px] font-semibold text-[var(--ui-text)]">
          {title}
        </span>
        <span className="block text-sm text-[var(--ui-text-muted)]">{line}</span>
      </span>
      <span
        aria-hidden="true"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--ui-divider)] text-[var(--ui-text-muted)]"
      >
        <ArrowRight className="h-4 w-4" />
      </span>
    </button>
  );
}

export default function PlanningPage() {
  const [state, setState] = useState<PlanningHistoryState>(LANDING);
  const [miraOpen, setMiraOpen] = useState(false);
  const { openImport } = useImport();

  useEffect(() => {
    replacePlanningState(LANDING);
    const onPop = () => setState(readPlanningState() ?? LANDING);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = (next: PlanningHistoryState) => {
    if (next.planning === state.planning && next.scenarioId === state.scenarioId) return;
    pushPlanningState(next);
    setState(next);
  };

  const back = (
    <button
      type="button"
      onClick={() => go(LANDING)}
      className={`inline-flex items-center gap-1 rounded py-1 text-sm font-semibold text-[var(--ui-text-muted)] hover:text-[var(--ui-text)] ${FOCUS}`}
    >
      <ChevronLeft aria-hidden="true" className="h-4 w-4" />
      {BACK_LABEL}
    </button>
  );

  if (state.planning === "future") {
    return (
      <div className="space-y-2">
        {back}
        <PageLayout title={PLAN_FUTURE_TITLE} subtitle={PLAN_FUTURE_LINE}>
          <div
            data-testid="coming-soon"
            className="flex items-start gap-2.5 rounded-[10px] border border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-3.5 py-3 text-sm text-[var(--ui-text-muted)]"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--pos-bg)] text-[var(--pos)]"
            >
              <Sprout className="h-4 w-4" />
            </span>
            <div>
              <b className="text-[var(--ui-text)]">{COMING_SOON_TITLE}</b>
              <div>{COMING_SOON_LINE}</div>
            </div>
          </div>
        </PageLayout>
      </div>
    );
  }

  if (state.planning === "market") {
    return (
      <div className="space-y-2">
        {back}
        <PageLayout title={EXPLORE_TITLE} subtitle={MARKET_SUBTITLE}>
          <PlanningScenarios
            selectedId={state.scenarioId}
            onSelect={id => go({ planning: "market", scenarioId: id })}
            onImport={() => openImport()}
            onLearnMore={() => setMiraOpen(true)}
          />
        </PageLayout>
        <MiraComingSoonDialog open={miraOpen} onOpenChange={setMiraOpen} />
      </div>
    );
  }

  return (
    <PageLayout title={TITLE} subtitle={SUBTITLE}>
      <div data-testid="planning-landing" className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ChoiceCard
          title={PLAN_FUTURE_TITLE}
          line={PLAN_FUTURE_LINE}
          icon={<Sprout className="h-6 w-6" />}
          tint="bg-[var(--pos-bg)] text-[var(--pos)]"
          onClick={() => go({ planning: "future", scenarioId: null })}
        />
        <ChoiceCard
          title={EXPLORE_TITLE}
          line={EXPLORE_LINE}
          icon={<ChartColumn className="h-6 w-6" />}
          tint="bg-[color-mix(in_srgb,var(--c4)_14%,transparent)] text-[var(--c4)]"
          onClick={() => go({ planning: "market", scenarioId: null })}
        />
      </div>
    </PageLayout>
  );
}
