import { useEffect, useRef, type ReactNode } from "react";

export interface DrillPanelProps {
  title: string;
  color: string;
  note?: string;
  children: ReactNode;
}

export function DrillPanel({ title, color, note, children }: DrillPanelProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (ref.current && typeof ref.current.scrollIntoView === "function") {
      ref.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [title]);

  return (
    <section
      ref={ref}
      data-testid="drill-panel"
      aria-label={`${title} detail`}
      className="mt-4 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-4"
    >
      <div className="flex flex-col gap-1 mb-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-[var(--ui-text)]">
          <span
            data-testid="drill-dot"
            aria-hidden="true"
            style={{ backgroundColor: color }}
            className="h-2.5 w-2.5 rounded-full shrink-0"
          />
          <span>{title}</span>
        </h4>
        {note && <p className="text-xs text-[var(--ui-text-muted)]">{note}</p>}
      </div>
      {children}
    </section>
  );
}
