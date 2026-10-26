import { Lightbulb } from "lucide-react";
import { useId } from "react";
import { MIRA_BUTTON, MIRA_LINE, MIRA_TITLE } from "../planningCopy";

export function MiraInsightsCard({ onLearnMore }: { onLearnMore: () => void }) {
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col items-start gap-2.5 rounded-xl border border-[var(--ui-divider)] bg-[var(--ui-card)] p-4"
    >
      <h3
        id={titleId}
        className="flex items-center gap-2 font-heading text-sm font-semibold text-[var(--ui-text)]"
      >
        <Lightbulb aria-hidden="true" className="h-4 w-4" />
        {MIRA_TITLE}
      </h3>
      <p className="text-sm text-[var(--ui-text-muted)]">{MIRA_LINE}</p>
      <button
        type="button"
        onClick={onLearnMore}
        className="rounded-lg border border-[var(--ui-divider)] bg-[var(--ui-page)] px-3.5 py-1.5 text-sm font-semibold text-[var(--ui-text)] hover:bg-[var(--ui-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-focus)]"
      >
        {MIRA_BUTTON}
      </button>
    </section>
  );
}
