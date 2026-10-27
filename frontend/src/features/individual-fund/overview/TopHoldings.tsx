import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { CLICK_ROW } from "@/lib/clickable";
import { formatDate, formatPercent } from "@/lib/format";
import { SectionState } from "../components/SectionState";
import { ageTagText, stockCountText } from "../fundCopy";
import type { CompositionResponse, TopHolding } from "../types";
import type { FundSection } from "../useFundSection";
import { AllHoldingsDialog } from "./AllHoldingsDialog";
import { StockDialog } from "./holdingDialogs";

export interface TopHoldingsProps {
  schemeId: string;
  composition: FundSection<CompositionResponse>;
}

export function TopHoldings({ schemeId, composition }: TopHoldingsProps) {
  const [stock, setStock] = useState<TopHolding | null>(null);
  const [allOpen, setAllOpen] = useState(false);

  const { data } = composition;

  const handleKeyDown = (e: React.KeyboardEvent, item: TopHolding) => {
    if (e.key === "Enter") {
      setStock(item);
    } else if (e.key === " ") {
      e.preventDefault();
      setStock(item);
    }
  };

  const col1 = data ? data.top10.slice(0, 5) : [];
  const col2 = data ? data.top10.slice(5, 10) : [];

  return (
    <section
      aria-labelledby="top-title"
      className="rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-4"
    >
      <div className="flex items-center justify-between pb-3">
        <h3
          id="top-title"
          className="text-base font-semibold text-[var(--ui-text)]"
        >
          Top 10 Holdings
          {data ? (
            <>
              {" "}
              <span className="text-xs font-normal text-[var(--ui-text-muted)]">
                {`(${stockCountText(data.stock_count)})`}
              </span>
            </>
          ) : null}
        </h3>
        {data ? (
          <button
            type="button"
            onClick={() => setAllOpen(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--c4)] hover:underline"
          >
            View all holdings
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <SectionState
        status={composition.status}
        label="holdings"
        reason={composition.reason}
        onRetry={composition.retry}
      >
        {data ? (
          data.top10.length === 0 ? (
            <p
              data-testid="top-empty"
              className="py-2 text-sm text-[var(--ui-text-muted)]"
            >
              No stock holdings in this fund's disclosure.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <ol data-testid="top-col-1" className="divide-y divide-[var(--ui-divider)]">
                  {col1.map((item, index) => {
                    const rank = index + 1;
                    return (
                      <li key={item.name}>
                        <div
                          role="button"
                          tabIndex={0}
                          aria-haspopup="dialog"
                          data-testid={`top-row-${rank}`}
                          onClick={() => setStock(item)}
                          onKeyDown={(e) => handleKeyDown(e, item)}
                          className={`flex items-center justify-between py-2 text-sm ${CLICK_ROW}`}
                        >
                          <div className="flex items-start gap-2 min-w-0">
                            <span className="text-xs font-normal text-[var(--ui-text-muted)] w-4 shrink-0">
                              {rank}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate font-medium text-[var(--ui-text)]">
                                {item.name}
                              </div>
                              <div className="truncate text-xs text-[var(--ui-text-muted)]">
                                {item.sector || "—"}
                              </div>
                            </div>
                          </div>
                          <b className="ml-2 shrink-0 font-semibold text-[var(--ui-text)]">
                            {formatPercent(item.weight, { digits: 1 })}
                          </b>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                <ol data-testid="top-col-2" className="divide-y divide-[var(--ui-divider)]">
                  {col2.map((item, index) => {
                    const rank = index + 6;
                    return (
                      <li key={item.name}>
                        <div
                          role="button"
                          tabIndex={0}
                          aria-haspopup="dialog"
                          data-testid={`top-row-${rank}`}
                          onClick={() => setStock(item)}
                          onKeyDown={(e) => handleKeyDown(e, item)}
                          className={`flex items-center justify-between py-2 text-sm ${CLICK_ROW}`}
                        >
                          <div className="flex items-start gap-2 min-w-0">
                            <span className="text-xs font-normal text-[var(--ui-text-muted)] w-4 shrink-0">
                              {rank}
                            </span>
                            <div className="min-w-0">
                              <div className="truncate font-medium text-[var(--ui-text)]">
                                {item.name}
                              </div>
                              <div className="truncate text-xs text-[var(--ui-text-muted)]">
                                {item.sector || "—"}
                              </div>
                            </div>
                          </div>
                          <b className="ml-2 shrink-0 font-semibold text-[var(--ui-text)]">
                            {formatPercent(item.weight, { digits: 1 })}
                          </b>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="border-t border-[var(--ui-divider)] pt-3 space-y-1">
                <p
                  data-testid="top-asof"
                  className="text-xs text-[var(--ui-text-muted)]"
                >
                  {`Disclosure as of ${formatDate(data.holdings_as_of)}.`}
                </p>
                {ageTagText(data.age_tag) ? (
                  <p
                    data-testid="top-age-note"
                    className="text-xs text-[var(--warn-text)]"
                  >
                    {ageTagText(data.age_tag)}
                  </p>
                ) : null}
              </div>
            </div>
          )
        ) : null}
      </SectionState>

      <StockDialog holding={stock} onClose={() => setStock(null)} />
      <AllHoldingsDialog
        schemeId={schemeId}
        isOpen={allOpen}
        onClose={() => setAllOpen(false)}
      />
    </section>
  );
}
