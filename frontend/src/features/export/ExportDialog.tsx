import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import { cn } from "../../lib/utils";
import "./export-tokens.css";
import { getExportTabGroups, getPresetSectionIds, orderSelectedSectionIds } from "./exportSections";
import type { ExportDialogProps, ExportPreset, StageRow } from "./exportTypes";

function TabCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
  count,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  label: string;
  count: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <label className="flex flex-1 cursor-pointer items-center gap-2 py-[3px] text-[13px] text-[var(--export-body)]">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        aria-checked={indeterminate ? "mixed" : checked}
        onChange={onChange}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px]",
          checked || indeterminate
            ? "border-[var(--export-green)] bg-[var(--export-green)] shadow-[inset_0_0_0_2px_var(--export-bg)]"
            : "border-[var(--export-disabled)] bg-transparent",
        )}
      >
        {indeterminate && (
          <span className="block h-[2px] w-[8px] rounded bg-[var(--export-bg)]" />
        )}
      </span>
      <span>{label}</span>
      <span className="text-[var(--export-muted)]">({count})</span>
    </label>
  );
}

function OptionCheckbox({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-[3px] text-[13px] text-[var(--export-body)]">
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-[14px] w-[14px] shrink-0 rounded-[4px] border-[1.5px]",
          checked
            ? "border-[var(--export-green)] bg-[var(--export-green)] shadow-[inset_0_0_0_2px_var(--export-bg)]"
            : "border-[var(--export-disabled)] bg-transparent",
        )}
      />
      <span>{label}</span>
      {hint && <span className="text-[var(--export-muted)]">{hint}</span>}
    </label>
  );
}

