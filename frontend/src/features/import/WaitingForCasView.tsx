import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { UploadForm } from "./UploadForm";
import type { UploadSurface } from "@/features/legal/panDisclaimerStore";
import { cancelImportRequest } from "./api";
import { Clock, AlertTriangle, Loader2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TutorialDialog } from "./tutorial/TutorialDialog";
import { TutorialLink } from "./tutorial/TutorialLink";
import { useTutorialPlayer } from "./tutorial/useTutorialPlayer";

interface WaitingForCasViewProps {
  passwordError?: string;
  serverFileError?: string;
  importId: string;
  onCancelled: () => void;
  // Required: every upload goes through the parse -> review flow (M18).
  onUploadSubmit: (file: File, password: string) => void;
  surface?: UploadSurface;
  hideCancel?: boolean;
  uploadOpen?: boolean;
}

export function WaitingForCasView({
  passwordError, serverFileError,
  importId,
  onCancelled,
  onUploadSubmit,
  surface,
  hideCancel = false,
  uploadOpen = false,
}: WaitingForCasViewProps) {
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(uploadOpen);
  const shouldReduceMotion = useReducedMotion();
  const tutorialLinkRef = useRef<HTMLButtonElement | null>(null);
  const tutorial = useTutorialPlayer();

  useEffect(() => {
    if (uploadOpen) setIsUploadOpen(true);
  }, [uploadOpen]);

  const handleCancel = async () => {
    setIsCancelling(true);
    setError(null);
    try {
      await cancelImportRequest(importId);
      onCancelled();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to cancel request.");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleUpload = (file: File, password: string) => {
    setError(null);
    onUploadSubmit(file, password);
  };

  return (
    <div className="space-y-4 w-full text-left">
      {/* Waiting Status Card */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] border border-[color-mix(in_srgb,var(--color-accent)_20%,transparent)] shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-full bg-[var(--color-surface)] text-[var(--color-accent)] flex items-center justify-center shadow-2xs flex-shrink-0">
              <Clock className="h-3.5 w-3.5 animate-pulse" />
            </div>
            <span className="font-display font-bold text-sm sm:text-base text-[var(--color-ink)]">
              Waiting for CAMS email
            </span>
          </div>

          {!hideCancel && (
            <Button
              data-clickable="" data-effect="close"
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              disabled={isCancelling}
              className="text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-negative)] hover:bg-[var(--color-surface)] h-8 px-3 rounded-lg cursor-pointer min-h-[36px]"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  <span>Cancelling...</span>
                </>
              ) : (
                <span>Cancel request</span>
              )}
            </Button>
          )}
        </div>

        <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
          CAMS usually sends your statement within 5–10 minutes. Once it lands in your inbox, come back here to finish importing — you don&apos;t need to keep this tab open.
        </p>
      </div>

      {/* Error Notice */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 p-3 rounded-xl bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_30%,transparent)] text-xs text-[var(--color-negative)] font-medium"
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Collapsed Disclosure for Immediate Upload */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs overflow-hidden">
        <button
          type="button"
          data-clickable="" data-effect="expand"
          onClick={() => setIsUploadOpen((prev) => !prev)}
          aria-expanded={isUploadOpen}
          className="w-full p-4 sm:p-4.5 flex items-center justify-between gap-3 text-left hover:bg-[var(--color-bg)]/50 transition-colors cursor-pointer min-h-[44px]"
        >
          <span className="font-display font-semibold text-xs sm:text-sm text-[var(--color-ink)]">
            Already got the email? Upload it now {isUploadOpen ? "↑" : "↓"}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-[var(--color-text-secondary)] transition-transform duration-200",
              isUploadOpen && "rotate-180"
            )}
          />
        </button>

        <AnimatePresence initial={false}>
          {isUploadOpen && (
            <motion.div
              initial={shouldReduceMotion ? { opacity: 1 } : { height: 0, opacity: 0 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden border-t border-[var(--color-border)]/60"
            >
              <div className="p-2 sm:p-4">
                <UploadForm onSubmit={handleUpload} surface={surface} passwordError={passwordError} serverFileError={serverFileError} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-start px-1">
        <TutorialLink ref={tutorialLinkRef} onOpen={tutorial.show} />
      </div>

      <TutorialDialog
        open={tutorial.open}
        onOpenChange={(next) => (next ? tutorial.show() : tutorial.hide())}
        autoPlay={tutorial.autoPlay}
        src={tutorial.src}
        returnFocusRef={tutorialLinkRef}
      />
    </div>
  );
}
