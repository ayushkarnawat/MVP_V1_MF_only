import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatPercent } from "@/lib/format";
import type { OverlapSector } from "../types";
import { barWidth, maxDecimal } from "./overlapLogic";

export interface SectorOverlapProps {
  sectors: OverlapSector[];
}

export function SectorOverlap({ sectors }: SectorOverlapProps) {
  const [open, setOpen] = useState<string | null>(null);

  if (sectors.length === 0) {
    return (
      <p data-testid="sector-empty" className="text-sm text-[var(--ui-text-muted)]">
        No common stocks to group by sector.
      </p>
    );
  }

  const widest = maxDecimal(sectors.map((s) => s.pct));

  return (
    <ul aria-label="Common holdings by sector" className="space-y-2">
      {sectors.map((sector, index) => {
        const isOpen = open === sector.sector;
        const panelId = `sector-stocks-${index}`;

        return (
          <li key={sector.sector}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              data-testid={`sector-row-${sector.sector}`}
              onClick={() => setOpen((prev) => (prev === sector.sector ? null : sector.sector))}
              className="flex w-full items-center justify-between py-1.5 text-xs text-[var(--ui-text)]"
            >
              <span className="flex items-center gap-1.5">
                <ChevronRight
                  size={14}
                  aria-hidden="true"
                  className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
                />
                <span>{sector.sector}</span>
              </span>
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--ui-divider)]">
                  <span
                    data-testid={`sector-bar-${sector.sector}`}
                    style={{ width: `${barWidth(sector.pct, widest)}%` }}
                    className="block h-full bg-[var(--c2)]"
                  />
                </span>
                <span>{formatPercent(sector.pct, { digits: 1 })}</span>
              </span>
            </button>

            <div
              id={panelId}
              role="region"
              aria-label={`${sector.sector} stocks`}
              hidden={!isOpen}
              className="pl-6 pt-1"
            >
              {isOpen && (
                <ul className="space-y-1">
                  {sector.stocks.map((stock) => (
                    <li
                      key={stock.isin}
                      className="flex items-center justify-between text-xs text-[var(--ui-text-muted)]"
                    >
                      <span>{stock.name}</span>
                      <span>{formatPercent(stock.weight, { digits: 1 })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
