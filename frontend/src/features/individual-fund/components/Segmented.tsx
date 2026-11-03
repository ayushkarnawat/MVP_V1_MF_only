import { useState } from "react";
import { Info } from "lucide-react";
import { Portal as TooltipPortal } from "@radix-ui/react-tooltip";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface SegmentedOption<V extends string> {
  value: V;
  label: string;
  /** A plain-words explanation shown by a small info button next to the label. */
  info?: string;
}

export interface SegmentedProps<V extends string> {
  label: string;
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
}

// Controlled open, so the note also works from the keyboard and on touch (hover, focus and click all open it).
function InfoButton({ label, info }: { label: string; info: string }) {
  const [open, setOpen] = useState(false);
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`About ${label}`}
            aria-expanded={open}
            data-clickable=""
            data-effect="expand"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen(true);
            }}
            className="ml-0.5 mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
          >
            <Info size={12} aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent className="max-w-72">{info}</TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}

export function Segmented<V extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedProps<V>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex flex-wrap items-center rounded-lg bg-[var(--ui-hover)] p-0.5"
    >
      {options.map((option) => {
        const isPressed = option.value === value;
        return (
          <span key={option.value} className="inline-flex items-center">
            <button
              type="button"
              aria-pressed={isPressed}
              onClick={() => {
                if (option.value !== value) {
                  onChange(option.value);
                }
              }}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                isPressed
                  ? "bg-[var(--ui-text)] text-[var(--ui-page)] shadow-sm"
                  : "text-[var(--ui-text-muted)] hover:text-[var(--ui-text)]"
              }`}
            >
              {option.label}
            </button>
            {option.info ? <InfoButton label={option.label} info={option.info} /> : null}
          </span>
        );
      })}
    </div>
  );
}
