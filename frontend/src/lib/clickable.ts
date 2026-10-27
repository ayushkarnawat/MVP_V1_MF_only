// frontend/src/lib/clickable.ts

/**
 * Click affordance class strings for interactive elements.
 * The element itself must also have tabIndex={0}, a button role, and Enter/Space handling;
 * these strings only style it.
 */

const FOCUS_RING = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-focus)]";

export const CLICK_CARD = `cursor-pointer border border-[var(--ui-divider)] transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-px hover:border-[var(--ui-border-hover)] hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${FOCUS_RING}`;

export const CLICK_ROW = `cursor-pointer transition-colors duration-150 hover:bg-[var(--ui-row-hover)] motion-reduce:transition-none ${FOCUS_RING}`;

export const CLICK_FIGURE = `cursor-pointer underline decoration-dotted decoration-[var(--ui-text-muted)] underline-offset-4 hover:decoration-[var(--ui-text)] ${FOCUS_RING}`;

export const DISABLED = "cursor-not-allowed border border-[var(--ui-disabled-border)] text-[var(--ui-disabled-text)] hover:translate-y-0 hover:shadow-none";
