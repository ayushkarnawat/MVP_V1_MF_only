import { useState } from "react";
import { Landing } from "./Landing";
import { PhoneEntry } from "./PhoneEntry";
import { OtpVerify } from "./OtpVerify";
import { requestOtp, verifyOtp } from "./api";
import { useAuth } from "./AuthContext";
import { ThemeToggle } from "../../components/ThemeToggle";
import { ApiError } from "../../lib/apiClient";

type Step = "landing" | "phone" | "otp";
type AuthMode = "signup" | "login";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && typeof err.payload === "string") {
    return err.payload;
  }
  return fallback;
}

export function AuthEntryFlow() {
  const { login } = useAuth();
  const [step, setStep] = useState<Step>("landing");
  const [mode, setMode] = useState<AuthMode>("signup");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  const handleStart = (selectedMode: AuthMode = "signup") => {
    setMode(selectedMode);
    setError(null);
    setStep("phone");
  };

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

  return (
    <div className="min-h-dvh w-full bg-[var(--color-bg)] flex flex-col justify-center items-center p-3.5 sm:p-6 lg:p-8 box-border text-left overflow-y-auto relative">
      {/* Light / Dark Theme Toggle */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm sm:max-w-md mx-auto my-auto">
        {step === "landing" && <Landing onContinue={handleStart} />}
        {step === "phone" && (
          <PhoneEntry
            mode={mode}
            onSubmit={handlePhoneSubmit}
            onBack={() => setStep("landing")}
            onToggleMode={(newMode) => setMode(newMode)}
            submitting={submitting}
            error={error}
          />
        )}
        {step === "otp" && (
          <OtpVerify
            phoneNumber={phoneNumber}
            onSubmit={handleOtpSubmit}
            onResend={() => setStep("phone")}
            onBack={() => setStep("phone")}
            submitting={submitting}
            error={error}
            devOtp={devOtp}
          />
        )}
      </div>
    </div>
  );
}
