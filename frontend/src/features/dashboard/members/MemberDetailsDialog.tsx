import { useState } from "react";
import { mergeMemberInto } from "../../auth/api";
import type { HouseholdMember } from "../../auth/types";
import { ConfirmLeaveDialog } from "./ConfirmLeaveDialog";
import {
  DetailsFormDialog,
  SAVE_FAILED_MESSAGE,
  useDetailsForm,
  type DuplicateInfo,
  type SubmitOutcome,
} from "./memberDetailsForm";
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
  /** Unused since L3 was removed; callers may still pass it. */
  onUploadDifferent?: () => void;
}

type Stage = "form" | "leave" | "duplicate" | "other";

// Unlock popup (I3). One component owns every stage so typed values survive
// Cancel -> Enter details (L6) and Check the PAN (L4).
export function MemberDetailsDialog({
  member, onUnlocked, onCancel, onOtherAccount,
}: MemberDetailsDialogProps) {
  const form = useDetailsForm(member, "unlock");
  const [stage, setStage] = useState<Stage>("form");
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const handleOutcome = (outcome: SubmitOutcome | null) => {
    if (!outcome) return;
    if (outcome.kind === "ok") onUnlocked(outcome.member);
    else if (outcome.kind === "duplicate") {
      setDuplicate(outcome.info);
      setMergeError(null);
      setStage("duplicate");
    } else if (outcome.kind === "otherAccount") setStage("other");
  };

  const onContinue = async () => handleOutcome(await form.submit());

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
        body={
          member.pan_on_statement
            ? `To see ${member.name}’s dashboard, add how they are related to you.`
            : `To see ${member.name}’s dashboard, add how they are related to you and their PAN.`
        }
        member={member}
        showPanInput={!member.pan_on_statement}
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
          sourcePanLabel={duplicate.sourcePanLabel}
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