function OptionRow({
  title,
  sub,
  preferred = false,
  effect,
  onClick,
}: {
  title: string;
  sub: string;
  preferred?: boolean;
  effect: "download" | "select" | "retry" | "open";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-clickable=""
      data-effect={effect}
      data-preferred={preferred ? "true" : undefined}
      onClick={onClick}
      className={cn(
        "mt-2 flex w-full items-center gap-3 rounded-[12px] border px-[14px] py-3 text-left transition-colors",
        preferred
          ? "border-[var(--export-green)] bg-[var(--export-green-selected)]"
          : "border-[var(--export-divider)] bg-transparent hover:bg-[var(--export-strip-bg)]",
      )}
    >
      <div className="min-w-0 flex-1">
        <span className="block font-body text-[13px] font-semibold text-[var(--export-ink)]">
          {title}
        </span>
        <span className="block text-[12px] text-[var(--export-muted)]">{sub}</span>
      </div>
      <ChevronRight className="h-[14px] w-[14px] shrink-0 text-[var(--export-disabled)]" strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}

function StageRowItem({ row }: { row: StageRow }) {
  return (
    <div
      data-stage-state={row.state}
      className={cn(
        "flex items-center gap-[10px] border-b border-[var(--export-divider)] px-[14px] py-[10px] text-[13px] last:border-b-0",
        row.state === "now" && "bg-[var(--export-green-selected)]",
        row.state === "todo" && "text-[var(--export-disabled)]",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full",
          row.state === "done" && "bg-[var(--export-green)] text-[var(--export-bg)]",
          row.state === "now" && "border-2 border-[var(--export-green)] bg-[var(--export-bg)]",
          row.state === "todo" && "border-[1.5px] border-[var(--export-border)]",
        )}
      >
        {row.state === "done" && <Check className="h-[10px] w-[10px]" strokeWidth={2.4} />}
      </span>
      <span className="min-w-0 flex-1">{row.label}</span>
      {row.note && (
        <span className="ml-auto text-[11.5px] text-[var(--export-muted)]">{row.note}</span>
      )}
    </div>
  );
}

export function ExportDialog(props: ExportDialogProps) {
  const {
    open,
    onOpenChange,
    stage,
    members,
    currentTab,
    defaults,
    allowedTiers = ["standard", "pro"],
    onStart,
    onCancel,
    onKeepWorking,
    progress,
    ready,
    onDownloadAgain,
    onExportAnother,
    onDone,
    failed,
    onTryAgain,
    onFewerSections,
    onPrintInstead,
    onExportMember,
    onClose,
  } = props;

  const tabGroups = getExportTabGroups(allowedTiers);
  const effectivePreset: ExportPreset =
    defaults.preset === "tab" && !currentTab ? "full" : defaults.preset;

  const [whoChoice, setWho] = useState<string>(defaults.who);
  // With one member there is no family choice: the report is for that member, whatever the form last held.
  const who = members.length === 1 ? members[0].id : whoChoice;
  const [preset, setPreset] = useState<ExportPreset>(effectivePreset);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () =>
      new Set(
        getPresetSectionIds(
          effectivePreset === "tab" ? "tab" : "full",
          currentTab,
          allowedTiers,
        ),
      ),
  );
  const [expandedTabs, setExpandedTabs] = useState<Set<string>>(() => new Set());
  const [cover, setCover] = useState(true);
  const [dataDates, setDataDates] = useState(true);
  const [showFolios, setShowFolios] = useState(defaults.showFolios);

  const presetItems: { id: ExportPreset; label: string }[] = [
    { id: "full", label: "Full report" },
    ...(currentTab ? [{ id: "tab" as ExportPreset, label: "This tab" }] : []),
    { id: "custom", label: "Custom" },
  ];

  function selectPreset(next: ExportPreset) {
    setPreset(next);
    if (next === "full") {
      setSelectedIds(new Set(getPresetSectionIds("full", currentTab, allowedTiers)));
    } else if (next === "tab" && currentTab) {
      setSelectedIds(new Set(getPresetSectionIds("tab", currentTab, allowedTiers)));
    }
  }

  function toggleTab(sectionIds: string[]) {
    setPreset("custom");
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = sectionIds.every((id) => next.has(id));
      if (allSelected) {
        for (const id of sectionIds) next.delete(id);
      } else {
        for (const id of sectionIds) next.add(id);
      }
      return next;
    });
  }

  function toggleSection(sectionId: string) {
    setPreset("custom");
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  function toggleExpand(tabId: string) {
    setExpandedTabs((prev) => {
      const next = new Set(prev);
      if (next.has(tabId)) next.delete(tabId);
      else next.add(tabId);
      return next;
    });
  }

  const nowRow = progress.rows.find((r) => r.state === "now");
  const liveMessage =
    stage === "preparing"
      ? `Preparing your report${nowRow ? `. ${nowRow.label}` : ""}`
      : stage === "ready"
        ? "Your report is ready"
        : stage === "failed"
          ? "We could not finish your report"
          : "";

  const isChoose = stage === "choose";
  const noneSelected = selectedIds.size === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        onEscapeKeyDown={(e) => {
          if (stage === "preparing") {
            e.preventDefault();
            onKeepWorking();
          }
        }}
        onPointerDownOutside={(e) => {
          if (stage === "preparing") {
            e.preventDefault();
            onKeepWorking();
          }
        }}
        onInteractOutside={(e) => {
          if (stage === "preparing") {
            e.preventDefault();
            onKeepWorking();
          }
        }}
        className={cn(
          "flex max-h-[calc(100vh-32px)] max-w-[calc(100vw-32px)] flex-col gap-0 overflow-hidden rounded-[16px] border border-[var(--export-divider)] bg-[var(--export-bg)] p-0 font-body text-[13px] text-[var(--export-body)] shadow-[var(--export-shadow)]",
          isChoose ? "w-[560px]" : "w-[520px]",
        )}
      >
        <div data-testid="export-live-region" aria-live="polite" className="sr-only">
          {liveMessage}
        </div>

        {isChoose && (
          <>
            <div className="px-6 pt-[22px]">
              <DialogTitle className="m-0 mb-1 font-display text-[18px] font-bold text-[var(--export-ink)]">
                Export a PDF report
              </DialogTitle>
              <DialogDescription className="text-[13px] text-[var(--export-muted)]">
                A copy you can save or share. It is made for you and not stored.
              </DialogDescription>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-2">
              <div className="mt-[14px]">
                <div className="mb-[6px] font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--export-muted)]">
                  Who is it for
                </div>
                <div role="radiogroup" aria-label="Who is it for">
                  {members.length > 1 && (
                    <label className="flex cursor-pointer items-center gap-2 py-[5px]">
                      <input
                        type="radio"
                        name="export-who"
                        value="family"
                        checked={who === "family"}
                        onChange={() => setWho("family")}
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={cn(
                          "inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full border-[1.5px]",
                          who === "family"
                            ? "border-[var(--export-green)]"
                            : "border-[var(--export-disabled)]",
                        )}
                      >
                        {who === "family" && (
                          <span className="h-[6px] w-[6px] rounded-full bg-[var(--export-green)]" />
                        )}
                      </span>
                      <span>Family Combined ({members.length} members)</span>
                    </label>
                  )}
                  {members.map((member) => (
                    <label key={member.id} className="flex cursor-pointer items-center gap-2 py-[5px]">
                      <input
                        type="radio"
                        name="export-who"
                        value={member.id}
                        checked={who === member.id}
                        onChange={() => setWho(member.id)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={cn(
                          "inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full border-[1.5px]",
                          who === member.id
                            ? "border-[var(--export-green)]"
                            : "border-[var(--export-disabled)]",
                        )}
                      >
                        {who === member.id && (
                          <span className="h-[6px] w-[6px] rounded-full bg-[var(--export-green)]" />
                        )}
                      </span>
                      <span>{member.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-[14px]">
                <div className="mb-[6px] font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--export-muted)]">
                  What to include
                </div>
                <div role="radiogroup" aria-label="What to include" className="mb-2 flex gap-[6px]">
                  {presetItems.map((item) => {
                    const active = preset === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        data-clickable=""
                        data-effect="select"
                        onClick={() => selectPreset(item.id)}
                        className={cn(
                          "rounded-[99px] border px-3 py-[3px] text-[12px]",
                          active
                            ? "border-[var(--export-green)] bg-[var(--export-green-tint)] font-semibold text-[var(--export-green-text)]"
                            : "border-[var(--export-border)] bg-transparent text-[var(--export-body)]",
                        )}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                <div>
                  {tabGroups.map((group) => {
                    const ids = group.sections.map((s) => s.id);
                    const checkedCount = ids.filter((id) => selectedIds.has(id)).length;
                    const allChecked = checkedCount === ids.length && ids.length > 0;
                    const someChecked = checkedCount > 0 && checkedCount < ids.length;
                    const isExpanded = expandedTabs.has(group.id);

                    return (
                      <div key={group.id}>
                        <div className="flex items-center">
                          <TabCheckbox
                            checked={allChecked}
                            indeterminate={someChecked}
                            onChange={() => toggleTab(ids)}
                            label={group.label}
                            count={ids.length}
                          />
                          <button
                            type="button"
                            aria-label={`Expand ${group.label} sections`}
                            aria-expanded={isExpanded}
                            data-clickable=""
                            data-effect="expand"
                            onClick={() => toggleExpand(group.id)}
                            className="rounded p-1 text-[var(--export-muted)] hover:bg-[var(--export-chip-bg)]"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="pl-6">
                            {group.sections.map((sec) => (
                              <OptionCheckbox
                                key={sec.id}
                                checked={selectedIds.has(sec.id)}
                                onChange={() => toggleSection(sec.id)}
                                label={sec.title}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-[14px]">
                <div className="mb-[6px] font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--export-muted)]">
                  Options
                </div>
                <OptionCheckbox checked={cover} onChange={() => setCover((v) => !v)} label="Cover page" />
                <OptionCheckbox
                  checked={dataDates}
                  onChange={() => setDataDates((v) => !v)}
                  label="Data dates on every page"
                />
                <OptionCheckbox
                  checked={showFolios}
                  onChange={() => setShowFolios((v) => !v)}
                  label="Show folio numbers"
                  hint="(follows the eye icon)"
                />
              </div>

              <div className="mt-[10px] text-[var(--export-muted)]">
                {noneSelected
                  ? "Choose at least one section"
                  : "Takes about a minute for a large household."}
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 pb-[22px] pt-[18px]">
              <button
                type="button"
                data-clickable=""
                data-effect="close"
                onClick={onClose}
                className="rounded-[12px] border-[1.5px] border-[var(--export-green)] bg-[var(--export-bg)] px-4 py-[10px] font-body text-[13.5px] font-bold text-[var(--export-green-text)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={noneSelected}
                data-clickable=""
                data-effect="start"
                onClick={() =>
                  onStart({
                    who,
                    sectionIds: orderSelectedSectionIds(selectedIds, allowedTiers),
                    cover,
                    dataDates,
                    showFolios,
                  })
                }
                className={cn(
                  "rounded-[12px] border-[1.5px] px-4 py-[10px] font-body text-[13.5px] font-bold",
                  noneSelected
                    ? "cursor-not-allowed border-[var(--export-border)] bg-[var(--export-border)] text-[var(--export-muted)]"
                    : "border-[var(--export-green)] bg-[var(--export-green)] text-[var(--export-btn-ink)] hover:bg-[var(--export-green-hover)]",
                )}
              >
                Export PDF
              </button>
            </div>
          </>
        )}

        {stage === "preparing" && (
          <>
            <div className="flex items-center gap-[14px] px-6 pb-4 pt-[22px]">
              <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px] bg-[var(--export-green-tint)] text-[var(--export-green-text)]">
                <div className="export-spinner h-[22px] w-[22px] rounded-full border-[3px] border-[var(--export-ring-track)] border-t-[var(--export-green)]" />
              </div>
              <div>
                <DialogTitle className="m-0 font-display text-[18px] font-bold text-[var(--export-ink)]">
                  Preparing your report
                </DialogTitle>
                <DialogDescription className="mt-[2px] text-[12.5px] text-[var(--export-muted)]">
                  {progress.subtitle}
                </DialogDescription>
                {(progress.stageLine || progress.elapsed) && (
                  <div className="mt-[2px] flex flex-wrap items-center gap-x-2 text-[12.5px] text-[var(--export-muted)]">
                    {progress.stageLine ? (
                      <span data-testid="export-stage-line" className="font-semibold text-[var(--export-green-text)]">
                        {progress.stageLine}
                      </span>
                    ) : null}
                    {progress.elapsed ? (
                      <span data-testid="export-elapsed" className="tabular-nums" aria-live="off">
                        {progress.elapsed}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-[6px]">
              <div className="mb-4 mt-[2px] flex justify-center gap-2" aria-hidden="true">
                {[0, 1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "relative h-[72px] w-[54px] rounded-[4px] border border-[var(--export-border)] bg-[var(--export-bg)] shadow-[var(--export-page-shadow)]",
                      idx === 3 && "opacity-35",
                    )}
                  >
                    <div className="h-[6px] rounded-t-[4px] bg-[var(--export-green)]" />
                    <div className="absolute left-[7px] right-[7px] top-[16px] h-[3px] rounded-[2px] bg-[var(--export-progress-track)]" />
                    <div className="absolute left-[7px] right-[20px] top-[24px] h-[3px] rounded-[2px] bg-[var(--export-progress-track)]" />
                    <div className="absolute left-[7px] right-[7px] top-[32px] h-[3px] rounded-[2px] bg-[var(--export-progress-track)]" />
                    <div className="absolute left-[7px] right-[14px] top-[40px] h-[3px] rounded-[2px] bg-[var(--export-progress-track)]" />
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-[12px] border border-[var(--export-divider)]">
                {progress.rows.map((row) => (
                  <StageRowItem key={row.label} row={row} />
                ))}
              </div>

              <div
                role="progressbar"
                aria-valuenow={progress.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="mb-[10px] mt-[14px] h-2 overflow-hidden rounded-[99px] bg-[var(--export-progress-track)]"
              >
                <div
                  className="h-full bg-[var(--export-green)] transition-all"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>

            <div className="mt-[14px] flex items-center gap-2 border-t border-[var(--export-divider)] bg-[var(--export-strip-bg)] px-6 py-3 text-[12px] text-[var(--export-muted)]">
              <Lock className="h-[14px] w-[14px] shrink-0" strokeWidth={1.6} aria-hidden="true" />
              <span>
                This can take about a minute. You can keep using Unifolio. Nothing is stored on our servers.
              </span>
            </div>

            {progress.longNote ? (
              <p
                data-testid="export-long-note"
                className="border-t border-[var(--export-divider)] bg-[var(--export-strip-bg)] px-6 pb-3 text-[12px] text-[var(--export-muted)]"
              >
                {progress.longNote}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 border-t border-[var(--export-divider)] px-6 py-[14px]">
              <button
                type="button"
                data-clickable=""
                data-effect="close"
                onClick={onCancel}
                className="rounded-[12px] border-[1.5px] border-[var(--export-green)] bg-[var(--export-bg)] px-4 py-[10px] font-body text-[13.5px] font-bold text-[var(--export-green-text)]"
              >
                Cancel
              </button>
              <button
                type="button"
                data-clickable=""
                data-effect="close"
                onClick={onKeepWorking}
                className="rounded-[12px] border-[1.5px] border-[var(--export-green)] bg-[var(--export-bg)] px-4 py-[10px] font-body text-[13.5px] font-bold text-[var(--export-green-text)]"
              >
                Run in background
              </button>
            </div>
          </>
        )}

        {stage === "ready" && (
          <>
            <div className="flex items-center gap-[14px] px-6 pb-4 pt-[22px]">
              <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px] bg-[var(--export-green-tint)] text-[var(--export-green-text)]">
                <Check className="h-6 w-6" strokeWidth={2.4} aria-hidden="true" />
              </div>
              <div>
                <DialogTitle className="m-0 font-display text-[18px] font-bold text-[var(--export-ink)]">
                  Your report is ready
                </DialogTitle>
                <DialogDescription className="mt-[2px] text-[12.5px] text-[var(--export-muted)]">
                  It has been downloaded to your device.
                </DialogDescription>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-[6px]">
              <div className="flex items-center gap-[14px] rounded-[12px] border border-[var(--export-divider)] bg-[var(--export-strip-bg)] p-[14px]">
                <div className="relative h-[52px] w-[42px] shrink-0 rounded-[6px] border border-[var(--export-border)] bg-[var(--export-bg)] shadow-[var(--export-page-shadow)]">
                  <div className="h-[6px] rounded-t-[6px] bg-[var(--export-green)]" />
                  <span className="absolute bottom-[5px] left-0 right-0 text-center font-display text-[9px] font-bold text-[var(--export-green-text)]">
                    PDF
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <b className="block break-all font-body text-[13px] font-semibold text-[var(--export-ink)]">
                    {ready.fileName}
                  </b>
                  <div className="mt-[6px] flex flex-wrap gap-[6px]">
                    {ready.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-[99px] bg-[var(--export-chip-bg)] px-[9px] py-[2px] text-[11.5px] text-[var(--export-body)]"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <OptionRow
                title="Download again"
                sub="If the file did not save, or you want a second copy"
                preferred
                effect="download"
                onClick={onDownloadAgain}
              />
              <OptionRow
                title="Export something else"
                sub="Another member, or a few sections only"
                effect="select"
                onClick={onExportAnother}
              />
            </div>

            <div className="mt-[14px] flex items-center gap-2 border-t border-[var(--export-divider)] bg-[var(--export-strip-bg)] px-6 py-3 text-[12px] text-[var(--export-muted)]">
              <Lock className="h-[14px] w-[14px] shrink-0" strokeWidth={1.6} aria-hidden="true" />
              <span>
                We do not keep a copy. If you share this file, it contains your personal financial data.
              </span>
            </div>

            <div className="flex justify-end gap-2 border-t border-[var(--export-divider)] px-6 py-[14px]">
              <button
                type="button"
                data-clickable=""
                data-effect="close"
                onClick={onDone}
                className="rounded-[12px] border-[1.5px] border-[var(--export-green)] bg-[var(--export-green)] px-4 py-[10px] font-body text-[13.5px] font-bold text-[var(--export-btn-ink)] hover:bg-[var(--export-green-hover)]"
              >
                Done
              </button>
            </div>
          </>
        )}

        {stage === "failed" && (
          <>
            <div className="flex items-center gap-[14px] px-6 pb-4 pt-[22px]">
              <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px] bg-[var(--export-warn-tint)] text-[var(--export-warn-icon)]">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  aria-hidden="true"
                >
                  <path d="M12 4l9 16H3z" />
                  <path d="M12 10v4M12 17.2v.1" />
                </svg>
              </div>
              <div>
                <DialogTitle className="m-0 font-display text-[18px] font-bold text-[var(--export-ink)]">
                  We could not finish your report
                </DialogTitle>
                <DialogDescription className="mt-[2px] text-[12.5px] text-[var(--export-muted)]">
                  Nothing was saved or downloaded. Your data is unchanged.
                </DialogDescription>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-[6px]">
              <OptionRow
                title="Try again"
                sub="Usually works the second time"
                preferred
                effect="retry"
                onClick={onTryAgain}
              />
              {failed.canTryFewer && (
                <OptionRow
                  title="Export fewer sections"
                  sub="A smaller report is faster. Try This tab only"
                  effect="select"
                  onClick={onFewerSections}
                />
              )}
              <OptionRow
                title="Print it from your browser instead"
                sub="Opens the same pages; save as PDF from the print window (the fallback)"
                effect="open"
                onClick={onPrintInstead}
              />
              {failed.canExportMember && (
                <OptionRow
                  title="Export one member"
                  sub="Instead of the whole family"
                  effect="select"
                  onClick={onExportMember}
                />
              )}
            </div>

            {failed.code && (
              <div className="mt-[14px] flex items-center gap-2 border-t border-[var(--export-divider)] bg-[var(--export-strip-bg)] px-6 py-3 text-[12px] text-[var(--export-muted)]">
                <span>
                  If it keeps failing, tell us and quote this code: <b>{failed.code}</b>
                </span>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-[var(--export-divider)] px-6 py-[14px]">
              <button
                type="button"
                data-clickable=""
                data-effect="close"
                onClick={onClose}
                className="rounded-[12px] border-[1.5px] border-[var(--export-green)] bg-[var(--export-bg)] px-4 py-[10px] font-body text-[13.5px] font-bold text-[var(--export-green-text)]"
              >
                Close
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
