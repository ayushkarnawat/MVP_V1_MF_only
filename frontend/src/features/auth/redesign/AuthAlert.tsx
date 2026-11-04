import type { ReactNode } from "react";

export interface AuthAlertProps {
  tone: "error" | "info";
  children: ReactNode;
  /** An optional green shortcut, such as "Sign up" under "No account found". */
  action?: { label: string; onClick: () => void };
}

export function AuthAlert({ tone, children, action }: AuthAlertProps) {
  const isError = tone === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`space-y-2 rounded-2xl border p-3.5 text-sm ${isError ? "border-[var(--neg-text)]/30 bg-[var(--neg-text)]/10 text-[var(--neg-text)]" : "border-[var(--auth-step-on)]/30 bg-[var(--auth-step-on)]/10 text-[var(--ui-text)]"}`}
    >
      <p>{children}</p>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="w-full rounded-2xl border border-[var(--auth-step-on)]/30 bg-[var(--auth-step-on)]/10 p-2.5 text-xs font-bold text-[var(--pos-text)]"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
