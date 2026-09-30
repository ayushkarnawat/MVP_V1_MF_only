import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { getHouseholdMembers } from "../auth/api";
import type { HouseholdMember } from "../auth/types";
import { deleteMemberPortfolio, getHouseholdImportHistory } from "../import/api";
import type { DeleteImportResponse, HouseholdImportHistoryItem } from "../import/types";
import { DeletePortfolioDialog } from "./DeletePortfolioDialog";

interface HouseholdMembersSectionProps {
  loadMembers?: () => Promise<HouseholdMember[]>;
  loadImportHistory?: () => Promise<HouseholdImportHistoryItem[]>;
  deletePortfolio?: (memberId: string, removeMember: boolean) => Promise<DeleteImportResponse>;
  /** Called after a portfolio was deleted, so the page can refresh anything that shows members or funds. */
  onChanged?: () => void;
}

/** How many statements a member's funds come from: rows of one upload group count once. */
export function statementsFor(memberId: string, history: HouseholdImportHistoryItem[]): number {
  return new Set(history.filter((h) => h.household_member_id === memberId).map((h) => h.upload_group_id ?? h.import_id)).size;
}

// M17: "a member's whole portfolio". The spec says "a member's menu" but doesn't place it;
// the plan puts it on the profile page next to Import History.
export function HouseholdMembersSection({
  loadMembers = getHouseholdMembers,
  loadImportHistory = getHouseholdImportHistory,
  deletePortfolio = deleteMemberPortfolio,
  onChanged,
}: HouseholdMembersSectionProps) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [history, setHistory] = useState<HouseholdImportHistoryItem[]>([]);
  // If the history can't load the statement count is unknown; never show it as 0.
  const [historyFailed, setHistoryFailed] = useState(false);
  const [selected, setSelected] = useState<HouseholdMember | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useMemo(
    () => async () => {
      let failed = false;
      const [m, h] = await Promise.all([
        loadMembers(),
        loadImportHistory().catch(() => {
          failed = true;
          return [] as HouseholdImportHistoryItem[];
        }),
      ]);
      setMembers(m);
      setHistory(h);
      setHistoryFailed(failed);
    },
    [loadMembers, loadImportHistory],
  );

  useEffect(() => {
    let active = true;
    load().catch(() => active && setMembers([]));
    return () => { active = false; };
  }, [load]);

  if (members.length === 0) return null;

  const close = () => {
    setSelected(null);
    setError(null);
  };

  return (
    <section className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xs sm:p-6">
      <h2 className="font-display text-lg font-semibold">Family members</h2>
      {historyFailed && (
        <p role="alert" className="text-sm text-[var(--color-negative)]">
          Could not load your statements, so deleting funds is unavailable right now. Please try again later.
        </p>
      )}
      <div className="divide-y divide-[var(--color-border)]">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-4 py-3 first:pt-1 last:pb-1">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">{m.name}</p>
            <button
              type="button"
              aria-label={`Delete all funds for ${m.name}`}
              disabled={historyFailed}
              onClick={() => {
                setError(null);
                setSelected(m);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--color-negative)] disabled:opacity-50 hover:bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)]"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete all funds
            </button>
          </div>
        ))}
      </div>
      {selected && (
        <DeletePortfolioDialog
          member={selected}
          statementsCount={statementsFor(selected.id, history)}
          pending={pending}
          error={error}
          onKeep={close}
          onDelete={async (removeMember) => {
            setPending(true);
            setError(null);
            try {
              await deletePortfolio(selected.id, removeMember);
              close();
              await load().catch(() => undefined);
              onChanged?.();
            } catch {
              setError("Could not delete these funds. Please try again.");
            } finally {
              setPending(false);
            }
          }}
        />
      )}
    </section>
  );
}
