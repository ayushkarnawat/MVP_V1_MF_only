import { useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { INFO_GLYPH_CLASS } from "./infoGlyph";

export interface InfoPopoverProps {
  label: string;
  title?: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  trigger?: ReactElement;
}

export function InfoPopover({ label, title, children, side = "bottom", trigger }: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  const suppressFocus = useRef(false);
  const titleId = useId();

  function clearTimer() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  function preview() {
    clearTimer();
    timer.current = setTimeout(() => { setOpen(true); }, 250);
  }

  function leave() {
    clearTimer();
    if (!pinned.current) {
      timer.current = setTimeout(() => {
        restoreFocus.current = false;
        setOpen(false);
      }, 100);
    }
  }

  function pin() {
    clearTimer();
    pinned.current = true;
    setOpen(true);
  }

  return (
    <Popover.Root open={open} onOpenChange={nextOpen => {
      clearTimer();
      if (!nextOpen) {
        pinned.current = false;
        restoreFocus.current = true;
      }
      setOpen(nextOpen);
    }}>
      <Popover.Trigger
        asChild
        ref={triggerRef}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-clickable=""
        data-effect="open"
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pos)]"
        onMouseEnter={preview}
        onMouseLeave={leave}
        onFocus={() => {
          if (!suppressFocus.current) {
            clearTimer();
            setOpen(true);
          }
        }}
        onBlur={event => {
          if (!pinned.current && !(event.relatedTarget instanceof Node && contentRef.current?.contains(event.relatedTarget))) {
            clearTimer();
            restoreFocus.current = false;
            setOpen(false);
          }
        }}
        onClick={event => {
          event.preventDefault();
          pin();
        }}
        onKeyDown={event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            pin();
          }
        }}
      >
        {trigger ?? (
          <button
            type="button"
            data-clickable=""
            className={INFO_GLYPH_CLASS}
          >
            i
          </button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          ref={contentRef}
          side={side}
          sideOffset={4}
          collisionPadding={8}
          aria-label={title ? undefined : label}
          aria-labelledby={title ? titleId : undefined}
          className="z-50 w-[calc(100vw-1rem)] max-w-[20rem] max-h-[60vh] overflow-y-auto bg-[var(--ui-elevated)] text-[var(--ui-text)] border border-[var(--ui-divider)] rounded-xl shadow-lg px-4 py-3 text-xs leading-relaxed"
          onMouseEnter={clearTimer}
          onMouseLeave={leave}
          onOpenAutoFocus={event => { event.preventDefault(); }}
          onCloseAutoFocus={event => {
            event.preventDefault();
            if (restoreFocus.current) {
              suppressFocus.current = true;
              triggerRef.current?.focus();
              suppressFocus.current = false;
              restoreFocus.current = false;
            }
          }}
        >
          {title && <h3 id={titleId} className="text-[var(--ui-text)] text-xs font-semibold mb-1">{title}</h3>}
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
