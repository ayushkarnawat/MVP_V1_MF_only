import { Button } from "@/components/ui/button";
import { ShieldCheck, Mail, Phone } from "lucide-react";
import { GoogleButton } from "./GoogleButton";

interface LandingProps {
  onSelectPhone: () => void;
  onSelectEmail: () => void;
  onGoogleCredential: (idToken: string) => void;
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.4-2.8-1.239-1.8-2.246-4.6-2.246-7.27 0-4.27 2.782-6.54 5.52-6.54 1.377 0 2.523.91 3.39.91.83 0 2.11-.96 3.68-.96.6 0 2.746.05 4.16 2.09-.107.07-2.483 1.45-2.483 4.44 0 3.55 3.13 4.8 3.19 4.83z" />
    </svg>
  );
}

export function Landing({ onSelectPhone, onSelectEmail, onGoogleCredential }: LandingProps) {
  return (
    <div className="w-full max-w-sm sm:max-w-md mx-auto p-5 sm:p-8 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)]/80 shadow-lg space-y-6 text-center box-border animate-in fade-in zoom-in-95 duration-200">
      {/* 1. Refined Brand Header with Official Unifolio Arc Mark */}
      <div className="space-y-2.5">
        <div className="mx-auto h-10 w-10 rounded-xl bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-accent)_24%,transparent)] text-[var(--color-accent)] flex items-center justify-center">
          <svg
            viewBox="0 0 100 100"
            className="w-5 h-5 text-[var(--color-accent)] fill-none stroke-current stroke-[14] stroke-linecap-round"
            aria-label="Unifolio Logo Mark"
          >
            <path d="M 50 10 A 40 40 0 0 1 90 50" />
          </svg>
        </div>
        <div className="space-y-1">
          <h1 className="font-display font-bold text-xl sm:text-2xl text-[var(--color-ink)] tracking-tight">
            Unifolio
          </h1>
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed max-w-xs mx-auto">
            Log in or sign up to track your investments in one place.
          </p>
        </div>
      </div>

      {/* 2. Four equal entry points — confirmed order: Google, Apple
          (disabled), Email, Phone. No separate Sign Up/Log In screen:
          every method transparently handles new-vs-existing on the
          backend, exactly like phone already did. */}
      <div className="space-y-2.5">
        <GoogleButton onCredential={onGoogleCredential} />

        <Button
          type="button"
          variant="outline"
          disabled
          className="w-full h-11 sm:h-12 rounded-xl border border-[var(--color-border)] bg-transparent text-[var(--color-text-secondary)] font-semibold text-xs sm:text-sm gap-2 min-h-[44px] sm:min-h-[48px] cursor-not-allowed opacity-60"
        >
          <AppleLogo />
          <span>Continue with Apple</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-secondary)]">
            Coming soon
          </span>
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={onSelectEmail}
          className="w-full h-11 sm:h-12 rounded-xl border border-[var(--color-border)] bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-bg)] font-semibold text-xs sm:text-sm gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px]"
        >
          <Mail className="h-4 w-4" />
          <span>Continue with Email</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={onSelectPhone}
          className="w-full h-11 sm:h-12 rounded-xl border border-[var(--color-border)] bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-bg)] font-semibold text-xs sm:text-sm gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[44px] sm:min-h-[48px]"
        >
          <Phone className="h-4 w-4" />
          <span>Continue with Phone</span>
        </Button>
      </div>

      {/* 3. Trust & Security Footer */}
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--color-text-secondary)] pt-1 select-none">
        <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-accent)]" />
        <span>256-bit encrypted · Read-only access · No spam</span>
      </div>
    </div>
  );
}
