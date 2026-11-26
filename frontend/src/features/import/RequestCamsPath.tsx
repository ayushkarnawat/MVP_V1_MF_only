import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { getCamsLink, requestCamsStatement } from "./api";
import { setCasResumeStep2 } from "./casResumeState";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ExternalLink,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  ListChecks,
} from "lucide-react";
import { staggerContainerVariants, staggerItemVariants } from "@/lib/motion";
import { TutorialDialog } from "./tutorial/TutorialDialog";
import { TutorialLink } from "./tutorial/TutorialLink";
import { useTutorialPlayer } from "./tutorial/useTutorialPlayer";
import { useCamsChecklist } from "./checklist/useCamsChecklist";
import { getChecklistStore } from "./checklist/checklistStore";
import { CamsChecklistHost, CamsChecklistHostedContext } from "./checklist/CamsChecklistHost";
import { checklistCopy } from "./checklist/checklistCopy";
import { CHECKLIST_OFF_BODY, CHECKLIST_OFF_TITLE, CHECKLIST_TURN_ON } from "./pendingCopy";
import "./checklist/checklist-tokens.css";

export interface RequestCamsPathProps {
  memberId: string;
  onBack?: () => void;
  onRequestInitiated: (importId: string, expiresAt: string) => void;
}

export function RequestCamsPath({
  memberId,
  onBack,
  onRequestInitiated,
}: RequestCamsPathProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tutorialLinkRef = useRef<HTMLButtonElement | null>(null);
  const tutorial = useTutorialPlayer();
  const checklist = useCamsChecklist(memberId);
  const checklistStore = getChecklistStore(memberId);
  const checklistHosted = useContext(CamsChecklistHostedContext);
  const [withoutChecklist, setWithoutChecklist] = useState(false);
  const [camsUrl, setCamsUrl] = useState<string | null>(null);
  const [linkState, setLinkState] = useState<"loading" | "ready" | "failed">("loading");
  const requesting = useRef(false);

  useEffect(() => {
    let active = true;
    getCamsLink()
      .then((url) => {
        if (!active) return;
        setCamsUrl(url);
        setLinkState("ready");
      })
      .catch(() => {
        if (!active) return;
        setLinkState("failed");
      });
    return () => {
      active = false;
    };
  }, []);

  const sendRequest = useCallback(async (options: { openTab: boolean }) => {
    if (requesting.current) return;
    requesting.current = true;
    setIsLoading(true);
    setError(null);
    if (!withoutChecklist) checklist.setCamsLink({ state: "idle", error: null });
    try {
      const result = await requestCamsStatement(memberId);
      const mode = withoutChecklist ? "closed" : checklistStore.getSnapshot().mode;
      setCasResumeStep2(memberId);
      if (options.openTab && mode !== "window") {
        try { window.open(result.cams_url, "_blank"); } catch { /* The request still proceeds to the waiting screen. */ }
      }
      onRequestInitiated(result.import_id, result.expires_at);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : checklistCopy.requestFailed;
      setError(message);
      if (!withoutChecklist) checklist.setCamsLink({ state: "failed", error: message });
    } finally {
      requesting.current = false;
      setIsLoading(false);
    }
  }, [memberId, withoutChecklist, checklistStore, checklist.setCamsLink, onRequestInitiated]);

  const handleLinkClick = useCallback(() => {
    if (requesting.current) return;
    if (!withoutChecklist) {
      // This click must be left to opening the CAMS tab (the link's own default action). The floating checklist was
      // opened by the earlier "Request from CAMS" click; if it is not open (page reloaded, window closed), the
      // checklist shows inside the page instead of competing for this click.
      const current = checklistStore.getSnapshot();
      if (current.mode !== "window" && !checklistStore.isOpening()) checklist.openInPage();
    }
    void sendRequest({ openTab: false });
  }, [withoutChecklist, checklistStore, checklist.openInPage, sendRequest]);

  const handleRequest = useCallback(async () => {
    if (requesting.current) return;
    if (!withoutChecklist) checklist.open();
    await sendRequest({ openTab: true });
  }, [withoutChecklist, checklist.open, sendRequest]);

  useEffect(() => {
    checklistStore.setRetry(() => { void sendRequest({ openTab: false }); });
    return () => checklistStore.setRetry(null);
  }, [checklistStore, sendRequest]);

  const handleRequestFromTutorial = async () => {
    await handleRequest();
    tutorial.hide();
  };

  const requestControlClassName =
    "w-full h-12 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 font-semibold text-xs sm:text-sm shadow-xs gap-2 cursor-pointer active:scale-[0.99] transition-all min-h-[48px]";

  const requestControlContent = isLoading ? (
    <>
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>Opening CAMS Portal...</span>
    </>
  ) : (
    <>
      <span>Request Statement on CAMS</span>
      <ExternalLink className="h-4 w-4" />
    </>
  );

  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className="p-6 sm:p-8 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs space-y-6 text-left"
    >
      {/* Back Link */}
      {onBack && (
        <motion.div variants={staggerItemVariants}>
          <button
            type="button"
            data-clickable="" data-effect="navigate"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-ink)] transition-colors cursor-pointer py-1 -ml-1 min-h-[36px]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to import options</span>
          </button>
        </motion.div>
      )}

      {/* Header Section */}
      <motion.div variants={staggerItemVariants} className="space-y-1.5">
        <h2 className="font-display font-bold text-lg sm:text-xl text-[var(--color-ink)] tracking-tight">
          Request from CAMS
        </h2>
        <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
          CAMS generates a free Consolidated Account Statement across all your mutual funds and emails it to you directly.
        </p>
      </motion.div>

      {/* Consolidated Reference Card */}
      <motion.div
        variants={staggerItemVariants}
        className="p-4 sm:p-5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)]/80 space-y-3"
      >
        <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] block font-body">
          On the CAMS form, select these three options
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="p-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]/60 text-xs">
            <span className="text-[10px] uppercase font-semibold text-[var(--color-text-secondary)] tracking-wider block">
              Statement
            </span>
            <span className="font-semibold text-[var(--color-ink)] mt-0.5 block">
              Detailed statement
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]/60 text-xs">
            <span className="text-[10px] uppercase font-semibold text-[var(--color-text-secondary)] tracking-wider block">
              Period
            </span>
            <span className="font-semibold text-[var(--color-ink)] mt-0.5 block">
              10-year duration
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]/60 text-xs">
            <span className="text-[10px] uppercase font-semibold text-[var(--color-text-secondary)] tracking-wider block">
              Folios
            </span>
            <span className="font-semibold text-[var(--color-ink)] mt-0.5 block">
              with zero folios
            </span>
          </div>
        </div>
      </motion.div>

      {/* 3 Guided Steps */}
      <motion.div
        variants={staggerItemVariants}
        className="relative pl-7 space-y-5 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[1.5px] before:bg-[var(--color-border)]/80"
      >
        {/* Step 1 */}
        <div className="relative space-y-0.5">
          <div className="absolute -left-7 top-0 h-5 w-5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-ink)] font-mono font-bold text-[10px] flex items-center justify-center shadow-2xs">
            1
          </div>
          <p className="text-xs text-[var(--color-ink)] leading-relaxed font-medium">
            Tapping below opens the official CAMS site in a new tab.
          </p>
        </div>

        {/* Step 2 */}
        <div className="relative space-y-0.5">
          <div className="absolute -left-7 top-0 h-5 w-5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-ink)] font-mono font-bold text-[10px] flex items-center justify-center shadow-2xs">
            2
          </div>
          <p className="text-xs text-[var(--color-ink)] leading-relaxed font-medium">
            Select the above three options on the form.
          </p>
        </div>

        {/* Step 3 */}
        <div className="relative space-y-0.5">
          <div className="absolute -left-7 top-0 h-5 w-5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-ink)] font-mono font-bold text-[10px] flex items-center justify-center shadow-2xs">
            3
          </div>
          <p className="text-xs text-[var(--color-ink)] leading-relaxed font-medium">
            Enter your email and set a password for your CAS file — that&apos;s all CAMS needs from you.
          </p>
        </div>
      </motion.div>

      {/* Error Alert */}
      {error && (
        <motion.div
          variants={staggerItemVariants}
          role="alert"
          className="flex items-center gap-2.5 p-3 rounded-xl bg-[color-mix(in_srgb,var(--color-negative)_12%,transparent)] border border-[color-mix(in_srgb,var(--color-negative)_30%,transparent)] text-xs text-[var(--color-negative)] font-medium"
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </motion.div>
      )}

      <motion.div variants={staggerItemVariants}>
      </motion.div>

      {/* Action Button */}
      <motion.div variants={staggerItemVariants} className="pt-1 space-y-2.5">
        {!checklistHosted && <CamsChecklistHost memberId={memberId} />}
        <div className="space-y-1.5">
        {checklist.supported && !withoutChecklist && (
          <>
            <div data-testid="continue-without-row" className="hidden md:flex ccp-cw-row">
              <span className="ccp-cw-icon" aria-hidden="true">
                <ListChecks aria-hidden="true" className="h-4 w-4" />
              </span>
              <span className="ccp-cw-text">{`${checklistCopy.introduction.split(".")[0]}.`}</span>
              <button
                type="button"
                data-testid="continue-without-button"
                data-clickable=""
                data-effect="close"
                className="ccp-cw-btn"
                onClick={() => { checklist.close(); setWithoutChecklist(true); }}
              >
                {checklistCopy.skip}
              </button>
            </div>
            {checklistCopy.introduction.split(". ").slice(1).join(". ") && (
              <p className="hidden md:block ccp-cw-more">
                {checklistCopy.introduction.split(". ").slice(1).join(". ")}
              </p>
            )}
          </>
        )}
        {checklist.supported && withoutChecklist && (
          <div data-testid="checklist-off-row" className="hidden md:flex ccp-cw-row">
            <span className="ccp-cw-icon" aria-hidden="true">
              <ListChecks aria-hidden="true" className="h-4 w-4" />
            </span>
            <span className="ccp-cw-text">
              <strong>{CHECKLIST_OFF_TITLE}</strong> {CHECKLIST_OFF_BODY}
            </span>
            <button
              type="button"
              data-testid="checklist-turn-on"
              data-clickable=""
              data-effect="open"
              className="ccp-cw-btn"
              onClick={() => { setWithoutChecklist(false); checklist.open(); }}
            >
              {CHECKLIST_TURN_ON}
            </button>
          </div>
        )}
        {linkState === "ready" && camsUrl ? (
          <a
            href={camsUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-clickable=""
            data-effect="open"
            aria-disabled={isLoading}
            onClick={handleLinkClick}
            className={cn(
              buttonVariants(),
              requestControlClassName,
              "no-underline",
              isLoading && "pointer-events-none opacity-50",
            )}
          >
            {requestControlContent}
          </a>
        ) : linkState === "loading" ? (
          <Button
            disabled
            aria-disabled="true"
            data-clickable=""
            data-effect="open"
            className={requestControlClassName}
            type="button"
          >
            {requestControlContent}
          </Button>
        ) : (
          <Button
            onClick={handleRequest}
            data-clickable=""
            data-effect="open"
            disabled={isLoading}
            className={requestControlClassName}
            type="button"
          >
            {requestControlContent}
          </Button>
        )}
        </div>

        <div className="flex justify-center">
          <TutorialLink ref={tutorialLinkRef} onOpen={tutorial.show} />
        </div>
      </motion.div>

      <TutorialDialog
        open={tutorial.open}
        onOpenChange={(next) => (next ? tutorial.show() : tutorial.hide())}
        autoPlay={tutorial.autoPlay}
        src={tutorial.src}
        onRequestStatement={handleRequestFromTutorial}
        isRequesting={isLoading}
        returnFocusRef={tutorialLinkRef}
      />
    </motion.div>
  );
}
