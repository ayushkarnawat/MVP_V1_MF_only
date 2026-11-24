import { useEffect, useRef, useState } from "react";
import { useScope } from "../../shell/scope/ScopeContext";
import { cancelExport, createExport, downloadExportFile, ExportCooldownError, ExportInProgressError, getExportStatus } from "./api";
import type { ExportChoice, StageRow } from "./exportTypes";

type Labels = { scopeLabel: string; presetLabel: string };
type State = "idle" | "preparing" | "ready" | "failed";
const CODES: Record<string, string> = { busy: "EXP-BUSY", timeout: "EXP-TIME", too_large: "EXP-SIZE", print_error: "EXP-PAGE", internal: "EXP-FAIL", cooldown: "EXP-WAIT" };
const ROWS = ["Collected your holdings and transactions", "Checked prices and data dates", "Building the pages", "Adding cover and contents", "Finishing the file"];
export function formatExportSize(bytes: number): string {
  const value = BigInt(Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : 0);
  if (value < 1048576n) return `${(value + 512n) / 1024n} KB`;
  const tenths = (value * 10n + 524288n) / 1048576n;
  return `${tenths / 10n}.${tenths % 10n} MB`;
}
export function useExportJob() {
  const { members } = useScope();
  const [state, setState] = useState<State>("idle");
  const [lastChoice, setLastChoice] = useState<ExportChoice | null>(null);
  const [labels, setLabels] = useState<Labels>({ scopeLabel: "", presetLabel: "" });
  const [stage, setStage] = useState<"collecting" | "building" | "finishing">("collecting");
  const [total, setTotal] = useState(0);
  const [code, setCode] = useState<string | null>(null);
  const [ready, setReady] = useState<{ fileName: string; chips: string[] } | null>(null);
  const run = useRef(0); const active = useRef(false); const mounted = useRef(true); const jobId = useRef<string | null>(null);
  const cancelled = useRef(new Set<number>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const file = useRef<{ blob: Blob; fileName: string } | null>(null);
  const urls = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  function stop() { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; active.current = false; }
  function releaseUrls() { for (const [url, timeout] of urls.current) { clearTimeout(timeout); URL.revokeObjectURL(url); } urls.current.clear(); }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; run.current++; stop(); releaseUrls(); file.current = null; };
  }, []);
  function save(saved: { blob: Blob; fileName: string }) {
    const url = URL.createObjectURL(saved.blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = saved.fileName; document.body.append(anchor);
    try { anchor.click(); } finally { anchor.remove(); urls.current.set(url, setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 1000)); }
  }
  function fail(reason: string | null) { stop(); setCode(reason && Object.hasOwn(CODES, reason) ? CODES[reason] : null); setState("failed"); }
  async function start(choice: ExportChoice, nextLabels: Labels): Promise<void> {
    if (active.current) return;
    const version = ++run.current; active.current = true; jobId.current = null; file.current = null; releaseUrls();
    setLastChoice({ ...choice, sectionIds: [...choice.sectionIds] }); setLabels(nextLabels); setTotal(choice.sectionIds.length); setStage("collecting"); setCode(null); setReady(null); setState("preparing");
    const current = () => mounted.current && version === run.current && active.current;
    let id: string;
    try { id = (await createExport({ scope: choice.who, section_ids: choice.sectionIds, cover: choice.cover, data_dates: choice.dataDates, show_folios: choice.showFolios ? "full" : "masked" })).job_id; }
    catch (error) {
      if (!current()) { if (error instanceof ExportInProgressError && cancelled.current.delete(version)) void cancelExport(error.jobId).catch(() => {}); return; }
      if (error instanceof ExportInProgressError) id = error.jobId;
      else { fail(error instanceof ExportCooldownError ? "cooldown" : null); return; }
    }
    if (!current()) { if (cancelled.current.delete(version)) void cancelExport(id).catch(() => {}); return; }
    jobId.current = id;
    let errors = 0;
    const schedule = () => { if (current()) timer.current = setTimeout(() => { void poll(); }, 2000); };
    const poll = async () => {
      let downloading = false;
      try {
        const status = await getExportStatus(id); if (!current()) return; errors = 0; setStage(status.stage); setTotal(status.sections_total);
        if (status.status === "preparing") { schedule(); return; }
        if (status.status === "cancelled") { stop(); setState("idle"); return; }
        if (status.status === "failed") { fail(status.error_code); return; }
        downloading = true;
        const saved = await downloadExportFile(id); if (!current()) return;
        file.current = saved; save(saved); stop(); setReady({ fileName: saved.fileName, chips: [formatExportSize(status.pdf_bytes ?? saved.blob.size), nextLabels.scopeLabel, nextLabels.presetLabel] }); setState("ready");
      } catch {
        if (!current()) return;
        // A file is single-use; only status reads may be retried.
        if (downloading || ++errors > 3) { fail(null); return; }
        schedule();
      }
    };
    schedule();
  }
  function cancel() {
    if (!jobId.current && active.current) cancelled.current.add(run.current);
    run.current++; stop();
    if (jobId.current) void cancelExport(jobId.current).catch(() => {});
    jobId.current = null; file.current = null; releaseUrls(); setReady(null); setState("idle");
  }
  function reset() { run.current++; stop(); jobId.current = null; file.current = null; releaseUrls(); setLastChoice(null); setReady(null); setCode(null); setState("idle"); }
  const index = stage === "collecting" ? 0 : stage === "building" ? 2 : 3;
  const rows: StageRow[] = ROWS.map((label, row) => ({ label, state: state === "ready" ? "done" : state === "idle" ? "todo" : row < index ? "done" : row === index ? "now" : "todo", ...(row === 2 && stage === "building" ? { note: `${total} sections` } : {}) }));
  return { state, progress: { subtitle: `${labels.scopeLabel} · ${labels.presetLabel} · ${total} sections`, percent: state === "ready" ? 100 : state === "idle" ? 0 : stage === "collecting" ? 15 : stage === "building" ? 55 : 90, rows }, ready, failed: { code, canTryFewer: (lastChoice?.sectionIds.length ?? 0) > 1, canExportMember: lastChoice?.who === "family" && members.length > 1 }, start, cancel, reset, lastChoice,
    reopen: () => {}, // Visibility belongs to ExportHost; reopening preserves the running job.
    downloadAgain: () => { if (file.current) save(file.current); },
  };
}
