import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface BenchmarkInfoNoteProps {
  /** The backend's explanatory note text. Never written by the frontend. */
  note?: string | null;
  className?: string;
}

export function BenchmarkInfoNote({ note, className }: BenchmarkInfoNoteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipId = useId();
  // On a phone a tap fires mouseenter and focus (which open the note) and THEN click. A plain toggle on that
  // click would close it again at once, so a click right after an open by hover or focus keeps it open.
  const openedAt = useRef(0);
  const open = () => {
    openedAt.current = Date.now();
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!note || note.trim() === "") {
    return null;
  }

  // Hover and focus are tracked on the wrapper, which contains the note, so the pointer can travel from the
  // icon onto the note (and select its text) without closing it. The note's padded top edge touches the icon,
  // so there is no gap to cross. The note is focusable (tabIndex -1) so pressing on its text is not a blur.
  return (
    <span
      className={cn("relative inline-flex items-center align-middle", className)}
      onMouseEnter={open}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={open}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setIsOpen(false);
      }}
    >
      <button
        type="button"
        aria-label="Benchmark note"
        aria-describedby={tooltipId}
        data-testid="benchmark-info-icon"
        onClick={() => {
          if (isOpen && Date.now() - openedAt.current < 600) return;
          setIsOpen((prev) => !prev);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setIsOpen(false);
            e.stopPropagation();
          }
        }}
        className="inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-[var(--ui-divider)] text-[10px] font-semibold text-[var(--ui-text-muted)] hover:border-[var(--ui-text-muted)] hover:text-[var(--ui-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ui-focus)]"
      >
        <span aria-hidden="true">i</span>
      </button>

      {/* w-max: without a width the note would shrink to the 16px wrapper and wrap one word per line. */}
      <span
        id={tooltipId}
        role="tooltip"
        tabIndex={-1}
        data-testid="benchmark-note-tooltip"
        hidden={!isOpen}
        className={cn(
          "absolute left-0 top-full z-50 block w-max max-w-[min(20rem,calc(100vw-3rem))] pt-1 outline-none",
          !isOpen && "hidden"
        )}
      >
        <span className="block rounded-md border border-[var(--ui-divider)] bg-[var(--ui-card)] p-2 text-xs leading-relaxed text-[var(--ui-text)] shadow-lg">
          {note}
        </span>
      </span>
    </span>
  );
}
