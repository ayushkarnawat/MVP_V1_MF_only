import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PromptDialogProps {
  isOpen: boolean;
  title: string;
  /** Description text; omit when the body is custom children. */
  body?: string;
  /** Called for ×, Escape and outside click: each dialog names its own "way out". */
  onClose: () => void;
  children?: ReactNode;
  footer: ReactNode;
}

// Shared shell for the upload-time and review dialogs (U1-U7, U12, U13, C1-C3).
export function PromptDialog({ isOpen, title, body, onClose, children, footer }: PromptDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {body !== undefined && <DialogDescription>{body}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter className="gap-2">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
