import { Fragment, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { setTokenOverride } from "../features/auth/session";
import { PrintModeProvider } from "../lib/printMode";
import { formatDataDate, formatDataDateParts } from "../lib/dataDates";
import { formatDate } from "../lib/format";
import { SECTION_LISTS, type MfTabId } from "../lib/pageSections";
import { ScopeContext } from "../shell/scope/ScopeContext";
import type { ScopeValue } from "../shell/scope/scopeTypes";
import { clearFragment, parsePrintFragment, type PrintOptions } from "./printFragment";
import { installPrintRuntime } from "./printRuntime";
import { PrintReadyGate } from "./PrintReadyGate";
import { PRINT_SECTIONS } from "./sectionRegistry";
import { SectionBoundary } from "./SectionBoundary";
import { PrintOptionsContext } from "./printOptionsContext";
import { PrintSettledContext } from "./usePrintSettled";
import { useReportDates } from "./useReportDates";
import { PrintTemplate } from "./PrintTemplate";
import { Cover } from "./Cover";
import { Contents } from "./Contents";
import { TabHeading } from "./TabHeading";
import { NotesPage } from "./NotesPage";
import { RunningHeader } from "./RunningHeader";
import { RunningFooter } from "./RunningFooter";
import "./print-runtime.css";
import "./print-markers.css";

declare global {
  interface Window {
    __unifolioSetPrintPages?: (map: Record<string, number>) => Promise<void>;
    __unifolioShowContentsOnly?: () => void;
  }
}

const TAB_LABELS: Record<MfTabId, string> = {
  overview: "Overview", performance: "Performance", allocation: "Allocation", holdings: "Holdings",
  transactions: "Transactions", overlap: "Overlap", analytics: "Other Analytics",
};

function ReportAssembly({ options, browser }: { options: PrintOptions; browser: boolean }) {
  const dates = useReportDates();
  const report = useContext(PrintSettledContext);
  const [, refresh] = useReducer((version: number) => version + 1, 0);
  const onSectionSettled = useCallback((id: string, settled: boolean) => {
    refresh();
    report?.(id, settled);
  }, [report]);
  const [pages, setPages] = useState<Record<string, number>>(() => options.pages ?? {});
  const [generatedOn] = useState(() => formatDate(new Date().toISOString()).replace(/^0(?=\d )/, ""));
  useEffect(() => {
    const setPrintPages = async (map: Record<string, number>) => {
      setPages(previous => ({ ...previous, ...map }));
      await new Promise<void>(resolve => { requestAnimationFrame(() => resolve()); });
    };
    const showContentsOnly = () => { document.documentElement.dataset.printContentsOnly = "true"; };
    window.__unifolioSetPrintPages = setPrintPages;
    window.__unifolioShowContentsOnly = showContentsOnly;
    return () => {
      if (window.__unifolioSetPrintPages === setPrintPages) delete window.__unifolioSetPrintPages;
      if (window.__unifolioShowContentsOnly === showContentsOnly) delete window.__unifolioShowContentsOnly;
      delete document.documentElement.dataset.printContentsOnly;
    };
  }, []);
  const requested = new Set(options.sectionIds);
  const full = options.sectionIds.length === Object.keys(PRINT_SECTIONS).length && requested.size === options.sectionIds.length && Object.keys(PRINT_SECTIONS).every(id => requested.has(id));
  const scopeName = options.scope === "family" && options.meta.holderName ? `${options.meta.holderName} and family` : options.meta.scopeName;
  const scopeLabel = full ? `${options.scope === "family" ? "Family Combined" : options.meta.scopeName}, full report` : `${options.meta.scopeName}, ${options.sectionIds.length} sections`;
  const dataDates = options.dataDates ? [formatDataDateParts("prices", dates.pricesIso), formatDataDateParts("holdings", dates.holdingsIso)].filter(part => part !== null) : [];
  const entries = options.sectionIds.map(id => ({ tab: TAB_LABELS[PRINT_SECTIONS[id].tab], title: PRINT_SECTIONS[id].title, page: pages[id] ?? null }));
  entries.push({ tab: "Notes", title: "Notes", page: pages.notes ?? null });
  return <><style>{"@media print { .print-browser-message { display: none !important; } }"}</style>
    {browser && <p className="print-browser-message text-sm" style={{ textAlign: "center" }}>Preparing your report. When it is ready the print window opens: choose Save as PDF.</p>}
    <PrintTemplate>
    {options.cover && <Cover holderName={options.meta.holderName} scope={options.scope === "family" ? { kind: "family" } : { kind: "member", memberName: options.meta.scopeName }} memberCount={options.meta.memberCount} fundCount={dates.fundCount} folioCount={dates.folioCount} generatedOn={generatedOn} scopeLabel={scopeLabel} dataDates={dataDates} />}
    <div data-print-root style={{ width: "680px", margin: "0 auto" }}>
    {options.cover && <Contents entries={entries} />}
    <PrintSettledContext.Provider value={onSectionSettled}>
      {(Object.keys(SECTION_LISTS) as MfTabId[]).map(tab => {
        const sections = SECTION_LISTS[tab].filter(section => requested.has(section.id));
        return sections.length ? <Fragment key={tab}><TabHeading tab={TAB_LABELS[tab]} />{sections.map(({ id }) => <section key={id} data-print-section={id}>
          <p data-print-marker aria-hidden="true" className="print-section-marker">{`[[sec:${id}]]`}</p>
          <SectionBoundary id={id} title={PRINT_SECTIONS[id].title}>{PRINT_SECTIONS[id].render()}</SectionBoundary>
        </section>)}</Fragment> : null;
      })}
    </PrintSettledContext.Provider>
    <div data-print-notes><p data-print-marker aria-hidden="true" className="print-section-marker">[[sec:notes]]</p><NotesPage priceDate={dates.pricesIso} marketCapDate={dates.marketCapIso} /></div>
    <RunningHeader scopeName={scopeName} />
    <RunningFooter generatedOn={generatedOn} priceNote={options.dataDates ? formatDataDate("prices", dates.pricesIso) || null : null} />
  </div></PrintTemplate></>;
}

export function PrintReport() {
  const initial = useRef<ReturnType<typeof parsePrintFragment> | undefined>(undefined);
  const [options, setOptions] = useState<PrintOptions | null>(null);
  const [failed, setFailed] = useState(false);
  const printed = useRef(false);
  const required = useMemo(() => options ? [...options.sectionIds, "report-meta"] : [], [options]);

  useEffect(() => {
    if (initial.current === undefined) {
      initial.current = parsePrintFragment(location.hash);
      clearFragment();
    }
    installPrintRuntime();
    const parsed = initial.current;
    delete document.documentElement.dataset.printReady;
    delete document.documentElement.dataset.printError;
    if (!parsed) {
      document.documentElement.dataset.printError = "true";
      setFailed(true);
      return;
    }
    if (parsed.mode !== "browser") setTokenOverride(parsed.pass);
    setOptions(parsed.options);
    return () => { if (parsed.mode !== "browser") setTokenOverride(null); };
  }, []);

  useEffect(() => {
    if (!options || initial.current?.mode !== "browser") return;
    const check = () => { if (document.documentElement.dataset.printReady === "true" && !printed.current) { printed.current = true; window.print(); } };
    const observer = new MutationObserver(check); observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-print-ready"] }); check();
    return () => observer.disconnect();
  }, [options]);

  if (failed) return <div role="alert">This section failed to load, but the rest of the page is unaffected.</div>;
  if (!options) return null;
  const memberId = options.scope === "family" ? null : options.scope;
  const members = options.members;
  const scope: ScopeValue = {
    viewMode: memberId === null ? "aggregate" : "member",
    memberId,
    members,
    selectedMember: members.find(member => member.id === memberId),
    scopeKey: memberId === null ? "aggregate" : `member:${memberId}`,
    setMember: () => {},
    setAggregate: () => {},
    refreshMembers: () => {},
  };
  return (
    <PrintOptionsContext.Provider value={options}>
      <PrintModeProvider value={{ folios: options.showFolios, dataDates: options.dataDates }}>
        <PrintReadyGate sectionIds={required} enabled>
          <ScopeContext.Provider value={scope}>
            <ReportAssembly options={options} browser={initial.current?.mode === "browser"} />
          </ScopeContext.Provider>
        </PrintReadyGate>
      </PrintModeProvider>
    </PrintOptionsContext.Provider>
  );
}
