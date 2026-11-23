import { createContext } from "react";
import { createPortal } from "react-dom";
import { getChecklistState } from "../casResumeState";
import { CamsChecklist, CamsChecklistRetryContext } from "./CamsChecklist";
import { useCamsChecklist } from "./useCamsChecklist";
import { getChecklistStore } from "./checklistStore";
import { checklistCopy as copy } from "./checklistCopy";

export const CamsChecklistHostedContext = createContext(false);
const cardClass = "hidden md:block space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-[var(--color-ink)]";
const actionClass = "rounded-lg px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]";

export function CamsChecklistHost({ memberId }: { memberId: string }) {
  const api = useCamsChecklist(memberId);
  const store = getChecklistStore(memberId);
  const floating = store.getSnapshot().pipWindow;
  const body = <CamsChecklistRetryContext.Provider value={store.retry}><CamsChecklist api={api} /></CamsChecklistRetryContext.Provider>;
  if (api.mode === "window" && floating) {
    return <>
      <p className="hidden md:block" aria-live="polite">{copy.count(api.ticks.filter(Boolean).length)}</p>
      {createPortal(body, floating.document.body)}
    </>;
  }
  if (api.mode === "panel") return <div className={cardClass}>{body}</div>;
  if (api.mode === "closed" && !store.isOpening() && getChecklistState(memberId)) {
    return <section className={cardClass}>
      <p role="status" className="rounded-lg border border-[var(--color-positive)] bg-[color-mix(in_srgb,var(--color-positive)_8%,transparent)] p-3">{copy.closedNote(copy.closedStepNames[api.step])}</p>
      <button type="button" data-clickable="" data-effect="open" className={actionClass} onClick={api.reopen}>{copy.reopen}</button>
      <button type="button" data-clickable="" data-effect="retry" className={actionClass} onClick={api.startOver}>{copy.startOver}</button>
    </section>;
  }
  return null;
}
