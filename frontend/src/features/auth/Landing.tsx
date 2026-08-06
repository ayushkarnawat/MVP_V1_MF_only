import styles from "./onboarding.module.css";

interface LandingProps {
  onContinue: () => void;
}

export function Landing({ onContinue }: LandingProps) {
  return (
    <div className={styles.container}>
      <h1>Unifolio</h1>
      <p>Track every mutual fund you own, in one place.</p>
      <div className={styles.actions}>
        <button type="button" onClick={onContinue}>
          Sign Up
        </button>
        <button type="button" onClick={onContinue}>
          Log In
        </button>
      </div>
    </div>
  );
}
