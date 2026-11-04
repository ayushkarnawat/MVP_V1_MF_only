import { useId } from "react";
import type { ReactNode } from "react";

export interface InfoCardProps {
  title: string;
  children: ReactNode;
}

export function InfoCard({ title, children }: InfoCardProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-[var(--auth-hairline)] bg-white p-4 text-left">
      <h3 id={id} className="text-[15px] font-semibold text-[var(--auth-ink)]">{title}</h3>
      <p className="mt-1 text-[13px] leading-snug text-[var(--auth-muted)]">{children}</p>
    </section>
  );
}
