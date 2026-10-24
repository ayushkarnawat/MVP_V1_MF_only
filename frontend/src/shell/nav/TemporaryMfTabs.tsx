import { AppLink } from "./AppLink";
import { paths } from "./paths";

// TEMPORARY (SF2): removed when the Mutual Funds frontend plan ships the real in-page menu
export function TemporaryMfTabs() {
  const tabs = [
    { label: "Dashboard", to: paths.mutualFunds.root() },
    { label: "History", to: paths.mutualFunds.history() },
    { label: "Analytics", to: paths.mutualFunds.analytics() },
  ];
  return <nav aria-label="Mutual Fund pages" className="mb-6 flex gap-4 border-b border-[var(--shell-divider)] font-body text-sm text-[var(--shell-text-secondary)]">
    {tabs.map(tab => <AppLink key={tab.to} to={tab.to}
      className="border-b-2 border-transparent px-2 py-3 font-semibold hover:text-[var(--shell-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)] aria-[current=page]:border-[var(--shell-accent)] aria-[current=page]:text-[var(--shell-accent)]">
      {tab.label}
    </AppLink>)}
  </nav>;
}
