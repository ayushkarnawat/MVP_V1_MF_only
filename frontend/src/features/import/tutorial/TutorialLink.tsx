import * as React from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { TUTORIAL_COPY } from "./tutorialCopy";

export interface TutorialLinkProps {
  onOpen: () => void;
  className?: string;
  disabled?: boolean;
}

export const TutorialLink = React.forwardRef<HTMLButtonElement, TutorialLinkProps>(
  ({ onOpen, className, disabled = false }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onOpen}
        disabled={disabled}
        aria-label={TUTORIAL_COPY.linkAccessibleName}
        data-testid="tutorial-open-link"
        className={cn(
          "group inline-flex items-center gap-1.5 rounded-md bg-transparent px-1 py-1 text-left text-xs sm:text-[13px] font-semibold text-[var(--pos-text)] transition-opacity hover:opacity-85 active:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ui-elevated)] disabled:pointer-events-none disabled:text-[var(--ui-disabled-text)] motion-reduce:transition-none cursor-pointer",
          className
        )}
      >
        <Play
          className="h-3.5 w-3.5 shrink-0 fill-current text-[var(--pos)] transition-transform group-hover:translate-x-[1px] motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
          aria-hidden="true"
        />
        <span className="border-b border-[var(--pos-text)]/40 pb-[1px] group-hover:border-[var(--pos-text)]">
          {TUTORIAL_COPY.linkLabel}
        </span>
        <span className="text-[11px] font-medium text-[var(--ui-text-muted)]">
          {TUTORIAL_COPY.linkDuration}
        </span>
      </button>
    );
  }
);

TutorialLink.displayName = "TutorialLink";
