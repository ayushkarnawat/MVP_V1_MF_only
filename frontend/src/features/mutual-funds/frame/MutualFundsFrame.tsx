import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PageLayout } from "../../../shell/layout/PageLayout";
import { MiraComingSoonDialog } from "../../../shell/mira/MiraComingSoonDialog";
import { AppLink } from "../../../shell/nav/AppLink";
import { paths } from "../../../shell/nav/paths";
import { useImport, useScope } from "../../../shell/scope/ScopeContext";
import type { MfTabId } from "../types";

export interface TabDef {
  id: MfTabId;
  label: string;
  title: string;
  subtitle: string;
  to: () => string;
}

// oxlint-disable-next-line react/only-export-components -- tab definitions exported for shell navigation
export const TAB_DEFS: ReadonlyArray<TabDef> = [
  {
    id: "overview",
    label: "Overview",
    title: "All Investments",
    subtitle: "Your family's mutual fund portfolio — holdings, allocation, and performance in one place.",
    to: paths.mutualFunds.root,
  },
  {
    id: "performance",
    label: "Performance",
    title: "Performance",
    subtitle: "Returns, portfolio value over time, and how you stack up against the market.",
    to: paths.mutualFunds.performance,
  },
  {
    id: "allocation",
    label: "Allocation",
    title: "Allocation",
    subtitle: "How your money is spread — by asset class, market cap, category, fund house, and manager.",
    to: paths.mutualFunds.allocation,
  },
  {
    id: "holdings",
    label: "Holdings",
    title: "Holdings",
    subtitle: "The stocks behind your funds — by fund, and looked through across your whole portfolio.",
    to: paths.mutualFunds.holdings,
  },
  {
    id: "transactions",
    label: "Transactions",
    title: "Transactions",
    subtitle: "Every rupee in and out of your mutual funds, by period and by fund.",
    to: paths.mutualFunds.transactions,
  },
  {
    id: "overlap",
    label: "Overlap",
    title: "Overlap",
    subtitle: "How much your equity funds duplicate each other's stock picks.",
    to: paths.mutualFunds.overlap,
  },
  {
    id: "analytics",
    label: "Other Analytics",
    title: "Other Analytics",
    subtitle: "Cost, quality, and ranking views that go deeper than the headline dashboard.",
    to: paths.mutualFunds.analytics,
  },
];

interface MfFrameContextValue {
  openMira: () => void;
}

const MfFrameContext = createContext<MfFrameContextValue | null>(null);

// oxlint-disable-next-line react/only-export-components -- frame hook exported for children
export function useMfFrame(): MfFrameContextValue {
  const context = useContext(MfFrameContext);
  if (!context) {
    throw new Error("useMfFrame must be used within MutualFundsFrame");
  }
  return context;
}

export interface MutualFundsFrameProps {
  tab: MfTabId;
  children: ReactNode;
  utility?: ReactNode;
}

export function MutualFundsFrame({ tab, children, utility }: MutualFundsFrameProps) {
  const [miraOpen, setMiraOpen] = useState(false);
  const openMira = useCallback(() => setMiraOpen(true), []);
  const contextValue = useMemo(() => ({ openMira }), [openMira]);

  const { viewMode, memberId } = useScope();
  const { openImport } = useImport();

  const currentTab = TAB_DEFS.find(t => t.id === tab) ?? TAB_DEFS[0];
  const importFor = viewMode === "member" ? memberId ?? undefined : undefined;

  const actions =
    tab === "overview" ? (
      <button
        type="button"
        data-clickable=""
        data-effect="open"
        onClick={() => openImport(importFor)}
        className="inline-flex items-center justify-center rounded-full bg-[var(--pos)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
      >
        Add Investment
      </button>
    ) : undefined;

  const tabs = (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-2">
      <nav aria-label="Mutual Funds sections">
        <ul className="flex flex-wrap items-center gap-1">
          {TAB_DEFS.map(def => {
            const isActive = def.id === tab;
            return (
              <li key={def.id} data-tab={def.id} data-active={isActive}>
                {isActive ? (
                  <span
                    aria-current="page"
                    className="inline-flex items-center rounded-xl bg-[var(--pos-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--pos-text)]"
                  >
                    {def.label}
                  </span>
                ) : (
                  <AppLink
                    to={def.to()}
                    className="inline-flex items-center rounded-xl px-3 py-1.5 text-xs font-medium text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
                  >
                    {def.label}
                  </AppLink>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      {utility && <div className="flex items-center">{utility}</div>}
    </div>
  );

  return (
    <MfFrameContext.Provider value={contextValue}>
      <PageLayout
        title={currentTab.title}
        subtitle={currentTab.subtitle}
        actions={actions}
        tabs={tabs}
      >
        {children}
      </PageLayout>
      <MiraComingSoonDialog open={miraOpen} onOpenChange={setMiraOpen} />
    </MfFrameContext.Provider>
  );
}
