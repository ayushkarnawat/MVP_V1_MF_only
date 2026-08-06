import styles from "./onboarding.module.css";
import type { PrimaryGoal } from "./types";

interface Q3PurposeProps {
  onBack: () => void;
  onSkip: () => void;
  onSelect: (value: PrimaryGoal) => void;
}

const OPTIONS: { value: PrimaryGoal; label: string }[] = [
  { value: "consolidated_view", label: "See all my mutual funds in one place" },
  { value: "understand_holdings", label: "Actually understand what I'm invested in" },
  { value: "family_management", label: "Managing investments for my family, not just myself" },
  { value: "performance_comparison", label: "Compare how my funds are really performing" },
];

export function Q3Purpose({ onBack, onSkip, onSelect }: Q3PurposeProps) {
  return (
    <div className={styles.container}>
      <h1>What brings you to Unifolio?</h1>
      {OPTIONS.map((option) => (
        <button key={option.value} type="button" onClick={() => onSelect(option.value)}>
          {option.label}
        </button>
      ))}
      <div className={styles.actions}>
        <button type="button" onClick={onBack}>
          Back
        </button>
        <button type="button" onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  );
}
