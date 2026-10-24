import { useState } from "react";
import { Search } from "lucide-react";
import { ThemeToggle } from "../../components/ThemeToggle";
import { Button } from "../../components/ui/button";
import { useImport } from "../scope/ScopeContext";
import { MiraComingSoonDialog } from "../mira/MiraComingSoonDialog";
import { FamilySelector } from "./FamilySelector";

export function TopBar() {
  const { openImport } = useImport();
  const [miraOpen, setMiraOpen] = useState(false);
  return <header className="flex flex-wrap items-center gap-3 border-b border-[var(--shell-divider)] bg-[var(--shell-card)] px-6 py-4 font-body text-[var(--shell-text)]">
    <div className="relative mr-auto min-w-40 max-w-md flex-1">
      <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-[var(--shell-icon-muted)]" />
      <input aria-label="Search" placeholder="Search" readOnly aria-haspopup="dialog" aria-expanded={miraOpen} onClick={() => setMiraOpen(true)} onKeyDown={event => { if (event.key === "Enter") setMiraOpen(true); }} className="h-10 w-full cursor-pointer rounded-lg border border-[var(--shell-border-input)] bg-[var(--shell-page)] pl-9 pr-3 text-sm text-[var(--shell-text)] placeholder:text-[var(--shell-text-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]" />
    </div>
    <Button variant="outline" onClick={() => openImport()} className="border-[var(--shell-border-input)] text-[var(--shell-text)] hover:bg-[var(--shell-page)] focus-visible:ring-[var(--shell-accent)]">+ Add data</Button>
    <Button variant="outline" onClick={() => setMiraOpen(true)} className="border-[var(--shell-border-input)] text-[var(--shell-text)] hover:bg-[var(--shell-page)] focus-visible:ring-[var(--shell-accent)]">Ask Mira</Button>
    <FamilySelector />
    <ThemeToggle />
    <MiraComingSoonDialog open={miraOpen} onOpenChange={setMiraOpen} />
  </header>;
}
