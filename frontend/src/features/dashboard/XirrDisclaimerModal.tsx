import { Modal } from "../../components/Modal";
import { toPercentString } from "../../lib/decimal";
import { openingSharePercent } from "./xirrDisclaimerFormat";
import type { XirrDisclaimer } from "./types";
import styles from "./XirrDisclaimerModal.module.css";

export interface XirrDisclaimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  scopeLabel: "Lifetime" | "Current Holdings";
  /** Decimal-fraction string, e.g. "1.9397" = 193.97%. */
  xirr: string;
  disclaimer: XirrDisclaimer;
}

export function XirrDisclaimerModal({
  isOpen,
  onClose,
  scopeLabel,
  xirr,
  disclaimer,
}: XirrDisclaimerModalProps) {
  const share = openingSharePercent(disclaimer.opening_cost_share);
  const alt = disclaimer.alt_xirr === null ? null : `${toPercentString(disclaimer.alt_xirr)}%`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Why this return may be misleading">
      <div className={styles.container}>
        <p className={styles.lead}>
          This comes from how your uploaded CAS statement reports old holdings — not from anything
          wrong with your investments or your account.
        </p>

        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Shown {scopeLabel} XIRR</span>
            <span className={`type-data-large ${styles.kpiVal}`}>{toPercentString(xirr)}%</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Without the undated portion</span>
            {alt === null ? (
              <span className={`type-body ${styles.kpiVal}`}>Not enough dated activity left</span>
            ) : (
              <span className={`type-data-large ${styles.kpiVal}`}>{alt}</span>
            )}
          </div>
        </div>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>What's driving this number</h3>
          <p className="type-caption">
            {share} of the money behind this return came from an opening balance — units you already
            held before the period your CAS statement covers. Your statement tells us what those
            units were worth and what they cost, but the period it covers doesn't go back far enough
            to show us when you actually bought them.
          </p>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Why that matters here, specifically</h3>
          <p className="type-caption">
            XIRR estimates an annualized rate of return, so it depends on how long your money has
            been invested, not just how much it grew. Because we don't have the real purchase date,
            we use the earliest date your statement covers instead — which can make a holding you've
            actually owned for years look like it grew enormously in a few months.
          </p>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Why we're not guessing a date</h3>
          <p className="type-caption">
            We could pick an older date to make this number look more reasonable, but that would
            just replace one unverified number with another. We'd rather tell you plainly which
            numbers you can fully trust.
          </p>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>About the number on the right</h3>
          <p className="type-caption">
            {alt === null
              ? "There isn't enough dated activity left to calculate a return once the opening balance is excluded — almost everything invested here traces back to that single undated opening balance."
              : `${alt} is the annualized return on only the money with a verified date — your purchases, SIPs, and switches recorded since you started tracking with Unifolio. It leaves out the opening balance entirely, both its cost and its current value, so it understates your true return if you've genuinely held these funds a long time — but it's the one number here we can fully stand behind.`}
          </p>
        </section>

        <aside className={styles.callout}>
          <h3 className={styles.sectionTitle}>A note on account aggregator / MF Central imports</h3>
          <p className="type-caption">
            This specific issue is tied to the statement you uploaded, not to mutual funds generally
            — a CAS covering your full history from account-opening wouldn't have it at all. We
            expect it to come up far less often once Unifolio can pull your transaction history
            directly (rather than depending on whatever period a PDF happened to cover), but we
            can't promise it disappears completely — very old holdings may still have no recorded
            purchase date anywhere, through any channel.
          </p>
        </aside>

        <div className={styles.footer}>
          <button type="button" className={styles.gotIt} onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </Modal>
  );
}
