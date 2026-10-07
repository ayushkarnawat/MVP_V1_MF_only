import { useMemo, useState } from "react";
import { PromptDialog } from "./prompts/PromptDialog";
import { PRIMARY_BTN, SECONDARY_BTN } from "./prompts/copy";
import type { SchemeConfirmation, SchemeMatchPreview } from "./types";

const UNLISTED = "__unlisted__";

interface UnidentifiedFundsDialogProps {
  /** Every fund in the preview; only those still asking are shown. */
  schemes: SchemeMatchPreview[];
  onContinue: (confirmations: SchemeConfirmation[]) => void;
  /** ×: the parent opens C3 first. */
  onCancel: () => void;
}

/**
 * Phase 7: what's left of the review screen. Shown only when a fund the
 * investor still holds couldn't be identified but has candidates
 * (preview.needs_review). "Not listed" imports it as an unlisted fund valued
 * at the statement's NAV (decided 6 Oct).
 */
export function UnidentifiedFundsDialog({ schemes, onContinue, onCancel }: UnidentifiedFundsDialogProps) {
  const asking = useMemo(() => schemes.filter((s) => s.identification === "ask"), [schemes]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const complete = asking.every((s) => picks[s.temp_id]);

  const submit = () => onContinue(asking.map((s) =>
    picks[s.temp_id] === UNLISTED ? { temp_id: s.temp_id, unlisted: true } : { temp_id: s.temp_id, amfi_code: picks[s.temp_id] }));

  return (
    <PromptDialog
      isOpen
      title={asking.length === 1 ? "Which fund is this?" : `Which funds are these? (${asking.length})`}
      body="We couldn’t match this to a fund in AMFI’s list. Pick the right one, or choose Not listed and we’ll use the price on your statement."
      onClose={onCancel}
      footer={
        <>
          <button type="button" onClick={onCancel} className={SECONDARY_BTN}>Cancel import</button>
          <button type="button" onClick={submit} disabled={!complete} className={PRIMARY_BTN}>Continue</button>
        </>
      }
    >
      <ul className="space-y-3">
        {asking.map((s) => (
          <li key={s.temp_id} className="space-y-1">
            <p className="text-sm font-medium text-[var(--color-ink)]">{s.name}</p>
            <p className="text-xs text-[var(--color-text-secondary)]">Folio {s.folio}</p>
            <select
              aria-label={`Fund for ${s.name}`}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 text-sm"
              value={picks[s.temp_id] ?? ""}
              onChange={(e) => setPicks((p) => ({ ...p, [s.temp_id]: e.target.value }))}
            >
              <option value="" disabled>Choose…</option>
              {(s.candidates ?? []).map((c) => <option key={c.amfi_code} value={c.amfi_code}>{c.name}</option>)}
              <option value={UNLISTED}>Not listed — use the price on my statement</option>
            </select>
          </li>
        ))}
      </ul>
    </PromptDialog>
  );
}
