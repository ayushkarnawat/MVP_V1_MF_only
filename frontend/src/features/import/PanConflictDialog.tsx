import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface PanConflictDialogProps {
  isOpen: boolean;
  message: string;
  secondaryLabel: string;
  onChangeFile: () => void;
  onSecondary: () => void;
}

// Upload-time PAN conflict (see pan_claims.py). Shown right after a file is
// parsed, never on Confirm Import. Copy must never identify another account.
export function PanConflictDialog({
  isOpen,
  message,
  secondaryLabel,
  onChangeFile,
  onSecondary,
}: PanConflictDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onSecondary()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>This PAN already exists</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={onSecondary}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)]"
          >
            {secondaryLabel}
          </button>
          <button
            type="button"
            onClick={onChangeFile}
            className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white"
          >
            Change CAS file
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
