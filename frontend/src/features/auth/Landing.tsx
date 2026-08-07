import { Button } from "../../components/Button";
import styles from "./onboarding.module.css";

interface LandingProps {
  onContinue: () => void;
}

export function Landing({ onContinue }: LandingProps) {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Unifolio</h1>
      <p className={styles.subtitle}>
        Track every mutual fund you own, in one place. Direct vs Regular comparison, real gains, and family aggregation.
      </p>
      <div className={styles.actions}>
        <Button variant="primary" onClick={onContinue}>
          Sign Up
        </Button>
        <Button variant="secondary" onClick={onContinue}>
          Log In
        </Button>
      </div>
    </div>
  );
}
