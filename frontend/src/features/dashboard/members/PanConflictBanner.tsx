/** Red banner for a member whose PAN is held by another Unifolio account (spec mock 7). */
export function PanConflictBanner({ memberName }: { memberName: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-[var(--color-negative)] bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] px-4 py-3 text-sm text-[var(--color-ink)]">
      <span aria-hidden="true" className="grid h-5 w-5 flex-none place-items-center rounded-full bg-[var(--color-negative)] text-xs font-bold text-[var(--color-bg)]">!</span>
      <div>
        <p className="font-semibold">{memberName}’s PAN is on another Unifolio account</p>
        <p className="text-[var(--color-text-secondary)]">You can see their funds here, but their profile can’t be completed on your account. Contact support if this is a mistake.</p>
      </div>
    </div>
  );
}
