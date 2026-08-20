import { Fragment, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Modal } from "../../components/Modal";
import { Badge } from "../../components/Badge";
import { Skeleton } from "../../components/Skeleton";
import { cn, toTitleCase } from "../../lib/utils";
import { getAggregateDistributorComparison, getMemberDistributorComparison } from "./api";
import type { DistributorPortfolioRow } from "./types";
import styles from "./DistributorComparisonModal.module.css";

export interface DistributorComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  viewMode: "aggregate" | "member";
  memberId: string | null;
}

function rowKey(row: DistributorPortfolioRow, idx: number): string {
  return row.arn_code || `direct-${idx}`;
}

export function DistributorComparisonModal({
  isOpen,
  onClose,
  viewMode,
  memberId,
}: DistributorComparisonModalProps) {
  const [rows, setRows] = useState<DistributorPortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    if (viewMode === "member" && !memberId) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setExpanded(new Set());

    const fetchRows = viewMode === "aggregate"
      ? getAggregateDistributorComparison(controller.signal).then((res) => res.rows)
      : getMemberDistributorComparison(memberId as string, controller.signal);

    fetchRows
      .then((data) => {
        setRows(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(err.message || "Failed to load distributor comparison");
        setLoading(false);
      });

    return () => controller.abort();
  }, [isOpen, viewMode, memberId]);

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Distributor Comparison">
      <div className={styles.container}>
        <div className={styles.schemeHeader}>
          <p className="type-caption">
            Compare returns across Direct plans and Regular distributors, across every fund you hold
          </p>
        </div>

        {loading ? (
          <div className={styles.loadingSkeleton}>
            <Skeleton height="40px" />
            <Skeleton height="40px" />
            <Skeleton height="40px" />
          </div>
        ) : error ? (
          <div className={styles.errorBox}>
            <p className="type-body">{error}</p>
          </div>
        ) : rows.length === 0 ? (
          <p className="type-body">No distributor comparison data found.</p>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th></th>
                  <th>Distributor / Channel</th>
                  <th>ARN Code</th>
                  <th>Status</th>
                  <th className={styles.numTh}>Invested</th>
                  <th className={styles.numTh}>Current Value</th>
                  <th className={styles.numTh}>Unrealized Gain</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const key = rowKey(row, idx);
                  const isDirect = !row.arn_code;
                  const gain = parseFloat(row.unrealized_gain || "0");
                  const isPositive = gain >= 0;
                  const isExpanded = expanded.has(key);

                  return (
                    <Fragment key={key}>
                      <tr
                        key={key}
                        className={styles.row}
                        onClick={() => toggleExpanded(key)}
                        style={{ cursor: "pointer" }}
                      >
                        <td>
                          <button
                            type="button"
                            className={cn(styles.expandButton, isExpanded && styles.expandButtonOpen)}
                            aria-label={isExpanded ? "Collapse breakdown" : "Expand breakdown"}
                            aria-expanded={isExpanded}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpanded(key);
                            }}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </td>
                        <td>
                          <div className={styles.distributorNameCell}>
                            <span className={`type-body-medium ${styles.nameText}`}>
                              {isDirect
                                ? "Direct Plan (No Broker)"
                                : row.distributor_name || "Regular Broker"}
                            </span>
                          </div>
                        </td>
                        <td className="type-data">
                          {isDirect ? "—" : row.arn_code}
                        </td>
                        <td>
                          {isDirect ? (
                            <Badge variant="positive">Direct</Badge>
                          ) : row.arn_status === "ACTIVE" ? (
                            <Badge variant="positive">{toTitleCase(row.arn_status)}</Badge>
                          ) : row.arn_status === "SUSPENDED" || row.arn_status === "INVALID" ? (
                            <Badge variant="warning">{toTitleCase(row.arn_status)}</Badge>
                          ) : (
                            <Badge variant="neutral">Unresolved</Badge>
                          )}
                        </td>
                        <td className={`type-data ${styles.numTd}`}>
                          ₹{formatCurrency(row.amount_invested)}
                        </td>
                        <td className={`type-data ${styles.numTd} ${styles.boldText}`}>
                          ₹{formatCurrency(row.current_value)}
                        </td>
                        <td className={`type-data ${styles.numTd}`}>
                          <span className={isPositive ? styles.positiveText : styles.negativeText}>
                            {isPositive ? "↑ " : "↓ "}₹{formatCurrency(Math.abs(gain))}
                          </span>
                        </td>
                      </tr>
                      {isExpanded &&
                        row.schemes.map((scheme) => {
                          const schemeGain = parseFloat(scheme.unrealized_gain || "0");
                          const schemeIsPositive = schemeGain >= 0;
                          return (
                            <tr key={`${key}-${scheme.scheme_id}-${scheme.household_member_id}`} className={styles.breakdownRow}>
                              <td></td>
                              <td colSpan={2}>
                                <div className={styles.breakdownScheme}>
                                  <span className="type-body">{scheme.scheme_name}</span>
                                  {viewMode === "aggregate" && (
                                    <span className={`type-caption ${styles.breakdownMemberName}`}>
                                      {scheme.household_member_name}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="type-caption">
                                {scheme.units_held} units @ ₹{scheme.average_nav ?? "—"}
                              </td>
                              <td className={`type-data ${styles.numTd}`}>
                                ₹{formatCurrency(scheme.amount_invested)}
                              </td>
                              <td className={`type-data ${styles.numTd}`}>
                                ₹{formatCurrency(scheme.current_value)}
                              </td>
                              <td className={`type-data ${styles.numTd}`}>
                                <span className={schemeIsPositive ? styles.positiveText : styles.negativeText}>
                                  {schemeIsPositive ? "↑ " : "↓ "}₹{formatCurrency(Math.abs(schemeGain))}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

function formatCurrency(valStr: string | number): string {
  const num = typeof valStr === "string" ? parseFloat(valStr) : valStr;
  if (isNaN(num)) return "0";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(num);
}
