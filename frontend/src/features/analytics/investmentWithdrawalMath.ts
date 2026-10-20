import type { BarChartDatum } from "@/components/ui/charts/bar-chart";
import { sumDecimalStrings } from "@/lib/decimal";
import type { InvestmentWithdrawalBucket, InvestmentWithdrawalResult } from "./types";

export function tilesFor(data: InvestmentWithdrawalResult, includeSwitches: boolean): { invested: string; withdrawn: string; net: string } {
  return {
    invested: sumDecimalStrings([data.total_invested, includeSwitches ? data.total_switched_in ?? "0" : "0"]),
    withdrawn: sumDecimalStrings([data.total_withdrawn, includeSwitches ? data.total_switched_out ?? "0" : "0"]),
    net: data.net_invested,
  };
}

export function toBarData(buckets: InvestmentWithdrawalBucket[], includeSwitches: boolean): BarChartDatum[] {
  // Numbers are used only for chart geometry; all tile/breakdown arithmetic stays exact.
  return buckets.map(b => ({
    period: b.period,
    invested: Number(b.invested),
    withdrawn: Number(b.withdrawn),
    switchedIn: includeSwitches ? Number(b.switched_in ?? 0) : 0,
    switchedOut: includeSwitches ? Number(b.switched_out ?? 0) : 0,
  }));
}
