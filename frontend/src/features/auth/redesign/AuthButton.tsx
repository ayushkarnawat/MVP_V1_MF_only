import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowRight } from "lucide-react";

export interface AuthButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  /** "primary" is the green pill with a trailing arrow; "quiet" is the grey pill (Get code via call). */
  tone?: "primary" | "quiet";
  /** An icon drawn before the label (the quiet pill shows a phone). */
  leading?: ReactNode;
  /** The trailing arrow of the primary pill; switch it off while the button is busy. */
  arrow?: boolean;
}

/** The auth screens' own pill button (the .auth-btn classes in auth-tokens.css). Not the shared Button: the shared one is for the app. */
export function AuthButton({ children, tone = "primary", leading, arrow = true, className = "", type = "button", ...rest }: AuthButtonProps) {
  return (
    <button type={type} className={`${tone === "primary" ? "auth-btn" : "auth-btn-quiet"} ${className}`} {...rest}>
      {leading ? <span aria-hidden="true" className="flex">{leading}</span> : null}
      <span>{children}</span>
      {tone === "primary" && arrow ? <ArrowRight size={19} aria-hidden="true" data-testid="auth-btn-arrow" /> : null}
    </button>
  );
}
