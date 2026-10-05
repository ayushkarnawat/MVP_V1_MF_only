import { useState } from "react";
import { LegalDocumentModal } from "./LegalDocumentModal";
import type { LegalDocument, LegalDocumentType } from "./types";

interface ConsentCheckboxProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  docs: LegalDocument[] | null;
  types: LegalDocumentType[];
  label?: "signup" | "reactivate";
  /** Set when loading the documents failed; shows the retry message. */
  loadError?: boolean;
  onRetry?: () => void;
}

const LINK_CLASS =
  "font-semibold text-[#22C55E] hover:underline cursor-pointer focus-visible:outline-none focus-visible:underline";

export function ConsentCheckbox({ checked, onChange, docs, types, label = "signup", loadError, onRetry }: ConsentCheckboxProps) {
  const [open, setOpen] = useState<LegalDocument | null>(null);
  const find = (type: LegalDocumentType) => docs?.find((d) => d.document_type === type) ?? null;
  const id = `consent-${label}`;

  const link = (type: LegalDocumentType, text: string) => (
    <button
      type="button"
      className={LINK_CLASS}
      onClick={(e) => {
        e.preventDefault();
        const doc = find(type);
        if (doc) setOpen(doc);
      }}
    >
      {text}
    </button>
  );

  return (
    <div className="space-y-1.5 font-body">
      <div className="flex items-start gap-2.5">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={docs === null}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 flex-shrink-0"
        />
        <label htmlFor={id} className="text-[13px] leading-5 text-[#5C5C5C] dark:text-[#A3A3A3]">
          I agree to the {types.includes("terms_of_service") && link("terms_of_service", "Terms & Conditions")}
          {types.includes("terms_of_service") && types.includes("privacy_policy") && " and "}
          {types.includes("privacy_policy") && link("privacy_policy", "Privacy Policy")}
        </label>
      </div>
      {loadError && (
        <p role="alert" className="text-xs text-[var(--color-negative)]">
          Couldn’t load our terms. Check your connection and try again.{" "}
          {onRetry && (
            <button type="button" onClick={onRetry} className={LINK_CLASS}>
              Retry
            </button>
          )}
        </p>
      )}
      <LegalDocumentModal doc={open} onClose={() => setOpen(null)} />
    </div>
  );
}
