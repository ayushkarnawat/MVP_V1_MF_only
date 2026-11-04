import type { InputHTMLAttributes, ReactNode } from "react";
import { Info } from "lucide-react";

export interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  hint?: string;
  hintIcon?: boolean;
  error?: string | null;
  icon?: ReactNode;
}

export function AuthField({
  id,
  label,
  hint,
  hintIcon = true,
  error,
  icon,
  className,
  ...input
}: AuthFieldProps) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="auth-label mb-2">
        {label}
      </label>
      <div className="auth-field" data-invalid={error ? "true" : undefined}>
        {icon ? (
          <span className="flex shrink-0 items-center text-[var(--auth-muted)] [&>svg]:h-5 [&>svg]:w-5" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={className}
          {...input}
        />
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="auth-hint mt-2">
          {hintIcon ? <Info size={16} aria-hidden="true" className="shrink-0" /> : null}
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-[13px] text-[var(--neg-text)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
