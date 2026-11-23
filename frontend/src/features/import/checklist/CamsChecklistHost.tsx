import { createContext } from "react";
import { createPortal } from "react-dom";
import { getChecklistState } from "../casResumeState";
import { CamsChecklist, CamsChecklistRetryContext } from "./CamsChecklist";
import { useCamsChecklist } from "./useCamsChecklist";
import { getChecklistStore } from "./checklistStore";
import { checklistCopy as copy } from "./checklistCopy";
import "./checklist-tokens.css";

export const CamsChecklistHostedContext = createContext(false);

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
  if (api.mode === "panel") return <div className="hidden md:block ccp-card">{body}</div>;
  if (api.mode === "closed" && !store.isOpening() && getChecklistState(memberId)) {
    const stepName = copy.closedStepNames[api.step];
    const [before, after] = copy.closedNote(stepName).split(stepName);
    return <section className="hidden md:block">
      <div className="ccp-banner">
        <p role="status" className="ccp-banner-text">{before}<strong>{stepName}</strong>{after}</p>
        <div className="ccp-banner-actions">
          <button type="button" data-clickable="" data-effect="open" className="ccp-reopen-btn" onClick={api.reopen}>{copy.reopen}</button>
          <button type="button" data-clickable="" data-effect="retry" className="ccp-startover-link" onClick={api.startOver}>{copy.startOver}</button>
        </div>
      </div>
    </section>;
  }
  return null;
}
