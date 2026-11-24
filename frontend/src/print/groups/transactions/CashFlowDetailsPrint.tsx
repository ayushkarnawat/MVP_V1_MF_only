import { CashFlowStrip } from "../../../features/mutual-funds/transactions/CashFlowStrip";
import { SipBanner } from "../../../features/mutual-funds/transactions/SipBanner";
import { SwitchesControl } from "../../../features/mutual-funds/transactions/SwitchesControl";
import type { InvestmentWithdrawalResult } from "../../../features/mutual-funds/types";
import { formatRupees } from "../../../lib/format";

export function CashFlowDetailsPrint({ data }: { data: InvestmentWithdrawalResult }) {
  const switchCount = data.switch_count ?? 0;
  return <div className="space-y-4">
    <CashFlowStrip data={data} filter="all" onFilter={() => {}} includeSwitches={false} />
    <p className="text-xs text-[var(--ui-text-muted)]">
      {switchCount > 0
        ? `Switched between funds: ${formatRupees(data.total_switched_out ?? "0")} in ${switchCount} ${switchCount === 1 ? "switch" : "switches"}`
        : "Switched between funds: none"}
    </p>
    <SwitchesControl included={false} onChange={() => {}} disabled={switchCount === 0} />
    <SipBanner summary={data.sip_summary} />
  </div>;
}
