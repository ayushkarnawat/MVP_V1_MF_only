import { toParagraphs } from "./LegalDocumentModal";
import type { LegalDocumentType } from "./types";
import { useLegalDocuments } from "./useLegalDocuments";

const BY_PATH: Record<string, LegalDocumentType> = {
  "/legal/terms": "terms_of_service",
  "/legal/privacy": "privacy_policy",
};

export function legalTypeForPath(pathname: string): LegalDocumentType | null {
  return BY_PATH[pathname.replace(/\/+$/, "")] ?? null;
}

// Public page opened in a new tab from the sign-up line (no login needed:
// /legal/documents is public). Same text as the in-app document popup.
export function LegalPage({ type }: { type: LegalDocumentType }) {
  const { docs, error, refetch } = useLegalDocuments();
  const doc = docs?.find((d) => d.document_type === type) ?? null;
  const body = doc ? toParagraphs(doc.content, doc.title) : null;

  return (
    <main className="min-h-dvh bg-[var(--color-bg)] px-4 py-10 text-[var(--color-ink)] sm:py-16">
      <article className="mx-auto max-w-2xl space-y-5 font-body">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">Unifolio</p>
        {error && (
          <p role="alert" className="text-sm text-[var(--color-negative)]">
            Couldn’t load this page. Check your connection and{" "}
            <button type="button" onClick={() => void refetch()} className="font-semibold underline">
              try again
            </button>
            .
          </p>
        )}
        {!doc && !error && <p className="text-sm text-[var(--color-text-secondary)]">Loading…</p>}
        {doc && body && (
          <>
            <header className="space-y-1">
              <h1 className="font-display text-3xl font-bold tracking-tight">{doc.title}</h1>
              <p className="text-xs text-[var(--color-text-secondary)]">Version {doc.version}</p>
            </header>
            {body.heading && <h2 className="font-semibold">{body.heading}</h2>}
            <div className="space-y-4 text-[15px] leading-7 text-[var(--color-text-secondary)]">
              {body.paragraphs.map((p, i) => (
                <p key={i} className="whitespace-pre-line">
                  {p}
                </p>
              ))}
            </div>
          </>
        )}
      </article>
    </main>
  );
}
