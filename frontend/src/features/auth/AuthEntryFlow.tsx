import { useState } from "react";
import { Landing } from "./Landing";
import { PhoneEntry } from "./PhoneEntry";
import { OtpVerify } from "./OtpVerify";
import { requestOtp, verifyOtp } from "./api";
import { useAuth } from "./AuthContext";
import { ApiError } from "../../lib/apiClient";

type Step = "landing" | "phone" | "otp";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && typeof err.payload === "string") {
    return err.payload;
  }
  return fallback;
}

export function AuthEntryFlow() {
  const { login } = useAuth();
  const [step, setStep] = useState<Step>("landing");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  const handlePhoneSubmit = async (phone: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestOtp(phone);
      setPhoneNumber(phone);
      setDevOtp(result.otp);
      setStep("otp");
    } catch (err) {
      setError(errorMessage(err, "Couldn't send the code. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOtpSubmit = async (otp: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await verifyOtp(phoneNumber, otp);
      await login(result.session_token);
    } catch (err) {
      setError(errorMessage(err, "That code didn't work. Try again."));
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "landing") {
    return <Landing onContinue={() => setStep("phone")} />;
  }
  if (step === "phone") {
    return <PhoneEntry onSubmit={handlePhoneSubmit} submitting={submitting} error={error} />;
  }
  return (
    <OtpVerify
      phoneNumber={phoneNumber}
      onSubmit={handleOtpSubmit}
      onResend={() => setStep("phone")}
      submitting={submitting}
      error={error}
      devOtp={devOtp}
    />
  );
}
