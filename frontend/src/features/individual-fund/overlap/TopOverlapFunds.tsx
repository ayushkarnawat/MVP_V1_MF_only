import { useEffect, useRef, useState } from "react";
import { formatPercent } from "@/lib/format";
import type { OverlapTopFund } from "../types";
import { stocks } from "./overlapLogic";

export interface TopOverlapFundsProps {
  funds: OverlapTopFund[];
  fundName: string;
  onCompare: (schemeId: string) => void;
  restoreFocusId?: string | null;
}

export function TopOverlapFunds({
  funds,
  fundName,
  onCompare,
  restoreFocusId = null,
}: TopOverlapFundsProps) {
  const [active, setActive] = useState<number>(() => {
    if (!restoreFocusId) return 0;
    const idx = funds.findIndex((f) => f.scheme_id === restoreFocusId);
    return idx >= 0 ? idx : 0;
  });

  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!restoreFocusId) return;
    const idx = funds.findIndex((f) => f.scheme_id === restoreFocusId);
    if (idx >= 0 && optionRefs.current[idx]) {
      optionRefs.current[idx]?.focus();
    }
  }, [funds, restoreFocusId]);

  if (funds.length === 0) {
    return (
      <p data-testid="top-funds-empty" className="text-sm text-[var(--ui-text-muted)]">
        No other fund in your portfolio has published holdings to compare with.
      </p>
    );
  }

  const handleKeyDown = (
    event: React.KeyboardEvent,
    index: number,
    schemeId: string
  ) => {
    let nextIndex = index;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      nextIndex = Math.min(funds.length - 1, index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      nextIndex = Math.max(0, index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      nextIndex = 0;
    } else if (event.key === "End") {
      event.preventDefault();
      nextIndex = funds.length - 1;
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onCompare(schemeId);
      return;
    } else {
      return;
    }

    setActive(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--ui-text-muted)]">
        {`Choose a fund to see a full side-by-side comparison with ${fundName}.`}
      </p>

      <div
        aria-hidden="true"
        className="flex items-center justify-between border-b border-[var(--ui-divider)] pb-2 text-xs font-medium text-[var(--ui-text-muted)]"
      >
        <span>Fund name</span>
        <span>Overlap % · Common stocks</span>
      </div>

      <div
        role="listbox"
        aria-label="Funds to compare"
        className="max-h-96 space-y-1 overflow-auto"
      >
        {funds.map((fund, index) => {
          const isActive = index === active;
          return (
            <div
              key={fund.scheme_id}
              ref={(el) => {
                optionRefs.current[index] = el;
              }}
              role="option"
              data-testid={`top-fund-${fund.scheme_id}`}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onCompare(fund.scheme_id)}
              onFocus={() => setActive(index)}
              onKeyDown={(e) => handleKeyDown(e, index, fund.scheme_id)}
              className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-xs text-[var(--ui-text)] transition-colors hover:bg-[var(--ui-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
            >
              <span className="font-medium">{fund.scheme_name}</span>{" "}
              <span className="text-[var(--ui-text-muted)]">
                {`${formatPercent(fund.overlap_pct, { digits: 1 })} overlap · ${stocks(fund.common_stock_count)} in common`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
