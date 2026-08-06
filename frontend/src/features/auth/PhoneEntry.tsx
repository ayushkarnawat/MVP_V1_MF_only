import { useState } from "react";
import type { FormEvent } from "react";
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
      <h1>Enter your phone number</h1>
      <label className={styles.field}>
        Phone number
        <input
          type="tel"
          value={phoneNumber}
          onChange={(event) => setPhoneNumber(event.target.value)}
        />
      </label>
      {error && <p className={styles.error}>{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Sending..." : "Send OTP"}
      </button>
    </form>
  );
}
