import { useScope } from "../../shell/scope/ScopeContext";

export function SearchNotice() {
  const { scopeJump } = useScope();
  if (!scopeJump) return null;

  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-elevated)] px-4 py-2 text-sm text-[var(--ui-text)] shadow-lg"
    >
      <span>Switched to {scopeJump.label}.</span>
      <button
        type="button"
        onClick={scopeJump.undo}
        data-clickable=""
        data-effect="retry"
        className="rounded-lg px-2 py-1 text-sm font-semibold text-[var(--pos-text)] focus:outline-none focus:ring-1 focus:ring-[var(--pos)]"
      >
        Undo
      </button>
    </div>
  );
}
