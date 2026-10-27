import { formatRupees } from "../../../lib/format";
import type { InvestmentWithdrawalResult } from "../types";
import { cashFlowTiles, type LedgerFilter } from "./transactionsLogic";

export interface CashFlowStripProps {
  data: InvestmentWithdrawalResult;
  filter: LedgerFilter;
  onFilter: (filter: LedgerFilter) => void;
}

const NET_TOOLTIP =
  "Net invested is invested minus withdrawn. It has no matching transaction type, so it cannot filter the list.";

export function CashFlowStrip({ data, filter, onFilter }: CashFlowStripProps) {
  const tiles = cashFlowTiles(data);

  return (
    <div
      data-testid="cash-flow-strip"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      {/* Tile 1: Invested */}
      <button
        type="button"
        data-testid="tile-invested"
        aria-pressed={filter === "purchases"}
        data-clickable=""
        data-effect="select"
        onClick={() => onFilter("purchases")}
        className={`flex flex-col items-start rounded-xl border p-4 text-left transition-colors ${
          filter === "purchases"
            ? "border-[var(--ui-text)] bg-[var(--ui-card)] shadow-sm"
            : "border-[var(--ui-divider)] bg-[var(--ui-card)] hover:bg-[var(--ui-row-hover)]"
        }`}
      >
        <span className="text-xs font-medium text-[var(--ui-text-muted)]">
          Total invested
        </span>
        <span
          data-testid="tile-invested-value"
          className="mt-1 text-base font-semibold text-[var(--ui-text)]"
        >
          {formatRupees(tiles.invested)}
        </span>
      </button>

      {/* Tile 2: Withdrawn */}
      <button
        type="button"
        data-testid="tile-withdrawn"
        aria-pressed={filter === "redemptions"}
        data-clickable=""
        data-effect="select"
        onClick={() => onFilter("redemptions")}
        className={`flex flex-col items-start rounded-xl border p-4 text-left transition-colors ${
          filter === "redemptions"
            ? "border-[var(--ui-text)] bg-[var(--ui-card)] shadow-sm"
            : "border-[var(--ui-divider)] bg-[var(--ui-card)] hover:bg-[var(--ui-row-hover)]"
        }`}
      >
        <span className="text-xs font-medium text-[var(--ui-text-muted)]">
          Total withdrawn
        </span>
        <span
          data-testid="tile-withdrawn-value"
          className="mt-1 text-base font-semibold text-[var(--ui-text)]"
        >
          {formatRupees(tiles.withdrawn)}
        </span>
      </button>

      {/* Tile 3: Net switched */}
      <button
        type="button"
        data-testid="tile-switched"
        aria-pressed={filter === "switches"}
        data-clickable=""
        data-effect="select"
        onClick={() => onFilter("switches")}
        className={`flex flex-col items-start rounded-xl border p-4 text-left transition-colors ${
          filter === "switches"
            ? "border-[var(--ui-text)] bg-[var(--ui-card)] shadow-sm"
            : "border-[var(--ui-divider)] bg-[var(--ui-card)] hover:bg-[var(--ui-row-hover)]"
        }`}
      >
        <span className="text-xs font-medium text-[var(--ui-text-muted)]">
          Net switched
        </span>
        <span
          data-testid="tile-switched-value"
          className="mt-1 text-base font-semibold text-[var(--ui-text)]"
        >
          {formatRupees(tiles.netSwitched)}
        </span>
      </button>

      {/* Tile 4: Net invested (not a button) */}
      <div
        data-testid="tile-net"
        tabIndex={0}
        title={NET_TOOLTIP}
        data-tooltip={NET_TOOLTIP}
        className="flex flex-col items-start rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-4 cursor-help"
      >
        <span className="text-xs font-medium text-[var(--ui-text-muted)]">
          Net invested
        </span>
        <span
          data-testid="tile-net-value"
          className="mt-1 text-base font-semibold text-[var(--ui-text)]"
        >
          {formatRupees(tiles.netInvested)}
        </span>
      </div>
    </div>
  );
}
