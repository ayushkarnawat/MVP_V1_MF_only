import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "../../components/Button";
import styles from "./onboarding.module.css";

interface PhoneEntryProps {
  onSubmit: (phoneNumber: string) => void;
  submitting: boolean;
  error: string | null;
}

export function PhoneEntry({ onSubmit, submitting, error }: PhoneEntryProps) {
  const [phoneNumber, setPhoneNumber] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(phoneNumber);
  };

  return (
    <form className={styles.container} onSubmit={handleSubmit}>
      <h1 className={styles.title}>Welcome to Unifolio</h1>
      <p className={styles.subtitle}>
        Enter your mobile number to sign up or log in. No spam, ever.
      </p>

      <div className={styles.field}>
        <label htmlFor="phone-input">Mobile Number</label>
        <div className={styles.phoneInputGroup}>
          <span className={styles.countryCode}>🇮🇳 +91</span>
          <input
            id="phone-input"
            type="tel"
            placeholder="98765 43210"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            className="type-data"
            autoFocus
          />
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actionsRight}>
        <Button variant="primary" size="lg" type="submit" disabled={submitting || !phoneNumber.trim()}>
          {submitting ? "Sending OTP..." : "Send Verification Code →"}
        </Button>
      </div>
    </form>
  );
}
