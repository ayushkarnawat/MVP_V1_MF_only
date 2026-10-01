import { useMemo, useState } from "react";
import { PromptDialog } from "./prompts/PromptDialog";
import { OTHER_ACCOUNT_DASHBOARD_NOTE, PRIMARY_BTN, panOrPlaceholder } from "./prompts/copy";
import type { PersonPreview, SchemeMatchPreview } from "./types";

/** What the people popup collected; nothing is written until Confirm imports. */
export interface PeopleEdits {
  /** person_key -> typed name (only people with no readable name that were named). */
  names: Record<string, string>;
  /** person_key -> U8 "Include in family total" (only people on another account). */
  includes: Record<string, boolean>;
  /** temp_id -> person_key: the U10 owner for each fund we couldn't match. */
  owners: Record<string, string>;
}

export const NO_EDITS: PeopleEdits = { names: {}, includes: {}, owners: {} };

interface PeopleFoundDialogProps {
  people: PersonPreview[];
  /** Funds with no PAN and no readable name (U10). */
  unassigned: SchemeMatchPreview[];
  onContinue: (edits: PeopleEdits) => void;
  /** person_key -> true: people already included (U7 "Include in family total" was chosen). */
  initialIncludes?: Record<string, boolean>;
  /** × / Escape: the parent opens C3 first. */
  onCancel: () => void;
}

const fundCount = (n: number) => `${n} fund${n === 1 ? "" : "s"}`;

// Part 4 + U8 + U9 + U10.
export function PeopleFoundDialog({ people, unassigned, onContinue, onCancel, initialIncludes }: PeopleFoundDialogProps) {
  const ordered = useMemo(() => [...people].sort((a, b) => Number(b.is_me) - Number(a.is_me)), [people]);
  const [names, setNames] = useState<Record<string, string>>({});
  // U8: a person on another account is left out until the user opts them in.
  const [includes, setIncludes] = useState<Record<string, boolean>>(initialIncludes ?? {});
  const [owners, setOwners] = useState<Record<string, string>>({});

  const isOther = (p: PersonPreview) => p.status === "other_account";
  const isIn = (p: PersonPreview) => !isOther(p) || includes[p.person_key] === true;
  const displayName = (p: PersonPreview) => {
    const typed = names[p.person_key]?.trim();
    return typed ? typed : p.name;
  };
  const meKey = ordered.find((p) => p.is_me)?.person_key ?? ordered[0]?.person_key ?? "";
  const ownerOptions = ordered.filter(isIn);

  // U9: every included placeholder must be named before Continue.
  const unnamed = ordered.some((p) => isIn(p) && p.needs_name && !names[p.person_key]?.trim());

  const handleContinue = () => {
    const outNames: Record<string, string> = {};
    for (const p of ordered) {
      const typed = names[p.person_key]?.trim();
      // Names come from the statement; only a person with no readable name may be named here.
      if (p.needs_name && typed) outNames[p.person_key] = typed;
    }
    const outIncludes: Record<string, boolean> = {};
    for (const p of ordered) if (isOther(p)) outIncludes[p.person_key] = includes[p.person_key] === true;
    const outOwners: Record<string, string> = {};
    for (const s of unassigned) {
      const chosen = owners[s.temp_id];
      // An owner who was toggled back out falls back to Me.
      outOwners[s.temp_id] = chosen && ownerOptions.some((p) => p.person_key === chosen) ? chosen : meKey;
    }
    onContinue({ names: outNames, includes: outIncludes, owners: outOwners });
  };

  return (
    <PromptDialog
      isOpen
      title={`We found ${people.length} people in your statement`}
      body="We’ll sort the funds by each person’s PAN, so everyone gets their own portfolio."
      onClose={onCancel}
      footer={
        <button type="button" onClick={handleContinue} disabled={unnamed} className={`${PRIMARY_BTN} disabled:opacity-50`}>
          Continue
        </button>
      }
    >
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {ordered.map((p) => {
          const other = isOther(p);
          const included = isIn(p);
          const showInput = p.needs_name;
          const grey = other && !included;
          return (
            <li
              key={p.person_key}
              className={`rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm ${grey ? "opacity-60" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {showInput ? (
                  <input
                    type="text"
                    aria-label={`Name for ${p.name}`}
                    placeholder="Add a name"
                    value={names[p.person_key] ?? ""}
                    onChange={(e) => setNames((n) => ({ ...n, [p.person_key]: e.target.value }))}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-sm"
                  />
                ) : (
                  <span className="font-semibold text-[var(--color-ink)]">{displayName(p)}</span>
                )}
                {p.is_me && <span className="text-[var(--color-text-secondary)]">(Me)</span>}
                <span aria-hidden="true">·</span>
                <span className="font-mono text-xs">{panOrPlaceholder(p.pan_masked)}</span>
                {other && (
                  <span className="text-xs text-[var(--color-text-secondary)]">(already on another Unifolio account)</span>
                )}
                {p.status === "existing_member" && <Tag>already in your family</Tag>}
                {p.status === "locked_member" && <Tag>details needed</Tag>}
                <span className="ml-auto text-xs text-[var(--color-text-secondary)]">{fundCount(p.fund_count)}</span>
              </div>
              {p.needs_name && !names[p.person_key]?.trim() && (
                <p className="m-0 mt-1 text-xs text-[var(--color-text-secondary)]">
                  We couldn’t read this name from the statement.
                </p>
              )}
              {other && (
                <label className="mt-2 flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={includes[p.person_key] === true}
                    onChange={(e) => setIncludes((i) => ({ ...i, [p.person_key]: e.target.checked }))}
                  />
                  Include in family total
                </label>
              )}
              {other && included && (
                <p className="m-0 mt-1 text-xs text-[var(--color-text-secondary)]">{OTHER_ACCOUNT_DASHBOARD_NOTE}</p>
              )}
            </li>
          );
        })}
      </ul>

      {unassigned.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-semibold text-[var(--color-ink)]">
            {`${fundCount(unassigned.length)} we couldn’t match to anyone`}
          </h3>
          {unassigned.map((s) => (
            <div key={s.temp_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <label className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">
                Owner
                <select
                  aria-label={`Owner of ${s.name}`}
                  value={ownerOptions.some((p) => p.person_key === owners[s.temp_id]) ? owners[s.temp_id] : meKey}
                  onChange={(e) => setOwners((o) => ({ ...o, [s.temp_id]: e.target.value }))}
                  className="h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-sm"
                >
                  {ownerOptions.map((p) => (
                    <option key={p.person_key} value={p.person_key}>
                      {p.is_me ? `${displayName(p)} (Me)` : displayName(p)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
        </section>
      )}
    </PromptDialog>
  );
}

function Tag({ children }: { children: string }) {
  return (
    <span className="rounded-md border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
      {children}
    </span>
  );
}
