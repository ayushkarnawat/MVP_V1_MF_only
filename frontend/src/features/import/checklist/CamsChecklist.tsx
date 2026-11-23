import { createContext, useContext, useId } from "react";
import type { CamsChecklistApi } from "./useCamsChecklist";
import { checklistCopy as copy } from "./checklistCopy";

export const CamsChecklistRetryContext = createContext<() => void>(() => {});
const actionClass = "rounded-lg border border-[var(--color-border)] px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50";

export function CamsChecklist({ api }: { api: CamsChecklistApi }) {
  const id = useId();
  const retry = useContext(CamsChecklistRetryContext);
  return (
    <section className="space-y-3 text-[var(--color-ink)]">
      <h2>{api.mode === "panel" ? (api.step === "form" ? copy.panelTitle : copy.panelStepTitles[api.step]) : copy[api.step]}</h2>
      {api.mode === "panel" && (
        <p className="rounded-lg border border-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] p-3">{copy.panelNote}</p>
      )}
      {api.camsLink.state === "failed" && (
        <div className="space-y-2">
          <p role="alert">{api.camsLink.error}</p>
          <button type="button" data-clickable="" data-effect="retry" className={actionClass} onClick={retry}>{copy.retry}</button>
        </div>
      )}
      {api.step === "form" && (
        <>
          {api.camsLink.state !== "failed" && (
            <button type="button" data-clickable="" data-effect="open" className={actionClass}
              disabled={api.camsLink.state !== "ready" || !api.camsLink.url}
              onClick={() => { if (api.camsLink.url) window.open(api.camsLink.url, "_blank"); }}>
              {api.camsLink.state === "preparing" ? copy.preparing : copy.open}
            </button>
          )}
          <div className="space-y-2">
            {copy.items.map((label, index) => (
              <label key={label} htmlFor={`${id}-${index}`} className="flex items-start gap-2">
                <input id={`${id}-${index}`} type="checkbox" checked={api.ticks[index]} onChange={() => api.toggle(index)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <p aria-live="polite">{copy.count(api.ticks.filter(Boolean).length)}</p>
          <button type="button" data-clickable="" data-effect="switch" className={actionClass}
            disabled={!api.ticks.every(Boolean)} onClick={api.markSubmitted}>{copy.submitted}</button>
        </>
      )}
      {api.step === "waiting" && (
        <>
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
            <span aria-hidden="true" className="absolute inset-0 rounded-full border-4 border-[var(--color-border)]" />
            <span>{copy.ringLabel}</span>
          </div>
          <p>{copy.waitingNote}</p>
          <ul className="space-y-2">
            {copy.waitRows.map((row, index) => (
              <li key={row} className="flex items-start gap-2 rounded-lg border border-[var(--color-border)] p-2">
                <span aria-hidden="true" className={index === 0 ? "h-4 w-4 shrink-0 rounded border border-[var(--color-positive)] bg-[var(--color-positive)]" : "h-4 w-4 shrink-0 rounded border border-[var(--color-border)]"}>{index === 0 ? "✓" : ""}</span>
                <span>{row}</span>
              </li>
            ))}
          </ul>
          <button type="button" data-clickable="" data-effect="switch" className={actionClass} onClick={api.markFileReady}>{copy.fileReady}</button>
        </>
      )}
      {api.step === "ready" && (
        <>
          <p>{copy.readyNote}</p>
          <p className="rounded-lg border border-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] p-3">{copy.passwordNote}</p>
          <button type="button" data-clickable="" data-effect="close" className={actionClass} onClick={api.finish}>{copy.finish}</button>
        </>
      )}
    </section>
  );
}
