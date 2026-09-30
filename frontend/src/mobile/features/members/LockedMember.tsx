import type { HouseholdMember } from "@/features/auth/types";
import { MemberDetailsDialog } from "@/features/dashboard/members/MemberDetailsDialog";
import { OtherAccountDialog } from "@/features/dashboard/members/OtherAccountDialog";

/** A CAS-detected person stays locked until their details are added (or their PAN is on another account). */
export const isMemberLocked = (m: HouseholdMember) => Boolean(m.lock_reason) || Boolean(m.details_required);

/** Locked people have no relationship yet, so the "(null)" suffix must not appear. */
export const memberLabel = (m: HouseholdMember) => (m.relationship ? `${m.name} (${m.relationship})` : m.name);

export const ADD_DETAILS_FIRST = "Add details first";

/** First person whose reads work: a locked person's dashboard data is a 403. */
export const firstOpenMember = (members: HouseholdMember[]) => members.find((m) => !isMemberLocked(m)) ?? members[0];

interface LockedMemberDialogsProps {
  /** The locked person the user just picked, or null. */
  member: HouseholdMember | null;
  /** Unlocked (or merged into `id`): the parent reloads members and selects them. */
  onUnlocked: (member: Pick<HouseholdMember, "id" | "name">) => void;
  onClose: () => void;
  /** L5: relationship saved but the member stays locked; lets the parent reload. */
  onOtherAccount?: () => void;
}

/** Mobile twin of the desktop dropdown behaviour: unlock popup (I3), or L8 for a person on another account. */
export function LockedMemberDialogs({ member, onUnlocked, onClose, onOtherAccount }: LockedMemberDialogsProps) {
  if (!member) return null;
  if (member.lock_reason === "pan_on_other_account") {
    return <OtherAccountDialog isOpen memberName={member.name} variant="picked" onOk={onClose} />;
  }
  return (
    <MemberDetailsDialog
      key={member.id}
      member={member}
      onUnlocked={onUnlocked}
      onCancel={onClose}
      onOtherAccount={() => {
        onClose();
        onOtherAccount?.();
      }}
    />
  );
}
