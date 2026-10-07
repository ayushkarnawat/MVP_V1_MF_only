import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { acceptedFor, isConsentRequired } from "../legal/api";
import type { AcceptedDocument } from "../legal/types";
import { ConsentNotice } from "../legal/ConsentNotice";
import { useLegalDocuments } from "../legal/useLegalDocuments";

export function PendingDeletionScreen({
  deletionScheduledAt,
  reactivate,
}: {
  deletionScheduledAt: string;
  reactivate: (accepted: AcceptedDocument[]) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { docs, error: docsError, refetch } = useLegalDocuments();
  const deletionDate = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(deletionScheduledAt));

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4 text-[var(--color-ink)]">
      <section className="w-full max-w-lg space-y-5 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)] p-7 text-center shadow-xs sm:p-10">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] text-[var(--color-warning)]">
          <RotateCcw className="h-5 w-5" />
        </div>
        <h1 className="font-display text-2xl font-bold">Account deletion scheduled</h1>
        <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
          Your account is scheduled for deletion on <strong className="text-[var(--color-ink)]">{deletionDate}</strong>.
        </p>
        {/* 2026-10-07: clicking Reactivate is the agreement; no tick box. */}
        <ConsentNotice lead="By reactivating" loadError={docsError} onRetry={() => void refetch()} />
        <button
          type="button"
          disabled={pending || !docs}
          onClick={async () => {
            setPending(true);
            setError(null);
            try {
              await reactivate(acceptedFor(docs ?? [], ["terms_of_service", "privacy_policy"]));
            } catch (err) {
              if (isConsentRequired(err)) {
                // Terms changed since this page loaded: pick up the new versions and re-ask.
                await refetch();
                setError("Our terms were just updated. Please review them and tap Reactivate again.");
              } else {
                setError("Could not reactivate your account. Please try again.");
              }
              setPending(false);
            }
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" />
          {pending ? "Reactivating…" : "Reactivate"}
        </button>
        {error ? <p role="alert" className="text-sm text-[var(--color-negative)]">{error}</p> : null}
      </section>
    </main>
  );
}
