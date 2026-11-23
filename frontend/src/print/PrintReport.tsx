import { useEffect, useRef, useState } from "react";
import { getHouseholdMembers } from "../features/auth/api";
import { setTokenOverride } from "../features/auth/session";
import { PrintModeProvider } from "../lib/printMode";
import { ScopeContext } from "../shell/scope/ScopeContext";
import type { ScopeMember, ScopeValue } from "../shell/scope/scopeTypes";
import { clearFragment, parsePrintFragment, type PrintOptions } from "./printFragment";
import { installPrintRuntime } from "./printRuntime";
import { PrintReadyGate } from "./PrintReadyGate";
import { PRINT_SECTIONS } from "./sectionRegistry";
import "./print-runtime.css";
import "./print-fonts.stub.css";

export function PrintReport() {
  const initial = useRef<ReturnType<typeof parsePrintFragment> | undefined>(undefined);
  const [options, setOptions] = useState<PrintOptions | null>(null);
  const [members, setMembers] = useState<ScopeMember[] | null>(null);
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
    let active = true;
    void getHouseholdMembers().then(data => {
      if (!active) return;
      setMembers(data.map(member => ({ id: member.id, name: member.name || "Self" })));
    }).catch(() => {
      if (!active) return;
      delete document.documentElement.dataset.printReady;
      document.documentElement.dataset.printError = "true";
      setFailed(true);
    });
    return () => { active = false; setTokenOverride(null); };
  }, []);

  if (failed) return <div role="alert">This section failed to load, but the rest of the page is unaffected.</div>;
  if (!options) return null;
  const memberId = options.scope === "family" ? null : options.scope;
  const scope: ScopeValue = {
    viewMode: memberId === null ? "aggregate" : "member",
    memberId,
    members: members ?? [],
    selectedMember: members?.find(member => member.id === memberId),
    scopeKey: memberId === null ? "aggregate" : `member:${memberId}`,
    setMember: () => {},
    setAggregate: () => {},
    refreshMembers: () => {},
  };
  return (
    <PrintModeProvider value={{ folios: options.showFolios, dataDates: options.dataDates }}>
      <PrintReadyGate sectionIds={options.sectionIds} enabled={members !== null}>
        <ScopeContext.Provider value={scope}>
          <div data-print-root style={{ width: "680px", margin: "0 auto" }}>
            {members !== null && options.sectionIds.map((id, index) => (
              <section key={`${index}:${id}`} data-print-section={id}>{PRINT_SECTIONS[id].render()}</section>
            ))}
          </div>
        </ScopeContext.Provider>
      </PrintReadyGate>
    </PrintModeProvider>
  );
}
