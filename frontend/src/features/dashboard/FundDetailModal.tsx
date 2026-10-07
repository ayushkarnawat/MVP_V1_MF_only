import { PlanBadge } from "@/features/dashboard/PlanBadge";
import { Modal } from "../../components/Modal";
import { Badge } from "../../components/Badge";
import { navPriceBadge } from "./navPriceBadge";
import { formatDdMmYyyy } from "../../lib/utils";
import { FundSignalGraph } from "../../components/FundSignal";
import type { HoldingRow } from "./types";
import styles from "./FundDetailModal.module.css";
import { formatDecimal } from "../../lib/decimal";

export interface FundDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  holding: HoldingRow | null;
}

export function FundDetailModal({
  isOpen,
  onClose,
  holding,
}: FundDetailModalProps) {
  if (!holding) return null;

  const navUnavailable = holding.nav_unavailable === true;
  const invested = parseFloat(holding.amount_invested || "0");
  const currentValue = navUnavailable ? null : parseFloat(holding.current_value || "0");
  const profit = navUnavailable ? null : parseFloat(holding.current_profit_total || "0");
  const isPositive = profit !== null && profit >= 0;
  const opening = holding.opening_lot;
  const openingDate = opening ? new Date(`${opening.since}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }) : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Fund Details">
      <div className={styles.container}>
        <div className={styles.headerArea}>
          <div className={styles.titleRow}>
            <h3 className={`type-h2 ${styles.schemeName}`}>{holding.scheme_name}</h3>
            <PlanBadge planType={holding.plan_type} verified={holding.plan_verified} />
          </div>
          {holding.amc_name && (
            <p className={`type-caption ${styles.amcText}`}>{holding.amc_name}</p>
          )}
        </div>

        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Unrealised gain</span>
            <span className={`type-data-large ${navUnavailable ? "" : Number(holding.unrealized_gain) >= 0 ? styles.positiveText : styles.negativeText}`}>
              {navUnavailable || holding.unrealized_gain === null ? "—" : `₹${formatCurrency(Number(holding.unrealized_gain))}`}
            </span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Current Value</span>
            <span className={`type-data-large ${styles.kpiVal}`}>
              {currentValue === null ? "—" : `₹${formatCurrency(currentValue)}`}
            </span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Invested Amount</span>
            {opening?.cost_source === "nav_on_start" && <Badge variant="warning">cost approximate</Badge>}
            <span className={`type-data-large ${styles.kpiVal}`}>
              ₹{formatCurrency(invested)}
            </span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Total return incl. realised</span>
            {profit === null ? (
              <span className={`type-data-large ${styles.kpiVal}`}>—</span>
            ) : (
              <span
                className={`type-data-large ${
                  isPositive ? styles.positiveText : styles.negativeText
                }`}
              >
                {isPositive ? "↑ " : "↓ "}₹{formatCurrency(Math.abs(profit))}
              </span>
            )}
          </div>
        </div>

        {!navUnavailable && <FundSignalGraph schemeId={holding.scheme_id} />}

        <div className={styles.detailsList}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Units Held</span>
            <span className="type-data">{formatDecimal(holding.units_held)}</span>
          </div>
          {opening && <>
            <p className="type-caption">incl. {new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(Number(opening.units))} units from before {openingDate}</p>
            <p className="type-caption">held since at least {openingDate}</p>
          </>}
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Average NAV</span>
            <span className="type-data">{holding.average_nav === null ? "—" : `₹${formatDecimal(holding.average_nav)}`}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Current NAV</span>
            <span className="type-data" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              {navUnavailable ? (
                <Badge variant="warning">NAV unavailable</Badge>
              ) : (
                <>{holding.current_nav === null ? "—" : `₹${formatDecimal(holding.current_nav)}`}</>
              )}
              {!navUnavailable && (() => { const b = navPriceBadge(holding); return b && <Badge variant={b.variant}>{b.label}</Badge>; })()}
            </span>
          </div>
          {holding.current_nav_date && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>NAV Date</span>
              <span className="type-caption">{formatDdMmYyyy(holding.current_nav_date)}</span>
            </div>
          )}
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
