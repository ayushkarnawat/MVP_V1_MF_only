import { useState } from "react";
import { ApiError } from "../../../lib/apiClient";
import { updateMember } from "../../auth/api";
import type { HouseholdMember } from "../../auth/types";
import { initialValues, SAVE_FAILED_MESSAGE, DetailsFormDialog, type DetailsValues } from "./memberDetailsForm";

export interface EditMemberDialogProps {
  member: HouseholdMember;
  onSaved: (member: HouseholdMember) => void;
  onCancel: () => void;
}

const FIELD = "flex h-10 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-ink)]";

// L9: editing an unlocked member. Name and PAN are read-only (they come from the
// statement); relationship, phone and email go through PATCH. Errors stay inline.
export function EditMemberDialog({ member, onSaved, onCancel }: EditMemberDialogProps) {
  const [values, setValues] = useState<DetailsValues>(() => initialValues(member));
  const [phone, setPhone] = useState(member.phone_number ?? "");
  const [email, setEmail] = useState(member.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const clearError = () => error && setError(null);

  const onContinue = async () => {
    if (!values.relationship) return setError("Choose a relationship.");
    if (values.relationship === "other" && !values.label.trim()) return setError("Type how you’re related.");
    setSubmitting(true);
    setError(null);
    try {
      const saved = await updateMember(member.id, {
        relationship: values.relationship,
        relationship_other_label: values.relationship === "other" ? values.label.trim() : null,
        phone_number: phone.trim(),
        email: email.trim(),
      });
      onSaved(saved);
    } catch (err) {
      const p = err instanceof ApiError && err.payload && typeof err.payload === "object" ? (err.payload as { message?: string }) : null;
      setError(p?.message ?? SAVE_FAILED_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DetailsFormDialog
      isOpen
      title={`Edit ${member.name}’s details`}
      member={member}
      values={values}
      onChange={(next) => {
        setValues(next);
        clearError();
      }}
      error={error}
      submitting={submitting}
      submitLabel="Save"
      onContinue={onContinue}
      onCancel={onCancel}
      extraFields={
        <>
          <label className="block text-sm font-medium text-[var(--color-ink)]">
            Phone
            <input
              type="tel"
              className={`${FIELD} mt-1`}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                clearError();
              }}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm font-medium text-[var(--color-ink)]">
            Email
            <input
              type="email"
              className={`${FIELD} mt-1`}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearError();
              }}
              autoComplete="off"
            />
          </label>
        </>
      }
    />
  );
}
