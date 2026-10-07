import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "../auth/AuthContext";
import { PromptDialog } from "../import/prompts/PromptDialog";
import { acceptedFor, submitReconsent } from "./api";
import { ConsentNotice } from "./ConsentNotice";
import type { LegalDocumentType } from "./types";
import { useLegalDocuments } from "./useLegalDocuments";

export function ReconsentGate({ children }: { children: ReactNode }) {
  const { me, refreshMe } = useAuth();
  const { docs, error: loadError, refetch } = useLegalDocuments();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outdated = (me?.consent_outdated ?? []) as LegalDocumentType[];
  if (outdated.length === 0) return <>{children}</>;

  const agree = async () => {
    if (!docs) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitReconsent(acceptedFor(docs, outdated));
      await refreshMe();
    } catch {
      setError("Couldn’t save your agreement. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Blocking on purpose: no close action, so Escape / outside click do nothing. */}
      <PromptDialog
        isOpen
        title="We’ve updated our Terms"
        body="Please review and agree to continue using Unifolio."
        onClose={() => {}}
        hideClose
        footer={
          <Button type="button" disabled={!docs || submitting} onClick={() => void agree()}>
            Agree
          </Button>
        }
      >
        {/* 2026-10-07: clicking Agree is the agreement; no tick box. */}
        <ConsentNotice lead="By tapping Agree" loadError={loadError} onRetry={() => void refetch()} />
        {error && (
          <p role="alert" className="text-xs text-[var(--color-negative)]">
            {error}
          </p>
        )}
      </PromptDialog>
    </>
  );
}
