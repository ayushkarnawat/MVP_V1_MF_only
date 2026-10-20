import { compareDecimalStrings, diffDecimalStrings, sumDecimalStrings } from "@/lib/decimal";
import { toTitleCase } from "@/lib/utils";
import type { InvestmentWithdrawalEntry } from "./types";

export interface FundBreakdownRow {
  schemeName: string;
  memberNames: string[];
  invested: string;
  withdrawn: string;
  switchedIn: string;
  switchedOut: string;
  net: string;
  entries: InvestmentWithdrawalEntry[];
}

function totalMovement(row: FundBreakdownRow): string {
  return sumDecimalStrings([row.invested, row.withdrawn, row.switchedIn, row.switchedOut]
    .map(value => compareDecimalStrings(value, "0") < 0 ? diffDecimalStrings("0", value) : value));
}

export function groupByFund(entries: InvestmentWithdrawalEntry[], memberId: string | null): { rows: FundBreakdownRow[]; opening: string } {
  const funds = new Map<string, FundBreakdownRow>();
  let opening = "0";
  for (const entry of entries) {
    if (memberId !== null && entry.household_member_id !== memberId) continue;
    if (entry.direction === "opening") {
      opening = sumDecimalStrings([opening, entry.amount]);
      continue;
    }
    let row = funds.get(entry.scheme_name);
    if (!row) {
      row = { schemeName: entry.scheme_name, memberNames: [], invested: "0", withdrawn: "0", switchedIn: "0", switchedOut: "0", net: "0", entries: [] };
      funds.set(entry.scheme_name, row);
    }
    if (!row.memberNames.includes(entry.household_member_name)) row.memberNames.push(entry.household_member_name);
    row.entries.push(entry);
    switch (entry.direction) {
      case "invested": row.invested = sumDecimalStrings([row.invested, entry.amount]); break;
      case "reversal": row.invested = diffDecimalStrings(row.invested, entry.amount); break;
      case "withdrawn": row.withdrawn = sumDecimalStrings([row.withdrawn, entry.amount]); break;
      case "switched_in": row.switchedIn = sumDecimalStrings([row.switchedIn, entry.amount]); break;
      case "switched_out": row.switchedOut = sumDecimalStrings([row.switchedOut, entry.amount]); break;
    }
  }
  const rows = [...funds.values()];
  for (const row of rows) {
    row.memberNames.sort((a, b) => a.localeCompare(b));
    row.net = diffDecimalStrings(sumDecimalStrings([row.invested, row.switchedIn]), sumDecimalStrings([row.withdrawn, row.switchedOut]));
  }
  rows.sort((a, b) => compareDecimalStrings(totalMovement(b), totalMovement(a)) || a.schemeName.localeCompare(b.schemeName));
  return { rows, opening };
}

export function breakdownTotals(rows: FundBreakdownRow[]): { invested: string; withdrawn: string; switchedIn: string; switchedOut: string; net: string } {
  return {
    invested: sumDecimalStrings(rows.map(row => row.invested)),
    withdrawn: sumDecimalStrings(rows.map(row => row.withdrawn)),
    switchedIn: sumDecimalStrings(rows.map(row => row.switchedIn)),
    switchedOut: sumDecimalStrings(rows.map(row => row.switchedOut)),
    net: sumDecimalStrings(rows.map(row => row.net)),
  };
}

export function transactionLabel(entry: InvestmentWithdrawalEntry): string {
  const labels: Record<string, string> = {
    purchase_sip: "SIP", purchase: "Lump sum", redemption: "Redemption", dividend_payout: "Dividend payout",
    switch_in: "Switch in", switch_out: "Switch out", reversal: "Bounced SIP (reversed)", opening_balance: "Opening holdings",
  };
  return Object.prototype.hasOwnProperty.call(labels, entry.type) ? labels[entry.type] : toTitleCase(entry.type);
}
