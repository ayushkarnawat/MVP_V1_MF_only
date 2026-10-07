import { useEffect, useState } from "react";
import { LegalDocumentModal } from "./LegalDocumentModal";
import { setPanDisclaimer } from "./panDisclaimerStore";
import type { UploadSurface } from "./panDisclaimerStore";
import { useLegalDocuments } from "./useLegalDocuments";

const LINK_CLASS =
  "font-semibold text-[#22C55E] hover:underline cursor-pointer focus-visible:outline-none focus-visible:underline";

interface PanPrivacyNoticeProps {
  surface: UploadSurface;
  /** True once the disclaimer's version is known, so Upload can send it. */
  onReadyChange?: (ready: boolean) => void;
}

// 2026-10-07: replaces the PAN tick box on the upload page. Clicking Upload is
// the agreement; the current version is registered as soon as it loads and
// sent with the upload. "privacy policy" opens the PAN disclaimer text.
export function PanPrivacyNotice({ surface, onReadyChange }: PanPrivacyNoticeProps) {
  const { docs, error, refetch } = useLegalDocuments();
  const [open, setOpen] = useState(false);
  const doc = docs?.find((d) => d.document_type === "pan_disclaimer") ?? null;
  const version = doc?.version ?? null;

  useEffect(() => {
    setPanDisclaimer(version, surface);
    onReadyChange?.(version !== null);
  }, [version, surface, onReadyChange]);
  useEffect(() => () => setPanDisclaimer(null), []);

  return (
    <div className="space-y-1 font-body text-center">
      <p className="text-xs leading-5 text-[#5C5C5C] dark:text-[#A3A3A3]">
        Your data is encrypted and safe with us.
        <br />
        By continuing, you agree to our{" "}
        <button type="button" className={LINK_CLASS} onClick={() => setOpen(true)} disabled={!doc}>
          privacy policy
        </button>
        .
      </p>
      {error && (
        <p role="alert" className="text-xs text-[var(--color-negative)]">
          Couldn’t load the policy. Check your connection and try again.{" "}
          <button type="button" onClick={() => void refetch()} className={LINK_CLASS}>
            Retry
          </button>
        </p>
      )}
      <LegalDocumentModal doc={open ? doc : null} onClose={() => setOpen(false)} closeLabel="Ok" />
    </div>
  );
}
