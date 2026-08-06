import styles from "./onboarding.module.css";
import type { InvestorType } from "./types";

interface Q2InvestingProps {
  onBack: () => void;
  onSkip: () => void;
  onSelect: (value: InvestorType) => void;
}

const OPTIONS: { value: InvestorType; label: string }[] = [
  { value: "self_directed", label: "Mostly on my own — SIPs, mutual funds, maybe some stocks" },
  { value: "advisor_assisted", label: "Through a distributor, bank RM, or family office, alongside my own tracking" },
  { value: "mixed", label: "A mix of both" },
  { value: "beginner", label: "Just getting started — haven't invested much yet" },
];

export function Q2Investing({ onBack, onSkip, onSelect }: Q2InvestingProps) {
  return (
    <div className={styles.container}>
      <h1>How are you investing right now?</h1>
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
