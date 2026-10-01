import { useEffect, useState } from "react";
import { getMyConsents, type MyConsent } from "../legal/api";
import { LegalDocumentModal } from "../legal/LegalDocumentModal";
import type { LegalDocument } from "../legal/types";
import { useLegalDocuments } from "../legal/useLegalDocuments";
import { formatDate } from "./ImportHistorySection";

// Order shown to the user; the PAN disclaimer is only agreed at the first upload.
const ORDER = ["terms_of_service", "privacy_policy", "pan_disclaimer"] as const;

export function TermsSection() {
  const { docs, error, refetch } = useLegalDocuments();
  const [consents, setConsents] = useState<MyConsent[] | null>(null);
  const [consentsFailed, setConsentsFailed] = useState(false);
  const [viewing, setViewing] = useState<LegalDocument | null>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    getMyConsents()
      .then((rows) => {
        if (!active) return;
        setConsents(rows);
        setConsentsFailed(false);
      })
      .catch(() => active && setConsentsFailed(true));
    return () => { active = false; };
  }, [attempt]);

  const retryConsents = () => {
    setConsentsFailed(false);
    setConsents(null);
    setAttempt((n) => n + 1);
  };

  const ordered = docs ? ORDER.flatMap((t) => docs.filter((d) => d.document_type === t)) : [];

  return (
    <section className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs sm:p-6">
      <h2 className="font-display text-lg font-semibold">Terms of Service</h2>
      {error && (
        <p role="alert" className="text-sm text-[var(--color-negative)]">
          Could not load the documents.{" "}
          <button type="button" onClick={() => void refetch()} className="font-semibold underline">Retry</button>
        </p>
      )}
      {consentsFailed && (
        <p role="alert" className="text-sm text-[var(--color-negative)]">
          We couldn’t load your agreements.{" "}
          <button type="button" onClick={retryConsents} className="font-semibold underline">Retry</button>
        </p>
      )}
      {!docs && !error && <p className="text-sm text-[var(--color-text-secondary)]">Loading documents…</p>}
      <ul className="divide-y divide-[var(--color-border)]">
        {ordered.map((doc) => {
          const given = consents?.find((c) => c.document_type === doc.document_type);
          return (
            <li key={doc.document_type} className="flex items-center gap-4 py-3 first:pt-1 last:pb-1">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{doc.title}</p>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  {consentsFailed
                    ? null
                    : consents === null
                      ? "Checking…"
                      : given
                        ? `You agreed to version ${given.document_version} on ${formatDate(given.recorded_at)}`
                        : "Not agreed yet"}
                </p>
              </div>
              <button
                type="button"
                aria-label={`View ${doc.title}`}
                onClick={() => setViewing(doc)}
                className="text-sm font-semibold text-[var(--color-accent)] hover:underline"
              >
                View
              </button>
            </li>
          );
        })}
      </ul>
      <LegalDocumentModal doc={viewing} onClose={() => setViewing(null)} />
    </section>
  );
}
