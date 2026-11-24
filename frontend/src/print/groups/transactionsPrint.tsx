import type { ReactNode } from "react";
import { SectionCard } from "../../features/mutual-funds/common/SectionCard";
import { useMfAnalytics } from "../../features/mutual-funds/data/analyticsStore";
import { compareDecimalStrings } from "../../lib/decimal";
import { formatRupees } from "../../lib/format";
import { usePrintSettled } from "../usePrintSettled";
import { CashFlowDetailsPrint } from "./transactions/CashFlowDetailsPrint";
import { CashFlowYearlyPrint } from "./transactions/CashFlowYearlyPrint";
import { LedgerSectionPrint } from "./transactions/LedgerSection";

export function CashFlowSectionPrint() {
  const money = useMfAnalytics("investment_withdrawal");
  const settled = money.status !== "loading";
  usePrintSettled("transactions-cash-flow", settled);
  if (!settled) return null;
  const data = money.data;
  const hasOpening = data?.opening_holdings && compareDecimalStrings(data.opening_holdings, "0") !== 0;
  const hasGifts = data && compareDecimalStrings(data.gifts_net, "0") !== 0;
  const giftsNegative = Boolean(data?.gifts_net.trim().startsWith("-"));
  return <div data-cash-flow-print="">
    <style>{`
      [data-cash-flow-print] :is(h3,h4) { break-after: avoid; }
      [data-cash-flow-print] thead { display: table-header-group; }
      [data-cash-flow-print] tr { break-inside: avoid; }
    `}</style>
    <SectionCard title="Cash Flow Over Time" state={money.status}>
      {data && <div className="space-y-4">
        <CashFlowDetailsPrint data={data} />
        <CashFlowYearlyPrint years={data.yearly} />
        {hasOpening && <p data-testid="opening-note" className="text-xs text-[var(--ui-text-muted)]">
          Opening holdings {formatRupees(data.opening_holdings)} (counted in Total invested above, not drawn as a bar — these units were already held before Unifolio started tracking).
        </p>}
        {hasGifts && <p data-testid="gifts-note" className="text-xs text-[var(--ui-text-muted)]">
          {giftsNegative
            ? `Gain includes ${formatRupees(data.gifts_net.trim().slice(1))} of units given away as gifts.`
            : `Gain excludes ${formatRupees(data.gifts_net)} of units received as gifts.`}
        </p>}
      </div>}
    </SectionCard>
  </div>;
}

export const transactionsPrintSections: Record<string, () => ReactNode> = {
  "transactions-cash-flow": () => <CashFlowSectionPrint />,
  "transactions-ledger": () => <LedgerSectionPrint />,
};
