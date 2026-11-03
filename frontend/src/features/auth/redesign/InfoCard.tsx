import { useId } from "react";
import type { ReactNode } from "react";

export interface InfoCardProps {
  title: string;
  children: ReactNode;
}

export function InfoCard({ title, children }: InfoCardProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-[var(--ui-divider)] bg-white/70 p-4 text-left">
      <h3 id={id} className="text-sm font-semibold text-[var(--ui-text)]">{title}</h3>
      <p className="mt-1 text-xs text-[var(--ui-text-muted)]">{children}</p>
    </section>
  );
}
