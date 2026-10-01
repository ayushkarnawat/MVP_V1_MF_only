import type { HouseholdMember, ProfileField } from "../../auth/types";

const FIELD_LABEL: Record<ProfileField, string> = {
  pan: "PAN", relationship: "relationship", phone_number: "phone number", email: "email",
};

/** Progress ring + chip (spec mock 1 / 5). The whole chip is the button; at 100% it disappears. */
export function ProfileNudge({ member, onOpen, variant = "header" }: {
  member: HouseholdMember; onOpen: () => void; variant?: "header" | "compact";
}) {
  const pct = member.profile_completion;
  if (pct >= 100) return null;
  const last = member.missing_fields.length === 1 ? member.missing_fields[0] : null;
  // A PAN on another account can't be added here, so never ask for it.
  const ask = last && !(last === "pan" && member.pan_conflict) ? `Add ${FIELD_LABEL[last]}` : "Finish profile";
  const r = 15.9155;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group inline-flex items-center gap-2 rounded-full border border-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] py-1 pl-1 pr-3 text-xs font-semibold text-[var(--color-ink)] hover:bg-[color-mix(in_srgb,var(--color-warning)_24%,transparent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-warning)] cursor-pointer"
    >
      <span role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completion"
        className={variant === "compact" ? "h-5 w-5" : "h-7 w-7"}>
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" className="stroke-[var(--color-border)]" />
          <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${pct}, 100`} className="stroke-[var(--color-warning)]" />
        </svg>
      </span>
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--color-warning)] opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-warning)]" />
      </span>
      <span>{pct}% complete · {ask}</span>
      <span aria-hidden="true" className="text-[var(--color-warning)] transition-transform group-hover:translate-x-0.5">→</span>
    </button>
  );
}
