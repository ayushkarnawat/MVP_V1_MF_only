import styles from "./onboarding.module.css";

interface TrustPrimerProps {
  onContinue: () => void;
}

export function TrustPrimer({ onContinue }: TrustPrimerProps) {
  return (
    <div className={styles.container}>
      <h1>Before we start</h1>
      <p>Unifolio only ever reads your portfolio data — nothing is bought, sold, or moved.</p>
      <p>Your CAS data is never sold. You can revoke access at any time.</p>
      <button type="button" onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}
