import { useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatDate, formatRupees } from "@/lib/format";
import { paths } from "@/shell/nav/paths";
import { SchemeLogo } from "../SchemeLogo";

export interface NewFundTx { date: string; type: string; amount: string; units: string }
export interface NewFund {
  scheme_id: string;
  scheme_name: string;
  amc_name: string | null;
  invested_amount: string;
  latest_transaction_date: string;
  transaction_count: number;
  transactions: NewFundTx[];
}

export interface NewFundsListProps {
  funds: NewFund[];
  hideValues?: boolean;
  /** Show "View all in Import History" under a fund that has more transactions than are listed. */
  showHistoryLink?: boolean;
}

const MASK = "••••••";
const TYPE_LABELS: Record<string, string> = {
  PURCHASE: "Purchase", PURCHASE_SIP: "SIP", SWITCH_IN: "Switch in", REDEMPTION: "Redemption",
  DIVIDEND_REINVEST: "Dividend reinvested", BONUS: "Bonus",
};
const typeLabel = (type: string) =>
  TYPE_LABELS[type.toUpperCase()] ?? type.toLowerCase().split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

export function NewFundsList({ funds, hideValues = false, showHistoryLink = false }: NewFundsListProps) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (funds.length === 0) return null;
  const money = (value: string) => (hideValues ? MASK : formatRupees(value));
  const toggle = (id: string) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return (
    <ul className="space-y-2">
      {funds.map(fund => {
        const isOpen = open.has(fund.scheme_id);
        const transactions = fund.transactions ?? [];
        return (
          <li key={fund.scheme_id} className="rounded-xl border border-[var(--ui-divider)]">
            <button type="button" aria-expanded={isOpen} data-clickable="" data-effect="expand" onClick={() => toggle(fund.scheme_id)}
              className="flex w-full items-center gap-3 px-3 py-2 text-left">
              <SchemeLogo schemeName={fund.scheme_name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--ui-text)]">{fund.scheme_name}</span>
                <span className="block text-xs text-[var(--ui-text-muted)]">
                  {fund.amc_name ? `${fund.amc_name} · ` : ""}{fund.transaction_count} {fund.transaction_count === 1 ? "transaction" : "transactions"}
                </span>
              </span>
              <span className="text-right text-xs text-[var(--ui-text-muted)]">
                <span className="block text-sm font-semibold text-[var(--ui-text)]">{money(fund.invested_amount)}</span>
                <span className="block">{formatDate(fund.latest_transaction_date)}</span>
              </span>
              {isOpen ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
            </button>
            {isOpen && (
              <div className="px-3 pb-3">
                <table aria-label={`Transactions in ${fund.scheme_name}`} className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[var(--ui-text-muted)]">
                      <th scope="col" className="py-1 pr-3 font-medium">Date</th>
                      <th scope="col" className="py-1 px-3 font-medium">Type</th>
                      <th scope="col" className="py-1 px-3 font-medium">Amount</th>
                      <th scope="col" className="py-1 pl-3 font-medium">Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx, index) => (
                      <tr key={`${tx.date}-${index}`}>
                        <td className="py-1 pr-3">{formatDate(tx.date)}</td>
                        <td className="py-1 px-3">{typeLabel(tx.type)}</td>
                        <td className="py-1 px-3">{money(tx.amount)}</td>
                        <td className="py-1 pl-3">{tx.units}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {showHistoryLink && fund.transaction_count > transactions.length && (
                  <Link to={paths.profileImportHistory()} className="mt-2 inline-block text-xs font-semibold text-[var(--pos-text)] hover:underline">
                    View all in Import History
                  </Link>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
