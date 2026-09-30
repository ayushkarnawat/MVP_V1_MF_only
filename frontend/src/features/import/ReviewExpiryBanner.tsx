import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

const WARN_BEFORE_MS = 5 * 60 * 1000;

export const REVIEW_EXPIRY_MESSAGE = "Your review closes in 5 minutes. Confirm imports to save it.";

interface ReviewExpiryBannerProps {
  /** ISO time the server drops the review session (upload + 60 min). */
  expiresAt: string;
}

// C2's early warning: the session lives 60 minutes, the banner shows at 55.
export function ReviewExpiryBanner({ expiresAt }: ReviewExpiryBannerProps) {
  const warnAt = new Date(expiresAt).getTime() - WARN_BEFORE_MS;
  const [due, setDue] = useState(() => Date.now() >= warnAt);

  useEffect(() => {
    const remaining = warnAt - Date.now();
    if (Number.isNaN(remaining)) return;
    if (remaining <= 0) {
      setDue(true);
      return;
    }
    setDue(false);
    // setTimeout caps at ~24.8 days; a 60-minute session is far below that.
    const timer = setTimeout(() => setDue(true), remaining);
    return () => clearTimeout(timer);
  }, [warnAt]);

  if (!due) return null;
  return (
    <div
      role="status"
      className="w-full rounded-2xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-3 flex items-center gap-3 text-sm text-[var(--color-ink)]"
    >
      <Clock aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--color-warning)]" />
      <p className="m-0">{REVIEW_EXPIRY_MESSAGE}</p>
    </div>
  );
}
