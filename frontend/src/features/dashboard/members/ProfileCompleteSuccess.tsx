import { useEffect } from "react";
import { PRIMARY_BTN } from "../../import/prompts/copy";
import { PromptDialog } from "../../import/prompts/PromptDialog";

/** Success state after the last profile field is filled (spec mock 6). Returns on press or after 2.5 s. */
export function ProfileCompleteSuccess({ isOpen, memberName, onDone }: { isOpen: boolean; memberName: string; onDone: () => void }) {
  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(onDone, 2500);
    return () => window.clearTimeout(t);
  }, [isOpen, onDone]);
  return (
    <PromptDialog
      isOpen={isOpen}
      title={`${memberName}’s profile is complete`}
      body="Their details are saved and show in Account → Family members."
      onClose={onDone}
      hideClose
      footer={<button type="button" className={PRIMARY_BTN} onClick={onDone}>Back to dashboard</button>}
    >
      <div className="flex flex-col items-center gap-3 py-2">
        <svg viewBox="0 0 36 36" className="h-20 w-20" aria-hidden="true">
          <circle cx="18" cy="18" r="15.9155" fill="none" strokeWidth="2.5" className="stroke-[var(--color-accent)] motion-safe:[stroke-dasharray:100] motion-safe:animate-[ring-draw_600ms_ease-out_both]" />
          <path d="M11 18.5l4.5 4.5L25 13.5" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="stroke-[var(--color-accent)]" />
        </svg>
        <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-secondary)]">Name · PAN · Relationship · Phone · Email</span>
      </div>
    </PromptDialog>
  );
}
