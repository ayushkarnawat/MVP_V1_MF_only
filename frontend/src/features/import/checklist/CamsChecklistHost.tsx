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
  const done = api.ticks.filter(Boolean).length;
  const percent = Math.round((done / 5) * 100);
  const stripContent = (
    <>
      <div
        role="progressbar"
        aria-label={copy.title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="ccp-strip-bar"
      >
        <span className="ccp-strip-fill" style={{ width: `${percent}%` }} />
      </div>
      <span aria-live="polite" className="ccp-strip-count">{copy.count(done)}</span>
      <span className="ccp-strip-step">{copy[api.step]}</span>
    </>
  );
  const body = <CamsChecklistRetryContext.Provider value={store.retry}><CamsChecklist api={api} /></CamsChecklistRetryContext.Provider>;
  if (api.mode === "window" && floating) {
    return <>
      <div className="hidden md:block ccp-strip">{stripContent}</div>
      {createPortal(body, floating.document.body)}
    </>;
  }
  if (api.mode === "panel") {
    return <>
      <div className="hidden md:block ccp-strip">
        {stripContent}
        <button type="button" data-clickable="" data-effect="retry" className="ccp-startover-link" onClick={api.startOver}>{copy.startOver}</button>
      </div>
      <div className="hidden md:block ccp-card">{body}</div>
    </>;
  }
  if (api.mode === "closed" && !store.isOpening() && getChecklistState(memberId)) {
    const stepName = copy.closedStepNames[api.step];
    const [before, after] = copy.closedNote(stepName).split(stepName);
    return <section className="hidden md:block">
      <div className="ccp-banner">
        <div className="hidden md:block ccp-strip">{stripContent}</div>
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
