import { useRef, type ReactNode } from "react";
import { COMPARISON_TABS, type ComparisonTabId } from "./overlapLogic";

export interface ComparisonTabsProps {
  selected: ComparisonTabId;
  onSelect: (tab: ComparisonTabId) => void;
  renderPanel: (tab: ComparisonTabId) => ReactNode;
}

export function ComparisonTabs({
  selected,
  onSelect,
  renderPanel,
}: ComparisonTabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const count = COMPARISON_TABS.length;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % count;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + count) % count;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = count - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      const nextTab = COMPARISON_TABS[nextIndex];
      onSelect(nextTab.id);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Comparison views"
        className="flex overflow-x-auto border-b border-[var(--ui-divider)]"
      >
        {COMPARISON_TABS.map((tab, index) => {
          const isSelected = tab.id === selected;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`cmp-tab-${tab.id}`}
              aria-selected={isSelected}
              aria-controls={`cmp-panel-${tab.id}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={`shrink-0 px-4 py-2 text-sm font-medium transition-colors ${
                isSelected
                  ? "border-b-2 border-[var(--ui-focus)] text-[var(--ui-text)]"
                  : "border-b-2 border-transparent text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {COMPARISON_TABS.map((tab) => {
        const isSelected = tab.id === selected;
        return (
          <div
            key={tab.id}
            role="tabpanel"
            id={`cmp-panel-${tab.id}`}
            aria-labelledby={`cmp-tab-${tab.id}`}
            hidden={!isSelected}
            tabIndex={0}
            className="focus-visible:outline-none"
          >
            {isSelected ? renderPanel(tab.id) : null}
          </div>
        );
      })}
    </div>
  );
}
