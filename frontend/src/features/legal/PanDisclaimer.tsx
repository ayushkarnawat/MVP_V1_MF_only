import { useEffect, useState } from "react";
import { LegalDocumentModal } from "./LegalDocumentModal";
import { setPanDisclaimer } from "./panDisclaimerStore";
import type { UploadSurface } from "./panDisclaimerStore";
import { useLegalDocuments } from "./useLegalDocuments";

const LINK_CLASS =
  "font-semibold text-[#22C55E] hover:underline cursor-pointer focus-visible:outline-none focus-visible:underline";

// The document starts with a "# " title line; the rest (placeholder note plus
// the disclaimer sentence) is shown as the checkbox text, one paragraph per block.
function disclaimerParagraphs(content: string): string[] {
  const blocks = content
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks[0]?.startsWith("# ")) {
    const rest = blocks[0].split("\n").slice(1).join("\n").trim();
    blocks.shift();
    if (rest) blocks.unshift(rest);
  }
  return blocks.map((b) => (b.startsWith("> ") ? b.slice(2) : b));
}

interface PanDisclaimerProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  surface: UploadSurface;
}

export function PanDisclaimer({ checked, onChange, surface }: PanDisclaimerProps) {
  const { docs, error, refetch } = useLegalDocuments();
  const [open, setOpen] = useState(false);
  const doc = docs?.find((d) => d.document_type === "pan_disclaimer") ?? null;
  const version = doc?.version ?? null;

  // Not cleared after a submit on purpose: a retry (e.g. wrong password) keeps
  // the box ticked and the store populated.
  useEffect(() => {
    setPanDisclaimer(checked && version ? version : null, surface);
  }, [checked, version, surface]);
  useEffect(() => () => setPanDisclaimer(null), []);

  return (
    <div className="space-y-1.5 font-body text-left">
      <div className="flex items-start gap-2.5">
        <input
          id={`pan-disclaimer-${surface}`}
          type="checkbox"
          checked={checked}
          disabled={doc === null}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer accent-[#22C55E]"
        />
        <label htmlFor={`pan-disclaimer-${surface}`} className="space-y-1 text-[13px] leading-5 text-[#5C5C5C] dark:text-[#A3A3A3]">
          {doc ? (
            disclaimerParagraphs(doc.content).map((p, i) => (
              <span key={i} className="block">
                {p}
              </span>
            ))
          ) : (
            <span className="block">Loading…</span>
          )}
        </label>
      </div>
      {doc && (
        <button type="button" className={`${LINK_CLASS} pl-6 text-xs`} onClick={() => setOpen(true)}>
          Read the full PAN disclaimer
        </button>
      )}
      {error && (
        <p role="alert" className="text-xs text-[var(--color-negative)]">
          Couldn’t load the disclaimer. Check your connection and try again.{" "}
          <button type="button" onClick={() => void refetch()} className={LINK_CLASS}>
            Retry
          </button>
        </p>
      )}
      <LegalDocumentModal doc={open ? doc : null} onClose={() => setOpen(false)} />
    </div>
  );
}
