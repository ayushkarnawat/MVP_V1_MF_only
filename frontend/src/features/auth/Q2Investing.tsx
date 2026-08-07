import { Button } from "../../components/Button";
import styles from "./onboarding.module.css";
import type { InvestorType } from "./types";

interface Q2InvestingProps {
  onBack: () => void;
  onSkip: () => void;
  onSelect: (value: InvestorType) => void;
}

const OPTIONS: { value: InvestorType; title: string; subtitle: string; icon: string }[] = [
  {
    value: "self_directed",
    title: "Mostly on my own",
    subtitle: "Direct SIPs, mutual funds, maybe some stocks",
    icon: "📈",
  },
  {
    value: "advisor_assisted",
    title: "Through an advisor or distributor",
    subtitle: "Distributor, bank RM, or family office, alongside my own tracking",
    icon: "🤝",
  },
  {
    value: "mixed",
    title: "A mix of both",
    subtitle: "Direct plans + Regular distributor plans",
    icon: "⚡",
  },
  {
    value: "beginner",
    title: "Just getting started",
    subtitle: "Haven't invested much yet, building my portfolio",
    icon: "🚀",
  },
];

export function Q2Investing({ onBack, onSkip, onSelect }: Q2InvestingProps) {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>How are you investing right now?</h1>
      <p className={styles.subtitle}>
        Select the option that best describes your current investment approach.
      </p>

      <div className={styles.choiceGrid}>
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.choiceCard}
            onClick={() => onSelect(option.value)}
          >
            <span className={styles.choiceIcon}>{option.icon}</span>
            <div className={styles.choiceText}>
              <strong className={styles.choiceTitle}>{option.title}</strong>
              <span className={styles.choiceDesc}>{option.subtitle}</span>
            </div>
            <span className={styles.choiceArrow}>→</span>
          </button>
        ))}
      </div>

      <div className={styles.actionsBetween}>
        <Button variant="ghost" size="sm" type="button" onClick={onBack}>
          Back
        </Button>
        <Button variant="ghost" size="sm" type="button" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </div>
  );
}
