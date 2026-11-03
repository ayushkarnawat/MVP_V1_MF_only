export interface SourceRowProps {
  title: string;
  description: string;
  comingSoon: boolean;
  selected: boolean;
  onSelect?: () => void;
}

/** One source on the Connect accounts screen. A "Coming soon" row is drawn but ignores clicks and keys (design Q14). */
export function SourceRow({ title, description, comingSoon, selected, onSelect }: SourceRowProps) {
  const body = (
    <>
      <span className="flex-1">
        <span className="block text-sm font-semibold text-[var(--ui-text)]">{title}</span>
        <span className="mt-0.5 block text-xs text-[var(--ui-text-muted)]">{description}</span>
      </span>
      {comingSoon ? (
        <span className="shrink-0 rounded-full bg-[var(--ui-divider)] px-2.5 py-1 text-[11px] font-medium text-[var(--ui-text-muted)]">Coming soon</span>
      ) : null}
    </>
  );
  if (comingSoon) {
    return (
      <div role="radio" aria-checked={false} aria-disabled="true" className="flex w-full cursor-not-allowed items-center gap-3 rounded-2xl border border-[var(--ui-divider)] bg-white/60 p-3.5 text-left opacity-70">
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--auth-step-on)] ${
        selected ? "border-[var(--auth-step-on)] bg-[var(--auth-step-on)]/10" : "border-[var(--ui-divider)] bg-white"
      }`}
    >
      {body}
    </button>
  );
}
