import type { InputHTMLAttributes, ReactNode } from "react";

export interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  icon?: ReactNode;
}

export function AuthField({ id, label, hint, error, icon, className, ...input }: AuthFieldProps) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-[var(--ui-text)]">
        {label}
      </label>
      <div className="relative">
        {icon ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ui-text-muted)]">{icon}</span> : null}
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={`h-12 w-full rounded-xl border bg-white px-4 text-sm text-[var(--ui-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--auth-step-on)] ${icon ? "pl-10" : ""} ${error ? "border-[var(--neg-text)]" : "border-[var(--ui-divider)]"} ${className ?? ""}`}
          {...input}
        />
      </div>
      {hint ? <p id={`${id}-hint`} className="text-xs text-[var(--ui-text-muted)]">{hint}</p> : null}
      {error ? <p id={`${id}-error`} role="alert" className="text-xs text-[var(--neg-text)]">{error}</p> : null}
    </div>
  );
}
