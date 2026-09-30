// Copy that is not tied to one dialog. Every string is verbatim from the
// catalogue cards in Docs/orchestration/cas-member-detection-map.html (curly ’
// per preflight F17; they/their instead of he/his per F37).

/** A person with no PAN on the statement shows this wherever a masked PAN would. */
export const NO_PAN_LABEL = "(PAN not on statement)";

export function panOrPlaceholder(masked: string | null | undefined): string {
  return masked ? masked : NO_PAN_LABEL;
}

/** U4 "The one I entered": the message the upload form shows after the session is discarded. */
export function uploadStatementShowingMessage(enteredPanMasked: string, memberName: string): string {
  return `Upload a statement that shows ${enteredPanMasked} for ${memberName}`;
}

/** U8 note on a cross-account person once "Include in family total" is chosen. */
export const OTHER_ACCOUNT_DASHBOARD_NOTE = "Their own dashboard stays with their account";

/** "A", "A and B", "A, B and C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export const PRIMARY_BTN =
  "rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white";
export const SECONDARY_BTN =
  "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)]";
