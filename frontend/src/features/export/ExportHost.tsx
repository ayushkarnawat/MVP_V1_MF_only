import { useRef, useState } from "react";
import { useLocation } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { useFolioVisibility } from "../../lib/folioVisibility";
import type { MfTabId } from "../../lib/pageSections";
import { paths } from "../../shell/nav/paths";
import { finalRoute, resolveRoute } from "../../shell/nav/resolve";
import { useRegistry } from "../../shell/registry/RegistryContext";
import { useScope } from "../../shell/scope/ScopeContext";
import { buildPrintOptions } from "./buildPrintOptions";
import { ExportButton } from "./ExportButton";
import { ExportDialog } from "./ExportDialog";
import { getPresetSectionIds } from "./exportSections";
import type { ExportChoice, ExportDialogProps } from "./exportTypes";
import { useExportJob } from "./useExportJob";
import { useHasFunds } from "./useHasFunds";

const TAB_PATHS: Record<MfTabId, string> = { overview: paths.mutualFunds.root(), performance: paths.mutualFunds.performance(), allocation: paths.mutualFunds.allocation(), holdings: paths.mutualFunds.holdings(), transactions: paths.mutualFunds.transactions(), overlap: paths.mutualFunds.overlap(), analytics: paths.mutualFunds.analytics() };
function DialogWithFallback({ lastChoice, ...props }: Omit<ExportDialogProps, "onPrintInstead"> & { lastChoice: ExportChoice | null }) {
  const { me } = useAuth(); const scope = useScope();
  return <ExportDialog {...props} onPrintInstead={() => {
    if (!lastChoice) return;
    const options = buildPrintOptions(lastChoice, scope, me);
    const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(options)))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    window.open(`/print/report#mode=browser&opts=${encoded}`, "_blank", "noopener");
  }} />;
}
export function ExportHost() {
  const scope = useScope(); const { pathname } = useLocation(); const routes = useRegistry(); const { hidden } = useFolioVisibility();
  const route = finalRoute(resolveRoute(pathname, routes), routes);
  const currentTab = (Object.keys(TAB_PATHS) as MfTabId[]).find(tab => TAB_PATHS[tab] === route?.path) ?? null;
  const hasData = useHasFunds(); const job = useExportJob(); const [open, setOpen] = useState(false); const [epoch, setEpoch] = useState(0);
  const [override, setOverride] = useState<Partial<ExportDialogProps["defaults"]>>({});
  const labels = useRef({ scopeLabel: "", presetLabel: "" });
  const defaults: ExportDialogProps["defaults"] = { who: scope.members.length === 1 ? scope.members[0].id : "family", preset: currentTab ? "tab" : "full", showFolios: !hidden, ...override };
  function choose(next: Partial<ExportDialogProps["defaults"]> = {}) { job.reset(); setOverride(next); setEpoch(value => value + 1); setOpen(true); }
  function close() { setOpen(false); job.reset(); setOverride({}); }
  function start(choice: ExportChoice) {
    const same = (ids: string[]) => ids.length === choice.sectionIds.length && ids.every(id => choice.sectionIds.includes(id));
    labels.current = { scopeLabel: choice.who === "family" ? "Family combined" : scope.members.find(member => member.id === choice.who)?.name ?? "", presetLabel: same(getPresetSectionIds("full", currentTab)) ? "Full report" : currentTab && same(getPresetSectionIds("tab", currentTab)) ? "This tab" : "Custom" };
    void job.start(choice, labels.current);
  }
  return <>
    <ExportButton hasData={hasData} busy={job.state === "preparing"} onOpen={() => { job.reopen(); setOpen(true); }} />
    {open && <DialogWithFallback key={epoch} open onOpenChange={value => { if (value) setOpen(true); else if (job.state === "preparing") setOpen(false); else close(); }} stage={job.state === "idle" ? "choose" : job.state} members={scope.members.map(({ id, name }) => ({ id, name }))} currentTab={currentTab} defaults={defaults}
      onStart={start} onCancel={() => { job.cancel(); setOpen(false); }} onKeepWorking={() => setOpen(false)} progress={job.progress} ready={job.ready ?? { fileName: "", chips: [] }} failed={job.failed}
      onDownloadAgain={job.downloadAgain} onExportAnother={() => choose()} onDone={close} onTryAgain={() => { if (job.lastChoice) void job.start(job.lastChoice, labels.current); }} onFewerSections={() => choose({ preset: currentTab ? "tab" : "custom" })} onExportMember={() => choose({ who: scope.members[0]?.id ?? "family" })} onClose={close} lastChoice={job.lastChoice} />}
  </>;
}
