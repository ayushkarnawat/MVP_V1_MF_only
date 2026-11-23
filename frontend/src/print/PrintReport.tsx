import { useEffect, useRef, useState } from "react";
import { setTokenOverride } from "../features/auth/session";
import { PrintModeProvider } from "../lib/printMode";
import { ScopeContext } from "../shell/scope/ScopeContext";
import type { ScopeValue } from "../shell/scope/scopeTypes";
import { clearFragment, parsePrintFragment, type PrintOptions } from "./printFragment";
import { installPrintRuntime } from "./printRuntime";
import { PrintReadyGate } from "./PrintReadyGate";
import { PRINT_SECTIONS } from "./sectionRegistry";
import { PrintOptionsContext } from "./printOptionsContext";
import "./print-runtime.css";
import "./print-fonts.stub.css";

export function PrintReport() {
  const initial = useRef<ReturnType<typeof parsePrintFragment> | undefined>(undefined);
  const [options, setOptions] = useState<PrintOptions | null>(null);
  const [failed, setFailed] = useState(false);

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
    setTokenOverride(parsed.pass);
    setOptions(parsed.options);
    return () => { setTokenOverride(null); };
  }, []);

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
        <PrintReadyGate sectionIds={options.sectionIds} enabled>
          <ScopeContext.Provider value={scope}>
            <div data-print-root style={{ width: "680px", margin: "0 auto" }}>
              {options.sectionIds.map((id, index) => (
                <section key={`${index}:${id}`} data-print-section={id}>{PRINT_SECTIONS[id].render()}</section>
              ))}
            </div>
          </ScopeContext.Provider>
        </PrintReadyGate>
      </PrintModeProvider>
    </PrintOptionsContext.Provider>
  );
}
