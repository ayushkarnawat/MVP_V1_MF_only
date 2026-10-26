import type { ReactNode } from "react";

export interface PageLayoutProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  children?: ReactNode;
}

export function PageLayout({ title, subtitle, actions, tabs, children }: PageLayoutProps) {
  return <section className="space-y-6 font-body text-[var(--shell-text)]">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="font-heading text-2xl font-semibold">{title}</h1>{subtitle && <div className="mt-2 text-sm text-[var(--shell-text-body)]">{subtitle}</div>}</div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
    {tabs}
    {children}
  </section>;
}
