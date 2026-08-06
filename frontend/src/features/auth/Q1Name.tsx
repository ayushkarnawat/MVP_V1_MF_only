import { useState } from "react";
import type { FormEvent } from "react";
import styles from "./onboarding.module.css";

interface Q1NameProps {
  value: string;
  onBack?: () => void;
  onSkip: () => void;
  onSubmit: (name: string) => void;
}

export function Q1Name({ value, onBack, onSkip, onSubmit }: Q1NameProps) {
  const [name, setName] = useState(value);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(name);
  };

  return (
    <form className={styles.container} onSubmit={handleSubmit}>
      <h1>What should we call you?</h1>
      <label className={styles.field}>
        What should we call you?
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <div className={styles.actions}>
        {onBack && (
          <button type="button" onClick={onBack}>
            Back
          </button>
        )}
        <button type="button" onClick={onSkip}>
          Skip
        </button>
        <button type="submit">Next</button>
      </div>
    </form>
  );
}
