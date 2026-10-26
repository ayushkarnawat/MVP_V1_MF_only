import { useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "../../components/ui/button";

export function MiraComingSoonDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const previousFocus = useRef<HTMLElement | null>(null);
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--shell-text)] opacity-20" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--shell-divider)] bg-[var(--shell-card)] p-6 font-body text-[var(--shell-text)] shadow-lg"
        onOpenAutoFocus={() => { previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
        onCloseAutoFocus={event => { event.preventDefault(); previousFocus.current?.focus(); }}>
        <Dialog.Title className="font-heading text-xl font-semibold">Ask Mira</Dialog.Title>
        <Dialog.Description className="my-4 text-sm text-[var(--shell-text-body)]">Mira is coming soon. Your portfolio assistant will be here to help.</Dialog.Description>
        <Dialog.Close asChild><Button variant="outline" className="border-[var(--shell-border-input)] text-[var(--shell-text)] hover:bg-[var(--shell-page)] focus-visible:ring-[var(--shell-accent)]">Close</Button></Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
