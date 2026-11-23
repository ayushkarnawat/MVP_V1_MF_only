import { createContext, useContext, useId } from "react";
import type { CamsChecklistApi } from "./useCamsChecklist";
import { checklistCopy as copy } from "./checklistCopy";
import "./checklist-tokens.css";

export const CamsChecklistRetryContext = createContext<() => void>(() => {});

export function CamsChecklist({ api }: { api: CamsChecklistApi }) {
  const id = useId();
  const retry = useContext(CamsChecklistRetryContext);
  const rootClass = api.mode === "panel" ? "cams-checklist-panel" : "cams-checklist-window";
  return (
    <section className={rootClass}>
      <h2 className="cc-title">{api.mode === "panel" ? (api.step === "form" ? copy.panelTitle : copy.panelStepTitles[api.step]) : copy[api.step]}</h2>
      {api.mode === "panel" && (
        <p className="cc-note-amber">{copy.panelNote}</p>
      )}
      {api.camsLink.state === "failed" && (
        <div>
          <p role="alert" className="cc-note-error">{api.camsLink.error}</p>
          <button type="button" data-clickable="" data-effect="retry" className="cc-btn-outline" onClick={retry}>{copy.retry}</button>
        </div>
      )}
      {api.step === "form" && (
        <>
          {api.camsLink.state !== "failed" && (
            <button type="button" data-clickable="" data-effect="open" className="cc-btn-outline"
              disabled={api.camsLink.state !== "ready" || !api.camsLink.url}
              onClick={() => { if (api.camsLink.url) window.open(api.camsLink.url, "_blank"); }}>
              {api.camsLink.state === "preparing" ? copy.preparing : copy.open}
            </button>
          )}
          <p aria-live="polite" className="cc-count">{copy.count(api.ticks.filter(Boolean).length)}</p>
          <div>
            {copy.items.map((label, index) => (
              <label key={label} htmlFor={`${id}-${index}`} className={`cc-row cc-row-interactive${api.ticks[index] ? " cc-row-on" : ""}`}>
                <input id={`${id}-${index}`} type="checkbox" className="cc-native-checkbox" checked={api.ticks[index]} onChange={() => api.toggle(index)} />
                <span aria-hidden="true" className="cc-box">{api.ticks[index] ? "✓" : null}</span>
                <span className="cc-row-text">{label}</span>
              </label>
            ))}
          </div>
          <button type="button" data-clickable="" data-effect="switch" className="cc-btn-primary"
            disabled={!api.ticks.every(Boolean)} onClick={api.markSubmitted}>{copy.submitted}</button>
        </>
      )}
      {api.step === "waiting" && (
        <>
          <div className="cc-ring-wrap">
            <span aria-hidden="true" className="cc-ring-circle" />
            <span className="cc-ring-label">{copy.ringLabel}</span>
          </div>
          <p className="cc-wait-note">{copy.waitingNote}</p>
          <ul className="cc-list">
            {copy.waitRows.map((row, index) => (
              <li key={row} className={`cc-row cc-row-static${index === 0 ? " cc-row-on" : ""}`}>
                <span aria-hidden="true" className="cc-box">{index === 0 ? "✓" : ""}</span>
                <span className="cc-row-text">{row}</span>
              </li>
            ))}
          </ul>
          <button type="button" data-clickable="" data-effect="switch" className="cc-btn-primary" onClick={api.markFileReady}>{copy.fileReady}</button>
        </>
      )}
      {api.step === "ready" && (
        <>
          <p className="cc-ready-note">{copy.readyNote}</p>
          <p className="cc-note-amber">{copy.passwordNote}</p>
          <button type="button" data-clickable="" data-effect="close" className="cc-btn-primary" onClick={api.finish}>{copy.finish}</button>
        </>
      )}
    </section>
  );
}
