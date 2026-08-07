import { Modal } from "../../components/Modal";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import type { HoldingRow } from "./types";
import styles from "./FundDetailModal.module.css";

export interface FundDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  holding: HoldingRow | null;
  onCompareDistributors: (schemeId: string, schemeName: string) => void;
}

export function FundDetailModal({
  isOpen,
  onClose,
  holding,
  onCompareDistributors,
}: FundDetailModalProps) {
  if (!holding) return null;

  const invested = parseFloat(holding.amount_invested || "0");
  const currentValue = parseFloat(holding.current_value || "0");
  const profit = parseFloat(holding.current_profit_total || "0");
  const isPositive = profit >= 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Fund Details">
      <div className={styles.container}>
        <div className={styles.headerArea}>
          <div className={styles.titleRow}>
            <h3 className={`type-h2 ${styles.schemeName}`}>{holding.scheme_name}</h3>
            <Badge variant={holding.plan_type === "DIRECT" ? "positive" : "neutral"}>
              {holding.plan_type}
            </Badge>
          </div>
          {holding.amc_name && (
            <p className={`type-caption ${styles.amcText}`}>{holding.amc_name}</p>
          )}
        </div>

        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Current Value</span>
            <span className={`type-data-large ${styles.kpiVal}`}>
              ₹{formatCurrency(currentValue)}
            </span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Invested Amount</span>
            <span className={`type-data-large ${styles.kpiVal}`}>
              ₹{formatCurrency(invested)}
            </span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Total Return</span>
            <span
              className={`type-data-large ${
                isPositive ? styles.positiveText : styles.negativeText
              }`}
            >
              {isPositive ? "↑ " : "↓ "}₹{formatCurrency(Math.abs(profit))}
            </span>
          </div>
        </div>

        <div className={styles.detailsList}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Units Held</span>
            <span className="type-data">{holding.units_held}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Average NAV</span>
            <span className="type-data">₹{holding.average_nav}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Current NAV</span>
            <span className="type-data">₹{holding.current_nav}</span>
          </div>
          {holding.current_nav_date && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>NAV Date</span>
              <span className="type-caption">{holding.current_nav_date}</span>
            </div>
          )}
        </div>

        <div className={styles.actionFooter}>
          <Button
            variant="secondary"
            onClick={() =>
              onCompareDistributors(holding.scheme_id, holding.scheme_name)
            }
          >
            📊 Compare Returns by Distributor
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function formatCurrency(val: number): string {
  if (isNaN(val)) return "0";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(val);
}
