import { useState } from "react";
import { Badge } from "./Badge";
import { FundSignal } from "./FundSignal";
import styles from "./HoldingsTable.module.css";

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
      <div className={styles.emptyTable}>
        <p className="type-body">No mutual fund holdings found.</p>
      </div>
    );
  }

  const filteredHoldings = holdings.filter((h) =>
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

  return (
    <div className={styles.container}>
      <div className={styles.tableHeaderControls}>
        <div className={styles.searchBox}>
          <input
            type="text"
            placeholder="Search funds or AMCs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        <div className={styles.rowCount}>
          <span className="type-caption">{sortedHoldings.length} holdings</span>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thSignal}>Signal</th>
              <th className={styles.thScheme} onClick={() => handleSort("scheme_name")}>
                Scheme Name {sortField === "scheme_name" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
              </th>
              {showMemberName && <th>Member</th>}
              <th className={styles.thBadge}>Plan</th>
              <th className={styles.thNum} onClick={() => handleSort("units_held")}>
                Units
              </th>
              <th className={styles.thNum} onClick={() => handleSort("average_nav")}>
                Avg NAV
              </th>
              <th className={styles.thNum} onClick={() => handleSort("current_nav")}>
                Current NAV
              </th>
              <th className={styles.thNum} onClick={() => handleSort("amount_invested")}>
                Invested
              </th>
              <th className={styles.thNum} onClick={() => handleSort("current_value")}>
                Current Value {sortField === "current_value" ? (sortDirection === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className={styles.thNum} onClick={() => handleSort("unrealized_gain")}>
                Gain / Loss
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedHoldings.map((row) => {
              const unrealized = parseFloat(row.unrealized_gain || row.current_profit_total || "0");
              const isGain = unrealized >= 0;
              const returnPct = row.return_percentage_1y ?? (parseFloat(row.amount_invested) > 0 ? (unrealized / parseFloat(row.amount_invested)) * 100 : 0);

              return (
                <tr
                  key={row.scheme_id + (row.household_member_id || "")}
                  className={styles.row}
                  onClick={() => onSelectScheme?.(row.scheme_id)}
                >
                  <td className={styles.tdSignal}>
                    <FundSignal
                      returnPercentage={returnPct}
                      schemeName={row.scheme_name}
                      size="sm"
                    />
                  </td>
                  <td className={styles.tdScheme}>
                    <div className={styles.schemeCell}>
                      <span className={`type-body-medium ${styles.schemeName}`}>
                        {row.scheme_name}
                      </span>
                      {row.amc_name && (
                        <span className={`type-caption ${styles.amcName}`}>
                          {row.amc_name}
                        </span>
                      )}
                    </div>
                  </td>
                  {showMemberName && (
                    <td>
                      <span className="type-caption">{row.household_member_name || "—"}</span>
                    </td>
                  )}
                  <td>
                    <Badge variant={row.plan_type === "DIRECT" ? "positive" : "neutral"}>
                      {row.plan_type || "UNKNOWN"}
                    </Badge>
                  </td>
                  <td className={`type-data ${styles.numCell}`}>
                    {formatNumber(row.units_held, 3)}
                  </td>
                  <td className={`type-data ${styles.numCell}`}>
                    ₹{formatNumber(row.average_nav, 2)}
                  </td>
                  <td className={`type-data ${styles.numCell}`}>
                    <div>
                      <span>₹{formatNumber(row.current_nav, 2)}</span>
                      {row.stale_nav && (
                        <div className={styles.staleBadgeWrapper}>
                          <Badge variant="warning">stale</Badge>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className={`type-data ${styles.numCell}`}>
                    ₹{formatCurrency(row.amount_invested)}
                  </td>
                  <td className={`type-data ${styles.numCell} ${styles.boldVal}`}>
                    ₹{formatCurrency(row.current_value)}
                  </td>
                  <td className={`type-data ${styles.numCell}`}>
                    <div className={`${styles.gainWrapper} ${isGain ? styles.gainPositive : styles.gainNegative}`}>
                      <span>{isGain ? "↑" : "↓"}</span>
                      <span>₹{formatCurrency(Math.abs(unrealized))}</span>
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
