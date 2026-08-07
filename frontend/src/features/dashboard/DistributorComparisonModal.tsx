import { useEffect, useState } from "react";
import { Modal } from "../../components/Modal";
import { Badge } from "../../components/Badge";
import { Skeleton } from "../../components/Skeleton";
import { getDistributorComparison } from "./api";
import type { DistributorComparisonRow } from "./types";
import styles from "./DistributorComparisonModal.module.css";

export interface DistributorComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberId: string;
  schemeId: string;
  schemeName?: string;
}

export function DistributorComparisonModal({
  isOpen,
  onClose,
  memberId,
  schemeId,
  schemeName = "Mutual Fund Scheme",
}: DistributorComparisonModalProps) {
  const [rows, setRows] = useState<DistributorComparisonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && memberId && schemeId) {
      setLoading(true);
      setError(null);
      getDistributorComparison(memberId, schemeId)
        .then((data) => {
          setRows(data);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message || "Failed to load distributor comparison");
          setLoading(false);
        });
    }
  }, [isOpen, memberId, schemeId]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Distributor Comparison">
      <div className={styles.container}>
        <div className={styles.schemeHeader}>
          <h3 className={`type-h2 ${styles.schemeTitle}`}>{schemeName}</h3>
          <p className="type-caption">
            Compare returns across Direct plans and Regular distributors for this scheme
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
                  const isDirect = !row.arn_code;
                  const gain = parseFloat(row.unrealized_gain || "0");
                  const isPositive = gain >= 0;

                  return (
                    <tr key={row.arn_code || `direct-${idx}`} className={styles.row}>
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
                          <Badge variant="positive">ACTIVE</Badge>
                        ) : row.arn_status === "SUSPENDED" || row.arn_status === "INVALID" ? (
                          <Badge variant="warning">{row.arn_status}</Badge>
                        ) : (
                          <Badge variant="neutral">UNRESOLVED</Badge>
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
