import { Check } from "lucide-react";
import type { MyConsent } from "@/features/legal/api";
import { formatDate } from "@/features/profile/ImportHistorySection";

export interface ConsentListProps {
  status: "loading" | "ready" | "error";
  consents: readonly MyConsent[];
  onRetry: () => void;
}

const DOCUMENT_RANK: Record<string, number> = {
  terms_of_service: 0,
  privacy_policy: 1,
  pan_disclaimer: 2,
};

function consentName(documentType: string): string {
  if (documentType === "terms_of_service") return "Terms of Service";
  if (documentType === "privacy_policy") return "Privacy Policy";
  if (documentType === "pan_disclaimer") return "PAN disclaimer";
  const spaced = documentType.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function ConsentList({ status, consents, onRetry }: ConsentListProps) {
  const sortedConsents = [...consents]
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((a, b) => {
      const rankA = DOCUMENT_RANK[a.item.document_type] ?? 3;
      const rankB = DOCUMENT_RANK[b.item.document_type] ?? 3;
      if (rankA !== rankB) return rankA - rankB;
      return a.originalIndex - b.originalIndex;
    })
    .map(({ item }) => item);

  return (
    <section
      data-testid="consents-card"
      className="rounded-[14px] border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 shadow-sm"
    >
      <h2 className="font-heading text-lg font-semibold text-[var(--ui-text)]">
        Your consents
      </h2>
      <p className="mt-1 text-sm text-[var(--shell-text-body)]">
        What you agreed to, and when.
      </p>

      {status === "loading" ? (
        <div data-testid="consents-loading" aria-busy="true" className="mt-4 space-y-2">
          <div className="h-5 animate-pulse rounded bg-[var(--ui-card)]" />
          <div className="h-5 animate-pulse rounded bg-[var(--ui-card)]" />
        </div>
      ) : status === "error" ? (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--neg-text)]">
          <span>Could not load your consents.</span>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
          >
            Retry
          </button>
        </div>
      ) : sortedConsents.length === 0 ? (
        <p data-testid="consents-empty" className="mt-4 text-sm text-[var(--ui-text-muted)]">
          No consents recorded.
        </p>
      ) : (
        <ul aria-label="Agreed documents" className="mt-4 divide-y divide-[var(--ui-divider)]">
          {sortedConsents.map((consent) => {
            const name = consentName(consent.document_type);
            const date = Number.isNaN(new Date(consent.recorded_at).getTime())
              ? null
              : formatDate(consent.recorded_at);
            return (
              <li
                key={`${consent.document_type}-${consent.document_version}`}
                data-testid="consent-row"
                className="flex flex-wrap items-center gap-3 py-3"
              >
                <Check size={16} aria-hidden="true" className="shrink-0 text-[var(--pos-text)]" />
                <span className="min-w-0 flex-1">
                  <span data-testid="consent-name" className="text-sm font-semibold text-[var(--ui-text)]">
                    {name}
                  </span>{" "}
                  <span data-testid="consent-version" className="text-xs text-[var(--ui-text-muted)]">
                    Version {consent.document_version}
                  </span>
                  {consent.version_label ? (
                    <>
                      {" "}
                      <span data-testid="consent-version-label" className="text-xs text-[var(--ui-text-muted)]">
                        {consent.version_label}
                      </span>
                    </>
                  ) : null}
                </span>
                {date ? (
                  <span data-testid="consent-date" className="text-xs text-[var(--ui-text-muted)]">
                    agreed {date}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
