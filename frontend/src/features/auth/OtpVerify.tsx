import { useState } from "react";
import type { FormEvent } from "react";
import styles from "./onboarding.module.css";

interface OtpVerifyProps {
  phoneNumber: string;
  onSubmit: (otp: string) => void;
  onResend: () => void;
  submitting: boolean;
  error: string | null;
  devOtp: string | null;
}

export function OtpVerify({ phoneNumber, onSubmit, onResend, submitting, error, devOtp }: OtpVerifyProps) {
  const [otp, setOtp] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(otp);
  };

  return (
    <form className={styles.container} onSubmit={handleSubmit}>
      <h1>Enter the code we sent to {phoneNumber}</h1>
      {devOtp && <p className={styles.hint}>Dev mode OTP: {devOtp}</p>}
      <label className={styles.field}>
        6-digit code
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={otp}
          onChange={(event) => setOtp(event.target.value)}
        />
      </label>
      {error && <p className={styles.error}>{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Verifying..." : "Verify"}
      </button>
      <button type="button" onClick={onResend}>
        Resend code
      </button>
    </form>
  );
}
