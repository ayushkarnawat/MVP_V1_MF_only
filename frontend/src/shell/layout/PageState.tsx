import { Button } from "../../components/ui/button";

export interface PageStateProps {
  state: "loading" | "error" | "empty";
  message?: string;
  onRetry?: () => void;
}

export function PageState({ state, message, onRetry }: PageStateProps) {
  return <div role={state === "error" ? "alert" : "status"} className="space-y-4 rounded-xl border border-[var(--shell-divider)] bg-[var(--shell-card)] p-6 font-body text-[var(--shell-text)]">
    <p>{message ?? (state === "loading" ? "Loading…" : state === "error" ? "Something went wrong" : "No data yet")}</p>
    {state === "error" && onRetry && <Button variant="outline" onClick={onRetry} className="border-[var(--shell-border-input)] text-[var(--shell-text)] hover:bg-[var(--shell-page)] focus-visible:ring-[var(--shell-accent)]">Try again</Button>}
  </div>;
}
