import type { ReactNode } from "react";
import { CircleAlert, Info } from "lucide-react";

export interface AuthAlertProps {
  tone: "error" | "info";
  title?: string;
  children: ReactNode;
  /** An optional green shortcut, such as "Sign up" under "No account found". */
  action?: { label: string; onClick: () => void };
}

export function AuthAlert({ tone, title, children, action }: AuthAlertProps) {
  const isError = tone === "error";
  const Icon = isError ? CircleAlert : Info;

  return (
    <div
      role={isError ? "alert" : "status"}
      className={`space-y-2 rounded-[14px] border p-3.5 text-[14px] ${isError ? "border-[var(--auth-error-line)] bg-[var(--auth-error-bg)] text-[var(--auth-error)]" : "border-[var(--auth-step-on)]/30 bg-[var(--auth-step-on)]/10 text-[var(--ui-text)]"}`}
    >
      {title !== undefined ? (
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--auth-green-ink)]" aria-hidden="true" />
          <div className="min-w-0 space-y-0.5">
            <p data-testid="auth-alert-title" className="text-[14.5px] font-bold">
              {title}
            </p>
            <p className="text-[13px]">{children}</p>
          </div>
        </div>
      ) : (
        <p className="text-[14px]">{children}</p>
      )}
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="w-full rounded-[14px] border border-[var(--auth-step-on)]/30 bg-[var(--auth-step-on)]/10 p-2.5 text-xs font-bold text-[var(--pos-text)]"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
