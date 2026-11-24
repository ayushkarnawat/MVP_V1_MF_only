import { Download } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";
import { cn } from "../../lib/utils";
import "./export-tokens.css";

export interface ExportButtonProps {
  hasData?: boolean;
  busy?: boolean;
  onOpen: () => void;
}

export function ExportButton({ hasData, busy = false, onOpen }: ExportButtonProps) {
  const isDisabled = hasData === false;
  const tipText = isDisabled ? "Add data first" : "Make a PDF report of your portfolio";

  function handleClick() {
    if (isDisabled) return;
    onOpen();
  }

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            data-clickable=""
            data-effect="open"
            aria-label={busy ? "Preparing…" : "Export PDF"}
            aria-busy={busy ? "true" : undefined}
            aria-disabled={isDisabled ? "true" : undefined}
            onClick={handleClick}
            className={cn(
              "rounded-xl border-[var(--shell-border-input)] text-[var(--shell-text)] hover:bg-[var(--shell-page)] focus-visible:ring-[var(--shell-accent)]",
              "gap-[7px] font-body text-[13px] font-semibold",
              "hover:border-[var(--shell-accent)] focus-visible:border-[var(--shell-accent)]",
              "max-[1099px]:min-h-[40px] max-[1099px]:min-w-[40px] max-[1099px]:px-2.5",
              busy && "border-[var(--export-busy-border)]",
              isDisabled && "cursor-not-allowed opacity-60",
            )}
          >
            {busy ? (
              <svg
                data-testid="export-spinner"
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                className="export-spinner shrink-0"
              >
                <circle cx="8" cy="8" r="6" stroke="var(--export-spinner-track)" strokeWidth="2" />
                <path
                  d="M8 2a6 6 0 016 6"
                  stroke="var(--export-green-text)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <Download className="h-[14px] w-[14px] shrink-0" strokeWidth={1.7} aria-hidden="true" />
            )}
            <span className="hidden min-[1100px]:inline">{busy ? "Preparing…" : "Export PDF"}</span>
            {busy && (
              <span className="sr-only" aria-live="polite">
                Preparing your report
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="end"
          className="rounded-[9px] border-0 bg-[var(--shell-tooltip-bg)] px-[11px] py-[8px] font-body text-xs text-[var(--shell-tooltip-text)] shadow-[var(--export-tooltip-shadow)]"
        >
          {tipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
