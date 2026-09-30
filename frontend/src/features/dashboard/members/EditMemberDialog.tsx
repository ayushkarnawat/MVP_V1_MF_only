import type { HouseholdMember } from "../../auth/types";
import { DetailsFormDialog, useDetailsForm } from "./memberDetailsForm";

export interface EditMemberDialogProps {
  member: HouseholdMember;
  onSaved: (member: HouseholdMember) => void;
  onCancel: () => void;
}

// L9: editing an unlocked member. Errors stay inline and the member stays unlocked.
export function EditMemberDialog({ member, onSaved, onCancel }: EditMemberDialogProps) {
  const form = useDetailsForm(member, "edit");
  const onContinue = async () => {
    const outcome = await form.submit();
    if (outcome?.kind === "ok") onSaved(outcome.member);
  };
  return (
    <DetailsFormDialog
      isOpen
      title={`Edit ${member.name}’s details`}
      values={form.values}
      onChange={form.onChange}
      error={form.error}
      submitting={form.submitting}
      panPlaceholder={member.pan_masked ?? undefined}
      submitLabel="Save"
      onContinue={onContinue}
      onCancel={onCancel}
    />
  );
}
