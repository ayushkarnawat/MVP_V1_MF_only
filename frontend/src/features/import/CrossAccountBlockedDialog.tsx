import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export interface CrossAccountBlockedDialogProps {
  isOpen: boolean;
  message: string;
  onBack: () => void;
}

// Renders the hard-block backend sends when a CAS's PAN already belongs to a
// different Unifolio account. There is deliberately no "continue anyway" —
// this block has no override on the backend, so the popup doesn't offer one
// either. Any way of dismissing it (the X, clicking outside, or the Back
// button) routes through the same onBack, since staying on the review screen
// serves no purpose once this fires.
export function CrossAccountBlockedDialog({ isOpen, message, onBack }: CrossAccountBlockedDialogProps) {
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
