import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { joinNames } from "./prompts/copy";

export interface CrossAccountBlockedDialogProps {
  isOpen: boolean;
  message: string;
  onBack: () => void;
  /**
   * U7: when given, the dialog offers "Include in family total" (option B) and
   * uses the catalogue copy; without it the legacy hard block is unchanged.
   */
  onInclude?: () => void;
  /** Names of the people in the file (details.people); used by the U7 body. */
  people?: string[];
}

// Renders the hard-block backend sends when a CAS's PAN already belongs to a
// different Unifolio account. There is deliberately no "continue anyway" —
// this block has no override on the backend, so the popup doesn't offer one
// either. Any way of dismissing it (the X, clicking outside, or the Back
// button) routes through the same onBack, since staying on the review screen
// serves no purpose once this fires.
export function CrossAccountBlockedDialog({ isOpen, message, onBack, onInclude, people = [] }: CrossAccountBlockedDialogProps) {
  if (onInclude) {
    const who = people.length > 0 ? joinNames(people) : "Someone";
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onBack()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>This statement belongs to another Unifolio account</DialogTitle>
            <DialogDescription>
              {`${who} already track${people.length === 1 || people.length === 0 ? "s" : ""} these funds in their own Unifolio account.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={onBack}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)]"
            >
              Upload a different file
            </button>
            <button
              type="button"
              onClick={onInclude}
              className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white"
            >
              Include in family total
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onBack()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import blocked</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white"
          >
            Back
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
