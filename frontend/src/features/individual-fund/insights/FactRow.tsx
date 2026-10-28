import type { LucideIcon } from "lucide-react";
import {
  ChevronRight,
  CircleAlert,
  Info,
  Minus,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { CLICK_ROW, DISABLED } from "@/lib/clickable";
import { AppLink } from "@/shell/nav/AppLink";
import { paths } from "@/shell/nav/paths";
import { COMING_SOON, TONE_ICONS } from "../fundCopy";
import { toneChipClass } from "../fundFormat";
import type { Fact, Tone } from "../types";

const ICONS: Record<Tone, LucideIcon> = {
  pos: TrendingUp,
  warn: TriangleAlert,
  neg: CircleAlert,
  info: Info,
  neu: Minus,
};

export interface ToneIconProps {
  tone: Tone;
}

export function ToneIcon({ tone }: ToneIconProps) {
  const known = (tone in TONE_ICONS ? tone : "neu") as Tone;
  const Icon = ICONS[known];

  return (
    <span
      data-testid="tone-icon"
      data-tone={known}
      data-icon={TONE_ICONS[known]}
      aria-hidden="true"
      className={`${toneChipClass(known)} h-7 w-7 shrink-0 !p-0`}
    >
      <Icon size={14} aria-hidden="true" />
    </span>
  );
}

export interface FactRowProps {
  fact: Fact;
  onOpen: (fact: Fact) => void;
  /** When provided, the Overlap fact links to this fund's Overlap tab. */
  schemeId?: string;
}

export function FactRow({ fact, onOpen, schemeId }: FactRowProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onOpen(fact);
    } else if (e.key === " ") {
      e.preventDefault();
      onOpen(fact);
    }
  };

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        data-testid={`fact-${fact.id}`}
        data-tone={fact.tone}
        className={`${CLICK_ROW} flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-[var(--ui-text)]`}
        onClick={() => onOpen(fact)}
        onKeyDown={handleKeyDown}
      >
        <ToneIcon tone={fact.tone} />
        <span className="min-w-0 flex-1">{fact.text}</span>
        {fact.id === "overlap" && schemeId !== undefined && (
          /* Stops click and key propagation so row does not open evidence when clicking link */
          <span
            data-testid="overlap-link"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            className="shrink-0 rounded-md border border-[var(--ui-divider)] px-2 py-0.5 text-xs font-medium text-[var(--c2)] hover:underline"
          >
            <AppLink to={paths.mutualFunds.fundOverlap(schemeId)}>
              See Overlap
            </AppLink>
          </span>
        )}
        {fact.id === "overlap" && schemeId === undefined && (
          <span
            data-testid="overlap-link"
            aria-disabled="true"
            title={COMING_SOON}
            className={`${DISABLED} shrink-0 rounded-md px-2 py-0.5 text-xs`}
          >
            See Overlap
          </span>
        )}
        <ChevronRight size={16} aria-hidden="true" />
      </div>
    </li>
  );
}
