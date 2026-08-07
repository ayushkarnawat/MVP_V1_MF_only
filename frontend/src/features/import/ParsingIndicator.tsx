import { useState, useEffect } from "react";
import styles from "./ParsingIndicator.module.css";

const STEPS = [
  "Decrypting & parsing statement...",
  "Extracting folios & transactions...",
  "Matching scheme AMFI codes...",
  "Calculating FIFO cost basis & NAV history...",
];

export function ParsingIndicator() {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentStep((prev) => (prev < STEPS.length - 1 ? prev + 1 : prev));
    }, 900);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={styles.container} role="status" aria-live="polite">
      <div className={styles.arcLoader}>
        <svg viewBox="0 0 50 50" className={styles.loaderSvg}>
          <circle
            cx="25"
            cy="25"
            r="20"
            className={styles.loaderTrack}
          />
          <circle
            cx="25"
            cy="25"
            r="20"
            className={styles.loaderFill}
          />
        </svg>
      </div>

      <div className={styles.textContainer}>
        <h3 className={`type-h2 ${styles.title}`}>Importing Mutual Fund Statement</h3>
        <p className={`type-body ${styles.stepText}`}>{STEPS[currentStep]}</p>
      </div>

      <div className={styles.dotsGroup}>
        {STEPS.map((_, idx) => (
          <span
            key={idx}
            className={`${styles.dot} ${idx <= currentStep ? styles.dotActive : ""}`}
          />
        ))}
      </div>
    </div>
  );
}
