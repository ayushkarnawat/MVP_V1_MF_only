import { useState } from "react";
import { ThemeToggle } from "../../components/ThemeToggle";
import { Button } from "../../components/ui/button";
import { ExportButton } from "../../features/export/ExportButton";
import { useHasFunds } from "../../features/export/useHasFunds";
import { useImport } from "../scope/ScopeContext";
import { MiraComingSoonDialog } from "../mira/MiraComingSoonDialog";
import { FamilySelector } from "./FamilySelector";

// The pill is a soft green tint built from the shell tokens (no solid green, so no label-colour clash with the palette rule).
const MIRA_PILL = "group flex h-11 min-w-64 flex-1 items-center gap-3 rounded-xl border px-4 text-left text-sm text-[var(--shell-text)] "
  + "border-[color-mix(in_srgb,var(--shell-accent)_28%,var(--shell-card))] bg-[color-mix(in_srgb,var(--shell-accent)_10%,var(--shell-card))] "
  + "hover:bg-[color-mix(in_srgb,var(--shell-accent)_16%,var(--shell-card))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]";

export function TopBar() {
  const { openImport } = useImport();
  const hasFunds = useHasFunds();
  const [miraOpen, setMiraOpen] = useState(false);
  return <header className="flex flex-wrap items-center gap-3 border-b border-[var(--shell-divider)] bg-[var(--shell-card)] px-6 py-5 font-body text-[var(--shell-text)]">
    <button type="button" aria-label="Ask Mira" onClick={() => setMiraOpen(true)} className={MIRA_PILL}>
      <span data-testid="mira-spark" aria-hidden="true" className="text-[var(--shell-accent)]">✦</span>
      <span className="font-semibold">Ask Mira</span>
      <span className="truncate text-[var(--shell-text-secondary)]">Ask anything about your funds…</span>
    </button>
    <div className="ml-auto flex flex-wrap items-center gap-3">
      <ExportButton hasData={hasFunds} onOpen={() => undefined} />
      <FamilySelector />
      <Button variant="outline" onClick={() => openImport()} className="rounded-xl border-[var(--shell-border-input)] text-[var(--shell-text)] hover:bg-[var(--shell-page)] focus-visible:ring-[var(--shell-accent)]">+ Add data</Button>
      <span role="separator" aria-orientation="vertical" className="h-6 w-px bg-[var(--shell-border-input)]" />
      <ThemeToggle />
    </div>
    <MiraComingSoonDialog open={miraOpen} onOpenChange={setMiraOpen} />
  </header>;
}
