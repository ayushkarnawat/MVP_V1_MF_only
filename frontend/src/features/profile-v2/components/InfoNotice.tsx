import type { ReactNode } from "react";
import { Info } from "lucide-react";

export function InfoNotice({
  children,
  role,
  testId,
}: {
  children: ReactNode;
  role?: "status";
  testId?: string;
}) {
  return (
    <div
      role={role}
      data-testid={testId}
      className="flex items-start gap-2 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-3 text-sm text-[var(--ui-text)]"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ui-text-muted)]" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
