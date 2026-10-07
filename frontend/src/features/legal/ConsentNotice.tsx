import type { ReactNode } from "react";

const LINK_CLASS =
  "font-semibold text-[#22C55E] hover:underline focus-visible:outline-none focus-visible:underline";

export const LEGAL_PATHS = { terms_of_service: "/legal/terms", privacy_policy: "/legal/privacy" } as const;

interface ConsentNoticeProps {
  /** Shown before the links, e.g. "By continuing" or "By reactivating". */
  lead?: string;
  /** Set when loading the documents failed; the button can't send versions. */
  loadError?: boolean;
  onRetry?: () => void;
  className?: string;
}

// 2026-10-07: replaces the tick box. Clicking the button below/next to this
// line is the agreement; the versions are sent with that click. The links
// open the full text in a new tab (public /legal/* pages).
export function ConsentNotice({ lead = "By continuing", loadError, onRetry, className = "" }: ConsentNoticeProps) {
  const link = (href: string, text: ReactNode) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
      {text}
    </a>
  );
  return (
    <div className={`space-y-1 font-body text-center ${className}`}>
      <p className="text-xs leading-5 text-[#5C5C5C] dark:text-[#A3A3A3]">
        {lead}, you agree to our {link(LEGAL_PATHS.terms_of_service, "Terms & Conditions")} and{" "}
        {link(LEGAL_PATHS.privacy_policy, "Privacy Policy")}.
      </p>
      {loadError && (
        <p role="alert" className="text-xs text-[var(--color-negative)]">
          Couldn’t load our terms. Check your connection and try again.{" "}
          {onRetry && (
            <button type="button" onClick={onRetry} className={LINK_CLASS}>
              Retry
            </button>
          )}
        </p>
      )}
    </div>
  );
}
