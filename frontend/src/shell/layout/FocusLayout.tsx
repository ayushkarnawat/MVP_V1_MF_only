import { Suspense } from "react";
import type { ReactNode } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { ArrowLeft, User } from "lucide-react";
import { ThemeToggle } from "../../components/ThemeToggle";
import { useScope } from "../scope/ScopeContext";
import { paths } from "../nav/paths";
import { PageBoundary } from "./PageBoundary";
import { PageState } from "./PageState";
import { usePageTitle } from "./usePageTitle";

export function FocusLayout({ memberChip }: { memberChip?: ReactNode }) {
  const { pathname, state } = useLocation();
  const { selectedMember } = useScope();
  usePageTitle(pathname);
  const origin: unknown = state && typeof state === "object" && "origin" in state ? state.origin : undefined;
  const back = typeof origin === "string" && origin.startsWith("/") && !origin.startsWith("//") ? origin : paths.mutualFunds.root();
  return <div className="min-h-screen bg-[var(--shell-page)] text-[var(--shell-text)]">
    <header className="sticky top-0 z-30 border-b border-[var(--shell-divider)] bg-[var(--shell-card)]">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-6">
        <Link to={back} className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 font-body text-sm font-semibold text-[var(--shell-text-secondary)] hover:bg-[var(--shell-page)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]"><ArrowLeft size={16} aria-hidden="true" />Back</Link>
        <div className="flex items-center gap-2.5">{memberChip ?? (selectedMember && <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--shell-divider)] bg-[var(--shell-page)] px-3 py-1 font-body text-xs text-[var(--shell-text-secondary)]"><User size={14} aria-hidden="true" />Importing for <strong className="text-[var(--shell-text)]">{selectedMember.name}</strong></span>)}<ThemeToggle /></div>
      </div>
    </header>
    <main className="mx-auto max-w-[1600px] p-6"><PageBoundary key={pathname}><Suspense fallback={<PageState state="loading" />}><Outlet /></Suspense></PageBoundary></main>
  </div>;
}
