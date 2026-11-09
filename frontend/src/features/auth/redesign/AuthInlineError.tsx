import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";

export function AuthInlineError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" data-testid="auth-inline-error" className="auth-inline-error">
      <CircleAlert size={16} aria-hidden="true" className="shrink-0" />
      {children}
    </p>
  );
}
