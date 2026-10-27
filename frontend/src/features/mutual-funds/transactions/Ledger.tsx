import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { useMemo, useState } from "react";
import { transactionLabel } from "../../../components/mf/periodBreakdown";
import { formatDate, formatRupees } from "../../../lib/format";
import type { InvestmentWithdrawalBucket } from "../types";
import {
  LEDGER_FILTERS,
  LEDGER_PAGE,
  type LedgerFilter,
  type LedgerKind,
  ledgerRows,
} from "./transactionsLogic";

export interface LedgerProps {
  buckets: InvestmentWithdrawalBucket[];
  filter: LedgerFilter;
  onFilter: (filter: LedgerFilter) => void;
}

function KindIcon({ kind }: { kind: LedgerKind }) {
  switch (kind) {
    case "purchase":
      return <ArrowDownLeft className="h-3 w-3 text-[var(--pos-text)]" />;
    case "reversal":
      return <RotateCcw className="h-3 w-3 text-[var(--warn-text)]" />;
    case "redemption":
      return <ArrowUpRight className="h-3 w-3 text-[var(--neg-text)]" />;
    case "switch":
      return <ArrowLeftRight className="h-3 w-3 text-[var(--ui-text-muted)]" />;
  }
}

function kindBgClass(kind: LedgerKind): string {
  switch (kind) {
    case "purchase":
      return "bg-[var(--pos-bg)]";
    case "reversal":
      return "bg-[var(--warn-bg)]";
    case "redemption":
      return "bg-[var(--neg-bg)]";
    case "switch":
      return "bg-[var(--ui-row-hover)]";
  }
}

export function Ledger({ buckets, filter, onFilter }: LedgerProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => ledgerRows(buckets, filter), [buckets, filter]);

  // If currently open row leaves the filtered list, forget it
  if (openId !== null && !rows.some(r => r.entry.transaction_id === openId)) {
    setOpenId(null);
  }

  const displayedRows = showAll ? rows : rows.slice(0, LEDGER_PAGE);

  return (
    <div className="flex flex-col gap-4">
      {/* Type filter controls */}
      <div
        role="group"
        aria-label="Transaction type"
        className="inline-flex self-start rounded-lg border border-[var(--ui-divider)] p-0.5"
      >
        {LEDGER_FILTERS.map(f => {
          const isPressed = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={isPressed}
              data-clickable=""
              data-effect="select"
              onClick={() => onFilter(f.id)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                isPressed
                  ? "bg-[var(--ui-card)] text-[var(--ui-text)] shadow-sm"
                  : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-[var(--ui-text-muted)]">
        Click a transaction to see its details.
      </p>

      {rows.length === 0 ? (
        <p data-testid="ledger-empty" className="text-xs text-[var(--ui-text-muted)] py-4">
          {filter === "all" ? "No transactions yet" : "No transactions of this type"}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="overflow-x-auto">
            <table aria-label="All transactions" className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--ui-divider)] text-[var(--ui-text-muted)]">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Fund</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ui-divider)]">
                {displayedRows.map(row => {
                  const id = row.entry.transaction_id;
                  const isOpen = openId === id;

                  return (
                    <tr
                      key={id}
                      data-testid={`ledger-row-${id}`}
                      data-kind={row.kind}
                      className="group"
                    >
                      <td className="py-2.5 text-[var(--ui-text-muted)] whitespace-nowrap">
                        {formatDate(row.entry.date)}
                      </td>
                      <th scope="row" className="py-2.5 font-normal text-[var(--ui-text)]">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          data-clickable=""
                          data-effect="expand"
                          onClick={() => setOpenId(isOpen ? null : id)}
                          className="flex items-center gap-1.5 text-left font-medium hover:text-[var(--pos-text)]"
                        >
                          <ChevronRight
                            aria-hidden="true"
                            className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                              isOpen ? "rotate-90" : ""
                            }`}
                          />
                          <span>{row.entry.scheme_name}</span>
                        </button>
                        <span className="block text-[11px] text-[var(--ui-text-muted)] pl-5">
                          {row.entry.household_member_name}
                        </span>
                      </th>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            data-testid={`kind-${id}`}
                            data-kind={row.kind}
                            aria-hidden="true"
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${kindBgClass(
                              row.kind
                            )}`}
                          >
                            <KindIcon kind={row.kind} />
                          </span>
                          <span className="text-[var(--ui-text)] font-medium">
                            {transactionLabel(row.entry)}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 font-medium text-[var(--ui-text)]">
                        {formatRupees(row.entry.amount)}
                      </td>
                    </tr>
                  );
                }).flatMap((el, idx) => {
                  const row = displayedRows[idx];
                  const id = row.entry.transaction_id;
                  const isOpen = openId === id;

                  if (!isOpen) return [el];

                  const detailRow = (
                    <tr
                      key={`detail-${id}`}
                      data-testid={`ledger-detail-${id}`}
                      className="bg-[var(--ui-card)]"
                    >
                      <td colSpan={4} className="p-4">
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                          <div>
                            <dt className="text-[var(--ui-text-muted)]">Member</dt>
                            <dd className="font-medium text-[var(--ui-text)]">
                              {row.entry.household_member_name}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[var(--ui-text-muted)]">Transaction</dt>
                            <dd className="font-medium text-[var(--ui-text)]">
                              {transactionLabel(row.entry)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[var(--ui-text-muted)]">Date</dt>
                            <dd className="font-medium text-[var(--ui-text)]">
                              {formatDate(row.entry.date)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[var(--ui-text-muted)]">Amount</dt>
                            <dd className="font-medium text-[var(--ui-text)]">
                              {formatRupees(row.entry.amount)}
                            </dd>
                          </div>
                          <div className="sm:col-span-2">
                            <dt className="text-[var(--ui-text-muted)]">Transaction ID</dt>
                            <dd className="font-mono text-[11px] text-[var(--ui-text)]">
                              {id}
                            </dd>
                          </div>
                        </dl>
                        <p className="mt-3 text-xs text-[var(--ui-text-muted)]">
                          Units, NAV and folio are not part of this data yet.
                        </p>
                      </td>
                    </tr>
                  );

                  return [el, detailRow];
                })}
              </tbody>
            </table>
          </div>

          {rows.length > LEDGER_PAGE && (
            <button
              type="button"
              aria-expanded={showAll}
              data-clickable=""
              data-effect="expand"
              onClick={() => setShowAll(prev => !prev)}
              className="self-center py-1 text-xs font-medium text-[var(--pos-text)] hover:underline"
            >
              {showAll
                ? "Show fewer"
                : `Show all (${rows.length - LEDGER_PAGE} remaining)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
