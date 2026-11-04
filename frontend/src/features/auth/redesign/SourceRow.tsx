import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { IconBadge } from "./IconBadge";

export interface SourceRowProps {
  title: string;
  description: string;
  comingSoon: boolean;
  selected: boolean;
  icon?: ReactNode;
  onSelect?: () => void;
}

/** One source on the Connect accounts screen. A "Coming soon" row is drawn but ignores clicks and keys (design Q14). */
export function SourceRow({ title, description, comingSoon, selected, icon, onSelect }: SourceRowProps) {
  const content = (
    <>
      {icon ? <IconBadge icon={icon} tone="strong" /> : null}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-[var(--auth-ink)]">{title}</span>
          {comingSoon ? (
            <span className="shrink-0 whitespace-nowrap rounded-full bg-[#F1F3F5] px-2.5 py-0.5 text-[11px] font-medium text-[var(--auth-muted)]">
              Coming soon
            </span>
          ) : null}
        </span>
        <span className="block text-[13px] text-[var(--auth-muted)]">{description}</span>
      </span>
      <ChevronRight size={18} aria-hidden="true" data-testid="source-chevron" className="ml-auto shrink-0 text-[var(--auth-muted)]" />
    </>
  );

  if (comingSoon) {
    return (
      <div
        role="radio"
        aria-checked={false}
        aria-disabled="true"
        className="auth-choice flex w-full cursor-not-allowed items-center gap-3.5 rounded-2xl px-4 min-h-[calc(var(--auth-row-h)-6px)] text-left"
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="auth-choice flex w-full items-center gap-3.5 rounded-2xl px-4 min-h-[calc(var(--auth-row-h)-6px)] text-left"
    >
      {content}
    </button>
  );
}
