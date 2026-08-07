import { Button } from "../../components/Button";
import styles from "./onboarding.module.css";
import type { PrimaryGoal } from "./types";

interface Q3PurposeProps {
  onBack: () => void;
  onSkip: () => void;
  onSelect: (value: PrimaryGoal) => void;
}

const OPTIONS: { value: PrimaryGoal; title: string; subtitle: string; icon: string }[] = [
  {
    value: "consolidated_view",
    title: "Consolidated portfolio view",
    subtitle: "See all my mutual funds across brokers and AMCs in one place",
    icon: "📊",
  },
  {
    value: "understand_holdings",
    title: "Understand true performance",
    subtitle: "Realized vs unrealized gains, direct vs regular returns",
    icon: "🔍",
  },
  {
    value: "family_management",
    title: "Family wealth tracking",
    subtitle: "Managing investments for family members under one dashboard",
    icon: "👨‍👩‍👧‍👦",
  },
  {
    value: "performance_comparison",
    title: "Compare distributor fees",
    subtitle: "Compare returns and commissions across ARNs and channels",
    icon: "⚖️",
  },
];

export function Q3Purpose({ onBack, onSkip, onSelect }: Q3PurposeProps) {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>What brings you to Unifolio?</h1>
      <p className={styles.subtitle}>
        Choose your primary goal so we can highlight the most relevant views for you.
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
