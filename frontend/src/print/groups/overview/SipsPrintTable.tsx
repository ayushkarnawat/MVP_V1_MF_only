import type { SipRow } from "../../../features/mutual-funds/types";
import { formatDate, formatRupees } from "../../../lib/format";

export interface SipsPrintTableProps {
  sips: SipRow[];
  stopped: SipRow[];
  monthlyTotal: string;
}

function formatSipDay(sipDate: string): string {
  const trimmed = sipDate.trim();
  const isoMatch = trimmed.match(/^\d{4}-\d{2}-(\d{2})/);
  const dayMatch = isoMatch ?? trimmed.match(/^(\d{1,2})\b/);
  if (!dayMatch) return trimmed || "—";
  const day = Number(dayMatch[1]);
  if (!Number.isInteger(day) || day < 1 || day > 31) return trimmed || "—";
  const suffix =
    day >= 11 && day <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";
  return `${day}${suffix} of each month`;
}

function SipTable({
  rows,
  monthlyTotal,
}: {
  rows: SipRow[];
  monthlyTotal?: string;
}) {
  return (
    <table className="w-full table-fixed border-collapse text-left text-sm">
      <thead>
        <tr className="border-b border-[var(--ui-divider)] text-[11px] font-semibold uppercase tracking-wider text-[var(--ui-text-muted)]">
          <th className="w-[38%] py-2 pr-3 font-semibold">Fund</th>
          <th className="w-[17%] py-2 px-2 font-semibold">Member</th>
          <th className="w-[15%] py-2 px-2 text-right font-semibold">Instalment</th>
          <th className="w-[16%] py-2 px-2 font-semibold">Day</th>
          <th className="w-[14%] py-2 pl-2 font-semibold">Next due</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--ui-divider)]">
        {rows.map((row, idx) => (
          <tr
            key={`${row.scheme_id}-${row.household_member_id}-${idx}`}
            className="break-inside-avoid align-top"
          >
            <td className="py-2.5 pr-3 font-medium text-[var(--ui-text)] break-words">
              {row.scheme_name}
            </td>
            <td className="py-2.5 px-2 text-[var(--ui-text)] break-words">
              {row.household_member_name}
            </td>
            <td className="py-2.5 px-2 text-right tabular-nums text-[var(--ui-text)]">
              {formatRupees(row.sip_amount)}
            </td>
            <td className="py-2.5 px-2 text-[var(--ui-text)]">
              {formatSipDay(row.sip_date)}
            </td>
            <td className="py-2.5 pl-2 tabular-nums text-[var(--ui-text)]">
              {formatDate(row.next_due_date)}
            </td>
          </tr>
        ))}
        {monthlyTotal !== undefined && (
          <tr className="break-inside-avoid border-t-2 border-[var(--ui-text)] font-semibold text-[var(--ui-text)]">
            <td className="py-2.5 pr-3">Monthly SIP total</td>
            <td className="py-2.5 px-2" />
            <td className="py-2.5 px-2 text-right tabular-nums">
              {formatRupees(monthlyTotal)}
            </td>
            <td className="py-2.5 px-2" />
            <td className="py-2.5 pl-2" />
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function SipsPrintTable({ sips, stopped, monthlyTotal }: SipsPrintTableProps) {
  if (sips.length === 0 && stopped.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
        <h4 className="mb-3 text-base font-semibold text-[var(--ui-text)]">Active SIPs</h4>
        <p className="text-sm text-[var(--ui-text-muted)]">No active SIPs.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {sips.length > 0 && (
        <div className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
          <h4 className="mb-3 text-base font-semibold text-[var(--ui-text)]">Active SIPs</h4>
          <SipTable rows={sips} monthlyTotal={monthlyTotal} />
        </div>
      )}

      {stopped.length > 0 && (
        <div className="rounded-2xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h4 className="text-base font-semibold text-[var(--ui-text)]">Stopped SIPs</h4>
            <span className="rounded-md bg-[var(--warn-bg)] px-2 py-0.5 text-xs font-medium text-[var(--warn-text)]">
              Stopped
            </span>
          </div>
          <SipTable rows={stopped} />
        </div>
      )}
    </div>
  );
}
