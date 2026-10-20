import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { diffDecimalStrings } from "@/lib/decimal";
import { formatRawFractionPercent, normalizeReturnFraction } from "./percentFormat";
import type { PeriodReturn } from "./types";

const PERIODS = ["1y", "3y", "5y"] as const;

export function PeriodReturnsTable({ periods }: { periods: Partial<Record<"1y" | "3y" | "5y", PeriodReturn>> | undefined }) {
  if (!periods || Object.keys(periods).length === 0) return null;
  const display = (value: string | null | undefined) => value == null ? "—" : formatRawFractionPercent(value);
  return (
    <div className="min-w-0 max-w-full">
      <Table aria-label="Returns by period" className="min-w-[360px]">
        <TableCaption>Category average covers {periods["1y"]?.peers ?? 0} funds (1Y), {periods["3y"]?.peers ?? 0} (3Y), {periods["5y"]?.peers ?? 0} (5Y).</TableCaption>
        <TableHeader><TableRow><TableHead scope="col">Return</TableHead>
          {PERIODS.map(period => <TableHead key={period} scope="col" className="text-right">{period.toUpperCase()}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>
          <TableRow><TableHead scope="row">Fund</TableHead>{PERIODS.map(period => <TableCell key={period} className="text-right tabular-nums whitespace-nowrap">{display(periods[period]?.fund_return)}</TableCell>)}</TableRow>
          <TableRow><TableHead scope="row">Category average</TableHead>{PERIODS.map(period => <TableCell key={period} className="text-right tabular-nums whitespace-nowrap">{display(periods[period]?.category_avg)}</TableCell>)}</TableRow>
          <TableRow><TableHead scope="row">Difference</TableHead>{PERIODS.map(period => {
            const data = periods[period];
            const difference = data?.fund_return == null || data.category_avg == null ? null : diffDecimalStrings(normalizeReturnFraction(data.fund_return), normalizeReturnFraction(data.category_avg));
            return <TableCell key={period} className="text-right tabular-nums whitespace-nowrap">{display(difference)}</TableCell>;
          })}</TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
