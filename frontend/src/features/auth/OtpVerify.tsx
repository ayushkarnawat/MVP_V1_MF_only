import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "../../components/Button";
import styles from "./onboarding.module.css";

interface OtpVerifyProps {
  phoneNumber: string;
  onSubmit: (otp: string) => void;
  onResend: () => void;
  submitting: boolean;
  error: string | null;
  devOtp: string | null;
}

export function OtpVerify({
  phoneNumber,
  onSubmit,
  onResend,
  submitting,
  error,
  devOtp,
}: OtpVerifyProps) {
  const [otp, setOtp] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(otp);
  };

  return (
    <form className={styles.container} onSubmit={handleSubmit}>
      <h1 className={styles.title}>Verify your number</h1>
      <p className={styles.subtitle}>
        We sent a 6-digit verification code to <strong>{phoneNumber}</strong>
      </p>

      {devOtp && (
        <div className={styles.devOtpBadge}>
          <span>🔑 Local Dev OTP:</span> <strong>{devOtp}</strong>
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="otp-input">Verification Code</label>
        <input
          id="otp-input"
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="• • • • • •"
          value={otp}
          onChange={(event) => setOtp(event.target.value)}
          className={`type-data-large ${styles.otpInput}`}
          autoFocus
        />
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actionsBetween}>
        <Button variant="ghost" size="sm" type="button" onClick={onResend}>
          Resend code
        </Button>
        <Button
          variant="primary"
          size="md"
          type="submit"
          disabled={submitting || otp.length < 4}
        >
          {submitting ? "Verifying..." : "Verify & Continue →"}
        </Button>
      </div>
    </form>
  );
}
