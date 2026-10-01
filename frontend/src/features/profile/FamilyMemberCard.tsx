import { Trash2 } from "lucide-react";
import { RELATIONSHIP_OPTIONS } from "../auth/relationships";
import type { HouseholdMember } from "../auth/types";

interface FamilyMemberCardProps {
  member: HouseholdMember;
  /** The account holder's own phone/email, shown read-only on the self card. */
  accountPhone?: string;
  accountEmail?: string | null;
  deleteDisabled: boolean;
  onEdit: () => void;
  onCompleteDetails: () => void;
  onDeleteFunds: () => void;
}

const NOT_ADDED = "Not added";

function relationshipText(m: HouseholdMember): string {
  if (m.relationship === "self") return "Me";
  if (m.relationship === "other") return m.relationship_other_label?.trim() || "Other";
  return RELATIONSHIP_OPTIONS.find((o) => o.value === m.relationship)?.label ?? NOT_ADDED;
}

function Field({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--color-text-secondary)]">{label}</dt>
      <dd className="truncate text-sm font-semibold">{value}</dd>
      {caption && <p className="text-xs font-normal text-[var(--color-text-secondary)]">{caption}</p>}
    </div>
  );
}

export function FamilyMemberCard({
  member: m, accountPhone, accountEmail, deleteDisabled, onEdit, onCompleteDetails, onDeleteFunds,
}: FamilyMemberCardProps) {
  const isSelf = m.relationship === "self";
  const locked = !!m.lock_reason || m.details_required;
  const phone = isSelf ? accountPhone || NOT_ADDED : m.phone_number || NOT_ADDED;
  const email = isSelf ? accountEmail || NOT_ADDED : m.email || NOT_ADDED;

  return (
    <article aria-label={m.name} className="space-y-4 rounded-lg border border-[var(--color-border)] p-4">
      <dl className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" value={m.name} caption={m.name_from_statement ? "from your statement" : undefined} />
        <Field label="PAN" value={m.pan_masked ?? "Not on your statement"} />
        {!locked && <Field label="Relationship" value={relationshipText(m)} />}
        <Field label="Phone" value={phone} />
        <Field label="Email" value={email} />
      </dl>
      <div className="flex flex-wrap items-center gap-3">
        {isSelf ? (
          <span className="text-xs text-[var(--color-text-secondary)]">Change in Account Info</span>
        ) : locked ? (
          <button
            type="button"
            onClick={onCompleteDetails}
            className="text-sm font-semibold text-[var(--color-accent)] hover:underline"
          >
            Complete details
          </button>
        ) : (
          <button
            type="button"
            aria-label={`Edit ${m.name}`}
            onClick={onEdit}
            className="text-sm font-semibold text-[var(--color-accent)] hover:underline"
          >
            Edit
          </button>
        )}
        <button
          type="button"
          aria-label={`Delete all funds for ${m.name}`}
          disabled={deleteDisabled}
          onClick={onDeleteFunds}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--color-negative)] disabled:opacity-50 hover:bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)]"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Delete all funds
        </button>
      </div>
    </article>
  );
}
