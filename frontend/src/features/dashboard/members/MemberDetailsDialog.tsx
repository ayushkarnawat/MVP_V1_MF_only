import { useState } from "react";
import { mergeMemberInto } from "../../auth/api";
import type { HouseholdMember } from "../../auth/types";
import { ConfirmLeaveDialog } from "./ConfirmLeaveDialog";
import { DetailsFormDialog, SAVE_FAILED_MESSAGE, useDetailsForm, type DuplicateInfo } from "./memberDetailsForm";
import { OtherAccountDialog } from "./OtherAccountDialog";
import { PossibleDuplicateDialog } from "./PossibleDuplicateDialog";

export interface MemberDetailsDialogProps {
  member: HouseholdMember;
  /** After a successful unlock, or after a merge (then `id` is the member merged into). */
  onUnlocked: (member: Pick<HouseholdMember, "id" | "name">) => void;
  /** Back to dashboard (L6), or leaving after L5. */
  onCancel: () => void;
  /** L5 saved the relationship but the member stays locked; lets the parent reload. */
  onOtherAccount?: () => void;
}

type Stage = "form" | "leave" | "duplicate" | "other";

// Unlock popup (I3). One component owns every stage so typed values survive
// Cancel -> Enter details (L6) and Check the PAN (L4).
export function MemberDetailsDialog({ member, onUnlocked, onCancel, onOtherAccount }: MemberDetailsDialogProps) {
  const form = useDetailsForm(member, "unlock");
  const [stage, setStage] = useState<Stage>("form");
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const onContinue = async () => {
    const outcome = await form.submit();
    if (!outcome) return;
    if (outcome.kind === "ok") onUnlocked(outcome.member);
    else if (outcome.kind === "duplicate") {
      setDuplicate(outcome.info);
      setMergeError(null);
      setStage("duplicate");
    } else if (outcome.kind === "otherAccount") setStage("other");
  };

  const onMerge = async () => {
    if (!duplicate) return;
    setMerging(true);
    setMergeError(null);
    try {
      await mergeMemberInto(member.id, duplicate.otherMemberId);
      onUnlocked({ id: duplicate.otherMemberId, name: duplicate.otherMemberName });
    } catch {
      setMergeError(SAVE_FAILED_MESSAGE);
    } finally {
      setMerging(false);
    }
  };

  return (
    <>
      <DetailsFormDialog
        isOpen={stage === "form"}
        title={`Add ${member.name}’s details`}
        body={`To see ${member.name}’s dashboard, add how they are related to you and their PAN.`}
        values={form.values}
        onChange={form.onChange}
        error={form.error}
        submitting={form.submitting}
        onContinue={onContinue}
        onCancel={() => setStage("leave")}
      />
      <ConfirmLeaveDialog
        isOpen={stage === "leave"}
        memberName={member.name}
        onEnterDetails={() => setStage("form")}
        onBackToDashboard={onCancel}
      />
      {duplicate && (
        <PossibleDuplicateDialog
          isOpen={stage === "duplicate"}
          memberName={member.name}
          otherMemberName={duplicate.otherMemberName}
          fundCount={duplicate.sourceFundCount}
          merging={merging}
          error={mergeError}
          onMerge={onMerge}
          onCheckPan={() => setStage("form")}
        />
      )}
      <OtherAccountDialog
        isOpen={stage === "other"}
        memberName={member.name}
        variant="unlock"
        onOk={() => (onOtherAccount ?? onCancel)()}
      />
    </>
  );
}
