import { Modal } from "@/components/Modal";
import type { Fact } from "../types";

export interface EvidenceDialogProps {
  fact: Fact | null;
  onClose: () => void;
}

export function EvidenceDialog({ fact, onClose }: EvidenceDialogProps) {
  if (!fact) return null;

  const hasEvidence = Boolean(fact.evidence && fact.evidence.length > 0);

  return (
    <Modal isOpen onClose={onClose} title="Evidence">
      {hasEvidence && (
        <dl className="divide-y divide-[var(--ui-divider)]">
          {fact.evidence.map((item) => (
            <div
              key={`${item.label}|${item.value}`}
              data-testid="evidence-row"
              className="flex justify-between gap-3 py-2 text-sm"
            >
              <dt className="text-[var(--ui-text-muted)]">{item.label}</dt>
              <dd className="font-semibold text-[var(--ui-text)]">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p
        data-testid="evidence-text"
        className="mt-3 text-sm text-[var(--ui-text-muted)]"
      >
        {fact.text}
      </p>
    </Modal>
  );
}
