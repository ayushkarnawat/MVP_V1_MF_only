import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./Modal.module.css";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  variant?: "center" | "sheet";
}

export function Modal({ isOpen, onClose, title, children, variant = "center" }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex="0"]') ?? []);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (variant === "sheet" && e.key === "Tab") {
        const targets = focusable();
        const first = targets[0], last = targets[targets.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    // The sheet covers the page on a phone, so the page behind must not scroll with it.
    const previousOverflow = document.body.style.overflow;
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      if (variant === "sheet") {
        focusable()[0]?.focus();
        document.body.style.overflow = "hidden";
      }
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (isOpen && variant === "sheet") document.body.style.overflow = previousOverflow;
      if (isOpen && variant === "sheet" && previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen, onClose, variant]);

  if (!isOpen) return null;

  return (
    <div className={`${styles.backdrop} ${variant === "sheet" ? styles.sheetBackdrop : ""}`} onClick={onClose}>
      <div
        ref={dialogRef}
        className={`${styles.modal} ${variant === "sheet" ? styles.sheet : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
      >
        <div className={styles.header}>
          {title && (
            <h2 id="modal-title" className={`type-h2 ${styles.title}`}>
              {title}
            </h2>
          )}
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close modal"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
