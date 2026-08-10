import { useState } from "react";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";

interface CandidateMember {
  id: string;
  name: string;
  relationship: string;
}

interface AttributionModalProps {
  isOpen: boolean;
  matchedMemberName: string;
  matchedMemberId: string;
  candidates: CandidateMember[];
  onConfirm: (memberId: string) => void;
  onCancel: () => void;
}

export function AttributionModal({
  isOpen,
  matchedMemberName,
  matchedMemberId,
  candidates,
  onConfirm,
  onCancel,
}: AttributionModalProps) {
  const [selectedId, setSelectedId] = useState<string>(matchedMemberId);

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="Confirm Family Member">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <p className="type-body" style={{ color: "var(--color-text-secondary)", margin: 0 }}>
          This looks like <strong>{matchedMemberName}'s statement</strong>. Would you like to import it for {matchedMemberName} instead?
        </p>

        {candidates.length > 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <label htmlFor="attribution-member-select" className="type-caption" style={{ color: "var(--color-text-muted)" }}>
              Assign to Household Member:
            </label>
            <select
              id="attribution-member-select"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              style={{
                padding: "var(--space-3)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-text-primary)",
                fontFamily: "inherit",
              }}
            >
              {candidates.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.relationship})
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onConfirm(selectedId)}>
            Import for {candidates.find((c) => c.id === selectedId)?.name || matchedMemberName}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
