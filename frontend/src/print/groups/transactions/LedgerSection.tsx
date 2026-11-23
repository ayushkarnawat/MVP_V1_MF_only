import { SectionCard } from "../../../features/mutual-funds/common/SectionCard";
import { useMfAnalytics } from "../../../features/mutual-funds/data/analyticsStore";
import { Ledger } from "../../../features/mutual-funds/transactions/Ledger";
import { usePrintSettled } from "../../usePrintSettled";

export function LedgerSectionPrint() {
  const money = useMfAnalytics("investment_withdrawal");
  const settled = money.status !== "loading";
  usePrintSettled("transactions-ledger", settled);
  if (!settled) return null;
  return <div data-ledger-print="">
    <style>{`[data-ledger-print] h3 { break-after: avoid; }`}</style>
    <SectionCard title="All Transactions" state={money.status}>
      {money.data && <Ledger buckets={money.data.monthly} filter="all" onFilter={() => {}} search={{ text: "", chips: [] }} />}
    </SectionCard>
  </div>;
}
