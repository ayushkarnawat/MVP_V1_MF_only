import { Button } from "../../components/Button";
import styles from "./onboarding.module.css";

interface Q4HouseholdProps {
  onBack: () => void;
  onChooseSolo: () => void;
  onChooseFamily: () => void;
}

export function Q4Household({ onBack, onChooseSolo, onChooseFamily }: Q4HouseholdProps) {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Just you, or tracking for family too?</h1>
      <p className={styles.subtitle}>
        Unifolio allows tracking individual portfolios or aggregating family members into one combined view.
      </p>

      <div className={styles.choiceGrid}>
        <button
          type="button"
          className={styles.choiceCardLarge}
          onClick={onChooseSolo}
        >
          <span className={styles.largeIcon}>👤</span>
          <div className={styles.choiceText}>
            <strong className={styles.choiceTitle}>Just Me</strong>
            <span className={styles.choiceDesc}>
              I'm tracking my own personal mutual fund portfolio.
            </span>
          </div>
          <span className={styles.choiceArrow}>→</span>
        </button>

        <button
          type="button"
          className={styles.choiceCardLarge}
          onClick={onChooseFamily}
        >
          <span className={styles.largeIcon}>👥</span>
          <div className={styles.choiceText}>
            <strong className={styles.choiceTitle}>Family Too</strong>
            <span className={styles.choiceDesc}>
              I want to track investments for spouse, parents, or children together.
            </span>
          </div>
          <span className={styles.choiceArrow}>→</span>
        </button>
      </div>

      <div className={styles.actionsLeft}>
        <Button variant="ghost" size="sm" type="button" onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}
