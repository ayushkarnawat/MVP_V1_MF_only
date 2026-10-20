import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { compareDecimalStrings, sumDecimalStrings } from "@/lib/decimal";
import { formatExactDate, formatMonthYear } from "@/lib/dateRange";
import { movementRupees } from "@/features/analytics/PeriodBreakdownTable";
import type { MonthDetail, MonthFundRow } from "../dashboard/types";

const money = (value: string | null | undefined) => value == null ? "—" : movementRupees(value);
const nonzero = (value: string | undefined) => value != null && compareDecimalStrings(value, "0") !== 0;
const FILTER = "min-h-11 rounded-md border border-[var(--color-border)] px-3 text-xs aria-pressed:bg-[var(--color-bg)] aria-pressed:font-semibold focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]";
const MONEY = "text-right tabular-nums whitespace-nowrap";
function navText(value: string | null) {
  const match = value?.match(/^(-?)(\d+)(\.\d+)?$/);
  return match ? `${match[1]}₹${new Intl.NumberFormat("en-IN").format(BigInt(match[2]))}${match[3] ?? ""}` : "—";
}

export function HistoryDetailModal({ detail, viewMode, onClose }: { detail: MonthDetail; viewMode: "member" | "aggregate"; onClose: () => void }) {
  const [member, setMember] = useState<string | null>(null);
  const funds = detail.funds ?? [];
  const members = new Map(funds.map(f => [f.household_member_id, f.household_member_name]));
  const activeMember = member !== null && members.has(member) ? member : null;
  const rows = funds.filter(f => activeMember === null || f.household_member_id === activeMember);
  const sum = (field: keyof MonthFundRow) => sumDecimalStrings(rows.map(row => typeof row[field] === "string" ? row[field] as string : "0"));
  const nullableSum = (field: "change_in_value" | "market_movement") => rows.some(row => row[field] == null) ? null : sum(field);
  const summary = activeMember === null ? detail : {
    total_value: sum("value"), change: nullableSum("change_in_value"), new_money: sum("new_money"),
    market_movement: nullableSum("market_movement"), opening_holdings: sum("opening_holdings"),
    switches_net: sum("switched_net"), gifts_net: sum("gifts_net"),
    is_partial: rows.some(row => !row.priced || row.market_movement == null),
    missing_scheme_names: rows.filter(row => !row.priced || row.market_movement == null).map(row => row.scheme_name),
  };
  const ordered = [...rows].sort((a, b) => {
    const soldA = compareDecimalStrings(a.units, "0") === 0, soldB = compareDecimalStrings(b.units, "0") === 0;
    if (soldA !== soldB) return soldA ? 1 : -1;
    if (a.value == null || b.value == null) return a.value == null ? b.value == null ? a.scheme_name.localeCompare(b.scheme_name) : 1 : -1;
    return compareDecimalStrings(b.value, a.value) || a.scheme_name.localeCompare(b.scheme_name);
  });
  return <Modal isOpen onClose={onClose} title={formatMonthYear(detail.month) ?? detail.month} variant="sheet">
    <div className="space-y-4 min-w-0 max-w-full">
      {viewMode === "aggregate" && members.size > 0 && <div role="group" aria-label="Household member" className="flex flex-wrap gap-2">
        <button type="button" className={FILTER} aria-pressed={activeMember === null} onClick={() => setMember(null)}>All</button>
        {[...members].map(([id, name]) => <button key={id} type="button" className={FILTER} aria-pressed={activeMember === id} onClick={() => setMember(id)}>{name}</button>)}
      </div>}
      {summary.is_partial && <p role="alert" className="text-sm text-[var(--color-warning)]">Incomplete prices: {(summary.missing_scheme_names ?? []).join(", ")}. Change and market movement are unavailable.</p>}
      <dl className="grid grid-cols-2 gap-3">{[
        ["Portfolio value", summary.total_value], ["Change this month", summary.change],
        ["New money", summary.new_money], ["Market movement", summary.market_movement],
      ].map(([label, value]) => <div key={label} className="rounded-lg border border-[var(--color-border)] p-3"><dt className="text-xs text-[var(--color-text-secondary)]">{label}</dt><dd className="font-semibold tabular-nums">{money(value)}</dd></div>)}</dl>
      <p className="text-xs text-[var(--color-text-secondary)]">Market movement is what is left after new money, opening holdings, switches and gifted units.</p>
      {[["Opening holdings", summary.opening_holdings], ["Switches (net)", summary.switches_net], ["Gifted units", summary.gifts_net]].map(([label, value]) => nonzero(value) && <p key={label} className="text-sm"><span>{label}</span> <strong className="tabular-nums">{money(value)}</strong></p>)}
      {activeMember === null && (nonzero(detail.switched_in) || nonzero(detail.switched_out)) && <p className="text-sm">Switched between funds {money(detail.switched_in)} in / {money(detail.switched_out)} out</p>}
      <div className="min-w-0 max-w-full"><Table aria-label="Month fund details" className="min-w-[800px]">
        <TableHeader><TableRow>{["Fund", "Units", "NAV (date)", "Value", "Cost", "Change", "Market movement"].map(label => <TableHead key={label} scope="col" className={label === "Fund" ? "" : MONEY}>{label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{ordered.map(fund => <TableRow key={JSON.stringify([fund.household_member_id, fund.scheme_id])}>
          <TableHead scope="row">{fund.scheme_name}{viewMode === "aggregate" && <span className="block text-xs font-normal">{fund.household_member_name}</span>}{!fund.priced && <span className="block text-xs text-[var(--color-warning)]">No price for this month</span>}</TableHead>
          <TableCell className={MONEY}>{fund.units}</TableCell>
          <TableCell className={MONEY}>{navText(fund.nav)}{fund.nav_date && <span className="block text-xs">{formatExactDate(fund.nav_date) ?? fund.nav_date}</span>}</TableCell>
          <TableCell className={MONEY}>{money(fund.value)}</TableCell><TableCell className={MONEY}>{fund.priced ? money(fund.cost) : "—"}</TableCell>
          <TableCell className={MONEY}>{money(fund.change_in_value)}</TableCell><TableCell className={MONEY}>{money(fund.market_movement)}</TableCell>
        </TableRow>)}</TableBody>
      </Table></div>
    </div>
  </Modal>;
}
