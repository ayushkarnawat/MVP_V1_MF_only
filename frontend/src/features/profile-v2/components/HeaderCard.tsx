import { Pencil } from "lucide-react";
import type { HouseholdMember, MeResponse } from "@/features/auth/types";
import { accountType } from "../lib/accountType";
import { memberSince } from "../lib/memberSince";
import { InitialsAvatar } from "./InitialsAvatar";
import { PanField } from "./PanField";

export type HouseholdStatus = "loading" | "ready" | "error";

export interface HeaderCardProps {
  me: MeResponse;
  members: readonly HouseholdMember[];
  status: HouseholdStatus;
  onEditProfile: () => void;
}

export function HeaderCard({
  me,
  members,
  status,
  onEditProfile,
}: HeaderCardProps) {
  const name = me.self_name?.trim() || me.email || me.phone_number;
  const self =
    status === "ready"
      ? members.find(member => member.relationship === "self")
      : undefined;
  const since = memberSince(me.created_at);

  const panCell =
    status === "loading" ? (
      <span
        data-testid="pan-loading"
        aria-busy="true"
        className="mt-1 block h-4 w-24 animate-pulse rounded bg-[var(--ui-divider)]"
      />
    ) : !self ? (
      <span
        data-testid="pan-unavailable"
        className="text-sm text-[var(--ui-text-muted)]"
      >
        Not available
      </span>
    ) : (
      <PanField
        panMasked={self.pan_masked}
        conflict={self.pan_conflict === "other_account"}
      />
    );

  const typeCell =
    status === "loading" ? (
      <span
        data-testid="account-type-loading"
        aria-busy="true"
        className="mt-1 block h-4 w-24 animate-pulse rounded bg-[var(--ui-divider)]"
      />
    ) : status === "ready" && members.length > 0 ? (
      <p className="mt-1 text-sm font-semibold text-[var(--ui-text)]">
        {accountType(members.length)}
      </p>
    ) : null;

  return (
    <section
      data-testid="profile-header-card"
      className="rounded-[14px] border border-[var(--ui-divider)] bg-[var(--ui-elevated)] p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <InitialsAvatar name={name} size={76} />
          <div className="min-w-0">
            <p
              data-testid="profile-name"
              className="truncate font-heading text-xl font-semibold text-[var(--ui-text)]"
            >
              {name}
            </p>
            {me.email ? (
              <p
                data-testid="profile-email"
                className="truncate text-sm text-[var(--shell-text-body)]"
              >
                {me.email}
              </p>
            ) : null}
            <p
              data-testid="profile-phone"
              className="truncate text-sm text-[var(--shell-text-body)]"
            >
              {me.phone_number}
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={!self}
          onClick={onEditProfile}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-card)] px-4 py-2 text-sm font-medium text-[var(--ui-text)] hover:bg-[var(--ui-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pencil size={14} aria-hidden="true" />
          Edit Profile
        </button>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <div
          data-testid="fact-pan"
          className="min-w-0 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] px-4 py-3"
        >
          <dt className="text-xs font-medium text-[var(--ui-text-muted)]">
            PAN
          </dt>
          <dd className="mt-1">{panCell}</dd>
        </div>

        {typeCell !== null ? (
          <div
            data-testid="fact-account-type"
            className="min-w-0 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] px-4 py-3"
          >
            <dt className="text-xs font-medium text-[var(--ui-text-muted)]">
              Account type
            </dt>
            <dd>{typeCell}</dd>
          </div>
        ) : null}

        {since !== null ? (
          <div
            data-testid="fact-member-since"
            className="min-w-0 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] px-4 py-3"
          >
            <dt className="text-xs font-medium text-[var(--ui-text-muted)]">
              Member since
            </dt>
            <dd className="mt-1 text-sm font-semibold text-[var(--ui-text)]">
              {since}
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
