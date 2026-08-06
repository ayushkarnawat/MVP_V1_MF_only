import styles from "./onboarding.module.css";

interface Q4HouseholdProps {
  onBack: () => void;
  onChooseSolo: () => void;
  onChooseFamily: () => void;
}

export function Q4Household({ onBack, onChooseSolo, onChooseFamily }: Q4HouseholdProps) {
  return (
    <div className={styles.container}>
      <h1>Just you, or tracking for family too?</h1>
      <div className={styles.actions}>
        <button type="button" onClick={onChooseSolo}>
          Just me
        </button>
        <button type="button" onClick={onChooseFamily}>
          Family too
        </button>
      </div>
      <button type="button" onClick={onBack}>
        Back
      </button>
    </div>
  );
}
