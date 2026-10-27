import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  breakdownTotals,
  groupByFund,
  transactionLabel,
} from "../../../components/mf/periodBreakdown";
import { formatDate, formatRupees } from "../../../lib/format";
import type { InvestmentWithdrawalBucket } from "../types";
import { periodTitle } from "./transactionsLogic";

export function PeriodDrill({ bucket }: { bucket: InvestmentWithdrawalBucket }) {
  const title = periodTitle(bucket.period);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (ref.current && typeof ref.current.scrollIntoView === "function") {
      ref.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [bucket.period]);

  const [memberId, setMemberId] = useState<string | null>(null);
  const [openFund, setOpenFund] = useState<string | null>(null);

  // Distinct household members from entries
  const members = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of bucket.entries) {
      if (entry.household_member_id) {
        map.set(entry.household_member_id, entry.household_member_name);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [bucket.entries]);

  const handleMemberSelect = (id: string | null) => {
    setMemberId(id);
    setOpenFund(null);
  };

  const { rows, opening } = useMemo(() => {
    return groupByFund(bucket.entries, memberId);
  }, [bucket.entries, memberId]);

  const totals = useMemo(() => breakdownTotals(rows), [rows]);

  const hasOpening = opening !== "0" && opening !== "0.00" && opening !== "0.0";

  return (
    <section
      ref={ref}
      data-testid="period-drill"
      aria-label={`${title} breakdown`}
      className="mt-4 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-4"
    >
      <div className="flex flex-col gap-4">
        <h4 className="text-sm font-semibold text-[var(--ui-text)]">{title}</h4>

        {/* Member filter chips if more than 1 member */}
        {members.length > 1 && (
          <div
            role="group"
            aria-label="Household member"
            className="flex flex-wrap items-center gap-1.5"
          >
            <button
              type="button"
              aria-pressed={memberId === null}
              data-clickable=""
              data-effect="select"
              onClick={() => handleMemberSelect(null)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                memberId === null
                  ? "border-[var(--ui-text)] bg-[var(--ui-text)] text-[var(--ui-elevated)]"
                  : "border-[var(--ui-divider)] bg-[var(--ui-elevated)] text-[var(--ui-text-muted)] hover:border-[var(--ui-text)] hover:text-[var(--ui-text)]"
              }`}
            >
              All
            </button>
            {members.map(m => {
              const isPressed = memberId === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={isPressed}
                  data-clickable=""
                  data-effect="select"
                  onClick={() => handleMemberSelect(m.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    isPressed
                      ? "border-[var(--ui-text)] bg-[var(--ui-text)] text-[var(--ui-elevated)]"
                      : "border-[var(--ui-divider)] bg-[var(--ui-elevated)] text-[var(--ui-text-muted)] hover:border-[var(--ui-text)] hover:text-[var(--ui-text)]"
                  }`}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Period totals chips */}
        <div
          role="group"
          aria-label="Period totals"
          className="flex flex-wrap items-center gap-2 text-xs"
        >
          <span
            data-testid="drill-total-invested"
            className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-2.5 py-1 font-medium text-[var(--ui-text)]"
          >
            Invested {formatRupees(totals.invested)}
          </span>
          <span
            data-testid="drill-total-withdrawn"
            className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-2.5 py-1 font-medium text-[var(--ui-text)]"
          >
            Withdrawn {formatRupees(totals.withdrawn)}
          </span>
          <span
            data-testid="drill-total-switched-in"
            className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-2.5 py-1 font-medium text-[var(--ui-text)]"
          >
            Switched in {formatRupees(totals.switchedIn)}
          </span>
          <span
            data-testid="drill-total-switched-out"
            className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-2.5 py-1 font-medium text-[var(--ui-text)]"
          >
            Switched out {formatRupees(totals.switchedOut)}
          </span>
          {hasOpening && (
            <span
              data-testid="drill-total-opening-holdings"
              className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-2.5 py-1 font-medium text-[var(--ui-text)]"
            >
              Opening holdings {formatRupees(opening)}
            </span>
          )}
        </div>

        {/* Table or Empty message */}
        {rows.length === 0 ? (
          <p className="text-xs text-[var(--ui-text-muted)] py-2">
            {bucket.entries.length === 0
              ? "No transactions in this period"
              : "Only opening holdings in this period"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table
              aria-label={`${title} fund breakdown`}
              className="w-full text-left text-xs"
            >
              <thead>
                <tr className="border-b border-[var(--ui-divider)] text-[var(--ui-text-muted)]">
                  <th className="pb-2 font-medium">Fund</th>
                  <th className="pb-2 font-medium">Invested</th>
                  <th className="pb-2 font-medium">Withdrawn</th>
                  <th className="pb-2 font-medium">Switched in</th>
                  <th className="pb-2 font-medium">Switched out</th>
                  <th className="pb-2 font-medium">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ui-divider)]">
                {rows.map(row => {
                  const isOpen = openFund === row.schemeName;
                  return (
                    <tr
                      key={row.schemeName}
                      data-testid={`drill-row-${row.schemeName}`}
                    >
                      <th scope="row" className="py-2.5 font-normal text-[var(--ui-text)]">
                        <button
                          type="button"
                          aria-label={`${row.schemeName} transactions`}
                          aria-expanded={isOpen}
                          data-clickable=""
                          data-effect="expand"
                          onClick={() => setOpenFund(isOpen ? null : row.schemeName)}
                          className="flex items-center gap-1.5 text-left font-medium hover:text-[var(--pos-text)]"
                        >
                          <ChevronRight
                            aria-hidden="true"
                            className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                              isOpen ? "rotate-90" : ""
                            }`}
                          />
                          <span>{row.schemeName}</span>
                        </button>
                        <span className="block text-[11px] text-[var(--ui-text-muted)] pl-5">
                          {row.memberNames.join(", ")}
                        </span>
                      </th>
                      <td className="py-2.5 text-[var(--ui-text)] font-medium">
                        {formatRupees(row.invested)}
                      </td>
                      <td className="py-2.5 text-[var(--ui-text)] font-medium">
                        {formatRupees(row.withdrawn)}
                      </td>
                      <td className="py-2.5 text-[var(--ui-text-muted)] font-medium">
                        {formatRupees(row.switchedIn)}
                      </td>
                      <td className="py-2.5 text-[var(--ui-text-muted)] font-medium">
                        {formatRupees(row.switchedOut)}
                      </td>
                      <td className="py-2.5 text-[var(--ui-text)] font-medium">
                        {formatRupees(row.net)}
                      </td>
                    </tr>
                  );
                }).flatMap((el, idx) => {
                  const row = rows[idx];
                  const isOpen = openFund === row.schemeName;
                  if (!isOpen) return [el];

                  const detailRow = (
                    <tr
                      key={`detail-${row.schemeName}`}
                      className="bg-[var(--ui-elevated)]"
                    >
                      <td colSpan={6} className="p-3">
                        <ul
                          aria-label={`${row.schemeName} dated transactions`}
                          className="flex flex-col gap-1.5 text-xs text-[var(--ui-text-muted)]"
                        >
                          {row.entries.map(entry => (
                            <li
                              key={entry.transaction_id}
                              data-testid={`entry-${entry.transaction_id}`}
                              className="flex items-center justify-between"
                            >
                              <span>
                                {formatDate(entry.date)} · {entry.household_member_name} ·{" "}
                                {transactionLabel(entry)}
                              </span>
                              <span className="font-medium text-[var(--ui-text)]">
                                {formatRupees(entry.amount)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  );

                  return [el, detailRow];
                })}
              </tbody>
              <tfoot>
                <tr
                  data-testid="drill-footer"
                  className="border-t border-[var(--ui-divider)] font-semibold text-[var(--ui-text)]"
                >
                  <th scope="row" className="pt-3">
                    Total
                  </th>
                  <td className="pt-3">{formatRupees(totals.invested)}</td>
                  <td className="pt-3">{formatRupees(totals.withdrawn)}</td>
                  <td className="pt-3">{formatRupees(totals.switchedIn)}</td>
                  <td className="pt-3">{formatRupees(totals.switchedOut)}</td>
                  <td className="pt-3">{formatRupees(totals.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
