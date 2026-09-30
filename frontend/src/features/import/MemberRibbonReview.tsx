import { useCallback, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviewTable } from "./ReviewTable";
import { NO_EDITS, type PeopleEdits } from "./PeopleFoundDialog";
import type {
  ImportPreviewResponse,
  PersonConfirmation,
  PersonPreview,
  SchemeConfirmation,
  SchemeMatchPreview,
} from "./types";

interface MemberRibbonReviewProps {
  preview: ImportPreviewResponse;
  /** The people to review, one ribbon each. Anyone left out under U8 is not in this list. */
  people: PersonPreview[];
  /** What the people popup collected: renamed people and U10 owner picks. */
  edits?: PeopleEdits;
  /** person_key -> answer to an M8 "ask" name notice. */
  nameAnswers?: Record<string, boolean>;
  /** One request for everyone: their confirmations, plus the top-level moved_funds (F16). */
  onConfirmImports: (people: PersonConfirmation[], movedFunds: Record<string, string>) => void;
  onCancel: () => void;
  confirming: boolean;
}

const fundCount = (n: number) => `${n} fund${n === 1 ? "" : "s"}`;

// Same rule ReviewTable uses before any override: no AMFI match or no plan type.
const startsUnresolved = (s: SchemeMatchPreview) => s.match_status !== "confirmed" || s.plan_type === "unclassified";

