import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "../../components/Button";
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
      <h1 className={styles.title}>What should we call you?</h1>
      <p className={styles.subtitle}>
        We'll use your preferred name e.g. for personalizing your dashboard and portfolio reports.
      </p>

      <div className={styles.field}>
        <label htmlFor="name-input">Your Full Name or First Name</label>
        <input
          id="name-input"
          value={name}
          placeholder="e.g. Ayush Karnawat"
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
      </div>

      <div className={styles.actionsBetween}>
        <div className={styles.actionsLeft}>
          {onBack && (
            <Button variant="ghost" size="sm" type="button" onClick={onBack}>
              Back
            </Button>
          )}
          <Button variant="ghost" size="sm" type="button" onClick={onSkip}>
            Skip
          </Button>
        </div>

        <Button variant="primary" size="md" type="submit" disabled={!name.trim()}>
          Next
        </Button>
      </div>
    </form>
  );
}
