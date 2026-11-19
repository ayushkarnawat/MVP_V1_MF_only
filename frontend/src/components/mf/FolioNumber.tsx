import { useEffect, useRef, useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { maskFolio, useFolioVisibility } from "@/lib/folioVisibility";

export interface FolioNumberProps {
  /** The full folio number as first printed. */
  value: string;
  /** Show a Copy button beside the number (the fund page rows only). */
  showCopy?: boolean;
}

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]";

export function FolioNumber({ value, showCopy = false }: FolioNumberProps) {
  const { hidden, toggle } = useFolioVisibility();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const shown = typeof value !== "string" ? "" : hidden ? maskFolio(value) : value;

  const handleCopy = async () => {
    if (hidden) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setCopyState("idle");
      }, 2000);
    } catch {
      setCopyState("failed");
    }
  };

  // A response without folio_number (a newer front end on an older back end) shows nothing instead of crashing the page.
  if (typeof value !== "string") return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {showCopy && copyState === "copied" && (
        <span role="status" className="text-xs font-normal text-[var(--pos-text)]">
          Copied
        </span>
      )}
      {showCopy && copyState === "failed" && (
        <span role="alert" className="text-xs font-normal text-[var(--neg-text)]">
          Couldn't copy the folio number.
        </span>
      )}
      <span className="font-mono [overflow-wrap:anywhere]">{shown}</span>
      {showCopy && (
        <button
          type="button"
          aria-label={`Copy folio number ${shown}`}
          aria-disabled={hidden ? "true" : undefined}
          title={hidden ? "Show the number to copy it" : "Copies the full number"}
          onClick={handleCopy}
          className={`inline-flex h-[22px] w-[22px] items-center justify-center rounded-md text-[var(--ui-text-muted)] ${
            hidden
              ? "opacity-40 cursor-not-allowed"
              : "hover:text-[var(--ui-text)]"
          } ${FOCUS_RING}`}
        >
          {copyState === "copied" ? (
            <Check size={14} aria-hidden="true" />
          ) : (
            <Copy size={14} aria-hidden="true" />
          )}
        </button>
      )}
      <button
        type="button"
        aria-label={hidden ? "Show folio numbers" : "Hide folio numbers"}
        aria-pressed={hidden}
        data-clickable=""
        data-effect="switch"
        onClick={toggle}
        className={`inline-flex h-[22px] w-[22px] items-center justify-center rounded-md border border-[var(--ui-disabled-border)] bg-[var(--ui-elevated)] text-[var(--ui-text-muted)] hover:bg-[var(--ui-row-hover)] hover:text-[var(--ui-text)] ${FOCUS_RING}`}
      >
        {hidden ? (
          <EyeOff size={14} aria-hidden="true" />
        ) : (
          <Eye size={14} aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
