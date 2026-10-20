import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDecimal } from "@/lib/decimal";
import { movementRupees } from "./PeriodBreakdownTable";
import type { FundTerRow, WeightedTerSummary } from "./types";

const MONEY = "text-right tabular-nums whitespace-nowrap";
const money = (value: string | null | undefined) => value == null ? "—" : movementRupees(value);

export function FundTerTable({ funds, summary }: { funds: FundTerRow[]; summary: WeightedTerSummary }) {
  const covered = funds.filter(fund => fund.ter != null).length;
  const missing = funds.length - covered;
  return (
    <div className="min-w-0 max-w-full space-y-2">
      <Table aria-label="Projected TER costs by fund" className="min-w-[640px]">
        <TableHeader><TableRow>
          <TableHead scope="col">Fund</TableHead>
          <TableHead scope="col" className={MONEY}>TER</TableHead>
          <TableHead scope="col" className={MONEY}>Your value</TableHead>
          <TableHead scope="col" className={MONEY}>Next 1 year</TableHead>
          <TableHead scope="col" className={MONEY}>Next 3 years</TableHead>
          <TableHead scope="col" className={MONEY}>Next 5 years</TableHead>
        </TableRow></TableHeader>
        <TableBody>{funds.map(fund => <TableRow key={fund.scheme_id}>
          <TableHead scope="row" className="text-[var(--color-ink)]">{fund.scheme_name}</TableHead>
          <TableCell className={MONEY}>{fund.ter == null ? "—" : `${formatDecimal(fund.ter)}%`}</TableCell>
          <TableCell className={MONEY}>{money(fund.value)}</TableCell>
          <TableCell className={MONEY}>{money(fund.ter == null ? null : fund.cost_1y)}</TableCell>
          <TableCell className={MONEY}>{money(fund.ter == null ? null : fund.cost_3y)}</TableCell>
          <TableCell className={MONEY}>{money(fund.ter == null ? null : fund.cost_5y)}</TableCell>
        </TableRow>)}</TableBody>
        <TableFooter><TableRow>
          <TableHead scope="row">Total ({covered} funds with a TER)</TableHead>
          <TableCell className={MONEY}>—</TableCell>
          <TableCell className={MONEY}>{money(summary.covered_value)}</TableCell>
          <TableCell className={MONEY}>{money(summary.cost_1y)}</TableCell>
          <TableCell className={MONEY}>{money(summary.cost_3y)}</TableCell>
          <TableCell className={MONEY}>{money(summary.cost_5y)}</TableCell>
        </TableRow></TableFooter>
      </Table>
      <p className="text-xs text-[var(--color-text-secondary)]">Projected fees if your value and each fund's TER stay as they are today. Not a forecast of returns.</p>
      {missing > 0 && <p className="text-xs text-[var(--color-text-secondary)]">{missing} funds without a TER are not included.</p>}
    </div>
  );
}
