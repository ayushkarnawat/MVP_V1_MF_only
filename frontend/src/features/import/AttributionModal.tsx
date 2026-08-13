import { useState } from "react";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

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
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger
                id="attribution-member-select"
                className="w-full h-11 gap-1.5 rounded-full border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm font-medium text-[var(--color-ink)] [&>span]:line-clamp-1"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} ({m.relationship})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
