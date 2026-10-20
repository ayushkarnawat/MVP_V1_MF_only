import { useId, useState, type JSX } from "react";
import { ChevronDown } from "lucide-react";
import { SCORE_EXPLAINER_COPY } from "./scoreExplainerCopy";

const [heading, ...copyLines] = SCORE_EXPLAINER_COPY.split("\n");
const paragraphs = copyLines.join("\n").split("\n\n");

// Render only the emphasis used in the approved copy, as text rather than HTML.
function inlineCopy(text: string) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, index) =>
    part.startsWith("**") ? <strong key={index} className="font-semibold text-[var(--color-ink)]">{part.slice(2, -2)}</strong>
      : part.startsWith("*") ? <em key={index}>{part.slice(1, -1)}</em> : part,
  );
}

export function ScoreExplainer(): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const buttonId = `${id}-button`;
  const panelId = `${id}-panel`;

  return <div className="space-y-3">
    <button id={buttonId} type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)} className="flex min-h-11 items-center gap-2 rounded-lg text-left text-sm font-semibold text-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2">
      How is this calculated?
      <ChevronDown aria-hidden="true" className={`h-4 w-4 ${expanded ? "rotate-180" : ""}`} />
    </button>
    {expanded && <div id={panelId} role="region" aria-labelledby={buttonId} className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-sm leading-relaxed text-[var(--color-text-secondary)] sm:p-5">
      <h3 className="font-display font-semibold text-[var(--color-ink)]">{heading.slice(2, -2)}</h3>
      {paragraphs.map((paragraph, index) => {
        const lines = paragraph.split("\n");
        const bullets = lines.filter(line => line.startsWith("- "));
        return <div key={index} className="space-y-2">
          {lines.filter(line => !line.startsWith("- ")).map((line, lineIndex) => <p key={lineIndex}>{inlineCopy(line)}</p>)}
          {bullets.length > 0 && <ul className="list-disc space-y-1 pl-5">{bullets.map((line, lineIndex) => <li key={lineIndex}>{inlineCopy(line.slice(2))}</li>)}</ul>}
        </div>;
      })}
    </div>}
  </div>;
}
