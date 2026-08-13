import { useState } from "react";
import { Badge } from "./Badge";
import { FundSignal } from "./FundSignal";
import { Input } from "@/components/ui/input";
import { cn, toTitleCase } from "@/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";

export interface HoldingRowData {
  scheme_id: string;
  scheme_name: string;
  amc_name?: string;
  household_member_id?: string;
  household_member_name?: string;
  plan_type: string; // "DIRECT" | "REGULAR" | "UNKNOWN"
  units_held: string;
  average_nav: string;
  current_nav: string;
  current_nav_date?: string;
  amount_invested: string;
  current_value: string;
  current_profit_total: string;
  realized_gain: string;
  unrealized_gain: string;
  today_gain: string;
  stale_nav?: boolean;
  return_percentage_1y?: number;
}

export interface HoldingsTableProps {
  holdings: HoldingRowData[];
  onSelectScheme?: (schemeId: string) => void;
  showMemberName?: boolean;
}

export function HoldingsTable({
  holdings,
  onSelectScheme,
  showMemberName = false,
}: HoldingsTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<keyof HoldingRowData>("current_value");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  if (!holdings || holdings.length === 0) {
    return (
      <div className="p-8 text-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]">
        <p className="type-body">No mutual fund holdings found.</p>
      </div>
    );
  }

  const filteredHoldings = holdings.filter(
    (h) =>
      h.scheme_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (h.amc_name && h.amc_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const sortedHoldings = [...filteredHoldings].sort((a, b) => {
    const valA = parseFloat(a[sortField] as string) || a[sortField] || 0;
    const valB = parseFloat(b[sortField] as string) || b[sortField] || 0;
    if (valA < valB) return sortDirection === "asc" ? -1 : 1;
    if (valA > valB) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const handleSort = (field: keyof HoldingRowData) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const renderSortIndicator = (field: keyof HoldingRowData) => {
    if (sortField !== field) {
      return <ArrowUpDown className="inline ml-1 h-3 w-3 opacity-40 group-hover:opacity-70" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="inline ml-1 h-3 w-3 text-[var(--color-accent)]" />
    ) : (
      <ArrowDown className="inline ml-1 h-3 w-3 text-[var(--color-accent)]" />
    );
  };

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs overflow-hidden">
      {/* Search & Filter Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-secondary)] pointer-events-none" />
          <Input
            type="text"
            placeholder="Search funds or AMCs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs bg-[var(--color-bg)] border-[var(--color-border)] rounded-lg focus-visible:ring-[var(--color-accent)]"
          />
        </div>
        <div className="text-xs font-medium text-[var(--color-text-secondary)] select-none">
          <span className="font-semibold text-[var(--color-ink)] tabular-nums type-data">
            {sortedHoldings.length}
          </span>{" "}
          holdings
        </div>
      </div>

      {/* Responsive Table Layout */}
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left text-sm block lg:table">
          <thead className="hidden lg:table-header-group">
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/40 text-[var(--color-text-secondary)]">
              <th className="py-3 px-3 w-12 text-center text-xs font-semibold select-none">
                Signal
              </th>
              <th
                className="py-3 px-4 min-w-[240px] text-xs font-semibold cursor-pointer select-none group hover:text-[var(--color-ink)] transition-colors"
                onClick={() => handleSort("scheme_name")}
              >
                Scheme Name {renderSortIndicator("scheme_name")}
              </th>
              {showMemberName && (
                <th className="py-3 px-4 text-xs font-semibold select-none">
                  Member
                </th>
              )}
              <th className="py-3 px-3 w-24 text-xs font-semibold select-none">
                Plan
              </th>
              <th
                className="py-3 px-4 text-xs font-semibold text-right cursor-pointer select-none group hover:text-[var(--color-ink)] transition-colors whitespace-nowrap"
                onClick={() => handleSort("units_held")}
              >
                Units {renderSortIndicator("units_held")}
              </th>
              <th
                className="py-3 px-4 text-xs font-semibold text-right cursor-pointer select-none group hover:text-[var(--color-ink)] transition-colors whitespace-nowrap"
                onClick={() => handleSort("average_nav")}
              >
                Avg NAV {renderSortIndicator("average_nav")}
              </th>
              <th
                className="py-3 px-4 text-xs font-semibold text-right cursor-pointer select-none group hover:text-[var(--color-ink)] transition-colors whitespace-nowrap"
                onClick={() => handleSort("current_nav")}
              >
                Current NAV {renderSortIndicator("current_nav")}
              </th>
              <th
                className="py-3 px-4 text-xs font-semibold text-right cursor-pointer select-none group hover:text-[var(--color-ink)] transition-colors whitespace-nowrap"
                onClick={() => handleSort("amount_invested")}
              >
                Invested {renderSortIndicator("amount_invested")}
              </th>
              <th
                className="py-3 px-4 text-xs font-semibold text-right cursor-pointer select-none group hover:text-[var(--color-ink)] transition-colors whitespace-nowrap"
                onClick={() => handleSort("current_value")}
              >
                Current Value {renderSortIndicator("current_value")}
              </th>
              <th
                className="py-3 px-4 text-xs font-semibold text-right cursor-pointer select-none group hover:text-[var(--color-ink)] transition-colors whitespace-nowrap"
                onClick={() => handleSort("unrealized_gain")}
              >
                Gain / Loss {renderSortIndicator("unrealized_gain")}
              </th>
            </tr>
          </thead>
          <tbody className="block lg:table-row-group divide-y divide-[var(--color-border)]">
            {sortedHoldings.map((row) => {
              const unrealized = parseFloat(
                row.unrealized_gain || row.current_profit_total || "0"
              );
              const isGain = unrealized >= 0;
              const returnPct =
                row.return_percentage_1y ??
                (parseFloat(row.amount_invested) > 0
                  ? (unrealized / parseFloat(row.amount_invested)) * 100
                  : 0);

              return (
                <tr
                  key={row.scheme_id + (row.household_member_id || "")}
                  className="block lg:table-row p-3.5 sm:p-4 lg:p-0 hover:bg-[var(--color-bg)]/80 transition-colors duration-150 cursor-pointer group"
                  onClick={() => onSelectScheme?.(row.scheme_id)}
                >
                  {/* Signal */}
                  <td className="inline-block lg:table-cell py-1 lg:py-3 px-0 lg:px-3 text-left lg:text-center align-middle mr-2 lg:mr-0">
                    <FundSignal
                      returnPercentage={returnPct}
                      schemeName={row.scheme_name}
                      size="sm"
                    />
                  </td>

                  {/* Scheme Name */}
                  <td className="inline lg:table-cell py-1 lg:py-3 px-0 lg:px-4 align-middle">
                    <span className="font-semibold text-sm text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors">
                      {row.scheme_name}
                    </span>
                    {row.amc_name && (
                      <span className="text-xs text-[var(--color-text-secondary)] block mt-0.5">
                        {row.amc_name}
                      </span>
                    )}
                  </td>

                  {/* Member Name */}
                  {showMemberName && (
                    <td className="block lg:table-cell py-1 lg:py-3 px-0 lg:px-4 text-xs text-[var(--color-text-secondary)] align-middle">
                      <div className="flex justify-between lg:block">
                        <span className="lg:hidden text-[11px] font-medium text-[var(--color-text-secondary)]">Member:</span>
                        <span>{row.household_member_name || "—"}</span>
                      </div>
                    </td>
                  )}

                  {/* Plan Badge */}
                  <td className="block lg:table-cell py-1 lg:py-3 px-0 lg:px-3 align-middle my-1 lg:my-0">
                    <div className="flex justify-between lg:block items-center">
                      <span className="lg:hidden text-[11px] font-medium text-[var(--color-text-secondary)]">Plan:</span>
                      <Badge
                        variant={
                          row.plan_type === "DIRECT" ? "positive" : "neutral"
                        }
                      >
                        {toTitleCase(row.plan_type || "UNKNOWN")}
                      </Badge>
                    </div>
                  </td>

                  {/* Units */}
                  <td className="block lg:table-cell py-1 lg:py-3 px-0 lg:px-4 text-left lg:text-right text-xs font-medium tabular-nums type-data text-[var(--color-ink)] align-middle whitespace-nowrap">
                    <div className="flex justify-between lg:block">
                      <span className="lg:hidden text-[11px] font-medium text-[var(--color-text-secondary)]">Units:</span>
                      <span>{formatNumber(row.units_held, 3)}</span>
                    </div>
                  </td>

                  {/* Avg NAV */}
                  <td className="block lg:table-cell py-1 lg:py-3 px-0 lg:px-4 text-left lg:text-right text-xs font-medium tabular-nums type-data text-[var(--color-ink)] align-middle whitespace-nowrap">
                    <div className="flex justify-between lg:block">
                      <span className="lg:hidden text-[11px] font-medium text-[var(--color-text-secondary)]">Avg NAV:</span>
                      <span>₹{formatNumber(row.average_nav, 2)}</span>
                    </div>
                  </td>

                  {/* Current NAV & Stale Indicator */}
                  <td className="block lg:table-cell py-1 lg:py-3 px-0 lg:px-4 text-left lg:text-right text-xs font-medium tabular-nums type-data text-[var(--color-ink)] align-middle whitespace-nowrap">
                    <div className="flex justify-between lg:block">
                      <span className="lg:hidden text-[11px] font-medium text-[var(--color-text-secondary)]">Current NAV:</span>
                      <div className="inline-flex items-center gap-1">
                        <span>₹{formatNumber(row.current_nav, 2)}</span>
                        {row.stale_nav && (
                          <Badge variant="warning">
                            stale
                          </Badge>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Amount Invested */}
                  <td className="block lg:table-cell py-1 lg:py-3 px-0 lg:px-4 text-left lg:text-right text-xs font-medium tabular-nums type-data text-[var(--color-text-secondary)] align-middle whitespace-nowrap">
                    <div className="flex justify-between lg:block">
                      <span className="lg:hidden text-[11px] font-medium text-[var(--color-text-secondary)]">Invested:</span>
                      <span>₹{formatCurrency(row.amount_invested)}</span>
                    </div>
                  </td>

                  {/* Current Value */}
                  <td className="block lg:table-cell py-1.5 lg:py-3 px-0 lg:px-4 text-left lg:text-right text-sm font-bold tabular-nums type-data text-[var(--color-ink)] align-middle whitespace-nowrap border-t lg:border-t-0 border-[var(--color-border)]/40 mt-1 lg:mt-0 pt-1 lg:pt-3">
                    <div className="flex justify-between lg:block">
                      <span className="lg:hidden text-xs font-semibold text-[var(--color-ink)]">Current Value:</span>
                      <span>₹{formatCurrency(row.current_value)}</span>
                    </div>
                  </td>

                  {/* Unrealized Gain / Loss */}
                  <td className="block lg:table-cell py-1 lg:py-3 px-0 lg:px-4 text-left lg:text-right text-xs font-bold tabular-nums type-data align-middle whitespace-nowrap">
                    <div className="flex justify-between lg:block">
                      <span className="lg:hidden text-[11px] font-medium text-[var(--color-text-secondary)]">Gain / Loss:</span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1",
                          isGain
                            ? "text-[var(--color-positive)]"
                            : "text-[var(--color-negative)]"
                        )}
                      >
                        <span>{isGain ? "↑" : "↓"}</span>
                        <span>₹{formatCurrency(Math.abs(unrealized))}</span>
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatCurrency(valStr: string | number): string {
  const num = typeof valStr === "string" ? parseFloat(valStr) : valStr;
  if (isNaN(num)) return "0";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(num);
}

function formatNumber(valStr: string | number, decimals: number): string {
  const num = typeof valStr === "string" ? parseFloat(valStr) : valStr;
  if (isNaN(num)) return "0";
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}
