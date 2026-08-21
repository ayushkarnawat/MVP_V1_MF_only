import { useRef, useEffect } from "react";
import type { ChangeEvent, KeyboardEvent, ClipboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  autoFocus = true,
  disabled = false,
  id = "otp-input",
  className,
}: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Split the value into individual characters per cell
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  const focusInput = (index: number) => {
    const target = inputRefs.current[Math.max(0, Math.min(length - 1, index))];
    target?.focus();
    target?.select();
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>, index: number) => {
    const inputValue = e.target.value;
    const cleaned = inputValue.replace(/\D/g, "");

    if (!cleaned) {
      // Input was cleared (e.g. via delete/select)
      const nextDigits = [...digits];
      nextDigits[index] = "";
      onChange(nextDigits.join("").trimEnd());
      return;
    }

    if (cleaned.length > 1) {
      // Multi-character entry (e.g. auto-fill, test firing change with full code)
      const pasted = cleaned.slice(0, length);
      onChange(pasted);
      const nextFocus = Math.min(pasted.length, length - 1);
      focusInput(nextFocus);
      return;
    }

    const nextDigits = [...digits];
    nextDigits[index] = cleaned;
    const nextValue = nextDigits.join("");
    onChange(nextValue);

    // Auto-advance to next cell
    if (index < length - 1) {
      focusInput(index + 1);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Backspace") {
      if (digits[index]) {
        // Clear current cell
        const nextDigits = [...digits];
        nextDigits[index] = "";
        onChange(nextDigits.join("").trimEnd());
      } else if (index > 0) {
        // Move to previous cell and clear it
        const nextDigits = [...digits];
        nextDigits[index - 1] = "";
        onChange(nextDigits.join("").trimEnd());
        focusInput(index - 1);
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft" && index > 0) {
      focusInput(index - 1);
      e.preventDefault();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      focusInput(index + 1);
      e.preventDefault();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (pastedData) {
      onChange(pastedData);
      const nextFocus = Math.min(pastedData.length, length - 1);
      focusInput(nextFocus);
    }
  };

  return (
    <div className={cn("flex items-center justify-between gap-1.5 xs:gap-2 sm:gap-2.5 w-full max-w-full px-0.5 py-0.5 box-border", className)}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          id={index === 0 ? id : `${id}-${index}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digit}
          disabled={disabled}
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={index === 0 ? undefined : `Digit ${index + 1} of ${length}`}
          onChange={(e) => handleInputChange(e, index)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            "flex-1 min-w-0 h-11 xs:h-12 sm:h-14 max-w-[44px] sm:max-w-[48px] text-center text-lg xs:text-xl sm:text-2xl font-bold font-mono rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20 transition-all selection:bg-transparent shadow-2xs box-border",
            digit && "border-[var(--color-accent)]/50 bg-[var(--color-surface)]",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        />
      ))}
    </div>
  );
}
