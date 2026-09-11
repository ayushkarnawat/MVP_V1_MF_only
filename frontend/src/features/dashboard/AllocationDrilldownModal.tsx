import { Modal } from "../../components/Modal";
import { formatDecimal, formatIndianCurrency, sumDecimalStrings } from "../../lib/decimal";
import type { HoldingRow } from "./types";

interface AllocationDrilldownModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupType: "amc" | "asset";
  groupLabel: string;
  holdings: HoldingRow[];
}

export function AllocationDrilldownModal({
  isOpen,
  onClose,
  groupType,
  groupLabel,
  holdings,
}: AllocationDrilldownModalProps) {
  const groupedHoldings = holdings.filter((holding) =>
    groupType === "amc"
      ? holding.amc_name === groupLabel
      : holding.asset_class === groupLabel,
  );
  const subtotal = sumDecimalStrings(
    groupedHoldings.map((holding) => holding.current_value ?? "0"),
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={groupLabel}>
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
            {groupType === "amc" ? "AMC holdings" : "Asset-class holdings"}
          </p>
          <p data-testid="drilldown-subtotal" className="text-sm font-semibold tabular-nums">
            ₹{formatIndianCurrency(subtotal)}
          </p>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {groupedHoldings.map((holding) => (
            <div key={`${holding.household_member_id}-${holding.scheme_id}-${holding.plan_type}`} className="grid grid-cols-[1fr_auto] gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{holding.scheme_name}</p>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  {formatDecimal(holding.units_held)} units · Avg NAV {holding.average_nav === null ? "—" : `₹${formatDecimal(holding.average_nav)}`}
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums">
                {holding.current_value === null ? "—" : `₹${formatIndianCurrency(holding.current_value)}`}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
