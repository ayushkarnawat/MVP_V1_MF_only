import { Pencil, Trash2, UserMinus } from "lucide-react";
import type { HouseholdMember } from "@/features/auth/types";
import { ProfileNudge } from "@/features/dashboard/members/ProfileNudge";
import { accessLevel } from "../lib/accessLevel";
import { cleanName, relationshipText } from "../lib/memberLabels";
import { InitialsAvatar } from "./InitialsAvatar";
import { PanField } from "./PanField";

export interface MemberCardProps {
  member: HouseholdMember;
  tone: number;
  accountPhone?: string;
  accountEmail?: string | null;
  highlighted?: boolean;
  deleteFundsDisabled: boolean;
  onEdit: () => void;
  onChangeInAccountInfo: () => void;
  onDeleteMember: () => void;
  onDeleteFunds: () => void;
}

export function MemberCard({
  member,
  tone,
  accountPhone,
  accountEmail,
  highlighted = false,
  deleteFundsDisabled,
  onEdit,
  onChangeInAccountInfo,
  onDeleteMember,
  onDeleteFunds,
}: MemberCardProps) {
  const isSelf = member.relationship === "self";
  const name = cleanName(member.name);
  const label = accessLevel(member.relationship);
  const phone = (isSelf ? accountPhone : member.phone_number) || "Not added";
  const email = (isSelf ? accountEmail : member.email) || "Not added";
  const heldElsewhere = Boolean(member.pan_masked) && member.pan_conflict === "other_account";
  const relationship = relationshipText(member);

  return (
    <article
      aria-label={name || "Family member"}
      data-testid="member-card"
      data-member-id={member.id}
      data-highlighted={highlighted ? "true" : "false"}
      className={`rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-4 ${
        highlighted ? "ring-2 ring-[var(--ui-focus)]" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <InitialsAvatar name={member.name} size={40} tone={tone} />
        <div className="min-w-0 flex-1">
          {name ? (
            <p
              data-testid="member-name"
              title={name}
              className="truncate font-heading text-base font-semibold text-[var(--ui-text)]"
            >
              {name}
            </p>
          ) : (
            <p
              data-testid="member-name"
              className="truncate font-heading text-base font-semibold text-[var(--ui-text-muted)]"
            >
              Not added
            </p>
          )}
          {member.name_from_statement ? (
            <p data-testid="name-caption" className="text-xs text-[var(--ui-text-muted)]">
              from your statement
            </p>
          ) : null}
        </div>
        <span
          data-testid="access-pill"
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            label === "Admin"
              ? "bg-[var(--pos-bg)] text-[var(--pos-text)]"
              : "border border-[var(--ui-divider)] bg-[var(--ui-elevated)] text-[var(--ui-text-muted)]"
          }`}
        >
          {label}
        </span>
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <div data-testid="field-pan" className="min-w-0">
          <dt className="text-xs font-medium text-[var(--ui-text-muted)]">PAN</dt>
          <dd className="mt-1 min-w-0">
            <PanField panMasked={member.pan_masked} conflict={heldElsewhere} />
            {heldElsewhere ? (
              <p data-testid="pan-conflict-caption" className="mt-1 text-xs text-[var(--ui-text-muted)]">
                On another Unifolio account
              </p>
            ) : null}
          </dd>
        </div>

        <div data-testid="field-relationship" className="min-w-0">
          <dt className="text-xs font-medium text-[var(--ui-text-muted)]">Relationship</dt>
          <dd className="mt-1 min-w-0">
            <span
              className={`block truncate text-sm ${
                relationship === "Not set"
                  ? "font-normal text-[var(--ui-text-muted)]"
                  : "font-semibold text-[var(--ui-text)]"
              }`}
            >
              {relationship}
            </span>
          </dd>
        </div>

        <div data-testid="field-phone" className="min-w-0">
          <dt className="text-xs font-medium text-[var(--ui-text-muted)]">Phone</dt>
          <dd className="mt-1 min-w-0">
            <span
              className={`block truncate text-sm ${
                phone === "Not added"
                  ? "font-normal text-[var(--ui-text-muted)]"
                  : "font-semibold text-[var(--ui-text)]"
              }`}
            >
              {phone}
            </span>
          </dd>
        </div>

        <div data-testid="field-email" className="min-w-0">
          <dt className="text-xs font-medium text-[var(--ui-text-muted)]">Email</dt>
          <dd className="mt-1 min-w-0">
            <span
              className={`block truncate text-sm ${
                email === "Not added"
                  ? "font-normal text-[var(--ui-text-muted)]"
                  : "font-semibold text-[var(--ui-text)]"
              }`}
            >
              {email}
            </span>
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {isSelf ? (
          <button
            type="button"
            onClick={onChangeInAccountInfo}
            className="text-xs font-semibold text-[var(--pos-text)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
          >
            Change in Account Info
          </button>
        ) : null}
        {member.profile_completion < 100 ? (
          <ProfileNudge member={member} onOpen={onEdit} variant="compact" />
        ) : (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] px-3 py-1.5 text-xs font-medium text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
          >
            <Pencil size={13} aria-hidden="true" />
            <span>Edit profile</span>
          </button>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {!isSelf ? (
            <button
              type="button"
              aria-label={`Delete ${name || "this member"} from your family`}
              onClick={onDeleteMember}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--neg-text)] hover:bg-[var(--neg-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
            >
              <UserMinus size={15} aria-hidden="true" />
              <span>Delete member</span>
            </button>
          ) : null}
          <button
            type="button"
            aria-label={`Delete all funds for ${name || "this member"}`}
            disabled={deleteFundsDisabled}
            onClick={onDeleteFunds}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--neg-text)] hover:bg-[var(--neg-bg)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]"
          >
            <Trash2 size={15} aria-hidden="true" />
            <span>Delete all funds</span>
          </button>
        </span>
      </div>
    </article>
  );
}