// Part 5. Every ribbon's ReviewTable stays mounted (just hidden while collapsed)
// so reopening a ribbon keeps its choices without lifting each table's state.
export function MemberRibbonReview({
  preview,
  people,
  edits = NO_EDITS,
  nameAnswers = {},
  onConfirmImports,
  onCancel,
  confirming,
}: MemberRibbonReviewProps) {
  const shown = useMemo(() => [...people].sort((a, b) => Number(b.is_me) - Number(a.is_me)), [people]);
  const meKey = shown.find((p) => p.is_me)?.person_key ?? shown[0]?.person_key ?? "";
  const shownKeys = useMemo(() => new Set(shown.map((p) => p.person_key)), [shown]);

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  // temp_id -> person_key: U10 owner picks from the popup plus "Move to…" moves.
  const [moved, setMoved] = useState<Record<string, string>>(edits.owners);
  const [confirmations, setConfirmations] = useState<Record<string, SchemeConfirmation[]>>({});
  const [unresolved, setUnresolved] = useState<Record<string, number>>({});

  // A moved fund whose target is not in the review falls back to its detected owner.
  const ownerOf = useCallback(
    (s: SchemeMatchPreview): string | null => {
      const pick = moved[s.temp_id];
      if (pick && shownKeys.has(pick)) return pick;
      if (s.person_key && shownKeys.has(s.person_key)) return s.person_key;
      // Unassigned funds default to Me; a fund of an excluded person belongs to nobody.
      return s.person_key ? null : meKey;
    },
    [moved, shownKeys, meKey],
  );

  const schemesByPerson = useMemo(() => {
    const out: Record<string, SchemeMatchPreview[]> = {};
    for (const p of shown) out[p.person_key] = [];
    for (const s of preview.schemes) {
      const owner = ownerOf(s);
      if (owner) out[owner]?.push(s);
    }
    return out;
  }, [preview.schemes, shown, ownerOf]);

  const setReported = useCallback((key: string, count: number) => setUnresolved((u) => (u[key] === count ? u : { ...u, [key]: count })), []);
  const setConf = useCallback(
    (key: string, list: SchemeConfirmation[]) => setConfirmations((c) => ({ ...c, [key]: list })),
    [],
  );

  const handleMove = (tempId: string, target: string) => {
    const scheme = preview.schemes.find((s) => s.temp_id === tempId);
    if (!scheme) return;
    const source = ownerOf(scheme);
    setMoved((m) => ({ ...m, [tempId]: target }));
    // The fund set of both ribbons changed, so the user has to look at them again.
    setReviewed((r) => {
      const next = new Set(r);
      next.delete(target);
      if (source) next.delete(source);
      return next;
    });
  };

  const countFor = (key: string) =>
    unresolved[key] ?? (schemesByPerson[key] ?? []).filter(startsUnresolved).length;
  // Decided 30 Sep (staging QA 3b): nothing to resolve = confirmed, even with
  // funds matched by name. The header keeps the name-match count visible,
  // since nobody has to open this ribbon any more.
  const isConfirmed = (key: string) => reviewed.has(key) || countFor(key) === 0;
  const allReviewed = shown.length > 0 && shown.every((p) => isConfirmed(p.person_key));

  const handleConfirmImports = () => {
    const body: PersonConfirmation[] = shown.map((p) => {
      const out: PersonConfirmation = { person_key: p.person_key, scheme_confirmations: confirmations[p.person_key] ?? [] };
      const name = edits.names[p.person_key]?.trim();
      if (name) out.name = name;
      if (p.status === "other_account") out.include = true;
      if (p.person_key in nameAnswers) out.accept_name_update = nameAnswers[p.person_key];
      return out;
    });
    // U8 "Leave it": tell the server explicitly rather than rely on its default.
    for (const p of preview.people) {
      if (!shownKeys.has(p.person_key) && p.status === "other_account") {
        body.push({ person_key: p.person_key, include: false, scheme_confirmations: [] });
      }
    }
    const movedOut: Record<string, string> = {};
    for (const s of preview.schemes) {
      const pick = moved[s.temp_id];
      if (pick && shownKeys.has(pick) && pick !== s.person_key) movedOut[s.temp_id] = pick;
      // An unassigned fund's owner is always sent, so the client's default (Me / first
      // shown) can never differ from the server's own fallback.
      else if (s.person_key === null) {
        const owner = ownerOf(s);
        if (owner) movedOut[s.temp_id] = owner;
      }
    }
    onConfirmImports(body, movedOut);
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-1.5 text-left sm:px-6">
      <h1 className="font-display text-lg font-bold tracking-tight text-[var(--color-ink)] sm:text-3xl">
        Review your import
      </h1>

      <div className="space-y-3">
        {shown.map((p) => {
          const key = p.person_key;
          const schemes = schemesByPerson[key] ?? [];
          const name = edits.names[key]?.trim() || p.name;
          const label = p.is_me ? `${name} (Me)` : name;
          const isOpen = openKey === key;
          const count = countFor(key);
          const isReviewed = isConfirmed(key);
          const matched = p.matched_by_name_temp_ids.filter(
            (t) => schemes.some((s) => s.temp_id === t) && !(t in moved),
          );
          const assigned = schemes.filter((s) => s.temp_id in moved && moved[s.temp_id] === key).map((s) => s.temp_id);
          const panelId = `ribbon-panel-${key}`;
          return (
            <section
              key={key}
              className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]"
            >
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenKey(isOpen ? null : key)}
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
              >
                {isReviewed && <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--color-positive)]" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[var(--color-ink)]">
                    {label}
                    {isReviewed && (
                      <span className="ml-2 inline-flex rounded-full bg-[color-mix(in_srgb,var(--color-positive)_12%,transparent)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--color-positive)]">
                        Confirmed
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-[var(--color-text-secondary)]">
                    {isReviewed
                      ? `Confirmed · ${fundCount(schemes.length)}${matched.length > 0 ? ` · ${matched.length} matched by name` : ""}`
                      : `Click to review ${name}’s holdings (${count} unresolved holdings)`}
                  </span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>

              <div id={panelId} hidden={!isOpen} className="space-y-3 border-t border-[var(--color-border)] p-3 sm:p-4">
                <ReviewTable
                  preview={preview}
                  schemes={schemes}
                  confirming={false}
                  onConfirm={() => undefined}
                  hideConfirm
                  hideHeader
                  embedded
                  investorName={name}
                  panMasked={p.pan_masked}
                  matchedByName={matched}
                  assignedByYou={assigned}
                  moveTargets={shown.filter((t) => t.person_key !== key).map((t) => ({ ...t, name: edits.names[t.person_key]?.trim() || t.name }))}
                  onMove={handleMove}
                  onUnresolvedCountChange={(n) => setReported(key, n)}
                  onConfirmationsChange={(list) => setConf(key, list)}
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    disabled={isReviewed || count > 0}
                    onClick={() => {
                      setReviewed((r) => new Set(r).add(key));
                      setOpenKey(null);
                    }}
                    className="rounded-xl bg-[var(--color-accent)] px-5 text-white"
                  >
                    {isReviewed ? "Confirmed" : "Confirm"}
                  </Button>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel} className="rounded-xl">
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!allReviewed || confirming}
          onClick={handleConfirmImports}
          className="rounded-xl bg-[var(--color-accent)] px-6 text-white"
        >
          {confirming ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Confirming...</span>
            </>
          ) : (
            "Confirm imports"
          )}
        </Button>
      </div>
    </div>
  );
}
